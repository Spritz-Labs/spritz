import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/**
 * GET /api/events/attending
 * List events the current user is registered for (registered or checked_in).
 */
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const walletAddress = session.userAddress.toLowerCase();

    try {
        // Get all registrations for this user
        const { data: registrations, error: regError } = await supabase
            .from("shout_event_user_registrations")
            .select("event_id, status, created_at")
            .eq("wallet_address", walletAddress)
            .in("status", ["registered", "checked_in", "waitlisted"])
            .order("created_at", { ascending: false });

        if (regError) {
            console.error("[Events Attending] Reg error:", regError);
            return NextResponse.json(
                { error: "Failed to fetch registrations" },
                { status: 500 },
            );
        }

        if (!registrations || registrations.length === 0) {
            return NextResponse.json({ events: [] });
        }

        const eventIds = registrations.map((r) => r.event_id);

        // Fetch event details
        const { data: events, error: evError } = await supabase
            .from("shout_events")
            .select(
                "id, name, slug, event_type, event_date, start_time, end_date, venue, city, country, banner_image_url, status, is_virtual",
            )
            .in("id", eventIds)
            .eq("status", "published")
            .order("event_date", { ascending: true });

        if (evError) {
            console.error("[Events Attending] Events error:", evError);
            return NextResponse.json(
                { error: "Failed to fetch events" },
                { status: 500 },
            );
        }

        // Merge registration status onto events
        const regMap = new Map(
            registrations.map((r) => [r.event_id, r.status]),
        );
        const enriched = (events || []).map((ev) => ({
            ...ev,
            registration_status: regMap.get(ev.id) || "registered",
        }));

        return NextResponse.json({ events: enriched });
    } catch (error) {
        console.error("[Events Attending] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch events" },
            { status: 500 },
        );
    }
}
