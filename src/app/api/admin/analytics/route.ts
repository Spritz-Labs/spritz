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
            },
            timeSeries: timeSeriesData,
            topUsers: {
                byPoints: topUsersByPoints,
                byMessages: topUsersByMessages,
                byFriends: topUsersByFriends,
            },
            pointsBreakdown: Object.entries(pointsBreakdown).map(([reason, points]) => ({
                reason,
                points,
            })),
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
        });

        current = nextDate;
    }

    return series;
}

