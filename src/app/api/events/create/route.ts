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
 * POST /api/events/create
 * User-submitted event (creates as draft; user can publish from manage page or admin can publish)
 */
export async function POST(request: NextRequest) {
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
        const body = await request.json();
        const {
            name,
            slug,
            description,
            event_type,
            event_date,
            start_time,
            end_time,
            timezone,
            is_multi_day,
            end_date,
            venue,
            address,
            city,
            country,
            is_virtual,
            virtual_url,
            organizer,
            organizer_logo_url,
            organizer_website,
            event_url,
            rsvp_url,
            ticket_url,
            banner_image_url,
            tags,
            blockchain_focus,
            brand_id,
        } = body;

        if (!name || !event_type || !event_date) {
            return NextResponse.json(
                { error: "Name, event type, and date are required" },
                { status: 400 },
            );
        }

        // Base columns only so create works when migrations 068/069 (slug, brand_id) are not applied
        const insertRow: Record<string, unknown> = {
            name,
            description: description || null,
            event_type,
            event_date,
            start_time: start_time || null,
            end_time: end_time || null,
            timezone: timezone || "UTC",
            is_multi_day: is_multi_day || false,
            end_date: end_date || null,
            venue: venue || null,
            address: address || null,
            city: city || null,
            country: country || null,
            is_virtual: is_virtual || false,
            virtual_url: virtual_url || null,
            organizer: organizer || null,
            organizer_logo_url: organizer_logo_url || null,
            organizer_website: organizer_website || null,
            event_url: event_url || null,
            rsvp_url: rsvp_url || null,
            ticket_url: ticket_url || null,
            banner_image_url: banner_image_url || null,
            tags: tags || [],
            blockchain_focus: blockchain_focus || null,
            source: "manual",
            status: "draft",
            is_featured: false,
            is_verified: false,
            registration_enabled: false,
            max_attendees: null,
            created_by: walletAddress,
        };
        const { data: event, error } = await supabase
            .from("shout_events")
            .insert(insertRow)
            .select()
            .single();

        if (error) {
            console.error("[Events Create] Error:", error);
            return NextResponse.json(
                { error: error.message || "Failed to create event" },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true, event });
    } catch (error) {
        console.error("[Events Create] Error:", error);
        return NextResponse.json(
            { error: "Failed to create event" },
            { status: 500 },
        );
    }
}
