import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export type Agent = {
    id: string;
    owner_address: string;
    name: string;
    personality: string | null;
    system_instructions: string | null;
    model: string;
    avatar_emoji: string;
    visibility: "private" | "friends" | "public" | "official";
    message_count: number;
    created_at: string;
    updated_at: string;
};

// GET: List user's agents (and official agents if admin)
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");
        const includeOfficial = searchParams.get("includeOfficial") === "true";

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Get user's own agents
        const { data: userAgents, error: userError } = await supabase
            .from("shout_agents")
            .select("*")
            .eq("owner_address", normalizedAddress)
            .order("created_at", { ascending: false });

        if (userError) {
            console.error("[Agents] Error fetching user agents:", userError);
            return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
        }

        let allAgents = userAgents || [];

        // If admin, also fetch official agents (not already owned by this user)
        if (includeOfficial) {
            // Verify the user is actually an admin
            const { data: adminData } = await supabase
                .from("shout_admins")
                .select("wallet_address")
                .eq("wallet_address", normalizedAddress)
                .single();

            if (adminData) {
                const { data: officialAgents, error: officialError } = await supabase
                    .from("shout_agents")
                    .select("*")
                    .eq("visibility", "official")
                    .neq("owner_address", normalizedAddress) // Exclude user's own (already included)
                    .order("created_at", { ascending: false });

                if (!officialError && officialAgents) {
                    // Merge official agents into the list
                    allAgents = [...allAgents, ...officialAgents];
                }
            }
        }

        return NextResponse.json({ agents: allAgents });
    } catch (error) {
        console.error("[Agents] Error:", error);
        return NextResponse.json({ error: "Failed to fetch agents" }, { status: 500 });
    }
}

// POST: Create a new agent
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { userAddress, name, personality, avatarEmoji, visibility, tags } = body;

        if (!userAddress || !name) {
            return NextResponse.json(
                { error: "User address and name are required" },
                { status: 400 }
            );
        }

        // Validate tags (max 5, each max 20 chars)
        let validatedTags: string[] = [];
        if (tags && Array.isArray(tags)) {
            validatedTags = tags
                .slice(0, 5) // Max 5 tags
                .map((t: string) => t.trim().toLowerCase().slice(0, 20)) // Normalize and limit length
                .filter((t: string) => t.length > 0); // Remove empty
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Check if user has beta access
        const { data: user } = await supabase
            .from("shout_users")
            .select("beta_access")
            .eq("wallet_address", normalizedAddress)
            .single();

        if (!user?.beta_access) {
            return NextResponse.json(
                { error: "Beta access required to create agents" },
                { status: 403 }
            );
        }

        // If visibility is "official", check that user is an admin
        if (visibility === "official") {
            const { data: adminData } = await supabase
                .from("shout_admins")
                .select("wallet_address")
                .eq("wallet_address", normalizedAddress)
                .single();
            
            if (!adminData) {
                return NextResponse.json(
                    { error: "Only admins can create official agents" },
                    { status: 403 }
                );
            }
        }

        // Check agent limit (max 5 agents per user for now)
        // Skip limit for official agents
        if (visibility !== "official") {
            const { count } = await supabase
                .from("shout_agents")
                .select("*", { count: "exact", head: true })
                .eq("owner_address", normalizedAddress);

            if ((count || 0) >= 5) {
                return NextResponse.json(
                    { error: "Maximum of 5 agents allowed per user" },
                    { status: 400 }
                );
            }
        }

        // Generate system instructions from personality
        const systemInstructions = personality
            ? `You are an AI assistant named "${name}". Your personality: ${personality}. Be helpful, friendly, and stay in character.`
            : `You are an AI assistant named "${name}". Be helpful and friendly.`;

        // Create the agent
        const { data: agent, error } = await supabase
            .from("shout_agents")
            .insert({
                owner_address: normalizedAddress,
                name: name.trim(),
                personality: personality?.trim() || null,
                system_instructions: systemInstructions,
                model: "gemini-2.0-flash", // Free tier: 15 RPM, 1500 req/day
                avatar_emoji: avatarEmoji || "🤖",
                visibility: visibility || "private",
                tags: validatedTags,
            })
            .select()
            .single();

        if (error) {
            console.error("[Agents] Error creating agent:", error);
            if (error.code === "23505") {
                return NextResponse.json(
                    { error: "You already have an agent with this name" },
                    { status: 400 }
                );
            }
            return NextResponse.json({ error: "Failed to create agent" }, { status: 500 });
        }

        return NextResponse.json({ agent });
    } catch (error) {
        console.error("[Agents] Error:", error);
        return NextResponse.json({ error: "Failed to create agent" }, { status: 500 });
    }
}

