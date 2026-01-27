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

// POST: Perform bulk actions on events
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
        const { action, event_ids } = body;

        if (!action || !event_ids || !Array.isArray(event_ids) || event_ids.length === 0) {
            return NextResponse.json({ error: "Action and event_ids are required" }, { status: 400 });
        }

        console.log("[Admin Events Bulk]", action, "on", event_ids.length, "events");

        let result;

        switch (action) {
            case "publish":
                result = await supabase
                    .from("shout_events")
                    .update({ status: "published", updated_by: address })
                    .in("id", event_ids);
                break;

            case "draft":
                result = await supabase
                    .from("shout_events")
                    .update({ status: "draft", updated_by: address })
                    .in("id", event_ids);
                break;

            case "delete":
                result = await supabase
                    .from("shout_events")
                    .delete()
                    .in("id", event_ids);
                break;

            case "feature":
                result = await supabase
                    .from("shout_events")
                    .update({ is_featured: true, updated_by: address })
                    .in("id", event_ids);
                break;

            case "unfeature":
                result = await supabase
                    .from("shout_events")
                    .update({ is_featured: false, updated_by: address })
                    .in("id", event_ids);
                break;

            case "cancel":
                result = await supabase
                    .from("shout_events")
                    .update({ status: "cancelled", updated_by: address })
                    .in("id", event_ids);
                break;

            default:
                return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

        if (result.error) {
            console.error("[Admin Events Bulk] Error:", result.error);
            return NextResponse.json({ error: "Bulk action failed" }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            action,
            affected: event_ids.length,
        });
    } catch (error) {
        console.error("[Admin Events Bulk] Error:", error);
        return NextResponse.json({ error: "Bulk action failed" }, { status: 500 });
    }
}
