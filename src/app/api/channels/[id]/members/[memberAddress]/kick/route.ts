import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser, getValidatedApiKey } from "@/lib/session";
import { getCallerRole, roleRank, apiKeyOwnsChannel, type ChannelRole } from "@/lib/channelRoles";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/channels/[id]/members/[memberAddress]/kick
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; memberAddress: string }> }
) {
    const { id: channelId, memberAddress } = await params;

    try {
        const session = await getAuthenticatedUser(request);
        const apiKey = !session ? await getValidatedApiKey(request) : null;

        if (!session?.userAddress && !apiKey) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        // API key auth: full control over channels it created
        if (apiKey && !session) {
            const hasPermission = await apiKeyOwnsChannel(channelId, apiKey);
            if (!hasPermission) {
                return NextResponse.json(
                    { error: "API key does not have permission on this channel" },
                    { status: 403 }
                );
            }

            const { error } = await supabase
                .from("shout_channel_members")
                .delete()
                .eq("channel_id", channelId)
                .ilike("user_address", memberAddress.toLowerCase());

            if (error) {
                console.error("[Channels] API key kick failed:", error);
                return NextResponse.json({ error: "Failed to kick member" }, { status: 500 });
            }

            return NextResponse.json({ success: true });
        }

        const callerRole = await getCallerRole(channelId, session!.userAddress);
        if (!callerRole || roleRank(callerRole) < roleRank("moderator" as ChannelRole)) {
            return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
        }

        const targetRole = await getCallerRole(channelId, memberAddress);
        if (!targetRole) {
            return NextResponse.json(
                { error: "User is not a member of this channel" },
                { status: 404 }
            );
        }

        if (roleRank(targetRole) >= roleRank(callerRole)) {
            return NextResponse.json(
                { error: "Cannot kick a member with equal or higher rank" },
                { status: 403 }
            );
        }

        const { error } = await supabase
            .from("shout_channel_members")
            .delete()
            .eq("channel_id", channelId)
            .ilike("user_address", memberAddress.toLowerCase());

        if (error) {
            console.error("[Channels] Kick failed:", error);
            return NextResponse.json({ error: "Failed to kick member" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("[Channels] Kick error:", e);
        return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
    }
}
