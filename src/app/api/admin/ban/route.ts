import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/admin/ban?address=xxx - Check if a user is banned
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");

    if (!address) {
        return NextResponse.json({ error: "Address required" }, { status: 400 });
    }

    try {
        const { data } = await supabase
            .from("shout_users")
            .select("is_banned, ban_reason")
            .eq("wallet_address", address.toLowerCase())
            .single();

        return NextResponse.json({
            isBanned: data?.is_banned || false,
            banReason: data?.ban_reason || null,
        });
    } catch {
        return NextResponse.json({ isBanned: false });
    }
}

// POST /api/admin/ban - Ban or unban a user (admin only)
export async function POST(request: NextRequest) {
    try {
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const adminAddress = session.userAddress.toLowerCase();

        // Check if caller is admin
        const { data: adminData } = await supabase
            .from("shout_admins")
            .select("wallet_address")
            .eq("wallet_address", adminAddress)
            .single();

        if (!adminData) {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        const { userAddress, ban, reason } = await request.json();

        if (!userAddress) {
            return NextResponse.json({ error: "userAddress required" }, { status: 400 });
        }

        // Can't ban yourself
        if (userAddress.toLowerCase() === adminAddress) {
            return NextResponse.json({ error: "Cannot ban yourself" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Update user ban status
        const { error } = await supabase
            .from("shout_users")
            .update({
                is_banned: !!ban,
                ban_reason: ban ? (reason || "Banned by admin") : null,
                updated_at: new Date().toISOString(),
            })
            .eq("wallet_address", normalizedAddress);

        if (error) {
            console.error("[Ban API] Error:", error);
            return NextResponse.json({ error: "Failed to update ban status" }, { status: 500 });
        }

        // Log the action (don't fail if logging fails)
        try {
            await supabase.from("shout_admin_activity").insert({
                admin_address: adminAddress,
                action: ban ? "ban_user" : "unban_user",
                target_address: normalizedAddress,
                details: { reason: reason || null },
            });
        } catch {
            // Ignore logging errors
        }

        return NextResponse.json({
            success: true,
            banned: !!ban,
        });
    } catch (e) {
        console.error("[Ban API] Error:", e);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
