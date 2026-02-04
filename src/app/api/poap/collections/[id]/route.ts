import { NextRequest, NextResponse } from "next/server";
import { PoapCompass } from "@poap-xyz/poap-sdk";
import { CollectionsClient } from "@poap-xyz/poap-sdk";

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
 * GET /api/poap/collections/[id]
 * Get a single POAP collection by ID (includes drop IDs).
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const idNum = parseInt(id, 10);
    if (Number.isNaN(idNum) || idNum < 1) {
        return NextResponse.json({ error: "Invalid collection ID" }, { status: 400 });
    }

    const client = getCollectionsClient();
    if (!client) {
        return NextResponse.json(
            { error: "POAP integration not configured" },
            { status: 200 }
        );
    }

    try {
        const collection = await client.get(idNum);
        if (!collection) {
            return NextResponse.json({ error: "Collection not found" }, { status: 404 });
        }
        let dropIds: number[] = [];
        try {
            dropIds = collection.dropIds ?? [];
        } catch {
            // dropIds only available when fetched with get()
        }
        return NextResponse.json({
            id: collection.id,
            title: collection.title,
            description: collection.description ?? null,
            logoImageUrl: collection.logoImageUrl ?? null,
            bannerImageUrl: collection.bannerImageUrl ?? null,
            dropsCount: collection.dropsCount,
            year: collection.year ?? null,
            dropIds,
        });
    } catch (e) {
        console.error("[POAP Collections] Error:", e);
        return NextResponse.json(
            { error: "Failed to fetch collection" },
            { status: 500 }
        );
    }
}
