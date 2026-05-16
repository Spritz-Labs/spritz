import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export interface NotificationPreferences {
    quietStart: number | null;
    quietEnd: number | null;
    notifyDms: boolean;
    notifyGroups: boolean;
    notifyChannels: boolean;
    notifyCalls: boolean;
}

export async function GET(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user || !supabase) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data, error } = await supabase
            .from("shout_users")
            .select(
                "notification_quiet_start, notification_quiet_end, notify_dms, notify_groups, notify_channels, notify_calls"
            )
            .eq("wallet_address", user.address.toLowerCase())
            .single();

        if (error) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        return NextResponse.json({
            quietStart: data.notification_quiet_start,
            quietEnd: data.notification_quiet_end,
            notifyDms: data.notify_dms ?? true,
            notifyGroups: data.notify_groups ?? true,
            notifyChannels: data.notify_channels ?? true,
            notifyCalls: data.notify_calls ?? true,
        });
    } catch {
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user || !supabase) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body: Partial<NotificationPreferences> = await request.json();
        const updates: Record<string, unknown> = {};

        if ("quietStart" in body) {
            const v = body.quietStart;
            if (v !== null && (typeof v !== "number" || v < 0 || v > 23)) {
                return NextResponse.json(
                    { error: "quietStart must be 0-23 or null" },
                    { status: 400 }
                );
            }
            updates.notification_quiet_start = v;
        }
        if ("quietEnd" in body) {
            const v = body.quietEnd;
            if (v !== null && (typeof v !== "number" || v < 0 || v > 23)) {
                return NextResponse.json(
                    { error: "quietEnd must be 0-23 or null" },
                    { status: 400 }
                );
            }
            updates.notification_quiet_end = v;
        }
        if ("notifyDms" in body) updates.notify_dms = !!body.notifyDms;
        if ("notifyGroups" in body) updates.notify_groups = !!body.notifyGroups;
        if ("notifyChannels" in body) updates.notify_channels = !!body.notifyChannels;
        if ("notifyCalls" in body) updates.notify_calls = !!body.notifyCalls;

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No updates provided" }, { status: 400 });
        }

        const { error } = await supabase
            .from("shout_users")
            .update(updates)
            .eq("wallet_address", user.address.toLowerCase());

        if (error) {
            console.error("[NotifPrefs] Update error:", error);
            return NextResponse.json({ error: "Failed to update" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
