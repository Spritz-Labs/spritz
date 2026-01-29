import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// GET: Get agents in a specific channel
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { id } = await params;
        
        // id can be "global" for global chat or a UUID for public channels
        const isGlobal = id === "global";

        let query = supabase
            .from("shout_agent_channel_memberships")
            .select(`
                agent_id,
                shout_agents (
                    id,
                    name,
                    avatar_emoji,
                    avatar_url,
                    personality
                )
            `)
            .eq("channel_type", isGlobal ? "global" : "channel");

        if (isGlobal) {
            query = query.is("channel_id", null);
        } else {
            query = query.eq("channel_id", id);
        }

        const { data: memberships, error } = await query;

        if (error) {
            console.error("[Channel Agents] Error fetching agents:", error);
            return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
        }

        // Extract agent info
        const agents = (memberships || [])
            .map(m => m.shout_agents)
            .filter(Boolean)
            .map((agent: any) => ({
                id: agent.id,
                name: agent.name,
                avatar_emoji: agent.avatar_emoji,
                avatar_url: agent.avatar_url,
                personality: agent.personality,
                isAgent: true,
            }));

        return NextResponse.json({ agents });
    } catch (error) {
        console.error("[Channel Agents] Error:", error);
        return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
    }
}
