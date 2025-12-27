import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
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
        const body = await request.json();
        const { 
            userAddress, 
            name, 
            personality, 
            avatarEmoji, 
            visibility, 
            webSearchEnabled, 
            useKnowledgeBase,
            // x402 fields
            x402Enabled,
            x402PriceCents,
            x402Network,
            x402WalletAddress,
        } = body;

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Check ownership
        const { data: existingAgent } = await supabase
            .from("shout_agents")
            .select("owner_address, name")
            .eq("id", id)
            .single();

        if (!existingAgent || existingAgent.owner_address !== normalizedAddress) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Build update object
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        
        const agentName = name?.trim() || existingAgent.name;
        if (name !== undefined) updates.name = name.trim();
        if (personality !== undefined) {
            updates.personality = personality?.trim() || null;
            // Update system instructions when personality changes
            updates.system_instructions = personality
                ? `You are an AI assistant named "${agentName}". Your personality: ${personality}. Be helpful, friendly, and stay in character.`
                : `You are an AI assistant named "${agentName}". Be helpful and friendly.`;
        }
        if (avatarEmoji !== undefined) updates.avatar_emoji = avatarEmoji;
        if (visibility !== undefined) updates.visibility = visibility;
        if (webSearchEnabled !== undefined) updates.web_search_enabled = webSearchEnabled;
        if (useKnowledgeBase !== undefined) updates.use_knowledge_base = useKnowledgeBase;
        
        // x402 configuration updates
        if (x402Enabled !== undefined) updates.x402_enabled = x402Enabled;
        if (x402PriceCents !== undefined) updates.x402_price_cents = Math.max(1, x402PriceCents);
        if (x402Network !== undefined) updates.x402_network = x402Network;
        if (x402WalletAddress !== undefined) updates.x402_wallet_address = x402WalletAddress?.toLowerCase() || null;

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
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Check ownership
        const { data: existingAgent } = await supabase
            .from("shout_agents")
            .select("owner_address")
            .eq("id", id)
            .single();

        if (!existingAgent || existingAgent.owner_address !== normalizedAddress) {
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

