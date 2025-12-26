import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// Initialize Google GenAI
const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

// Generate embedding for a query using Gemini
async function generateQueryEmbedding(query: string): Promise<number[] | null> {
    if (!ai) return null;
    
    try {
        const result = await ai.models.embedContent({
            model: "text-embedding-004",
            contents: query,
        });
        
        return result.embeddings?.[0]?.values || null;
    } catch (error) {
        console.error("[Chat] Error generating query embedding:", error);
        return null;
    }
}

// Retrieve relevant chunks using vector similarity
async function retrieveRelevantChunks(
    agentId: string,
    query: string,
    maxChunks: number = 5
): Promise<string[]> {
    if (!supabase) return [];
    
    try {
        // Generate embedding for the query
        const queryEmbedding = await generateQueryEmbedding(query);
        if (!queryEmbedding) {
            console.log("[Chat] Failed to generate query embedding, falling back to no RAG");
            return [];
        }

        // Search for similar chunks
        const { data: chunks, error } = await supabase.rpc("match_knowledge_chunks", {
            p_agent_id: agentId,
            p_query_embedding: `[${queryEmbedding.join(",")}]`,
            p_match_count: maxChunks,
            p_match_threshold: 0.5, // Lower threshold to get more results
        });

        if (error) {
            console.error("[Chat] Error retrieving chunks:", error);
            return [];
        }

        if (!chunks || chunks.length === 0) {
            console.log("[Chat] No relevant chunks found");
            return [];
        }

        console.log(`[Chat] Found ${chunks.length} relevant chunks`);
        return chunks.map((c: { content: string; similarity: number }) => 
            `[Relevance: ${(c.similarity * 100).toFixed(0)}%]\n${c.content}`
        );
    } catch (error) {
        console.error("[Chat] Error in RAG retrieval:", error);
        return [];
    }
}

// Fallback: Simple function to fetch text content from a URL (for non-indexed items)
async function fetchUrlContent(url: string): Promise<string | null> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; SpritzBot/1.0)",
            },
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) return null;
        
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
            return null;
        }
        
        const html = await response.text();
        
        // Simple HTML to text conversion - strip tags and clean up
        const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        
        // Limit to first 2000 chars to avoid token limits
        return text.slice(0, 2000);
    } catch {
        return null;
    }
}

