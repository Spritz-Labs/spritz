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

// Cache for MCP server tool schemas (in-memory, per instance)
const mcpToolsCache = new Map<string, { tools: MCPTool[]; fetchedAt: number }>();
const MCP_CACHE_TTL = 1000 * 60 * 60; // 1 hour

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
    headers: Record<string, string>
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
                params: {}
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            const tools: MCPTool[] = data?.result?.tools || [];
            console.log(`[MCP] Discovered ${tools.length} tools from ${serverUrl}`);
            
            // Cache the results
            mcpToolsCache.set(serverUrl, { tools, fetchedAt: Date.now() });
            
            return tools;
        }
    } catch (error) {
        console.error(`[MCP] Error discovering tools from ${serverUrl}:`, error);
    }
    
    return [];
}

// Use Google Search to get context about an MCP server (always enabled for MCP discovery)
async function getMcpServerContext(serverName: string, serverUrl: string): Promise<string | null> {
    if (!ai) return null;
    
    try {
        console.log(`[MCP] Searching for context about ${serverName}`);
        
        // Use Gemini with Google Search grounding to find info about this MCP server
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{
                role: "user",
                parts: [{ text: `What is ${serverName} MCP server? How do I use its tools? What parameters do its main tools expect? Keep the response brief and technical.` }]
            }],
            config: {
                tools: [{ googleSearch: {} }],
                maxOutputTokens: 1024,
            }
        });
        
        const context = response.text;
        if (context && context.length > 50) {
            console.log(`[MCP] Got context for ${serverName}: ${context.substring(0, 200)}...`);
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
    previousResults?: string
): Promise<{ toolName: string; args: Record<string, string> } | null> {
    if (!ai || tools.length === 0) return null;
    
    try {
        // Build a description of available tools
        const toolsDescription = tools.map(t => {
            let desc = `Tool: ${t.name}`;
            if (t.description) desc += `\nDescription: ${t.description}`;
            if (t.inputSchema?.properties) {
                const params = Object.entries(t.inputSchema.properties)
                    .map(([name, schema]) => {
                        const required = t.inputSchema?.required?.includes(name) ? " (required)" : " (optional)";
                        const paramSchema = schema as { type: string; description?: string };
                        return `  - ${name}${required}: ${paramSchema.type}${paramSchema.description ? ` - ${paramSchema.description}` : ""}`;
                    })
                    .join("\n");
                desc += `\nParameters:\n${params}`;
            }
            return desc;
        }).join("\n\n");
        
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
            config: { maxOutputTokens: 512 }
        });
        
        const responseText = response.text?.trim() || "";
        console.log(`[MCP] AI tool selection response: ${responseText.substring(0, 300)}`);
        
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

