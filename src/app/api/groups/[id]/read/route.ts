import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
        ? createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL,
              process.env.SUPABASE_SERVICE_ROLE_KEY,
          )
        : null;

// POST /api/groups/[id]/read - Set my last read message (any group member)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }
    const { id: groupId } = await params;

    try {
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }
        const userAddress = session.userAddress.toLowerCase();

        const body = await request.json().catch(() => ({}));
        const messageId = body.messageId as string | undefined;

        if (!messageId || typeof messageId !== "string") {
            return NextResponse.json(
                { error: "messageId is required" },
                { status: 400 },
            );
        }

        const { error } = await supabase
            .from("shout_group_read_receipts")
            .upsert(
                {
                    group_id: groupId,
                    user_address: userAddress,
                    last_read_message_id: messageId,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "group_id,user_address" },
            );

        if (error) {
            console.error("[Groups Read] POST error:", error);
            return NextResponse.json(
                { error: "Failed to update read receipt" },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[Groups Read] Error:", e);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 },
        );
    }
}

// GET /api/groups/[id]/read - Get all members' last read message ids (for "Read by N")
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }
    const { id: groupId } = await params;

    try {
        const { data, error } = await supabase
            .from("shout_group_read_receipts")
            .select("user_address, last_read_message_id")
            .eq("group_id", groupId);

        if (error) {
            console.error("[Groups Read] GET error:", error);
            return NextResponse.json(
                { error: "Failed to fetch read receipts" },
                { status: 500 },
            );
        }

        return NextResponse.json({
            receipts: (data || []).map((r) => ({
                userAddress: r.user_address,
                lastReadMessageId: r.last_read_message_id,
            })),
        });
    } catch (e) {
        console.error("[Groups Read] Error:", e);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 },
        );
    }
}
