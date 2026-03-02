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
 * POST: Approve a developer API key. Admin only. Key will become usable.
 */
export async function POST(
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

    const { data: key, error: fetchError } = await supabase
        .from("shout_developer_keys")
        .select("id, approved_at, revoked_at")
        .eq("id", id)
        .single();

    if (fetchError || !key) {
        return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }
    if (key.revoked_at) {
        return NextResponse.json({ error: "Cannot approve a revoked key" }, { status: 400 });
    }
    if (key.approved_at) {
        return NextResponse.json({ success: true, message: "Key was already approved" });
    }

    const { error: updateError } = await supabase
        .from("shout_developer_keys")
        .update({ approved_at: new Date().toISOString() })
        .eq("id", id);

    if (updateError) {
        return NextResponse.json({ error: "Failed to approve key" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "API key approved" });
}
