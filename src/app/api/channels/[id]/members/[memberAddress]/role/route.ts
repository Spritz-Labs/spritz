import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser, getValidatedApiKey } from "@/lib/session";
import { getCallerRole, roleRank, isValidRole, type ChannelRole } from "@/lib/channelRoles";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// PATCH /api/channels/[id]/members/[memberAddress]/role
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; memberAddress: string }> }
) {
    const { id: channelId, memberAddress } = await params;

    try {
        // Support both session auth and API key auth
        const session = await getAuthenticatedUser(request);
        const apiKey = !session ? await getValidatedApiKey(request) : null;

        if (!session?.userAddress && !apiKey) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const body = await request.json();
        const { role: newRole } = body;

        if (!newRole || !isValidRole(newRole)) {
            return NextResponse.json(
                { error: "Invalid role. Must be one of: owner, admin, moderator, member" },
                { status: 400 }
            );
        }

        // API key auth: the SDK app has full control over channels it created
        if (apiKey && !session) {
            const { data: channel } = await supabase
                .from("shout_public_channels")
                .select("creator_address")
                .eq("id", channelId)
                .single();

            if (!channel) {
                return NextResponse.json({ error: "Channel not found" }, { status: 404 });
            }

            // API key holder must be the channel creator (or match the developer address)
            const devAddr = apiKey.developerAddress.toLowerCase();
            const creatorAddr = channel.creator_address?.toLowerCase();
            if (creatorAddr !== devAddr) {
                return NextResponse.json(
                    { error: "API key does not have permission on this channel" },
                    { status: 403 }
                );
            }

            // Ensure target is a member (or add them)
            const existing = await getCallerRole(channelId, memberAddress);
            if (!existing) {
                const { error: insertErr } = await supabase.from("shout_channel_members").insert({
                    channel_id: channelId,
                    user_address: memberAddress.toLowerCase(),
                    role: newRole,
                });
                if (insertErr) {
                    console.error("[Channels] API key member insert failed:", insertErr);
                    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
                }
                return NextResponse.json({ success: true, added: true });
            }

            const { error } = await supabase
                .from("shout_channel_members")
                .update({ role: newRole })
                .eq("channel_id", channelId)
                .ilike("user_address", memberAddress.toLowerCase());

            if (error) {
                console.error("[Channels] API key role update failed:", error);
                return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
            }

            return NextResponse.json({ success: true });
        }

        // Session auth: standard permission checks
        if (newRole === "owner") {
            return NextResponse.json(
                { error: "Cannot assign owner role. Transfer ownership instead." },
                { status: 400 }
            );
        }

        const callerRole = await getCallerRole(channelId, session!.userAddress);
        if (!callerRole || roleRank(callerRole) < roleRank("admin" as ChannelRole)) {
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
                { error: "Cannot modify role of a member with equal or higher rank" },
                { status: 403 }
            );
        }

        if (roleRank(newRole as ChannelRole) >= roleRank(callerRole)) {
            return NextResponse.json(
                { error: "Cannot promote a member to your rank or higher" },
                { status: 403 }
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
