import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Check if a user is an admin
async function isAdmin(address: string): Promise<boolean> {
    const { data } = await supabase
        .from("shout_admins")
        .select("id")
        .eq("wallet_address", address.toLowerCase())
        .single();
    
    return !!data;
}

// POST /api/channels/[id]/messages/pin - Pin or unpin a message (admin only)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: channelId } = await params;

    try {
        // Get authenticated user from session
        const session = await getAuthenticatedUser(request);
        
        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const normalizedAddress = session.userAddress.toLowerCase();

        // Check if user is an admin
        const adminCheck = await isAdmin(normalizedAddress);
        if (!adminCheck) {
            return NextResponse.json(
                { error: "Only admins can pin messages" },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { messageId, pin } = body;

        if (!messageId || typeof pin !== "boolean") {
            return NextResponse.json(
                { error: "Message ID and pin status are required" },
                { status: 400 }
            );
        }

        // Verify the message belongs to this channel
        const { data: message, error: messageError } = await supabase
            .from("shout_channel_messages")
            .select("id, channel_id, is_pinned")
            .eq("id", messageId)
            .eq("channel_id", channelId)
            .single();

        if (messageError || !message) {
            return NextResponse.json(
                { error: "Message not found in this channel" },
                { status: 404 }
            );
        }

        // Update the pin status
        const updateData = pin
            ? {
                  is_pinned: true,
                  pinned_by: normalizedAddress,
                  pinned_at: new Date().toISOString(),
              }
            : {
                  is_pinned: false,
                  pinned_by: null,
                  pinned_at: null,
              };

        const { error: updateError } = await supabase
            .from("shout_channel_messages")
            .update(updateData)
            .eq("id", messageId);

        if (updateError) {
            console.error("[Channels API] Error updating pin status:", updateError);
            return NextResponse.json(
                { error: "Failed to update pin status" },
                { status: 500 }
            );
        }

        console.log(`[Channels] Message ${messageId} ${pin ? "pinned" : "unpinned"} by ${normalizedAddress}`);

        return NextResponse.json({
            success: true,
            messageId,
            isPinned: pin,
            pinnedBy: pin ? normalizedAddress : null,
        });
    } catch (e) {
        console.error("[Channels API] Pin error:", e);
        return NextResponse.json(
            { error: "Failed to process pin request" },
            { status: 500 }
        );
    }
}

// GET /api/channels/[id]/messages/pin - Get all pinned messages for a channel
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: channelId } = await params;

    try {
        const { data: pinnedMessages, error } = await supabase
            .from("shout_channel_messages")
            .select("*, reply_to:reply_to_id(id, sender_address, content, message_type)")
            .eq("channel_id", channelId)
            .eq("is_pinned", true)
            .order("pinned_at", { ascending: false });

        if (error) {
            console.error("[Channels API] Error fetching pinned messages:", error);
            return NextResponse.json(
                { error: "Failed to fetch pinned messages" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            pinnedMessages: pinnedMessages || [],
        });
    } catch (e) {
        console.error("[Channels API] Error:", e);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}
