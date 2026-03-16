import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/friend-requests/[id]/reject — Reject an incoming friend request.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userAddress = session.userAddress.toLowerCase();

    const { data: req } = await supabase
        .from("shout_friend_requests")
        .select("id")
        .eq("id", id)
        .eq("to_address", userAddress)
        .eq("status", "pending")
        .maybeSingle();

    if (!req) {
        return NextResponse.json({ error: "Request not found or already handled" }, { status: 404 });
    }

    const { error } = await supabase
        .from("shout_friend_requests")
        .update({ status: "rejected", updated_at: new Date().toISOString() })
        .eq("id", id);

    if (error) {
        return NextResponse.json({ error: "Failed to reject request" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
