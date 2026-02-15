import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type TokenChatMessage = {
    id: string;
    chat_id: string;
    sender_address: string;
    content: string;
    reply_to: string | null;
    edited_at: string | null;
    created_at: string;
};

// GET /api/token-chats/[id]/messages
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: chatId } = await params;
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get("userAddress")?.toLowerCase();
    const before = searchParams.get("before"); // cursor for pagination
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    if (!userAddress) {
        return NextResponse.json({ error: "Missing userAddress" }, { status: 400 });
    }

    try {
        // Verify membership
        const { data: member } = await supabase
            .from("shout_token_chat_members")
            .select("id")
            .eq("chat_id", chatId)
            .eq("member_address", userAddress)
            .single();

        if (!member) {
            return NextResponse.json({ error: "Not a member" }, { status: 403 });
        }

        let query = supabase
            .from("shout_token_chat_messages")
            .select("*")
            .eq("chat_id", chatId)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (before) {
            query = query.lt("created_at", before);
        }

        const { data: messages, error } = await query;

        if (error) {
            console.error("[token-chat-messages] Error:", error);
            return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
        }

        return NextResponse.json({
            messages: (messages || []).reverse(),
            hasMore: (messages || []).length === limit,
        });
    } catch (err) {
        console.error("[token-chat-messages] Error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// POST /api/token-chats/[id]/messages - Send a message
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: chatId } = await params;

    try {
        const body = await request.json();
        const { userAddress, content, replyTo } = body;

        if (!userAddress || !content?.trim()) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Verify membership
        const { data: member } = await supabase
            .from("shout_token_chat_members")
            .select("id")
            .eq("chat_id", chatId)
            .eq("member_address", userAddress.toLowerCase())
            .single();

        if (!member) {
            return NextResponse.json({ error: "Not a member" }, { status: 403 });
        }

        const { data: message, error } = await supabase
            .from("shout_token_chat_messages")
            .insert({
                chat_id: chatId,
                sender_address: userAddress.toLowerCase(),
                content: content.trim(),
                reply_to: replyTo || null,
            })
            .select()
            .single();

        if (error) {
            console.error("[token-chat-messages] Send error:", error);
            return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
        }

        return NextResponse.json({ message });
    } catch (err) {
        console.error("[token-chat-messages] Error:", err);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
