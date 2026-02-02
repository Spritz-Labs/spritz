import { NextRequest, NextResponse } from "next/server";

const POAP_API_BASE = "https://api.poap.tech";

/** POAP from scan response - shape may vary; we normalize to this */
export type PoapScanItem = {
    event: { id: number; name: string };
    image_url?: string;
    tokenId?: string;
};

/** Deduplicated POAP event (one per event id) for channel creation */
export type PoapEventForChannel = {
    eventId: number;
    eventName: string;
    imageUrl: string | null;
};

/**
 * GET /api/poap/scan?address=0x...
 * Fetches user's POAP collection via POAP API (server-side, API key in env).
 * Returns deduplicated events (one entry per POAP event) for "create/join POAP channel" UX.
 * Requires POAP_API_KEY in env. See: https://documentation.poap.tech/docs/getting-started
 */
export async function GET(request: NextRequest) {
    const address = request.nextUrl.searchParams.get("address");
    if (!address?.trim()) {
        return NextResponse.json(
            { error: "address query parameter is required" },
            { status: 400 }
        );
    }

    const apiKey = process.env.POAP_API_KEY;
    if (!apiKey) {
        console.warn("[POAP] POAP_API_KEY not set; POAP channels feature disabled");
        return NextResponse.json(
            { error: "POAP integration not configured", events: [] },
            { status: 200 }
        );
    }

    try {
        const url = `${POAP_API_BASE}/actions/scan/${encodeURIComponent(address.trim())}`;
        const res = await fetch(url, {
            headers: { "X-API-Key": apiKey },
            next: { revalidate: 300 },
        });

        if (!res.ok) {
            const text = await res.text();
            console.error("[POAP] Scan failed:", res.status, text);
            return NextResponse.json(
                { error: "Failed to fetch POAPs", events: [] },
                { status: 200 }
            );
        }

        const data = await res.json();
        // API returns array of POAPs; each may have event: { id, name }, image_url, etc.
        const rawList = Array.isArray(data) ? data : data?.tokens ?? data?.poaps ?? [];
        const seen = new Map<number, PoapEventForChannel>();

        for (const item of rawList) {
            const event = item?.event ?? item;
            const eventId =
                typeof event?.id === "number"
                    ? event.id
                    : typeof event?.id === "string"
                      ? parseInt(event.id, 10)
                      : null;
            if (eventId == null || Number.isNaN(eventId)) continue;
            if (seen.has(eventId)) continue;

            const eventName =
                typeof event?.name === "string"
                    ? event.name
                    : event?.event_name ?? `POAP #${eventId}`;
            const imageUrl =
                typeof item?.image_url === "string"
                    ? item.image_url
                    : typeof event?.image_url === "string"
                      ? event.image_url
                      : null;

            seen.set(eventId, {
                eventId,
                eventName: eventName.trim() || `Event ${eventId}`,
                imageUrl: imageUrl || null,
            });
        }

        const events = Array.from(seen.values()).sort(
            (a, b) => a.eventName.localeCompare(b.eventName)
        );

        return NextResponse.json({ events });
    } catch (e) {
        console.error("[POAP] Error:", e);
        return NextResponse.json(
            { error: "Failed to fetch POAPs", events: [] },
            { status: 200 }
        );
    }
}
