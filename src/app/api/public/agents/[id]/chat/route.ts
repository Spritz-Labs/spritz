import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { requireX402Payment, type X402Config } from "@/lib/x402";
import { checkRateLimit } from "@/lib/ratelimit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// Initialize Google GenAI
const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

// Build system instruction for agent
function buildSystemInstruction(agent: {
    name: string;
    system_instructions: string | null;
    personality: string | null;
    use_knowledge_base: boolean;
    visibility: string;
}): string {
    const baseInstruction = agent.system_instructions || 
        `You are a helpful AI assistant named ${agent.name}.${agent.personality ? ` ${agent.personality}` : ""}`;
    
    // Add markdown and image guidance for official agents with knowledge bases
    const markdownGuidance = agent.visibility === "official" && agent.use_knowledge_base
        ? `

IMPORTANT: You can use full markdown formatting in your responses:
- Use **bold** and *italic* for emphasis
- Use bullet points and numbered lists for organization
- Use code blocks for technical content
- When referencing images or logos from your knowledge base, use markdown image syntax: ![Description](URL)
- If you have image URLs in your context, display them! Example: ![Sponsor Logo](https://example.com/logo.png)
- For multiple images/logos, display them in a list or describe them clearly with their URLs`
        : "";
    
    return baseInstruction + markdownGuidance;
}

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
        console.error("[Public Chat] Error generating query embedding:", error);
        return null;
    }
}

// Helper to get RAG context from knowledge base
async function getRAGContext(agentId: string, message: string): Promise<string | null> {
    if (!supabase || !ai) {
        console.log("[Public RAG] Supabase or AI not configured");
        return null;
    }

    try {
        // Generate embedding for the query
        console.log("[Public RAG] Generating embedding for query:", message.substring(0, 50));
        const queryEmbedding = await generateQueryEmbedding(message);
        if (!queryEmbedding) {
            console.log("[Public RAG] Failed to generate query embedding");
            return null;
        }

        // Search for relevant chunks - increased count for more diverse results
        console.log("[Public RAG] Searching for chunks for agent:", agentId);
        const { data: chunks, error } = await supabase.rpc("match_knowledge_chunks", {
            p_agent_id: agentId,
            p_query_embedding: `[${queryEmbedding.join(",")}]`,
            p_match_count: 8, // Increased from 5 for more comprehensive context
            p_match_threshold: 0.25 // Lowered to catch more relevant results
        });

        if (error) {
            console.error("[Public RAG] Error querying chunks:", error);
            return null;
        }

        if (!chunks?.length) {
            console.log("[Public RAG] No matching chunks found");
            return null;
        }

        console.log("[Public RAG] Found", chunks.length, "relevant chunks");

        // Format context from matching chunks - include source title for disambiguation
        const context = chunks
            .map((chunk: { content: string; similarity: number; source_title?: string }) => 
                `[Source: ${chunk.source_title || "Unknown"} | Relevance: ${(chunk.similarity * 100).toFixed(0)}%]\n${chunk.content}`)
            .join("\n\n---\n\n");

        return context;
    } catch (err) {
        console.error("[Public RAG] Error:", err);
        return null;
    }
}

