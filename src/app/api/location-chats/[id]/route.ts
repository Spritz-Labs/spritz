import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getAuthenticatedUser(request);
        const userAddress = session?.userAddress;

        const { id } = await params;

        // Fetch the location chat
        const { data: chat, error: chatError } = await supabase
            .from("shout_location_chats")
            .select("*")
            .eq("id", id)
            .eq("is_active", true)
            .single();

        if (chatError || !chat) {
            return NextResponse.json(
                { error: "Location chat not found" },
                { status: 404 }
            );
        }

        // Check if user is a member
        let isMember = false;
        if (userAddress) {
            const { data: membership } = await supabase
                .from("shout_location_chat_members")
                .select("id")
                .eq("location_chat_id", id)
                .eq("user_address", userAddress.toLowerCase())
                .single();
            
            isMember = !!membership;
        }

        // Fetch members
        const { data: members } = await supabase
            .from("shout_location_chat_members")
            .select("*")
            .eq("location_chat_id", id)
            .order("joined_at", { ascending: true })
            .limit(50);

        return NextResponse.json({
            chat,
            isMember,
            members: members || [],
        });
    } catch (error) {
        console.error("[location-chats/[id]] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch location chat" },
            { status: 500 }
        );
    }
}
