import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

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

// PATCH: Update an event source
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const body = await request.json();
        const updateData: Record<string, unknown> = {};

        // Only allow updating specific fields
        if (typeof body.is_active === "boolean") {
            updateData.is_active = body.is_active;
        }
        if (typeof body.scrape_interval_hours === "number") {
            updateData.scrape_interval_hours = body.scrape_interval_hours;
        }
        if (body.event_types) {
            updateData.event_types = body.event_types;
        }
        if (body.blockchain_focus) {
            updateData.blockchain_focus = body.blockchain_focus;
        }

        const { data, error } = await supabase
            .from("shout_event_sources")
            .update(updateData)
            .eq("id", id)
            .select()
            .single();

        if (error) {
            console.error("[Event Sources] Update error:", error);
            return NextResponse.json({ error: "Failed to update source" }, { status: 500 });
        }

        return NextResponse.json({ source: data });
    } catch (error) {
        console.error("[Event Sources] Error:", error);
        return NextResponse.json({ error: "Failed to update source" }, { status: 500 });
    }
}

// DELETE: Remove an event source
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const { error } = await supabase
            .from("shout_event_sources")
            .delete()
            .eq("id", id);

        if (error) {
            console.error("[Event Sources] Delete error:", error);
            return NextResponse.json({ error: "Failed to delete source" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Event Sources] Error:", error);
        return NextResponse.json({ error: "Failed to delete source" }, { status: 500 });
    }
}
