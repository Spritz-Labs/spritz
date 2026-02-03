import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function canManageGroupPolls(userAddress: string): Promise<boolean> {
    const normalized = userAddress.toLowerCase();
    const { data: admin } = await supabase
        .from("shout_admins")
        .select("id")
        .eq("wallet_address", normalized)
        .single();
    if (admin) return true;
    const { data: globalMod } = await supabase
        .from("shout_moderators")
        .select("id")
        .eq("user_address", normalized)
        .is("channel_id", null)
        .single();
    return !!globalMod;
}

// PATCH /api/groups/[id]/polls/[pollId] - Update poll (admin/moderator)
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; pollId: string }> }
) {
    const { id: groupId, pollId } = await params;
    try {
        const body = await request.json();
        const {
            userAddress,
            question,
            options,
            allowsMultiple,
            endsAt,
            isAnonymous,
            isClosed,
        } = body;
        if (!userAddress) {
            return NextResponse.json(
                { error: "User address is required" },
                { status: 400 }
            );
        }
        const normalized = (userAddress as string).toLowerCase();
        const canManage = await canManageGroupPolls(normalized);
        if (!canManage) {
            return NextResponse.json(
                { error: "Only admins and moderators can update polls" },
                { status: 403 }
            );
        }
        const { data: existing } = await supabase
            .from("shout_group_polls")
            .select("id")
            .eq("id", pollId)
            .eq("group_id", groupId)
            .single();
        if (!existing) {
            return NextResponse.json(
                { error: "Poll not found" },
                { status: 404 }
            );
        }
        const updates: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };
        if (question !== undefined) updates.question = String(question).trim();
        if (options !== undefined) {
            const arr = Array.isArray(options) ? options : [];
            if (arr.length < 2 || arr.length > 10) {
                return NextResponse.json(
                    { error: "Options must be 2–10 items" },
                    { status: 400 }
                );
            }
            updates.options = arr.map((o: string) => String(o).trim());
        }
        if (allowsMultiple !== undefined)
            updates.allows_multiple = !!allowsMultiple;
        if (endsAt !== undefined)
            updates.ends_at = endsAt === null || endsAt === "" ? null : endsAt;
        if (isAnonymous !== undefined) updates.is_anonymous = !!isAnonymous;
        if (isClosed !== undefined) updates.is_closed = !!isClosed;
        const { data: poll, error } = await supabase
            .from("shout_group_polls")
            .update(updates)
            .eq("id", pollId)
            .eq("group_id", groupId)
            .select()
            .single();
        if (error) {
            console.error("[Group Polls API] Error updating poll:", error);
            return NextResponse.json(
                { error: "Failed to update poll" },
                { status: 500 }
            );
        }
        return NextResponse.json({ poll });
    } catch (e) {
        console.error("[Group Polls API] Error:", e);
        return NextResponse.json(
            { error: "Failed to update poll" },
            { status: 500 }
        );
    }
}

// DELETE /api/groups/[id]/polls/[pollId] - Delete poll (admin/moderator)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; pollId: string }> }
) {
    const { id: groupId, pollId } = await params;
    try {
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress")?.toLowerCase();
        if (!userAddress) {
            return NextResponse.json(
                { error: "User address is required" },
                { status: 400 }
            );
        }
        const canManage = await canManageGroupPolls(userAddress);
        if (!canManage) {
            return NextResponse.json(
                { error: "Only admins and moderators can delete polls" },
                { status: 403 }
            );
        }
        const { error } = await supabase
            .from("shout_group_polls")
            .delete()
            .eq("id", pollId)
            .eq("group_id", groupId);
        if (error) {
            console.error("[Group Polls API] Error deleting poll:", error);
            return NextResponse.json(
                { error: "Failed to delete poll" },
                { status: 500 }
            );
        }
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[Group Polls API] Error:", e);
        return NextResponse.json(
            { error: "Failed to delete poll" },
            { status: 500 }
        );
    }
}
