import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/session";
import { friendRequestAddressCandidates } from "@/utils/address";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/**
 * POST /api/inbox/claim — Mark inbox messages as claimed.
 * Body: { messageIds: string[] } or { all: true } to claim all.
 */
export async function POST(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 }
        );
    }

    try {
        const body = await request.json();
        const { messageIds, all } = body;

        if (!all && (!Array.isArray(messageIds) || messageIds.length === 0)) {
            return NextResponse.json(
                { error: "Provide messageIds array or { all: true }" },
                { status: 400 }
            );
        }

        const userAddress = session.userAddress.toLowerCase();
        const addressCandidates = friendRequestAddressCandidates(
            session.userAddress
        );
        const lookupAddresses =
            addressCandidates.length > 0
                ? addressCandidates
                : [userAddress];

        const recipientFilter = `recipient_address.in.(${lookupAddresses.map((a) => `"${a}"`).join(",")}),recipient_identifier.in.(${lookupAddresses.map((a) => `"${a}"`).join(",")})`;
        const now = new Date().toISOString();

        let query = supabase
            .from("shout_inbox")
            .update({ claimed: true, claimed_at: now })
            .eq("claimed", false)
            .or(recipientFilter);

        if (!all && messageIds) {
            query = query.in("id", messageIds);
        }

        const { data, error } = await query.select("id");

        if (error) {
            console.error("[Inbox] Claim error:", error);
            return NextResponse.json(
                { error: "Failed to claim messages" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, claimed: data?.length ?? 0 });
    } catch (error) {
        console.error("[Inbox] Claim error:", error);
        return NextResponse.json(
            { error: "Failed to claim messages" },
            { status: 500 }
        );
    }
}
