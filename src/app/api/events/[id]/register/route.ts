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
 * POST /api/events/[id]/register
 * Register a user for a Spritz-managed event
 * Can be called by agents with events_access capability or by users directly
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

    const { id: eventId } = await params;

    try {
        const body = await request.json();
        const { walletAddress, email, agentId, registrationData } = body;

        // Get authenticated user or use provided wallet address (from agent)
        const session = await getAuthenticatedUser(request);
        const userAddress = session?.userAddress || walletAddress;

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address required" },
                { status: 400 },
            );
        }

        // If this request is from an agent, verify the agent has events_access
        if (agentId) {
            const { data: agent, error: agentError } = await supabase
                .from("shout_agents")
                .select("id, events_access")
                .eq("id", agentId)
                .single();

            if (agentError || !agent) {
                return NextResponse.json(
                    { error: "Agent not found" },
                    { status: 404 },
                );
            }

            if (!agent.events_access) {
                return NextResponse.json(
                    { error: "Agent does not have events access" },
                    { status: 403 },
                );
            }
        }

        // Get the event
        const { data: event, error: eventError } = await supabase
            .from("shout_events")
            .select(
                "id, name, registration_enabled, max_attendees, current_registrations, event_url, rsvp_url",
            )
            .eq("id", eventId)
            .eq("status", "published")
            .single();

        if (eventError || !event) {
            return NextResponse.json(
                { error: "Event not found" },
                { status: 404 },
            );
        }

        // Check if registration is enabled
        if (!event.registration_enabled) {
            // If no Spritz registration, return external registration URL
            if (event.rsvp_url) {
                return NextResponse.json({
                    success: false,
                    message: "This event uses external registration",
                    registrationUrl: event.rsvp_url,
                    eventUrl: event.event_url,
                });
            }
            return NextResponse.json(
                {
                    error: "Registration not enabled for this event",
                    eventUrl: event.event_url,
                },
                { status: 400 },
            );
        }

        // Check capacity
        if (
            event.max_attendees &&
            event.current_registrations >= event.max_attendees
        ) {
            return NextResponse.json(
                {
                    error: "Event is at full capacity",
                    waitlistAvailable: true,
                },
                { status: 400 },
            );
        }

        // Check if already registered
        const { data: existing } = await supabase
            .from("shout_event_user_registrations")
            .select("id, status")
            .eq("event_id", eventId)
            .eq("wallet_address", userAddress.toLowerCase())
            .single();

        if (existing) {
            return NextResponse.json({
                success: true,
                alreadyRegistered: true,
                status: existing.status,
                message: `Already registered for ${event.name}`,
            });
        }

        // Create registration
        const { data: registration, error: regError } = await supabase
            .from("shout_event_user_registrations")
            .insert({
                event_id: eventId,
                wallet_address: userAddress.toLowerCase(),
                registration_data: {
                    email: email || null,
                    ...registrationData,
                    registeredVia: agentId ? `agent:${agentId}` : "direct",
                    registeredAt: new Date().toISOString(),
                },
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

        // Sync "going" in event interests so user shows as Going ✓ and count is accurate
        await supabase
            .from("shout_event_interests")
            .delete()
            .eq("event_id", eventId)
            .eq("wallet_address", userAddress.toLowerCase());
        await supabase.from("shout_event_interests").insert({
            event_id: eventId,
            wallet_address: userAddress.toLowerCase(),
            interest_type: "going",
        });

        return NextResponse.json({
            success: true,
            registration,
            message: `Successfully registered for ${event.name}!`,
            eventName: event.name,
        });
    } catch (error) {
        console.error("[Event Registration] Error:", error);
        return NextResponse.json(
            { error: "Failed to register" },
            { status: 500 },
        );
    }
}

/**
 * GET /api/events/[id]/register
 * Check registration status for an event
 */
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

    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const { id: eventId } = await params;

    try {
        const { data: registration, error } = await supabase
            .from("shout_event_user_registrations")
            .select("id, status, created_at")
            .eq("event_id", eventId)
            .eq("wallet_address", session.userAddress.toLowerCase())
            .single();

        if (error && error.code !== "PGRST116") {
            return NextResponse.json(
                { error: "Failed to check registration" },
                { status: 500 },
            );
        }

        return NextResponse.json({
            isRegistered: !!registration,
            registration: registration || null,
        });
    } catch (error) {
        console.error("[Event Registration] Error:", error);
        return NextResponse.json(
            { error: "Failed to check registration" },
            { status: 500 },
        );
    }
}
