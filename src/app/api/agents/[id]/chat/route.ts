import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { google } from "googleapis";
import { localTimeToUTC, getDayOfWeekInTimezone } from "@/lib/timezone";
import { toZonedTime, format } from "date-fns-tz";
import { checkRateLimit } from "@/lib/ratelimit";
import {
    getPlatformApiTools,
    getPlatformMcpServers,
} from "@/lib/agent-capabilities";
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

// Cache for MCP server tool schemas (in-memory, per instance)
const mcpToolsCache = new Map<
    string,
    { tools: MCPTool[]; fetchedAt: number }
>();
const MCP_CACHE_TTL = 1000 * 60 * 60; // 1 hour

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

interface MCPTool {
    name: string;
    description?: string;
    inputSchema?: {
        type: string;
        properties?: Record<string, { type: string; description?: string }>;
        required?: string[];
    };
}

// Discover MCP server tools by calling tools/list
async function discoverMcpTools(
    serverUrl: string,
    headers: Record<string, string>,
): Promise<MCPTool[]> {
    // Check cache first
    const cached = mcpToolsCache.get(serverUrl);
    if (cached && Date.now() - cached.fetchedAt < MCP_CACHE_TTL) {
        console.log(`[MCP] Using cached tools for ${serverUrl}`);
        return cached.tools;
    }

    try {
        console.log(`[MCP] Discovering tools from ${serverUrl}`);
        const response = await fetch(serverUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 0,
                method: "tools/list",
                params: {},
            }),
        });

        if (response.ok) {
            const data = await response.json();
            const tools: MCPTool[] = data?.result?.tools || [];
            console.log(
                `[MCP] Discovered ${tools.length} tools from ${serverUrl}`,
            );

            // Cache the results
            mcpToolsCache.set(serverUrl, { tools, fetchedAt: Date.now() });

            return tools;
        }
    } catch (error) {
        console.error(
            `[MCP] Error discovering tools from ${serverUrl}:`,
            error,
        );
    }

    return [];
}

// Use Google Search to get context about an MCP server (always enabled for MCP discovery)
async function getMcpServerContext(
    serverName: string,
    serverUrl: string,
): Promise<string | null> {
    if (!ai) return null;

    try {
        console.log(`[MCP] Searching for context about ${serverName}`);

        // Use Gemini with Google Search grounding to find info about this MCP server
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: `What is ${serverName} MCP server? How do I use its tools? What parameters do its main tools expect? Keep the response brief and technical.`,
                        },
                    ],
                },
            ],
            config: {
                tools: [{ googleSearch: {} }],
                maxOutputTokens: 1024,
            },
        });

        const context = response.text;
        if (context && context.length > 50) {
            console.log(
                `[MCP] Got context for ${serverName}: ${context.substring(0, 200)}...`,
            );
            return context;
        }
    } catch (error) {
        console.error(`[MCP] Error getting context for ${serverName}:`, error);
    }

    return null;
}

// Use AI to determine which MCP tool to call and with what parameters
async function determineToolCall(
    userMessage: string,
    tools: MCPTool[],
    serverName: string,
    previousResults?: string,
): Promise<{ toolName: string; args: Record<string, string> } | null> {
    if (!ai || tools.length === 0) return null;

    try {
        // Build a description of available tools
        const toolsDescription = tools
            .map((t) => {
                let desc = `Tool: ${t.name}`;
                if (t.description) desc += `\nDescription: ${t.description}`;
                if (t.inputSchema?.properties) {
                    const params = Object.entries(t.inputSchema.properties)
                        .map(([name, schema]) => {
                            const required = t.inputSchema?.required?.includes(
                                name,
                            )
                                ? " (required)"
                                : " (optional)";
                            const paramSchema = schema as {
                                type: string;
                                description?: string;
                            };
                            return `  - ${name}${required}: ${paramSchema.type}${paramSchema.description ? ` - ${paramSchema.description}` : ""}`;
                        })
                        .join("\n");
                    desc += `\nParameters:\n${params}`;
                }
                return desc;
            })
            .join("\n\n");

        const prompt = `You are helping determine which MCP tool to call based on a user's question.

Available tools from "${serverName}":
${toolsDescription}

User's question: "${userMessage}"

${previousResults ? `Previous tool results:\n${previousResults}\n\nBased on these results, determine if another tool should be called.` : ""}

Respond with ONLY a JSON object (no markdown, no explanation) in this exact format:
{"toolName": "tool-name-here", "args": {"param1": "value1", "param2": "value2"}}

If no tool is appropriate or needed, respond with: {"toolName": null, "args": {}}

Choose the most relevant tool and fill in appropriate parameter values based on the user's question.`;

        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { maxOutputTokens: 512 },
        });

        const responseText = response.text?.trim() || "";
        console.log(
            `[MCP] AI tool selection response: ${responseText.substring(0, 300)}`,
        );

        // Parse the JSON response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.toolName && parsed.toolName !== "null") {
                return { toolName: parsed.toolName, args: parsed.args || {} };
            }
        }
    } catch (error) {
        console.error(`[MCP] Error determining tool call:`, error);
    }

    return null;
}

