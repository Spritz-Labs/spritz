import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/location-chats/[id] - Get a specific location chat with details
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const rateLimitResponse = await checkRateLimit(request, "general");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const { id } = await params;

        const { data: chat, error } = await supabase
            .from("shout_location_chats")
            .select("*")
            .eq("id", id)
            .single();

        if (error || !chat) {
            return NextResponse.json(
                { error: "Location chat not found" },
                { status: 404 }
            );
        }

        // Check if current user is a member
        const session = await getAuthenticatedUser(request);
        let isMember = false;
        
        if (session?.userAddress) {
            const { data: membership } = await supabase
                .from("shout_location_chat_members")
                .select("id")
                .eq("location_chat_id", id)
                .eq("user_address", session.userAddress)
                .single();
            
            isMember = !!membership;
        }

        // Get recent members (for display)
        const { data: members } = await supabase
            .from("shout_location_chat_members")
            .select("user_address, joined_at")
            .eq("location_chat_id", id)
            .order("joined_at", { ascending: false })
            .limit(10);

        return NextResponse.json({
            chat,
            isMember,
            members: members || [],
        });
    } catch (error) {
        console.error("[LocationChat] GET error:", error);
        return NextResponse.json(
            { error: "Failed to fetch location chat" },
            { status: 500 }
        );
    }
}
