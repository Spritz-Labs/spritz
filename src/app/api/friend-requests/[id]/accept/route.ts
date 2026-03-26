import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/session";
import { normalizeAddress } from "@/utils/address";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/friend-requests/[id]/accept — Accept an incoming friend request.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userAddress = normalizeAddress(session.userAddress);

    const { data: req, error: fetchErr } = await supabase
        .from("shout_friend_requests")
        .select("*")
        .eq("id", id)
        .eq("to_address", userAddress)
        .eq("status", "pending")
        .maybeSingle();

    if (fetchErr || !req) {
        return NextResponse.json({ error: "Request not found or already handled" }, { status: 404 });
    }

    await supabase
        .from("shout_friend_requests")
        .update({ status: "accepted", updated_at: new Date().toISOString() })
        .eq("id", id);

    const { error: insertErr } = await supabase.from("shout_friends").insert([
        { user_address: userAddress, friend_address: req.from_address },
        { user_address: req.from_address, friend_address: userAddress },
    ]);

    if (insertErr) {
        return NextResponse.json({ error: "Failed to add friend" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