// Call an MCP tool dynamically; returns result or error for tool_errors logging
async function callMcpTool(
    serverUrl: string,
    headers: Record<string, string>,
    toolName: string,
    args: Record<string, string>,
): Promise<{ ok: true; result: string } | { ok: false; error: string }> {
    try {
        console.log(`[MCP] Calling tool ${toolName} with args:`, args);

        const response = await fetch(serverUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: Date.now(),
                method: "tools/call",
                params: {
                    name: toolName,
                    arguments: args,
                },
            }),
        });

        console.log(
            `[MCP] Tool ${toolName} response status: ${response.status}`,
        );

        if (response.ok) {
            const data = await response.json();

            if (data.error) {
                const errMsg =
                    typeof data.error === "object"
                        ? (data.error.message ?? JSON.stringify(data.error))
                        : String(data.error);
                console.error(
                    `[MCP] Tool ${toolName} returned error:`,
                    data.error,
                );
                return { ok: false, error: errMsg };
            }

            const resultText =
                data?.result?.content?.[0]?.text ||
                JSON.stringify(data.result || data);
            console.log(
                `[MCP] Tool ${toolName} returned ${resultText.length} chars`,
            );
            return { ok: true, result: resultText };
        }

        const errorText = await response.text();
        const errMsg = `${response.status}: ${errorText.substring(0, 200)}`;
        console.error(
            `[MCP] Tool ${toolName} HTTP error: ${response.status} - ${errorText.substring(0, 300)}`,
        );
        return { ok: false, error: errMsg };
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[MCP] Error calling tool ${toolName}:`, error);
        return { ok: false, error: errMsg };
    }
}

// Generate embedding for a query using Gemini
async function generateQueryEmbedding(query: string): Promise<number[] | null> {
    if (!ai) return null;

    try {
        const result = await ai.models.embedContent({
            model: "gemini-embedding-001",
            contents: query,
            config: { outputDimensionality: 768 },
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
    maxChunks: number = 5,
): Promise<string[]> {
    if (!supabase) return [];

    try {
        // Generate embedding for the query
        const queryEmbedding = await generateQueryEmbedding(query);
        if (!queryEmbedding) {
            console.log(
                "[Chat] Failed to generate query embedding, falling back to no RAG",
            );
            return [];
        }

        // Search for similar chunks - lower threshold for broader coverage
        const { data: chunks, error } = await supabase.rpc(
            "match_knowledge_chunks",
            {
                p_agent_id: agentId,
                p_query_embedding: `[${queryEmbedding.join(",")}]`,
                p_match_count: Math.max(maxChunks, 8), // At least 8 chunks for comprehensive context
                p_match_threshold: 0.25, // Lower threshold to catch more relevant results
            },
        );

        if (error) {
            console.error("[Chat] Error retrieving chunks:", error);
            return [];
        }

        if (!chunks || chunks.length === 0) {
            console.log("[Chat] No relevant chunks found");
            return [];
        }

        console.log(`[Chat] Found ${chunks.length} relevant chunks`);
        // Include source title for disambiguation between different knowledge sources
        // Clean base64 data to prevent polluting AI responses
        return chunks.map(
            (c: {
                content: string;
                similarity: number;
                source_title?: string;
            }) =>
                `[Source: ${c.source_title || "Unknown"} | Relevance: ${(c.similarity * 100).toFixed(0)}%]\n${cleanBase64FromContent(c.content)}`,
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
        if (
            !contentType.includes("text/html") &&
            !contentType.includes("text/plain")
        ) {
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
    { params }: { params: Promise<{ id: string }> },
) {
    // Rate limit: 30 requests per minute for AI chat
    const rateLimitResponse = await checkRateLimit(request, "ai");
    if (rateLimitResponse) return rateLimitResponse;

    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    if (!ai) {
        console.error(
            "[Agent Chat] Gemini API key not configured. Set GOOGLE_GEMINI_API_KEY in .env",
        );
        return NextResponse.json(
            {
                error: "Gemini API not configured. Please add GOOGLE_GEMINI_API_KEY to your environment.",
            },
            { status: 500 },
        );
    }

    try {
        const { id } = await params;
        const body = await request.json();
        const { userAddress, message, stream: streamRequested } = body;

        if (!userAddress || !message) {
            return NextResponse.json(
                { error: "User address and message are required" },
                { status: 400 },
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
            return NextResponse.json(
                { error: "Agent not found" },
                { status: 404 },
            );
        }

        // Check access
        if (agent.owner_address !== normalizedAddress) {
            if (agent.visibility === "private") {
                return NextResponse.json(
                    { error: "Access denied" },
                    { status: 403 },
                );
            }
            if (agent.visibility === "friends") {
                const { data: friendship } = await supabase
                    .from("shout_friends")
                    .select("id")
                    .or(
                        `and(user_address.eq.${agent.owner_address},friend_address.eq.${normalizedAddress}),and(user_address.eq.${normalizedAddress},friend_address.eq.${agent.owner_address})`,
                    )
                    .limit(1)
                    .maybeSingle();
                if (!friendship) {
                    return NextResponse.json(
                        { error: "Access denied" },
                        { status: 403 },
                    );
                }
            }
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
                console.log(
                    "[Chat] Using RAG with",
                    relevantChunks.length,
                    "chunks",
                );
                knowledgeContext =
                    "\n\n## Relevant Knowledge (from indexed sources):\n" +
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
                    console.log(
                        "[Chat] Falling back to URL fetching for",
                        knowledgeItems.length,
                        "items",
                    );
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
                        knowledgeContext =
                            "\n\n## Knowledge Base Context:\n" +
                            validContents.join("\n");
                    }
                }
            }
        }

        // Build enhanced system instructions with knowledge context
        // We build MCP results FIRST, then add them at the top of the system prompt

        // Track MCP results to add BEFORE personality
        let mcpResultsSection = "";
        // Collect MCP tool invocations and failures for admin/debug
        const mcpToolCalls: {
            server: string;
            toolName: string;
            args?: Record<string, unknown>;
        }[] = [];
        const mcpToolErrors: {
            server: string;
            toolName: string;
            error?: string;
        }[] = [];

        // MCP: platform-wide tools (e.g. The Grid) + per-agent servers when MCP is enabled
        const mcpEnabled = agent.mcp_enabled !== false; // Default true
        const platformServers = getPlatformMcpServers();
        const agentServers =
            mcpEnabled && agent.mcp_servers?.length ? agent.mcp_servers : [];
        const effectiveMcpServers = [...platformServers, ...agentServers];

        if (effectiveMcpServers.length > 0) {
            // Try to call MCP servers dynamically using AI-driven tool selection
            const mcpResults: string[] = [];
            for (const server of effectiveMcpServers) {
                // Check if this MCP server should be called based on the message
                const serverText = [
                    server.name,
                    server.description,
                    server.instructions,
                ]
                    .join(" ")
                    .toLowerCase();
                const messageWords = message.toLowerCase();

                // Check relevance - be more permissive to let AI decide
                const alwaysCall =
                    server.instructions?.toLowerCase().includes("always") ||
                    server.instructions
                        ?.toLowerCase()
                        .includes("every question");
                const nameMentioned =
                    server.name &&
                    messageWords.includes(server.name.toLowerCase());
                const queryPatterns = [
                    "docs",
                    "documentation",
                    "how to",
                    "what is",
                    "tell me",
                    "search",
                    "find",
                    "help",
                    "show",
                    "get",
                    "explain",
                ];
                const hasQueryPattern = queryPatterns.some((p) =>
                    messageWords.includes(p),
                );

                const isRelevant =
                    alwaysCall || nameMentioned || hasQueryPattern;

                console.log(
                    `[MCP] Server ${server.name} relevance check: alwaysCall=${alwaysCall}, nameMentioned=${nameMentioned}, hasQueryPattern=${hasQueryPattern}, result=${isRelevant}`,
                );

                if (isRelevant) {
                    try {
                        console.log(
                            `[MCP] Processing server: ${server.name} - ${server.url}`,
                        );

                        // Build headers
                        const headers: Record<string, string> = {
                            "Content-Type": "application/json",
                            Accept: "application/json, text/event-stream",
                        };

                        // Add server-configured headers
                        if (server.headers) {
                            for (const [key, value] of Object.entries(
                                server.headers,
                            )) {
                                headers[key] = String(value);
                            }
                        }

                        // Add API key as Bearer token if not already configured
                        if (server.apiKey) {
                            const hasAuthHeader = Object.keys(headers).some(
                                (k) => k.toLowerCase() === "authorization",
                            );
                            if (!hasAuthHeader) {
                                headers["Authorization"] =
                                    `Bearer ${server.apiKey}`;
                            }
                        }

                        console.log(
                            `[MCP] Headers for ${server.name}:`,
                            Object.keys(headers),
                        );

                        // Step 1: Discover available tools from this MCP server
                        const availableTools = await discoverMcpTools(
                            server.url,
                            headers,
                        );

                        if (availableTools.length === 0) {
                            // If we couldn't discover tools, try to get context via Google Search
                            console.log(
                                `[MCP] No tools discovered, trying Google Search for context`,
                            );
                            const searchContext = await getMcpServerContext(
                                server.name,
                                server.url,
                            );
                            if (searchContext) {
                                mcpResults.push(
                                    `\n\nContext about ${server.name}:\n${searchContext}`,
                                );
                            }
                            continue;
                        }

                        // Log discovered tools (we'll rely on the results, not tool listing)
                        console.log(
                            `[MCP] Discovered ${availableTools.length} tools from ${server.name}`,
                        );

                        // Step 2: Use AI to determine which tool to call (up to 3 iterations)
                        let previousResults = "";
                        const maxIterations = 3;

                        for (let i = 0; i < maxIterations; i++) {
                            const toolCall = await determineToolCall(
                                message,
                                availableTools,
                                server.name,
                                previousResults,
                            );

                            if (!toolCall) {
                                console.log(
                                    `[MCP] AI decided no more tools needed after ${i} iterations`,
                                );
                                break;
                            }

                            console.log(
                                `[MCP] Iteration ${i + 1}: AI selected tool "${toolCall.toolName}"`,
                            );

                            mcpToolCalls.push({
                                server: server.name,
                                toolName: toolCall.toolName,
                                args: toolCall.args,
                            });

                            const toolResult = await callMcpTool(
                                server.url,
                                headers,
                                toolCall.toolName,
                                toolCall.args,
                            );

                            if (!toolResult.ok) {
                                mcpToolErrors.push({
                                    server: server.name,
                                    toolName: toolCall.toolName,
                                    error: toolResult.error.substring(0, 500),
                                });
                                console.log(
                                    `[MCP] Tool ${toolCall.toolName} failed: ${toolResult.error.substring(0, 100)}`,
                                );
                                break;
                            }

                            const result = toolResult.result;
                            if (result) {
                                previousResults += `\n\nResult from ${toolCall.toolName}:\n${result.substring(0, 5000)}`;

                                // Check if this is an intermediate result that needs another tool call
                                // resolve-library-id results are ALWAYS intermediate (they return library IDs to use with query-docs)
                                const isIntermediateResult =
                                    toolCall.toolName ===
                                        "resolve-library-id" ||
                                    toolCall.toolName.includes("resolve") ||
                                    toolCall.toolName.includes("search") ||
                                    toolCall.toolName.includes("list") ||
                                    result.includes("library ID") ||
                                    result.includes("libraryId") ||
                                    result.includes("Context7-compatible");

                                console.log(
                                    `[MCP] Tool ${toolCall.toolName} result is ${isIntermediateResult ? "intermediate" : "final"}`,
                                );

                                if (
                                    isIntermediateResult &&
                                    i < maxIterations - 1
                                ) {
                                    // This is an intermediate result, continue to next iteration
                                    console.log(
                                        `[MCP] Intermediate result, will determine next tool...`,
                                    );
                                } else {
                                    // This is a final result, add it
                                    const truncatedResult =
                                        result.length > 10000
                                            ? result.substring(0, 10000) + "..."
                                            : result;
                                    mcpResults.push(
                                        `\n--- Results from ${server.name} (${toolCall.toolName}) ---\n${truncatedResult}`,
                                    );
                                    console.log(
                                        `[MCP] Got final result, stopping iterations`,
                                    );
                                    break;
                                }
                            } else {
                                console.log(
                                    `[MCP] Tool ${toolCall.toolName} returned no result`,
                                );
                                break;
                            }
                        }
                    } catch (error) {
                        console.error(
                            `[MCP] Error processing server ${server.name}:`,
                            error,
                        );
                    }
                }
            }

            if (mcpResults.length > 0) {
                mcpResultsSection = `
