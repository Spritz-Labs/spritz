import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getLivepeerStreamAssets, getLivepeerAsset } from "@/lib/livepeer";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type StreamAsset = {
    id: string;
    stream_id: string;
    user_address: string;
    asset_id: string;
    playback_id: string | null;
    playback_url: string | null;
    download_url: string | null;
    duration_seconds: number | null;
    size_bytes: number | null;
    status: "processing" | "ready" | "failed";
    thumbnail_url: string | null;
    created_at: string;
};

// GET /api/streams/[id]/assets - Get stream assets (recordings)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";

    // Get stream
    const { data: stream, error: streamError } = await supabase
        .from("shout_streams")
        .select("stream_id, user_address")
        .eq("id", id)
        .single();

    if (streamError || !stream) {
        return NextResponse.json(
            { error: "Stream not found" },
            { status: 404 }
        );
    }

    // If refresh requested, fetch from Livepeer and update database
    if (refresh && stream.stream_id) {
        const livepeerAssets = await getLivepeerStreamAssets(stream.stream_id);
        
        for (const asset of livepeerAssets) {
            await supabase.from("shout_stream_assets").upsert({
                stream_id: id,
                user_address: stream.user_address,
                asset_id: asset.id,
                playback_id: asset.playbackId,
                playback_url: asset.playbackUrl,
                download_url: asset.downloadUrl,
                duration_seconds: asset.videoSpec?.duration,
                size_bytes: asset.size,
                status: asset.status.phase === "ready" ? "ready" : 
                        asset.status.phase === "failed" ? "failed" : "processing",
            }, { onConflict: "asset_id" });
        }
    }

    // Get assets from database
    const { data: assets, error: assetsError } = await supabase
        .from("shout_stream_assets")
        .select("*")
        .eq("stream_id", id)
        .order("created_at", { ascending: false });

    if (assetsError) {
        console.error("[Streams API] Error fetching assets:", assetsError);
        return NextResponse.json(
            { error: "Failed to fetch assets" },
            { status: 500 }
        );
    }

    return NextResponse.json({ assets: assets || [] });
}

// POST /api/streams/[id]/assets/refresh - Refresh asset status from Livepeer
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    // Get stream
    const { data: stream } = await supabase
        .from("shout_streams")
        .select("stream_id, user_address")
        .eq("id", id)
        .single();

    if (!stream?.stream_id) {
        return NextResponse.json(
            { error: "Stream not found" },
            { status: 404 }
        );
    }

    // Fetch assets from Livepeer
    const livepeerAssets = await getLivepeerStreamAssets(stream.stream_id);
    
    const updatedAssets = [];
    for (const asset of livepeerAssets) {
        // Get detailed asset info
        const detailedAsset = await getLivepeerAsset(asset.id);
        
        const { data: savedAsset } = await supabase.from("shout_stream_assets").upsert({
            stream_id: id,
            user_address: stream.user_address,
            asset_id: asset.id,
            playback_id: detailedAsset?.playbackId || asset.playbackId,
            playback_url: detailedAsset?.playbackUrl || asset.playbackUrl,
            download_url: detailedAsset?.downloadUrl || asset.downloadUrl,
            duration_seconds: detailedAsset?.videoSpec?.duration || asset.videoSpec?.duration,
            size_bytes: detailedAsset?.size || asset.size,
            status: (detailedAsset?.status.phase || asset.status.phase) === "ready" ? "ready" : 
                    (detailedAsset?.status.phase || asset.status.phase) === "failed" ? "failed" : "processing",
        }, { onConflict: "asset_id" }).select().single();
        
        if (savedAsset) {
            updatedAssets.push(savedAsset);
        }
    }

    return NextResponse.json({ assets: updatedAssets });
}

