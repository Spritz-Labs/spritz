import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/channels/[id]/waku-messages - Get messages for a Waku channel
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const since = searchParams.get("since");

    try {
        // Verify this is a Waku channel
        const { data: channel, error: channelError } = await supabase
            .from("shout_public_channels")
            .select("id, messaging_type")
            .eq("id", id)
            .single();

        if (channelError || !channel) {
            return NextResponse.json(
                { error: "Channel not found" },
                { status: 404 }
            );
        }

        if (channel.messaging_type !== "waku") {
            return NextResponse.json(
                { error: "This is not a Waku channel" },
                { status: 400 }
            );
        }

        // Build query for messages
        let query = supabase
            .from("shout_waku_channel_messages")
            .select("*")
            .eq("channel_id", id)
            .order("created_at", { ascending: true });

        // Filter by since timestamp if provided
        if (since) {
            query = query.gt("created_at", since);
        }

        // Limit to recent messages
        query = query.limit(500);

        const { data: messages, error } = await query;

        if (error) {
            console.error("[Waku Messages API] Error fetching messages:", error);
            return NextResponse.json(
                { error: "Failed to fetch messages" },
                { status: 500 }
            );
        }

        return NextResponse.json({ messages: messages || [] });
    } catch (e) {
        console.error("[Waku Messages API] Error:", e);
        return NextResponse.json(
            { error: "Failed to fetch messages" },
            { status: 500 }
        );
    }
}

// POST /api/channels/[id]/waku-messages - Send a message to a Waku channel
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const body = await request.json();
        const { content, senderAddress, messageType = "text" } = body;

        if (!content || !senderAddress) {
            return NextResponse.json(
                { error: "Content and sender address are required" },
                { status: 400 }
            );
        }

        // Verify this is a Waku channel and user is a member
        const { data: channel, error: channelError } = await supabase
            .from("shout_public_channels")
            .select("id, messaging_type, waku_content_topic")
            .eq("id", id)
            .single();

        if (channelError || !channel) {
            return NextResponse.json(
                { error: "Channel not found" },
                { status: 404 }
            );
        }

        if (channel.messaging_type !== "waku") {
            return NextResponse.json(
                { error: "This is not a Waku channel" },
                { status: 400 }
            );
        }

        // Verify user is a member
        const { data: membership } = await supabase
            .from("shout_channel_members")
            .select("id")
            .eq("channel_id", id)
            .eq("user_address", senderAddress.toLowerCase())
            .single();

        if (!membership) {
            return NextResponse.json(
                { error: "You must be a member to send messages" },
                { status: 403 }
            );
        }

        // Insert the message
        const { data: message, error: insertError } = await supabase
            .from("shout_waku_channel_messages")
            .insert({
                channel_id: id,
                content_topic: channel.waku_content_topic,
                sender_address: senderAddress.toLowerCase(),
                content,
                message_type: messageType,
            })
            .select()
            .single();

        if (insertError) {
            console.error("[Waku Messages API] Error inserting message:", insertError);
            return NextResponse.json(
                { error: "Failed to send message" },
                { status: 500 }
            );
        }

        return NextResponse.json({ message });
    } catch (e) {
        console.error("[Waku Messages API] Error:", e);
        return NextResponse.json(
            { error: "Failed to send message" },
            { status: 500 }
        );
    }
}
