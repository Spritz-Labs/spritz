import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { logAccess } from "@/lib/auditLog";
import { normalizeAddress } from "@/utils/address";
import { supabaseService } from "@/lib/supabaseServer";

/**
 * GET /api/friend-requests — List incoming and/or outgoing friend requests.
 * Query: ?type=incoming|outgoing|all (default: all)
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    if (!supabaseService) {
        return NextResponse.json({ incoming: [], outgoing: [] });
    }
    const supabase = supabaseService;
    const userAddress = normalizeAddress(session.userAddress);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? "all";

    logAccess(request, "friend_requests.list", {
        userAddress,
        resourceTable: "shout_friend_requests",
        metadata: { type },
    });

    const empty: { data: never[]; error: null } = { data: [], error: null };
    const incoming =
        type === "incoming" || type === "all"
            ? await supabase
                  .from("shout_friend_requests")
                  .select("*")
                  .eq("to_address", userAddress)
                  .eq("status", "pending")
            : empty;
    const outgoing =
        type === "outgoing" || type === "all"
            ? await supabase
                  .from("shout_friend_requests")
                  .select("*")
                  .eq("from_address", userAddress)
                  .eq("status", "pending")
            : empty;

    const hasError = (r: { error?: unknown }) => r.error != null;
    if (hasError(incoming) || hasError(outgoing)) {
        return NextResponse.json({ error: "Failed to fetch friend requests" }, { status: 500 });
    }

    return NextResponse.json(
        {
            incoming: incoming.data ?? [],
            outgoing: outgoing.data ?? [],
        },
        { headers: { "Cache-Control": "private, max-age=10" } }
    );
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

    if (!supabaseService) {
        return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }
    const supabase = supabaseService;
    const fromAddress = normalizeAddress(session.userAddress);
    const normalizedTo = normalizeAddress(toAddress);

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

    const oldRequestIds =
        existingRequests
            ?.filter((r) => r.status !== "pending")
            .map((r) => r.id) ?? [];
    // PERF: collapse N sequential deletes into a single IN(...) delete.
    if (oldRequestIds.length > 0) {
        await supabase
            .from("shout_friend_requests")
            .delete()
            .in("id", oldRequestIds);
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
