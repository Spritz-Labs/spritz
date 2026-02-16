import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { terminateLivepeerStream } from "@/lib/livepeer";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/streams/[id]/end
 * 
 * Lightweight endpoint to end a stream. Designed to work with
 * navigator.sendBeacon() for reliable cleanup when the user closes
 * the tab/app. Only requires userAddress in the body.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        let userAddress: string | undefined;

        // sendBeacon sends with Content-Type: text/plain when using Blob
        // or application/json -- handle both
        try {
            const text = await request.text();
            if (text) {
                const body = JSON.parse(text);
                userAddress = body.userAddress;
            }
        } catch {
            // Ignore parse errors for beacon requests
        }

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Verify the stream exists and belongs to this user
        const { data: stream } = await supabase
            .from("shout_streams")
            .select("id, user_address, status, stream_id")
            .eq("id", id)
            .single();

        if (!stream) {
            return NextResponse.json({ error: "Stream not found" }, { status: 404 });
        }

        if (stream.user_address !== normalizedAddress) {
            return NextResponse.json({ error: "Not authorized" }, { status: 403 });
        }

        // Only end if still active
        if (stream.status === "live" || stream.status === "idle") {
            // Tell Livepeer to terminate the session so it no longer shows as "active"
            if (stream.stream_id) {
                try {
                    await terminateLivepeerStream(stream.stream_id);
                } catch (e) {
                    console.warn("[Streams API] Error terminating Livepeer stream on beacon/close:", e);
                }
            }

            await supabase
                .from("shout_streams")
                .update({
                    status: "ended",
                    ended_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("id", id);

            console.log(`[Streams API] Stream ${id} ended via beacon/close`);
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[Streams API] Error in end endpoint:", e);
        return NextResponse.json({ error: "Failed to end stream" }, { status: 500 });
    }
}
