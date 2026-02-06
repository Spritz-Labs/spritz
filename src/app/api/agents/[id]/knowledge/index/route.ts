import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { scrapeUrl, fetchContent, isFirecrawlConfigured } from "@/lib/firecrawl";
import { isGitHubUrl, parseGitHubUrl, fetchGitHubRepoContent } from "@/lib/github";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

// Chunk text into smaller pieces for embedding
function chunkText(text: string, maxChunkSize: number = 1000, overlap: number = 100): string[] {
    const chunks: string[] = [];
    let start = 0;
    
    while (start < text.length) {
        let end = start + maxChunkSize;
        
        // Try to break at a sentence or paragraph boundary
        if (end < text.length) {
            const lastPeriod = text.lastIndexOf(".", end);
            const lastNewline = text.lastIndexOf("\n", end);
            const breakPoint = Math.max(lastPeriod, lastNewline);
            
            if (breakPoint > start + maxChunkSize / 2) {
                end = breakPoint + 1;
            }
        }
        
        const chunk = text.slice(start, end).trim();
        if (chunk.length > 50) { // Only keep meaningful chunks
            chunks.push(chunk);
        }
        
        start = end - overlap;
        if (start < 0) start = 0;
    }
    
    return chunks;
}

// Fetch and clean content from URL (basic method - regex HTML cleaning)
async function fetchAndCleanContentBasic(url: string): Promise<string | null> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; SpritzBot/1.0; +https://spritz.chat)",
            },
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const contentType = response.headers.get("content-type") || "";
        
        // Handle different content types
        if (contentType.includes("application/json")) {
            const json = await response.json();
            return JSON.stringify(json, null, 2);
        }
        
        if (!contentType.includes("text/html") && !contentType.includes("text/plain") && !contentType.includes("text/markdown")) {
            throw new Error("Unsupported content type: " + contentType);
        }
        
        const html = await response.text();
        
        // Clean HTML to text
        let text = html
            // Remove script and style tags with content
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
            // Convert some tags to text equivalents
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n\n")
            .replace(/<\/div>/gi, "\n")
            .replace(/<\/h[1-6]>/gi, "\n\n")
            .replace(/<li>/gi, "• ")
            .replace(/<\/li>/gi, "\n")
            // Remove remaining tags
            .replace(/<[^>]+>/g, " ")
            // Clean up whitespace
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, " ")
            .replace(/\n\s*\n/g, "\n\n")
            .trim();
        
        return text;
    } catch (error) {
        console.error("[Indexing] Error fetching URL:", error);
        throw error;
    }
}

// Fetch content using appropriate method
async function fetchAndCleanContent(
    url: string, 
    options: {
        scrapeMethod?: "basic" | "firecrawl";
        crawlDepth?: number;
        excludePatterns?: string[];
        infiniteScroll?: boolean;
        scrollCount?: number;
    } = {}
): Promise<{ content: string; pageCount: number }> {
    const { scrapeMethod = "basic", crawlDepth = 1, excludePatterns, infiniteScroll = false, scrollCount = 5 } = options;
    
    // PRIORITY 1: Use GitHub API for GitHub repositories
    if (isGitHubUrl(url)) {
        console.log("[Indexing] Detected GitHub URL, using GitHub API:", url);
        
        try {
            const repoInfo = parseGitHubUrl(url);
            if (repoInfo) {
                const result = await fetchGitHubRepoContent(repoInfo);
                console.log("[Indexing] GitHub API fetched", result.filesFetched, "file(s) from:", result.source);
                return {
                    content: result.content,
                    pageCount: result.filesFetched || 1,
                };
            } else {
                console.warn("[Indexing] Could not parse GitHub URL, falling back to scraping");
            }
        } catch (error) {
            console.error("[Indexing] GitHub API failed, falling back to scraping:", error);
            // Fall through to other methods
        }
    }
    
    // PRIORITY 2: Use Firecrawl if configured and requested
    if (scrapeMethod === "firecrawl" && isFirecrawlConfigured()) {
        console.log("[Indexing] Using Firecrawl for URL:", url, "infiniteScroll:", infiniteScroll);
        
        try {
            const result = await fetchContent(url, {
                crawlDepth,
                excludePatterns,
                maxPages: 50,
                infiniteScroll,
                scrollCount,
            });
            
            console.log("[Indexing] Firecrawl returned", result.pageCount, "pages");
            return {
                content: result.content,
                pageCount: result.pageCount,
            };
        } catch (error) {
            console.error("[Indexing] Firecrawl failed, falling back to basic:", error);
            // Fall back to basic method
        }
    }
    
    // PRIORITY 3: Basic method
    console.log("[Indexing] Using basic scraping for URL:", url);
    const content = await fetchAndCleanContentBasic(url);
    return {
        content: content || "",
        pageCount: 1,
    };
}

// Gemini text-embedding-004 supports up to 2048 tokens (~8k chars); keep chunks well under
const MAX_CHARS_FOR_EMBEDDING = 2000;

// Generate embedding using Gemini
async function generateEmbedding(text: string): Promise<number[] | null> {
    if (!ai) return null;
    const toEmbed = text.length > MAX_CHARS_FOR_EMBEDDING ? text.slice(0, MAX_CHARS_FOR_EMBEDDING) : text;
    try {
        const result = await ai.models.embedContent({
            model: "text-embedding-004",
            contents: toEmbed,
        });
        return result.embeddings?.[0]?.values || null;
    } catch (error) {
        console.error("[Indexing] Error generating embedding:", error);
        throw error; // Re-throw so caller can surface the real reason
    }
}

