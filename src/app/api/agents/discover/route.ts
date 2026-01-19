import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// GET: Discover public agents and friends' agents
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");
        const filter = searchParams.get("filter") || "all"; // all, public, friends
        const search = searchParams.get("search") || "";
        // Increase limit when searching to ensure we can find all matching agents
        const baseLimit = parseInt(searchParams.get("limit") || "20");
        const limit = search ? Math.max(baseLimit, 100) : baseLimit;

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Get user's friends list (friendships are stored in both directions)
        const { data: friendships, error: friendError } = await supabase
            .from("shout_friends")
            .select("user_address, friend_address")
            .or(`user_address.eq.${normalizedAddress},friend_address.eq.${normalizedAddress}`);

        if (friendError) {
            console.error("[Discover] Error fetching friendships:", friendError);
        }

        const friendAddresses = new Set<string>();
        (friendships || []).forEach(f => {
            // Add both addresses, then remove self
            friendAddresses.add(f.user_address.toLowerCase());
            friendAddresses.add(f.friend_address.toLowerCase());
        });
        friendAddresses.delete(normalizedAddress); // Remove self
        
        console.log("[Discover] User:", normalizedAddress);
        console.log("[Discover] Friends found:", Array.from(friendAddresses));

        // Build query based on filter
        let query = supabase
            .from("shout_agents")
            .select(`
                id,
                owner_address,
                name,
                personality,
                avatar_emoji,
                visibility,
                message_count,
                tags,
                created_at
            `)
            .neq("owner_address", normalizedAddress) // Don't show own agents
            .order("message_count", { ascending: false })
            .limit(limit);

        // Apply visibility filter
        // Note: "official" agents are always discoverable like public agents
        if (filter === "public") {
            // Public and official agents
            query = query.in("visibility", ["public", "official"]);
        } else if (filter === "friends") {
            // Only friends' agents that are visible to friends
            if (friendAddresses.size > 0) {
                const friendList = Array.from(friendAddresses);
                console.log("[Discover] Looking for agents from friends:", friendList);
                query = query
                    .in("owner_address", friendList)
                    .in("visibility", ["friends", "public"]);
            } else {
                console.log("[Discover] No friends found, returning empty");
                return NextResponse.json({ agents: [], total: 0 });
            }
        } else {
            // All discoverable agents (public + official + friends' shared)
            if (friendAddresses.size > 0) {
                // Public/official agents OR friends' agents with friends/public visibility
                query = query.or(
                    `visibility.in.(public,official),and(owner_address.in.(${Array.from(friendAddresses).join(",")}),visibility.in.(friends,public))`
                );
            } else {
                // No friends, only public and official agents
                query = query.in("visibility", ["public", "official"]);
            }
        }

        // Note: We'll filter by search term (name, personality, and tags) in JavaScript
        // to support partial matching in tags, which isn't easily done in Supabase queries
        const { data: agents, error } = await query;

        console.log("[Discover] Query result - agents found:", agents?.length || 0);
        if (agents && agents.length > 0) {
            console.log("[Discover] First agent:", agents[0]);
        }

        if (error) {
            console.error("[Discover] Query error:", error);
            return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
        }

        // Get owner info for each agent
        const ownerAddresses = [...new Set((agents || []).map(a => a.owner_address))];
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

        // Enrich agents with owner info and friend status
        let enrichedAgents = (agents || []).map(agent => ({
            ...agent,
            owner: ownerMap.get(agent.owner_address) || {},
            isFriendsAgent: friendAddresses.has(agent.owner_address),
        }));

        // Filter by search term if provided (name, personality, and tags - case-insensitive partial match)
        if (search) {
            const searchLower = search.toLowerCase().trim();
            
            enrichedAgents = enrichedAgents.filter(agent => {
                // Check name match
                const nameMatch = agent.name?.toLowerCase().includes(searchLower);
                
                // Check personality match
                const personalityMatch = agent.personality?.toLowerCase().includes(searchLower);
                
                // Check if any tag contains the search term (case-insensitive partial match)
                // Handle tags as JSONB array - ensure it's an array
                let tagMatch = false;
                if (agent.tags) {
                    try {
                        // Handle both array and JSONB formats
                        let tagsArray: string[] = [];
                        if (Array.isArray(agent.tags)) {
                            tagsArray = agent.tags;
                        } else if (typeof agent.tags === 'string') {
                            // Try to parse as JSON
                            tagsArray = JSON.parse(agent.tags);
                        }
                        
                        // Filter out null/undefined and ensure all are strings
                        tagsArray = tagsArray.filter(tag => tag != null).map(tag => String(tag));
                        
                        tagMatch = tagsArray.some((tag: string) => {
                            return tag.toLowerCase().includes(searchLower);
                        });
                    } catch (err) {
                        // If parsing fails, skip tag matching for this agent
                        console.warn("[Discover] Failed to parse tags for agent:", agent.id, err);
                    }
                }
                
                // Return true if any field matches
                return nameMatch || personalityMatch || tagMatch;
            });
        }

        return NextResponse.json({
            agents: enrichedAgents,
            total: enrichedAgents.length,
        });

    } catch (error) {
        console.error("[Discover] Error:", error);
        return NextResponse.json({ error: "Failed to discover agents" }, { status: 500 });
    }
}

