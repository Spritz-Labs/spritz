import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { getCallerRole, roleRank, isValidRole, type ChannelRole } from "@/lib/channelRoles";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// PATCH /api/channels/[id]/members/[memberAddress]/role
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; memberAddress: string }> },
) {
    const { id: channelId, memberAddress } = await params;

    try {
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const body = await request.json();
        const { role: newRole } = body;

        if (!newRole || !isValidRole(newRole)) {
            return NextResponse.json(
                { error: "Invalid role. Must be one of: owner, admin, moderator, member" },
                { status: 400 },
            );
        }

        if (newRole === "owner") {
            return NextResponse.json(
                { error: "Cannot assign owner role. Transfer ownership instead." },
                { status: 400 },
            );
        }

        const callerRole = await getCallerRole(channelId, session.userAddress);
        if (!callerRole || roleRank(callerRole) < roleRank("admin" as ChannelRole)) {
            return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
        }

        const targetRole = await getCallerRole(channelId, memberAddress);
        if (!targetRole) {
            return NextResponse.json({ error: "User is not a member of this channel" }, { status: 404 });
        }

        if (roleRank(targetRole) >= roleRank(callerRole)) {
            return NextResponse.json(
                { error: "Cannot modify role of a member with equal or higher rank" },
                { status: 403 },
            );
        }

        if (roleRank(newRole as ChannelRole) >= roleRank(callerRole)) {
            return NextResponse.json(
                { error: "Cannot promote a member to your rank or higher" },
                { status: 403 },
            );
        }

        const { error } = await supabase
            .from("shout_channel_members")
            .update({ role: newRole })
            .eq("channel_id", channelId)
            .ilike("user_address", memberAddress.toLowerCase());

        if (error) {
            console.error("[Channels] Role update failed:", error);
            return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[Channels] Role error:", e);
        return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
    }
}
