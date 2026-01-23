import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// Generate suggested questions based on agent's configuration
function generateSuggestedQuestions(agent: {
    name: string;
    personality: string | null;
    tags?: string[] | null;
}): string[] {
    const questions: string[] = [];
    const name = agent.name;
    const personality = agent.personality?.toLowerCase() || "";
    const tags = agent.tags || [];
    
    // Add name-based question
    questions.push(`What can you help me with, ${name}?`);
    
    // Add personality-based questions
    if (personality.includes("code") || personality.includes("programming") || personality.includes("developer")) {
        questions.push("Can you help me debug some code?");
        questions.push("What programming languages do you know?");
    } else if (personality.includes("write") || personality.includes("content") || personality.includes("blog")) {
        questions.push("Can you help me write something?");
        questions.push("What's your writing style like?");
    } else if (personality.includes("assist") || personality.includes("help")) {
        questions.push("What are you best at helping with?");
    } else if (personality.includes("creative") || personality.includes("art") || personality.includes("design")) {
        questions.push("Can you help me brainstorm ideas?");
    } else if (personality.includes("teach") || personality.includes("learn") || personality.includes("education")) {
        questions.push("Can you explain a concept to me?");
        questions.push("How do you approach teaching?");
    } else if (personality.includes("fun") || personality.includes("joke") || personality.includes("entertain")) {
        questions.push("Tell me something interesting!");
        questions.push("Can you make me laugh?");
    }
    
    // Add tag-based questions
    for (const tag of tags.slice(0, 2)) {
        const tagLower = tag.toLowerCase();
        if (tagLower === "crypto" || tagLower === "web3" || tagLower === "blockchain") {
            questions.push("What do you know about crypto?");
        } else if (tagLower === "ai" || tagLower === "ml" || tagLower === "machine learning") {
            questions.push("What's your take on AI trends?");
        } else if (tagLower === "health" || tagLower === "fitness" || tagLower === "wellness") {
            questions.push("Any tips for staying healthy?");
        } else if (tagLower === "finance" || tagLower === "investing" || tagLower === "money") {
            questions.push("Can you explain a financial concept?");
        } else if (tagLower === "travel") {
            questions.push("What's a place you'd recommend visiting?");
        } else if (tagLower === "food" || tagLower === "cooking" || tagLower === "recipes") {
            questions.push("Can you suggest a recipe?");
        } else if (tagLower === "music" || tagLower === "entertainment") {
            questions.push("What music would you recommend?");
        } else if (tagLower === "gaming" || tagLower === "games") {
            questions.push("What games do you like?");
        }
    }
    
    // Generic fallback questions if we don't have enough
    const fallbacks = [
        "Tell me about yourself!",
        "What makes you unique?",
        "How can you help me today?",
        "What's something cool you can do?",
    ];
    
    // Ensure we have exactly 4 unique questions
    const uniqueQuestions = [...new Set(questions)];
    while (uniqueQuestions.length < 4 && fallbacks.length > 0) {
        const fallback = fallbacks.shift()!;
        if (!uniqueQuestions.includes(fallback)) {
            uniqueQuestions.push(fallback);
        }
    }
    
    return uniqueQuestions.slice(0, 4);
}

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
        // First try with suggested_questions column
        let agent: {
            id: string;
            name: string;
            personality: string | null;
            avatar_emoji: string;
            avatar_url: string | null;
            visibility: string;
            x402_enabled: boolean;
            x402_price_cents: number;
            x402_network: string;
            owner_address: string;
            tags: string[] | null;
            suggested_questions?: string[] | null;
            public_access_enabled?: boolean | null;
        } | null = null;
        let queryError = null;
        
        const { data, error } = await supabase
            .from("shout_agents")
            .select("id, name, personality, avatar_emoji, avatar_url, visibility, x402_enabled, x402_price_cents, x402_network, owner_address, tags, suggested_questions, public_access_enabled")
            .eq("id", id)
            .single();
        
        if (error) {
            // If the column doesn't exist, try without it
            if (error.message?.includes("suggested_questions") || error.message?.includes("public_access_enabled")) {
                const { data: fallbackData, error: fallbackError } = await supabase
                    .from("shout_agents")
                    .select("id, name, personality, avatar_emoji, avatar_url, visibility, x402_enabled, x402_price_cents, x402_network, owner_address, tags")
                    .eq("id", id)
                    .single();
                agent = fallbackData;
                queryError = fallbackError;
            } else {
                queryError = error;
            }
        } else {
            agent = data;
        }

        if (queryError || !agent) {
            console.error("[Public Agent] Query error:", queryError);
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        // Check visibility: allow public, official (with public access), or official by default
        const isPublic = agent.visibility === "public";
        const isOfficial = agent.visibility === "official";
        // Official agents are publicly accessible by default unless explicitly disabled
        const officialPublicAccess = agent.public_access_enabled !== false;
        
        if (!isPublic && !(isOfficial && officialPublicAccess)) {
            return NextResponse.json({ error: "This agent is not public" }, { status: 403 });
        }

        // Use custom suggested questions if defined (Official agents), otherwise auto-generate
        const suggestedQuestions = (agent.suggested_questions && agent.suggested_questions.length > 0)
            ? agent.suggested_questions.slice(0, 4)
            : generateSuggestedQuestions(agent);

        return NextResponse.json({
            ...agent,
            suggested_questions: suggestedQuestions,
        });
    } catch (error) {
        console.error("[Public Agent] Error:", error);
        return NextResponse.json({ error: "Failed to fetch agent" }, { status: 500 });
    }
}

