import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// POST: Mark interest or going for an event
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
        const body = await request.json();
        const { interest_type } = body; // 'interested' or 'going'

        if (
            !interest_type ||
            !["interested", "going"].includes(interest_type)
        ) {
            return NextResponse.json(
                {
                    error: "Invalid interest_type. Must be 'interested' or 'going'",
                },
                { status: 400 },
            );
        }

        // Verify event exists and is published
        const { data: event, error: eventError } = await supabase
            .from("shout_events")
            .select("id, name, status")
            .eq("id", id)
            .eq("status", "published")
            .single();

        if (eventError || !event) {
            return NextResponse.json(
                { error: "Event not found" },
                { status: 404 },
            );
        }

        const walletAddress = session.userAddress.toLowerCase();

        // Check if interest already exists
        const { data: existing } = await supabase
            .from("shout_event_interests")
            .select("id, interest_type")
            .eq("event_id", id)
            .eq("wallet_address", walletAddress)
            .eq("interest_type", interest_type)
            .single();

        if (existing) {
            // Already marked, return success
            return NextResponse.json({
                success: true,
                interest_type,
                message: `Already marked as ${interest_type}`,
            });
        }

        // Remove opposite interest type if exists (user can only be interested OR going, not both)
        if (interest_type === "going") {
            await supabase
                .from("shout_event_interests")
                .delete()
                .eq("event_id", id)
                .eq("wallet_address", walletAddress)
                .eq("interest_type", "interested");
        } else if (interest_type === "interested") {
            await supabase
                .from("shout_event_interests")
                .delete()
                .eq("event_id", id)
                .eq("wallet_address", walletAddress)
                .eq("interest_type", "going");
        }

        // Insert new interest
        const { data: interest, error: insertError } = await supabase
            .from("shout_event_interests")
            .insert({
                event_id: id,
                wallet_address: walletAddress,
                interest_type,
            })
            .select()
            .single();

        if (insertError) {
            console.error("[Event Interest] Insert error:", insertError);
            return NextResponse.json(
                { error: "Failed to mark interest" },
                { status: 500 },
            );
        }

        return NextResponse.json({
            success: true,
            interest,
            interest_type,
            message: `Marked as ${interest_type}`,
        });
    } catch (error) {
        console.error("[Event Interest] Error:", error);
        return NextResponse.json(
            { error: "Failed to mark interest" },
            { status: 500 },
        );
    }
}

// DELETE: Remove interest
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
        const { searchParams } = new URL(request.url);
        const interest_type = searchParams.get("type"); // 'interested' or 'going' or null (remove all)

        const walletAddress = session.userAddress.toLowerCase();

        let query = supabase
            .from("shout_event_interests")
            .delete()
            .eq("event_id", id)
            .eq("wallet_address", walletAddress);

        if (interest_type) {
            query = query.eq("interest_type", interest_type);
        }

        const { error } = await query;

        if (error) {
            console.error("[Event Interest] Delete error:", error);
            return NextResponse.json(
                { error: "Failed to remove interest" },
                { status: 500 },
            );
        }

        // When removing "going", also remove registration so "You're registered" badge goes away
        if (interest_type === "going") {
            await supabase
                .from("shout_event_user_registrations")
                .delete()
                .eq("event_id", id)
                .eq("wallet_address", walletAddress);
        }

        return NextResponse.json({
            success: true,
            message: "Interest removed",
        });
    } catch (error) {
        console.error("[Event Interest] Error:", error);
        return NextResponse.json(
            { error: "Failed to remove interest" },
            { status: 500 },
        );
    }
}

// GET: Get interest counts and user's interest status
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
        // Get counts
        const { data: interests, error: interestsError } = await supabase
            .from("shout_event_interests")
            .select("interest_type, wallet_address")
            .eq("event_id", id);

        if (interestsError) {
            console.error("[Event Interest] Fetch error:", interestsError);
            return NextResponse.json(
                { error: "Failed to fetch interests" },
                { status: 500 },
            );
        }

        const interestedCount =
            interests?.filter((i) => i.interest_type === "interested").length ||
            0;
        const goingCount =
            interests?.filter((i) => i.interest_type === "going").length || 0;

        // Get user's interest status and registration (if authenticated)
        let userInterest: string | null = null;
        let isRegistered = false;
        const session = await getAuthenticatedUser(request);
        if (session) {
            const walletAddress = session.userAddress.toLowerCase();
            const userInterests =
                interests?.filter((i) => i.wallet_address === walletAddress) ||
                [];
            if (userInterests.length > 0) {
                userInterest = userInterests[0].interest_type;
            }
            const { data: registration } = await supabase
                .from("shout_event_user_registrations")
                .select("id")
                .eq("event_id", id)
                .eq("wallet_address", walletAddress)
                .single();
            isRegistered = !!registration;
        }

        return NextResponse.json({
            interested_count: interestedCount,
            going_count: goingCount,
            user_interest: userInterest,
            is_registered: isRegistered,
        });
    } catch (error) {
        console.error("[Event Interest] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch interests" },
            { status: 500 },
        );
    }
}
