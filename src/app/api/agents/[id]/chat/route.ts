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

        // Add MCP server information and call them (if MCP is enabled)
        const mcpEnabled = agent.mcp_enabled !== false; // Default true
        if (mcpEnabled && agent.mcp_servers && agent.mcp_servers.length > 0) {
            systemInstructions += "\n\n## Available MCP Servers:\n";
            for (const server of agent.mcp_servers) {
                systemInstructions += `- **${server.name}** (${server.url})`;
                if (server.description) {
                    systemInstructions += `: ${server.description}`;
                }
                if (server.instructions) {
                    systemInstructions += `\n  Instructions: ${server.instructions}`;
                }
                systemInstructions += "\n";
            }
            
            // Try to call MCP servers using JSON-RPC protocol
            const mcpResults: string[] = [];
            for (const server of agent.mcp_servers) {
                // Check if this MCP server should be called based on the message
                const serverText = [server.name, server.description, server.instructions].join(" ").toLowerCase();
                const messageWords = message.toLowerCase();
                
                // Check relevance
                const alwaysCall = server.instructions?.toLowerCase().includes("always") ||
                                   server.instructions?.toLowerCase().includes("every question");
                const nameMentioned = server.name && messageWords.includes(server.name.toLowerCase());
                const docPatterns = ["docs", "documentation", "how to", "what is", "tell me about", "looking at", "search", "find"];
                const isDocQuery = docPatterns.some(p => messageWords.includes(p));
                const serverIsDocRelated = serverText.includes("doc") || serverText.includes("context7") || serverText.includes("search") || serverText.includes("library");
                
                const isRelevant = alwaysCall || nameMentioned || (isDocQuery && serverIsDocRelated);
                
                console.log(`[Chat] MCP server ${server.name} relevance: alwaysCall=${alwaysCall}, nameMentioned=${nameMentioned}, isDocQuery=${isDocQuery && serverIsDocRelated}, result=${isRelevant}`);
                
                if (isRelevant) {
                    try {
                        console.log(`[Chat] Calling MCP server: ${server.name} - ${server.url}`);
                        
                        // Build headers
                        const headers: Record<string, string> = {
                            "Content-Type": "application/json",
                            "Accept": "application/json, text/event-stream",
                            ...(server.headers || {})
                        };
                        
                        // Add API key if present
                        if (server.apiKey) {
                            // Check if there's already an auth header configured
                            const hasAuthHeader = Object.keys(headers).some(k => 
                                k.toLowerCase() === "authorization" || k.toLowerCase().includes("api_key") || k.toLowerCase().includes("apikey")
                            );
                            if (!hasAuthHeader) {
                                headers["Authorization"] = `Bearer ${server.apiKey}`;
                            }
                        }
                        
                        // For Context7-like servers, try to extract what the user is looking for
                        // First, check for common library names (prioritize these over regex)
                        const commonLibs = ["next.js", "nextjs", "react", "vue", "angular", "svelte", "typescript", "node", "express", "fastify", "prisma", "drizzle", "tailwind", "supabase", "firebase", "mongodb", "postgres", "redis"];
                        let libraryName: string | null = null;
                        
                        const messageLower = message.toLowerCase();
                        for (const lib of commonLibs) {
                            if (messageLower.includes(lib)) {
                                libraryName = lib;
                                break;
                            }
                        }
                        
                        // If no common lib found, try regex (but skip "context7" as that's the tool name)
                        if (!libraryName) {
                            const libraryMatch = message.match(/(?:docs?(?:umentation)?|about|using|for)\s+(?:on\s+)?([A-Za-z][A-Za-z0-9\.\-]*(?:\.js)?)/i);
                            if (libraryMatch && libraryMatch[1].toLowerCase() !== "context7") {
                                libraryName = libraryMatch[1];
                            }
                        }
                        
                        // Clean up library name
                        if (libraryName) {
                            libraryName = libraryName.replace(/\.$/, "");
                        }
                        
                        console.log(`[Chat] Context7: Extracted library name: ${libraryName} from message: "${message.substring(0, 100)}"`);
                        
                        // Discover available tools from this MCP server
                        const availableTools = await discoverMcpTools(server.url, headers);
                        
                        // Get additional context about this MCP server via Google Search
                        let mcpContext = "";
                        if (availableTools.length === 0) {
                            // If we couldn't discover tools, try to get context via Google Search
                            const searchContext = await getMcpServerContext(server.name, server.url);
                            if (searchContext) {
                                mcpContext = `\n\nContext about ${server.name}:\n${searchContext}`;
                            }
                        } else {
                            // Add tool info to context
                            mcpContext = `\n\nAvailable tools from ${server.name}:\n`;
                            for (const tool of availableTools) {
                                mcpContext += `- ${tool.name}`;
                                if (tool.description) mcpContext += `: ${tool.description}`;
                                if (tool.inputSchema?.properties) {
                                    const params = Object.entries(tool.inputSchema.properties)
                                        .map(([k, v]) => `${k}${tool.inputSchema?.required?.includes(k) ? '*' : ''}: ${v.type}`)
                                        .join(", ");
                                    mcpContext += ` (params: ${params})`;
                                }
                                mcpContext += "\n";
                            }
                        }
                        
                        if (mcpContext) {
                            systemInstructions += mcpContext;
                        }
                        
                        // Try MCP JSON-RPC call to resolve library ID first
                        if (libraryName && server.url.includes("context7")) {
                            console.log(`[Chat] Context7: Resolving library ID for: ${libraryName}`);
                            
                            // Find the resolve-library-id tool from discovered tools to get correct param names
                            const resolveTool = availableTools.find(t => t.name === "resolve-library-id");
                            const resolveParams: Record<string, string> = {};
                            
                            if (resolveTool?.inputSchema?.properties) {
                                // Use the discovered schema to build correct parameters
                                for (const paramName of Object.keys(resolveTool.inputSchema.properties)) {
                                    resolveParams[paramName] = libraryName;
                                }
                                console.log(`[Chat] Context7: Using discovered params:`, Object.keys(resolveParams));
                            } else {
                                // Fallback: send both common parameter names
                                resolveParams.libraryName = libraryName;
                                resolveParams.query = libraryName;
                            }
                            
                            console.log(`[Chat] Context7: Making request to ${server.url} for library: ${libraryName}`);
                            const resolveResponse = await fetch(server.url, {
                                method: "POST",
                                headers,
                                body: JSON.stringify({
                                    jsonrpc: "2.0",
                                    id: 1,
                                    method: "tools/call",
                                    params: {
                                        name: "resolve-library-id",
                                        arguments: resolveParams
                                    }
                                })
                            });
                            
                            console.log(`[Chat] Context7 resolve response status: ${resolveResponse.status}`);
                            
                            if (!resolveResponse.ok) {
                                const errorText = await resolveResponse.text();
                                console.error(`[Chat] Context7 resolve error: ${resolveResponse.status} - ${errorText.substring(0, 500)}`);
                            }
                            
                            if (resolveResponse.ok) {
                                const resolveData = await resolveResponse.json();
                                console.log(`[Chat] Context7 resolve response:`, JSON.stringify(resolveData).substring(0, 500));
                                
                                // Extract library ID from response
                                const resultText = resolveData?.result?.content?.[0]?.text || JSON.stringify(resolveData);
                                const libraryIdMatch = resultText.match(/\/[\w\-]+\/[\w\-\.]+/);
                                
                                if (libraryIdMatch) {
                                    const libraryId = libraryIdMatch[0];
                                    console.log(`[Chat] Context7: Found library ID: ${libraryId}, fetching docs...`);
                                    
                                    // Find the get-library-docs tool to get correct param names
                                    const docsTool = availableTools.find(t => t.name === "get-library-docs");
                                    const docsParams: Record<string, string> = {};
                                    
                                    if (docsTool?.inputSchema?.properties) {
                                        // Use discovered schema
                                        for (const [paramName, paramDef] of Object.entries(docsTool.inputSchema.properties)) {
                                            if (paramName.toLowerCase().includes("id") || paramName.toLowerCase().includes("library")) {
                                                docsParams[paramName] = libraryId;
                                            } else if (paramName.toLowerCase().includes("topic") || paramName.toLowerCase().includes("query")) {
                                                docsParams[paramName] = message;
                                            }
                                        }
                                        console.log(`[Chat] Context7: Using discovered doc params:`, Object.keys(docsParams));
                                    } else {
                                        // Fallback
                                        docsParams.context7CompatibleLibraryID = libraryId;
                                        docsParams.topic = message;
                                    }
                                    
                                    // Call get-library-docs
                                    const docsResponse = await fetch(server.url, {
                                        method: "POST",
                                        headers,
                                        body: JSON.stringify({
                                            jsonrpc: "2.0",
                                            id: 2,
                                            method: "tools/call",
                                            params: {
                                                name: "get-library-docs",
                                                arguments: docsParams
                                            }
                                        })
                                    });
                                    
                                    console.log(`[Chat] Context7 docs response status: ${docsResponse.status}`);
                                    
                                    if (docsResponse.ok) {
                                        const docsData = await docsResponse.json();
                                        const docsText = docsData?.result?.content?.[0]?.text || JSON.stringify(docsData);
                                        const truncatedDocs = docsText.length > 10000 ? docsText.substring(0, 10000) + "..." : docsText;
                                        mcpResults.push(`\n--- Documentation from ${server.name} (${libraryId}) ---\n${truncatedDocs}`);
                                        console.log(`[Chat] Context7 returned ${docsText.length} chars of docs`);
                                    } else {
                                        const docsErrorText = await docsResponse.text();
                                        console.error(`[Chat] Context7 docs error: ${docsResponse.status} - ${docsErrorText.substring(0, 500)}`);
                                    }
                                } else {
                                    // Include the resolve response as context
                                    const truncatedResult = resultText.length > 3000 ? resultText.substring(0, 3000) + "..." : resultText;
                                    mcpResults.push(`\n--- Search results from ${server.name} ---\n${truncatedResult}`);
                                }
                            }
                        } else {
                            // Generic MCP call - try a simple query
                            const mcpResponse = await fetch(server.url, {
                                method: "POST",
                                headers,
                                body: JSON.stringify({
                                    jsonrpc: "2.0",
                                    id: 1,
                                    method: "tools/list",
                                    params: {}
                                })
                            });
                            
                            if (mcpResponse.ok) {
                                const mcpData = await mcpResponse.json();
                                const mcpText = JSON.stringify(mcpData, null, 2);
                                const truncatedMcp = mcpText.length > 2000 ? mcpText.substring(0, 2000) + "..." : mcpText;
                                mcpResults.push(`\n--- Available tools from ${server.name} ---\n${truncatedMcp}`);
                                console.log(`[Chat] MCP server ${server.name} tools:`, mcpText.substring(0, 500));
                            }
                        }
                    } catch (error) {
                        console.error(`[Chat] Error calling MCP server ${server.name}:`, error);
                    }
                }
            }
            
            if (mcpResults.length > 0) {
                systemInstructions += "\n\n## MCP Server Results (use this information to answer):\n" + mcpResults.join("\n");
            }
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
                
                const isRelevant = alwaysCall || nameMentioned || keywordMatch || (isDocQuery && toolIsDocRelated);
                
                console.log(`[Chat] API tool ${tool.name} relevance check: alwaysCall=${alwaysCall}, nameMentioned=${nameMentioned}, keywordMatch=${keywordMatch}, isDocQuery=${isDocQuery && toolIsDocRelated}, result=${isRelevant}`);
                
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
                            // Try to construct a reasonable request body
                            fetchOptions.body = JSON.stringify({ 
                                query: message,
                                message: message,
                                text: message 
                            });
                        }
                        
                        const apiResponse = await fetch(tool.url, fetchOptions);
                        clearTimeout(timeoutId);
                        
                        console.log(`[Chat] API tool ${tool.name} response status: ${apiResponse.status}`);
                        
                        if (apiResponse.ok) {
                            const data = await apiResponse.text();
                            const truncatedData = data.length > 8000 ? data.substring(0, 8000) + "..." : data;
                            apiResults.push(`\n--- Result from ${tool.name} ---\n${truncatedData}`);
                            console.log(`[Chat] API tool ${tool.name} returned ${data.length} chars`);
                        } else {
                            console.log(`[Chat] API tool ${tool.name} returned error: ${apiResponse.status}`);
                        }
                    } catch (error) {
                        console.error(`[Chat] Error calling API tool ${tool.name}:`, error);
                    }
                }
            }
            
            if (apiResults.length > 0) {
                systemInstructions += "\n\n## API Results (use this information to answer):\n" + apiResults.join("\n");
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

