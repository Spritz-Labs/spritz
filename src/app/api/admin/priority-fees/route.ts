import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey
        ? createClient(supabaseUrl, supabaseKey)
        : null;

const ADMIN_MESSAGE_EXPIRY_MS = 24 * 60 * 60 * 1000;

function validateMessageTimestamp(message: string): boolean {
    const match = message.match(/Issued At: ([^\n]+)/);
    if (!match) return false;
    const issuedAt = new Date(match[1]);
    if (isNaN(issuedAt.getTime())) return false;
    const age = Date.now() - issuedAt.getTime();
    return age <= ADMIN_MESSAGE_EXPIRY_MS && age >= -60000;
}

async function verifyAdmin(
    request: NextRequest,
): Promise<{ isAdmin: boolean; address: string | null }> {
    const address = request.headers.get("x-admin-address");
    const signature = request.headers.get("x-admin-signature");
    const encodedMessage = request.headers.get("x-admin-message");
    if (!address || !signature || !encodedMessage || !supabase)
        return { isAdmin: false, address: null };

    try {
        const message = decodeURIComponent(encodedMessage);
        if (!validateMessageTimestamp(message)) return { isAdmin: false, address: null };

        const isValid = await verifyMessage({
            address: address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        });
        if (!isValid) return { isAdmin: false, address: null };

        const { data } = await supabase
            .from("shout_admins")
            .select("wallet_address")
            .eq("wallet_address", address.toLowerCase())
            .single();

        return { isAdmin: !!data, address: address.toLowerCase() };
    } catch {
        return { isAdmin: false, address: null };
    }
}

/**
 * GET /api/admin/priority-fees — aggregated fee revenue & unsettled bookings
 */
export async function GET(request: NextRequest) {
    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin || !supabase) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "pending";

    const { data: fees, error } = await supabase
        .from("shout_scheduled_calls")
        .select(
            "id, scheduled_at, title, is_paid, payment_amount_cents, platform_fee_cents, platform_fee_status, payment_transaction_hash, recipient_wallet_address, scheduler_wallet_address",
        )
        .gt("platform_fee_cents", 0)
        .eq("platform_fee_status", status)
        .order("scheduled_at", { ascending: false })
        .limit(200);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const totalFeeCents = (fees ?? []).reduce(
        (sum, f) => sum + (f.platform_fee_cents ?? 0),
        0,
    );
    const totalRevenueCents = (fees ?? []).reduce(
        (sum, f) => sum + (f.payment_amount_cents ?? 0),
        0,
    );

    return NextResponse.json({
        status,
        count: fees?.length ?? 0,
        totalFeeCents,
        totalFeeUSD: (totalFeeCents / 100).toFixed(2),
        totalRevenueCents,
        totalRevenueUSD: (totalRevenueCents / 100).toFixed(2),
        feePercentage: "1%",
        bookings: fees,
    });
}

/**
 * POST /api/admin/priority-fees — mark fees as settled
 * Body: { callIds: string[] }
 */
export async function POST(request: NextRequest) {
    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin || !supabase) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { callIds } = await request.json();
    if (!Array.isArray(callIds) || callIds.length === 0) {
        return NextResponse.json(
            { error: "callIds array required" },
            { status: 400 },
        );
    }

    const { error } = await supabase
        .from("shout_scheduled_calls")
        .update({
            platform_fee_status: "settled",
            platform_fee_settled_at: new Date().toISOString(),
        })
        .in("id", callIds)
        .eq("platform_fee_status", "pending");

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, settledCount: callIds.length });
}
