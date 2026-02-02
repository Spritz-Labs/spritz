import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const POAP_API_BASE = "https://api.poap.tech";
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type PoapEventWithChannel = {
    eventId: number;
    eventName: string;
    imageUrl: string | null;
    /** Full channel if one exists for this POAP event; null if not yet created */
    channel: (Record<string, unknown> & { id: string; is_member?: boolean }) | null;
};

/**
 * GET /api/poap/events-with-channels?address=0x...
 * Returns user's POAP events (deduplicated) with channel status: existing channel or null.
 * One request for "From my POAPs" UX in Browse Channels.
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
        return NextResponse.json(
            { error: "POAP integration not configured", events: [] },
            { status: 200 }
        );
    }

    const userAddress = address.trim().toLowerCase();

    try {
        // 1) Fetch user's POAPs from POAP API
        const scanUrl = `${POAP_API_BASE}/actions/scan/${encodeURIComponent(address.trim())}`;
        const scanRes = await fetch(scanUrl, {
            headers: { "X-API-Key": apiKey },
            next: { revalidate: 300 },
        });

        if (!scanRes.ok) {
            console.error("[POAP] Scan failed:", scanRes.status);
            return NextResponse.json(
                { error: "Failed to fetch POAPs", events: [] },
                { status: 200 }
            );
        }

        const rawList = await scanRes.json();
        const list = Array.isArray(rawList) ? rawList : rawList?.tokens ?? rawList?.poaps ?? [];
        const seen = new Map<number, { eventName: string; imageUrl: string | null }>();

        for (const item of list) {
            const event = item?.event ?? item;
            const eventId =
                typeof event?.id === "number"
                    ? event.id
                    : typeof event?.id === "string"
                      ? parseInt(event.id, 10)
                      : null;
            if (eventId == null || Number.isNaN(eventId) || seen.has(eventId)) continue;
            const eventName =
                typeof event?.name === "string"
                    ? event.name.trim()
                    : event?.event_name ?? `Event ${eventId}`;
            const imageUrl =
                typeof item?.image_url === "string"
                    ? item.image_url
                    : typeof event?.image_url === "string"
                      ? event.image_url
                      : null;
            seen.set(eventId, {
                eventName: eventName || `Event ${eventId}`,
                imageUrl,
            });
        }

        const eventIds = Array.from(seen.keys());
        if (eventIds.length === 0) {
            return NextResponse.json({ events: [] });
        }

        // 2) Fetch full channels for these POAP event ids (for Join/Open)
        const { data: channels, error } = await supabase
            .from("shout_public_channels")
            .select("*")
            .eq("is_active", true)
            .in("poap_event_id", eventIds);

        if (error) {
            console.error("[POAP] Channels fetch error:", error);
            return NextResponse.json(
                { error: "Failed to fetch channels", events: [] },
                { status: 200 }
            );
        }

        // 3) User's memberships for is_member
        const { data: memberships } = await supabase
            .from("shout_channel_members")
            .select("channel_id")
            .eq("user_address", userAddress);
        const memberSet = new Set(
            (memberships ?? []).map((m) => m.channel_id)
        );

        const channelByEventId = new Map(
            (channels ?? []).map((c) => [
                c.poap_event_id,
                { ...c, is_member: memberSet.has(c.id) },
            ])
        );

        const eventsList: PoapEventWithChannel[] = eventIds
            .sort((a, b) => {
                const na = seen.get(a)!.eventName;
                const nb = seen.get(b)!.eventName;
                return na.localeCompare(nb);
            })
            .map((eventId) => {
                const { eventName, imageUrl } = seen.get(eventId)!;
                const ch = channelByEventId.get(eventId) ?? null;
                return {
                    eventId,
                    eventName,
                    imageUrl,
                    channel: ch,
                };
            });

        return NextResponse.json({ events: eventsList });
    } catch (e) {
        console.error("[POAP] Error:", e);
        return NextResponse.json(
            { error: "Failed to load POAP channels", events: [] },
            { status: 200 }
        );
    }
}
