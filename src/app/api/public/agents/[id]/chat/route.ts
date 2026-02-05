import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { requireX402Payment, type X402Config } from "@/lib/x402";
import { checkRateLimit } from "@/lib/ratelimit";
import {
    estimateCostUsd,
    sanitizeErrorMessage,
    inferErrorCode,
} from "@/lib/agent-cost";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

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
    const currentDate = now.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    const dateContext = `

CURRENT DATE: Today is ${currentDate}. When users ask about "today", "tomorrow", "this week", etc., use this date as reference. If the user asks about events on a specific date, check if that date has passed or is in the future relative to today.`;

    const baseInstruction =
        agent.system_instructions ||
        `You are a helpful AI assistant named ${agent.name}.${agent.personality ? ` ${agent.personality}` : ""}`;

    const formattingGuidance = `

## Response formatting
Use markdown so replies are easy to read:
- **Bold** for emphasis and *italic* when needed
- Bullet or numbered lists for options, steps, or multiple items
- Tables (| col1 | col2 |) for comparisons or structured data
- \`inline code\` for technical terms, and code blocks for longer snippets
- Short paragraphs; add blank lines between sections`;

    // Add markdown and image guidance for official agents with knowledge bases
    const markdownGuidance =
        agent.visibility === "official" && agent.use_knowledge_base
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

    const eventRegistrationGuidance =
        agent.visibility === "official"
            ? `

## CRITICAL: Event Registration Instructions

NEVER say you "cannot" or "can't" register users for events. You CAN and SHOULD help users register!

When users ask about registering for events (especially Luma events):
1. **ALWAYS respond positively**: "I'd be happy to help you register!" or "Let me help you register for that event!"
2. **Find the registration URL from the event context** - look for "🎫 REGISTRATION URL:" in the event data provided
3. **Use that EXACT URL** to create a markdown link: [Register for [Event Name]](EXACT_URL_FROM_EVENT_DATA)
4. **For Luma events** (URLs containing "lu.ma" or "luma.com"): Mention that their saved information will be pre-filled when they click the link
5. **Example**: If event shows "🎫 REGISTRATION URL: https://luma.com/ualsao7v", respond with:
   "I'd be happy to help you register for Logos Circle Barcelona #5! Click here: [Register Now](https://luma.com/ualsao7v). Your saved information will be pre-filled automatically."

CRITICAL: Always use the EXACT URL from the "🎫 REGISTRATION URL:" field - never make up URLs or use event page URLs!

**DO NOT**:
- Say "I can't directly register you"
- Say "I cannot register you"
- Say "you can register yourself" (be more helpful!)
- Just provide a link without offering to help

**DO**:
- Offer to help register
- Provide clickable markdown links
- Be enthusiastic and helpful
- Explain the registration process briefly`
            : "";

    return `${dateContext}\n\n${baseInstruction}${formattingGuidance}${markdownGuidance}${eventRegistrationGuidance}`;
}

// Clean base64 data from content to prevent it from polluting AI context/responses
function cleanBase64FromContent(content: string): string {
    // Remove base64 image data (data:image/... format)
    let cleaned = content.replace(
        /data:image\/[^;]+;base64,[A-Za-z0-9+/=]{100,}/g,
        "[image removed]",
    );

    // Remove markdown images with base64 src
    cleaned = cleaned.replace(
        /!\[[^\]]*\]\(data:image\/[^)]+\)/g,
        "[base64 image removed]",
    );

    // Remove standalone long base64-like strings (100+ chars of base64 alphabet)
    cleaned = cleaned.replace(
        /[A-Za-z0-9+/=]{200,}/g,
        "[encoded data removed]",
    );

    // Remove <Base64-Image-Removed> placeholders that Firecrawl may have added
    cleaned = cleaned.replace(/<Base64-Image-Removed>/g, "");

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
        "event",
        "events",
        "happening",
        "schedule",
        "party",
        "parties",
        "meetup",
        "summit",
        "conference",
        "hackathon",
        "workshop",
        "side event",
        "gathering",
        "privacy",
        "what's on",
        "whats on",
        "what is on",
        "feb",
        "february",
        "17th",
        "18th",
        "19th",
        "20th",
        "21st",
        "8th",
        "16th",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
        "register",
        "registration",
        "rsvp",
        "sign up",
        "signup",
        "ticket",
        "tickets",
    ];
    const lowerMessage = message.toLowerCase();
    return eventKeywords.some((keyword) => lowerMessage.includes(keyword));
}

