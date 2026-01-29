import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getLivepeerStream, getPlaybackUrl } from "@/lib/livepeer";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/public/streams/[id] - Get public stream details (no auth required)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    const { data: stream, error } = await supabase
        .from("shout_streams")
        .select("id, title, description, status, stream_id, playback_id, user_address, started_at, ended_at, viewer_count")
        .eq("id", id)
        .single();

    if (error || !stream) {
        return NextResponse.json(
            { error: "Stream not found" },
            { status: 404 }
        );
    }

    // Get live status from Livepeer if stream is supposed to be live (use stream_id, not playback_id)
    let isLive = stream.status === "live";
    if (stream.status === "live" && stream.stream_id) {
        try {
            const livepeerStream = await getLivepeerStream(stream.stream_id);
            isLive = livepeerStream?.isActive || false;
        } catch {
            // If we can't check, assume it's live based on DB status
        }
    }

    // Get user info for display name
    const { data: user } = await supabase
        .from("shout_users")
        .select("display_name, avatar_url")
        .eq("address", stream.user_address)
        .single();

    return NextResponse.json({
        stream: {
            id: stream.id,
            title: stream.title,
            description: stream.description,
            status: stream.status,
            is_live: isLive,
            playback_url: stream.playback_id ? getPlaybackUrl(stream.playback_id) : null,
            started_at: stream.started_at,
            ended_at: stream.ended_at,
            viewer_count: stream.viewer_count || 0,
            streamer: {
                address: stream.user_address,
                display_name: user?.display_name || null,
                avatar_url: user?.avatar_url || null,
            },
        },
    });
}

// POST /api/public/streams/[id] - Track viewer (increment count)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const action = request.nextUrl.searchParams.get("action");

    // Handle sendBeacon leave action
    if (action === "leave") {
        return decrementViewerCount(id);
    }

    // Increment viewer count
    console.log("[Public Streams API] Viewer joining stream:", id);
    
    const { data: stream, error: fetchError } = await supabase
        .from("shout_streams")
        .select("viewer_count")
        .eq("id", id)
        .single();
    
    if (fetchError) {
        console.error("[Public Streams API] Error fetching stream:", fetchError);
        return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }
    
    const newCount = (stream.viewer_count || 0) + 1;
    const { error: updateError } = await supabase
        .from("shout_streams")
        .update({ viewer_count: newCount })
        .eq("id", id);
    
    if (updateError) {
        console.error("[Public Streams API] Error updating viewer count:", updateError);
        return NextResponse.json({ error: "Failed to track view" }, { status: 500 });
    }
    
    console.log("[Public Streams API] Updated viewer count to:", newCount);
    return NextResponse.json({ success: true, viewer_count: newCount });
}

// Helper to decrement viewer count
async function decrementViewerCount(id: string) {
    console.log("[Public Streams API] Viewer leaving stream:", id);
    
    const { data: stream, error: fetchError } = await supabase
        .from("shout_streams")
        .select("viewer_count")
        .eq("id", id)
        .single();
    
    if (fetchError) {
        console.error("[Public Streams API] Error fetching stream for decrement:", fetchError);
        return NextResponse.json({ success: false });
    }
    
    const newCount = Math.max(0, (stream.viewer_count || 0) - 1);
    const { error: updateError } = await supabase
        .from("shout_streams")
        .update({ viewer_count: newCount })
        .eq("id", id);
    
    if (updateError) {
        console.error("[Public Streams API] Error decrementing viewer count:", updateError);
    } else {
        console.log("[Public Streams API] Decremented viewer count to:", newCount);
    }
    
    return NextResponse.json({ success: true, viewer_count: newCount });
}

// DELETE /api/public/streams/[id] - Decrement viewer count
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    return decrementViewerCount(id);
}

