import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// GET: Get channels and location chats an agent is in
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

    try {
        const { id } = await params;

        const { data: memberships, error } = await supabase
            .from("shout_agent_channel_memberships")
            .select(
                `
                id,
                channel_type,
                channel_id,
                created_at,
                shout_public_channels (
                    id,
                    name,
                    emoji
                )
            `
            )
            .eq("agent_id", id);

        if (error) {
            console.error(
                "[Agent Channels] Error fetching memberships:",
                error
            );
            return NextResponse.json(
                { error: "Failed to fetch memberships" },
                { status: 500 }
            );
        }

        const list = memberships || [];
        const locationIds = list
            .filter(
                (m: { channel_type: string; channel_id: string }) =>
                    m.channel_type === "location" && m.channel_id
            )
            .map((m: { channel_type: string; channel_id: string }) => m.channel_id);

        let locationMap: Record<
            string,
            { id: string; name: string; emoji: string }
        > = {};
        if (locationIds.length > 0) {
            const { data: locationChats } = await supabase
                .from("shout_location_chats")
                .select("id, name, emoji")
                .in("id", locationIds);
            locationMap = (locationChats || []).reduce(
                (
                    acc: Record<
                        string,
                        { id: string; name: string; emoji: string }
                    >,
                    row: { id: string; name: string; emoji: string }
                ) => {
                    acc[row.id] = {
                        id: row.id,
                        name: row.name,
                        emoji: row.emoji || "📍",
                    };
                    return acc;
                },
                {}
            );
        }

        const enriched = list.map(
            (m: {
                channel_type: string;
                channel_id: string;
                [k: string]: unknown;
            }) => ({
                ...m,
                location_chat:
                    m.channel_type === "location" && m.channel_id
                        ? locationMap[m.channel_id] ?? null
                        : null,
            })
        );

        return NextResponse.json({ memberships: enriched });
    } catch (error) {
        console.error("[Agent Channels] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch memberships" },
            { status: 500 }
        );
    }
}

// POST: Add agent to a channel (admin only)
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

    try {
        const { id } = await params;
        const body = await request.json();
        const { userAddress, channelType, channelId } = body;

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address required" },
                { status: 400 }
            );
        }

        if (
            !channelType ||
            !["global", "channel", "location"].includes(channelType)
        ) {
            return NextResponse.json(
                { error: "Invalid channel type" },
                { status: 400 }
            );
        }

        if (
            (channelType === "channel" || channelType === "location") &&
            !channelId
        ) {
            return NextResponse.json(
                { error: "Channel ID / Location chat ID required" },
                { status: 400 }
            );
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Verify admin status
        const { data: adminData } = await supabase
            .from("shout_admins")
            .select("wallet_address")
            .eq("wallet_address", normalizedAddress)
            .single();

        if (!adminData) {
            return NextResponse.json(
                { error: "Only admins can add agents to channels" },
                { status: 403 }
            );
        }

        // Verify agent is official
        const { data: agent } = await supabase
            .from("shout_agents")
            .select("visibility")
            .eq("id", id)
            .single();

        if (!agent || agent.visibility !== "official") {
            return NextResponse.json(
                { error: "Only Official agents can be added to channels" },
                { status: 400 }
            );
        }

        // Add membership
        const { data: membership, error } = await supabase
            .from("shout_agent_channel_memberships")
            .insert({
                agent_id: id,
                channel_type: channelType,
                channel_id: channelType === "global" ? null : channelId,
                created_by: normalizedAddress,
            })
            .select()
            .single();

        if (error) {
            if (error.code === "23505") {
                return NextResponse.json(
                    { error: "Agent is already in this channel" },
                    { status: 400 }
                );
            }
            console.error("[Agent Channels] Error adding membership:", error);
            return NextResponse.json(
                { error: "Failed to add agent to channel" },
                { status: 500 }
            );
        }

        return NextResponse.json({ membership });
    } catch (error) {
        console.error("[Agent Channels] Error:", error);
        return NextResponse.json(
            { error: "Failed to add agent to channel" },
            { status: 500 }
        );
    }
}

// DELETE: Remove agent from a channel (admin only)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 }
        );
    }

    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");
        const channelType = searchParams.get("channelType");
        const channelId = searchParams.get("channelId");

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address required" },
                { status: 400 }
            );
        }

        if (!channelType) {
            return NextResponse.json(
                { error: "Channel type required" },
                { status: 400 }
            );
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Verify admin status
        const { data: adminData } = await supabase
            .from("shout_admins")
            .select("wallet_address")
            .eq("wallet_address", normalizedAddress)
            .single();

        if (!adminData) {
            return NextResponse.json(
                { error: "Only admins can remove agents from channels" },
                { status: 403 }
            );
        }

        // Build delete query
        let query = supabase
            .from("shout_agent_channel_memberships")
            .delete()
            .eq("agent_id", id)
            .eq("channel_type", channelType);

        if (channelType === "global") {
            query = query.is("channel_id", null);
        } else if (channelId) {
            query = query.eq("channel_id", channelId);
        }

        const { error } = await query;

        if (error) {
            console.error("[Agent Channels] Error removing membership:", error);
            return NextResponse.json(
                { error: "Failed to remove agent from channel" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Agent Channels] Error:", error);
        return NextResponse.json(
            { error: "Failed to remove agent from channel" },
            { status: 500 }
        );
    }
}
