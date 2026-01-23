import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export interface AgentEvent {
    id: string;
    agent_id: string;
    knowledge_id: string | null;
    name: string;
    description: string | null;
    event_type: string | null;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    is_multi_day: boolean;
    end_date: string | null;
    venue: string | null;
    address: string | null;
    organizer: string | null;
    organizer_logo_url: string | null;
    event_url: string | null;
    rsvp_url: string | null;
    source: string | null;
    source_url: string | null;
    is_featured: boolean;
    is_verified: boolean;
    tags: string[] | null;
    created_at: string;
}

// GET: List events for an agent (public for official/public agents)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        
        // Optional filters
        const eventDate = searchParams.get("date");
        const eventType = searchParams.get("type");
        const source = searchParams.get("source");
        const featured = searchParams.get("featured");

        // Check agent visibility
        const { data: agent, error: agentError } = await supabase
            .from("shout_agents")
            .select("visibility")
            .eq("id", id)
            .single();

        if (agentError || !agent) {
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        // Only allow public access for public/official agents
        if (!["public", "official"].includes(agent.visibility)) {
            return NextResponse.json({ error: "Events not available for this agent" }, { status: 403 });
        }

        // Build query
        let query = supabase
            .from("shout_agent_events")
            .select("*")
            .eq("agent_id", id)
            .order("event_date", { ascending: true })
            .order("start_time", { ascending: true, nullsFirst: false });

        // Apply filters
        if (eventDate) {
            query = query.eq("event_date", eventDate);
        }
        if (eventType) {
            query = query.eq("event_type", eventType);
        }
        if (source) {
            query = query.eq("source", source);
        }
        if (featured === "true") {
            query = query.eq("is_featured", true);
        }

        const { data: events, error } = await query;

        if (error) {
            console.error("[Events] Error fetching events:", error);
            return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
        }

        // Group events by date for easier frontend rendering
        const eventsByDate: Record<string, AgentEvent[]> = {};
        for (const event of events || []) {
            const date = event.event_date;
            if (!eventsByDate[date]) {
                eventsByDate[date] = [];
            }
            eventsByDate[date].push(event);
        }

        return NextResponse.json({ 
            events: events || [],
            eventsByDate,
            total: events?.length || 0
        });
    } catch (error) {
        console.error("[Events] Error:", error);
        return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
    }
}

// POST: Add a new event (admin only for official agents)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { id } = await params;
        const body = await request.json();
        const { userAddress, event } = body;

        if (!userAddress || !event) {
            return NextResponse.json({ error: "User address and event data required" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Check if user is admin
        const { data: adminData } = await supabase
            .from("shout_admins")
            .select("wallet_address")
            .eq("wallet_address", normalizedAddress)
            .single();

        if (!adminData) {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        // Validate required fields
        if (!event.name || !event.event_date) {
            return NextResponse.json({ error: "Event name and date are required" }, { status: 400 });
        }

        // Insert event
        const { data: newEvent, error } = await supabase
            .from("shout_agent_events")
            .insert({
                agent_id: id,
                name: event.name,
                description: event.description || null,
                event_type: event.event_type || null,
                event_date: event.event_date,
                start_time: event.start_time || null,
                end_time: event.end_time || null,
                is_multi_day: event.is_multi_day || false,
                end_date: event.end_date || null,
                venue: event.venue || null,
                address: event.address || null,
                organizer: event.organizer || null,
                organizer_logo_url: event.organizer_logo_url || null,
                event_url: event.event_url || null,
                rsvp_url: event.rsvp_url || null,
                source: event.source || "community",
                source_url: event.source_url || null,
                is_featured: event.is_featured || false,
                is_verified: event.is_verified || false,
                tags: event.tags || null,
            })
            .select()
            .single();

        if (error) {
            if (error.code === "23505") {
                return NextResponse.json({ error: "Event already exists for this date" }, { status: 400 });
            }
            console.error("[Events] Error adding event:", error);
            return NextResponse.json({ error: "Failed to add event" }, { status: 500 });
        }

        return NextResponse.json({ event: newEvent });
    } catch (error) {
        console.error("[Events] Error:", error);
        return NextResponse.json({ error: "Failed to add event" }, { status: 500 });
    }
}

// DELETE: Remove an event (admin only)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");
        const eventId = searchParams.get("eventId");

        if (!userAddress || !eventId) {
            return NextResponse.json({ error: "User address and event ID required" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Check if user is admin
        const { data: adminData } = await supabase
            .from("shout_admins")
            .select("wallet_address")
            .eq("wallet_address", normalizedAddress)
            .single();

        if (!adminData) {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        // Delete event
        const { error } = await supabase
            .from("shout_agent_events")
            .delete()
            .eq("id", eventId)
            .eq("agent_id", id);

        if (error) {
            console.error("[Events] Error deleting event:", error);
            return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Events] Error:", error);
        return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
    }
}
