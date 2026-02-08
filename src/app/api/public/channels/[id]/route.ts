import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/public/channels/[id] - Get public channel info (supports UUID or slug)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        // Determine if the id is a UUID or a slug
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

        const selectFields =
            "id, name, description, emoji, category, is_official, member_count, message_count, created_at, poap_event_id, poap_event_name, slug";

        let channel = null;

        if (isUuid) {
            // Look up by UUID
            const { data, error } = await supabase
                .from("shout_public_channels")
                .select(selectFields)
                .eq("id", id)
                .eq("is_active", true)
                .single();

            if (!error) channel = data;
        } else {
            // Look up by slug (case-insensitive)
            const { data, error } = await supabase
                .from("shout_public_channels")
                .select(selectFields)
                .eq("slug", id.toLowerCase())
                .eq("is_active", true)
                .single();

            if (!error) channel = data;
        }

        if (!channel) {
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