// Extract topic words from message for event name/description matching (4+ chars, not generic)
const EVENT_STOPWORDS = new Set([
    "event",
    "events",
    "schedule",
    "happening",
    "today",
    "tomorrow",
    "about",
    "what",
    "when",
    "where",
    "which",
    "there",
    "this",
    "that",
    "have",
    "with",
    "would",
    "could",
    "please",
    "check",
    "double",
    "think",
    "thought",
    "know",
    "february",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]);
function extractEventTopicWords(message: string): string[] {
    const words = message
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/);
    const out: string[] = [];
    for (const w of words) {
        if (w.length >= 4 && !EVENT_STOPWORDS.has(w) && !out.includes(w)) {
            out.push(w);
        }
    }
    return out.slice(0, 5); // max 5 topic words
}

// Helper to extract date from message (returns YYYY-MM-DD or null)
function extractDateFromMessage(message: string): string | null {
    const lowerMessage = message.toLowerCase();

    // Map common date patterns to 2026 dates for ETHDenver
    const datePatterns: Record<string, string> = {
        "feb 8": "2026-02-08",
        "february 8": "2026-02-08",
        "8th": "2026-02-08",
        "feb 12": "2026-02-12",
        "february 12": "2026-02-12",
        "12th": "2026-02-12",
        "feb 13": "2026-02-13",
        "february 13": "2026-02-13",
        "13th": "2026-02-13",
        "feb 14": "2026-02-14",
        "february 14": "2026-02-14",
        "14th": "2026-02-14",
        "feb 15": "2026-02-15",
        "february 15": "2026-02-15",
        "15th": "2026-02-15",
        "feb 16": "2026-02-16",
        "february 16": "2026-02-16",
        "16th": "2026-02-16",
        "feb 17": "2026-02-17",
        "february 17": "2026-02-17",
        "17th": "2026-02-17",
        "feb 18": "2026-02-18",
        "february 18": "2026-02-18",
        "18th": "2026-02-18",
        "feb 19": "2026-02-19",
        "february 19": "2026-02-19",
        "19th": "2026-02-19",
        "feb 20": "2026-02-20",
        "february 20": "2026-02-20",
        "20th": "2026-02-20",
        "feb 21": "2026-02-21",
        "february 21": "2026-02-21",
        "21st": "2026-02-21",
    };

    for (const [pattern, date] of Object.entries(datePatterns)) {
        if (lowerMessage.includes(pattern)) {
            return date;
        }
    }
    return null;
}

