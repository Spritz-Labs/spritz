import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { logAccess } from "@/lib/auditLog";
import { normalizeAddress } from "@/utils/address";
import { supabaseService } from "@/lib/supabaseServer";

/**
 * GET /api/friends — List friends for the authenticated user.
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    if (!supabaseService) {
        return NextResponse.json({ friends: [] });
    }

    const userAddress = normalizeAddress(session.userAddress);

    logAccess(request, "friends.list", {
        userAddress,
        resourceTable: "shout_friends",
    });

    const { data, error } = await supabaseService
        .from("shout_friends")
        .select("id, user_address, friend_address, nickname, created_at")
        .eq("user_address", userAddress)
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ error: "Failed to fetch friends" }, { status: 500 });
    }

    return NextResponse.json(
        { friends: data ?? [] },
        { headers: { "Cache-Control": "private, max-age=10" } }
    );
}
