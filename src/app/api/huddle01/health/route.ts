import { NextResponse } from "next/server";

const CREATE_ROOM_URL = "https://api.huddle01.com/api/v2/sdk/rooms/create-room";

/**
 * GET /api/huddle01/health — lightweight checks (no real API key used, no rooms created).
 * Use for ops: confirms Huddle01 upstream is reachable and Spritz has server env set.
 */
export async function GET() {
    const serverKeyConfigured = !!process.env.HUDDLE01_API_KEY?.trim();
    const publicProjectIdConfigured =
        !!process.env.NEXT_PUBLIC_HUDDLE01_PROJECT_ID?.trim();

    let upstream: "ok" | "error" | "unreachable" = "unreachable";
    let upstreamDetail: string | undefined;

    try {
        const res = await fetch(CREATE_ROOM_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": "spritz-health-probe-invalid-key",
            },
            body: JSON.stringify({
                roomLocked: false,
                metadata: { title: "probe" },
            }),
            signal: AbortSignal.timeout(8000),
        });
        const text = await res.text();
        if (res.status === 401) {
            upstream = "ok";
            upstreamDetail = "create-room returned 401 (expected for probe key)";
        } else {
            upstream = "error";
            upstreamDetail = `create-room HTTP ${res.status}: ${text.slice(0, 200)}`;
        }
    } catch (e) {
        upstream = "unreachable";
        upstreamDetail = e instanceof Error ? e.message : String(e);
    }

    const healthy =
        upstream === "ok" && serverKeyConfigured && publicProjectIdConfigured;

    return NextResponse.json(
        {
            ok: healthy,
            upstream,
            upstreamDetail,
            serverKeyConfigured,
            publicProjectIdConfigured,
        },
        { status: healthy ? 200 : 503 }
    );
}
