import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// GET: Get a specific agent
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { id } = await params;
        
        // Get authenticated user from session
        const session = await getAuthenticatedUser(request);
        
        // Fall back to query param for backward compatibility
        const { searchParams } = new URL(request.url);
        const paramUserAddress = searchParams.get("userAddress");
        const userAddress = session?.userAddress || paramUserAddress;

        if (!userAddress) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        const { data: agent, error } = await supabase
            .from("shout_agents")
            .select("*")
            .eq("id", id)
            .single();

        if (error || !agent) {
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        // Check access
        if (agent.owner_address !== normalizedAddress && agent.visibility === "private") {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // TODO: For "friends" visibility, check if user is a friend

        return NextResponse.json({ agent });
    } catch (error) {
        console.error("[Agents] Error:", error);
        return NextResponse.json({ error: "Failed to fetch agent" }, { status: 500 });
    }
}

// PATCH: Update an agent
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { id } = await params;
        
        // Get authenticated user from session
        const session = await getAuthenticatedUser(request);
        
        const body = await request.json();
        const { 
            userAddress: bodyUserAddress, 
            name, 
            personality,
            systemInstructions,
            avatarEmoji,
            avatarUrl,
            visibility, 
            webSearchEnabled, 
            useKnowledgeBase,
            mcpEnabled,
            apiEnabled,
            schedulingEnabled,
            eventsAccess,
            // Public access for Official agents
            publicAccessEnabled,
            // Tags for searchability
            tags,
            // Suggested questions (Official agents)
            suggestedQuestions,
            // x402 fields
            x402Enabled,
            x402PriceCents,
            x402Network,
            x402WalletAddress,
            x402PricingMode,
            // MCP servers
            mcpServers,
            // API Tools
            apiTools,
        } = body;

        // Use session address, fall back to body for backward compatibility
        const userAddress = session?.userAddress || bodyUserAddress;

        if (!userAddress) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Check if user is an admin
        const { data: adminData } = await supabase
            .from("shout_admins")
            .select("wallet_address")
            .eq("wallet_address", normalizedAddress)
            .single();
        const isAdmin = !!adminData;

        // Check ownership (or admin status for official agents)
        const { data: existingAgent } = await supabase
            .from("shout_agents")
            .select("owner_address, name, visibility")
            .eq("id", id)
            .single();

        if (!existingAgent) {
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        // Allow access if: user owns the agent OR (user is admin AND agent is official)
        const isOwner = existingAgent.owner_address === normalizedAddress;
        const canEditOfficial = isAdmin && existingAgent.visibility === "official";
        
        if (!isOwner && !canEditOfficial) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Only admins can set visibility to "official"
        if (visibility === "official" && !isAdmin) {
            return NextResponse.json({ error: "Only admins can set official visibility" }, { status: 403 });
        }

        // Build update object
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        
        const agentName = name?.trim() || existingAgent.name;
        if (name !== undefined) updates.name = name.trim();
        if (personality !== undefined) {
            updates.personality = personality?.trim() || null;
        }
        
        // System instructions: use explicit value if provided, otherwise auto-generate from personality
        if (systemInstructions !== undefined) {
            // Direct system instructions override (for advanced users)
            updates.system_instructions = systemInstructions?.trim() || null;
        } else if (personality !== undefined) {
            // Auto-generate from personality (backward compatibility)
            updates.system_instructions = personality
                ? `You are an AI assistant named "${agentName}". Your personality: ${personality}. Be helpful, friendly, and stay in character.`
                : `You are an AI assistant named "${agentName}". Be helpful and friendly.`;
        }
        if (avatarEmoji !== undefined) updates.avatar_emoji = avatarEmoji;
        if (avatarUrl !== undefined) updates.avatar_url = avatarUrl;
        if (visibility !== undefined) updates.visibility = visibility;
        if (webSearchEnabled !== undefined) updates.web_search_enabled = webSearchEnabled;
        if (useKnowledgeBase !== undefined) updates.use_knowledge_base = useKnowledgeBase;
        if (mcpEnabled !== undefined) updates.mcp_enabled = mcpEnabled;
        if (apiEnabled !== undefined) updates.api_enabled = apiEnabled;
        if (schedulingEnabled !== undefined) updates.scheduling_enabled = schedulingEnabled;
        if (eventsAccess !== undefined) updates.events_access = eventsAccess;
        if (publicAccessEnabled !== undefined) updates.public_access_enabled = publicAccessEnabled;
        
        // Tags (max 5, each max 20 chars)
        if (tags !== undefined) {
            const validatedTags = Array.isArray(tags) 
                ? tags
                    .slice(0, 5)
                    .map((t: string) => t.trim().toLowerCase().slice(0, 20))
                    .filter((t: string) => t.length > 0)
                : [];
            updates.tags = validatedTags;
        }
        
        // Suggested questions (max 4, each max 100 chars, only for official agents)
        if (suggestedQuestions !== undefined) {
            // Only allow suggested questions for official agents
            const finalVisibility = visibility || existingAgent.visibility;
            if (finalVisibility === "official") {
                const validatedQuestions = Array.isArray(suggestedQuestions) 
                    ? suggestedQuestions
                        .slice(0, 4)
                        .map((q: string) => q.trim().slice(0, 100))
                        .filter((q: string) => q.length > 0)
                    : [];
                updates.suggested_questions = validatedQuestions.length > 0 ? validatedQuestions : null;
            }
        }
        
        // x402 configuration updates
        if (x402Enabled !== undefined) updates.x402_enabled = x402Enabled;
        if (x402PriceCents !== undefined) updates.x402_price_cents = Math.max(1, x402PriceCents);
        if (x402Network !== undefined) updates.x402_network = x402Network;
        if (x402WalletAddress !== undefined) updates.x402_wallet_address = x402WalletAddress?.toLowerCase() || null;
        if (x402PricingMode !== undefined) updates.x402_pricing_mode = x402PricingMode;
        
        // MCP servers configuration
        if (mcpServers !== undefined) updates.mcp_servers = mcpServers;
        
        // API Tools configuration
        if (apiTools !== undefined) updates.api_tools = apiTools;

        console.log("[Agents] Updating agent:", id, "with:", updates);

        const { data: agent, error } = await supabase
            .from("shout_agents")
            .update(updates)
            .eq("id", id)
            .select()
            .single();

        if (error) {
            console.error("[Agents] Error updating agent:", error.message, error.details, error.hint);
            return NextResponse.json({ error: `Failed to update agent: ${error.message}` }, { status: 500 });
        }

        return NextResponse.json({ agent });
    } catch (error) {
        console.error("[Agents] Error:", error);
        return NextResponse.json({ error: "Failed to update agent" }, { status: 500 });
    }
}

