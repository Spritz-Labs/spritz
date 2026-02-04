import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMembershipLookupAddresses } from "@/lib/ensResolution";
import { PoapCompass } from "@poap-xyz/poap-sdk";
import { CollectionsClient } from "@poap-xyz/poap-sdk";

const POAP_API_BASE = "https://api.poap.tech";
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type PoapCollectionForUser = {
    id: number;
    title: string;
    description: string | null;
    logoImageUrl: string | null;
    bannerImageUrl: string | null;
    dropsCount: number;
    year: number | null;
    /** User holds at least one POAP in this collection */
    canJoin: true;
    /** Existing channel linked to this collection, if any */
    channel:
        | (Record<string, unknown> & { id: string; is_member?: boolean })
        | null;
};

function getCollectionsClient(): CollectionsClient | null {
    const apiKey = process.env.POAP_API_KEY;
    if (!apiKey) return null;
    try {
        const compass = new PoapCompass({ apiKey });
        return new CollectionsClient(compass);
    } catch {
        return null;
    }
}

/**
 * GET /api/poap/collections-for-user?addresses=0x1,0x2&memberAddress=0x...
 * Returns POAP collections where the user holds at least one POAP (event id in collection's drops).
 * Includes linked channel if one exists (poap_collection_id).
 */
export async function GET(request: NextRequest) {
    const addressesParam = request.nextUrl.searchParams.get("addresses");
    const addressParam = request.nextUrl.searchParams.get("address");
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
            { error: "POAP integration not configured", collections: [] },
            { status: 200 }
        );
    }

    const memberAddress = (
        memberAddressParam?.trim() || rawAddresses[0]
    ).toLowerCase();
    const client = getCollectionsClient();
    if (!client) {
        return NextResponse.json(
            { error: "POAP integration not configured", collections: [] },
            { status: 200 }
        );
    }

    try {
        // 1) Get user's POAP event IDs (scan) — parse all common response shapes so we don't miss any
        const userEventIds = new Set<number>();
        for (const addr of rawAddresses) {
            const scanUrl = `${POAP_API_BASE}/actions/scan/${encodeURIComponent(
                addr
            )}`;
            const scanRes = await fetch(scanUrl, {
                headers: { "X-API-Key": apiKey },
                next: { revalidate: 300 },
            });
            if (!scanRes.ok) continue;
            const rawList = await scanRes.json();
            const list = Array.isArray(rawList)
                ? rawList
                : rawList?.tokens ?? rawList?.poaps ?? [];
            for (const item of list) {
                const event = item?.event ?? item;
                // Support multiple API shapes: event.id, event_id, eventId, drop_id
                const rawId =
                    event?.id ??
                    (
                        item as {
                            event_id?: number;
                            eventId?: number;
                            drop_id?: number;
                        }
                    )?.event_id ??
                    (
                        item as {
                            event_id?: number;
                            eventId?: number;
                            drop_id?: number;
                        }
                    )?.eventId ??
                    (
                        item as {
                            event_id?: number;
                            eventId?: number;
                            drop_id?: number;
                        }
                    )?.drop_id;
                const eventId =
                    typeof rawId === "number"
                        ? rawId
                        : typeof rawId === "string"
                        ? parseInt(rawId, 10)
                        : null;
                if (eventId != null && !Number.isNaN(eventId))
                    userEventIds.add(eventId);
            }
        }

        if (userEventIds.size === 0) {
            return NextResponse.json({ collections: [] });
        }

        // 2) List collections with pagination; for each page get(id) to get dropIds, filter by user event overlap.
        // Double coverage: 200 pages = up to 6000 collections so "Collections you can join" is complete.
        const allMatching: {
            id: number;
            title: string;
            description: string | null;
            logoImageUrl: string | null;
            bannerImageUrl: string;
            dropsCount: number;
            year: number | null;
        }[] = [];
        const pageSize = 30;
        const maxPages = 200;
        let offset = 0;
        let page = 0;

        while (page < maxPages) {
            const result = await client.list({ offset, limit: pageSize });
            if (result.items.length === 0) break;
            const batch = await Promise.all(
                result.items.map((c) => client.get(c.id))
            );
            for (const col of batch) {
                if (!col) continue;
                let dropIds: unknown[] = [];
                try {
                    dropIds = col.dropIds ?? [];
                } catch {
                    // dropIds only when fetched with get()
                }
                // Normalize drop IDs (API may return numbers or strings) and check overlap
                const hasOverlap = dropIds.some((d) => {
                    const id =
                        typeof d === "number" ? d : parseInt(String(d), 10);
                    return !Number.isNaN(id) && userEventIds.has(id);
                });
                if (hasOverlap) {
                    allMatching.push({
                        id: col.id,
                        title: col.title,
                        description: col.description ?? null,
                        logoImageUrl: col.logoImageUrl ?? null,
                        bannerImageUrl: col.bannerImageUrl ?? "",
                        dropsCount: col.dropsCount,
                        year: col.year ?? null,
                    });
                }
            }
            offset += pageSize;
            page++;
            if (result.nextCursor == null) break;
        }

        if (allMatching.length === 0) {
            return NextResponse.json({ collections: [] });
        }

        const collectionIds = allMatching.map((c) => c.id);
        const { data: channels } = await supabase
            .from("shout_public_channels")
            .select("*")
            .eq("is_active", true)
            .in("poap_collection_id", collectionIds);

        const lookupAddrs = await getMembershipLookupAddresses(memberAddress);
        const { data: memberships } =
            lookupAddrs.length > 0
                ? await supabase
                      .from("shout_channel_members")
                      .select("channel_id")
                      .in("user_address", lookupAddrs)
                : { data: [] };
        const memberSet = new Set((memberships ?? []).map((m) => m.channel_id));

        const channelByCollectionId = new Map(
            (channels ?? []).map((c) => [
                c.poap_collection_id,
                { ...c, is_member: memberSet.has(c.id) },
            ])
        );

        const collections: PoapCollectionForUser[] = allMatching.map((col) => ({
            ...col,
            canJoin: true as const,
            channel: channelByCollectionId.get(col.id) ?? null,
        }));

        return NextResponse.json({ collections });
    } catch (e) {
        console.error("[POAP Collections-for-user] Error:", e);
        return NextResponse.json(
            { error: "Failed to fetch collections", collections: [] },
            { status: 200 }
        );
    }
}
