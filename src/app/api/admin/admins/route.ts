import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// Verify admin signature from headers
async function verifyAdmin(request: NextRequest): Promise<{ isAdmin: boolean; address: string | null; isSuperAdmin: boolean }> {
    const address = request.headers.get("x-admin-address");
    const signature = request.headers.get("x-admin-signature");
    const encodedMessage = request.headers.get("x-admin-message");

    if (!address || !signature || !encodedMessage || !supabase) {
        return { isAdmin: false, address: null, isSuperAdmin: false };
    }

    try {
        // Decode the base64 encoded message
        const message = decodeURIComponent(atob(encodedMessage));
        
        const isValidSignature = await verifyMessage({
            address: address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        });

        if (!isValidSignature) {
            return { isAdmin: false, address: null, isSuperAdmin: false };
        }

        const { data: admin } = await supabase
            .from("shout_admins")
            .select("*")
            .eq("wallet_address", address.toLowerCase())
            .single();

        return { 
            isAdmin: !!admin, 
            address: address.toLowerCase(),
            isSuperAdmin: admin?.is_super_admin || false 
        };
    } catch {
        return { isAdmin: false, address: null, isSuperAdmin: false };
    }
}

// GET: List all admins
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: admins, error } = await supabase
        .from("shout_admins")
        .select("*")
        .order("created_at", { ascending: true });

    if (error) {
        console.error("[Admin] Error fetching admins:", error);
        return NextResponse.json({ error: "Failed to fetch admins" }, { status: 500 });
    }

    return NextResponse.json({ admins });
}

// POST: Add new admin (super admin only)
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin, address: adminAddress, isSuperAdmin } = await verifyAdmin(request);
    if (!isAdmin || !adminAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isSuperAdmin) {
        return NextResponse.json({ error: "Super admin access required" }, { status: 403 });
    }

    try {
        const { walletAddress, makeSuperAdmin } = await request.json();

        if (!walletAddress) {
            return NextResponse.json({ error: "Wallet address required" }, { status: 400 });
        }

        // Check if already an admin
        const { data: existing } = await supabase
            .from("shout_admins")
            .select("id")
            .eq("wallet_address", walletAddress.toLowerCase())
            .single();

        if (existing) {
            return NextResponse.json({ error: "User is already an admin" }, { status: 400 });
        }

        const { data, error } = await supabase
            .from("shout_admins")
            .insert({
                wallet_address: walletAddress.toLowerCase(),
                added_by: adminAddress,
                is_super_admin: makeSuperAdmin || false,
            })
            .select()
            .single();

        if (error) {
            console.error("[Admin] Error adding admin:", error);
            return NextResponse.json({ error: "Failed to add admin" }, { status: 500 });
        }

        // Log activity
        await supabase.from("shout_admin_activity").insert({
            admin_address: adminAddress,
            action: "add_admin",
            target_address: walletAddress.toLowerCase(),
            details: { isSuperAdmin: makeSuperAdmin || false },
        });

        return NextResponse.json({ success: true, admin: data });
    } catch (error) {
        console.error("[Admin] Error:", error);
        return NextResponse.json({ error: "Failed to add admin" }, { status: 500 });
    }
}

// DELETE: Remove admin (super admin only)
export async function DELETE(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin, address: adminAddress, isSuperAdmin } = await verifyAdmin(request);
    if (!isAdmin || !adminAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isSuperAdmin) {
        return NextResponse.json({ error: "Super admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get("address");

    if (!walletAddress) {
        return NextResponse.json({ error: "Address required" }, { status: 400 });
    }

    // Prevent removing yourself
    if (walletAddress.toLowerCase() === adminAddress) {
        return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
    }

    const { error } = await supabase
        .from("shout_admins")
        .delete()
        .eq("wallet_address", walletAddress.toLowerCase());

    if (error) {
        console.error("[Admin] Error removing admin:", error);
        return NextResponse.json({ error: "Failed to remove admin" }, { status: 500 });
    }

    // Log activity
    await supabase.from("shout_admin_activity").insert({
        admin_address: adminAddress,
        action: "remove_admin",
        target_address: walletAddress.toLowerCase(),
    });

    return NextResponse.json({ success: true });
}

