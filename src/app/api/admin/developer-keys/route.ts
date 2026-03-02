import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

async function verifyAdmin(request: NextRequest): Promise<{ isAdmin: boolean; address: string | null }> {
    const address = request.headers.get("x-admin-address");
    const signature = request.headers.get("x-admin-signature");
    const encodedMessage = request.headers.get("x-admin-message");

    if (!address || !signature || !encodedMessage || !supabase) {
        return { isAdmin: false, address: null };
    }
    try {
        const message = decodeURIComponent(atob(encodedMessage));
        const isValid = await verifyMessage({
            address: address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        });
        if (!isValid) return { isAdmin: false, address: null };
        const { data: admin } = await supabase
            .from("shout_admins")
            .select("id")
            .eq("wallet_address", address.toLowerCase())
            .single();
        return { isAdmin: !!admin, address: address.toLowerCase() };
    } catch {
        return { isAdmin: false, address: null };
    }
}

/**
 * GET: List developer API keys (all or pending only). Admin only.
 */
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }
    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const pendingOnly = searchParams.get("pending") === "true";

    let query = supabase
        .from("shout_developer_keys")
        .select("id, developer_address, name, scopes, rate_limit_per_minute, is_active, approved_at, revoked_at, created_at, last_used_at")
        .order("created_at", { ascending: false });

    if (pendingOnly) {
        query = query.is("approved_at", null).eq("is_active", true).is("revoked_at", null);
    }

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 });
    }

    const keys = (data || []).map((k) => ({
        ...k,
        status: k.revoked_at ? "revoked" : k.approved_at ? "approved" : "pending",
    }));

    return NextResponse.json({ keys });
}
