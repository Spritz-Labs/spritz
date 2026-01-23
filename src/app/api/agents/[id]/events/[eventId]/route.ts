import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// PATCH: Update an event (admin only)
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; eventId: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { id: agentId, eventId } = await params;
        const body = await request.json();
        const { userAddress, ...updateData } = body;

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
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

        // Build update object with only provided fields
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        
        const allowedFields = [
            "name", "description", "event_type", "event_date", 
            "start_time", "end_time", "venue", "organizer",
            "event_url", "source", "is_featured", "is_verified", "tags"
        ];

        for (const field of allowedFields) {
            if (updateData[field] !== undefined) {
                updates[field] = updateData[field];
            }
        }

        // Update event
        const { data: event, error } = await supabase
            .from("shout_agent_events")
            .update(updates)
            .eq("id", eventId)
            .eq("agent_id", agentId)
            .select()
            .single();

        if (error) {
            console.error("[Events] Error updating event:", error);
            return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
        }

        return NextResponse.json({ event });
    } catch (error) {
        console.error("[Events] Error:", error);
        return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
    }
}

// DELETE: Delete a specific event (admin only)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; eventId: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { id: agentId, eventId } = await params;
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
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
            .eq("agent_id", agentId);

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
