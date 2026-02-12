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
 * POST /api/events/[id]/checkin
 * Check in an attendee (event creator or admin only).
 * Body: { walletAddress: string }
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

    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 },
        );
    }

    const { id: eventId } = await params;
    const operatorAddress = session.userAddress.toLowerCase();

    try {
        const body = await request.json();
        const { walletAddress } = body;

        if (!walletAddress) {
            return NextResponse.json(
                { error: "Wallet address required" },
                { status: 400 },
            );
        }

        const attendeeAddress = walletAddress.toLowerCase();

        // Verify event exists and caller is the creator or an admin
        const { data: event, error: eventError } = await supabase
            .from("shout_events")
            .select("id, name, created_by")
            .eq("id", eventId)
            .single();

        if (eventError || !event) {
            return NextResponse.json(
                { error: "Event not found" },
                { status: 404 },
            );
        }

        const isCreator = event.created_by === operatorAddress;

        // Check admin status
        let isAdmin = false;
        if (!isCreator) {
            const { data: adminRow } = await supabase
                .from("shout_admins")
                .select("wallet_address")
                .eq("wallet_address", operatorAddress)
                .maybeSingle();
            isAdmin = !!adminRow;
        }

        if (!isCreator && !isAdmin) {
            return NextResponse.json(
                { error: "Only the event creator or an admin can check people in" },
                { status: 403 },
            );
        }

        // Find the registration
        const { data: registration, error: regError } = await supabase
            .from("shout_event_user_registrations")
            .select("id, status, wallet_address")
            .eq("event_id", eventId)
            .eq("wallet_address", attendeeAddress)
            .single();

        if (regError || !registration) {
            return NextResponse.json(
                { error: "This person is not registered for this event" },
                { status: 404 },
            );
        }

        if (registration.status === "checked_in") {
            // Fetch username for display
            const { data: userInfo } = await supabase
                .from("shout_usernames")
                .select("username")
                .eq("wallet_address", attendeeAddress)
                .maybeSingle();

            return NextResponse.json({
                success: true,
                alreadyCheckedIn: true,
                message: "Already checked in",
                attendee: {
                    walletAddress: attendeeAddress,
                    username: userInfo?.username || null,
                },
            });
        }

        // Update status to checked_in
        const { error: updateError } = await supabase
            .from("shout_event_user_registrations")
            .update({
                status: "checked_in",
                updated_at: new Date().toISOString(),
            })
            .eq("id", registration.id);

        if (updateError) {
            console.error("[Event Checkin] Update error:", updateError);
            return NextResponse.json(
                { error: "Failed to check in" },
                { status: 500 },
            );
        }

        // Fetch username for display
        const { data: userInfo } = await supabase
            .from("shout_usernames")
            .select("username")
            .eq("wallet_address", attendeeAddress)
            .maybeSingle();

        return NextResponse.json({
            success: true,
            message: `Checked in successfully!`,
            attendee: {
                walletAddress: attendeeAddress,
                username: userInfo?.username || null,
            },
        });
    } catch (error) {
        console.error("[Event Checkin] Error:", error);
        return NextResponse.json(
            { error: "Failed to check in" },
            { status: 500 },
        );
    }
}

/**
 * GET /api/events/[id]/checkin
 * Get check-in stats for an event (creator/admin only).
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
    const operatorAddress = session.userAddress.toLowerCase();

    try {
        // Verify event and permissions
        const { data: event } = await supabase
            .from("shout_events")
            .select("id, name, created_by")
            .eq("id", eventId)
            .single();

        if (!event) {
            return NextResponse.json(
                { error: "Event not found" },
                { status: 404 },
            );
        }

        const isCreator = event.created_by === operatorAddress;
        let isAdmin = false;
        if (!isCreator) {
            const { data: adminRow } = await supabase
                .from("shout_admins")
                .select("wallet_address")
                .eq("wallet_address", operatorAddress)
                .maybeSingle();
            isAdmin = !!adminRow;
        }

        if (!isCreator && !isAdmin) {
            return NextResponse.json(
                { error: "Not authorized" },
                { status: 403 },
            );
        }

        // Get registrations with check-in status
        const { data: registrations } = await supabase
            .from("shout_event_user_registrations")
            .select("wallet_address, status, created_at, updated_at")
            .eq("event_id", eventId)
            .order("created_at", { ascending: true });

        const total = registrations?.length || 0;
        const checkedIn =
            registrations?.filter((r) => r.status === "checked_in").length || 0;

        return NextResponse.json({
            eventName: event.name,
            total,
            checkedIn,
            registrations: registrations || [],
        });
    } catch (error) {
        console.error("[Event Checkin] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch check-in data" },
            { status: 500 },
        );
    }
}
