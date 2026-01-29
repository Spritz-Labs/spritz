import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export interface GlobalEvent {
    id: string;
    name: string;
    description: string | null;
    event_type: string;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    timezone: string;
    is_multi_day: boolean;
    end_date: string | null;
    venue: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    is_virtual: boolean;
    virtual_url: string | null;
    organizer: string | null;
    organizer_logo_url: string | null;
    organizer_website: string | null;
    event_url: string | null;
    rsvp_url: string | null;
    ticket_url: string | null;
    banner_image_url: string | null;
    tags: string[];
    blockchain_focus: string[] | null;
    source: string;
    source_url: string | null;
    status: string;
    is_featured: boolean;
    is_verified: boolean;
    registration_enabled: boolean;
    max_attendees: number | null;
    current_registrations: number;
    created_by: string;
    created_at: string;
    updated_at: string;
}

// Verify admin signature from headers
async function verifyAdmin(request: NextRequest): Promise<{ isAdmin: boolean; address: string | null }> {
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

// GET: List all events (admin view - includes drafts)
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const city = searchParams.get("city");
    const featured = searchParams.get("featured");
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    try {
        let query = supabase
            .from("shout_events")
            .select("*", { count: "exact" })
            .order("event_date", { ascending: true })
            .range(offset, offset + limit - 1);

        if (status) query = query.eq("status", status);
        if (type) query = query.eq("event_type", type);
        if (city) query = query.ilike("city", `%${city}%`);
        if (featured === "true") query = query.eq("is_featured", true);
        if (search) {
            query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,organizer.ilike.%${search}%`);
        }

        const { data: events, error, count } = await query;

        if (error) {
            console.error("[Admin Events] Error fetching events:", error);
            return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
        }

        return NextResponse.json({
            events: events || [],
            total: count || 0,
            limit,
            offset,
        });
    } catch (error) {
        console.error("[Admin Events] Error:", error);
        return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
    }
}

// POST: Create a new event
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin, address } = await verifyAdmin(request);
    if (!isAdmin || !address) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const {
            name,
            description,
            event_type,
            event_date,
            start_time,
            end_time,
            timezone,
            is_multi_day,
            end_date,
            venue,
            address: eventAddress,
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
            status,
            is_featured,
            is_verified,
            registration_enabled,
            max_attendees,
        } = body;

        if (!name || !event_type || !event_date) {
            return NextResponse.json(
                { error: "Name, event type, and date are required" },
                { status: 400 }
            );
        }

        const { data: event, error } = await supabase
            .from("shout_events")
            .insert({
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
                address: eventAddress || null,
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
                status: status || "draft",
                is_featured: is_featured || false,
                is_verified: is_verified || false,
                registration_enabled: registration_enabled || false,
                max_attendees: max_attendees || null,
                created_by: address,
            })
            .select()
            .single();

        if (error) {
            console.error("[Admin Events] Error creating event:", error);
            return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
        }

        return NextResponse.json({ event });
    } catch (error) {
        console.error("[Admin Events] Error:", error);
        return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
    }
}
