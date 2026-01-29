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
 * GET /api/events/mine
 * List events created by the current user (any status)
 */
export async function GET(request: NextRequest) {
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
        const { data: events, error } = await supabase
            .from("shout_events")
            .select("*")
            .eq("created_by", walletAddress)
            .order("event_date", { ascending: true });

        if (error) {
            console.error("[Events Mine] Error:", error);
            return NextResponse.json(
                { error: "Failed to fetch events" },
                { status: 500 },
            );
        }

        return NextResponse.json({ events: events || [] });
    } catch (error) {
        console.error("[Events Mine] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch events" },
            { status: 500 },
        );
    }
}
