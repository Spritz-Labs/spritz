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
 * GET /api/admin/agent-chats
 * Returns chat rows for Official Agents only. Query params: agent_id, source, period (24h|7d|30d), limit, offset.
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
    const agentId = searchParams.get("agent_id") || undefined;
    const source = searchParams.get("source") || undefined;
    const period = searchParams.get("period") || "7d";
    const limit = Math.min(
        Math.max(parseInt(searchParams.get("limit") || "100", 10), 1),
        500,
    );
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

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
        // Official agent IDs only
        const { data: officialAgents, error: agentsError } = await supabase
            .from("shout_agents")
            .select("id, name, avatar_emoji")
            .eq("visibility", "official");

        if (agentsError) throw agentsError;
        const officialIds = (officialAgents || []).map((a) => a.id);
        if (officialIds.length === 0) {
            return NextResponse.json({
                chats: [],
                agents: [],
                total: 0,
                period,
                startDate: startDate.toISOString(),
                endDate: now.toISOString(),
            });
        }

        let query = supabase
            .from("shout_agent_chats")
            .select(
                "id, agent_id, user_address, role, content, source, channel_id, channel_type, session_id, created_at",
                { count: "exact" },
            )
            .in("agent_id", officialIds)
            .gte("created_at", startDate.toISOString())
            .lte("created_at", now.toISOString())
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

        if (agentId && officialIds.includes(agentId)) {
            query = query.eq("agent_id", agentId);
        }
        if (source && ["direct", "public", "channel"].includes(source)) {
            query = query.eq("source", source);
        }

        const { data: chats, error, count } = await query;

        if (error) throw error;

        const agentMap = new Map(
            (officialAgents || []).map((a) => [
                a.id,
                { name: a.name, avatar_emoji: a.avatar_emoji },
            ]),
        );

        const chatsWithAgent = (chats || []).map((c) => ({
            ...c,
            agent_name: agentMap.get(c.agent_id)?.name ?? null,
            agent_emoji: agentMap.get(c.agent_id)?.avatar_emoji ?? null,
        }));

        return NextResponse.json({
            chats: chatsWithAgent,
            agents: officialAgents || [],
            total: count ?? chatsWithAgent.length,
            period,
            startDate: startDate.toISOString(),
            endDate: now.toISOString(),
        });
    } catch (err) {
        console.error("[Admin agent-chats]", err);
        return NextResponse.json(
            { error: "Failed to fetch agent chats" },
            { status: 500 },
        );
    }
}
