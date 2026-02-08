import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// POST /api/messages/delete - Soft delete a DM message
export async function POST(request: NextRequest) {
    try {
        const session = await getAuthenticatedUser(request);

        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const userAddress = session.userAddress;

        const { messageId } = await request.json();

        if (!messageId) {
            return NextResponse.json(
                { error: "messageId is required" },
                { status: 400 }
            );
        }

        const normalizedAddress = userAddress.toLowerCase();
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Find the message
        const { data: message, error: fetchError } = await supabase
            .from("shout_messages")
            .select("*")
            .eq("message_id", messageId)
            .single();

        if (fetchError || !message) {
            return NextResponse.json(
                { error: "Message not found" },
                { status: 404 }
            );
        }

        // Check ownership or admin status
        const isOwner =
            message.sender_address?.toLowerCase() === normalizedAddress;

        let isAdmin = false;
        if (!isOwner) {
            const { data: adminData } = await supabase
                .from("shout_admins")
                .select("wallet_address")
                .eq("wallet_address", normalizedAddress)
                .single();
            isAdmin = !!adminData;
        }

        if (!isOwner && !isAdmin) {
            return NextResponse.json(
                { error: "You can only delete your own messages" },
                { status: 403 }
            );
        }

        // Soft delete - mark as deleted
        const { error: deleteError } = await supabase
            .from("shout_messages")
            .update({
                is_deleted: true,
                encrypted_content: "[Message deleted]",
            })
            .eq("message_id", messageId);

        if (deleteError) {
            console.error("[Messages API] Error deleting message:", deleteError);
            return NextResponse.json(
                { error: "Failed to delete message" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[Messages API] Delete error:", e);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}
