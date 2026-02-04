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
 * GET /api/poap/collections?offset=0&limit=20&query=...
 * List or search POAP collections (paginated).
 * query = search term; omit to list all.
 */
export async function GET(request: NextRequest) {
    const client = getCollectionsClient();
    if (!client) {
        return NextResponse.json(
            { error: "POAP integration not configured", collections: [], nextCursor: null },
            { status: 200 }
        );
    }

    const { searchParams } = new URL(request.url);
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const query = searchParams.get("query")?.trim() ?? "";

    try {
        if (query) {
            const result = await client.search({
                query,
                offset,
                limit,
            });
            const items = result.items.map((c) => ({
                id: c.id,
                title: c.title,
                description: c.description ?? null,
                logoImageUrl: c.logoImageUrl ?? null,
                bannerImageUrl: c.bannerImageUrl ?? null,
                dropsCount: c.dropsCount,
                year: c.year ?? null,
            }));
            return NextResponse.json({
                collections: items,
                nextCursor: result.nextCursor,
            });
        }
        const result = await client.list({
            offset,
            limit,
        });
        const items = result.items.map((c) => ({
            id: c.id,
            title: c.title,
            description: c.description ?? null,
            logoImageUrl: c.logoImageUrl ?? null,
            bannerImageUrl: c.bannerImageUrl ?? null,
            dropsCount: c.dropsCount,
            year: c.year ?? null,
        }));
        return NextResponse.json({
            collections: items,
            nextCursor: result.nextCursor,
        });
    } catch (e) {
        console.error("[POAP Collections] Error:", e);
        return NextResponse.json(
            { error: "Failed to fetch collections", collections: [], nextCursor: null },
            { status: 200 }
        );
    }
}
