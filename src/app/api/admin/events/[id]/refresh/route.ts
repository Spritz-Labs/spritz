import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

async function verifyAdmin(
    request: NextRequest,
): Promise<{ isAdmin: boolean; address: string | null }> {
    const address = request.headers.get("x-admin-address");
    const signature = request.headers.get("x-admin-signature");
    const encodedMessage = request.headers.get("x-admin-message");

    if (!address || !signature || !encodedMessage || !supabase) {
        return { isAdmin: false, address: null };
    }

    const normalizedAddress = address.toLowerCase();
    const { data: admin } = await supabase
        .from("shout_admins")
        .select("wallet_address")
        .eq("wallet_address", normalizedAddress)
        .single();

    return { isAdmin: !!admin, address: normalizedAddress };
}

/**
 * POST /api/admin/events/[id]/refresh
 * Re-scrape the event's source URL (source_url or event_url) and update this event.
 * Admin only. Forwards to the scrape API with refresh_event_id.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const { data: event, error: fetchErr } = await supabase
        .from("shout_events")
        .select("id, name, source_url, event_url, status")
        .eq("id", id)
        .single();

    if (fetchErr || !event) {
        return NextResponse.json(
            { error: "Event not found", id },
            { status: 404 },
        );
    }

    const url = event.source_url || event.event_url || null;
    if (!url || typeof url !== "string") {
        return NextResponse.json(
            {
                error: "No URL to refresh from",
                hint: "Event needs source_url or event_url (e.g. from a scrape).",
            },
            { status: 400 },
        );
    }

    const origin =
        request.nextUrl?.origin ||
        (request.headers.get("x-forwarded-host")
            ? `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("x-forwarded-host")}`
            : new URL(request.url).origin);

    const scrapeUrl = `${origin}/api/admin/events/scrape`;
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-admin-address": request.headers.get("x-admin-address") || "",
        "x-admin-signature": request.headers.get("x-admin-signature") || "",
        "x-admin-message": request.headers.get("x-admin-message") || "",
    };
    const cookie = request.headers.get("cookie");
    if (cookie) headers["cookie"] = cookie;

    try {
        const res = await fetch(scrapeUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                url,
                refresh_event_id: id,
            }),
        });
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.status });
    } catch (err) {
        console.error("[Event Refresh] Scrape request failed:", err);
        return NextResponse.json(
            {
                error: "Refresh failed",
                details: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
        );
    }
}
