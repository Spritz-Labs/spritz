import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/**
 * GET /api/public/agents/[id]/history?sessionId=xxx
 * Returns chat history for a public/official agent session (for hydration on page load).
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId?.trim()) {
        return NextResponse.json(
            { error: "sessionId is required" },
            { status: 400 },
        );
    }

    try {
        const { data: agent, error: agentError } = await supabase
            .from("shout_agents")
            .select("id, visibility, public_access_enabled")
            .eq("id", id)
            .single();

        if (agentError || !agent) {
            return NextResponse.json(
                { error: "Agent not found" },
                { status: 404 },
            );
        }

        const isPublic = agent.visibility === "public";
        const isOfficial =
            agent.visibility === "official" &&
            agent.public_access_enabled !== false;
        if (!isPublic && !isOfficial) {
            return NextResponse.json(
                { error: "Agent not accessible" },
                { status: 403 },
            );
        }

        const { data: chats, error } = await supabase
            .from("shout_agent_chats")
            .select("role, content, created_at")
            .eq("agent_id", id)
            .eq("session_id", sessionId)
            .order("created_at", { ascending: true })
            .limit(50);

        if (error) {
            console.error("[Public Agent History] Error:", error);
            return NextResponse.json(
                { error: "Failed to fetch history" },
                { status: 500 },
            );
        }

        const messages = (chats || []).map((c) => ({
            role: c.role as "user" | "assistant",
            content: c.content,
        }));

        return NextResponse.json({ messages, sessionId });
    } catch (err) {
        console.error("[Public Agent History] Error:", err);
        return NextResponse.json(
            { error: "Failed to fetch history" },
            { status: 500 },
        );
    }
}
