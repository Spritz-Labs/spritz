import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";
import { isUserBanned } from "@/lib/banCheck";
import { validateMessageAgainstRules } from "@/lib/chatRules";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/location-chats/[id]/messages - Get messages for a location chat
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const rateLimitResponse = await checkRateLimit(request, "general");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get("limit") || "50");
        const before = searchParams.get("before"); // For pagination

        let query = supabase
            .from("shout_location_chat_messages")
            .select("*")
            .eq("location_chat_id", id)
            .order("created_at", { ascending: false })
            .limit(limit);

        if (before) {
            query = query.lt("created_at", before);
        }

        const { data: messages, error } = await query;

        if (error) {
            console.error("[LocationChat] Messages fetch error:", error);
            return NextResponse.json(
                { error: "Failed to fetch messages" },
                { status: 500 }
            );
        }

        // Reverse to get chronological order
        const chronologicalMessages = (messages || []).reverse();

        // Populate reply_to_message for messages with replies
        const replyIds = chronologicalMessages
            .filter((m: { reply_to?: string }) => m.reply_to)
            .map((m: { reply_to: string }) => m.reply_to);

        if (replyIds.length > 0) {
            const { data: replyMessages } = await supabase
                .from("shout_location_chat_messages")
                .select("id, sender_address, content")
                .in("id", replyIds);

            const replyMap = new Map(
                (replyMessages || []).map((r: { id: string; sender_address: string; content: string }) => [r.id, r])
            );

            chronologicalMessages.forEach((msg: { reply_to?: string; reply_to_message?: unknown }) => {
                if (msg.reply_to && replyMap.has(msg.reply_to)) {
                    msg.reply_to_message = replyMap.get(msg.reply_to);
                }
            });
        }

        return NextResponse.json({
            messages: chronologicalMessages,
            count: chronologicalMessages.length,
        });
    } catch (error) {
        console.error("[LocationChat] Messages GET error:", error);
        return NextResponse.json(
            { error: "Failed to fetch messages" },
            { status: 500 }
        );
    }
}

// POST /api/location-chats/[id]/messages - Send a message (Supabase sync for hybrid messaging)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const rateLimitResponse = await checkRateLimit(request, "general");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        // Check if user is banned
        if (await isUserBanned(session.userAddress)) {
            return NextResponse.json(
                { error: "Your account has been suspended" },
                { status: 403 }
            );
        }

        const { id } = await params;
        const body = await request.json();
        const { content, messageType = "text", wakuMessageId, replyToId } = body;

        if (!content || content.trim().length === 0) {
            return NextResponse.json(
                { error: "Message content is required" },
                { status: 400 }
            );
        }

        // Verify user is a member
        const { data: membership } = await supabase
            .from("shout_location_chat_members")
            .select("id")
            .eq("location_chat_id", id)
            .eq("user_address", session.userAddress)
            .single();

        if (!membership) {
            return NextResponse.json(
                { error: "You must join this chat first" },
                { status: 403 }
            );
        }

        // Check chat rules (room bans, read-only mode, content type restrictions, links)
        const ruleViolation = await validateMessageAgainstRules(
            "location", id, session.userAddress, content, messageType || "text"
        );
        if (ruleViolation) {
            return NextResponse.json({ error: ruleViolation }, { status: 403 });
        }

        // Check for duplicate (if wakuMessageId provided)
        if (wakuMessageId) {
            const { data: existing } = await supabase
                .from("shout_location_chat_messages")
                .select("id")
                .eq("waku_message_id", wakuMessageId)
                .single();

            if (existing) {
                // Already synced, return success without duplicate insert
                return NextResponse.json({
                    success: true,
                    duplicate: true,
                    messageId: existing.id,
                });
            }
        }

        // Insert message
        const { data: message, error: insertError } = await supabase
            .from("shout_location_chat_messages")
            .insert({
                location_chat_id: id,
                sender_address: session.userAddress,
                content: content.trim(),
                message_type: messageType,
                waku_message_id: wakuMessageId || null,
                reply_to: replyToId || null,
            })
            .select()
            .single();

        if (insertError) {
            console.error("[LocationChat] Message insert error:", insertError);
            return NextResponse.json(
                { error: "Failed to send message" },
                { status: 500 }
            );
        }

        // Increment message count
        await supabase.rpc("increment_location_chat_messages", { chat_uuid: id });

        return NextResponse.json({
            success: true,
            message,
        });
    } catch (error) {
        console.error("[LocationChat] Messages POST error:", error);
        return NextResponse.json(
            { error: "Failed to send message" },
            { status: 500 }
        );
    }
}

// DELETE /api/location-chats/[id]/messages - Delete a message (own messages only)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const rateLimitResponse = await checkRateLimit(request, "general");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const messageId = searchParams.get("messageId");

        if (!messageId) {
            return NextResponse.json(
                { error: "Message ID is required" },
                { status: 400 }
            );
        }

        // Verify the message exists and belongs to the user
        const { data: message, error: fetchError } = await supabase
            .from("shout_location_chat_messages")
            .select("*")
            .eq("id", messageId)
            .eq("location_chat_id", id)
            .single();

        if (fetchError || !message) {
            return NextResponse.json(
                { error: "Message not found" },
                { status: 404 }
            );
        }

        const isOwner = message.sender_address.toLowerCase() === session.userAddress.toLowerCase();

        // Check if user is chat creator or global admin
        let isAdmin = false;
        if (!isOwner) {
            // Check location chat creator
            const { data: chat } = await supabase
                .from("shout_location_chats")
                .select("creator_address")
                .eq("id", id)
                .single();

            isAdmin = chat?.creator_address?.toLowerCase() === session.userAddress.toLowerCase();

            // Check global admin
            if (!isAdmin) {
                const { data: adminData } = await supabase
                    .from("shout_admins")
                    .select("wallet_address")
                    .eq("wallet_address", session.userAddress.toLowerCase())
                    .single();
                isAdmin = !!adminData;
            }
        }

        if (!isOwner && !isAdmin) {
            return NextResponse.json(
                { error: "You can only delete your own messages" },
                { status: 403 }
            );
        }

        // Delete the message
        const { error: deleteError } = await supabase
            .from("shout_location_chat_messages")
            .delete()
            .eq("id", messageId);

        if (deleteError) {
            console.error("[LocationChat] Message delete error:", deleteError);
            return NextResponse.json(
                { error: "Failed to delete message" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[LocationChat] Messages DELETE error:", error);
        return NextResponse.json(
            { error: "Failed to delete message" },
            { status: 500 }
        );
    }
}
