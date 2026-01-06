import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
    getLivepeerStream,
    deleteLivepeerStream,
    getLivepeerStreamAssets,
    getPlaybackUrl,
} from "@/lib/livepeer";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/streams/[id] - Get stream details
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    const { data: stream, error } = await supabase
        .from("shout_streams")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !stream) {
        return NextResponse.json(
            { error: "Stream not found" },
            { status: 404 }
        );
    }

    // Get live status from Livepeer
    let isLive = false;
    if (stream.stream_id) {
        const livepeerStream = await getLivepeerStream(stream.stream_id);
        isLive = livepeerStream?.isActive || false;
    }

    return NextResponse.json({
        stream: {
            ...stream,
            is_live: isLive,
            playback_url: stream.playback_id ? getPlaybackUrl(stream.playback_id) : null,
        },
    });
}

// PATCH /api/streams/[id] - Update stream (go live, end stream, update details)
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const body = await request.json();
        const { userAddress, action, title, description } = body;

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address is required" },
                { status: 400 }
            );
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Get existing stream
        const { data: stream, error: fetchError } = await supabase
            .from("shout_streams")
            .select("*")
            .eq("id", id)
            .single();

        if (fetchError || !stream) {
            return NextResponse.json(
                { error: "Stream not found" },
                { status: 404 }
            );
        }

        // Verify ownership
        if (stream.user_address !== normalizedAddress) {
            return NextResponse.json(
                { error: "Not authorized" },
                { status: 403 }
            );
        }

        const updates: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };

        // Handle actions
        if (action === "go_live") {
            updates.status = "live";
            updates.started_at = new Date().toISOString();
        } else if (action === "end") {
            updates.status = "ended";
            updates.ended_at = new Date().toISOString();

            // Get recordings from Livepeer and save as assets
            if (stream.stream_id) {
                const assets = await getLivepeerStreamAssets(stream.stream_id);
                for (const asset of assets) {
                    await supabase.from("shout_stream_assets").upsert({
                        stream_id: id,
                        user_address: normalizedAddress,
                        asset_id: asset.id,
                        playback_id: asset.playbackId,
                        playback_url: asset.playbackUrl,
                        download_url: asset.downloadUrl,
                        duration_seconds: asset.videoSpec?.duration,
                        size_bytes: asset.size,
                        status: asset.status.phase === "ready" ? "ready" : "processing",
                    }, { onConflict: "asset_id" });
                }
            }
        }

        // Update title/description if provided
        if (title !== undefined) updates.title = title?.trim() || null;
        if (description !== undefined) updates.description = description?.trim() || null;

        const { data: updatedStream, error: updateError } = await supabase
            .from("shout_streams")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (updateError) {
            console.error("[Streams API] Error updating stream:", updateError);
            return NextResponse.json(
                { error: "Failed to update stream" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            stream: {
                ...updatedStream,
                playback_url: updatedStream.playback_id
                    ? getPlaybackUrl(updatedStream.playback_id)
                    : null,
            },
        });
    } catch (e) {
        console.error("[Streams API] Error:", e);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}

// DELETE /api/streams/[id] - Delete stream
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const userAddress = request.nextUrl.searchParams.get("userAddress");

    if (!userAddress) {
        return NextResponse.json(
            { error: "User address is required" },
            { status: 400 }
        );
    }

    const normalizedAddress = userAddress.toLowerCase();

    // Get stream
    const { data: stream, error: fetchError } = await supabase
        .from("shout_streams")
        .select("*")
        .eq("id", id)
        .single();

    if (fetchError || !stream) {
        return NextResponse.json(
            { error: "Stream not found" },
            { status: 404 }
        );
    }

    // Verify ownership
    if (stream.user_address !== normalizedAddress) {
        return NextResponse.json(
            { error: "Not authorized" },
            { status: 403 }
        );
    }

    // Delete from Livepeer
    if (stream.stream_id) {
        await deleteLivepeerStream(stream.stream_id);
    }

    // Delete from database (cascade will delete assets)
    const { error: deleteError } = await supabase
        .from("shout_streams")
        .delete()
        .eq("id", id);

    if (deleteError) {
        console.error("[Streams API] Error deleting stream:", deleteError);
        return NextResponse.json(
            { error: "Failed to delete stream" },
            { status: 500 }
        );
    }

    return NextResponse.json({ success: true });
}





