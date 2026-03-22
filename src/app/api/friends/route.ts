import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/session";
import { logAccess } from "@/lib/auditLog";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/friends — List friends for the authenticated user.
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userAddress = session.userAddress.toLowerCase();

    logAccess(request, "friends.list", {
        userAddress,
        resourceTable: "shout_friends",
    });

    const { data, error } = await supabase
        .from("shout_friends")
        .select("id, user_address, friend_address, nickname, created_at")
        .eq("user_address", userAddress)
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ error: "Failed to fetch friends" }, { status: 500 });
    }

    return NextResponse.json({ friends: data ?? [] });
}
