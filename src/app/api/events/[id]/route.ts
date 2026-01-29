import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// GET: Get a single public event
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    const { id } = await params;

    try {
        // Fetch by id only; include created_by so creator can load their draft for editing
        const { data: row, error } = await supabase
            .from("shout_events")
            .select(
                `
                id, name, description, event_type, event_date, start_time, end_time,
                timezone, is_multi_day, end_date, venue, address, city, country, is_virtual,
                virtual_url, organizer, organizer_logo_url, organizer_website, event_url, rsvp_url,
                ticket_url, banner_image_url, tags, blockchain_focus, is_featured,
                registration_enabled, registration_fields, max_attendees, current_registrations,
                status, created_by
            `,
            )
            .eq("id", id)
            .single();

        if (error || !row) {
            return NextResponse.json(
                { error: "Event not found" },
                { status: 404 },
            );
        }

        const session = await getAuthenticatedUser(request);
        const wallet = session?.userAddress?.toLowerCase();
        const isCreator = wallet && row.created_by?.toLowerCase() === wallet;

        // Non-published: only creator can read (for editing)
        if (row.status !== "published") {
            if (!isCreator) {
                return NextResponse.json(
                    { error: "Event not found" },
                    { status: 404 },
                );
            }
            const { created_by: _cb, ...event } = row;
            return NextResponse.json({ event, isRegistered: false });
        }

        // Published: public response; don't expose created_by
        const { created_by: _cb, ...event } = row;
        let isRegistered = false;
        if (session && event.registration_enabled) {
            const { data: registration } = await supabase
                .from("shout_event_user_registrations")
                .select("id, status")
                .eq("event_id", id)
                .eq("wallet_address", wallet)
                .single();
            isRegistered = !!registration;
        }

        return NextResponse.json({
            event,
            isRegistered,
        });
    } catch (error) {
        console.error("[Public Events] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch event" },
            { status: 500 },
        );
    }
}

// POST: Register for an event
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

    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const { id } = await params;

    try {
        // Get the event
        const { data: event, error: eventError } = await supabase
            .from("shout_events")
            .select(
                "id, name, registration_enabled, max_attendees, current_registrations, registration_fields",
            )
            .eq("id", id)
            .eq("status", "published")
            .single();

        if (eventError || !event) {
            return NextResponse.json(
                { error: "Event not found" },
                { status: 404 },
            );
        }

        // Allow registration for any published event (registration_enabled is for capacity/features only)
        if (
            event.max_attendees &&
            event.current_registrations >= event.max_attendees
        ) {
            return NextResponse.json(
                { error: "Event is full" },
                { status: 400 },
            );
        }

        // Get registration data from request
        const body = await request.json().catch(() => ({}));
        const registrationData = body.registration_data || {};

        // Check if already registered
        const { data: existing } = await supabase
            .from("shout_event_user_registrations")
            .select("id")
            .eq("event_id", id)
            .eq("wallet_address", session.userAddress.toLowerCase())
            .single();

        if (existing) {
            return NextResponse.json(
                { error: "Already registered for this event" },
                { status: 400 },
            );
        }

        // Register the user
        const { data: registration, error: regError } = await supabase
            .from("shout_event_user_registrations")
            .insert({
                event_id: id,
                wallet_address: session.userAddress.toLowerCase(),
                registration_data: registrationData,
                status: "registered",
            })
            .select()
            .single();

        if (regError) {
            console.error("[Event Registration] Error:", regError);
            return NextResponse.json(
                { error: "Failed to register" },
                { status: 500 },
            );
        }

        const wallet = session.userAddress.toLowerCase();
        await supabase
            .from("shout_event_interests")
            .delete()
            .eq("event_id", id)
            .eq("wallet_address", wallet);
        await supabase.from("shout_event_interests").insert({
            event_id: id,
            wallet_address: wallet,
            interest_type: "going",
        });

        return NextResponse.json({
            success: true,
            registration,
            message: `Successfully registered for ${event.name}`,
        });
    } catch (error) {
        console.error("[Event Registration] Error:", error);
        return NextResponse.json(
            { error: "Failed to register" },
            { status: 500 },
        );
    }
}

// PATCH: Update event (creator only)
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
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

    const { id } = await params;
    const walletAddress = session.userAddress.toLowerCase();

    try {
        const { data: event, error: fetchError } = await supabase
            .from("shout_events")
            .select("id, created_by")
            .eq("id", id)
            .single();

        if (fetchError || !event) {
            return NextResponse.json(
                { error: "Event not found" },
                { status: 404 },
            );
        }

        if (event.created_by?.toLowerCase() !== walletAddress) {
            return NextResponse.json(
                { error: "Only the event creator can update this event" },
                { status: 403 },
            );
        }

        const body = await request.json();
        // Omit slug, brand_id so PATCH works when migrations 068/069 have not been applied
        const allowed = [
            "name",
            "description",
            "event_type",
            "event_date",
            "start_time",
            "end_time",
            "timezone",
            "is_multi_day",
            "end_date",
            "venue",
            "address",
            "city",
            "country",
            "is_virtual",
            "virtual_url",
            "organizer",
            "organizer_logo_url",
            "organizer_website",
            "event_url",
            "rsvp_url",
            "ticket_url",
            "banner_image_url",
            "tags",
            "blockchain_focus",
            "status",
            "registration_enabled",
            "max_attendees",
        ];
        const updates: Record<string, unknown> = {};
        for (const key of allowed) {
            if (key in body) updates[key] = body[key];
        }
        updates.updated_at = new Date().toISOString();

        const { data: updated, error } = await supabase
            .from("shout_events")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (error) {
            console.error("[Events PATCH] Error:", error);
            return NextResponse.json(
                { error: error.message || "Failed to update event" },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true, event: updated });
    } catch (error) {
        console.error("[Events PATCH] Error:", error);
        return NextResponse.json(
            { error: "Failed to update event" },
            { status: 500 },
        );
    }
}

// DELETE: Cancel registration
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
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

    const { id } = await params;

    try {
        const { error } = await supabase
            .from("shout_event_user_registrations")
            .delete()
            .eq("event_id", id)
            .eq("wallet_address", session.userAddress.toLowerCase());

        if (error) {
            console.error("[Event Registration] Error cancelling:", error);
            return NextResponse.json(
                { error: "Failed to cancel registration" },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Event Registration] Error:", error);
        return NextResponse.json(
            { error: "Failed to cancel registration" },
            { status: 500 },
        );
    }
}