// Helper to get structured events from the events table
async function getEventContext(
    agentId: string,
    message: string,
): Promise<string | null> {
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
            .select(
                "name, description, event_type, event_date, start_time, end_time, venue, organizer, event_url, rsvp_url, source, is_featured",
            )
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

        console.log(
            "[Event Context] Found",
            events.length,
            "events (total:",
            totalCount,
            ")",
        );

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

        const eventLines = events.map((event) => {
            const timeStr = event.start_time
                ? event.end_time
                    ? `${formatTime(event.start_time)} - ${formatTime(event.end_time)}`
                    : formatTime(event.start_time)
                : "Time TBA";
            const featured = event.is_featured ? "⭐ FEATURED" : "";

            // Determine registration URL (prioritize rsvp_url, fallback to event_url if Luma)
            const registrationUrl =
                event.rsvp_url ||
                (event.event_url &&
                (event.event_url.includes("lu.ma") ||
                    event.event_url.includes("luma.com"))
                    ? event.event_url
                    : null);
            const isLuma =
                registrationUrl &&
                (registrationUrl.includes("lu.ma") ||
                    registrationUrl.includes("luma.com"));

            // Format registration info prominently - make it VERY clear
            let regInfo = "";
            if (registrationUrl) {
                regInfo = `\n  🎫 REGISTRATION URL FOR MARKDOWN LINK: ${registrationUrl}${isLuma ? " (Luma event - COPY THIS EXACT URL!)" : ""}
  EXAMPLE MARKDOWN: [Register Now](${registrationUrl})`;
            }

            return `- ${featured} ${event.name}
  📅 ${event.event_date} @ ${timeStr}
  ${event.venue ? `📍 ${event.venue}` : ""}
  ${event.organizer ? `🏢 ${event.organizer}` : ""}
  ${event.event_url ? `🔗 Event page: ${event.event_url}` : ""}${regInfo}`.trim();
        });

        const eventsPageUrl = `https://app.spritz.chat/agent/${agentId}/events`;
        const dateStr = targetDate || "all dates";

        const contextHeader = `\n\n=== EVENT DATA (${events.length} of ${totalCount || events.length} total for ${dateStr}) ===
IMPORTANT: Show only 3-4 TOP events. Featured (⭐) events first!
Full events page: ${eventsPageUrl}

🚨 CRITICAL REGISTRATION INSTRUCTIONS 🚨
When users ask to register for an event (especially Luma events):
- NEVER say "I can't" or "I cannot" register them - YOU CAN AND SHOULD HELP!
- ALWAYS respond: "I'd be happy to help you register!" or "Let me help you register!"
- Find the "🎫 REGISTRATION URL FOR MARKDOWN LINK:" from the event data above
- You MUST include the EXACT URL in your markdown link - the URL is provided in the event data!
- Use this EXACT format: [Register Now](EXACT_URL_FROM_EVENT_DATA)
- DO NOT create a link without a URL - the URL is always provided in the event data above!
- For Luma events, mention: "Your saved information will be pre-filled automatically"
- EXAMPLE: If event shows "🎫 REGISTRATION URL FOR MARKDOWN LINK: https://luma.com/ualsao7v", you MUST respond with:
  "I'd be happy to help you register for Logos Circle Barcelona #5! Click here: [Register Now](https://luma.com/ualsao7v). Your saved information will be pre-filled automatically."

CRITICAL: The URL is ALWAYS in the event data above - look for "🎫 REGISTRATION URL FOR MARKDOWN LINK:" and copy that EXACT URL into your markdown link!

DO NOT say "you can register yourself" - be helpful and proactive!

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

// Helper to get global Spritz events (shout_events) when agent has Events Database Access
async function getGlobalEventsContext(message: string): Promise<string | null> {
    if (!supabase) return null;
    try {
        const today = new Date().toISOString().split("T")[0];
        const messageLower = message.toLowerCase();
        const askToday =
            messageLower.includes("today") || messageLower.includes("tonight");
        const askTomorrow = messageLower.includes("tomorrow");
        let eventDateFilter = today;
        if (askTomorrow) {
            const t = new Date();
            t.setDate(t.getDate() + 1);
            eventDateFilter = t.toISOString().split("T")[0];
        }

        const eventFields =
            "id, name, description, event_type, event_date, start_time, end_time, venue, city, country, is_virtual, organizer, event_url, rsvp_url, registration_enabled, is_featured";

        // If user asks about a specific topic (e.g. "Privacy Gathering", "privacy events"), fetch events matching name/description first
        const topicWords = extractEventTopicWords(message);
        type EventRow = {
            id: string;
            name: string | null;
            description: string | null;
            event_type: string;
            event_date: string;
            start_time: string | null;
            end_time: string | null;
            venue: string | null;
            city: string | null;
            country: string | null;
            is_virtual: boolean | null;
            organizer: string | null;
            event_url: string | null;
            rsvp_url: string | null;
            registration_enabled: boolean | null;
            is_featured: boolean | null;
        };
        let topicMatchedEvents: EventRow[] = [];
        if (topicWords.length > 0) {
            const orParts = topicWords.flatMap((w) => [
                `name.ilike.%${w}%`,
                `description.ilike.%${w}%`,
            ]);
            const { data: topicEvents } = await supabase
                .from("shout_events")
                .select(eventFields)
                .eq("status", "published")
                .gte("event_date", today)
                .or(orParts.join(","))
                .order("is_featured", { ascending: false })
                .order("event_date", { ascending: true })
                .order("start_time", { ascending: true, nullsFirst: false })
                .limit(20);
            topicMatchedEvents = (topicEvents || []) as EventRow[];
        }

        let query = supabase
            .from("shout_events")
            .select(eventFields)
            .eq("status", "published")
            .order("is_featured", { ascending: false })
            .order("event_date", { ascending: true })
            .order("start_time", { ascending: true, nullsFirst: false })
            .limit(40);

        if (askToday || askTomorrow) {
            query = query.eq("event_date", eventDateFilter);
        } else {
            query = query.gte("event_date", today);
        }

        const { data: rawEvents, error } = await query;
        if (error) {
            console.error("[Public Chat] Global events fetch error:", error);
            return null;
        }
        // Merge topic-matched events first (so e.g. "Privacy Gathering" appears when user asks about it), then main list
        const topicIds = new Set(topicMatchedEvents.map((e) => e.id));
        const mainList = (rawEvents || []).filter(
            (e: { id: string }) => !topicIds.has(e.id),
        );
        const mergedRaw = [...topicMatchedEvents, ...mainList];
        if (!mergedRaw.length) {
            return `\n\n## Global Events Database (Spritz)
No events found for the requested date/range. Users can browse all events at: https://app.spritz.chat/events
When users ask about events, tell them to check the events directory and offer to help with registration for any event.`;
        }

        // Deduplicate: same event often appears with slight name/location variants (e.g. "Satoshi Roundtable XII" Dubai vs دبي)
        const seen = new Set<string>();
        const events = mergedRaw.filter((e) => {
            const nameNorm = (e.name || "")
                .toLowerCase()
                .replace(/^\s*the\s+/i, "")
                .replace(/\s+/g, " ")
                .replace(/\s*\d{4}\s*$/, "")
                .trim();
            const loc =
                [e.city, e.country].filter(Boolean).join(", ").toLowerCase() ||
                "tba";
            const key = `${nameNorm}|${e.event_date}|${loc}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        const lines = events
            .map(
                (e) => `- **${e.name}** (${e.event_type})
  📅 ${e.event_date}${e.start_time ? ` @ ${e.start_time}` : ""}
  📍 ${e.is_virtual ? "Virtual" : [e.venue, e.city, e.country].filter(Boolean).join(", ") || "TBA"}
  ${e.organizer ? `🏢 ${e.organizer}` : ""}
  ${e.event_url ? `🔗 Event: ${e.event_url}` : ""}
  ${e.rsvp_url ? `🎫 Register: ${e.rsvp_url}` : ""}
  ${e.registration_enabled ? "✅ Spritz Registration Available" : ""}
  ${e.is_featured ? "⭐ Featured" : ""}`,
            )
            .join("\n\n");

        const topicNote =
            topicWords.length > 0
                ? `The user asked about topics like: ${topicWords.join(", ")}. Events matching those terms are listed FIRST – prioritize and mention them.\n\n`
                : "";
        return `\n\n## Global Events Database (Spritz) – ${events.length} event(s)
${topicNote}Use this data to answer event questions. Do NOT write code (e.g. Python) to compute dates – use the event list below.
List each event only once. When the same event appears in different forms (e.g. different language for location), present it once with the clearest name and location.

${lines}

When users ask to register: if "Spritz Registration Available", offer to register them; otherwise share the Register/RSVP link.
Full directory: https://app.spritz.chat/events`;
    } catch (err) {
        console.error("[Public Chat] getGlobalEventsContext error:", err);
        return null;
    }
}

