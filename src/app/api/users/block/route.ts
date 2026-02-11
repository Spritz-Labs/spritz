import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { supabase, isSupabaseConfigured } from "@/config/supabase";

export const dynamic = "force-dynamic";

// GET /api/users/block - Get blocked users list
export async function GET(request: NextRequest) {
    if (!isSupabaseConfigured || !supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const session = await getAuthenticatedUser(request);
    if (!session?.userAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Get users I've blocked
        const { data: blockedByMe, error: error1 } = await supabase
            .from("shout_blocked_users")
            .select("*")
            .eq("blocker_address", session.userAddress.toLowerCase());

        if (error1) {
            console.error("[Block API] Error fetching blocks:", error1);
            // Graceful: return empty lists instead of 500 (e.g. table/column mismatch)
            return NextResponse.json({
                blockedUsers: [],
                blockedBy: [],
            });
        }

        // Get users who blocked me (for bidirectional blocking)
        const { data: blockedMe, error: error2 } = await supabase
            .from("shout_blocked_users")
            .select("blocker_address")
            .eq("blocked_address", session.userAddress.toLowerCase());

        if (error2) {
            console.error("[Block API] Error fetching blockers:", error2);
        }

        return NextResponse.json({
            blockedUsers: blockedByMe || [],
            blockedBy: blockedMe?.map(b => b.blocker_address) || [],
        });
    } catch (err) {
        console.error("[Block API] Error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

// POST /api/users/block - Block a user
export async function POST(request: NextRequest) {
    if (!isSupabaseConfigured || !supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const session = await getAuthenticatedUser(request);
    if (!session?.userAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { userAddress, reason } = body;

        if (!userAddress) {
            return NextResponse.json({ error: "Missing user address" }, { status: 400 });
        }

        // Can't block yourself
        if (userAddress.toLowerCase() === session.userAddress.toLowerCase()) {
            return NextResponse.json({ error: "Cannot block yourself" }, { status: 400 });
        }

        const { data, error } = await supabase
            .from("shout_blocked_users")
            .upsert({
                blocker_address: session.userAddress.toLowerCase(),
                blocked_address: userAddress.toLowerCase(),
                reason: reason || null,
            }, {
                onConflict: "blocker_address,blocked_address",
            })
            .select()
            .single();

        if (error) {
            console.error("[Block API] Error blocking user:", error);
            return NextResponse.json({ error: "Failed to block user" }, { status: 500 });
        }

        // Also remove any friend relationship (optional - cleanup)
        try {
            await supabase
                .from("shout_friends")
                .delete()
                .or(`and(user_address.eq.${session.userAddress.toLowerCase()},friend_address.eq.${userAddress.toLowerCase()}),and(user_address.eq.${userAddress.toLowerCase()},friend_address.eq.${session.userAddress.toLowerCase()})`);
        } catch {
            // Ignore friend cleanup errors
        }

        return NextResponse.json({ success: true, block: data });
    } catch (err) {
        console.error("[Block API] Error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

// DELETE /api/users/block - Unblock a user
export async function DELETE(request: NextRequest) {
    if (!isSupabaseConfigured || !supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const session = await getAuthenticatedUser(request);
    if (!session?.userAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");

        if (!userAddress) {
            return NextResponse.json({ error: "Missing user address" }, { status: 400 });
        }

        const { error } = await supabase
            .from("shout_blocked_users")
            .delete()
            .eq("blocker_address", session.userAddress.toLowerCase())
            .eq("blocked_address", userAddress.toLowerCase());

        if (error) {
            console.error("[Block API] Error unblocking user:", error);
            return NextResponse.json({ error: "Failed to unblock user" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[Block API] Error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
