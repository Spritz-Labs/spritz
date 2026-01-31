import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL,
              process.env.SUPABASE_SERVICE_ROLE_KEY
          )
        : null;

// GET /api/groups/[id]/pin - Get pinned message ids for a group
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 }
        );
    }
    const { id: groupId } = await params;

    try {
        const { data, error } = await supabase
            .from("shout_group_pinned_messages")
            .select("message_id, pinned_by, pinned_at")
            .eq("group_id", groupId)
            .order("pinned_at", { ascending: false });

        if (error) {
            console.error("[Groups Pin] GET error:", error);
            return NextResponse.json(
                { error: "Failed to fetch pinned messages" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            pinned: (data || []).map((r) => ({
                messageId: r.message_id,
                pinnedBy: r.pinned_by,
                pinnedAt: r.pinned_at,
            })),
        });
    } catch (e) {
        console.error("[Groups Pin] Error:", e);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}

// POST /api/groups/[id]/pin - Pin or unpin a message (any group member)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 }
        );
    }
    const { id: groupId } = await params;

    try {
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }
        const userAddress = session.userAddress.toLowerCase();

        const body = await request.json();
        const { messageId, pin } = body;

        if (!messageId || typeof pin !== "boolean") {
            return NextResponse.json(
                { error: "messageId and pin (boolean) are required" },
                { status: 400 }
            );
        }

        if (pin) {
            const { error } = await supabase
                .from("shout_group_pinned_messages")
                .upsert(
                    {
                        group_id: groupId,
                        message_id: String(messageId),
                        pinned_by: userAddress,
                        pinned_at: new Date().toISOString(),
                    },
                    { onConflict: "group_id,message_id" }
                );

            if (error) {
                console.error("[Groups Pin] INSERT error:", error);
                return NextResponse.json(
                    { error: "Failed to pin message" },
                    { status: 500 }
                );
            }
            return NextResponse.json({
                success: true,
                messageId,
                pinned: true,
                pinnedBy: userAddress,
            });
        }

        const { error } = await supabase
            .from("shout_group_pinned_messages")
            .delete()
            .eq("group_id", groupId)
            .eq("message_id", String(messageId));

        if (error) {
            console.error("[Groups Pin] DELETE error:", error);
            return NextResponse.json(
                { error: "Failed to unpin message" },
                { status: 500 }
            );
        }
        return NextResponse.json({
            success: true,
            messageId,
            pinned: false,
        });
    } catch (e) {
        console.error("[Groups Pin] Error:", e);
        return NextResponse.json(
            { error: "Failed to process request" },
            { status: 500 }
        );
    }
}
