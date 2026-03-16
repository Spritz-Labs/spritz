import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * PATCH /api/friends/[id] — Update friend nickname.
 * Body: { nickname: string }
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const nickname = typeof body.nickname === "string" ? body.nickname.trim() : null;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userAddress = session.userAddress.toLowerCase();

    const { data: friend } = await supabase
        .from("shout_friends")
        .select("id")
        .eq("id", id)
        .eq("user_address", userAddress)
        .maybeSingle();

    if (!friend) {
        return NextResponse.json({ error: "Friend not found" }, { status: 404 });
    }

    const { error } = await supabase
        .from("shout_friends")
        .update({ nickname: nickname || null })
        .eq("id", id);

    if (error) {
        return NextResponse.json({ error: "Failed to update nickname" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}

/**
 * DELETE /api/friends/[id] — Remove a friend (by friend record id).
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const { id } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userAddress = session.userAddress.toLowerCase();

    const { data: friend } = await supabase
        .from("shout_friends")
        .select("id, friend_address")
        .eq("id", id)
        .eq("user_address", userAddress)
        .maybeSingle();

    if (!friend) {
        return NextResponse.json({ error: "Friend not found" }, { status: 404 });
    }

    const friendAddress = friend.friend_address.toLowerCase();
    const { error } = await supabase
        .from("shout_friends")
        .delete()
        .or(
            `and(user_address.eq.${userAddress},friend_address.eq.${friendAddress}),and(user_address.eq.${friendAddress},friend_address.eq.${userAddress})`
        );

    if (error) {
        return NextResponse.json({ error: "Failed to remove friend" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
