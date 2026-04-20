import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { supabaseService } from "@/lib/supabaseServer";

/**
 * POST /api/phone/lookup
 * Look up a wallet address by verified phone number.
 * Body: { phone: string }
 */
export async function POST(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    if (!supabaseService) {
        return NextResponse.json({ data: null });
    }

    const { phone } = await request.json();
    if (!phone || typeof phone !== "string") {
        return NextResponse.json({ data: null });
    }

    let normalized = phone.replace(/[^\d+]/g, "");
    if (!normalized.startsWith("+")) {
        if (normalized.length === 10) {
            normalized = "+1" + normalized;
        } else if (normalized.length === 11 && normalized.startsWith("1")) {
            normalized = "+" + normalized;
        }
    }

    const { data, error } = await supabaseService
        .from("shout_phone_numbers")
        .select("wallet_address, phone_number, verified")
        .eq("phone_number", normalized)
        .eq("verified", true)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ data: null });
    }

    return NextResponse.json({ data });
}
