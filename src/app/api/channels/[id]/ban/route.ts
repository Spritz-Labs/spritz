import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { getCallerRole, roleRank, type ChannelRole } from "@/lib/channelRoles";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// POST /api/channels/[id]/ban - Ban a user
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: channelId } = await params;

    try {
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const body = await request.json();
        const { userAddress, reason } = body;

        if (!userAddress) {
            return NextResponse.json({ error: "userAddress is required" }, { status: 400 });
        }

        const callerRole = await getCallerRole(channelId, session.userAddress);
        if (!callerRole || roleRank(callerRole) < roleRank("admin" as ChannelRole)) {
            return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
        }

        const targetRole = await getCallerRole(channelId, userAddress);
        if (targetRole && roleRank(targetRole) >= roleRank(callerRole)) {
            return NextResponse.json(
                { error: "Cannot ban a member with equal or higher rank" },
                { status: 403 },
            );
        }

        // Remove from members if present
        await supabase
            .from("shout_channel_members")
            .delete()
            .eq("channel_id", channelId)
            .ilike("user_address", userAddress.toLowerCase());

        // Add to bans
        const { error } = await supabase
            .from("shout_channel_bans")
            .upsert(
                {
                    channel_id: channelId,
                    user_address: userAddress.toLowerCase(),
                    banned_by: session.userAddress.toLowerCase(),
                    reason: reason || null,
                },
                { onConflict: "channel_id,user_address" },
            );

        if (error) {
            console.error("[Channels] Ban failed:", error);
            return NextResponse.json({ error: "Failed to ban user" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[Channels] Ban error:", e);
        return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
    }
}

// DELETE /api/channels/[id]/ban?userAddress=... - Unban a user
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: channelId } = await params;

    try {
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const userAddress = request.nextUrl.searchParams.get("userAddress");
        if (!userAddress) {
            return NextResponse.json({ error: "userAddress query param is required" }, { status: 400 });
        }

        const callerRole = await getCallerRole(channelId, session.userAddress);
        if (!callerRole || roleRank(callerRole) < roleRank("admin" as ChannelRole)) {
            return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
        }

        const { error } = await supabase
            .from("shout_channel_bans")
            .delete()
            .eq("channel_id", channelId)
            .ilike("user_address", userAddress.toLowerCase());

        if (error) {
            console.error("[Channels] Unban failed:", error);
            return NextResponse.json({ error: "Failed to unban user" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[Channels] Unban error:", e);
        return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
    }
}

// GET /api/channels/[id]/ban - List bans
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id: channelId } = await params;

    try {
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const callerRole = await getCallerRole(channelId, session.userAddress);
        if (!callerRole || roleRank(callerRole) < roleRank("moderator" as ChannelRole)) {
            return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
        }

        const { data: bans, error } = await supabase
            .from("shout_channel_bans")
            .select("*")
            .eq("channel_id", channelId)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("[Channels] List bans failed:", error);
            return NextResponse.json({ error: "Failed to list bans" }, { status: 500 });
        }

        return NextResponse.json({ bans: bans ?? [] });
    } catch (e) {
        console.error("[Channels] Bans error:", e);
        return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
    }
}