// Call an MCP tool dynamically
async function callMcpTool(
    serverUrl: string,
    headers: Record<string, string>,
    toolName: string,
    args: Record<string, string>
): Promise<string | null> {
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
                    arguments: args
                }
            })
        });
        
        console.log(`[MCP] Tool ${toolName} response status: ${response.status}`);
        
        if (response.ok) {
            const data = await response.json();
            
            // Check for error in response
            if (data.error) {
                console.error(`[MCP] Tool ${toolName} returned error:`, data.error);
                return null;
            }
            
            // Extract text content from response
            const resultText = data?.result?.content?.[0]?.text || JSON.stringify(data.result || data);
            console.log(`[MCP] Tool ${toolName} returned ${resultText.length} chars`);
            return resultText;
        } else {
            const errorText = await response.text();
            console.error(`[MCP] Tool ${toolName} HTTP error: ${response.status} - ${errorText.substring(0, 300)}`);
        }
    } catch (error) {
        console.error(`[MCP] Error calling tool ${toolName}:`, error);
    }
    
    return null;
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
        // We build MCP results FIRST, then add them at the top of the system prompt
        
        // Track MCP results to add BEFORE personality
        let mcpResultsSection = "";
        
        // Add MCP server information and call them (if MCP is enabled)
        const mcpEnabled = agent.mcp_enabled !== false; // Default true
        if (mcpEnabled && agent.mcp_servers && agent.mcp_servers.length > 0) {
            // Try to call MCP servers dynamically using AI-driven tool selection
            const mcpResults: string[] = [];
            for (const server of agent.mcp_servers) {
                // Check if this MCP server should be called based on the message
                const serverText = [server.name, server.description, server.instructions].join(" ").toLowerCase();
                const messageWords = message.toLowerCase();
                
                // Check relevance - be more permissive to let AI decide
                const alwaysCall = server.instructions?.toLowerCase().includes("always") ||
                                   server.instructions?.toLowerCase().includes("every question");
                const nameMentioned = server.name && messageWords.includes(server.name.toLowerCase());
                const queryPatterns = ["docs", "documentation", "how to", "what is", "tell me", "search", "find", "help", "show", "get", "explain"];
                const hasQueryPattern = queryPatterns.some(p => messageWords.includes(p));
                
                const isRelevant = alwaysCall || nameMentioned || hasQueryPattern;
                
                console.log(`[MCP] Server ${server.name} relevance check: alwaysCall=${alwaysCall}, nameMentioned=${nameMentioned}, hasQueryPattern=${hasQueryPattern}, result=${isRelevant}`);
                
                if (isRelevant) {
                    try {
                        console.log(`[MCP] Processing server: ${server.name} - ${server.url}`);
                        
                        // Build headers
                        const headers: Record<string, string> = {
                            "Content-Type": "application/json",
                            "Accept": "application/json, text/event-stream",
                        };
                        
                        // Add server-configured headers
                        if (server.headers) {
                            for (const [key, value] of Object.entries(server.headers)) {
                                headers[key] = String(value);
                            }
                        }
                        
                        // Add API key as Bearer token if not already configured
                        if (server.apiKey) {
                            const hasAuthHeader = Object.keys(headers).some(k => 
                                k.toLowerCase() === "authorization"
                            );
                            if (!hasAuthHeader) {
                                headers["Authorization"] = `Bearer ${server.apiKey}`;
                            }
                        }
                        
                        console.log(`[MCP] Headers for ${server.name}:`, Object.keys(headers));
                        
                        // Step 1: Discover available tools from this MCP server
                        const availableTools = await discoverMcpTools(server.url, headers);
                        
                        if (availableTools.length === 0) {
                            // If we couldn't discover tools, try to get context via Google Search
                            console.log(`[MCP] No tools discovered, trying Google Search for context`);
                            const searchContext = await getMcpServerContext(server.name, server.url);
                            if (searchContext) {
                                mcpResults.push(`\n\nContext about ${server.name}:\n${searchContext}`);
                            }
                            continue;
                        }
                        
                        // Log discovered tools (we'll rely on the results, not tool listing)
                        console.log(`[MCP] Discovered ${availableTools.length} tools from ${server.name}`);
                        
                        // Step 2: Use AI to determine which tool to call (up to 3 iterations)
                        let previousResults = "";
                        const maxIterations = 3;
                        
                        for (let i = 0; i < maxIterations; i++) {
                            const toolCall = await determineToolCall(message, availableTools, server.name, previousResults);
                            
                            if (!toolCall) {
                                console.log(`[MCP] AI decided no more tools needed after ${i} iterations`);
                                break;
                            }
                            
                            console.log(`[MCP] Iteration ${i + 1}: AI selected tool "${toolCall.toolName}"`);
                            
                            // Step 3: Call the tool
                            const result = await callMcpTool(server.url, headers, toolCall.toolName, toolCall.args);
                            
                            if (result) {
                                previousResults += `\n\nResult from ${toolCall.toolName}:\n${result.substring(0, 5000)}`;
                                
                                // Check if this is an intermediate result that needs another tool call
                                // resolve-library-id results are ALWAYS intermediate (they return library IDs to use with query-docs)
                                const isIntermediateResult = 
                                    toolCall.toolName === "resolve-library-id" ||
                                    toolCall.toolName.includes("resolve") ||
                                    toolCall.toolName.includes("search") ||
                                    toolCall.toolName.includes("list") ||
                                    (result.includes("library ID") || result.includes("libraryId") || result.includes("Context7-compatible"));
                                
                                console.log(`[MCP] Tool ${toolCall.toolName} result is ${isIntermediateResult ? 'intermediate' : 'final'}`);
                                
                                if (isIntermediateResult && i < maxIterations - 1) {
                                    // This is an intermediate result, continue to next iteration
                                    console.log(`[MCP] Intermediate result, will determine next tool...`);
                                } else {
                                    // This is a final result, add it
                                    const truncatedResult = result.length > 10000 ? result.substring(0, 10000) + "..." : result;
                                    mcpResults.push(`\n--- Results from ${server.name} (${toolCall.toolName}) ---\n${truncatedResult}`);
                                    console.log(`[MCP] Got final result, stopping iterations`);
                                    break;
                                }
                            } else {
                                console.log(`[MCP] Tool ${toolCall.toolName} returned no result`);
                                break;
                            }
                        }
                    } catch (error) {
                        console.error(`[MCP] Error processing server ${server.name}:`, error);
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
        
        // Add MCP results at the VERY TOP if we have them
        if (mcpResultsSection) {
            systemInstructions += mcpResultsSection;
        }
        
        // Then add the agent's personality
        systemInstructions += agent.system_instructions || `You are a helpful AI assistant named ${agent.name}.`;
        
        // Add knowledge context
        if (knowledgeContext) {
            systemInstructions += `\n\nYou have access to the following knowledge sources. Use this information to help answer questions when relevant:${knowledgeContext}`;
        }
        
        // Add a final reminder if we had MCP results
        if (mcpResultsSection) {
            systemInstructions += `\n\n[REMINDER: Answer using the RETRIEVED INFORMATION at the top. DO NOT output code.]`;
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
                systemInstructions += "\n";
            }
            
            // Try to call relevant APIs based on the message
            const apiResults: string[] = [];
            for (const tool of agent.api_tools) {
                // Build a comprehensive set of keywords from name, description, and instructions
                const toolText = [
                    tool.name || "",
                    tool.description || "",
                    tool.instructions || ""
                ].join(" ").toLowerCase();
                const messageWords = message.toLowerCase();
                
                // Check if this is a GraphQL/subgraph API
                const isGraphQLTool = tool.url.toLowerCase().includes("graph") || 
                                     toolText.includes("graphql") ||
                                     toolText.includes("subgraph");
                
                // Check relevance with multiple methods:
                // 1. If instructions contain "always" or "every", always call it
                const alwaysCall = tool.instructions?.toLowerCase().includes("always") ||
                                   tool.instructions?.toLowerCase().includes("every question") ||
                                   tool.instructions?.toLowerCase().includes("all questions");
                
                // 2. Check if the tool name is mentioned
                const nameMentioned = tool.name && messageWords.includes(tool.name.toLowerCase());
                
                // 3. Check for keyword overlap (words > 3 chars)
                const keywords = toolText.split(/\s+/).filter((w: string) => w.length > 3);
                const keywordMatch = keywords.some((word: string) => messageWords.includes(word));
                
                // 4. Check for common documentation/API query patterns
                const docPatterns = ["docs", "documentation", "how to", "what is", "tell me about", "looking at", "using"];
                const isDocQuery = docPatterns.some(p => messageWords.includes(p));
                const toolIsDocRelated = toolText.includes("doc") || toolText.includes("search") || toolText.includes("library");
                
                // 5. Check for data query patterns (common for GraphQL/subgraph queries)
                const dataQueryPatterns = ["get", "fetch", "show", "list", "find", "last", "recent", "latest", "first", "top", "all"];
                const isDataQuery = dataQueryPatterns.some(p => messageWords.includes(p));
                
                // 6. Check if user explicitly asks to use API/tool
                const explicitApiRequest = messageWords.includes("api") || 
                                          messageWords.includes("tool") || 
                                          messageWords.includes("use your");
                
                // GraphQL APIs are more likely to be relevant for data queries
                const graphQLDataQuery = isGraphQLTool && isDataQuery;
                
                const isRelevant = alwaysCall || nameMentioned || keywordMatch || 
                                  (isDocQuery && toolIsDocRelated) || graphQLDataQuery || explicitApiRequest;
                
                console.log(`[Chat] API tool ${tool.name} relevance check: alwaysCall=${alwaysCall}, nameMentioned=${nameMentioned}, keywordMatch=${keywordMatch}, graphQLDataQuery=${graphQLDataQuery}, explicitApiRequest=${explicitApiRequest}, result=${isRelevant}`);
                
                if (isRelevant) {
                    try {
                        console.log(`[Chat] Calling API tool: ${tool.name} - ${tool.url}`);
                        const headers: Record<string, string> = {
                            "User-Agent": "SpritzAgent/1.0",
                            "Content-Type": "application/json",
                        };
                        
                        // Add tool headers, sanitizing any invalid header names
                        if (tool.headers) {
                            for (const [key, value] of Object.entries(tool.headers)) {
                                // Skip invalid header names (no colons, spaces, or empty)
                                const sanitizedKey = key.trim();
                                if (sanitizedKey && !sanitizedKey.includes(":") && !sanitizedKey.includes(" ")) {
                                    headers[sanitizedKey] = String(value);
                                } else {
                                    console.warn(`[Chat] Skipping invalid header name: "${key}"`);
                                }
                            }
                        }
                        
                        // Add API key as Authorization header if present and no auth header exists
                        if (tool.apiKey && !headers["Authorization"] && !headers["authorization"]) {
                            headers["Authorization"] = `Bearer ${tool.apiKey}`;
                        }
                        
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 15000);
                        
                        // For POST requests, send the message as the body
                        const fetchOptions: RequestInit = {
                            method: tool.method,
                            headers,
                            signal: controller.signal
                        };
                        
                        if (tool.method === "POST") {
                            // Check if this is a GraphQL API (either auto-detected or from URL/description)
                            const isGraphQL = tool.apiType === "graphql" ||
                                             tool.url.toLowerCase().includes("graph") || 
                                             tool.description?.toLowerCase().includes("graphql") ||
                                             tool.instructions?.toLowerCase().includes("graphql") ||
                                             tool.name?.toLowerCase().includes("graph");
                            
                            if (isGraphQL && ai) {
                                // Use AI to generate an appropriate GraphQL query
                                console.log(`[Chat] Generating GraphQL query for: ${message}`);
                                
                                // Use stored schema if available, otherwise fall back to description/instructions
                                const schemaContext = tool.schema || tool.instructions || tool.description || "";
                                
                                const queryGenResponse = await ai.models.generateContent({
                                    model: "gemini-2.0-flash",
                                    contents: [{
                                        role: "user",
                                        parts: [{ text: `Generate a GraphQL query to answer this question: "${message}"

${schemaContext ? `Available Schema/Types:\n${schemaContext}\n` : ""}

RULES:
1. Return ONLY the GraphQL query, no explanation
2. Do NOT wrap in markdown code blocks
3. Make it a valid GraphQL query
4. Use the schema information above to create an accurate query
5. Include relevant fields that would answer the user's question

Example format:
{ domains(first: 3, orderBy: registeredAt, orderDirection: desc) { id name registeredAt } }` }]
                                    }],
                                    config: { maxOutputTokens: 500 }
                                });
                                
                                let generatedQuery = queryGenResponse.text?.trim() || "";
                                // Clean up any markdown code blocks
                                generatedQuery = generatedQuery.replace(/```graphql?\n?/gi, "").replace(/```\n?/g, "").trim();
                                
                                console.log(`[Chat] Generated GraphQL query: ${generatedQuery}`);
                                fetchOptions.body = JSON.stringify({ query: generatedQuery });
                            } else if (tool.apiType === "openapi" && ai) {
                                // For OpenAPI, try to construct an appropriate request body
                                console.log(`[Chat] Generating OpenAPI request for: ${message}`);
                                
                                const schemaContext = tool.schema || tool.instructions || tool.description || "";
                                
                                const bodyGenResponse = await ai.models.generateContent({
                                    model: "gemini-2.0-flash",
                                    contents: [{
                                        role: "user",
                                        parts: [{ text: `Generate a JSON request body for this API to answer: "${message}"

${schemaContext ? `API Schema:\n${schemaContext}\n` : ""}

RULES:
1. Return ONLY valid JSON, no explanation
2. Do NOT wrap in markdown code blocks
3. Include only necessary fields` }]
                                    }],
                                    config: { maxOutputTokens: 500 }
                                });
                                
                                let generatedBody = bodyGenResponse.text?.trim() || "{}";
                                generatedBody = generatedBody.replace(/```json?\n?/gi, "").replace(/```\n?/g, "").trim();
                                
                                console.log(`[Chat] Generated request body: ${generatedBody}`);
                                fetchOptions.body = generatedBody;
                            } else {
                                // Regular POST - try to construct a reasonable request body
                                fetchOptions.body = JSON.stringify({ 
                                    query: message,
                                    message: message,
                                    text: message 
                                });
                            }
                        }
                        
                        const apiResponse = await fetch(tool.url, fetchOptions);
                        clearTimeout(timeoutId);
                        
                        const responseText = await apiResponse.text();
                        console.log(`[Chat] API tool ${tool.name} response: status=${apiResponse.status}, length=${responseText.length}`);
                        
                        if (apiResponse.ok) {
                            const truncatedData = responseText.length > 8000 ? responseText.substring(0, 8000) + "..." : responseText;
                            apiResults.push(`\n--- Result from ${tool.name} ---\n${truncatedData}`);
                            console.log(`[Chat] API tool ${tool.name} returned ${responseText.length} chars`);
                        } else {
                            // Log error details for debugging
                            console.error(`[Chat] API tool ${tool.name} error: ${apiResponse.status} - ${responseText.substring(0, 500)}`);
                            // Still try to use the response if it contains useful error info
                            if (responseText && responseText.length > 0) {
                                apiResults.push(`\n--- Error from ${tool.name} (${apiResponse.status}) ---\n${responseText.substring(0, 1000)}`);
                            }
                        }
                    } catch (error) {
                        console.error(`[Chat] Error calling API tool ${tool.name}:`, error);
                        apiResults.push(`\n--- Error calling ${tool.name} ---\nFailed to reach the API: ${error instanceof Error ? error.message : String(error)}`);
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
4. Format the information nicely (use markdown tables, lists, etc.)

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

        // Generate response using Gemini 2.0 Flash (free tier: 15 RPM, 1500 req/day)
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

