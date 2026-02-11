import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAddress } from "viem";
import { resolveToAddress } from "@/lib/ensResolution";

const POAP_API_BASE = "https://api.poap.tech";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function parsePoapList(data: unknown): boolean {
    if (Array.isArray(data)) return data.length > 0;
    if (data && typeof data === "object") {
        const obj = data as Record<string, unknown>;
        let list = obj.tokens ?? obj.poaps;
        if (Array.isArray(list)) return list.length > 0;
        if (obj.token != null) list = [obj.token];
        else if (obj.event != null || obj.eventId != null) list = [obj];
        if (Array.isArray(list)) return list.length > 0;
    }
    return false;
}

async function addressHoldsPoap(
    address: string,
    eventId: number,
    apiKey: string,
): Promise<boolean> {
    const url = `${POAP_API_BASE}/actions/scan/${encodeURIComponent(
        address,
    )}/${eventId}`;
    const res = await fetch(url, {
        headers: { "X-API-Key": apiKey },
        next: { revalidate: 60 },
    });
    if (!res.ok) return false;
    let data: unknown;
    try {
        data = await res.json();
    } catch {
        return false;
    }
    if (parsePoapList(data)) return true;
    // Fallback: full scan - POAP API may return different shape for event-specific endpoint
    const fullUrl = `${POAP_API_BASE}/actions/scan/${encodeURIComponent(
        address,
    )}`;
    const fullRes = await fetch(fullUrl, {
        headers: { "X-API-Key": apiKey },
        next: { revalidate: 60 },
    });
    if (!fullRes.ok) return false;
    try {
        const fullData = (await fullRes.json()) as unknown;
        const list = Array.isArray(fullData)
            ? fullData
            : ((fullData as Record<string, unknown>)?.tokens ??
              (fullData as Record<string, unknown>)?.poaps ??
              []);
        for (const item of Array.isArray(list) ? list : []) {
            const o = item as Record<string, unknown>;
            const ev = o?.event ?? o;
            const eid =
                (ev as { id?: number })?.id ??
                (o as { eventId?: number }).eventId;
            const id =
                typeof eid === "number"
                    ? eid
                    : typeof eid === "string"
                      ? parseInt(eid, 10)
                      : NaN;
            if (!Number.isNaN(id) && id === eventId) return true;
        }
    } catch {
        // ignore
    }
    return false;
}

