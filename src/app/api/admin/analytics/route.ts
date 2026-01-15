import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// Verify admin signature from headers
async function verifyAdmin(request: NextRequest): Promise<{ isAdmin: boolean; address: string | null }> {
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
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
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
        // Fetch all users data
        const { data: allUsers, error: usersError } = await supabase
            .from("shout_users")
            .select("*");

        if (usersError) throw usersError;

        // Fetch users in period (for new signups)
        const { data: newUsers, error: newUsersError } = await supabase
            .from("shout_users")
            .select("created_at, wallet_address")
            .gte("created_at", startDate.toISOString())
            .order("created_at", { ascending: true });

        if (newUsersError) throw newUsersError;

        // Fetch logins in period
        const { data: loginData } = await supabase
            .from("shout_users")
            .select("last_login, login_count, wallet_address")
            .gte("last_login", startDate.toISOString())
            .order("last_login", { ascending: true });

        // Fetch messages from alpha channel in period
        const { data: alphaMessages } = await supabase
            .from("shout_alpha_messages")
            .select("created_at, sender_address")
            .gte("created_at", startDate.toISOString())
            .order("created_at", { ascending: true });

        // Fetch points history in period
        const { data: pointsHistory } = await supabase
            .from("shout_points_history")
            .select("created_at, points, reason, wallet_address")
            .gte("created_at", startDate.toISOString())
            .order("created_at", { ascending: true });

        // Fetch friend requests in period
        const { data: friendRequests } = await supabase
            .from("shout_friends")
            .select("created_at, status")
            .gte("created_at", startDate.toISOString())
            .order("created_at", { ascending: true });

        // Fetch groups created in period
        const { data: groups } = await supabase
            .from("shout_groups")
            .select("created_at")
            .gte("created_at", startDate.toISOString())
            .order("created_at", { ascending: true });

        // Fetch invite codes used in period
        const { data: usedInvites } = await supabase
            .from("shout_user_invites")
            .select("used_at")
            .gte("used_at", startDate.toISOString())
            .not("used_at", "is", null)
            .order("used_at", { ascending: true });

        // Fetch all agents data
        const { data: allAgents } = await supabase
            .from("shout_agents")
            .select("*");

        // Fetch agents created in period
        const { data: newAgents } = await supabase
            .from("shout_agents")
            .select("created_at, owner_address, visibility, message_count, name")
            .gte("created_at", startDate.toISOString())
            .order("created_at", { ascending: true });

        // Fetch agent chats in period
        const { data: agentChats } = await supabase
            .from("shout_agent_chats")
            .select("created_at, agent_id, user_address, role")
            .gte("created_at", startDate.toISOString())
            .order("created_at", { ascending: true });

        // Fetch knowledge items
        const { data: knowledgeItems } = await supabase
            .from("shout_agent_knowledge")
            .select("created_at, status, agent_id")
            .gte("created_at", startDate.toISOString())
            .order("created_at", { ascending: true });

        // Fetch streams in period
        const { data: streams } = await supabase
            .from("shout_streams")
            .select("created_at, started_at, ended_at, status, user_address")
            .gte("created_at", startDate.toISOString())
            .order("created_at", { ascending: true });

        // Fetch rooms in period
        const { data: rooms } = await supabase
            .from("shout_instant_rooms")
            .select("created_at, host_wallet_address")
            .gte("created_at", startDate.toISOString())
            .order("created_at", { ascending: true });

        // Fetch scheduled calls in period
        const { data: scheduledCalls } = await supabase
            .from("shout_scheduled_calls")
            .select("created_at, recipient_wallet_address, scheduler_wallet_address, status")
            .gte("created_at", startDate.toISOString())
            .order("created_at", { ascending: true });

        // Calculate summary stats
        const totalUsers = allUsers?.length || 0;
        const newUsersCount = newUsers?.length || 0;
        const activeUsers = loginData?.length || 0;
        const totalMessages = allUsers?.reduce((sum, u) => sum + (u.messages_sent || 0), 0) || 0;
        const messagesInPeriod = alphaMessages?.length || 0;
        const totalCalls = allUsers?.reduce((sum, u) => sum + (u.total_calls || 0), 0) || 0;
        const totalVoiceMinutes = allUsers?.reduce((sum, u) => sum + (u.voice_minutes || 0), 0) || 0;
        const totalVideoMinutes = allUsers?.reduce((sum, u) => sum + (u.video_minutes || 0), 0) || 0;
        const totalPoints = allUsers?.reduce((sum, u) => sum + (u.points || 0), 0) || 0;
        const pointsInPeriod = pointsHistory?.reduce((sum, p) => sum + (p.points || 0), 0) || 0;
        const friendRequestsCount = friendRequests?.length || 0;
        const acceptedFriendships = friendRequests?.filter(f => f.status === "accepted").length || 0;
        const groupsCreated = groups?.length || 0;
        const invitesUsed = usedInvites?.length || 0;

        // Agent stats
        const totalAgents = allAgents?.length || 0;
        const newAgentsCount = newAgents?.length || 0;
        const publicAgents = allAgents?.filter(a => a.visibility === "public").length || 0;
        const friendsAgents = allAgents?.filter(a => a.visibility === "friends").length || 0;
        const privateAgents = allAgents?.filter(a => a.visibility === "private").length || 0;
        const totalAgentMessages = allAgents?.reduce((sum, a) => sum + (a.message_count || 0), 0) || 0;
        const agentMessagesInPeriod = agentChats?.filter(c => c.role === "user").length || 0;
        const uniqueAgentUsers = new Set(agentChats?.map(c => c.user_address) || []).size;
        const knowledgeItemsCount = knowledgeItems?.length || 0;
        const indexedKnowledgeItems = knowledgeItems?.filter(k => k.status === "indexed").length || 0;

        // Streaming stats
        const streamsCreated = streams?.length || 0;
        const streamsStarted = streams?.filter(s => s.status === "live" || s.status === "ended").length || 0;
        const streamsEnded = streams?.filter(s => s.status === "ended").length || 0;
        // Calculate total streaming minutes from ended streams
        const totalStreamingMinutes = streams?.reduce((sum, s) => {
            if (s.started_at && s.ended_at) {
                const durationMs = new Date(s.ended_at).getTime() - new Date(s.started_at).getTime();
                return sum + Math.round(durationMs / (1000 * 60));
            }
            return sum;
        }, 0) || 0;
        // Get streaming stats from user analytics columns
        const totalStreamsCreated = allUsers?.reduce((sum, u) => sum + (u.streams_created || 0), 0) || 0;
        const totalStreamsStarted = allUsers?.reduce((sum, u) => sum + (u.streams_started || 0), 0) || 0;
        const totalStreamsEnded = allUsers?.reduce((sum, u) => sum + (u.streams_ended || 0), 0) || 0;
        const totalStreamingMinutesAll = allUsers?.reduce((sum, u) => sum + (u.streaming_minutes || 0), 0) || 0;
        const totalStreamsViewed = allUsers?.reduce((sum, u) => sum + (u.streams_viewed || 0), 0) || 0;

        // Room stats
        const roomsCreated = rooms?.length || 0;
        const totalRoomsCreated = allUsers?.reduce((sum, u) => sum + (u.rooms_created || 0), 0) || 0;
        const totalRoomsJoined = allUsers?.reduce((sum, u) => sum + (u.rooms_joined || 0), 0) || 0;

        // Scheduling stats
        const schedulesCreated = scheduledCalls?.length || 0;
        const schedulesJoined = scheduledCalls?.filter(s => s.status === "completed").length || 0;
        const totalSchedulesCreated = allUsers?.reduce((sum, u) => sum + (u.schedules_created || 0), 0) || 0;
        const totalSchedulesJoined = allUsers?.reduce((sum, u) => sum + (u.schedules_joined || 0), 0) || 0;

        // Wallet stats
        const usersWithSmartWallet = allUsers?.filter(u => u.smart_wallet_address).length || 0;
        const walletTypeBreakdown = {
            wallet: allUsers?.filter(u => u.wallet_type === "wallet" || !u.wallet_type).length || 0,
            passkey: allUsers?.filter(u => u.wallet_type === "passkey").length || 0,
            email: allUsers?.filter(u => u.wallet_type === "email").length || 0,
            worldId: allUsers?.filter(u => u.wallet_type?.includes("world") || u.wallet_type?.includes("alien")).length || 0,
            solana: allUsers?.filter(u => u.wallet_type === "solana").length || 0,
        };

        // Fetch passkey credentials stats
        const { data: allPasskeys } = await supabase
            .from("passkey_credentials")
            .select("id, user_address, created_at, safe_signer_address");

        const totalPasskeys = allPasskeys?.length || 0;
        const passkeysWithSafeSigners = allPasskeys?.filter(p => p.safe_signer_address).length || 0;
        const passkeysInPeriod = allPasskeys?.filter(p => 
            new Date(p.created_at) >= startDate
        ).length || 0;

        // Fetch shout_wallets table for embedded wallet stats
        const { data: allWallets } = await supabase
            .from("shout_wallets")
            .select("id, wallet_type, is_smart_wallet, smart_wallet_deployed, created_at");

        const embeddedWallets = allWallets?.filter(w => w.wallet_type === "embedded").length || 0;
        const deployedSmartWallets = allWallets?.filter(w => w.smart_wallet_deployed).length || 0;
        const walletsCreatedInPeriod = allWallets?.filter(w => 
            new Date(w.created_at) >= startDate
        ).length || 0;

        // Beta access stats for wallet
        const { data: betaApplicants } = await supabase
            .from("shout_users")
            .select("beta_access_applied, has_beta_access")
            .not("beta_access_applied", "is", null);

        const betaApplicantsCount = betaApplicants?.length || 0;
        const betaApprovedCount = betaApplicants?.filter(u => u.has_beta_access).length || 0;
        const betaPendingCount = betaApplicantsCount - betaApprovedCount;

        // Wallet transaction stats
        const { data: walletTransactions } = await supabase
            .from("shout_wallet_transactions")
            .select("id, chain_id, chain_name, amount_usd, tx_type, status, created_at, user_address")
            .order("created_at", { ascending: false });

        const totalWalletTransactions = walletTransactions?.length || 0;
        const walletTxInPeriod = walletTransactions?.filter(tx => 
            new Date(tx.created_at) >= startDate
        ).length || 0;
        const confirmedTransactions = walletTransactions?.filter(tx => tx.status === "confirmed").length || 0;
        const totalVolumeUsd = walletTransactions?.reduce((sum, tx) => sum + (Number(tx.amount_usd) || 0), 0) || 0;
        const volumeInPeriod = walletTransactions?.filter(tx => 
            new Date(tx.created_at) >= startDate
        ).reduce((sum, tx) => sum + (Number(tx.amount_usd) || 0), 0) || 0;
        const uniqueTxUsers = new Set(walletTransactions?.map(tx => tx.user_address) || []).size;

        // Network stats from transactions
        const networkTxCounts: Record<string, { chainId: number; chainName: string; count: number; volume: number }> = {};
        for (const tx of walletTransactions || []) {
            const key = String(tx.chain_id);
            if (!networkTxCounts[key]) {
                networkTxCounts[key] = { 
                    chainId: tx.chain_id, 
                    chainName: tx.chain_name, 
                    count: 0, 
                    volume: 0 
                };
            }
            networkTxCounts[key].count++;
            networkTxCounts[key].volume += Number(tx.amount_usd) || 0;
        }

        // Fetch network stats table (for historical data)
        const { data: networkStats } = await supabase
            .from("shout_wallet_network_stats")
            .select("*")
            .order("total_transactions", { ascending: false });

        // Calculate user wallet stats from shout_users
        const usersWithTxHistory = allUsers?.filter(u => (u.wallet_tx_count || 0) > 0).length || 0;
        const totalUserVolumeUsd = allUsers?.reduce((sum, u) => sum + (Number(u.wallet_volume_usd) || 0), 0) || 0;

        // Generate time series data
        const timeSeriesData = generateTimeSeries(
            startDate,
            now,
            groupBy,
            {
                newUsers: newUsers || [],
                logins: loginData || [],
                messages: alphaMessages || [],
                points: pointsHistory || [],
                friendRequests: friendRequests || [],
                groups: groups || [],
                invites: usedInvites || [],
                agents: newAgents || [],
                agentChats: agentChats || [],
            }
        );

        // Top users by various metrics
        const topUsersByPoints = [...(allUsers || [])]
            .sort((a, b) => (b.points || 0) - (a.points || 0))
            .slice(0, 10)
            .map(u => ({
                address: u.wallet_address,
                username: u.username,
                ensName: u.ens_name,
                value: u.points || 0,
            }));

        const topUsersByMessages = [...(allUsers || [])]
            .sort((a, b) => (b.messages_sent || 0) - (a.messages_sent || 0))
            .slice(0, 10)
            .map(u => ({
                address: u.wallet_address,
                username: u.username,
                ensName: u.ens_name,
                value: u.messages_sent || 0,
            }));

        const topUsersByFriends = [...(allUsers || [])]
            .sort((a, b) => (b.friends_count || 0) - (a.friends_count || 0))
            .slice(0, 10)
            .map(u => ({
                address: u.wallet_address,
                username: u.username,
                ensName: u.ens_name,
                value: u.friends_count || 0,
            }));

        // Top agents by messages
        const topAgentsByMessages = [...(allAgents || [])]
            .sort((a, b) => (b.message_count || 0) - (a.message_count || 0))
            .slice(0, 10)
            .map(a => ({
                id: a.id,
                name: a.name,
                emoji: a.avatar_emoji,
                ownerAddress: a.owner_address,
                visibility: a.visibility,
                value: a.message_count || 0,
            }));

        // Recent smart wallet users
        const recentSmartWalletUsers = [...(allUsers || [])]
            .filter(u => u.smart_wallet_address)
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
            .slice(0, 10)
            .map(u => ({
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
        ].filter(v => v.count > 0);

        // Points breakdown
        const pointsBreakdown: Record<string, number> = {};
        for (const p of pointsHistory || []) {
            const reason = p.reason || "Other";
            pointsBreakdown[reason] = (pointsBreakdown[reason] || 0) + (p.points || 0);
        }

        return NextResponse.json({
            summary: {
                totalUsers,
                newUsersCount,
                activeUsers,
                totalMessages,
                messagesInPeriod,
                totalCalls,
                totalVoiceMinutes,
                totalVideoMinutes,
                totalPoints,
                pointsInPeriod,
                friendRequestsCount,
                acceptedFriendships,
                groupsCreated,
                invitesUsed,
                // Agent stats
                totalAgents,
                newAgentsCount,
                publicAgents,
                friendsAgents,
                privateAgents,
                totalAgentMessages,
                agentMessagesInPeriod,
                uniqueAgentUsers,
                knowledgeItemsCount,
                indexedKnowledgeItems,
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
            agentVisibilityBreakdown,
            pointsBreakdown: Object.entries(pointsBreakdown).map(([reason, points]) => ({
                reason,
                points,
            })),
            walletTypeBreakdown: [
                { type: "EOA Wallet", count: walletTypeBreakdown.wallet },
                { type: "Passkey", count: walletTypeBreakdown.passkey },
                { type: "Email", count: walletTypeBreakdown.email },
                { type: "World ID", count: walletTypeBreakdown.worldId },
                { type: "Solana", count: walletTypeBreakdown.solana },
            ].filter(w => w.count > 0),
            networkStats: Object.values(networkTxCounts)
                .sort((a, b) => b.count - a.count)
                .map(n => ({
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
        console.error("[Analytics] Error:", error);
        return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
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
    agentChats: { created_at: string; role: string }[];
}

function generateTimeSeries(
    startDate: Date,
    endDate: Date,
    groupBy: "hour" | "day" | "week" | "month",
    data: DataSources
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
    }[] = [];

    let current = new Date(startDate);
    
    while (current <= endDate) {
        let nextDate: Date;
        let label: string;

        switch (groupBy) {
            case "hour":
                nextDate = new Date(current.getTime() + 60 * 60 * 1000);
                label = current.toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
                break;
            case "day":
                nextDate = new Date(current.getTime() + 24 * 60 * 60 * 1000);
                label = current.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                break;
            case "week":
                nextDate = new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000);
                label = `Week of ${current.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
                break;
            case "month":
                nextDate = new Date(current.getFullYear(), current.getMonth() + 1, 1);
                label = current.toLocaleDateString("en-US", { month: "short", year: "numeric" });
                break;
        }

        const countInRange = <T extends { [key: string]: string | number | null }>(
            items: T[],
            dateField: keyof T
        ): number => {
            return items.filter(item => {
                const itemDate = new Date(item[dateField] as string);
                return itemDate >= current && itemDate < nextDate;
            }).length;
        };

        const sumInRange = <T extends { [key: string]: string | number | null }>(
            items: T[],
            dateField: keyof T,
            valueField: keyof T
        ): number => {
            return items
                .filter(item => {
                    const itemDate = new Date(item[dateField] as string);
                    return itemDate >= current && itemDate < nextDate;
                })
                .reduce((sum, item) => sum + (Number(item[valueField]) || 0), 0);
        };

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
            agentChats: data.agentChats.filter(c => {
                const itemDate = new Date(c.created_at);
                return itemDate >= current && itemDate < nextDate && c.role === "user";
            }).length,
        });

        current = nextDate;
    }

    return series;
}

