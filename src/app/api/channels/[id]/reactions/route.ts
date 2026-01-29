import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type ChannelReaction = {
    id: string;
    message_id: string;
    channel_id: string;
    user_address: string;
    emoji: string;
    created_at: string;
};

// GET /api/channels/[id]/reactions - Get reactions for a channel
// Optional query: messageIds=id1,id2,id3 to filter by message ids (e.g. for Waku messages)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: channelId } = await params;
    const messageIdsParam = request.nextUrl.searchParams.get("messageIds");

    try {
        let query = supabase
            .from("shout_channel_reactions")
            .select("*")
            .eq("channel_id", channelId);

        if (messageIdsParam?.trim()) {
            const messageIds = messageIdsParam
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            if (messageIds.length > 0) {
                query = query.in("message_id", messageIds);
            }
        }

        const { data: reactions, error } = await query.order("created_at", {
            ascending: true,
        });

        if (error) {
            console.error("[Channels API] Error fetching reactions:", error);
            return NextResponse.json(
                { error: "Failed to fetch reactions" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            reactions: (reactions as ChannelReaction[]) || [],
        });
    } catch (e) {
        console.error("[Channels API] Reactions error:", e);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}
