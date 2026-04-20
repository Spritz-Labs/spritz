import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { supabaseService } from "@/lib/supabaseServer";

/**
 * POST /api/phone/friends
 * Returns verified phone numbers for a list of wallet addresses.
 * Only returns numbers for addresses that are friends of the authenticated user.
 * Body: { addresses: string[] }
 */
export async function POST(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    if (!supabaseService) {
        return NextResponse.json({ phones: {} });
    }

    const userAddress = session.userAddress.toLowerCase();
    const { addresses } = await request.json();

    if (!Array.isArray(addresses) || addresses.length === 0) {
        return NextResponse.json({ phones: {} });
    }

    const normalized = addresses
        .slice(0, 500)
        .map((a: string) => a.toLowerCase());

    const { data: friendRows } = await supabaseService
        .from("shout_friends")
        .select("friend_address")
        .eq("user_address", userAddress)
        .in("friend_address", normalized);

    const friendSet = new Set(
        (friendRows ?? []).map((r) => r.friend_address),
    );

    if (friendSet.size === 0) {
        return NextResponse.json({ phones: {} });
    }

    const friendAddresses = [...friendSet];

    const { data: phoneRows } = await supabaseService
        .from("shout_phone_numbers")
        .select("wallet_address, phone_number")
        .in("wallet_address", friendAddresses)
        .eq("verified", true);

    const phones: Record<string, string> = {};
    for (const row of phoneRows ?? []) {
        phones[row.wallet_address] = row.phone_number;
    }

    return NextResponse.json(
        { phones },
        { headers: { "Cache-Control": "private, max-age=30" } },
    );
}
