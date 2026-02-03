import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const POAP_API_BASE = "https://api.poap.tech";

function parsePoapDate(obj: unknown): number | null {
    if (!obj || typeof obj !== "object") return null;
    const o = obj as Record<string, unknown>;
    const raw =
        o.created_at ??
        o.createdAt ??
        o.claimed ??
        o.claimed_at ??
        o.claimedAt ??
        o.created;
    if (raw == null) return null;
    if (typeof raw === "number" && !Number.isNaN(raw)) {
        return raw > 1e12 ? raw : raw * 1000;
    }
    if (typeof raw === "string") {
        const t = Date.parse(raw);
        return Number.isNaN(t) ? null : t;
    }
    return null;
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type PoapEventWithChannel = {
    eventId: number;
    eventName: string;
    imageUrl: string | null;
    /** Full channel if one exists for this POAP event; null if not yet created */
    channel:
        | (Record<string, unknown> & { id: string; is_member?: boolean })
        | null;
};

/**
 * GET /api/poap/events-with-channels?address=0x...  (single)
 *   or ?addresses=0x1,0x2  (multiple: e.g. Smart Wallet + identity; POAPs merged, deduped)
 * Optional: &memberAddress=0x...  for is_member lookup (default: first address)
 * Returns user's POAP events (deduplicated) with channel status.
 */
export async function GET(request: NextRequest) {
    const addressParam = request.nextUrl.searchParams.get("address");
    const addressesParam = request.nextUrl.searchParams.get("addresses");
    const memberAddressParam =
        request.nextUrl.searchParams.get("memberAddress");

    const rawAddresses: string[] = addressesParam
        ? addressesParam
              .split(",")
              .map((a) => a.trim())
              .filter(Boolean)
        : addressParam?.trim()
        ? [addressParam.trim()]
        : [];
    if (rawAddresses.length === 0) {
        return NextResponse.json(
            { error: "address or addresses query parameter is required" },
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

    const memberAddress = (
        memberAddressParam?.trim() || rawAddresses[0]
    ).toLowerCase();

    try {
        const seen = new Map<
            number,
            {
                eventName: string;
                imageUrl: string | null;
                createdAt: number | null;
            }
        >();

        for (const addr of rawAddresses) {
            const scanUrl = `${POAP_API_BASE}/actions/scan/${encodeURIComponent(
                addr
            )}`;
            const scanRes = await fetch(scanUrl, {
                headers: { "X-API-Key": apiKey },
                next: { revalidate: 300 },
            });

            if (!scanRes.ok) {
                console.error(
                    "[POAP] Scan failed for",
                    addr.slice(0, 10) + "...",
                    scanRes.status
                );
                continue;
            }

            const rawList = await scanRes.json();
            const list = Array.isArray(rawList)
                ? rawList
                : rawList?.tokens ?? rawList?.poaps ?? [];

            for (const item of list) {
                const event = item?.event ?? item;
                const eventId =
                    typeof event?.id === "number"
                        ? event.id
                        : typeof event?.id === "string"
                        ? parseInt(event.id, 10)
                        : null;
                if (
                    eventId == null ||
                    Number.isNaN(eventId) ||
                    seen.has(eventId)
                )
                    continue;
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
                const createdAt =
                    parsePoapDate(item) ?? parsePoapDate(event) ?? null;
                seen.set(eventId, {
                    eventName: eventName || `Event ${eventId}`,
                    imageUrl,
                    createdAt,
                });
            }
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

        // 3) User's memberships for is_member (use identity address, not Smart Wallet)
        const { data: memberships } = await supabase
            .from("shout_channel_members")
            .select("channel_id")
            .eq("user_address", memberAddress);
        const memberSet = new Set((memberships ?? []).map((m) => m.channel_id));

        const channelByEventId = new Map(
            (channels ?? []).map((c) => [
                c.poap_event_id,
                { ...c, is_member: memberSet.has(c.id) },
            ])
        );

        const eventsList: PoapEventWithChannel[] = eventIds
            .sort((a, b) => {
                const sa = seen.get(a)!;
                const sb = seen.get(b)!;
                const ta = sa.createdAt ?? 0;
                const tb = sb.createdAt ?? 0;
                if (ta !== tb) return tb - ta;
                return b - a;
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
