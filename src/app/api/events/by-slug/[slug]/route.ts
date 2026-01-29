import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// GET: Get a single public event by custom slug
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    const { slug } = await params;
    if (!slug) {
        return NextResponse.json({ error: "Slug required" }, { status: 400 });
    }

    try {
        // Slug column may not exist until migration 068_event_slug is applied
        const { data: event, error } = await supabase
            .from("shout_events")
            .select(
                `
                id, name, description, event_type, event_date, start_time, end_time,
                timezone, is_multi_day, end_date, venue, address, city, country, is_virtual,
                virtual_url, organizer, organizer_logo_url, organizer_website, event_url, rsvp_url,
                ticket_url, banner_image_url, tags, blockchain_focus, is_featured,
                registration_enabled, registration_fields, max_attendees, current_registrations
            `,
            )
            .eq("slug", slug)
            .eq("status", "published")
            .single();

        if (error || !event) {
            // PGRST/schema cache "slug" errors become 404 so app doesn't 500
            return NextResponse.json(
                { error: "Event not found" },
                { status: 404 },
            );
        }

        let isRegistered = false;
        const session = await getAuthenticatedUser(request);
        if (session && event.registration_enabled) {
            const { data: registration } = await supabase
                .from("shout_event_user_registrations")
                .select("id, status")
                .eq("event_id", event.id)
                .eq("wallet_address", session.userAddress.toLowerCase())
                .single();

            isRegistered = !!registration;
        }

        return NextResponse.json({
            event,
            isRegistered,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("slug") || msg.includes("schema cache")) {
            return NextResponse.json(
                { error: "Event not found" },
                { status: 404 },
            );
        }
        console.error("[Public Events By Slug] Error:", err);
        return NextResponse.json(
            { error: "Failed to fetch event" },
            { status: 500 },
        );
    }
}