## RETRIEVED INFORMATION (USE THIS DATA - DO NOT OUTPUT CODE)

The following information was ALREADY retrieved from MCP servers on behalf of the user.
Your job is to PRESENT this information in a helpful, formatted way.

ABSOLUTE RULES:
1. DO NOT write Python, JavaScript, or ANY code showing how to call these tools
2. DO NOT explain how to use the MCP API
3. DO NOT show import statements or function calls
4. JUST use the retrieved data to answer the user's question directly
5. Format the information nicely with markdown

${mcpResults.join("\n")}

---END OF RETRIEVED DATA---

Remember: The user asked a question and the answer is in the data above. Just present it nicely.
`;
            }
        }

        // Now build the final system instructions with MCP results FIRST
        let systemInstructions = "";

        // Add current date context
        const now = new Date();
        const currentDate = now.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
        });
        systemInstructions += `CURRENT DATE: Today is ${currentDate}. When users ask about "today", "tomorrow", "this week", etc., use this date as reference.\n\n`;

        // Add MCP results at the VERY TOP if we have them
        if (mcpResultsSection) {
            systemInstructions += mcpResultsSection;
        }

        // Then add the agent's personality
        systemInstructions +=
            agent.system_instructions ||
            `You are a helpful AI assistant named ${agent.name}.`;

        // Formatting guideline for all agents (better chat output)
        systemInstructions += `

