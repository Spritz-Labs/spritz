import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { sanitizeMessageContent } from "@/lib/sanitize";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// PATCH /api/channels/[id]/messages/[messageId] - Edit a message
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; messageId: string }> }
) {
    const { id: channelId, messageId } = await params;

    try {
        const session = await getAuthenticatedUser(request);
        const body = await request.json();
        const { content, userAddress: bodyUserAddress } = body;
        
        const userAddress = session?.userAddress || bodyUserAddress;

        if (!userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        if (!content?.trim()) {
            return NextResponse.json(
                { error: "Content is required" },
                { status: 400 }
            );
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Verify message exists and belongs to user
        const { data: message, error: fetchError } = await supabase
            .from("shout_channel_messages")
            .select("*")
            .eq("id", messageId)
            .eq("channel_id", channelId)
            .single();

        if (fetchError || !message) {
            return NextResponse.json(
                { error: "Message not found" },
                { status: 404 }
            );
        }

        if (message.sender_address.toLowerCase() !== normalizedAddress) {
            return NextResponse.json(
                { error: "You can only edit your own messages" },
                { status: 403 }
            );
        }

        // Check if message is within edit window (15 minutes)
        const createdAt = new Date(message.created_at);
        const now = new Date();
        const diffMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);
        
        if (diffMinutes > 15) {
            return NextResponse.json(
                { error: "Messages can only be edited within 15 minutes" },
                { status: 400 }
            );
        }

        // Sanitize content
        const sanitizedContent = sanitizeMessageContent(content, 10000);
        if (!sanitizedContent) {
            return NextResponse.json(
                { error: "Invalid content" },
                { status: 400 }
            );
        }

        // Update the message
        const { data: updated, error: updateError } = await supabase
            .from("shout_channel_messages")
            .update({
                content: sanitizedContent,
                is_edited: true,
                edited_at: new Date().toISOString(),
            })
            .eq("id", messageId)
            .select()
            .single();

        if (updateError) {
            console.error("[Channels API] Error editing message:", updateError);
            return NextResponse.json(
                { error: "Failed to edit message" },
                { status: 500 }
            );
        }

        return NextResponse.json({ message: updated });
    } catch (e) {
        console.error("[Channels API] Edit error:", e);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}

// DELETE /api/channels/[id]/messages/[messageId] - Delete a message
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; messageId: string }> }
) {
    const { id: channelId, messageId } = await params;

    try {
        const session = await getAuthenticatedUser(request);
        const userAddress = session?.userAddress || request.headers.get("x-user-address");

        if (!userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Verify message exists and belongs to user
        const { data: message, error: fetchError } = await supabase
            .from("shout_channel_messages")
            .select("*")
            .eq("id", messageId)
            .eq("channel_id", channelId)
            .single();

        if (fetchError || !message) {
            return NextResponse.json(
                { error: "Message not found" },
                { status: 404 }
            );
        }

        // Check if user owns message OR is admin
        const { data: channel } = await supabase
            .from("shout_channels")
            .select("creator_address")
            .eq("id", channelId)
            .single();

        const isOwner = message.sender_address.toLowerCase() === normalizedAddress;
        const isAdmin = channel?.creator_address?.toLowerCase() === normalizedAddress;

        if (!isOwner && !isAdmin) {
            return NextResponse.json(
                { error: "You can only delete your own messages" },
                { status: 403 }
            );
        }

        // Soft delete - mark as deleted instead of removing
        const { error: deleteError } = await supabase
            .from("shout_channel_messages")
            .update({
                is_deleted: true,
                content: "[Message deleted]",
            })
            .eq("id", messageId);

        if (deleteError) {
            console.error("[Channels API] Error deleting message:", deleteError);
            return NextResponse.json(
                { error: "Failed to delete message" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[Channels API] Delete error:", e);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}
