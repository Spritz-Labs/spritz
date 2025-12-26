import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
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

    try {
        // Decode the base64 encoded message
        const message = decodeURIComponent(atob(encodedMessage));
        
        const isValidSignature = await verifyMessage({
            address: address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        });

        if (!isValidSignature) {
            return { isAdmin: false, address: null };
        }

        const { data: admin } = await supabase
            .from("shout_admins")
            .select("*")
            .eq("wallet_address", address.toLowerCase())
            .single();

        return { isAdmin: !!admin, address: address.toLowerCase() };
    } catch {
        return { isAdmin: false, address: null };
    }
}

// Generate a random invite code
function generateInviteCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars (0, O, 1, I)
    let code = "";
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// GET: List all invite codes
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const activeOnly = searchParams.get("activeOnly") === "true";

    let query = supabase
        .from("shout_invite_codes")
        .select("*", { count: "exact" });

    if (activeOnly) {
        query = query.eq("is_active", true);
    }

    query = query
        .order("created_at", { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

    const { data: codes, error, count } = await query;

    if (error) {
        console.error("[Admin] Error fetching invite codes:", error);
        return NextResponse.json({ error: "Failed to fetch codes" }, { status: 500 });
    }

    // Get usage stats for each code
    const codesWithUsage = await Promise.all(
        (codes || []).map(async (code) => {
            const { data: usage } = await supabase
                .from("shout_invite_code_usage")
                .select("used_by, used_at")
                .eq("code", code.code);
            return { ...code, usedBy: usage || [] };
        })
    );

    return NextResponse.json({
        codes: codesWithUsage,
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
    });
}

// POST: Create new invite code
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin, address: adminAddress } = await verifyAdmin(request);
    if (!isAdmin || !adminAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { maxUses, expiresAt, note, customCode } = await request.json();

        // Generate or use custom code
        let code = customCode || generateInviteCode();
        
        // Check if custom code already exists
        if (customCode) {
            const { data: existing } = await supabase
                .from("shout_invite_codes")
                .select("id")
                .eq("code", customCode.toUpperCase())
                .single();
            
            if (existing) {
                return NextResponse.json({ error: "Code already exists" }, { status: 400 });
            }
            code = customCode.toUpperCase();
        }

        const { data, error } = await supabase
            .from("shout_invite_codes")
            .insert({
                code,
                created_by: adminAddress,
                max_uses: maxUses || 1,
                expires_at: expiresAt || null,
                note: note || null,
            })
            .select()
            .single();

        if (error) {
            console.error("[Admin] Error creating invite code:", error);
            return NextResponse.json({ error: "Failed to create code" }, { status: 500 });
        }

        // Log activity
        await supabase.from("shout_admin_activity").insert({
            admin_address: adminAddress,
            action: "create_invite_code",
            details: { code, maxUses, expiresAt, note },
        });

        return NextResponse.json({ success: true, code: data });
    } catch (error) {
        console.error("[Admin] Error:", error);
        return NextResponse.json({ error: "Failed to create code" }, { status: 500 });
    }
}

// PATCH: Update invite code (deactivate, etc.)
export async function PATCH(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin, address: adminAddress } = await verifyAdmin(request);
    if (!isAdmin || !adminAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { code, isActive, note } = await request.json();

        if (!code) {
            return NextResponse.json({ error: "Code required" }, { status: 400 });
        }

        const updates: Record<string, unknown> = {};
        if (typeof isActive === "boolean") updates.is_active = isActive;
        if (note !== undefined) updates.note = note;

        const { error } = await supabase
            .from("shout_invite_codes")
            .update(updates)
            .eq("code", code);

        if (error) {
            console.error("[Admin] Error updating invite code:", error);
            return NextResponse.json({ error: "Failed to update code" }, { status: 500 });
        }

        // Log activity
        await supabase.from("shout_admin_activity").insert({
            admin_address: adminAddress,
            action: isActive === false ? "deactivate_invite_code" : "update_invite_code",
            details: { code, ...updates },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Admin] Error:", error);
        return NextResponse.json({ error: "Failed to update code" }, { status: 500 });
    }
}

// DELETE: Delete invite code
export async function DELETE(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin, address: adminAddress } = await verifyAdmin(request);
    if (!isAdmin || !adminAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
        return NextResponse.json({ error: "Code required" }, { status: 400 });
    }

    const { error } = await supabase
        .from("shout_invite_codes")
        .delete()
        .eq("code", code);

    if (error) {
        console.error("[Admin] Error deleting invite code:", error);
        return NextResponse.json({ error: "Failed to delete code" }, { status: 500 });
    }

    // Log activity
    await supabase.from("shout_admin_activity").insert({
        admin_address: adminAddress,
        action: "delete_invite_code",
        details: { code },
    });

    return NextResponse.json({ success: true });
}

