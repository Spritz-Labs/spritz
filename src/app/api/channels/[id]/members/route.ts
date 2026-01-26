import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type ChannelMember = {
    user_address: string;
    joined_at: string;
    username?: string;
    avatar?: string;
    ens_name?: string;
};

// GET /api/channels/[id]/members - Get channel members
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");
    const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");

    try {
        // For "global" channel, return recent active users from alpha_chat_messages
        if (id === "global") {
            const { data: recentUsers, error } = await supabase
                .from("alpha_chat_messages")
                .select("sender_address, created_at")
                .not("sender_address", "like", "agent:%")
                .order("created_at", { ascending: false })
                .limit(500);

            if (error) {
                console.error("[Channel Members] Error fetching global users:", error);
                return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
            }

            // Get unique users
            const uniqueAddresses = [...new Set(recentUsers?.map(m => m.sender_address) || [])];
            
            // Fetch user info for these addresses
            const { data: usersInfo } = await supabase
                .from("shout_users")
                .select("wallet_address, username, avatar, ens_name")
                .in("wallet_address", uniqueAddresses.map(a => a.toLowerCase()));

            const userInfoMap = new Map(
                usersInfo?.map(u => [u.wallet_address.toLowerCase(), u]) || []
            );

            const members: ChannelMember[] = uniqueAddresses.slice(offset, offset + limit).map(addr => {
                const info = userInfoMap.get(addr.toLowerCase());
                return {
                    user_address: addr,
                    joined_at: recentUsers?.find(m => m.sender_address === addr)?.created_at || new Date().toISOString(),
                    username: info?.username || undefined,
                    avatar: info?.avatar || undefined,
                    ens_name: info?.ens_name || undefined,
                };
            });

            return NextResponse.json({ 
                members,
                total: uniqueAddresses.length,
                hasMore: offset + limit < uniqueAddresses.length
            });
        }

        // For regular channels, get from shout_channel_members
        const { data: memberships, error, count } = await supabase
            .from("shout_channel_members")
            .select("user_address, joined_at", { count: "exact" })
            .eq("channel_id", id)
            .order("joined_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            console.error("[Channel Members] Error fetching members:", error);
            return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
        }

        // Get user info for these addresses
        const addresses = memberships?.map(m => m.user_address) || [];
        const { data: usersInfo } = await supabase
            .from("shout_users")
            .select("wallet_address, username, avatar, ens_name")
            .in("wallet_address", addresses);

        const userInfoMap = new Map(
            usersInfo?.map(u => [u.wallet_address.toLowerCase(), u]) || []
        );

        const members: ChannelMember[] = (memberships || []).map(m => {
            const info = userInfoMap.get(m.user_address.toLowerCase());
            return {
                user_address: m.user_address,
                joined_at: m.joined_at,
                username: info?.username || undefined,
                avatar: info?.avatar || undefined,
                ens_name: info?.ens_name || undefined,
            };
        });

        return NextResponse.json({ 
            members,
            total: count || 0,
            hasMore: (offset + limit) < (count || 0)
        });
    } catch (e) {
        console.error("[Channel Members] Error:", e);
        return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
    }
}
