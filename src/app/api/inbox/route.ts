import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/session";
import { friendRequestAddressCandidates } from "@/utils/address";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/**
 * GET /api/inbox — List inbox messages for the authenticated user.
 * Query params:
 *   status: "unclaimed" | "claimed" | "all" (default "all")
 *   limit: number (default 50, max 100)
 *   before: ISO timestamp for pagination
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 }
        );
    }

    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get("status") || "all";
        const limit = Math.min(
            parseInt(searchParams.get("limit") || "50", 10) || 50,
            100
        );
        const before = searchParams.get("before");

        const userAddress = session.userAddress.toLowerCase();
        const addressCandidates = friendRequestAddressCandidates(
            session.userAddress
        );
        const lookupAddresses =
            addressCandidates.length > 0
                ? addressCandidates
                : [userAddress];

        // Match on resolved wallet OR on the original identifier
        let query = supabase
            .from("shout_inbox")
            .select("*")
            .or(
                `recipient_address.in.(${lookupAddresses.map((a) => `"${a}"`).join(",")}),recipient_identifier.in.(${lookupAddresses.map((a) => `"${a}"`).join(",")})`
            )
            .order("created_at", { ascending: false })
            .limit(limit);

        if (status === "unclaimed") {
            query = query.eq("claimed", false);
        } else if (status === "claimed") {
            query = query.eq("claimed", true);
        }

        if (before) {
            query = query.lt("created_at", before);
        }

        // Filter out expired messages
        query = query.or(
            `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`
        );

        const { data: messages, error } = await query;

        if (error) {
            console.error("[Inbox] List error:", error);
            return NextResponse.json(
                { error: "Failed to fetch inbox messages" },
                { status: 500 }
            );
        }

        // Also return unclaimed count for badge/notification
        const { count: unclaimedCount } = await supabase
            .from("shout_inbox")
            .select("id", { count: "exact", head: true })
            .or(
                `recipient_address.in.(${lookupAddresses.map((a) => `"${a}"`).join(",")}),recipient_identifier.in.(${lookupAddresses.map((a) => `"${a}"`).join(",")})`
            )
            .eq("claimed", false)
            .or(
                `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`
            );

        return NextResponse.json({
            messages: messages ?? [],
            unclaimed: unclaimedCount ?? 0,
        });
    } catch (error) {
        console.error("[Inbox] List error:", error);
        return NextResponse.json(
            { error: "Failed to fetch inbox messages" },
            { status: 500 }
        );
    }
}
