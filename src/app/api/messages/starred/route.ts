import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type StarredMessage = {
    id: string;
    user_address: string;
    message_id: string;
    message_type: "channel" | "dm" | "group" | "alpha";
    content: string;
    sender_address: string;
    sender_name: string | null;
    channel_id: string | null;
    channel_name: string | null;
    peer_address: string | null;
    peer_name: string | null;
    group_id: string | null;
    group_name: string | null;
    original_created_at: string;
    starred_at: string;
    notes: string | null;
};

// GET - Fetch user's starred messages
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");
        const type = searchParams.get("type"); // Optional filter
        const limit = parseInt(searchParams.get("limit") || "50");

        if (!userAddress) {
            return NextResponse.json(
                { error: "userAddress required" },
                { status: 400 }
            );
        }

        let query = supabase
            .from("starred_messages")
            .select("*")
            .eq("user_address", userAddress.toLowerCase())
            .order("starred_at", { ascending: false })
            .limit(limit);

        if (type) {
            query = query.eq("message_type", type);
        }

        const { data, error } = await query;

        if (error) {
            console.error("[StarredMessages] Error fetching:", error);
            return NextResponse.json(
                { error: "Failed to fetch starred messages" },
                { status: 500 }
            );
        }

        return NextResponse.json({ messages: data || [] });
    } catch (error) {
        console.error("[StarredMessages] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// POST - Star a message
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            userAddress,
            messageId,
            messageType,
            content,
            senderAddress,
            senderName,
            channelId,
            channelName,
            peerAddress,
            peerName,
            groupId,
            groupName,
            originalCreatedAt,
            notes,
        } = body;

        if (!userAddress || !messageId || !messageType || !content || !senderAddress) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from("starred_messages")
            .upsert({
                user_address: userAddress.toLowerCase(),
                message_id: messageId,
                message_type: messageType,
                content,
                sender_address: senderAddress.toLowerCase(),
                sender_name: senderName,
                channel_id: channelId,
                channel_name: channelName,
                peer_address: peerAddress?.toLowerCase(),
                peer_name: peerName,
                group_id: groupId,
                group_name: groupName,
                original_created_at: originalCreatedAt,
                notes,
            }, {
                onConflict: "user_address,message_id",
            })
            .select()
            .single();

        if (error) {
            console.error("[StarredMessages] Error starring:", error);
            return NextResponse.json(
                { error: "Failed to star message" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, starred: data });
    } catch (error) {
        console.error("[StarredMessages] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// DELETE - Unstar a message
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");
        const messageId = searchParams.get("messageId");

        if (!userAddress || !messageId) {
            return NextResponse.json(
                { error: "userAddress and messageId required" },
                { status: 400 }
            );
        }

        const { error } = await supabase
            .from("starred_messages")
            .delete()
            .eq("user_address", userAddress.toLowerCase())
            .eq("message_id", messageId);

        if (error) {
            console.error("[StarredMessages] Error unstarring:", error);
            return NextResponse.json(
                { error: "Failed to unstar message" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[StarredMessages] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
