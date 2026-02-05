import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type JoinedLocationChat = {
    id: string;
    name: string;
    description: string | null;
    emoji: string;
    member_count: number;
    message_count: number;
    google_place_id: string;
    google_place_name: string | null;
    google_place_address: string | null;
    google_place_rating: number | null;
    latitude: number;
    longitude: number;
    created_at: string;
    updated_at: string | null;
    joined_at: string;
    last_message_at: string | null;
    last_message_preview: string | null;
};

// GET /api/location-chats/joined - Get all location chats the user has joined
export async function GET(request: NextRequest) {
    try {
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userAddress = session.userAddress.toLowerCase();

        // Get all location chat memberships for this user
        const { data: memberships, error: membershipError } = await supabase
            .from("shout_location_chat_members")
            .select("location_chat_id, joined_at")
            .eq("user_address", userAddress);

        if (membershipError) {
            console.error("[Joined Location Chats] Membership error:", membershipError);
            return NextResponse.json({ error: "Failed to fetch memberships" }, { status: 500 });
        }

        if (!memberships || memberships.length === 0) {
            return NextResponse.json({ chats: [] });
        }

        // Get the chat details for all joined chats
        const chatIds = memberships.map((m) => m.location_chat_id);
        const membershipMap = new Map(memberships.map((m) => [m.location_chat_id, m.joined_at]));

        const { data: chats, error: chatsError } = await supabase
            .from("shout_location_chats")
            .select("*")
            .in("id", chatIds)
            .eq("is_active", true);

        if (chatsError) {
            console.error("[Joined Location Chats] Chats error:", chatsError);
            return NextResponse.json({ error: "Failed to fetch chats" }, { status: 500 });
        }

        // Get the last message for each chat
        const { data: lastMessages, error: messagesError } = await supabase
            .from("shout_location_chat_messages")
            .select("location_chat_id, content, created_at")
            .in("location_chat_id", chatIds)
            .order("created_at", { ascending: false });

        // Group messages by location_chat_id and get the most recent
        const lastMessageMap = new Map<string, { content: string; created_at: string }>();
        if (lastMessages && !messagesError) {
            for (const msg of lastMessages) {
                if (!lastMessageMap.has(msg.location_chat_id)) {
                    lastMessageMap.set(msg.location_chat_id, {
                        content: msg.content,
                        created_at: msg.created_at,
                    });
                }
            }
        }

        // Transform and return
        const joinedChats: JoinedLocationChat[] = (chats || []).map((chat) => {
            const lastMsg = lastMessageMap.get(chat.id);
            return {
                id: chat.id,
                name: chat.name,
                description: chat.description,
                emoji: chat.emoji || "📍",
                member_count: chat.member_count || 0,
                message_count: chat.message_count || 0,
                google_place_id: chat.google_place_id,
                google_place_name: chat.google_place_name,
                google_place_address: chat.google_place_address,
                google_place_rating: chat.google_place_rating,
                latitude: chat.latitude,
                longitude: chat.longitude,
                created_at: chat.created_at,
                updated_at: chat.updated_at,
                joined_at: membershipMap.get(chat.id) || chat.created_at,
                last_message_at: lastMsg?.created_at || null,
                last_message_preview: lastMsg?.content
                    ? lastMsg.content.length > 50
                        ? lastMsg.content.slice(0, 50) + "..."
                        : lastMsg.content
                    : null,
            };
        });

        // Sort by last message time (most recent first)
        joinedChats.sort((a, b) => {
            const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
            const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
            return bTime - aTime;
        });

        return NextResponse.json({ chats: joinedChats });
    } catch (error) {
        console.error("[Joined Location Chats] Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