// POST /api/channels/[id]/join - Join a channel (POAP channels require holding the POAP)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    try {
        const body = await request.json();
        const { userAddress } = body;

        if (!userAddress || typeof userAddress !== "string") {
            return NextResponse.json(
                { error: "User address is required" },
                { status: 400 },
            );
        }

        const normalizedAddress = await resolveToAddress(userAddress);
        if (!normalizedAddress) {
            return NextResponse.json(
                {
                    error: "Invalid address or ENS name. Could not resolve to an Ethereum address.",
                },
                { status: 400 },
            );
        }

        // Check if channel exists and if it's a POAP channel
        // Support both UUID and slug lookups
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        let channel = null;

        if (isUuid) {
            const { data } = await supabase
                .from("shout_public_channels")
                .select("id, name, poap_event_id, poap_collection_id, access_level")
                .eq("id", id)
                .eq("is_active", true)
                .single();
            channel = data;
        } else {
            // Slug lookup
            const { data } = await supabase
                .from("shout_public_channels")
                .select("id, name, poap_event_id, poap_collection_id, access_level")
                .eq("slug", id.toLowerCase())
                .eq("is_active", true)
                .single();
            channel = data;
        }

        if (!channel) {
            return NextResponse.json(
                { error: "Channel not found" },
                { status: 404 },
            );
        }

        // Staff-only channel access check
        if (channel.access_level === "staff") {
            // Check if user is admin
            const { data: adminData } = await supabase
                .from("shout_admins")
                .select("id")
                .eq("wallet_address", normalizedAddress)
                .maybeSingle();

            if (!adminData) {
                // Check if user is a global moderator
                const { data: modData } = await supabase
                    .from("shout_moderators")
                    .select("id")
                    .eq("user_address", normalizedAddress)
                    .is("channel_id", null)
                    .maybeSingle();

                if (!modData) {
                    return NextResponse.json(
                        { error: "This channel is for staff only" },
                        { status: 403 },
                    );
                }
            }
        }

        const poapEventId =
            channel.poap_event_id != null &&
            typeof channel.poap_event_id === "number" &&
            !Number.isNaN(channel.poap_event_id)
                ? channel.poap_event_id
                : null;
        const poapCollectionId =
            channel.poap_collection_id != null &&
            typeof channel.poap_collection_id === "number" &&
            !Number.isNaN(channel.poap_collection_id)
                ? channel.poap_collection_id
                : null;

        if (poapEventId !== null) {
            const apiKey = process.env.POAP_API_KEY;
            if (!apiKey) {
                return NextResponse.json(
                    {
                        error: "POAP verification is not configured. You need this POAP to join this channel.",
                    },
                    { status: 403 },
                );
            }

            // Addresses to try with POAP API: resolved 0x, checksummed 0x, and original (e.g. ENS) since API accepts ENS
            const addressesToCheck: string[] = [normalizedAddress];
            const lookupKeys = [normalizedAddress];
            const originalTrimmed =
                typeof userAddress === "string"
                    ? userAddress.trim().toLowerCase()
                    : "";
            if (
                originalTrimmed &&
                originalTrimmed !== normalizedAddress &&
                !addressesToCheck.includes(originalTrimmed)
            ) {
                lookupKeys.push(originalTrimmed);
                addressesToCheck.push(originalTrimmed);
            }
            let userRow: { smart_wallet_address: string | null } | null = null;
            for (const key of lookupKeys) {
                const { data } = await supabase
                    .from("shout_users")
                    .select("smart_wallet_address")
                    .eq("wallet_address", key)
                    .maybeSingle();
                if (data) {
                    userRow = data;
                    break;
                }
            }
            if (
                userRow?.smart_wallet_address &&
                userRow.smart_wallet_address.toLowerCase() !== normalizedAddress
            ) {
                const smart = userRow.smart_wallet_address.toLowerCase();
                if (!addressesToCheck.includes(smart)) {
                    addressesToCheck.push(smart);
                }
            }

            // Try POAP API with each identifier (0x lowercase, 0x checksummed, ENS name)

            let hasPoap = false;
            for (const addr of addressesToCheck) {
                const holds =
                    (await addressHoldsPoap(addr, poapEventId, apiKey)) ||
                    (addr.startsWith("0x") &&
                        addr.length === 42 &&
                        (await addressHoldsPoap(
                            getAddress(addr as `0x${string}`),
                            poapEventId,
                            apiKey,
                        )));
                if (holds) {
                    hasPoap = true;
                    break;
                }
            }

            if (!hasPoap) {
                return NextResponse.json(
                    {
                        error: "You need this POAP to join this channel. Hold the POAP in your wallet to join.",
                    },
                    { status: 403 },
                );
            }
        }

        // POAP collection channel: user must hold at least one POAP in the collection
        if (poapCollectionId !== null) {
            const apiKey = process.env.POAP_API_KEY;
            if (!apiKey) {
                return NextResponse.json(
                    {
                        error: "POAP verification is not configured. You need a POAP from this collection to join.",
                    },
                    { status: 403 },
                );
            }
            const { PoapCompass } = await import("@poap-xyz/poap-sdk");
            const { CollectionsClient } = await import("@poap-xyz/poap-sdk");
            const compass = new PoapCompass({ apiKey });
            const collectionsClient = new CollectionsClient(compass);
            const collection = await collectionsClient.get(poapCollectionId);
            if (!collection) {
                return NextResponse.json(
                    { error: "Collection not found" },
                    { status: 500 },
                );
            }
            let dropIds: number[] = [];
            try {
                dropIds = collection.dropIds ?? [];
            } catch {
                // dropIds only when fetched with get()
            }
            const addressesToCheckCol: string[] = [normalizedAddress];
            const originalTrimmed =
                typeof userAddress === "string"
                    ? userAddress.trim().toLowerCase()
                    : "";
            if (
                originalTrimmed &&
                originalTrimmed !== normalizedAddress &&
                !addressesToCheckCol.includes(originalTrimmed)
            ) {
                addressesToCheckCol.push(originalTrimmed);
            }
            let userRow: { smart_wallet_address: string | null } | null = null;
            const { data: userData } = await supabase
                .from("shout_users")
                .select("smart_wallet_address")
                .eq("wallet_address", normalizedAddress)
                .maybeSingle();
            userRow = userData;
            if (
                userRow?.smart_wallet_address &&
                userRow.smart_wallet_address.toLowerCase() !== normalizedAddress
            ) {
                const smart = userRow.smart_wallet_address.toLowerCase();
                if (!addressesToCheckCol.includes(smart)) {
                    addressesToCheckCol.push(smart);
                }
            }
            const userEventIds = new Set<number>();
            for (const addr of addressesToCheckCol) {
                const scanUrl = `${POAP_API_BASE}/actions/scan/${encodeURIComponent(
                    addr,
                )}`;
                const scanRes = await fetch(scanUrl, {
                    headers: { "X-API-Key": apiKey },
                    next: { revalidate: 60 },
                });
                if (!scanRes.ok) continue;
                const rawList = await scanRes.json();
                const list = Array.isArray(rawList)
                    ? rawList
                    : (rawList?.tokens ?? rawList?.poaps ?? []);
                for (const item of list) {
                    const event = item?.event ?? item;
                    const eventId =
                        typeof event?.id === "number"
                            ? event.id
                            : typeof event?.id === "string"
                              ? parseInt(event.id, 10)
                              : null;
                    if (eventId != null && !Number.isNaN(eventId)) {
                        userEventIds.add(eventId);
                    }
                }
            }
            const hasOverlap = dropIds.some((d) => userEventIds.has(d));
            if (!hasOverlap) {
                return NextResponse.json(
                    {
                        error: "You need at least one POAP from this collection to join. Hold a POAP in the collection in your wallet to join.",
                    },
                    { status: 403 },
                );
            }
        }

        // Check if already a member (by resolved address or by original ENS/address)
        const memberKeys = [normalizedAddress];
        if (
            typeof userAddress === "string" &&
            userAddress.trim().toLowerCase() !== normalizedAddress
        ) {
            memberKeys.push(userAddress.trim().toLowerCase());
        }
        let existing: { id: string } | null = null;
        for (const key of memberKeys) {
            const { data } = await supabase
                .from("shout_channel_members")
                .select("id")
                .eq("channel_id", id)
                .eq("user_address", key)
                .maybeSingle();
            if (data) {
                existing = data;
                break;
            }
        }

        if (existing) {
            return NextResponse.json(
                { error: "Already a member of this channel" },
                { status: 400 },
            );
        }

        // Join the channel
        const { error: joinError } = await supabase
            .from("shout_channel_members")
            .insert({
                channel_id: id,
                user_address: normalizedAddress,
            });

        if (joinError) {
            console.error("[Channels API] Error joining channel:", joinError);
            return NextResponse.json(
                { error: "Failed to join channel" },
                { status: 500 },
            );
        }

        // Increment member count
        await supabase.rpc("increment_channel_members", { channel_uuid: id });

        return NextResponse.json({ success: true, channelName: channel.name });
    } catch (e) {
        console.error("[Channels API] Error:", e);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 },
        );
    }
}
