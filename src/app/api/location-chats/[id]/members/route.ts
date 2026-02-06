import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type LocationChatMember = {
    user_address: string;
    joined_at: string;
    username?: string;
    avatar?: string;
    ens_name?: string;
};

// GET /api/location-chats/[id]/members - List members (same shape as channel members for ChatMembersList)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "100"), 200);
    const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");

    try {
        const { data: memberships, error, count } = await supabase
            .from("shout_location_chat_members")
            .select("user_address, joined_at", { count: "exact" })
            .eq("location_chat_id", id)
            .order("joined_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            console.error("[Location Chat Members] Error:", error);
            return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
        }

        const addresses = memberships?.map((m) => m.user_address.toLowerCase()) || [];
        let userInfoMap = new Map<string, { username?: string; avatar?: string; ens_name?: string }>();

        if (addresses.length > 0) {
            const batchSize = 100;
            for (let i = 0; i < addresses.length; i += batchSize) {
                const batch = addresses.slice(i, i + batchSize);
                const { data: usersInfo } = await supabase
                    .from("shout_users")
                    .select("wallet_address, username, avatar, ens_name")
                    .in("wallet_address", batch);
                usersInfo?.forEach((u) => {
                    userInfoMap.set(u.wallet_address.toLowerCase(), {
                        username: u.username,
                        avatar: u.avatar ?? undefined,
                        ens_name: u.ens_name ?? undefined,
                    });
                });
            }
        }

        const members: LocationChatMember[] = (memberships || []).map((m) => {
            const info = userInfoMap.get(m.user_address.toLowerCase());
            return {
                user_address: m.user_address,
                joined_at: m.joined_at,
                username: info?.username,
                avatar: info?.avatar,
                ens_name: info?.ens_name,
            };
        });

        return NextResponse.json({
            members,
            total: count ?? 0,
            hasMore: (offset + limit) < (count ?? 0),
        });
    } catch (e) {
        console.error("[Location Chat Members] Error:", e);
        return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
    }
}
