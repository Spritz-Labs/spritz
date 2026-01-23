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
    // Get current date for context
    const now = new Date();
    const currentDate = now.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    const dateContext = `

CURRENT DATE: Today is ${currentDate}. When users ask about "today", "tomorrow", "this week", etc., use this date as reference. If the user asks about events on a specific date, check if that date has passed or is in the future relative to today.`;

    const baseInstruction = agent.system_instructions || 
        `You are a helpful AI assistant named ${agent.name}.${agent.personality ? ` ${agent.personality}` : ""}`;
    
    // Add markdown and image guidance for official agents with knowledge bases
    const markdownGuidance = agent.visibility === "official" && agent.use_knowledge_base
        ? `

IMPORTANT: You can use full markdown formatting in your responses:
- Use **bold** and *italic* for emphasis
- Use bullet points and numbered lists for organization
- Use code blocks for technical content
- When referencing images from your knowledge base, ONLY use markdown with actual HTTP/HTTPS URLs: ![Description](https://example.com/image.png)
- NEVER output base64 encoded data (data:image/... or long encoded strings) - these are unreadable to users
- If you see base64 data in your context, ignore it completely - do not reference or include it
- Only display images if you have a proper URL starting with http:// or https://`
        : "";
    
    return baseInstruction + dateContext + markdownGuidance;
}

// Clean base64 data from content to prevent it from polluting AI context/responses
function cleanBase64FromContent(content: string): string {
    // Remove base64 image data (data:image/... format)
    let cleaned = content.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]{100,}/g, '[image removed]');
    
    // Remove markdown images with base64 src
    cleaned = cleaned.replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, '[base64 image removed]');
    
    // Remove standalone long base64-like strings (100+ chars of base64 alphabet)
    cleaned = cleaned.replace(/[A-Za-z0-9+/=]{200,}/g, '[encoded data removed]');
    
    // Remove <Base64-Image-Removed> placeholders that Firecrawl may have added
    cleaned = cleaned.replace(/<Base64-Image-Removed>/g, '');
    
    return cleaned;
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

// Helper to detect if message is asking about events
function isEventQuery(message: string): boolean {
    const eventKeywords = [
        'event', 'events', 'happening', 'schedule', 'party', 'parties',
        'meetup', 'summit', 'conference', 'hackathon', 'workshop',
        'side event', 'what\'s on', 'whats on', 'what is on',
        'feb', 'february', '17th', '18th', '19th', '20th', '21st',
        '8th', '16th', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
    ];
    const lowerMessage = message.toLowerCase();
    return eventKeywords.some(keyword => lowerMessage.includes(keyword));
}

// Helper to extract date from message (returns YYYY-MM-DD or null)
function extractDateFromMessage(message: string): string | null {
    const lowerMessage = message.toLowerCase();
    
    // Map common date patterns to 2026 dates for ETHDenver
    const datePatterns: Record<string, string> = {
        'feb 8': '2026-02-08', 'february 8': '2026-02-08', '8th': '2026-02-08',
        'feb 12': '2026-02-12', 'february 12': '2026-02-12', '12th': '2026-02-12',
        'feb 13': '2026-02-13', 'february 13': '2026-02-13', '13th': '2026-02-13',
        'feb 14': '2026-02-14', 'february 14': '2026-02-14', '14th': '2026-02-14',
        'feb 15': '2026-02-15', 'february 15': '2026-02-15', '15th': '2026-02-15',
        'feb 16': '2026-02-16', 'february 16': '2026-02-16', '16th': '2026-02-16',
        'feb 17': '2026-02-17', 'february 17': '2026-02-17', '17th': '2026-02-17',
        'feb 18': '2026-02-18', 'february 18': '2026-02-18', '18th': '2026-02-18',
        'feb 19': '2026-02-19', 'february 19': '2026-02-19', '19th': '2026-02-19',
        'feb 20': '2026-02-20', 'february 20': '2026-02-20', '20th': '2026-02-20',
        'feb 21': '2026-02-21', 'february 21': '2026-02-21', '21st': '2026-02-21',
    };
    
    for (const [pattern, date] of Object.entries(datePatterns)) {
        if (lowerMessage.includes(pattern)) {
            return date;
        }
    }
    return null;
}

