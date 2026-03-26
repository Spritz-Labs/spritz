import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/session";
import { normalizeAddress } from "@/utils/address";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * DELETE /api/friend-requests/[id] — Cancel an outgoing friend request.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userAddress = normalizeAddress(session.userAddress);

    const { error } = await supabase
        .from("shout_friend_requests")
        .delete()
        .eq("id", id)
        .eq("from_address", userAddress);

    if (error) {
        return NextResponse.json({ error: "Failed to cancel request" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