// POST: Chat with an x402-enabled agent (public API)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // Rate limit: 30 requests per minute for AI chat
    const rateLimitResponse = await checkRateLimit(request, "ai");
    if (rateLimitResponse) return rateLimitResponse;

    if (!supabase || !ai) {
        return NextResponse.json({ error: "Service not configured" }, { status: 500 });
    }

    const { id } = await params;

    try {
        const body = await request.json();
        const { message, sessionId } = body;

        if (!message?.trim()) {
            return NextResponse.json({ error: "Message is required" }, { status: 400 });
        }

        // Get the agent
        const { data: agent, error: agentError } = await supabase
            .from("shout_agents")
            .select("*")
            .eq("id", id)
            .single();

        if (agentError || !agent) {
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        // Verify agent is public or official (with public access enabled)
        const isPublic = agent.visibility === "public";
        const isOfficial = agent.visibility === "official";
        // Official agents are publicly accessible by default unless explicitly disabled
        const officialPublicAccess = agent.public_access_enabled !== false;
        
        if (!isPublic && !(isOfficial && officialPublicAccess)) {
            return NextResponse.json({ 
                error: "Only public agents can be accessed via this API" 
            }, { status: 403 });
        }

        // Initialize payment tracking
        let payerAddress = "anonymous";
        let paymentAmountCents = 0;
        let paymentTxHash: string | null = null;

        // If x402 is enabled, verify payment
        if (agent.x402_enabled) {
            const x402Config: X402Config = {
                priceUSD: `$${(agent.x402_price_cents / 100).toFixed(2)}`,
                network: (agent.x402_network || "base") as "base" | "base-sepolia",
                payToAddress: agent.x402_wallet_address || agent.owner_address,
                description: `Chat with ${agent.name} AI agent`,
            };

            const paymentResponse = await requireX402Payment(request, x402Config);
            if (paymentResponse) {
                return paymentResponse; // Return 402 if payment required/invalid
            }

            // Extract payer info from payment header
            const paymentHeader = request.headers.get("X-Payment");
            if (paymentHeader) {
                try {
                    const payment = JSON.parse(paymentHeader);
                    payerAddress = payment.from || "anonymous";
                    paymentAmountCents = payment.amount ? parseInt(payment.amount) / 10000 : agent.x402_price_cents;
                } catch {
                    // Payment header parsing failed, use defaults
                }
            }
        }

        // Build chat history for context (limited to this session)
        const history: { role: "user" | "model"; parts: { text: string }[] }[] = [];
        
        if (sessionId) {
            const { data: chatHistory } = await supabase
                .from("shout_agent_chats")
                .select("role, content")
                .eq("agent_id", id)
                .eq("session_id", sessionId)
                .order("created_at", { ascending: true })
                .limit(20);

            if (chatHistory) {
                for (const msg of chatHistory) {
                    history.push({
                        role: msg.role === "user" ? "user" : "model",
                        parts: [{ text: msg.content }]
                    });
                }
            }
        }

        // Get RAG context if knowledge base is enabled
        let ragContext = "";
        console.log("[Public Chat] Agent settings - use_knowledge_base:", agent.use_knowledge_base);
        if (agent.use_knowledge_base) {
            console.log("[Public Chat] Fetching RAG context for message:", message.substring(0, 50));
            const context = await getRAGContext(id, message);
            if (context) {
                console.log("[Public Chat] Got RAG context, length:", context.length);
                ragContext = `\n\nRelevant context from knowledge base:\n${context}\n\nUse this context to inform your response when relevant.`;
            } else {
                console.log("[Public Chat] No RAG context found");
            }
        }

        // Build the full message with context
        const fullMessage = message + ragContext;

        // Build config for generate content
        const generateConfig: {
            model: string;
            contents: { role: string; parts: { text: string }[] }[];
            config: {
                systemInstruction?: string;
                maxOutputTokens: number;
                temperature: number;
            };
        } = {
            model: agent.model || "gemini-2.0-flash", // Free tier: 15 RPM, 1500 req/day
            contents: [
                ...history,
                { role: "user", parts: [{ text: fullMessage }] }
            ],
            config: {
                systemInstruction: buildSystemInstruction(agent),
                maxOutputTokens: 2048,
                temperature: 0.7,
            },
        };

        // Generate response
        const result = await ai.models.generateContent(generateConfig);
        const assistantMessage = result.text || "I'm sorry, I couldn't generate a response.";

        // Create session ID if not provided
        const finalSessionId = sessionId || `x402-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        // Store the conversation
        await supabase.from("shout_agent_chats").insert([
            {
                agent_id: id,
                user_address: payerAddress,
                session_id: finalSessionId,
                role: "user",
                content: message,
            },
            {
                agent_id: id,
                user_address: payerAddress,
                session_id: finalSessionId,
                role: "assistant",
                content: assistantMessage,
            },
        ]);

        // Increment message count and paid stats
        await supabase.rpc("increment_agent_messages", { agent_id_param: id });
        
        // Track the paid transaction
        if (paymentAmountCents > 0) {
            await supabase.rpc("increment_agent_paid_stats", { 
                agent_id_param: id,
                amount_cents_param: paymentAmountCents 
            });

            // Log the transaction
            await supabase.from("shout_agent_x402_transactions").insert({
                agent_id: id,
                payer_address: payerAddress,
                amount_cents: paymentAmountCents,
                network: agent.x402_network || "base",
                transaction_hash: paymentTxHash,
            });
        }

        return NextResponse.json({
            success: true,
            sessionId: finalSessionId,
            message: assistantMessage,
            agent: {
                id: agent.id,
                name: agent.name,
                emoji: agent.avatar_emoji,
            },
        });

    } catch (error) {
        console.error("[Public Agent Chat] Error:", error);
        return NextResponse.json({ error: "Failed to generate response" }, { status: 500 });
    }
}

// GET: Get agent info and pricing (no payment required)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { id } = await params;

    try {
        const { data: agent, error } = await supabase
            .from("shout_agents")
            .select(`
                id, 
                name, 
                personality, 
                avatar_emoji, 
                visibility,
                public_access_enabled,
                x402_enabled,
                x402_price_cents,
                x402_network,
                web_search_enabled,
                use_knowledge_base,
                message_count,
                tags,
                created_at
            `)
            .eq("id", id)
            .in("visibility", ["public", "official"])
            .single();

        if (error || !agent) {
            return NextResponse.json({ error: "Agent not found or not public" }, { status: 404 });
        }
        
        // For official agents, check if public access is enabled (defaults to true)
        if (agent.visibility === "official" && agent.public_access_enabled === false) {
            return NextResponse.json({ error: "Agent not found or not public" }, { status: 404 });
        }

        // Build response - include pricing only if x402 is enabled
        const response: {
            agent: {
                id: string;
                name: string;
                personality: string | null;
                emoji: string;
                tags: string[] | null;
                features: {
                    webSearch: boolean;
                    knowledgeBase: boolean;
                };
                stats: {
                    totalMessages: number;
                };
                createdAt: string;
            };
            pricing: {
                enabled: boolean;
                pricePerMessage?: string;
                priceCents?: number;
                network?: string;
                currency?: string;
            };
            endpoints: {
                chat: string;
                info: string;
            };
        } = {
            agent: {
                id: agent.id,
                name: agent.name,
                personality: agent.personality,
                emoji: agent.avatar_emoji,
                tags: agent.tags,
                features: {
                    webSearch: agent.web_search_enabled,
                    knowledgeBase: agent.use_knowledge_base,
                },
                stats: {
                    totalMessages: agent.message_count,
                },
                createdAt: agent.created_at,
            },
            pricing: {
                enabled: agent.x402_enabled || false,
            },
            endpoints: {
                chat: `/api/public/agents/${agent.id}/chat`,
                info: `/api/public/agents/${agent.id}`,
            },
        };

        // Add pricing details if x402 is enabled
        if (agent.x402_enabled) {
            response.pricing = {
                ...response.pricing,
                pricePerMessage: `$${(agent.x402_price_cents / 100).toFixed(2)}`,
                priceCents: agent.x402_price_cents,
                network: agent.x402_network,
                currency: "USDC",
            };
        }

        return NextResponse.json(response);

    } catch (error) {
        console.error("[Public Agent Info] Error:", error);
        return NextResponse.json({ error: "Failed to fetch agent" }, { status: 500 });
    }
}

