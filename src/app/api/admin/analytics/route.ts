import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const PAGE_SIZE = 1000;

/**
 * Fetch ALL rows from a Supabase query, paginating in batches of PAGE_SIZE.
 * Supabase/PostgREST silently caps results at 1000 rows by default.
 * This helper pages through until all rows are retrieved.
 */
async function fetchAllRows<T = Record<string, unknown>>(
    table: string,
    selectColumns: string,
    options?: {
        filters?: (
            query: ReturnType<
                ReturnType<typeof createClient>["from"]
            >,
        ) => ReturnType<ReturnType<typeof createClient>["from"]>;
        order?: { column: string; ascending?: boolean };
    },
): Promise<T[]> {
    if (!supabase) return [];
    const allRows: T[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        let query = supabase.from(table).select(selectColumns);
        if (options?.filters) {
            query = options.filters(query);
        }
        if (options?.order) {
            query = query.order(options.order.column, {
                ascending: options.order.ascending ?? true,
            });
        }
        query = query.range(offset, offset + PAGE_SIZE - 1);

        const { data, error } = await query;
        if (error) {
            // Gracefully handle missing tables/columns/relationships:
            // 42P01 = undefined table, 42703 = undefined column,
            // PGRST116 = no rows (single), PGRST204 = column not found (PostgREST),
            // PGRST200 = relationship not found
            const gracefulCodes = ["42P01", "42703", "PGRST116", "PGRST200", "PGRST204"];
            if (gracefulCodes.includes(error.code) || error.message?.includes("does not exist") || error.message?.includes("not found")) {
                console.warn(`[Analytics] Table or column issue for "${table}": ${error.message}`);
                return [];
            }
            throw error;
        }
        if (!data || data.length === 0) {
            hasMore = false;
        } else {
            allRows.push(...(data as T[]));
            if (data.length < PAGE_SIZE) {
                hasMore = false;
            } else {
                offset += PAGE_SIZE;
            }
        }
    }
    return allRows;
}

/**
 * Fetch only the count of rows matching a query (no row data transferred).
 */
async function fetchCount(
    table: string,
    filters?: (
        query: ReturnType<ReturnType<typeof createClient>["from"]>,
    ) => ReturnType<ReturnType<typeof createClient>["from"]>,
): Promise<number> {
    if (!supabase) return 0;
    let query = supabase
        .from(table)
        .select("*", { count: "exact", head: true });
    if (filters) {
        query = filters(query);
    }
    const { count, error } = await query;
    if (error) {
        const gracefulCodes = ["42P01", "42703", "PGRST116", "PGRST200", "PGRST204"];
        if (gracefulCodes.includes(error.code) || error.message?.includes("does not exist") || error.message?.includes("not found")) {
            console.warn(`[Analytics] Table or column issue for count query: ${error.message}`);
            return 0;
        }
        throw error;
    }
    return count ?? 0;
}

// Verify admin signature from headers
async function verifyAdmin(
    request: NextRequest,
): Promise<{ isAdmin: boolean; address: string | null }> {
    const address = request.headers.get("x-admin-address");
    const signature = request.headers.get("x-admin-signature");
    const encodedMessage = request.headers.get("x-admin-message");

    if (!address || !signature || !encodedMessage || !supabase) {
        return { isAdmin: false, address: null };
    }

    try {
        const message = decodeURIComponent(atob(encodedMessage));

        const isValidSignature = await verifyMessage({
            address: address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        });

        if (!isValidSignature) {
            return { isAdmin: false, address: null };
        }

        const { data: admin } = await supabase
            .from("shout_admins")
            .select("*")
            .eq("wallet_address", address.toLowerCase())
            .single();

        return { isAdmin: !!admin, address: address.toLowerCase() };
    } catch {
        return { isAdmin: false, address: null };
    }
}