// POST: Index a knowledge item
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    if (!ai) {
        return NextResponse.json({ error: "Gemini API not configured" }, { status: 500 });
    }

    try {
        const { id: agentId } = await params;
        const body = await request.json();
        const { userAddress, knowledgeId } = body;

        if (!userAddress || !knowledgeId) {
            return NextResponse.json(
                { error: "User address and knowledge ID are required" },
                { status: 400 }
            );
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Verify agent ownership
        const { data: agent } = await supabase
            .from("shout_agents")
            .select("owner_address")
            .eq("id", agentId)
            .single();

        if (!agent || agent.owner_address !== normalizedAddress) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Get the knowledge item
        const { data: knowledge, error: knowledgeError } = await supabase
            .from("shout_agent_knowledge")
            .select("*")
            .eq("id", knowledgeId)
            .eq("agent_id", agentId)
            .single();

        if (knowledgeError || !knowledge) {
            return NextResponse.json({ error: "Knowledge item not found" }, { status: 404 });
        }

        // Update status to processing
        await supabase
            .from("shout_agent_knowledge")
            .update({ status: "processing" })
            .eq("id", knowledgeId);

        try {
            // Fetch content using configured method
            console.log("[Indexing] Fetching content from:", knowledge.url, "method:", knowledge.scrape_method || "basic", "infiniteScroll:", knowledge.infinite_scroll || false);
            const { content, pageCount } = await fetchAndCleanContent(knowledge.url, {
                scrapeMethod: knowledge.scrape_method || "basic",
                crawlDepth: knowledge.crawl_depth || 1,
                excludePatterns: knowledge.exclude_patterns || undefined,
                infiniteScroll: knowledge.infinite_scroll || false,
                scrollCount: knowledge.scroll_count || 5,
            });
            
            if (!content || content.length < 100) {
                throw new Error("Not enough content to index");
            }

            console.log("[Indexing] Fetched", pageCount, "page(s), total content length:", content.length);

            // Chunk the content
            console.log("[Indexing] Chunking content...");
            const chunks = chunkText(content);
            console.log("[Indexing] Created", chunks.length, "chunks");

            if (chunks.length === 0) {
                throw new Error("No valid chunks created");
            }

            // Delete any existing chunks for this knowledge item
            await supabase
                .from("shout_knowledge_chunks")
                .delete()
                .eq("knowledge_id", knowledgeId);

            // Generate embeddings and store chunks
            const chunkInserts = [];
            let firstEmbeddingError: string | null = null;
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                console.log(`[Indexing] Generating embedding for chunk ${i + 1}/${chunks.length}`);
                try {
                    const embedding = await generateEmbedding(chunk);
                    if (embedding) {
                        chunkInserts.push({
                            knowledge_id: knowledgeId,
                            agent_id: agentId,
                            chunk_index: i,
                            content: chunk,
                            embedding: `[${embedding.join(",")}]`, // Format for pgvector
                            token_count: Math.ceil(chunk.length / 4), // Rough estimate
                        });
                    }
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (!firstEmbeddingError) firstEmbeddingError = msg;
                    console.error("[Indexing] Embedding failed for chunk", i + 1, err);
                }
                // Rate limiting - wait between embeddings
                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            if (chunkInserts.length === 0) {
                const detail = firstEmbeddingError
                    ? ` Gemini error: ${firstEmbeddingError}`
                    : " Check that GOOGLE_GEMINI_API_KEY is set and valid.";
                throw new Error(`Failed to generate any embeddings.${detail}`);
            }

            // Insert chunks in batches
            const batchSize = 50;
            for (let i = 0; i < chunkInserts.length; i += batchSize) {
                const batch = chunkInserts.slice(i, i + batchSize);
                const { error: insertError } = await supabase
                    .from("shout_knowledge_chunks")
                    .insert(batch);
                
                if (insertError) {
                    console.error("[Indexing] Error inserting chunks:", insertError);
                    throw new Error("Failed to store embeddings");
                }
            }

            // Update knowledge item as indexed with sync timestamp
            await supabase.rpc("update_knowledge_indexed", {
                p_knowledge_id: knowledgeId,
                p_chunk_count: chunkInserts.length,
            });

            // Update last_synced_at for auto-sync tracking
            await supabase
                .from("shout_agent_knowledge")
                .update({ last_synced_at: new Date().toISOString() })
                .eq("id", knowledgeId);

            console.log("[Indexing] Successfully indexed", chunkInserts.length, "chunks");

            return NextResponse.json({
                success: true,
                chunksIndexed: chunkInserts.length,
                pagesScraped: pageCount,
            });

        } catch (indexError) {
            // Update knowledge item as failed
            const errorMessage = indexError instanceof Error ? indexError.message : "Unknown error";
            await supabase.rpc("update_knowledge_failed", {
                p_knowledge_id: knowledgeId,
                p_error_message: errorMessage,
            });

            throw indexError;
        }

    } catch (error) {
        console.error("[Indexing] Error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json(
            { error: `Failed to index: ${errorMessage}` },
            { status: 500 }
        );
    }
}

