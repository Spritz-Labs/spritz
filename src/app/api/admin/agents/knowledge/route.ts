import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

async function verifyAdmin(
    request: NextRequest,
): Promise<{ isAdmin: boolean; address: string | null }> {
    const address = request.headers.get("x-admin-address");
    const signature = request.headers.get("x-admin-signature");
    const encodedMessage = request.headers.get("x-admin-message");

    if (!address || !signature || !encodedMessage || !supabase) {
        return { isAdmin: false, address: null };
    }

    try {
        const message = decodeURIComponent(atob(encodedMessage));

        const isValidSignature = await verifyMessage({
            address: address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        });

        if (!isValidSignature) {
            return { isAdmin: false, address: null };
        }

        const { data: admin } = await supabase
            .from("shout_admins")
            .select("*")
            .eq("wallet_address", address.toLowerCase())
            .single();

        return { isAdmin: !!admin, address: address.toLowerCase() };
    } catch {
        return { isAdmin: false, address: null };
    }
}

/**
 * GET /api/admin/agents/knowledge
 * List all agents with their knowledge sources and chunk counts.
 * Optional query params: agentId (filter to one agent), includeChunks (show actual chunks)
 */
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const includeChunks = searchParams.get("includeChunks") === "true";
    const knowledgeId = searchParams.get("knowledgeId");
    const search = searchParams.get("search");
    const offset = parseInt(searchParams.get("offset") || "0");
    const limit = parseInt(searchParams.get("limit") || "50");

    try {
        // If requesting chunks for a specific knowledge source
        if (knowledgeId && includeChunks) {
            let query = supabase
                .from("shout_knowledge_chunks")
                .select("id, chunk_index, content, token_count, created_at", { count: "exact" })
                .eq("knowledge_id", knowledgeId)
                .order("chunk_index", { ascending: true })
                .range(offset, offset + limit - 1);

            if (search) {
                query = query.ilike("content", `%${search}%`);
            }

            const { data: chunks, error, count } = await query;

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json({ chunks: chunks || [], total: count || 0 });
        }

        // List agents with knowledge sources
        if (agentId) {
            // Get knowledge sources for specific agent
            const { data: sources, error } = await supabase
                .from("shout_agent_knowledge")
                .select("*")
                .eq("agent_id", agentId)
                .order("created_at", { ascending: false });

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            // Get agent info
            const { data: agent } = await supabase
                .from("shout_agents")
                .select("id, name, avatar_emoji, avatar_url, owner_address, use_knowledge_base, visibility")
                .eq("id", agentId)
                .single();

            return NextResponse.json({ agent, sources: sources || [] });
        }

        // List all agents that have knowledge bases enabled
        const { data: agents, error: agentsError } = await supabase
            .from("shout_agents")
            .select("id, name, avatar_emoji, avatar_url, owner_address, use_knowledge_base, visibility")
            .eq("use_knowledge_base", true)
            .order("name", { ascending: true });

        if (agentsError) {
            return NextResponse.json({ error: agentsError.message }, { status: 500 });
        }

        // Get knowledge source counts per agent
        const agentIds = (agents || []).map((a) => a.id);

        const { data: sourceCounts } = await supabase
            .from("shout_agent_knowledge")
            .select("agent_id, id, status, chunk_count")
            .in("agent_id", agentIds.length > 0 ? agentIds : [""]);

        // Aggregate
        const agentStats: Record<string, { totalSources: number; indexedSources: number; totalChunks: number; failedSources: number }> = {};
        (sourceCounts || []).forEach((s) => {
            if (!agentStats[s.agent_id]) {
                agentStats[s.agent_id] = { totalSources: 0, indexedSources: 0, totalChunks: 0, failedSources: 0 };
            }
            agentStats[s.agent_id].totalSources++;
            if (s.status === "indexed") {
                agentStats[s.agent_id].indexedSources++;
                agentStats[s.agent_id].totalChunks += s.chunk_count || 0;
            }
            if (s.status === "failed") {
                agentStats[s.agent_id].failedSources++;
            }
        });

        const result = (agents || []).map((agent) => ({
            ...agent,
            stats: agentStats[agent.id] || { totalSources: 0, indexedSources: 0, totalChunks: 0, failedSources: 0 },
        }));

        return NextResponse.json({ agents: result });
    } catch (err) {
        console.error("[Admin Knowledge] Error:", err);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 },
        );
    }
}