## Response formatting
Use markdown so replies are easy to read:
- **Bold** for emphasis and *italic* when needed
- Bullet or numbered lists for options, steps, or multiple items
- Tables (| col1 | col2 |) for comparisons or structured data
- \`inline code\` for technical terms, and code blocks for longer snippets
- Short paragraphs; add blank lines between sections`;

        // Add knowledge context
        if (knowledgeContext) {
            systemInstructions += `\n\nYou have access to the following knowledge sources. Use this information to help answer questions when relevant:${knowledgeContext}`;
        }

        // Add markdown/image guidance for official agents with knowledge base
        if (agent.visibility === "official" && agent.use_knowledge_base) {
            systemInstructions += `\n\nYou can use markdown formatting:
- Use **bold** and *italic* for emphasis
- Use bullet points and numbered lists
- When referencing images or logos from your knowledge, use markdown: ![Description](URL)
- If you have image URLs in your context, display them!`;
        }

        // Add a final reminder if we had MCP results
        if (mcpResultsSection) {
            systemInstructions += `\n\n[REMINDER: Answer using the RETRIEVED INFORMATION at the top. DO NOT output code.]`;
        }

        // Handle scheduling capability (if enabled)
        const schedulingEnabled = agent.scheduling_enabled === true;
        let schedulingContext = "";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let schedulingResponseData: any = null;

        if (schedulingEnabled) {
            const messageLower = message.toLowerCase();

            // Check current message for scheduling keywords
            const schedulingKeywords = [
                "schedule", "book a", "book time", "booking",
                "meeting", "appointment", "availability", "available",
                "time slot", "when can", "set up a", "calendar",
                "free time", "slot", "set up time", "find time",
            ];
            const currentMsgIsScheduling = schedulingKeywords.some((kw) =>
                messageLower.includes(kw),
            );

            // Also check if the recent conversation is already about scheduling
            // (so follow-up messages like "30 mins", "tomorrow", "yes" stay in scheduling mode)
            const recentChatTexts = (recentChats || []).map((c) =>
                c.content?.toLowerCase() || "",
            );
            const recentConversationIsScheduling = recentChatTexts.some(
                (text) =>
                    schedulingKeywords.some((kw) => text.includes(kw)) ||
                    text.includes("booking card") ||
                    text.includes("available times") ||
                    text.includes("scheduling information"),
            );

            // Common follow-up patterns in scheduling conversations
            const isSchedulingFollowUp =
                recentConversationIsScheduling &&
                (messageLower.includes("min") ||
                    messageLower.includes("hour") ||
                    messageLower.includes("today") ||
                    messageLower.includes("tomorrow") ||
                    messageLower.includes("morning") ||
                    messageLower.includes("afternoon") ||
                    messageLower.includes("evening") ||
                    messageLower.includes("yes") ||
                    messageLower.includes("sure") ||
                    messageLower.includes("sounds good") ||
                    messageLower.includes("that works") ||
                    messageLower.includes("perfect") ||
                    messageLower.includes("ok") ||
                    messageLower.includes("project") ||
                    messageLower.includes("working together") ||
                    /^\d+$/.test(messageLower.trim())); // Just a number like "30"

            const isSchedulingQuery =
                currentMsgIsScheduling || isSchedulingFollowUp;

            if (isSchedulingQuery) {
                console.log(
                    `[Chat] Scheduling query detected (direct=${currentMsgIsScheduling}, followUp=${isSchedulingFollowUp}), fetching availability`,
                );

                try {
                    // Get the agent owner's scheduling settings
                    const { data: ownerSettings } = await supabase
                        .from("shout_user_settings")
                        .select(
                            "scheduling_enabled, scheduling_slug, scheduling_free_enabled, scheduling_paid_enabled, scheduling_free_duration_minutes, scheduling_paid_duration_minutes, scheduling_price_cents",
                        )
                        .eq("wallet_address", agent.owner_address)
                        .single();

                    if (ownerSettings?.scheduling_enabled) {
                        // Get availability windows directly from database
                        const { data: windows } = await supabase
                            .from("shout_availability_windows")
                            .select(
                                "day_of_week, start_time, end_time, timezone",
                            )
                            .eq("wallet_address", agent.owner_address)
                            .eq("is_active", true);

                        // Get Google Calendar connection for busy time filtering
                        const {
                            data: calendarConnection,
                            error: calendarError,
                        } = await supabase
                            .from("shout_calendar_connections")
                            .select("*")
                            .eq("wallet_address", agent.owner_address)
                            .eq("provider", "google")
                            .eq("is_active", true)
                            .maybeSingle(); // Use maybeSingle() to avoid error when no connection exists

                        if (calendarError) {
                            console.error(
                                "[Chat] Error fetching calendar connection:",
                                calendarError,
                            );
                        }

                        const userTimezone = windows?.[0]?.timezone || "UTC";

                        // Generate potential slots for the next 7 days
                        const potentialSlots: { start: Date; end: Date }[] = [];
                        const now = new Date();
                        const duration =
                            ownerSettings.scheduling_free_duration_minutes ||
                            30;
                        const advanceNoticeHours = 24;
                        const bufferMinutes = 15;
                        const minStartTime = new Date(
                            now.getTime() + advanceNoticeHours * 60 * 60 * 1000,
                        );
                        const endDate = new Date(
                            now.getTime() + 7 * 24 * 60 * 60 * 1000,
                        );

                        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
                            const checkDate = new Date(now);
                            checkDate.setDate(checkDate.getDate() + dayOffset);
                            checkDate.setUTCHours(12, 0, 0, 0); // Noon UTC to avoid date boundary issues

                            for (const window of windows || []) {
                                // Use this window's timezone for day-of-week so "Monday" is correct per window
                                const windowTimezone =
                                    window.timezone || userTimezone;
                                const dayOfWeek = getDayOfWeekInTimezone(
                                    checkDate,
                                    windowTimezone,
                                );
                                if (window.day_of_week !== dayOfWeek) continue;

                                // Convert local time in the window's timezone to UTC
                                const slotStartUTC = localTimeToUTC(
                                    checkDate,
                                    window.start_time,
                                    windowTimezone,
                                );
                                const slotEndUTC = localTimeToUTC(
                                    checkDate,
                                    window.end_time,
                                    windowTimezone,
                                );

                                let currentSlot = new Date(slotStartUTC);
                                while (
                                    currentSlot.getTime() +
                                        duration * 60 * 1000 <=
                                    slotEndUTC.getTime()
                                ) {
                                    if (currentSlot >= minStartTime) {
                                        potentialSlots.push({
                                            start: new Date(currentSlot),
                                            end: new Date(
                                                currentSlot.getTime() +
                                                    duration * 60 * 1000,
                                            ),
                                        });
                                    }
                                    currentSlot = new Date(
                                        currentSlot.getTime() +
                                            (duration + bufferMinutes) *
                                                60 *
                                                1000,
                                    );
                                }
                            }
                        }

                        // IMPORTANT: Data Segregation for Google API Compliance
                        // - slotsForAI: Only from database (user's configured availability) - sent to AI
                        // - slotsForBookingCard: Filtered by Google Calendar - sent to frontend only, NOT to AI
                        // This ensures Google Calendar data is NEVER sent to the LLM

                        // For AI context: Use only database-configured slots (NO Google Calendar data)
                        const slotsForAI = potentialSlots;

                        // For booking card: Filter by Google Calendar if connected
                        let slotsForBookingCard = potentialSlots;
                        console.log(
                            "[Chat] Calendar connection check for",
                            agent.owner_address,
                            ":",
                            {
                                hasConnection: !!calendarConnection,
                                hasAccessToken:
                                    !!calendarConnection?.access_token,
                                calendarId: calendarConnection?.calendar_id,
                                isActive: calendarConnection?.is_active,
                            },
                        );

                        if (
                            calendarConnection &&
                            calendarConnection.access_token
                        ) {
                            try {
                                const oauth2Client = new google.auth.OAuth2(
                                    process.env.GOOGLE_CLIENT_ID,
                                    process.env.GOOGLE_CLIENT_SECRET,
                                );
                                oauth2Client.setCredentials({
                                    access_token:
                                        calendarConnection.access_token,
                                    refresh_token:
                                        calendarConnection.refresh_token,
                                });

                                // Check if token needs refresh
                                const tokenExpiry =
                                    calendarConnection.token_expires_at
                                        ? new Date(
                                              calendarConnection.token_expires_at,
                                          )
                                        : null;
                                const isExpired =
                                    tokenExpiry &&
                                    tokenExpiry.getTime() < Date.now();
                                console.log("[Chat] Token status:", {
                                    tokenExpiry,
                                    isExpired,
                                    hasRefreshToken:
                                        !!calendarConnection.refresh_token,
                                });

                                if (
                                    isExpired &&
                                    calendarConnection.refresh_token
                                ) {
                                    console.log(
                                        "[Chat] Refreshing expired Google token for",
                                        agent.owner_address,
                                    );
                                    try {
                                        const { credentials } =
                                            await oauth2Client.refreshAccessToken();
                                        await supabase
                                            .from("shout_calendar_connections")
                                            .update({
                                                access_token:
                                                    credentials.access_token,
                                                token_expires_at:
                                                    credentials.expiry_date
                                                        ? new Date(
                                                              credentials.expiry_date,
                                                          ).toISOString()
                                                        : new Date(
                                                              Date.now() +
                                                                  3600 * 1000,
                                                          ).toISOString(),
                                            })
                                            .eq(
                                                "wallet_address",
                                                agent.owner_address,
                                            )
                                            .eq("provider", "google");
                                        oauth2Client.setCredentials(
                                            credentials,
                                        );
                                        console.log(
                                            "[Chat] Token refreshed successfully",
                                        );
                                    } catch (refreshError) {
                                        console.error(
                                            "[Chat] Token refresh failed:",
                                            refreshError,
                                        );
                                    }
                                }

                                const calendar = google.calendar({
                                    version: "v3",
                                    auth: oauth2Client,
                                });

                                // Get busy times from Google Calendar (for booking card only, not AI)
                                const calendarIdToQuery =
                                    calendarConnection.calendar_id || "primary";
                                console.log(
                                    "[Chat] Querying freebusy for calendar:",
                                    calendarIdToQuery,
                                    "from",
                                    now.toISOString(),
                                    "to",
                                    endDate.toISOString(),
                                );

                                const busyResponse =
                                    await calendar.freebusy.query({
                                        requestBody: {
                                            timeMin: now.toISOString(),
                                            timeMax: endDate.toISOString(),
                                            items: [{ id: calendarIdToQuery }],
                                        },
                                    });

                                // Log the full response structure for debugging
                                console.log(
                                    "[Chat] Freebusy response calendars:",
                                    JSON.stringify(
                                        busyResponse.data.calendars,
                                        null,
                                        2,
                                    ),
                                );

                                const busyPeriods =
                                    busyResponse.data.calendars?.[
                                        calendarIdToQuery
                                    ]?.busy || [];
                                console.log(
                                    "[Chat] Found",
                                    busyPeriods.length,
                                    "busy periods from Google Calendar",
                                );

                                if (busyPeriods.length > 0) {
                                    console.log(
                                        "[Chat] Busy periods:",
                                        busyPeriods.map((b) => ({
                                            start: b.start,
                                            end: b.end,
                                        })),
                                    );
                                }

                                // Filter out slots that conflict with busy periods (for booking card only)
                                slotsForBookingCard = potentialSlots.filter(
                                    (slot) => {
                                        const slotStart = slot.start.getTime();
                                        const slotEnd = slot.end.getTime();

                                        const isConflict = busyPeriods.some(
                                            (busy) => {
                                                const busyStart = new Date(
                                                    busy.start!,
                                                ).getTime();
                                                const busyEnd = new Date(
                                                    busy.end!,
                                                ).getTime();

                                                return (
                                                    (slotStart >= busyStart &&
                                                        slotStart < busyEnd) ||
                                                    (slotEnd > busyStart &&
                                                        slotEnd <= busyEnd) ||
                                                    (slotStart <= busyStart &&
                                                        slotEnd >= busyEnd)
                                                );
                                            },
                                        );

                                        return !isConflict;
                                    },
                                );

                                console.log(
                                    "[Chat] Booking card slots filtered from",
                                    potentialSlots.length,
                                    "to",
                                    slotsForBookingCard.length,
                                );
                            } catch (calendarError) {
                                console.error(
                                    "[Chat] Google Calendar error:",
                                    calendarError,
                                );
                                // Continue with all potential slots if calendar check fails
                            }
                        } else {
                            console.log(
                                "[Chat] No active Google Calendar connection for",
                                agent.owner_address,
                            );
                        }

                        // Group slots for AI context (database slots only - NO Google Calendar data)
                        const slotsByDateForAI: Record<string, string[]> = {};
                        for (const slot of slotsForAI.slice(0, 30)) {
                            const zonedDate = toZonedTime(
                                slot.start,
                                userTimezone,
                            );
                            const dateKey = format(zonedDate, "EEEE, MMMM d", {
                                timeZone: userTimezone,
                            });
                            const timeStr = format(zonedDate, "h:mm a", {
                                timeZone: userTimezone,
                            });

                            if (!slotsByDateForAI[dateKey]) {
                                slotsByDateForAI[dateKey] = [];
                            }
                            slotsByDateForAI[dateKey].push(timeStr);
                        }

                        // Group slots for booking card (may include Google Calendar filtering)
                        const slotsByDateForCard: Record<string, string[]> = {};
                        for (const slot of slotsForBookingCard.slice(0, 30)) {
                            const zonedDate = toZonedTime(
                                slot.start,
                                userTimezone,
                            );
                            const dateKey = format(zonedDate, "EEEE, MMMM d", {
                                timeZone: userTimezone,
                            });
                            const timeStr = format(zonedDate, "h:mm a", {
                                timeZone: userTimezone,
                            });

                            if (!slotsByDateForCard[dateKey]) {
                                slotsByDateForCard[dateKey] = [];
                            }
                            slotsByDateForCard[dateKey].push(timeStr);
                        }

                        const hasSlots =
                            Object.keys(slotsByDateForAI).length > 0;

                        // Store scheduling data for booking card UI (uses Google Calendar filtered slots)
                        schedulingResponseData = {
                            ownerAddress: agent.owner_address,
                            slots: slotsForBookingCard
                                .slice(0, 50)
                                .map((s) => ({
                                    start: s.start.toISOString(),
                                    end: s.end.toISOString(),
                                })),
                            slotsByDate: slotsByDateForCard,
                            freeEnabled:
                                ownerSettings.scheduling_free_enabled ?? true,
                            paidEnabled:
                                ownerSettings.scheduling_paid_enabled ?? false,
                            freeDuration:
                                ownerSettings.scheduling_free_duration_minutes ||
                                15,
                            paidDuration:
                                ownerSettings.scheduling_paid_duration_minutes ||
                                30,
                            priceCents:
                                ownerSettings.scheduling_price_cents || 0,
                            timezone: userTimezone,
                        };

                        // AI context uses ONLY database-configured availability (NO Google Calendar data)
                        schedulingContext = `
## SCHEDULING INFORMATION

You can help users schedule meetings with your creator.${
                            hasSlots
                                ? ` Here are the general availability windows (times in ${userTimezone}):

${Object.entries(slotsByDateForAI)
    .map(([date, times]) => `**${date}:** ${times.join(", ")}`)
    .join("\n")}

Note: The interactive booking card below will show the most accurate real-time availability.`
                                : `

(No availability windows configured for the next 7 days)`
                        }

${ownerSettings.scheduling_free_enabled ? `- **Free calls** available (${ownerSettings.scheduling_free_duration_minutes || 15} minutes)` : ""}
${ownerSettings.scheduling_paid_enabled ? `- **Paid sessions** available (${ownerSettings.scheduling_paid_duration_minutes || 30} minutes) - $${((ownerSettings.scheduling_price_cents || 0) / 100).toFixed(2)} USD` : ""}

IMPORTANT: The user can book DIRECTLY in this chat. A booking card will appear below your message with the accurate available times.
When helping users schedule:
1. Present the general availability times above
2. Ask what type of meeting they'd like (free or paid, if both available)
3. Tell them to select a time from the interactive booking card that will appear
4. The booking card handles collecting their email and completing the reservation

DO NOT direct users to an external URL - everything is handled in this chat interface.
`;
                        console.log(
                            "[Chat] Added scheduling context with",
                            Object.keys(slotsByDateForAI).length,
                            "days (database only, no Google Calendar data sent to AI)",
                        );
                    } else {
                        schedulingContext = `
## SCHEDULING NOTE

My creator hasn't enabled their public scheduling page yet. Please ask them directly about their availability or suggest they enable the scheduling feature in their Spritz settings.
`;
                    }
                } catch (err) {
                    console.error(
                        "[Chat] Error fetching scheduling info:",
                        err,
                    );
                }
            }

            // Always add scheduling capability info to system instructions
            systemInstructions += `\n\n## Scheduling Capability
You can help users schedule meetings with your creator. When users ask about scheduling, meeting times, or availability:
- Be helpful and proactive
- Present the available times clearly when you have them
- Tell users they can select a time from the interactive booking card that appears below your message
- Ask clarifying questions if needed (preferred time of day, meeting type, etc.)
- DO NOT direct users to external URLs - booking happens in this chat
`;

            if (schedulingContext) {
                systemInstructions += schedulingContext;
            }
        }

        // Handle events database access (if enabled)
        const eventsAccessEnabled = agent.events_access === true;
        if (eventsAccessEnabled) {
            const messageLower = message.toLowerCase();
            const isEventsQuery =
                messageLower.includes("event") ||
                messageLower.includes("conference") ||
                messageLower.includes("hackathon") ||
                messageLower.includes("meetup") ||
                messageLower.includes("summit") ||
                messageLower.includes("workshop") ||
                messageLower.includes("happening") ||
                messageLower.includes("schedule") ||
                messageLower.includes("register") ||
                messageLower.includes("rsvp");

            if (isEventsQuery) {
                console.log(
                    "[Chat] Events query detected, fetching from global events database",
                );

                try {
                    // Get upcoming events from global database
                    const today = new Date().toISOString().split("T")[0];
                    const { data: rawEvents, error: eventsError } =
                        await supabase
                            .from("shout_events")
                            .select(
                                "id, name, description, event_type, event_date, start_time, end_time, venue, city, country, is_virtual, organizer, event_url, rsvp_url, registration_enabled, is_featured",
                            )
                            .eq("status", "published")
                            .gte("event_date", today)
                            .order("is_featured", { ascending: false })
                            .order("event_date", { ascending: true })
                            .limit(40);

                    if (eventsError) {
                        console.error(
                            "[Chat] Error fetching events:",
                            eventsError,
                        );
                    } else if (rawEvents && rawEvents.length > 0) {
                        // Deduplicate: same event often appears with slight name/location variants
                        const seen = new Set<string>();
                        const events = rawEvents.filter((e) => {
                            const nameNorm = (e.name || "")
                                .toLowerCase()
                                .replace(/^\s*the\s+/i, "")
                                .replace(/\s+/g, " ")
                                .replace(/\s*\d{4}\s*$/, "")
                                .trim();
                            const loc =
                                [e.city, e.country]
                                    .filter(Boolean)
                                    .join(", ")
                                    .toLowerCase() || "tba";
                            const key = `${nameNorm}|${e.event_date}|${loc}`;
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                        });

                        systemInstructions += `\n\n## Global Events Database (${events.length} upcoming events):
                        
You have access to a curated events database. Here are upcoming events.
List each event only once. When the same event appears in different forms (e.g. different language for location), present it once with the clearest name and location.

${events
    .map(
        (e) => `- **${e.name}** (${e.event_type})
  📅 ${e.event_date}${e.start_time ? ` @ ${e.start_time}` : ""}
  📍 ${e.is_virtual ? "Virtual" : `${e.venue || ""} ${e.city || ""} ${e.country || ""}`.trim()}
  ${e.organizer ? `🏢 ${e.organizer}` : ""}
  ${e.event_url ? `🔗 Event: ${e.event_url}` : ""}
  ${e.rsvp_url ? `🎫 Register: ${e.rsvp_url}` : ""}
  ${e.registration_enabled ? "✅ Spritz Registration Available" : ""}
  ${e.is_featured ? "⭐ Featured Event" : ""}`,
    )
    .join("\n\n")}

When users ask to register for an event:
1. If the event has "Spritz Registration Available", tell them you can register them directly
2. If there's an RSVP URL, provide the link and offer to help
3. If they want to register via Spritz, collect their email and confirm the registration

Full events directory: https://app.spritz.chat/events
`;
                        console.log(
                            "[Chat] Added events context with",
                            events.length,
                            "events",
                        );
                    } else {
                        systemInstructions += `\n\n## Events Database
                        
You have access to a global events database, but there are currently no upcoming events listed.
Users can browse events at: https://app.spritz.chat/events
`;
                    }
                } catch (err) {
                    console.error("[Chat] Error fetching events:", err);
                }
            }

            // Always add events capability info
            systemInstructions += `\n\n## Events Capability
You can help users discover and register for events (conferences, hackathons, meetups, etc.).
When users ask about events, query the database and present relevant options.
Full events directory: https://app.spritz.chat/events
`;
        }

        // Add API tool information and potentially call them (if API is enabled)
        const apiEnabled = agent.api_enabled !== false; // Default true
        if (apiEnabled && agent.api_tools && agent.api_tools.length > 0) {
            systemInstructions += "\n\n## Available API Tools:\n";
            for (const tool of agent.api_tools) {
                systemInstructions += `- **${tool.name}** [${tool.method}] ${tool.url}`;
                if (tool.description) {
                    systemInstructions += `: ${tool.description}`;
                }
                if (tool.instructions) {
                    systemInstructions += `\n  Instructions: ${tool.instructions}`;
                }
                // Include schema information for GraphQL APIs so the agent knows what queries are available
                if (tool.apiType === "graphql" && tool.schema) {
                    systemInstructions += `\n  GraphQL Schema:\n${tool.schema}`;
                    systemInstructions += `\n  IMPORTANT: You can use this GraphQL API to query for lists of items. Look for plural query names (e.g., graphNetworks, dataServices, subgraphs) in the schema to list collections. Use these queries when users ask "what are available", "list all", "show me", etc.`;
                } else if (tool.schema) {
                    // For other API types, include schema as context
                    systemInstructions += `\n  API Schema:\n${tool.schema}`;
                }
                systemInstructions += "\n";
            }

            // Try to call relevant APIs based on the message
            const apiResults: string[] = [];
            for (const tool of agent.api_tools) {
                // Build a comprehensive set of keywords from name, description, and instructions
                const toolText = [
                    tool.name || "",
                    tool.description || "",
                    tool.instructions || "",
                ]
                    .join(" ")
                    .toLowerCase();
                const messageWords = message.toLowerCase();

                // Check if this is a GraphQL/subgraph API
                const isGraphQLTool =
                    tool.url.toLowerCase().includes("graph") ||
                    toolText.includes("graphql") ||
                    toolText.includes("subgraph");

                // Check relevance with multiple methods:
                // 1. If instructions contain "always" or "every", always call it
                const alwaysCall =
                    tool.instructions?.toLowerCase().includes("always") ||
                    tool.instructions
                        ?.toLowerCase()
                        .includes("every question") ||
                    tool.instructions?.toLowerCase().includes("all questions");

                // 2. Check if the tool name is mentioned
                const nameMentioned =
                    tool.name && messageWords.includes(tool.name.toLowerCase());

                // 3. Check for keyword overlap (words > 3 chars)
                const keywords = toolText
                    .split(/\s+/)
                    .filter((w: string) => w.length > 3);
                const keywordMatch = keywords.some((word: string) =>
                    messageWords.includes(word),
                );

                // 4. Check for common documentation/API query patterns
                const docPatterns = [
                    "docs",
                    "documentation",
                    "how to",
                    "what is",
                    "tell me about",
                    "looking at",
                    "using",
                ];
                const isDocQuery = docPatterns.some((p) =>
                    messageWords.includes(p),
                );
                const toolIsDocRelated =
                    toolText.includes("doc") ||
                    toolText.includes("search") ||
                    toolText.includes("library");

                // 5. Check for data query patterns (common for GraphQL/subgraph queries)
                const dataQueryPatterns = [
                    "get",
                    "fetch",
                    "show",
                    "list",
                    "find",
                    "last",
                    "recent",
                    "latest",
                    "first",
                    "top",
                    "all",
                ];
                const isDataQuery = dataQueryPatterns.some((p) =>
                    messageWords.includes(p),
                );

                // 6. Check if user explicitly asks to use API/tool
                const explicitApiRequest =
                    messageWords.includes("api") ||
                    messageWords.includes("tool") ||
                    messageWords.includes("use your");

                // GraphQL APIs are more likely to be relevant for data queries
                const graphQLDataQuery = isGraphQLTool && isDataQuery;

                const isRelevant =
                    alwaysCall ||
                    nameMentioned ||
                    keywordMatch ||
                    (isDocQuery && toolIsDocRelated) ||
                    graphQLDataQuery ||
                    explicitApiRequest;

                console.log(
                    `[Chat] API tool ${tool.name} relevance check: alwaysCall=${alwaysCall}, nameMentioned=${nameMentioned}, keywordMatch=${keywordMatch}, graphQLDataQuery=${graphQLDataQuery}, explicitApiRequest=${explicitApiRequest}, result=${isRelevant}`,
                );

                if (isRelevant) {
                    try {
                        console.log(
                            `[Chat] Calling API tool: ${tool.name} - ${tool.url}`,
                        );
                        const headers: Record<string, string> = {
                            "User-Agent": "SpritzAgent/1.0",
                            "Content-Type": "application/json",
                        };

                        // Add tool headers, sanitizing any invalid header names
                        if (tool.headers) {
                            for (const [key, value] of Object.entries(
                                tool.headers,
                            )) {
                                // Skip invalid header names (no colons, spaces, or empty)
                                const sanitizedKey = key.trim();
                                if (
                                    sanitizedKey &&
                                    !sanitizedKey.includes(":") &&
                                    !sanitizedKey.includes(" ")
                                ) {
                                    headers[sanitizedKey] = String(value);
                                } else {
                                    console.warn(
                                        `[Chat] Skipping invalid header name: "${key}"`,
                                    );
                                }
                            }
                        }

                        // Add API key as Authorization header if present and no auth header exists
                        if (
                            tool.apiKey &&
                            !headers["Authorization"] &&
                            !headers["authorization"]
                        ) {
                            headers["Authorization"] = `Bearer ${tool.apiKey}`;
                        }

                        const controller = new AbortController();
                        const timeoutId = setTimeout(
                            () => controller.abort(),
                            15000,
                        );

                        // For POST requests, send the message as the body
                        const fetchOptions: RequestInit = {
                            method: tool.method,
                            headers,
                            signal: controller.signal,
                        };

                        if (tool.method === "POST") {
                            // Check if this is a GraphQL API (either auto-detected or from URL/description)
                            const isGraphQL =
                                tool.apiType === "graphql" ||
                                tool.url.toLowerCase().includes("graph") ||
                                tool.description
                                    ?.toLowerCase()
                                    .includes("graphql") ||
                                tool.instructions
                                    ?.toLowerCase()
                                    .includes("graphql") ||
                                tool.name?.toLowerCase().includes("graph");

                            if (isGraphQL && ai) {
                                // Use AI to generate an appropriate GraphQL query
                                console.log(
                                    `[Chat] Generating GraphQL query for: ${message}`,
                                );

                                // Use stored schema if available, otherwise fall back to description/instructions
                                const schemaContext =
                                    tool.schema ||
                                    tool.instructions ||
                                    tool.description ||
                                    "";

                                const queryGenResponse =
                                    await ai.models.generateContent({
                                        model: "gemini-2.0-flash",
                                        contents: [
                                            {
                                                role: "user",
                                                parts: [
                                                    {
                                                        text: `Generate a GraphQL query to answer this question: "${message}"

${schemaContext ? `Available Schema/Types:\n${schemaContext}\n` : ""}

RULES:
1. Return ONLY the GraphQL query, no explanation
2. Do NOT wrap in markdown code blocks
3. Make it a valid GraphQL query
4. Use the schema information above to create an accurate query
5. Include relevant fields that would answer the user's question
6. For questions asking "what are available" or "list all" or "show me", use plural query names (e.g., graphNetworks, dataServices, subgraphs) with appropriate pagination (first: 100 or similar)
7. If the question asks for a list/collection, use the plural query form from the schema

Example formats:
- List query: { graphNetworks(first: 100) { id name } }
- Single item: { graphNetwork(id: "0x123") { id name } }
- With filters: { subgraphs(first: 50, where: { active: true }) { id displayName } }`,
                                                    },
                                                ],
                                            },
                                        ],
                                        config: { maxOutputTokens: 500 },
                                    });

                                let generatedQuery =
                                    queryGenResponse.text?.trim() || "";
                                // Clean up any markdown code blocks
                                generatedQuery = generatedQuery
                                    .replace(/```graphql?\n?/gi, "")
                                    .replace(/```\n?/g, "")
                                    .trim();

                                console.log(
                                    `[Chat] Generated GraphQL query: ${generatedQuery}`,
                                );
                                fetchOptions.body = JSON.stringify({
                                    query: generatedQuery,
                                });
                            } else if (tool.apiType === "openapi" && ai) {
                                // For OpenAPI, try to construct an appropriate request body
                                console.log(
                                    `[Chat] Generating OpenAPI request for: ${message}`,
                                );

                                const schemaContext =
                                    tool.schema ||
                                    tool.instructions ||
                                    tool.description ||
                                    "";

                                const bodyGenResponse =
                                    await ai.models.generateContent({
                                        model: "gemini-2.0-flash",
                                        contents: [
                                            {
                                                role: "user",
                                                parts: [
                                                    {
                                                        text: `Generate a JSON request body for this API to answer: "${message}"

${schemaContext ? `API Schema:\n${schemaContext}\n` : ""}

RULES:
1. Return ONLY valid JSON, no explanation
2. Do NOT wrap in markdown code blocks
3. Include only necessary fields`,
                                                    },
                                                ],
                                            },
                                        ],
                                        config: { maxOutputTokens: 500 },
                                    });

                                let generatedBody =
                                    bodyGenResponse.text?.trim() || "{}";
                                generatedBody = generatedBody
                                    .replace(/```json?\n?/gi, "")
                                    .replace(/```\n?/g, "")
                                    .trim();

                                console.log(
                                    `[Chat] Generated request body: ${generatedBody}`,
                                );
                                fetchOptions.body = generatedBody;
                            } else {
                                // Regular POST - try to construct a reasonable request body
                                fetchOptions.body = JSON.stringify({
                                    query: message,
                                    message: message,
                                    text: message,
                                });
                            }
                        }

                        const apiResponse = await fetch(tool.url, fetchOptions);
                        clearTimeout(timeoutId);

                        const responseText = await apiResponse.text();
                        console.log(
                            `[Chat] API tool ${tool.name} response: status=${apiResponse.status}, length=${responseText.length}`,
                        );

                        // Parse GraphQL response (may have errors but still contain data)
                        let responseData: any = null;
                        try {
                            responseData = JSON.parse(responseText);
                        } catch {
                            // Not JSON, use as text
                        }

                        // For GraphQL APIs, check if response has data even if there are errors
                        if (tool.apiType === "graphql" && responseData) {
                            if (
                                responseData.data &&
                                Object.keys(responseData.data).length > 0
                            ) {
                                // GraphQL returned data despite errors - use it
                                const truncatedData =
                                    responseText.length > 8000
                                        ? responseText.substring(0, 8000) +
                                          "..."
                                        : responseText;
                                apiResults.push(
                                    `\n--- Result from ${tool.name} ---\n${truncatedData}`,
                                );
                                console.log(
                                    `[Chat] API tool ${tool.name} returned data (with possible errors): ${responseText.length} chars`,
                                );
                            } else if (responseData.errors) {
                                // Only errors, no data - include error info for agent to understand
                                const errorMessages = responseData.errors
                                    .map((e: any) => e.message)
                                    .join("; ");
                                console.error(
                                    `[Chat] API tool ${tool.name} GraphQL errors: ${errorMessages}`,
                                );
                                apiResults.push(
                                    `\n--- Error from ${tool.name} ---\nGraphQL errors: ${errorMessages}\n\nNote: This API may require authorization. Check if an API key or authorization header is needed.`,
                                );
                            }
                        } else if (apiResponse.ok) {
                            const truncatedData =
                                responseText.length > 8000
                                    ? responseText.substring(0, 8000) + "..."
                                    : responseText;
                            apiResults.push(
                                `\n--- Result from ${tool.name} ---\n${truncatedData}`,
                            );
                            console.log(
                                `[Chat] API tool ${tool.name} returned ${responseText.length} chars`,
                            );
                        } else {
                            // Log error details for debugging
                            console.error(
                                `[Chat] API tool ${tool.name} error: ${apiResponse.status} - ${responseText.substring(0, 500)}`,
                            );
                            // Still try to use the response if it contains useful error info
                            if (responseText && responseText.length > 0) {
                                const errorInfo = responseData?.errors
                                    ? responseData.errors
                                          .map((e: any) => e.message)
                                          .join("; ")
                                    : responseText.substring(0, 1000);
                                apiResults.push(
                                    `\n--- Error from ${tool.name} (${apiResponse.status}) ---\n${errorInfo}`,
                                );
                            }
                        }
                    } catch (error) {
                        console.error(
                            `[Chat] Error calling API tool ${tool.name}:`,
                            error,
                        );
                        apiResults.push(
                            `\n--- Error calling ${tool.name} ---\nFailed to reach the API: ${error instanceof Error ? error.message : String(error)}`,
                        );
                    }
                }
            }

            if (apiResults.length > 0) {
                // Add API results directly to systemInstructions (prepend at the top)
                const apiResultsText = `
## API RESULTS (USE THIS DATA - DO NOT OUTPUT CODE)

The following data was ALREADY retrieved from APIs on behalf of the user.
Your job is to PRESENT this information in a helpful, formatted way.

ABSOLUTE RULES:
1. DO NOT write code showing how to query these APIs
2. DO NOT show GraphQL queries or fetch examples  
3. JUST use the retrieved data to answer the user's question directly
4. Format the information nicely: use **bold** for key terms, bullet or numbered lists for multiple items, and markdown tables (| col | col |) for comparisons or rows of data. Keep paragraphs short.

${apiResults.join("\n")}

---END OF API DATA---

`;
                // Prepend API results to the BEGINNING of system instructions
                systemInstructions = apiResultsText + systemInstructions;

                // Add a reminder at the end
                systemInstructions += `\n\n[CRITICAL REMINDER: The API data above contains the answer. Present it directly - DO NOT output code.]`;
            }
        }

        // Build conversation history
        const history = (recentChats || []).reverse().map((chat) => ({
            role: chat.role as "user" | "model",
            parts: [{ text: chat.content }],
        }));

        // Add the new user message
        history.push({
            role: "user" as const,
            parts: [{ text: message }],
        });

        // Store user message (shout_agent_chats = single source for AI agent usage analytics: direct, public, channel)
        await supabase.from("shout_agent_chats").insert({
            agent_id: id,
            user_address: normalizedAddress,
            role: "user",
            content: message,
            source: "direct",
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

        const generateConfig = {
            model: "gemini-2.0-flash",
            contents: history,
            config,
        };

        const modelName = "gemini-2.0-flash";
        const assistantMeta = {
            tool_calls: mcpToolCalls.length > 0 ? mcpToolCalls : null,
            tool_errors: mcpToolErrors.length > 0 ? mcpToolErrors : null,
            model: modelName,
        };

        function buildAssistantRow(payload: {
            content: string;
            input_tokens?: number | null;
            output_tokens?: number | null;
            total_tokens?: number | null;
            latency_ms?: number | null;
            error_code?: string | null;
            error_message?: string | null;
        }) {
            const estimated_cost_usd =
                estimateCostUsd(
                    payload.input_tokens ?? null,
                    payload.output_tokens ?? null,
                ) ?? null;
            return {
                agent_id: id,
                user_address: normalizedAddress,
                role: "assistant",
                content: payload.content,
                source: "direct",
                ...assistantMeta,
                input_tokens: payload.input_tokens ?? null,
                output_tokens: payload.output_tokens ?? null,
                total_tokens: payload.total_tokens ?? null,
                latency_ms: payload.latency_ms ?? null,
                estimated_cost_usd,
                error_code: payload.error_code ?? null,
                error_message: payload.error_message ?? null,
            };
        }

        if (streamRequested === true) {
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
                            // Persist streaming usage when SDK exposes it (e.g. last chunk)
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
                        await supabase.from("shout_agent_chats").insert(
                            buildAssistantRow({
                                content: assistantMessage,
                                input_tokens: streamInputTokens,
                                output_tokens: streamOutputTokens,
                                total_tokens: streamTotalTokens,
                                latency_ms: latencyMs,
                            }),
                        );
                        await supabase.rpc("increment_agent_messages", {
                            p_agent_id: id,
                        });
                        controller.enqueue(
                            encoder.encode(
                                JSON.stringify({
                                    type: "done",
                                    message: assistantMessage,
                                    scheduling: schedulingResponseData,
                                }) + "\n",
                            ),
                        );
                    } catch (err) {
                        console.error("[Agent Chat] Stream error:", err);
                        const errMessage = sanitizeErrorMessage(err);
                        const errCode = inferErrorCode(err);
                        try {
                            await supabase.from("shout_agent_chats").insert(
                                buildAssistantRow({
                                    content:
                                        "[Error: Failed to generate response]",
                                    error_code: errCode,
                                    error_message: errMessage,
                                }),
                            );
                            await supabase.rpc("increment_agent_messages", {
                                p_agent_id: id,
                            });
                        } catch (logErr) {
                            console.error(
                                "[Agent Chat] Failed to log stream error:",
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

        const startMs = Date.now();
        const response = await ai.models.generateContent(generateConfig);
        const assistantMessage =
            response.text || "I'm sorry, I couldn't generate a response.";
        const latencyMs = Date.now() - startMs;

        // Extract usage metadata when present (e.g. totalTokenCount, promptTokenCount, candidatesTokenCount)
        const usage = (
            response as {
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

        await supabase.from("shout_agent_chats").insert(
            buildAssistantRow({
                content: assistantMessage,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                total_tokens: totalTokens,
                latency_ms: latencyMs,
            }),
        );

        await supabase.rpc("increment_agent_messages", { p_agent_id: id });

        return NextResponse.json({
            message: assistantMessage,
            agentName: agent.name,
            agentEmoji: agent.avatar_emoji,
            scheduling: schedulingResponseData,
        });
    } catch (error) {
        console.error("[Agent Chat] Error:", error);
        const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json(
            { error: `Failed to generate response: ${errorMessage}` },
            { status: 500 },
        );
    }
}

// GET: Get chat history
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

    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");
        const limit = parseInt(searchParams.get("limit") || "50");

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address required" },
                { status: 400 },
            );
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Get the agent to check access
        const { data: agent } = await supabase
            .from("shout_agents")
            .select("owner_address, visibility")
            .eq("id", id)
            .single();

        if (!agent) {
            return NextResponse.json(
                { error: "Agent not found" },
                { status: 404 },
            );
        }

        if (agent.owner_address !== normalizedAddress) {
            if (agent.visibility === "private") {
                return NextResponse.json(
                    { error: "Access denied" },
                    { status: 403 },
                );
            }
            if (agent.visibility === "friends") {
                const { data: friendship } = await supabase
                    .from("shout_friends")
                    .select("id")
                    .or(
                        `and(user_address.eq.${agent.owner_address},friend_address.eq.${normalizedAddress}),and(user_address.eq.${normalizedAddress},friend_address.eq.${agent.owner_address})`,
                    )
                    .limit(1)
                    .maybeSingle();
                if (!friendship) {
                    return NextResponse.json(
                        { error: "Access denied" },
                        { status: 403 },
                    );
                }
            }
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
            return NextResponse.json(
                { error: "Failed to fetch chat history" },
                { status: 500 },
            );
        }

        return NextResponse.json({ chats: chats || [] });
    } catch (error) {
        console.error("[Agent Chat] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch chat history" },
            { status: 500 },
        );
    }
}

// DELETE: Clear chat history
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address required" },
                { status: 400 },
            );
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
            return NextResponse.json(
                { error: "Failed to clear chat history" },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Agent Chat] Error:", error);
        return NextResponse.json(
            { error: "Failed to clear chat history" },
            { status: 500 },
        );
    }
}