// GET: Fetch analytics data
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "7d"; // 24h, 7d, 30d, 90d, 365d

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    let groupBy: "hour" | "day" | "week" | "month";

    switch (period) {
        case "24h":
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            groupBy = "hour";
            break;
        case "7d":
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            groupBy = "day";
            break;
        case "30d":
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            groupBy = "day";
            break;
        case "90d":
            startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            groupBy = "week";
            break;
        case "365d":
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            groupBy = "month";
            break;
        default:
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            groupBy = "day";
    }

    try {
        const startIso = startDate.toISOString();

        // Fetch ALL users data (paginated to avoid Supabase 1000-row default cap)
        const allUsers = await fetchAllRows(
            "shout_users",
            "*",
        );

        // Fetch users in period (for new signups)
        const newUsers = await fetchAllRows<{ created_at: string; wallet_address: string }>(
            "shout_users",
            "created_at, wallet_address",
            {
                filters: (q) => q.gte("created_at", startIso),
                order: { column: "created_at", ascending: true },
            },
        );

        // Fetch logins in period
        const loginData = await fetchAllRows<{ last_login: string; login_count: number; wallet_address: string }>(
            "shout_users",
            "last_login, login_count, wallet_address",
            {
                filters: (q) => q.gte("last_login", startIso),
                order: { column: "last_login", ascending: true },
            },
        );

        // Fetch messages from alpha channel in period
        const alphaMessages = await fetchAllRows<{ created_at: string; sender_address: string }>(
            "shout_alpha_messages",
            "created_at, sender_address",
            {
                filters: (q) => q.gte("created_at", startIso),
                order: { column: "created_at", ascending: true },
            },
        );

        // Fetch points history in period
        const pointsHistory = await fetchAllRows<{ created_at: string; points: number; reason: string; wallet_address: string }>(
            "shout_points_history",
            "created_at, points, reason, wallet_address",
            {
                filters: (q) => q.gte("created_at", startIso),
                order: { column: "created_at", ascending: true },
            },
        );

        // Fetch friendships created in period (shout_friends stores accepted friendships only)
        const friendships = await fetchAllRows<{ created_at: string }>(
            "shout_friends",
            "created_at",
            {
                filters: (q) => q.gte("created_at", startIso),
                order: { column: "created_at", ascending: true },
            },
        );

        // Fetch all friendships total count (count-only, no row data)
        const allFriendshipsCount = await fetchCount("shout_friends");

        // Fetch friend requests in period (includes pending, accepted, rejected)
        const friendRequests = await fetchAllRows<{ created_at: string; status: string }>(
            "shout_friend_requests",
            "created_at, status",
            {
                filters: (q) => q.gte("created_at", startIso),
                order: { column: "created_at", ascending: true },
            },
        );

        // Fetch groups created in period
        const groups = await fetchAllRows<{ created_at: string }>(
            "shout_groups",
            "created_at",
            {
                filters: (q) => q.gte("created_at", startIso),
                order: { column: "created_at", ascending: true },
            },
        );

        // Fetch invite codes used in period
        const usedInvites = await fetchAllRows<{ used_at: string }>(
            "shout_user_invites",
            "used_at",
            {
                filters: (q) =>
                    q.gte("used_at", startIso).not("used_at", "is", null),
                order: { column: "used_at", ascending: true },
            },
        );

        // Fetch ALL agents data (paginated)
        const allAgents = await fetchAllRows(
            "shout_agents",
            "*",
        );

        // Fetch agents created in period
        const newAgents = await fetchAllRows<{ created_at: string; owner_address: string; visibility: string; message_count: number; name: string }>(
            "shout_agents",
            "created_at, owner_address, visibility, message_count, name",
            {
                filters: (q) => q.gte("created_at", startIso),
                order: { column: "created_at", ascending: true },
            },
        );

        // Fetch agent chats in period (include source, content, channel for usage analytics)
        const agentChats = await fetchAllRows<{ created_at: string; agent_id: string; user_address: string; role: string; source: string | null; content: string | null; channel_id: string | null; channel_type: string | null }>(
            "shout_agent_chats",
            "created_at, agent_id, user_address, role, source, content, channel_id, channel_type",
            {
                filters: (q) => q.gte("created_at", startIso),
                order: { column: "created_at", ascending: true },
            },
        );

        // Fetch knowledge items
        const knowledgeItems = await fetchAllRows<{ created_at: string; status: string; agent_id: string }>(
            "shout_agent_knowledge",
            "created_at, status, agent_id",
            {
                filters: (q) => q.gte("created_at", startIso),
                order: { column: "created_at", ascending: true },
            },
        );

        // Fetch streams in period
        const streams = await fetchAllRows<{ created_at: string; started_at: string | null; ended_at: string | null; status: string; user_address: string }>(
            "shout_streams",
            "created_at, started_at, ended_at, status, user_address",
            {
                filters: (q) => q.gte("created_at", startIso),
                order: { column: "created_at", ascending: true },
            },
        );

        // Fetch rooms in period
        const rooms = await fetchAllRows<{ created_at: string; host_wallet_address: string }>(
            "shout_instant_rooms",
            "created_at, host_wallet_address",
            {
                filters: (q) => q.gte("created_at", startIso),
                order: { column: "created_at", ascending: true },
            },
        );

        // Fetch scheduled calls in period
        const scheduledCalls = await fetchAllRows<{ created_at: string; recipient_wallet_address: string; scheduler_wallet_address: string; status: string }>(
            "shout_scheduled_calls",
            "created_at, recipient_wallet_address, scheduler_wallet_address, status",
            {
                filters: (q) => q.gte("created_at", startIso),
                order: { column: "created_at", ascending: true },
            },
        );

        // Fetch DM messages in period
        const dmMessages = await fetchAllRows<{ created_at: string; sender_address: string }>(
            "shout_messages",
            "created_at, sender_address",
            {
                filters: (q) => q.gte("created_at", startIso),
                order: { column: "created_at", ascending: true },
            },
        );

        // Fetch channel messages in period
        const channelMessages = await fetchAllRows<{ created_at: string; sender_address: string }>(
            "shout_channel_messages",
            "created_at, sender_address",
            {
                filters: (q) => q.gte("created_at", startIso),
                order: { column: "created_at", ascending: true },
            },
        );

        // Fetch total message counts (count-only, efficient)
        const totalDmMessages = await fetchCount("shout_messages");
        const totalChannelMessages = await fetchCount("shout_channel_messages");
        const totalAlphaMessages = await fetchCount("shout_alpha_messages");

        // Fetch public profile stats (count-only)
        const publicProfilesCount = await fetchCount(
            "shout_user_settings",
            (q) => q.eq("public_landing_enabled", true),
        );

        // Calculate summary stats
        const totalUsers = allUsers.length;
        const newUsersCount = newUsers.length;
        const activeUsers = loginData.length;
        const totalMessages =
            totalDmMessages + totalChannelMessages + totalAlphaMessages;
        const messagesInPeriod =
            alphaMessages.length + dmMessages.length + channelMessages.length;
        const totalCalls =
            allUsers.reduce((sum, u: Record<string, unknown>) => sum + (Number(u.total_calls) || 0), 0);
        const totalVoiceMinutes =
            allUsers.reduce((sum, u: Record<string, unknown>) => sum + (Number(u.voice_minutes) || 0), 0);
        const totalVideoMinutes =
            allUsers.reduce((sum, u: Record<string, unknown>) => sum + (Number(u.video_minutes) || 0), 0);
        const totalPoints =
            allUsers.reduce((sum, u: Record<string, unknown>) => sum + (Number(u.points) || 0), 0);
        const pointsInPeriod =
            pointsHistory.reduce((sum, p) => sum + (p.points || 0), 0);
        const friendRequestsCount = friendRequests.length;
        const acceptedFriendships = allFriendshipsCount / 2; // Divided by 2 since friendships are stored bidirectionally
        const newFriendshipsInPeriod = friendships.length / 2;
        const groupsCreated = groups.length;
        const invitesUsed = usedInvites.length;

        // Message breakdown for display
        const dmMessagesInPeriod = dmMessages.length;
        const channelMessagesInPeriod = channelMessages.length;
        const alphaMessagesInPeriod = alphaMessages.length;

        // Agent stats
        const totalAgents = allAgents.length;
        const newAgentsCount = newAgents.length;
        const publicAgents =
            allAgents.filter((a: Record<string, unknown>) => a.visibility === "public").length;
        const friendsAgents =
            allAgents.filter((a: Record<string, unknown>) => a.visibility === "friends").length;
        const privateAgents =
            allAgents.filter((a: Record<string, unknown>) => a.visibility === "private").length;
        const officialAgents =
            allAgents.filter((a: Record<string, unknown>) => a.visibility === "official").length;
        const totalAgentMessages =
            allAgents.reduce((sum, a: Record<string, unknown>) => sum + (Number(a.message_count) || 0), 0);
        const agentMessagesInPeriod =
            agentChats.filter((c) => c.role === "user").length;
        const uniqueAgentUsers = new Set(
            agentChats.map((c) => c.user_address),
        ).size;
        const knowledgeItemsCount = knowledgeItems.length;
        const indexedKnowledgeItems =
            knowledgeItems.filter((k) => k.status === "indexed").length;

        // Agent usage by source (direct 1:1, public page, channel @mentions)
        const userChatsInPeriod =
            agentChats.filter((c) => c.role === "user");
        const agentMessagesBySource = {
            direct: userChatsInPeriod.filter((c) => c.source === "direct")
                .length,
            public: userChatsInPeriod.filter((c) => c.source === "public")
                .length,
            channel: userChatsInPeriod.filter((c) => c.source === "channel")
                .length,
        };
        // Failed agent responses (assistant rows we log on stream/error)
        const agentFailedInPeriod =
            agentChats.filter(
                (c) =>
                    c.role === "assistant" && c.content?.startsWith("[Error:"),
            ).length;

        // Streaming stats
        const streamsCreated = streams.length;
        const streamsStarted =
            streams.filter((s) => s.status === "live" || s.status === "ended")
                .length;
        const streamsEnded =
            streams.filter((s) => s.status === "ended").length;
        // Calculate total streaming minutes from ended streams
        const _totalStreamingMinutes =
            streams.reduce((sum, s) => {
                if (s.started_at && s.ended_at) {
                    const durationMs =
                        new Date(s.ended_at).getTime() -
                        new Date(s.started_at).getTime();
                    return sum + Math.round(durationMs / (1000 * 60));
                }
                return sum;
            }, 0);
        void _totalStreamingMinutes; // used for period stats
        // Get streaming stats from user analytics columns
        const totalStreamsCreated =
            allUsers.reduce((sum, u: Record<string, unknown>) => sum + (Number(u.streams_created) || 0), 0);
        const totalStreamsStarted =
            allUsers.reduce((sum, u: Record<string, unknown>) => sum + (Number(u.streams_started) || 0), 0);
        const totalStreamsEnded =
            allUsers.reduce((sum, u: Record<string, unknown>) => sum + (Number(u.streams_ended) || 0), 0);
        const totalStreamingMinutesAll =
            allUsers.reduce((sum, u: Record<string, unknown>) => sum + (Number(u.streaming_minutes) || 0), 0);
        const totalStreamsViewed =
            allUsers.reduce((sum, u: Record<string, unknown>) => sum + (Number(u.streams_viewed) || 0), 0);

        // Room stats
        const roomsCreated = rooms.length;
        const totalRoomsCreated =
            allUsers.reduce((sum, u: Record<string, unknown>) => sum + (Number(u.rooms_created) || 0), 0);
        const totalRoomsJoined =
            allUsers.reduce((sum, u: Record<string, unknown>) => sum + (Number(u.rooms_joined) || 0), 0);

        // Scheduling stats
        const schedulesCreated = scheduledCalls.length;
        const schedulesJoined =
            scheduledCalls.filter((s) => s.status === "completed").length;
        const totalSchedulesCreated =
            allUsers.reduce((sum, u: Record<string, unknown>) => sum + (Number(u.schedules_created) || 0), 0);
        const totalSchedulesJoined =
            allUsers.reduce((sum, u: Record<string, unknown>) => sum + (Number(u.schedules_joined) || 0), 0);

        // Wallet stats
        const usersWithSmartWallet =
            allUsers.filter((u: Record<string, unknown>) => u.smart_wallet_address).length;
        const walletTypeBreakdown = {
            wallet:
                allUsers.filter(
                    (u: Record<string, unknown>) => u.wallet_type === "wallet" || !u.wallet_type,
                ).length,
            passkey:
                allUsers.filter((u: Record<string, unknown>) => u.wallet_type === "passkey").length,
            email:
                allUsers.filter((u: Record<string, unknown>) => u.wallet_type === "email").length,
            worldId:
                allUsers.filter(
                    (u: Record<string, unknown>) =>
                        typeof u.wallet_type === "string" &&
                        (u.wallet_type.includes("world") ||
                        u.wallet_type.includes("alien")),
                ).length,
            solana:
                allUsers.filter((u: Record<string, unknown>) => u.wallet_type === "solana").length,
        };

        // Fetch ALL passkey credentials stats (paginated)
        const allPasskeys = await fetchAllRows<{ id: string; user_address: string; created_at: string; safe_signer_address: string | null }>(
            "passkey_credentials",
            "id, user_address, created_at, safe_signer_address",
        );

        const totalPasskeys = allPasskeys.length;
        const passkeysWithSafeSigners =
            allPasskeys.filter((p) => p.safe_signer_address).length;
        const passkeysInPeriod =
            allPasskeys.filter((p) => new Date(p.created_at) >= startDate)
                .length;

        // Fetch ALL shout_wallets table for embedded wallet stats (paginated)
        const allWallets = await fetchAllRows<{ id: string; wallet_type: string; is_smart_wallet: boolean; smart_wallet_deployed: boolean; created_at: string }>(
            "shout_wallets",
            "id, wallet_type, is_smart_wallet, smart_wallet_deployed, created_at",
        );

        const embeddedWallets =
            allWallets.filter((w) => w.wallet_type === "embedded").length;
        const deployedSmartWallets =
            allWallets.filter((w) => w.smart_wallet_deployed).length;
        const walletsCreatedInPeriod =
            allWallets.filter((w) => new Date(w.created_at) >= startDate)
                .length;

        // Beta access stats for wallet (paginated)
        const betaApplicants = await fetchAllRows<{ beta_access_applied: string; beta_access: boolean }>(
            "shout_users",
            "beta_access_applied, beta_access",
            {
                filters: (q) => q.not("beta_access_applied", "is", null),
            },
        );

        const betaApplicantsCount = betaApplicants.length;
        const betaApprovedCount =
            betaApplicants.filter((u) => u.beta_access).length;
        const betaPendingCount = betaApplicantsCount - betaApprovedCount;

        // Fetch ALL wallet transaction stats (paginated)
        const walletTransactions = await fetchAllRows<{ id: string; chain_id: number; chain_name: string; amount_usd: string | number; tx_type: string; status: string; created_at: string; user_address: string }>(
            "shout_wallet_transactions",
            "id, chain_id, chain_name, amount_usd, tx_type, status, created_at, user_address",
            {
                order: { column: "created_at", ascending: false },
            },
        );

        const totalWalletTransactions = walletTransactions.length;
        const walletTxInPeriod =
            walletTransactions.filter(
                (tx) => new Date(tx.created_at) >= startDate,
            ).length;
        const confirmedTransactions =
            walletTransactions.filter((tx) => tx.status === "confirmed")
                .length;
        const totalVolumeUsd =
            walletTransactions.reduce(
                (sum, tx) => sum + (Number(tx.amount_usd) || 0),
                0,
            );
        const volumeInPeriod =
            walletTransactions
                .filter((tx) => new Date(tx.created_at) >= startDate)
                .reduce((sum, tx) => sum + (Number(tx.amount_usd) || 0), 0);
        const uniqueTxUsers = new Set(
            walletTransactions.map((tx) => tx.user_address),
        ).size;

        // Network stats from transactions
        const networkTxCounts: Record<
            string,
            {
                chainId: number;
                chainName: string;
                count: number;
                volume: number;
            }
        > = {};
        for (const tx of walletTransactions) {
            const key = String(tx.chain_id);
            if (!networkTxCounts[key]) {
                networkTxCounts[key] = {
                    chainId: tx.chain_id,
                    chainName: tx.chain_name,
                    count: 0,
                    volume: 0,
                };
            }
            networkTxCounts[key].count++;
            networkTxCounts[key].volume += Number(tx.amount_usd) || 0;
        }

        // Fetch network stats table (for historical data) -- small table, but paginate to be safe
        const networkStats = await fetchAllRows(
            "shout_wallet_network_stats",
            "*",
            {
                order: { column: "total_transactions", ascending: false },
            },
        );
        void networkStats; // Available for future use; currently using networkTxCounts from transaction data

        // Calculate user wallet stats from shout_users
        const usersWithTxHistory =
            allUsers.filter((u: Record<string, unknown>) => (Number(u.wallet_tx_count) || 0) > 0).length;
        const totalUserVolumeUsd =
            allUsers.reduce(
                (sum, u: Record<string, unknown>) => sum + (Number(u.wallet_volume_usd) || 0),
                0,
            );

        // Top channels by agent usage (source=channel, count user messages per channel)
        const channelAgentCounts: Record<
            string,
            { channelId: string | null; channelType: string; count: number }
        > = {};
        for (const c of userChatsInPeriod.filter(
            (c) => c.source === "channel",
        )) {
            const key = `${c.channel_type ?? "channel"}:${c.channel_id ?? "global"}`;
            if (!channelAgentCounts[key]) {
                channelAgentCounts[key] = {
                    channelId: c.channel_id ?? null,
                    channelType: c.channel_type ?? "global",
                    count: 0,
                };
            }
            channelAgentCounts[key].count++;
        }
        const channelIds = [
            ...new Set(
                Object.values(channelAgentCounts)
                    .map((v) => v.channelId)
                    .filter(Boolean),
            ),
        ] as string[];
        let channelRows: { id: string; name: string; emoji: string }[] = [];
        try {
            if (channelIds.length > 0) {
                const { data, error } = await supabase
                    .from("shout_public_channels")
                    .select("id, name, emoji")
                    .in("id", channelIds);
                if (!error && data) channelRows = data;
            }
        } catch (e) {
            console.warn("[Analytics] Channel names query failed:", e);
        }
        const channelNameById = new Map(
            channelRows.map((c: { id: string; name: string; emoji: string }) => [
                c.id,
                `${c.emoji || ""} ${c.name}`.trim(),
            ]),
        );
        const topChannelsByAgentUsage = Object.entries(channelAgentCounts)
            .map(([, v]) => ({
                channelId: v.channelId,
                channelType: v.channelType,
                channelName:
                    v.channelType === "global"
                        ? "Global (Alpha)"
                        : v.channelId
                          ? (channelNameById.get(v.channelId) ?? "Unknown")
                          : "Global",
                count: v.count,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // Generate time series data
        const timeSeriesData = generateTimeSeries(startDate, now, groupBy, {
            newUsers,
            logins: loginData,
            messages: alphaMessages,
            points: pointsHistory,
            friendRequests,
            groups,
            invites: usedInvites,
            agents: newAgents,
            agentChats,
        });

        // Top users by various metrics
        const topUsersByPoints = [...allUsers]
            .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (Number(b.points) || 0) - (Number(a.points) || 0))
            .slice(0, 10)
            .map((u: Record<string, unknown>) => ({
                address: u.wallet_address,
                username: u.username,
                ensName: u.ens_name,
                value: Number(u.points) || 0,
            }));

        const topUsersByMessages = [...allUsers]
            .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (Number(b.messages_sent) || 0) - (Number(a.messages_sent) || 0))
            .slice(0, 10)
            .map((u: Record<string, unknown>) => ({
                address: u.wallet_address,
                username: u.username,
                ensName: u.ens_name,
                value: Number(u.messages_sent) || 0,
            }));

        const topUsersByFriends = [...allUsers]
            .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (Number(b.friends_count) || 0) - (Number(a.friends_count) || 0))
            .slice(0, 10)
            .map((u: Record<string, unknown>) => ({
                address: u.wallet_address,
                username: u.username,
                ensName: u.ens_name,
                value: Number(u.friends_count) || 0,
            }));

        // Top agents by messages
        const topAgentsByMessages = [...allAgents]
            .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (Number(b.message_count) || 0) - (Number(a.message_count) || 0))
            .slice(0, 10)
            .map((a: Record<string, unknown>) => ({
                id: a.id,
                name: a.name,
                emoji: a.avatar_emoji,
                ownerAddress: a.owner_address,
                visibility: a.visibility,
                value: Number(a.message_count) || 0,
            }));

        // Recent smart wallet users
        const recentSmartWalletUsers = [...allUsers]
            .filter((u: Record<string, unknown>) => u.smart_wallet_address)
            .sort(
                (a: Record<string, unknown>, b: Record<string, unknown>) =>
                    new Date(String(b.created_at) || 0).getTime() -
                    new Date(String(a.created_at) || 0).getTime(),
            )
            .slice(0, 10)
            .map((u: Record<string, unknown>) => ({
                address: u.wallet_address,
                username: u.username,
                ensName: u.ens_name,
                walletType: u.wallet_type || "wallet",
                smartWalletAddress: u.smart_wallet_address,
                createdAt: u.created_at,
            }));

        // Agent visibility breakdown
        const agentVisibilityBreakdown = [
            { visibility: "Private", count: privateAgents },
            { visibility: "Friends", count: friendsAgents },
            { visibility: "Public", count: publicAgents },
            { visibility: "Official", count: officialAgents },
        ].filter((v) => v.count > 0);

        // Points breakdown
        const pointsBreakdown: Record<string, number> = {};
        for (const p of pointsHistory) {
            const reason = p.reason || "Other";
            pointsBreakdown[reason] =
                (pointsBreakdown[reason] || 0) + (p.points || 0);
        }

        return NextResponse.json({
            summary: {
                totalUsers,
                newUsersCount,
                activeUsers,
                totalMessages,
                messagesInPeriod,
                // Message breakdown
                dmMessagesInPeriod,
                channelMessagesInPeriod,
                alphaMessagesInPeriod,
                totalDmMessages,
                totalChannelMessages,
                totalAlphaMessages,
                totalCalls,
                totalVoiceMinutes,
                totalVideoMinutes,
                totalPoints,
                pointsInPeriod,
                friendRequestsCount,
                acceptedFriendships: Math.floor(acceptedFriendships),
                newFriendshipsInPeriod: Math.floor(newFriendshipsInPeriod),
                groupsCreated,
                invitesUsed,
                // Public profile stats
                publicProfilesCount,
                // Agent stats
                totalAgents,
                newAgentsCount,
                publicAgents,
                friendsAgents,
                privateAgents,
                officialAgents,
                totalAgentMessages,
                agentMessagesInPeriod,
                uniqueAgentUsers,
                knowledgeItemsCount,
                indexedKnowledgeItems,
                agentMessagesBySource,
                agentFailedInPeriod,
                topChannelsByAgentUsage,
                // Streaming stats
                streamsCreated,
                streamsStarted,
                streamsEnded,
                totalStreamsCreated,
                totalStreamsStarted,
                totalStreamsEnded,
                totalStreamingMinutes: totalStreamingMinutesAll,
                totalStreamsViewed,
                // Room stats
                roomsCreated,
                totalRoomsCreated,
                totalRoomsJoined,
                // Scheduling stats
                schedulesCreated,
                schedulesJoined,
                totalSchedulesCreated,
                totalSchedulesJoined,
                // Wallet stats
                usersWithSmartWallet,
                walletTypeBreakdown,
                totalPasskeys,
                passkeysWithSafeSigners,
                passkeysInPeriod,
                embeddedWallets,
                deployedSmartWallets,
                walletsCreatedInPeriod,
                // Beta access stats
                betaApplicantsCount,
                betaApprovedCount,
                betaPendingCount,
                // Wallet transaction stats
                totalWalletTransactions,
                walletTxInPeriod,
                confirmedTransactions,
                totalVolumeUsd,
                volumeInPeriod,
                uniqueTxUsers,
                usersWithTxHistory,
                totalUserVolumeUsd,
            },
            timeSeries: timeSeriesData,
            topUsers: {
                byPoints: topUsersByPoints,
                byMessages: topUsersByMessages,
                byFriends: topUsersByFriends,
            },
            topAgents: {
                byMessages: topAgentsByMessages,
            },
            topChannelsByAgentUsage,
            agentVisibilityBreakdown,
            // Official agents list for admin integration management
            officialAgentsList:
                allAgents
                    .filter((a: Record<string, unknown>) => a.visibility === "official")
                    .map((a: Record<string, unknown>) => ({
                        id: a.id,
                        name: a.name,
                        avatar_emoji: a.avatar_emoji || "🤖",
                        avatar_url: a.avatar_url,
                        personality: a.personality,
                        x402_enabled: a.x402_enabled,
                        x402_price_cents: a.x402_price_cents,
                        message_count: Number(a.message_count) || 0,
                        created_at: a.created_at,
                    })),
            pointsBreakdown: Object.entries(pointsBreakdown).map(
                ([reason, points]) => ({
                    reason,
                    points,
                }),
            ),
            walletTypeBreakdown: [
                { type: "EOA Wallet", count: walletTypeBreakdown.wallet },
                { type: "Passkey", count: walletTypeBreakdown.passkey },
                { type: "Email", count: walletTypeBreakdown.email },
                { type: "World ID", count: walletTypeBreakdown.worldId },
                { type: "Solana", count: walletTypeBreakdown.solana },
            ].filter((w) => w.count > 0),
            networkStats: Object.values(networkTxCounts)
                .sort((a, b) => b.count - a.count)
                .map((n) => ({
                    chainId: n.chainId,
                    chainName: n.chainName,
                    transactions: n.count,
                    volumeUsd: n.volume,
                })),
            recentSmartWalletUsers,
            period,
            startDate: startDate.toISOString(),
            endDate: now.toISOString(),
        });
    } catch (error) {
        console.error("[Analytics] Error:", error instanceof Error ? { message: error.message, stack: error.stack } : error);
        return NextResponse.json(
            { error: "Failed to fetch analytics", details: error instanceof Error ? error.message : String(error) },
            { status: 500 },
        );
    }
}

