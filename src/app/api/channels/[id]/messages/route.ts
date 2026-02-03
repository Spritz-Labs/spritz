import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";
import { sanitizeMessageContent } from "@/lib/sanitize";
import { getMembershipLookupAddresses } from "@/lib/ensResolution";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type ChannelMessage = {
    id: string;
    channel_id: string;
    sender_address: string;
    content: string;
    message_type: string;
    created_at: string;
    reply_to_id?: string | null;
    reply_to?: ChannelMessage | null;
    // Pinned message fields
    is_pinned?: boolean;
    pinned_by?: string | null;
    pinned_at?: string | null;
    // Edit/delete fields
    is_edited?: boolean;
    edited_at?: string | null;
    is_deleted?: boolean;
};

export type ChannelReaction = {
    id: string;
    message_id: string;
    channel_id: string;
    user_address: string;
    emoji: string;
    created_at: string;
};

// GET /api/channels/[id]/messages - Get channel messages
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "100");
    const before = request.nextUrl.searchParams.get("before"); // For pagination

    let query = supabase
        .from("shout_channel_messages")
        .select(
            "*, reply_to:reply_to_id(id, sender_address, content, message_type), is_pinned, pinned_by, pinned_at"
        )
        .eq("channel_id", id)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (before) {
        query = query.lt("created_at", before);
    }

    const { data: messages, error } = await query;

    if (error) {
        console.error("[Channels API] Error fetching messages:", error);
        return NextResponse.json(
            { error: "Failed to fetch messages" },
            { status: 500 }
        );
    }

    // Fetch reactions for these messages
    const messageIds = messages?.map((m) => m.id) || [];
    let reactions: ChannelReaction[] = [];

    if (messageIds.length > 0) {
        const { data: reactionData } = await supabase
            .from("shout_channel_reactions")
            .select("*")
            .in("message_id", messageIds);
        reactions = reactionData || [];
    }

    // Return in chronological order with reactions
    return NextResponse.json({
        messages: messages?.reverse() || [],
        reactions,
    });
}

// POST /api/channels/[id]/messages - Send a message
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // Rate limit messaging
    const rateLimitResponse = await checkRateLimit(request, "messaging");
    if (rateLimitResponse) return rateLimitResponse;

    const { id } = await params;

    try {
        // Get authenticated user from session
        const session = await getAuthenticatedUser(request);

        const body = await request.json();
        const {
            senderAddress: bodySenderAddress,
            content,
            messageType,
            replyToId,
        } = body;

        // Use session address, fall back to body for backward compatibility
        const senderAddress = session?.userAddress || bodySenderAddress;

        if (!senderAddress || !content) {
            return NextResponse.json(
                { error: "Authentication and content are required" },
                { status: 400 }
            );
        }

        // Warn if using unauthenticated fallback
        if (!session && bodySenderAddress) {
            console.warn(
                "[Channels] Using unauthenticated senderAddress param - migrate to session auth"
            );
        }

        const normalizedAddress = senderAddress.toLowerCase();

        // Check if user is a member (resolve ENS so we find rows stored by 0x)
        const lookupAddrs = await getMembershipLookupAddresses(senderAddress);
        const { data: membership } =
            lookupAddrs.length > 0
                ? await supabase
                      .from("shout_channel_members")
                      .select("id")
                      .eq("channel_id", id)
                      .in("user_address", lookupAddrs)
                      .maybeSingle()
                : { data: null };

        if (!membership) {
            return NextResponse.json(
                { error: "You must be a member to send messages" },
                { status: 403 }
            );
        }

        // Sanitize and validate content
        const sanitizedContent = sanitizeMessageContent(content, 10000);
        if (!sanitizedContent) {
            return NextResponse.json(
                { error: "Message content is required" },
                { status: 400 }
            );
        }

        // Insert message with optional reply_to
        const insertData: Record<string, unknown> = {
            channel_id: id,
            sender_address: normalizedAddress,
            content: sanitizedContent,
            message_type: messageType || "text",
        };

        if (replyToId) {
            insertData.reply_to_id = replyToId;
        }

        const { data: message, error } = await supabase
            .from("shout_channel_messages")
            .insert(insertData)
            .select(
                "*, reply_to:reply_to_id(id, sender_address, content, message_type)"
            )
            .single();

        if (error) {
            console.error("[Channels API] Error sending message:", error);
            return NextResponse.json(
                { error: "Failed to send message" },
                { status: 500 }
            );
        }

        // Increment message count
        await supabase.rpc("increment_channel_messages", { channel_uuid: id });

        return NextResponse.json({ message });
    } catch (e) {
        console.error("[Channels API] Error:", e);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}

// PATCH /api/channels/[id]/messages - Toggle reaction on a message
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: channelId } = await params;

    try {
        // Get authenticated user from session
        const session = await getAuthenticatedUser(request);

        const body = await request.json();
        const { messageId, userAddress: bodyUserAddress, emoji } = body;

        // Use session address, fall back to body for backward compatibility
        const userAddress = session?.userAddress || bodyUserAddress;

        if (!messageId || !userAddress || !emoji) {
            return NextResponse.json(
                { error: "Message ID, authentication, and emoji are required" },
                { status: 400 }
            );
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Check if reaction already exists
        const { data: existing } = await supabase
            .from("shout_channel_reactions")
            .select("id")
            .eq("message_id", messageId)
            .eq("user_address", normalizedAddress)
            .eq("emoji", emoji)
            .single();

        if (existing) {
            // Remove reaction
            await supabase
                .from("shout_channel_reactions")
                .delete()
                .eq("id", existing.id);

            return NextResponse.json({ action: "removed" });
        } else {
            // Add reaction
            const { error } = await supabase
                .from("shout_channel_reactions")
                .insert({
                    message_id: messageId,
                    channel_id: channelId,
                    user_address: normalizedAddress,
                    emoji,
                });

            if (error) {
                console.error("[Channels API] Error adding reaction:", error);
                return NextResponse.json(
                    { error: "Failed to add reaction" },
                    { status: 500 }
                );
            }

            return NextResponse.json({ action: "added" });
        }
    } catch (e) {
        console.error("[Channels API] Reaction error:", e);
        return NextResponse.json(
            { error: "Failed to process reaction" },
            { status: 500 }
        );
    }
}
