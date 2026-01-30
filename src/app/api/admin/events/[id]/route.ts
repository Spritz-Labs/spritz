import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Verify admin signature from headers
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

// GET: Get a single event
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

    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const { data: event, error } = await supabase
            .from("shout_events")
            .select("*")
            .eq("id", id)
            .single();

        if (error || !event) {
            return NextResponse.json(
                { error: "Event not found" },
                { status: 404 },
            );
        }

        return NextResponse.json({ event });
    } catch (error) {
        console.error("[Admin Events] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch event" },
            { status: 500 },
        );
    }
}

// PATCH: Update an event
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

    const { isAdmin, address } = await verifyAdmin(request);
    if (!isAdmin || !address) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const body = await request.json();

        // Allowed fields to update
        const allowedFields = [
            "name",
            "slug",
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
            "is_featured",
            "is_verified",
            "registration_enabled",
            "max_attendees",
            "registration_fields",
        ];

        const updates: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
            updated_by: address,
        };

        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                let value = body[field];
                // Empty slug → null so multiple events can have no slug (UNIQUE allows one '')
                if (
                    field === "slug" &&
                    typeof value === "string" &&
                    value.trim() === ""
                ) {
                    value = null;
                }
                // Ensure arrays for tags/blockchain_focus (filter empty strings)
                if (field === "tags" && Array.isArray(value)) {
                    value = value
                        .map((s) =>
                            typeof s === "string" ? s.trim() : String(s),
                        )
                        .filter(Boolean);
                }
                if (
                    field === "blockchain_focus" &&
                    value != null &&
                    Array.isArray(value)
                ) {
                    value = value
                        .map((s) =>
                            typeof s === "string" ? s.trim() : String(s),
                        )
                        .filter(Boolean);
                }
                updates[field] = value;
            }
        }

        const { data: event, error } = await supabase
            .from("shout_events")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (error) {
            console.error("[Admin Events] Error updating event:", error);
            return NextResponse.json(
                {
                    error: "Failed to update event",
                    details: error.message,
                    code: error.code,
                },
                { status: 500 },
            );
        }

        return NextResponse.json({ event });
    } catch (error) {
        console.error("[Admin Events] Error:", error);
        const message =
            error instanceof Error ? error.message : "Failed to update event";
        return NextResponse.json(
            { error: "Failed to update event", details: message },
            { status: 500 },
        );
    }
}

// DELETE: Delete an event
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

    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const { error } = await supabase
            .from("shout_events")
            .delete()
            .eq("id", id);

        if (error) {
            console.error("[Admin Events] Error deleting event:", error);
            return NextResponse.json(
                { error: "Failed to delete event" },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Admin Events] Error:", error);
        return NextResponse.json(
            { error: "Failed to delete event" },
            { status: 500 },
        );
    }
}
