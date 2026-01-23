import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// GET - Fetch public agent details
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { data: agent, error } = await supabase
            .from("shout_agents")
            .select("id, name, personality, avatar_emoji, visibility, x402_enabled, x402_price_cents, x402_network, owner_address, tags")
            .eq("id", id)
            .single();

        if (error || !agent) {
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        // Only allow public or official agents
        if (agent.visibility !== "public" && agent.visibility !== "official") {
            return NextResponse.json({ error: "This agent is not public" }, { status: 403 });
        }

        return NextResponse.json(agent);
    } catch (error) {
        console.error("[Public Agent] Error:", error);
        return NextResponse.json({ error: "Failed to fetch agent" }, { status: 500 });
    }
}

