import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export interface PublicEvent {
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
    city: string | null;
    country: string | null;
    is_virtual: boolean;
    virtual_url: string | null;
    organizer: string | null;
    organizer_logo_url: string | null;
    event_url: string | null;
    rsvp_url: string | null;
    ticket_url: string | null;
    banner_image_url: string | null;
    tags: string[];
    blockchain_focus: string[] | null;
    is_featured: boolean;
    registration_enabled: boolean;
    max_attendees: number | null;
    current_registrations: number;
}

// GET: List public events (published only)
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const city = searchParams.get("city");
    const country = searchParams.get("country");
    const blockchain = searchParams.get("blockchain");
    const featured = searchParams.get("featured");
    const search = searchParams.get("search");
    const from = searchParams.get("from"); // Start date filter
    const to = searchParams.get("to"); // End date filter
    const upcoming = searchParams.get("upcoming"); // Only future events
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    try {
        let query = supabase
            .from("shout_events")
            .select(`
                id, name, description, event_type, event_date, start_time, end_time,
                timezone, is_multi_day, end_date, venue, city, country, is_virtual,
                virtual_url, organizer, organizer_logo_url, event_url, rsvp_url,
                ticket_url, banner_image_url, tags, blockchain_focus, is_featured,
                registration_enabled, max_attendees, current_registrations
            `, { count: "exact" })
            .eq("status", "published")
            .order("is_featured", { ascending: false })
            .order("event_date", { ascending: true })
            .range(offset, offset + limit - 1);

        // Filters
        if (type) query = query.eq("event_type", type);
        if (city) query = query.ilike("city", `%${city}%`);
        if (country) query = query.ilike("country", `%${country}%`);
        if (blockchain) query = query.contains("blockchain_focus", [blockchain]);
        if (featured === "true") query = query.eq("is_featured", true);
        if (from) query = query.gte("event_date", from);
        if (to) query = query.lte("event_date", to);
        if (upcoming === "true") {
            const today = new Date().toISOString().split("T")[0];
            query = query.gte("event_date", today);
        }
        if (search) {
            query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,organizer.ilike.%${search}%,city.ilike.%${search}%`);
        }

        const { data: events, error, count } = await query;

        if (error) {
            console.error("[Public Events] Error fetching events:", error);
            return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
        }

        // Get unique values for filters
        const { data: filterData } = await supabase
            .from("shout_events")
            .select("event_type, city, country, blockchain_focus")
            .eq("status", "published");

        const eventTypes = [...new Set(filterData?.map(e => e.event_type).filter(Boolean) || [])];
        const cities = [...new Set(filterData?.map(e => e.city).filter(Boolean) || [])];
        const countries = [...new Set(filterData?.map(e => e.country).filter(Boolean) || [])];
        const blockchains = [...new Set(filterData?.flatMap(e => e.blockchain_focus || []).filter(Boolean) || [])];

        return NextResponse.json({
            events: events || [],
            total: count || 0,
            limit,
            offset,
            filters: {
                eventTypes,
                cities,
                countries,
                blockchains,
            },
        });
    } catch (error) {
        console.error("[Public Events] Error:", error);
        return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
    }
}