// POST: Chat with an agent
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    if (!ai) {
        console.error("[Agent Chat] Gemini API key not configured. Set GOOGLE_GEMINI_API_KEY in .env");
        return NextResponse.json({ error: "Gemini API not configured. Please add GOOGLE_GEMINI_API_KEY to your environment." }, { status: 500 });
    }

    try {
        const { id } = await params;
        const body = await request.json();
        const { userAddress, message } = body;

        if (!userAddress || !message) {
            return NextResponse.json(
                { error: "User address and message are required" },
                { status: 400 }
            );
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Get the agent
        const { data: agent, error: agentError } = await supabase
            .from("shout_agents")
            .select("*")
            .eq("id", id)
            .single();

        if (agentError || !agent) {
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        // Check access
        if (agent.owner_address !== normalizedAddress && agent.visibility === "private") {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Get recent chat history for context (last 10 messages)
        const { data: recentChats } = await supabase
            .from("shout_agent_chats")
            .select("role, content")
            .eq("agent_id", id)
            .eq("user_address", normalizedAddress)
            .order("created_at", { ascending: false })
            .limit(10);

        // Get knowledge base context (if enabled)
        let knowledgeContext = "";
        const useKnowledgeBase = agent.use_knowledge_base !== false; // Default true
        
        if (useKnowledgeBase) {
            // Try RAG retrieval first (using indexed embeddings)
            const relevantChunks = await retrieveRelevantChunks(id, message, 5);
            
            if (relevantChunks.length > 0) {
                // Use RAG results
                console.log("[Chat] Using RAG with", relevantChunks.length, "chunks");
                knowledgeContext = "\n\n## Relevant Knowledge (from indexed sources):\n" + 
                    relevantChunks.join("\n\n---\n\n");
            } else {
                // Fallback to direct URL fetching for non-indexed items
                const { data: knowledgeItems } = await supabase
                    .from("shout_agent_knowledge")
                    .select("url, title, content_type, status")
                    .eq("agent_id", id)
                    .eq("status", "pending") // Only fetch pending (non-indexed) items
                    .limit(3);

                if (knowledgeItems && knowledgeItems.length > 0) {
                    console.log("[Chat] Falling back to URL fetching for", knowledgeItems.length, "items");
                    const contentPromises = knowledgeItems.map(async (item) => {
                        const content = await fetchUrlContent(item.url);
                        if (content) {
                            return `\n--- ${item.title} (${item.url}) ---\n${content}`;
                        }
                        return null;
                    });
                    
                    const contents = await Promise.all(contentPromises);
                    const validContents = contents.filter(Boolean);
                    if (validContents.length > 0) {
                        knowledgeContext = "\n\n## Knowledge Base Context:\n" + validContents.join("\n");
                    }
                }
            }
        }

        // Build enhanced system instructions with knowledge context
        let systemInstructions = agent.system_instructions || `You are a helpful AI assistant named ${agent.name}.`;
        if (knowledgeContext) {
            systemInstructions += `\n\nYou have access to the following knowledge sources. Use this information to help answer questions when relevant:${knowledgeContext}`;
        }

        // Build conversation history
        const history = (recentChats || []).reverse().map(chat => ({
            role: chat.role as "user" | "model",
            parts: [{ text: chat.content }]
        }));

        // Add the new user message
        history.push({
            role: "user" as const,
            parts: [{ text: message }]
        });

        // Store user message
        await supabase.from("shout_agent_chats").insert({
            agent_id: id,
            user_address: normalizedAddress,
            role: "user",
            content: message,
        });

        // Build config with optional Google Search grounding
        const webSearchEnabled = agent.web_search_enabled !== false; // Default true
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const config: any = {
            systemInstruction: systemInstructions,
            maxOutputTokens: 2048,
            temperature: 0.7,
        };
        
        // Enable Google Search grounding for real-time information (if enabled)
        if (webSearchEnabled) {
            config.tools = [{ googleSearch: {} }];
        }

        // Generate response using Gemini
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: history,
            config,
        });

        const assistantMessage = response.text || "I'm sorry, I couldn't generate a response.";

        // Store assistant message
        await supabase.from("shout_agent_chats").insert({
            agent_id: id,
            user_address: normalizedAddress,
            role: "assistant",
            content: assistantMessage,
        });

        // Increment message count
        await supabase.rpc("increment_agent_messages", { p_agent_id: id });

        return NextResponse.json({
            message: assistantMessage,
            agentName: agent.name,
            agentEmoji: agent.avatar_emoji,
        });
    } catch (error) {
        console.error("[Agent Chat] Error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json(
            { error: `Failed to generate response: ${errorMessage}` },
            { status: 500 }
        );
    }
}

// GET: Get chat history
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
        const limit = parseInt(searchParams.get("limit") || "50");

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Get the agent to check access
        const { data: agent } = await supabase
            .from("shout_agents")
            .select("owner_address, visibility")
            .eq("id", id)
            .single();

        if (!agent) {
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        if (agent.owner_address !== normalizedAddress && agent.visibility === "private") {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Get chat history
        const { data: chats, error } = await supabase
            .from("shout_agent_chats")
            .select("id, role, content, created_at")
            .eq("agent_id", id)
            .eq("user_address", normalizedAddress)
            .order("created_at", { ascending: true })
            .limit(limit);

        if (error) {
            console.error("[Agent Chat] Error fetching history:", error);
            return NextResponse.json({ error: "Failed to fetch chat history" }, { status: 500 });
        }

        return NextResponse.json({ chats: chats || [] });
    } catch (error) {
        console.error("[Agent Chat] Error:", error);
        return NextResponse.json({ error: "Failed to fetch chat history" }, { status: 500 });
    }
}

// DELETE: Clear chat history
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

        // Delete chat history for this user and agent
        const { error } = await supabase
            .from("shout_agent_chats")
            .delete()
            .eq("agent_id", id)
            .eq("user_address", normalizedAddress);

        if (error) {
            console.error("[Agent Chat] Error clearing history:", error);
            return NextResponse.json({ error: "Failed to clear chat history" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Agent Chat] Error:", error);
        return NextResponse.json({ error: "Failed to clear chat history" }, { status: 500 });
    }
}

