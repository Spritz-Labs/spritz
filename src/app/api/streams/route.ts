import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createLivepeerStream, getLivepeerStream, getPlaybackUrl } from "@/lib/livepeer";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        db: {
            schema: "public",
        },
        global: {
            fetch: (url, options = {}) => {
                return fetch(url, {
                    ...options,
                    // Add timeout to prevent hanging requests
                    signal: AbortSignal.timeout(15000), // 15 second timeout
                });
            },
        },
    }
);

export type Stream = {
    id: string;
    user_address: string;
    stream_id: string;
    stream_key: string | null;
    playback_id: string | null;
    title: string | null;
    description: string | null;
    status: "idle" | "live" | "ended";
    viewer_count: number;
    started_at: string | null;
    ended_at: string | null;
    created_at: string;
    playback_url?: string;
};

// GET /api/streams - Get live streams or user's streams
export async function GET(request: NextRequest) {
    const userAddress = request.nextUrl.searchParams.get("userAddress");
    const liveOnly = request.nextUrl.searchParams.get("live") === "true";
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");

    let query = supabase
        .from("shout_streams")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

    if (userAddress) {
        query = query.eq("user_address", userAddress.toLowerCase());
    }

    if (liveOnly) {
        query = query.eq("status", "live");
    }

    let streams, error;
    try {
        // Add timeout wrapper for the query
        const queryPromise = query;
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Query timeout after 10 seconds")), 10000)
        );
        
        const result = await Promise.race([queryPromise, timeoutPromise]);
        streams = result.data;
        error = result.error;
    } catch (timeoutError) {
        console.error("[Streams API] Query timeout or error:", timeoutError);
        // Return empty array on timeout rather than failing completely
        streams = [];
        error = null;
    }

    if (error) {
        console.error("[Streams API] Error fetching streams:", {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
        });
        // Return empty array on error to prevent complete failure
        streams = [];
    }

    // For live streams, verify with Livepeer that they're actually broadcasting
    // But give a grace period for newly-started streams (WebRTC takes time to connect)
    let filteredStreams = streams || [];
    
    if (liveOnly && filteredStreams.length > 0) {
        const GRACE_PERIOD_MS = 60000; // 60 seconds grace period for new streams
        const now = Date.now();
        
        // Add timeout to Livepeer verification to prevent hanging
        const verifiedStreams = await Promise.allSettled(
            filteredStreams.map(async (stream) => {
                // Check if stream started recently (within grace period)
                const startedAt = stream.started_at ? new Date(stream.started_at).getTime() : 0;
                const isNewStream = (now - startedAt) < GRACE_PERIOD_MS;
                
                // For new streams, show them even if not yet active (broadcaster is connecting)
                if (isNewStream) {
                    return stream;
                }
                
                // For older streams, verify they're actually active (with timeout)
                if (stream.stream_id) {
                    try {
                        const livepeerStream = await Promise.race([
                            getLivepeerStream(stream.stream_id),
                            new Promise<null>((_, reject) =>
                                setTimeout(() => reject(new Error("Livepeer timeout")), 5000)
                            ),
                        ]);
                        if (livepeerStream?.isActive) {
                            return stream;
                        }
                    } catch (livepeerError) {
                        // If Livepeer check fails/times out, include the stream anyway
                        // Better to show potentially inactive streams than fail completely
                        console.warn(`[Streams API] Livepeer check failed for stream ${stream.id}:`, livepeerError);
                        return stream;
                    }
                }
                return null;
            })
        );
        
        // Filter out failed promises and null values
        filteredStreams = verifiedStreams
            .filter((result) => result.status === "fulfilled" && result.value !== null)
            .map((result) => (result as PromiseFulfilledResult<NonNullable<typeof streams>[number]>).value);
    }

    // Add playback URLs
    const streamsWithUrls = filteredStreams.map((stream) => ({
        ...stream,
        playback_url: stream.playback_id ? getPlaybackUrl(stream.playback_id) : null,
    }));

    return NextResponse.json({ streams: streamsWithUrls || [] });
}

// POST /api/streams - Create a new stream
export async function POST(request: NextRequest) {
    try {
        let body;
        try {
            const text = await request.text();
            if (!text) {
                return NextResponse.json(
                    { error: "Request body is required" },
                    { status: 400 }
                );
            }
            body = JSON.parse(text);
        } catch {
            return NextResponse.json(
                { error: "Invalid JSON in request body" },
                { status: 400 }
            );
        }
        const { userAddress, title, description } = body;

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address is required" },
                { status: 400 }
            );
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Check if user already has an active stream
        const { data: existingStream } = await supabase
            .from("shout_streams")
            .select("*")
            .eq("user_address", normalizedAddress)
            .in("status", ["idle", "live"])
            .single();

        if (existingStream) {
            // Check if the stream is stale (created more than 1 hour ago and still "idle")
            const createdAt = new Date(existingStream.created_at).getTime();
            const oneHourAgo = Date.now() - 60 * 60 * 1000;
            
            if (existingStream.status === "idle" && createdAt < oneHourAgo) {
                // Auto-end stale idle streams
                await supabase
                    .from("shout_streams")
                    .update({ status: "ended", ended_at: new Date().toISOString() })
                    .eq("id", existingStream.id);
                // Continue to create a new stream
            } else {
                // Return the existing stream so user can continue
                return NextResponse.json({
                    stream: {
                        ...existingStream,
                        playback_url: existingStream.playback_id 
                            ? getPlaybackUrl(existingStream.playback_id) 
                            : null,
                    },
                    existing: true, // Flag to indicate this is an existing stream
                });
            }
        }

        // Create stream on Livepeer
        const streamName = `${normalizedAddress}-${Date.now()}`;
        const livepeerStream = await createLivepeerStream(streamName);

        if (!livepeerStream) {
            return NextResponse.json(
                { error: "Failed to create stream on Livepeer" },
                { status: 500 }
            );
        }

        // Save stream to database
        const { data: stream, error } = await supabase
            .from("shout_streams")
            .insert({
                user_address: normalizedAddress,
                stream_id: livepeerStream.id,
                stream_key: livepeerStream.streamKey,
                playback_id: livepeerStream.playbackId,
                title: title?.trim() || null,
                description: description?.trim() || null,
                status: "idle",
            })
            .select()
            .single();

        if (error) {
            console.error("[Streams API] Error saving stream:", error);
            return NextResponse.json(
                { error: "Failed to save stream" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            stream: {
                ...stream,
                rtmp_url: livepeerStream.rtmpIngestUrl,
                playback_url: getPlaybackUrl(livepeerStream.playbackId),
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

