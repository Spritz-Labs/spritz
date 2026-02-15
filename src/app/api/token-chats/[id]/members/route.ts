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

// Helper to check admin permissions for a token chat
async function isTokenChatAdmin(userAddress: string, chatId: string): Promise<boolean> {
    // Check global admin
    const { data: admin } = await supabase
        .from("shout_admins")
        .select("id")
        .eq("wallet_address", userAddress)
        .single();
    if (admin) return true;

    // Check token chat creator
    const { data: chat } = await supabase
        .from("shout_token_chats")
        .select("created_by")
        .eq("id", chatId)
        .single();
    if (chat?.created_by?.toLowerCase() === userAddress) return true;

    // Check admin role in membership
    const { data: member } = await supabase
        .from("shout_token_chat_members")
        .select("role")
        .eq("chat_id", chatId)
        .eq("member_address", userAddress)
        .single();
    if (member?.role === "admin") return true;

    return false;
}

// PATCH /api/token-chats/[id]/members - Update member role (promote/demote)
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: chatId } = await params;

    try {
        const body = await request.json();
        const { userAddress, targetAddress, role } = body;

        if (!userAddress || !targetAddress || !role) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const normalizedUser = userAddress.toLowerCase();
        const normalizedTarget = targetAddress.toLowerCase();

        if (!["admin", "moderator", "member"].includes(role)) {
            return NextResponse.json({ error: "Invalid role" }, { status: 400 });
        }

        // Only admins/creators can change roles
        const canManage = await isTokenChatAdmin(normalizedUser, chatId);
        if (!canManage) {
            return NextResponse.json(
                { error: "Only admins can manage member roles" },
                { status: 403 },
            );
        }

        // Cannot change own role
        if (normalizedUser === normalizedTarget) {
            return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
        }

        // Update member role
        const { error } = await supabase
            .from("shout_token_chat_members")
            .update({ role })
            .eq("chat_id", chatId)
            .eq("member_address", normalizedTarget);

        if (error) {
            console.error("[token-chats/members] Role update error:", error);
            return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
        }

        return NextResponse.json({ success: true, role });
    } catch (err) {
        console.error("[token-chats/members] Error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// DELETE /api/token-chats/[id]/members - Remove/kick a member
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: chatId } = await params;
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get("userAddress")?.toLowerCase();
    const targetAddress = searchParams.get("targetAddress")?.toLowerCase();

    if (!userAddress || !targetAddress) {
        return NextResponse.json({ error: "Missing addresses" }, { status: 400 });
    }

    try {
        const canManage = await isTokenChatAdmin(userAddress, chatId);
        if (!canManage) {
            return NextResponse.json(
                { error: "Only admins can remove members" },
                { status: 403 },
            );
        }

        // Cannot kick yourself
        if (userAddress === targetAddress) {
            return NextResponse.json({ error: "Use the leave endpoint instead" }, { status: 400 });
        }

        // Cannot kick other admins (only creator can)
        const { data: targetMember } = await supabase
            .from("shout_token_chat_members")
            .select("role")
            .eq("chat_id", chatId)
            .eq("member_address", targetAddress)
            .single();

        if (targetMember?.role === "admin") {
            const { data: chat } = await supabase
                .from("shout_token_chats")
                .select("created_by")
                .eq("id", chatId)
                .single();

            if (chat?.created_by?.toLowerCase() !== userAddress) {
                return NextResponse.json(
                    { error: "Only the chat creator can remove other admins" },
                    { status: 403 },
                );
            }
        }

        const { error } = await supabase
            .from("shout_token_chat_members")
            .delete()
            .eq("chat_id", chatId)
            .eq("member_address", targetAddress);

        if (error) {
            console.error("[token-chats/members] Kick error:", error);
            return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[token-chats/members] Error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