// Helper to get structured events from the events table
async function getEventContext(agentId: string, message: string): Promise<string | null> {
    if (!supabase) return null;
    
    try {
        // Check if this is an event-related query
        if (!isEventQuery(message)) {
            return null;
        }
        
        console.log("[Event Context] Query detected as event-related");
        
        // Try to extract a specific date
        const targetDate = extractDateFromMessage(message);
        
        // First get total count for the date/all events
        let countQuery = supabase
            .from("shout_agent_events")
            .select("*", { count: "exact", head: true })
            .eq("agent_id", agentId);
        
        if (targetDate) {
            countQuery = countQuery.eq("event_date", targetDate);
        }
        
        const { count: totalCount } = await countQuery;
        
        // Now get events, prioritizing featured ones
        let query = supabase
            .from("shout_agent_events")
            .select("name, description, event_type, event_date, start_time, end_time, venue, organizer, event_url, source, is_featured")
            .eq("agent_id", agentId)
            .order("is_featured", { ascending: false }) // Featured first!
            .order("event_date", { ascending: true })
            .order("start_time", { ascending: true });
        
        if (targetDate) {
            console.log("[Event Context] Filtering for date:", targetDate);
            query = query.eq("event_date", targetDate);
        }
        
        // Limit to 8 events for context (AI will pick top 3-4)
        query = query.limit(8);
        
        const { data: events, error } = await query;
        
        if (error || !events?.length) {
            console.log("[Event Context] No events found");
            return null;
        }
        
        console.log("[Event Context] Found", events.length, "events (total:", totalCount, ")");
        
        // Format events for context
        const formatTime = (time: string | null) => {
            if (!time) return "";
            try {
                const [hours, minutes] = time.split(":");
                const hour = parseInt(hours);
                const ampm = hour >= 12 ? "PM" : "AM";
                const hour12 = hour % 12 || 12;
                return `${hour12}:${minutes} ${ampm}`;
            } catch {
                return time;
            }
        };
        
        const eventLines = events.map(event => {
            const timeStr = event.start_time 
                ? event.end_time 
                    ? `${formatTime(event.start_time)} - ${formatTime(event.end_time)}`
                    : formatTime(event.start_time)
                : "Time TBA";
            const featured = event.is_featured ? "⭐ FEATURED" : "";
            
            return `- ${featured} ${event.name}
  📅 ${event.event_date} @ ${timeStr}
  ${event.venue ? `📍 ${event.venue}` : ""}
  ${event.organizer ? `🏢 ${event.organizer}` : ""}
  ${event.event_url ? `🔗 ${event.event_url}` : ""}`.trim();
        });
        
        const eventsPageUrl = `https://app.spritz.chat/agent/${agentId}/events`;
        const dateStr = targetDate || "all dates";
        
        const contextHeader = `\n\n=== EVENT DATA (${events.length} of ${totalCount || events.length} total for ${dateStr}) ===
IMPORTANT: Show only 3-4 TOP events. Featured (⭐) events first!
Full events page: ${eventsPageUrl}

`;
        
        const contextFooter = `\n\n---
REMINDER: Only show 3-4 events above. Then add:
"📅 Want to see all ${totalCount || events.length} events? [Browse Full Schedule →](${eventsPageUrl})"`;
        
        return contextHeader + eventLines.join("\n\n") + contextFooter;
    } catch (err) {
        console.error("[Event Context] Error:", err);
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
        // Clean base64 data from chunks to prevent polluting AI responses
        const context = chunks
            .map((chunk: { content: string; similarity: number; source_title?: string }) => {
                const cleanedContent = cleanBase64FromContent(chunk.content);
                return `[Source: ${chunk.source_title || "Unknown"} | Relevance: ${(chunk.similarity * 100).toFixed(0)}%]\n${cleanedContent}`;
            })
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

        // Get structured event context for Official agents
        let eventContext = "";
        if (agent.visibility === "official") {
            console.log("[Public Chat] Checking for event context...");
            const events = await getEventContext(id, message);
            if (events) {
                console.log("[Public Chat] Got event context, length:", events.length);
                eventContext = events + "\n\nPRIORITIZE the structured event data above over scraped content. Include event URLs when available!";
            }
        }

        // Build the full message with context
        const fullMessage = message + ragContext + eventContext;

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

