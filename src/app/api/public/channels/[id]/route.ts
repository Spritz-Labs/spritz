import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/public/channels/[id] - Get public channel info
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const { data: channel, error } = await supabase
            .from("shout_public_channels")
            .select(
                "id, name, description, emoji, category, is_official, member_count, message_count, created_at, poap_event_id, poap_event_name"
            )
            .eq("id", id)
            .eq("is_active", true)
            .single();

        if (error || !channel) {
            return NextResponse.json(
                { error: "Channel not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({ channel });
    } catch (e) {
        console.error("[Public Channels API] Error:", e);
        return NextResponse.json(
            { error: "Failed to fetch channel" },
            { status: 500 }
        );
    }
}