// Helper to get RAG context from knowledge base
async function getRAGContext(
    agentId: string,
    message: string,
): Promise<string | null> {
    if (!supabase || !ai) {
        console.log("[Public RAG] Supabase or AI not configured");
        return null;
    }

    try {
        // Generate embedding for the query
        console.log(
            "[Public RAG] Generating embedding for query:",
            message.substring(0, 50),
        );
        const queryEmbedding = await generateQueryEmbedding(message);
        if (!queryEmbedding) {
            console.log("[Public RAG] Failed to generate query embedding");
            return null;
        }

        // Search for relevant chunks - increased count for more diverse results
        console.log("[Public RAG] Searching for chunks for agent:", agentId);
        const { data: chunks, error } = await supabase.rpc(
            "match_knowledge_chunks",
            {
                p_agent_id: agentId,
                p_query_embedding: `[${queryEmbedding.join(",")}]`,
                p_match_count: 8, // Increased from 5 for more comprehensive context
                p_match_threshold: 0.25, // Lowered to catch more relevant results
            },
        );

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
            .map(
                (chunk: {
                    content: string;
                    similarity: number;
                    source_title?: string;
                }) => {
                    const cleanedContent = cleanBase64FromContent(
                        chunk.content,
                    );
                    return `[Source: ${chunk.source_title || "Unknown"} | Relevance: ${(chunk.similarity * 100).toFixed(0)}%]\n${cleanedContent}`;
                },
            )
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
    { params }: { params: Promise<{ id: string }> },
) {
    if (!supabase || !ai) {
        return NextResponse.json(
            { error: "Service not configured" },
            { status: 500 },
        );
    }

    const { id } = await params;

    try {
        const body = await request.json();
        const { message, sessionId, stream: streamRequested } = body;

        if (!message?.trim()) {
            return NextResponse.json(
                { error: "Message is required" },
                { status: 400 },
            );
        }

        // Get the agent
        const { data: agent, error: agentError } = await supabase
            .from("shout_agents")
            .select("*")
            .eq("id", id)
            .single();

        if (agentError || !agent) {
            return NextResponse.json(
                { error: "Agent not found" },
                { status: 404 },
            );
        }

        // Verify agent is public or official (with public access enabled)
        const isPublic = agent.visibility === "public";
        const isOfficial = agent.visibility === "official";
        // Official agents are publicly accessible by default unless explicitly disabled
        const officialPublicAccess = agent.public_access_enabled !== false;

        if (!isPublic && !(isOfficial && officialPublicAccess)) {
            return NextResponse.json(
                {
                    error: "Only public agents can be accessed via this API",
                },
                { status: 403 },
            );
        }

        // Rate limit: stricter for official agents to prevent spamming
        const rateLimitTier =
            agent.visibility === "official" ? "official_ai" : "ai";
        const rateLimitResponse = await checkRateLimit(request, rateLimitTier);
        if (rateLimitResponse) return rateLimitResponse;

        // Initialize payment tracking
        let payerAddress = "anonymous";
        let paymentAmountCents = 0;
        let paymentTxHash: string | null = null;

        // If x402 is enabled, verify payment
        if (agent.x402_enabled) {
            const x402Config: X402Config = {
                priceUSD: `$${(agent.x402_price_cents / 100).toFixed(2)}`,
                network: (agent.x402_network || "base") as
                    | "base"
                    | "base-sepolia",
                payToAddress: agent.x402_wallet_address || agent.owner_address,
                description: `Chat with ${agent.name} AI agent`,
            };

            const paymentResponse = await requireX402Payment(
                request,
                x402Config,
            );
            if (paymentResponse) {
                return paymentResponse; // Return 402 if payment required/invalid
            }

            // Extract payer info from payment header
            const paymentHeader = request.headers.get("X-Payment");
            if (paymentHeader) {
                try {
                    const payment = JSON.parse(paymentHeader);
                    payerAddress = payment.from || "anonymous";
                    paymentAmountCents = payment.amount
                        ? parseInt(payment.amount) / 10000
                        : agent.x402_price_cents;
                } catch {
                    // Payment header parsing failed, use defaults
                }
            }
        }

        // Build chat history for context (limited to this session)
        const history: { role: "user" | "model"; parts: { text: string }[] }[] =
            [];

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
                        parts: [{ text: msg.content }],
                    });
                }
            }
        }

        // Get RAG context if knowledge base is enabled
        let ragContext = "";
        console.log(
            "[Public Chat] Agent settings - use_knowledge_base:",
            agent.use_knowledge_base,
        );
        if (agent.use_knowledge_base) {
            console.log(
                "[Public Chat] Fetching RAG context for message:",
                message.substring(0, 50),
            );
            const context = await getRAGContext(id, message);
            if (context) {
                console.log(
                    "[Public Chat] Got RAG context, length:",
                    context.length,
                );
                ragContext = `\n\nRelevant context from knowledge base:\n${context}\n\nUse this context to inform your response when relevant.`;
            } else {
                console.log("[Public Chat] No RAG context found");
            }
        }

        // Get structured event context for Official agents (agent-specific events from shout_agent_events)
        let eventContext = "";
        if (agent.visibility === "official") {
            console.log("[Public Chat] Checking for event context...");
            const events = await getEventContext(id, message);
            if (events) {
                console.log(
                    "[Public Chat] Got event context, length:",
                    events.length,
                );
                eventContext =
                    events +
                    "\n\nPRIORITIZE the structured event data above over scraped content. Include event URLs when available!\n\n🚨 REMEMBER: When users ask to register, NEVER say you can't. ALWAYS offer to help and provide the registration link immediately!";
            }
        }

        // Events Database Access: inject global Spritz events (shout_events) when capability is enabled
        const eventsAccessEnabled = agent.events_access === true;
        if (eventsAccessEnabled && isEventQuery(message)) {
            console.log(
                "[Public Chat] Events access enabled, fetching global events...",
            );
            const globalEvents = await getGlobalEventsContext(message);
            if (globalEvents) {
                eventContext = eventContext + globalEvents;
                console.log("[Public Chat] Injected global events context");
            }
            eventContext +=
                "\n\nWhen users ask about events (e.g. 'what events are happening today'), answer from the event data above. Do NOT write code – use the listed events directly.";
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
                { role: "user", parts: [{ text: fullMessage }] },
            ],
            config: {
                systemInstruction: buildSystemInstruction(agent),
                maxOutputTokens: 2048,
                temperature: 0.7,
            },
        };

        const finalSessionId =
            sessionId ||
            `x402-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const modelName = agent.model || "gemini-2.0-flash";

        if (streamRequested === true) {
            // Stream response: yield chunks then persist and send done
            // Log user message at start so we track all AI interactions even on stream failure (shout_agent_chats = usage analytics)
            await supabase.from("shout_agent_chats").insert({
                agent_id: id,
                user_address: payerAddress,
                session_id: finalSessionId,
                role: "user",
                content: message,
                source: "public",
            });
            const encoder = new TextEncoder();
            const stream = new ReadableStream({
                async start(controller) {
                    let fullText = "";
                    const startMs = Date.now();
                    let streamInputTokens: number | null = null;
                    let streamOutputTokens: number | null = null;
                    let streamTotalTokens: number | null = null;
                    try {
                        const streamResponse =
                            await ai.models.generateContentStream(
                                generateConfig,
                            );
                        for await (const chunk of streamResponse) {
                            const text = chunk.text ?? "";
                            if (text) {
                                fullText += text;
                                controller.enqueue(
                                    encoder.encode(
                                        JSON.stringify({
                                            type: "chunk",
                                            text,
                                        }) + "\n",
                                    ),
                                );
                            }
                            // Capture usage metadata from chunk when available
                            const usage = (
                                chunk as {
                                    usageMetadata?: {
                                        promptTokenCount?: number;
                                        candidatesTokenCount?: number;
                                        totalTokenCount?: number;
                                    };
                                }
                            ).usageMetadata;
                            if (usage) {
                                streamInputTokens =
                                    usage.promptTokenCount ?? streamInputTokens;
                                streamOutputTokens =
                                    usage.candidatesTokenCount ??
                                    streamOutputTokens;
                                streamTotalTokens =
                                    usage.totalTokenCount ?? streamTotalTokens;
                            }
                        }
                        const assistantMessage =
                            fullText.trim() ||
                            "I'm sorry, I couldn't generate a response.";
                        const latencyMs = Date.now() - startMs;
                        const estimatedCost = estimateCostUsd(
                            streamInputTokens,
                            streamOutputTokens,
                        );
                        await supabase.from("shout_agent_chats").insert({
                            agent_id: id,
                            user_address: payerAddress,
                            session_id: finalSessionId,
                            role: "assistant",
                            content: assistantMessage,
                            source: "public",
                            model: modelName,
                            input_tokens: streamInputTokens,
                            output_tokens: streamOutputTokens,
                            total_tokens: streamTotalTokens,
                            latency_ms: latencyMs,
                            estimated_cost_usd: estimatedCost,
                        });
                        await supabase.rpc("increment_agent_messages", {
                            agent_id_param: id,
                        });
                        if (paymentAmountCents > 0) {
                            await supabase.rpc("increment_agent_paid_stats", {
                                agent_id_param: id,
                                amount_cents_param: paymentAmountCents,
                            });
                            await supabase
                                .from("shout_agent_x402_transactions")
                                .insert({
                                    agent_id: id,
                                    payer_address: payerAddress,
                                    amount_cents: paymentAmountCents,
                                    network: agent.x402_network || "base",
                                    transaction_hash: paymentTxHash,
                                });
                        }
                        controller.enqueue(
                            encoder.encode(
                                JSON.stringify({
                                    type: "done",
                                    sessionId: finalSessionId,
                                    message: assistantMessage,
                                }) + "\n",
                            ),
                        );
                    } catch (err) {
                        console.error("[Public Agent Chat] Stream error:", err);
                        const errMessage = sanitizeErrorMessage(err);
                        const errCode = inferErrorCode(err);
                        // Log failed interaction for usage analytics with error details
                        try {
                            await supabase.from("shout_agent_chats").insert({
                                agent_id: id,
                                user_address: payerAddress,
                                session_id: finalSessionId,
                                role: "assistant",
                                content: "[Error: Failed to generate response]",
                                source: "public",
                                model: modelName,
                                error_code: errCode,
                                error_message: errMessage,
                            });
                            await supabase.rpc("increment_agent_messages", {
                                agent_id_param: id,
                            });
                        } catch (logErr) {
                            console.error(
                                "[Public Agent Chat] Failed to log stream error:",
                                logErr,
                            );
                        }
                        controller.enqueue(
                            encoder.encode(
                                JSON.stringify({
                                    type: "error",
                                    error: "Failed to generate response",
                                }) + "\n",
                            ),
                        );
                    } finally {
                        controller.close();
                    }
                },
            });
            return new Response(stream, {
                headers: {
                    "Content-Type": "application/x-ndjson",
                    "Cache-Control": "no-store",
                },
            });
        }

        // Non-stream: generate full response then return JSON
        const startMs = Date.now();
        const result = await ai.models.generateContent(generateConfig);
        const assistantMessage =
            result.text || "I'm sorry, I couldn't generate a response.";
        const latencyMs = Date.now() - startMs;

        // Extract usage metadata
        const usage = (
            result as {
                usageMetadata?: {
                    totalTokenCount?: number;
                    promptTokenCount?: number;
                    candidatesTokenCount?: number;
                };
            }
        ).usageMetadata;
        const inputTokens = usage?.promptTokenCount ?? null;
        const outputTokens = usage?.candidatesTokenCount ?? null;
        const totalTokens = usage?.totalTokenCount ?? null;
        const estimatedCost = estimateCostUsd(inputTokens, outputTokens);

        // shout_agent_chats = single source for AI agent usage analytics
        await supabase.from("shout_agent_chats").insert([
            {
                agent_id: id,
                user_address: payerAddress,
                session_id: finalSessionId,
                role: "user",
                content: message,
                source: "public",
            },
            {
                agent_id: id,
                user_address: payerAddress,
                session_id: finalSessionId,
                role: "assistant",
                content: assistantMessage,
                source: "public",
                model: modelName,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                total_tokens: totalTokens,
                latency_ms: latencyMs,
                estimated_cost_usd: estimatedCost,
            },
        ]);

        await supabase.rpc("increment_agent_messages", { agent_id_param: id });

        if (paymentAmountCents > 0) {
            await supabase.rpc("increment_agent_paid_stats", {
                agent_id_param: id,
                amount_cents_param: paymentAmountCents,
            });

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
        return NextResponse.json(
            { error: "Failed to generate response" },
            { status: 500 },
        );
    }
}

// GET: Get agent info and pricing (no payment required)
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

    try {
        const { data: agent, error } = await supabase
            .from("shout_agents")
            .select(
                `
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
            `,
            )
            .eq("id", id)
            .in("visibility", ["public", "official"])
            .single();

        if (error || !agent) {
            return NextResponse.json(
                { error: "Agent not found or not public" },
                { status: 404 },
            );
        }

        // For official agents, check if public access is enabled (defaults to true)
        if (
            agent.visibility === "official" &&
            agent.public_access_enabled === false
        ) {
            return NextResponse.json(
                { error: "Agent not found or not public" },
                { status: 404 },
            );
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
        return NextResponse.json(
            { error: "Failed to fetch agent" },
            { status: 500 },
        );
    }
}
