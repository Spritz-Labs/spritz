import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/location-chats/[id]/join - Join a location chat
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

        // Check if chat exists
        const { data: chat, error: chatError } = await supabase
            .from("shout_location_chats")
            .select("id, name, waku_symmetric_key, waku_content_topic")
            .eq("id", id)
            .eq("is_active", true)
            .single();

        if (chatError || !chat) {
            return NextResponse.json(
                { error: "Location chat not found" },
                { status: 404 }
            );
        }

        // Check if already a member
        const { data: existingMember } = await supabase
            .from("shout_location_chat_members")
            .select("id")
            .eq("location_chat_id", id)
            .eq("user_address", session.userAddress)
            .single();

        if (existingMember) {
            // Already a member, return the chat credentials
            return NextResponse.json({
                success: true,
                alreadyMember: true,
                wakuSymmetricKey: chat.waku_symmetric_key,
                wakuContentTopic: chat.waku_content_topic,
            });
        }

        // Add as member
        const { error: joinError } = await supabase
            .from("shout_location_chat_members")
            .insert({
                location_chat_id: id,
                user_address: session.userAddress,
            });

        if (joinError) {
            console.error("[LocationChat] Join error:", joinError);
            return NextResponse.json(
                { error: "Failed to join location chat" },
                { status: 500 }
            );
        }

        // Increment member count
        await supabase.rpc("increment_location_chat_members", { chat_uuid: id });

        console.log("[LocationChat] User joined:", session.userAddress, "->", chat.name);

        return NextResponse.json({
            success: true,
            alreadyMember: false,
            wakuSymmetricKey: chat.waku_symmetric_key,
            wakuContentTopic: chat.waku_content_topic,
        });
    } catch (error) {
        console.error("[LocationChat] Join error:", error);
        return NextResponse.json(
            { error: "Failed to join location chat" },
            { status: 500 }
        );
    }
}

// DELETE /api/location-chats/[id]/join - Leave a location chat
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

        // Remove membership
        const { error: leaveError } = await supabase
            .from("shout_location_chat_members")
            .delete()
            .eq("location_chat_id", id)
            .eq("user_address", session.userAddress);

        if (leaveError) {
            console.error("[LocationChat] Leave error:", leaveError);
            return NextResponse.json(
                { error: "Failed to leave location chat" },
                { status: 500 }
            );
        }

        // Decrement member count
        await supabase.rpc("decrement_location_chat_members", { chat_uuid: id });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[LocationChat] Leave error:", error);
        return NextResponse.json(
            { error: "Failed to leave location chat" },
            { status: 500 }
        );
    }
}
