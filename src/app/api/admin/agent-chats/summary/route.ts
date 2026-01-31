import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

async function verifyAdmin(
    request: NextRequest,
): Promise<{ isAdmin: boolean }> {
    const address = request.headers.get("x-admin-address");
    const signature = request.headers.get("x-admin-signature");
    const encodedMessage = request.headers.get("x-admin-message");

    if (!address || !signature || !encodedMessage || !supabase) {
        return { isAdmin: false };
    }

    const { verifyMessage } = await import("viem");
    try {
        const message = decodeURIComponent(atob(encodedMessage));
        const isValidSignature = await verifyMessage({
            address: address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        });
        if (!isValidSignature) return { isAdmin: false };

        const { data: admin } = await supabase
            .from("shout_admins")
            .select("*")
            .eq("wallet_address", address.toLowerCase())
            .single();

        return { isAdmin: !!admin };
    } catch {
        return { isAdmin: false };
    }
}

/**
 * GET /api/admin/agent-chats/summary
 * Returns per-agent aggregates for the period: message_count, total_tokens, avg_latency_ms, tool_call_count, estimated_cost_usd, conversation_count.
 * Query params: period (24h|7d|30d), agent_id (optional).
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
    const period = searchParams.get("period") || "7d";
    const agentId = searchParams.get("agent_id") || undefined;

    const now = new Date();
    let startDate: Date;
    switch (period) {
        case "24h":
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
        case "30d":
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        default:
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    try {
        const { data: officialAgents, error: agentsError } = await supabase
            .from("shout_agents")
            .select("id, name, avatar_emoji")
            .eq("visibility", "official");

        if (agentsError) throw agentsError;
        const officialIds = (officialAgents || []).map((a) => a.id);
        if (officialIds.length === 0) {
            return NextResponse.json({
                byAgent: [],
                period,
                startDate: startDate.toISOString(),
                endDate: now.toISOString(),
            });
        }

        let query = supabase
            .from("shout_agent_chats")
            .select(
                "agent_id, role, total_tokens, latency_ms, tool_calls, estimated_cost_usd, user_address, session_id",
            )
            .in("agent_id", officialIds)
            .gte("created_at", startDate.toISOString())
            .lte("created_at", now.toISOString());

        if (agentId && officialIds.includes(agentId)) {
            query = query.eq("agent_id", agentId);
        }

        const { data: rows, error } = await query;
        if (error) throw error;

        const agentMap = new Map(
            (officialAgents || []).map((a) => [
                a.id,
                { name: a.name, avatar_emoji: a.avatar_emoji },
            ]),
        );

        const byAgentId = new Map<
            string,
            {
                message_count: number;
                total_tokens: number;
                latency_sum_ms: number;
                latency_count: number;
                tool_call_count: number;
                estimated_cost_usd: number;
                conversations: Set<string>;
            }
        >();

        for (const row of rows || []) {
            const id = row.agent_id;
            if (!byAgentId.has(id)) {
                byAgentId.set(id, {
                    message_count: 0,
                    total_tokens: 0,
                    latency_sum_ms: 0,
                    latency_count: 0,
                    tool_call_count: 0,
                    estimated_cost_usd: 0,
                    conversations: new Set(),
                });
            }
            const agg = byAgentId.get(id)!;
            agg.message_count += 1;
            if (row.total_tokens != null) agg.total_tokens += row.total_tokens;
            if (row.latency_ms != null) {
                agg.latency_sum_ms += row.latency_ms;
                agg.latency_count += 1;
            }
            const hasToolCalls =
                row.tool_calls != null &&
                Array.isArray(row.tool_calls) &&
                row.tool_calls.length > 0;
            if (hasToolCalls) agg.tool_call_count += 1;
            if (row.estimated_cost_usd != null) {
                agg.estimated_cost_usd += Number(row.estimated_cost_usd);
            }
            const convKey = row.session_id
                ? `${row.user_address}:${row.session_id}`
                : row.user_address;
            agg.conversations.add(convKey);
        }

        const byAgent = Array.from(byAgentId.entries()).map(([id, agg]) => ({
            agent_id: id,
            agent_name: agentMap.get(id)?.name ?? null,
            agent_emoji: agentMap.get(id)?.avatar_emoji ?? null,
            message_count: agg.message_count,
            total_tokens: agg.total_tokens,
            avg_latency_ms:
                agg.latency_count > 0
                    ? Math.round(agg.latency_sum_ms / agg.latency_count)
                    : null,
            tool_call_count: agg.tool_call_count,
            estimated_cost_usd:
                Math.round(agg.estimated_cost_usd * 1_000_000) / 1_000_000,
            conversation_count: agg.conversations.size,
        }));

        return NextResponse.json({
            byAgent,
            period,
            startDate: startDate.toISOString(),
            endDate: now.toISOString(),
        });
    } catch (err) {
        console.error("[Admin agent-chats summary]", err);
        return NextResponse.json(
            { error: "Failed to fetch summary" },
            { status: 500 },
        );
    }
}
