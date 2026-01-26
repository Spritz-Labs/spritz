import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

/**
 * POST /api/events/register
 * Register a user for an event (currently supports Luma)
 * 
 * This endpoint:
 * 1. Fetches user registration preferences
 * 2. Attempts to register the user via browser automation or pre-filled links
 * 3. Returns a registration link or success status
 */
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const session = await getAuthenticatedUser(request);
        if (!session) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const body = await request.json();
        const { eventUrl, eventId, agentId } = body;

        if (!eventUrl) {
            return NextResponse.json({ error: "Event URL is required" }, { status: 400 });
        }

        // Check if this is a Luma URL
        const isLuma = eventUrl.includes("lu.ma");
        if (!isLuma) {
            return NextResponse.json({ 
                error: "Currently only Luma events are supported",
                supportedPlatforms: ["Luma"]
            }, { status: 400 });
        }

        // Fetch user registration preferences
        const { data: prefs, error: prefsError } = await supabase
            .from("shout_user_registration_prefs")
            .select("*")
            .eq("wallet_address", session.userAddress.toLowerCase())
            .single();

        if (prefsError && prefsError.code !== "PGRST116") { // PGRST116 = not found
            console.error("[Event Registration] Error fetching preferences:", prefsError);
            return NextResponse.json({ 
                error: "Failed to fetch registration preferences",
                needsSetup: true
            }, { status: 500 });
        }

        // If user hasn't set up preferences, return a setup link
        if (!prefs || !prefs.email || !prefs.full_name) {
            return NextResponse.json({
                success: false,
                needsSetup: true,
                message: "Please set up your registration preferences first",
                setupUrl: `/user/${session.userAddress}/edit?tab=registration`
            }, { status: 200 });
        }

        // For now, return a pre-filled registration link
        // Luma doesn't officially support URL parameters, but we can try common patterns
        // In the future, this could use browser automation (Puppeteer) via a separate service
        
        // Generate a registration token/link that includes user info
        // This will be used by a client-side script or browser extension to auto-fill
        const registrationData = {
            eventUrl,
            userInfo: {
                name: prefs.full_name,
                email: prefs.email,
                phone: prefs.phone,
                company: prefs.company,
                jobTitle: prefs.job_title,
                twitter: prefs.twitter_handle,
                linkedin: prefs.linkedin_url,
                dietaryRestrictions: prefs.dietary_restrictions,
                accessibilityNeeds: prefs.accessibility_needs,
            },
            timestamp: new Date().toISOString(),
        };

        // Store registration attempt (for tracking)
        try {
            await supabase
                .from("shout_event_registrations")
                .insert({
                    wallet_address: session.userAddress.toLowerCase(),
                    event_url: eventUrl,
                    event_id: eventId || null,
                    agent_id: agentId || null,
                    registration_data: registrationData,
                    status: "pending",
                });
        } catch (err) {
            console.error("[Event Registration] Error storing registration:", err);
        }

        // Return registration link with encoded data
        // The client will use this to open Luma and attempt auto-fill
        const registrationLink = `/api/events/register/redirect?eventUrl=${encodeURIComponent(eventUrl)}&data=${encodeURIComponent(JSON.stringify(registrationData))}`;

        return NextResponse.json({
            success: true,
            message: "Registration link generated",
            registrationLink,
            eventUrl,
            userInfo: {
                name: prefs.full_name,
                email: prefs.email,
            },
            note: "Click the link to open the registration form. Your information will be available for auto-fill."
        });

    } catch (error) {
        console.error("[Event Registration] Error:", error);
        return NextResponse.json({ 
            error: "Failed to process registration",
            details: error instanceof Error ? error.message : "Unknown error"
        }, { status: 500 });
    }
}
