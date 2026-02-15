import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function canEditTokenChat(
    userAddress: string,
    chatId: string,
): Promise<boolean> {
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

    // Check if member with admin role
    const { data: member } = await supabase
        .from("shout_token_chat_members")
        .select("role")
        .eq("chat_id", chatId)
        .eq("member_address", userAddress)
        .single();
    if (member?.role === "admin") return true;

    return false;
}

// PATCH /api/token-chats/[id]/settings - Update token chat settings
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    try {
        const body = await request.json();
        const { userAddress, name, description, emoji } = body;

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        const canEdit = await canEditTokenChat(userAddress.toLowerCase(), id);
        if (!canEdit) {
            return NextResponse.json(
                { error: "Only admins and chat creators can edit settings" },
                { status: 403 },
            );
        }

        // Build the update object with only provided fields
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (name !== undefined) updates.name = name.trim();
        if (description !== undefined) updates.description = description?.trim() || null;
        if (emoji !== undefined) updates.emoji = emoji;

        const { data, error } = await supabase
            .from("shout_token_chats")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (error) {
            console.error("[Token Chat Settings] Update error:", error);
            return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
        }

        return NextResponse.json({ chat: data });
    } catch (err) {
        console.error("[Token Chat Settings] Error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// GET /api/token-chats/[id]/settings - Get token chat settings (public)
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    try {
        const { data, error } = await supabase
            .from("shout_token_chats")
            .select("*")
            .eq("id", id)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: "Token chat not found" }, { status: 404 });
        }

        return NextResponse.json({ chat: data });
    } catch (err) {
        console.error("[Token Chat Settings] Error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