// DELETE: Delete an agent
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { id } = await params;
        
        // Get authenticated user from session
        const session = await getAuthenticatedUser(request);
        
        // Fall back to query param for backward compatibility
        const { searchParams } = new URL(request.url);
        const paramUserAddress = searchParams.get("userAddress");
        const userAddress = session?.userAddress || paramUserAddress;

        if (!userAddress) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Check if user is an admin
        const { data: adminData } = await supabase
            .from("shout_admins")
            .select("wallet_address")
            .eq("wallet_address", normalizedAddress)
            .single();
        const isAdmin = !!adminData;

        // Check ownership (or admin status for official agents)
        const { data: existingAgent } = await supabase
            .from("shout_agents")
            .select("owner_address, visibility")
            .eq("id", id)
            .single();

        if (!existingAgent) {
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        // Allow deletion if: user owns the agent OR (user is admin AND agent is official)
        const isOwner = existingAgent.owner_address === normalizedAddress;
        const canDeleteOfficial = isAdmin && existingAgent.visibility === "official";
        
        if (!isOwner && !canDeleteOfficial) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        const { error } = await supabase
            .from("shout_agents")
            .delete()
            .eq("id", id);

        if (error) {
            console.error("[Agents] Error deleting agent:", error);
            return NextResponse.json({ error: "Failed to delete agent" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Agents] Error:", error);
        return NextResponse.json({ error: "Failed to delete agent" }, { status: 500 });
    }
}

