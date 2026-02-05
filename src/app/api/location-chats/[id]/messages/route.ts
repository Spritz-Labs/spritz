import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";

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

        const { id } = await params;
        const body = await request.json();
        const { content, messageType = "text", wakuMessageId } = body;

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
