import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// GET /api/token-chats/[id]/members - List members
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: chatId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const search = searchParams.get("search") || "";

    try {
        // Get total count
        const { count } = await supabase
            .from("shout_token_chat_members")
            .select("*", { count: "exact", head: true })
            .eq("chat_id", chatId);

        // Fetch members
        let query = supabase
            .from("shout_token_chat_members")
            .select("member_address, role, joined_at, verified_balance")
            .eq("chat_id", chatId)
            .order("joined_at", { ascending: true })
            .range(offset, offset + limit - 1);

        const { data: members, error } = await query;

        if (error) {
            return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
        }

        // Enrich with user info
        const memberAddresses = (members || []).map((m) => m.member_address);
        const { data: users } = await supabase
            .from("shout_users")
            .select("wallet_address, display_name, avatar_url, ens_name")
            .in("wallet_address", memberAddresses);

        const userMap = new Map<string, { display_name?: string; avatar_url?: string; ens_name?: string }>();
        if (users) {
            for (const u of users) {
                userMap.set(u.wallet_address.toLowerCase(), u);
            }
        }

        let enrichedMembers = (members || []).map((m) => {
            const user = userMap.get(m.member_address.toLowerCase());
            return {
                address: m.member_address,
                display_name: user?.display_name || user?.ens_name || null,
                avatar_url: user?.avatar_url || null,
                role: m.role,
                joined_at: m.joined_at,
            };
        });

        // Filter by search
        if (search) {
            const q = search.toLowerCase();
            enrichedMembers = enrichedMembers.filter(
                (m) =>
                    m.address.toLowerCase().includes(q) ||
                    m.display_name?.toLowerCase().includes(q),
            );
        }

        return NextResponse.json({
            members: enrichedMembers,
            total: count || 0,
            hasMore: (offset + limit) < (count || 0),
        });
    } catch (err) {
        console.error("[token-chats/members] Error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
