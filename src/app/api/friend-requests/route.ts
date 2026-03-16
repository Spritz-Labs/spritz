import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/friend-requests — List incoming and/or outgoing friend requests.
 * Query: ?type=incoming|outgoing|all (default: all)
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userAddress = session.userAddress.toLowerCase();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? "all";

    const incoming =
        type === "incoming" || type === "all"
            ? await supabase
                  .from("shout_friend_requests")
                  .select("*")
                  .eq("to_address", userAddress)
                  .eq("status", "pending")
            : { data: [] };
    const outgoing =
        type === "outgoing" || type === "all"
            ? await supabase
                  .from("shout_friend_requests")
                  .select("*")
                  .eq("from_address", userAddress)
                  .eq("status", "pending")
            : { data: [] };

    if (incoming.error || outgoing.error) {
        return NextResponse.json({ error: "Failed to fetch friend requests" }, { status: 500 });
    }

    return NextResponse.json({
        incoming: incoming.data ?? [],
        outgoing: outgoing.data ?? [],
    });
}

/**
 * POST /api/friend-requests — Send a friend request.
 * Body: { toAddress: string, memo?: string }
 */
export async function POST(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const body = await request.json().catch(() => ({}));
    const toAddress = typeof body.toAddress === "string" ? body.toAddress.trim() : "";
    const memo = typeof body.memo === "string" ? body.memo.trim().slice(0, 100) : undefined;

    if (!toAddress || toAddress.length < 10) {
        return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const fromAddress = session.userAddress.toLowerCase();
    const normalizedTo = toAddress.toLowerCase();

    if (fromAddress === normalizedTo) {
        return NextResponse.json({ error: "Cannot send request to yourself" }, { status: 400 });
    }

    const { data: existingFriend } = await supabase
        .from("shout_friends")
        .select("id")
        .eq("user_address", fromAddress)
        .eq("friend_address", normalizedTo)
        .maybeSingle();

    if (existingFriend) {
        return NextResponse.json({ error: "Already friends with this address" }, { status: 400 });
    }

    const { data: existingRequests } = await supabase
        .from("shout_friend_requests")
        .select("id, status")
        .or(
            `and(from_address.eq.${fromAddress},to_address.eq.${normalizedTo}),and(from_address.eq.${normalizedTo},to_address.eq.${fromAddress})`
        );

    const pending = existingRequests?.find((r) => r.status === "pending");
    if (pending) {
        return NextResponse.json({ error: "Friend request already pending" }, { status: 400 });
    }

    const oldRequests = existingRequests?.filter((r) => r.status !== "pending") ?? [];
    for (const req of oldRequests) {
        await supabase.from("shout_friend_requests").delete().eq("id", req.id);
    }

    await supabase.from("shout_users").upsert({ wallet_address: fromAddress }, { onConflict: "wallet_address" });

    const { data: inserted, error } = await supabase
        .from("shout_friend_requests")
        .insert({
            from_address: fromAddress,
            to_address: normalizedTo,
            status: "pending",
            ...(memo ? { memo } : {}),
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message || "Failed to send friend request" }, { status: 500 });
    }

    return NextResponse.json({ request: inserted });
}