interface DataSources {
    newUsers: { created_at: string }[];
    logins: { last_login: string }[];
    messages: { created_at: string }[];
    points: { created_at: string; points: number }[];
    friendRequests: { created_at: string }[];
    groups: { created_at: string }[];
    invites: { used_at: string }[];
    agents: { created_at: string }[];
    agentChats: { created_at: string; role: string; source?: string | null }[];
}

function generateTimeSeries(
    startDate: Date,
    endDate: Date,
    groupBy: "hour" | "day" | "week" | "month",
    data: DataSources,
) {
    const series: {
        date: string;
        label: string;
        newUsers: number;
        logins: number;
        messages: number;
        points: number;
        friendRequests: number;
        groups: number;
        invites: number;
        agents: number;
        agentChats: number;
        agentChatsDirect: number;
        agentChatsPublic: number;
        agentChatsChannel: number;
    }[] = [];

    let current = new Date(startDate);

    while (current <= endDate) {
        let nextDate: Date;
        let label: string;

        switch (groupBy) {
            case "hour":
                nextDate = new Date(current.getTime() + 60 * 60 * 1000);
                label = current.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    hour12: true,
                });
                break;
            case "day":
                nextDate = new Date(current.getTime() + 24 * 60 * 60 * 1000);
                label = current.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                });
                break;
            case "week":
                nextDate = new Date(
                    current.getTime() + 7 * 24 * 60 * 60 * 1000,
                );
                label = `Week of ${current.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
                break;
            case "month":
                nextDate = new Date(
                    current.getFullYear(),
                    current.getMonth() + 1,
                    1,
                );
                label = current.toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                });
                break;
        }

        const countInRange = <
            T extends { [key: string]: string | number | null },
        >(
            items: T[],
            dateField: keyof T,
        ): number => {
            return items.filter((item) => {
                const itemDate = new Date(item[dateField] as string);
                return itemDate >= current && itemDate < nextDate;
            }).length;
        };

        const sumInRange = <
            T extends { [key: string]: string | number | null },
        >(
            items: T[],
            dateField: keyof T,
            valueField: keyof T,
        ): number => {
            return items
                .filter((item) => {
                    const itemDate = new Date(item[dateField] as string);
                    return itemDate >= current && itemDate < nextDate;
                })
                .reduce(
                    (sum, item) => sum + (Number(item[valueField]) || 0),
                    0,
                );
        };

        const bucketUserChats = data.agentChats.filter((c) => {
            const itemDate = new Date(c.created_at);
            return (
                itemDate >= current && itemDate < nextDate && c.role === "user"
            );
        });
        series.push({
            date: current.toISOString(),
            label,
            newUsers: countInRange(data.newUsers, "created_at"),
            logins: countInRange(data.logins, "last_login"),
            messages: countInRange(data.messages, "created_at"),
            points: sumInRange(data.points, "created_at", "points"),
            friendRequests: countInRange(data.friendRequests, "created_at"),
            groups: countInRange(data.groups, "created_at"),
            invites: countInRange(data.invites, "used_at"),
            agents: countInRange(data.agents, "created_at"),
            agentChats: bucketUserChats.length,
            agentChatsDirect: bucketUserChats.filter(
                (c) => c.source === "direct",
            ).length,
            agentChatsPublic: bucketUserChats.filter(
                (c) => c.source === "public",
            ).length,
            agentChatsChannel: bucketUserChats.filter(
                (c) => c.source === "channel",
            ).length,
        });

        current = nextDate;
    }

    return series;
}
