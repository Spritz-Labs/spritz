import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper to check if user is admin
async function isAdmin(userAddress: string): Promise<boolean> {
    const { data } = await supabase
        .from("shout_admins")
        .select("id")
        .eq("wallet_address", userAddress.toLowerCase())
        .single();
    
    return !!data;
}

// GET /api/admin/settings - Get app settings
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    try {
        if (key) {
            // Single key lookup
            const { data, error } = await supabase
                .from("shout_app_settings")
                .select("*")
                .eq("key", key)
                .single();

            if (error && error.code !== "PGRST116") {
                console.error("[Settings API] Error:", error);
                return NextResponse.json(
                    { error: "Failed to fetch setting" },
                    { status: 500 }
                );
            }

            return NextResponse.json({ settings: data });
        } else {
            // Get all settings
            const { data, error } = await supabase
                .from("shout_app_settings")
                .select("*");

            if (error) {
                console.error("[Settings API] Error:", error);
                return NextResponse.json(
                    { error: "Failed to fetch settings" },
                    { status: 500 }
                );
            }

            return NextResponse.json({ settings: data });
        }
    } catch (e) {
        console.error("[Settings API] Error:", e);
        return NextResponse.json(
            { error: "Failed to fetch settings" },
            { status: 500 }
        );
    }
}

// PUT /api/admin/settings - Update app setting (admin only)
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { key, value, userAddress } = body;

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address is required" },
                { status: 400 }
            );
        }

        if (!key || value === undefined) {
            return NextResponse.json(
                { error: "Key and value are required" },
                { status: 400 }
            );
        }

        // Check if admin
        const adminCheck = await isAdmin(userAddress);
        if (!adminCheck) {
            return NextResponse.json(
                { error: "Only admins can update app settings" },
                { status: 403 }
            );
        }

        // Upsert the setting
        const { data, error } = await supabase
            .from("shout_app_settings")
            .upsert({
                key,
                value,
                updated_by: userAddress.toLowerCase(),
                updated_at: new Date().toISOString(),
            }, { onConflict: "key" })
            .select()
            .single();

        if (error) {
            console.error("[Settings API] Update error:", error);
            return NextResponse.json(
                { error: "Failed to update setting" },
                { status: 500 }
            );
        }

        return NextResponse.json({ setting: data });
    } catch (e) {
        console.error("[Settings API] Error:", e);
        return NextResponse.json(
            { error: "Failed to update setting" },
            { status: 500 }
        );
    }
}
