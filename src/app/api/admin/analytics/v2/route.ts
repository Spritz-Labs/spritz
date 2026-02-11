import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

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

// Safe RPC call that returns null on failure
async function safeRpc(name: string, params?: Record<string, unknown>) {
    if (!supabase) return null;
    try {
        const { data, error } = await supabase.rpc(name, params);
        if (error) {
            console.warn(`[Analytics v2] RPC ${name} failed:`, error.message);
            return null;
        }
        return data;
    } catch (e) {
        console.warn(`[Analytics v2] RPC ${name} error:`, e);
        return null;
    }
}

// Safe count query
async function safeCount(table: string, filters?: (q: ReturnType<ReturnType<typeof createClient>["from"]>) => ReturnType<ReturnType<typeof createClient>["from"]>) {
    if (!supabase) return 0;
    try {
        let query = supabase.from(table).select("*", { count: "exact", head: true });
        if (filters) query = filters(query);
        const { count, error } = await query;
        if (error) return 0;
        return count ?? 0;
    } catch {
        return 0;
    }
}

// GET: Fetch analytics v2 data (uses RPC functions for heavy lifting)
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
    const section = searchParams.get("section") || "overview";
    const period = searchParams.get("period") || "7d";

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    const periodDays = {
        "24h": 1, "7d": 7, "30d": 30, "90d": 90, "365d": 365,
    }[period] || 7;

    startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

    try {
        // Section-based loading: only fetch what's needed
        switch (section) {
            case "overview": {
                // Parallel fetch for overview KPIs
                const [
                    activeUsers,
                    dauSparkline,
                    segments,
                    funnel,
                    comparison,
                    totalUsers,
                    totalAgents,
                    totalMessages,
                    totalChannelMessages,
                    totalAlphaMessages,
                ] = await Promise.all([
                    safeRpc("analytics_active_users"),
                    safeRpc("analytics_dau_sparkline", { p_days: 14 }),
                    safeRpc("analytics_user_segments"),
                    safeRpc("analytics_user_funnel"),
                    safeRpc("analytics_summary_comparison", {
                        p_start: startDate.toISOString(),
                        p_end: now.toISOString(),
                    }),
                    safeCount("shout_users"),
                    safeCount("shout_agents"),
                    safeCount("shout_messages"),
                    safeCount("shout_channel_messages"),
                    safeCount("shout_alpha_messages"),
                ]);

                return NextResponse.json({
                    section: "overview",
                    activeUsers,
                    dauSparkline,
                    segments,
                    funnel,
                    comparison,
                    totals: {
                        users: totalUsers,
                        agents: totalAgents,
                        messages: totalMessages + totalChannelMessages + totalAlphaMessages,
                        dmMessages: totalMessages,
                        channelMessages: totalChannelMessages,
                        alphaMessages: totalAlphaMessages,
                    },
                    period,
                    startDate: startDate.toISOString(),
                    endDate: now.toISOString(),
                });
            }

            case "users": {
                const [
                    signupCurve,
                    retention,
                    segments,
                    funnel,
                    peakHours,
                ] = await Promise.all([
                    safeRpc("analytics_signup_curve", { p_days: periodDays }),
                    safeRpc("analytics_retention_cohorts", { p_weeks: 8 }),
                    safeRpc("analytics_user_segments"),
                    safeRpc("analytics_user_funnel"),
                    safeRpc("analytics_peak_hours", { p_days: periodDays }),
                ]);

                // Top users by various metrics
                const { data: topByMessages } = await supabase
                    .from("shout_users")
                    .select("wallet_address, username, ens_name, messages_sent, last_login")
                    .order("messages_sent", { ascending: false })
                    .limit(15);

                const { data: topByPoints } = await supabase
                    .from("shout_users")
                    .select("wallet_address, username, ens_name, points, last_login")
                    .order("points", { ascending: false })
                    .limit(15);

                const { data: topByFriends } = await supabase
                    .from("shout_users")
                    .select("wallet_address, username, ens_name, friends_count, last_login")
                    .order("friends_count", { ascending: false })
                    .limit(15);

                return NextResponse.json({
                    section: "users",
                    signupCurve,
                    retention,
                    segments,
                    funnel,
                    peakHours,
                    topUsers: {
                        byMessages: topByMessages || [],
                        byPoints: topByPoints || [],
                        byFriends: topByFriends || [],
                    },
                    period,
                });
            }

            case "chat": {
                const [
                    messageVolume,
                    peakHours,
                    comparison,
                ] = await Promise.all([
                    safeRpc("analytics_message_volume", { p_days: periodDays }),
                    safeRpc("analytics_peak_hours", { p_days: periodDays }),
                    safeRpc("analytics_summary_comparison", {
                        p_start: startDate.toISOString(),
                        p_end: now.toISOString(),
                    }),
                ]);

                // Top channels by message count
                const { data: topChannels } = await supabase
                    .from("shout_public_channels")
                    .select("id, name, emoji, member_count, message_count")
                    .eq("is_active", true)
                    .order("message_count", { ascending: false })
                    .limit(10);

                return NextResponse.json({
                    section: "chat",
                    messageVolume,
                    peakHours,
                    comparison,
                    topChannels: topChannels || [],
                    period,
                });
            }

            case "agents": {
                const [
                    agentLeaderboard,
                    messageVolume,
                    comparison,
                ] = await Promise.all([
                    safeRpc("analytics_agent_leaderboard", { p_days: periodDays, p_limit: 20 }),
                    safeRpc("analytics_message_volume", { p_days: periodDays }),
                    safeRpc("analytics_summary_comparison", {
                        p_start: startDate.toISOString(),
                        p_end: now.toISOString(),
                    }),
                ]);

                // Total AI stats
                const totalAiMessages = await safeCount("shout_agent_chats");
                const totalAgents = await safeCount("shout_agents");
                const uniqueAiUsers = await supabase
                    .from("shout_agent_chats")
                    .select("user_address", { count: "exact", head: true })
                    // Count distinct is tricky with PostgREST, get a rough count
                    ;

                return NextResponse.json({
                    section: "agents",
                    agentLeaderboard,
                    messageVolume,
                    comparison,
                    totals: {
                        totalAiMessages,
                        totalAgents,
                    },
                    period,
                });
            }

            case "wallets": {
                // Wallet-specific analytics
                const totalSmartWallets = await safeCount("shout_users", (q) =>
                    q.not("smart_wallet_address", "is", null),
                );
                const totalPasskeys = await safeCount("passkey_credentials");

                const { data: walletTypeBreakdown } = await supabase
                    .from("shout_users")
                    .select("wallet_type")
                    .not("wallet_type", "is", null);

                // Build wallet type counts
                const typeCounts: Record<string, number> = {};
                (walletTypeBreakdown || []).forEach((u: { wallet_type: string }) => {
                    const t = u.wallet_type || "wallet";
                    typeCounts[t] = (typeCounts[t] || 0) + 1;
                });

                return NextResponse.json({
                    section: "wallets",
                    totalSmartWallets,
                    totalPasskeys,
                    walletTypeBreakdown: Object.entries(typeCounts).map(([type, count]) => ({
                        type,
                        count,
                    })),
                    period,
                });
            }

            default:
                return NextResponse.json(
                    { error: `Unknown section: ${section}` },
                    { status: 400 },
                );
        }
    } catch (error) {
        console.error("[Analytics v2] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch analytics", details: error instanceof Error ? error.message : String(error) },
            { status: 500 },
        );
    }
}
