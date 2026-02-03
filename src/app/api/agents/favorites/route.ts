import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// GET: Get user's favorite agents
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Get favorites with agent details
        const { data: favorites, error } = await supabase
            .from("shout_agent_favorites")
            .select(`
                id,
                created_at,
                agent:agent_id (
                    id,
                    owner_address,
                    name,
                    personality,
                    avatar_emoji,
                    avatar_url,
                    visibility,
                    message_count,
                    created_at
                )
            `)
            .eq("user_address", normalizedAddress)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("[Favorites] Error:", error);
            return NextResponse.json({ error: "Failed to fetch favorites" }, { status: 500 });
        }

        // Get owner info for each agent
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ownerAddresses = [...new Set(
            (favorites || [])
                .filter(f => f.agent)
                .map(f => (f.agent as any).owner_address as string)
        )];
        
        const { data: owners } = await supabase
            .from("shout_users")
            .select("wallet_address, username, ens_name")
            .in("wallet_address", ownerAddresses);

        const ownerMap = new Map();
        (owners || []).forEach(o => {
            ownerMap.set(o.wallet_address, {
                username: o.username,
                ensName: o.ens_name,
            });
        });

        // Enrich with owner info
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enrichedFavorites = (favorites || [])
            .filter(f => f.agent) // Filter out any deleted agents
            .map(f => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const agent = f.agent as any;
                return {
                    ...f,
                    agent: {
                        ...agent,
                        owner: ownerMap.get(agent.owner_address) || {},
                    },
                };
            });

        return NextResponse.json({
            favorites: enrichedFavorites,
            total: enrichedFavorites.length,
        });

    } catch (error) {
        console.error("[Favorites] Error:", error);
        return NextResponse.json({ error: "Failed to fetch favorites" }, { status: 500 });
    }
}

// POST: Add agent to favorites
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { userAddress, agentId } = body;

        if (!userAddress || !agentId) {
            return NextResponse.json({ error: "User address and agent ID required" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Verify agent exists and is accessible
        const { data: agent, error: agentError } = await supabase
            .from("shout_agents")
            .select("id, visibility, owner_address")
            .eq("id", agentId)
            .single();

        if (agentError || !agent) {
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        // Can't favorite your own agent
        if (agent.owner_address === normalizedAddress) {
            return NextResponse.json({ error: "Cannot favorite your own agent" }, { status: 400 });
        }

        // Check if agent is accessible (public or friends' with correct visibility)
        if (agent.visibility === "private") {
            return NextResponse.json({ error: "Cannot favorite private agents" }, { status: 403 });
        }

        // Add to favorites
        const { data: favorite, error: insertError } = await supabase
            .from("shout_agent_favorites")
            .insert({
                user_address: normalizedAddress,
                agent_id: agentId,
            })
            .select()
            .single();

        if (insertError) {
            if (insertError.code === "23505") { // Unique constraint violation
                return NextResponse.json({ error: "Already favorited" }, { status: 409 });
            }
            console.error("[Favorites] Insert error:", insertError);
            return NextResponse.json({ error: "Failed to add favorite" }, { status: 500 });
        }

        return NextResponse.json({ success: true, favorite });

    } catch (error) {
        console.error("[Favorites] Error:", error);
        return NextResponse.json({ error: "Failed to add favorite" }, { status: 500 });
    }
}

// DELETE: Remove agent from favorites
export async function DELETE(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");
        const agentId = searchParams.get("agentId");

        if (!userAddress || !agentId) {
            return NextResponse.json({ error: "User address and agent ID required" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        const { error } = await supabase
            .from("shout_agent_favorites")
            .delete()
            .eq("user_address", normalizedAddress)
            .eq("agent_id", agentId);

        if (error) {
            console.error("[Favorites] Delete error:", error);
            return NextResponse.json({ error: "Failed to remove favorite" }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("[Favorites] Error:", error);
        return NextResponse.json({ error: "Failed to remove favorite" }, { status: 500 });
    }
}

