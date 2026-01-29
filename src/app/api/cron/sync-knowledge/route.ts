/**
 * Cron Job: Auto-sync Knowledge Sources
 * 
 * Automatically re-indexes knowledge sources that have auto_sync enabled.
 * Only processes official agents to manage costs.
 * 
 * Called by Vercel Cron (see vercel.json):
 * - Default: Every 6 hours
 * - Checks each source's individual sync_interval_hours
 * 
 * Can also be triggered manually via POST for testing.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { fetchContent, isFirecrawlConfigured } from "@/lib/firecrawl";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

const CRON_SECRET = process.env.CRON_SECRET;

// Chunk text into smaller pieces for embedding
function chunkText(text: string, maxChunkSize: number = 1000, overlap: number = 100): string[] {
    const chunks: string[] = [];
    let start = 0;
    
    while (start < text.length) {
        let end = start + maxChunkSize;
        
        if (end < text.length) {
            const lastPeriod = text.lastIndexOf(".", end);
            const lastNewline = text.lastIndexOf("\n", end);
            const breakPoint = Math.max(lastPeriod, lastNewline);
            
            if (breakPoint > start + maxChunkSize / 2) {
                end = breakPoint + 1;
            }
        }
        
        const chunk = text.slice(start, end).trim();
        if (chunk.length > 50) {
            chunks.push(chunk);
        }
        
        start = end - overlap;
        if (start < 0) start = 0;
    }
    
    return chunks;
}

// Generate embedding using Gemini
async function generateEmbedding(text: string): Promise<number[] | null> {
    if (!ai) return null;
    
    try {
        const result = await ai.models.embedContent({
            model: "text-embedding-004",
            contents: text,
        });
        
        return result.embeddings?.[0]?.values || null;
    } catch (error) {
        console.error("[Sync] Error generating embedding:", error);
        return null;
    }
}

// Reindex a single knowledge item
async function reindexKnowledgeItem(
    knowledgeId: string,
    agentId: string,
    url: string,
    options: {
        scrapeMethod?: string;
        crawlDepth?: number;
        excludePatterns?: string[];
    }
): Promise<{ success: boolean; chunksIndexed: number; error?: string }> {
    if (!supabase || !ai) {
        return { success: false, chunksIndexed: 0, error: "Services not configured" };
    }

    try {
        console.log("[Sync] Reindexing:", url);

        // Update status to processing
        await supabase
            .from("shout_agent_knowledge")
            .update({ status: "processing" })
            .eq("id", knowledgeId);

        // Fetch content
        let content: string;
        let pageCount = 1;

        if (options.scrapeMethod === "firecrawl" && isFirecrawlConfigured()) {
            const result = await fetchContent(url, {
                crawlDepth: options.crawlDepth || 1,
                excludePatterns: options.excludePatterns,
                maxPages: 50,
            });
            content = result.content;
            pageCount = result.pageCount;
        } else {
            // Basic fetch
            const response = await fetch(url, {
                headers: { "User-Agent": "Mozilla/5.0 (compatible; SpritzBot/1.0)" },
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            // Basic HTML cleaning
            content = html
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim();
        }

        if (!content || content.length < 100) {
            throw new Error("Not enough content");
        }

        // Chunk the content
        const chunks = chunkText(content);
        if (chunks.length === 0) {
            throw new Error("No valid chunks");
        }

        // Delete existing chunks
        await supabase
            .from("shout_knowledge_chunks")
            .delete()
            .eq("knowledge_id", knowledgeId);

        // Generate embeddings and store
        const chunkInserts = [];
        for (let i = 0; i < chunks.length; i++) {
            const embedding = await generateEmbedding(chunks[i]);
            if (embedding) {
                chunkInserts.push({
                    knowledge_id: knowledgeId,
                    agent_id: agentId,
                    chunk_index: i,
                    content: chunks[i],
                    embedding: `[${embedding.join(",")}]`,
                    token_count: Math.ceil(chunks[i].length / 4),
                });
            }
            // Rate limiting
            if (i < chunks.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        if (chunkInserts.length === 0) {
            throw new Error("Failed to generate embeddings");
        }

        // Insert in batches
        const batchSize = 50;
        for (let i = 0; i < chunkInserts.length; i += batchSize) {
            const batch = chunkInserts.slice(i, i + batchSize);
            await supabase.from("shout_knowledge_chunks").insert(batch);
        }

        // Update knowledge item
        await supabase
            .from("shout_agent_knowledge")
            .update({
                status: "indexed",
                chunk_count: chunkInserts.length,
                last_synced_at: new Date().toISOString(),
                error_message: null,
            })
            .eq("id", knowledgeId);

        console.log("[Sync] Successfully indexed", chunkInserts.length, "chunks for", url);
        return { success: true, chunksIndexed: chunkInserts.length };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("[Sync] Error indexing", url, ":", errorMessage);

        await supabase
            ?.from("shout_agent_knowledge")
            .update({
                status: "failed",
                error_message: errorMessage,
            })
            .eq("id", knowledgeId);

        return { success: false, chunksIndexed: 0, error: errorMessage };
    }
}

// GET: Cron-triggered auto-sync
export async function GET(request: NextRequest) {
    // Verify cron secret (Vercel sends this header)
    const authHeader = request.headers.get("authorization");
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    console.log("[Sync] Starting auto-sync cron job...");

    try {
        // Find knowledge items that need syncing (official agents only)
        const { data: sources, error } = await supabase
            .from("shout_agent_knowledge")
            .select(`
                id, 
                agent_id, 
                url, 
                scrape_method, 
                crawl_depth, 
                exclude_patterns,
                sync_interval_hours,
                last_synced_at,
                shout_agents!inner(visibility)
            `)
            .eq("auto_sync", true)
            .eq("shout_agents.visibility", "official");

        if (error) {
            console.error("[Sync] Error fetching sources:", error);
            return NextResponse.json({ error: "Failed to fetch sources" }, { status: 500 });
        }

        // Filter sources that need syncing based on their interval
        const now = new Date();
        const needsSync = (sources || []).filter(source => {
            if (!source.last_synced_at) return true;
            const lastSync = new Date(source.last_synced_at);
            const intervalMs = (source.sync_interval_hours || 24) * 60 * 60 * 1000;
            return now.getTime() - lastSync.getTime() > intervalMs;
        });

        console.log("[Sync] Found", needsSync.length, "sources needing sync");

        const results = {
            total: needsSync.length,
            successful: 0,
            failed: 0,
            details: [] as { url: string; success: boolean; chunks?: number; error?: string }[],
        };

        // Process each source
        for (const source of needsSync) {
            const result = await reindexKnowledgeItem(
                source.id,
                source.agent_id,
                source.url,
                {
                    scrapeMethod: source.scrape_method,
                    crawlDepth: source.crawl_depth,
                    excludePatterns: source.exclude_patterns,
                }
            );

            if (result.success) {
                results.successful++;
            } else {
                results.failed++;
            }

            results.details.push({
                url: source.url,
                success: result.success,
                chunks: result.chunksIndexed,
                error: result.error,
            });

            // Add delay between sources to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log("[Sync] Completed:", results.successful, "successful,", results.failed, "failed");

        return NextResponse.json({
            message: "Sync completed",
            results,
        });

    } catch (error) {
        console.error("[Sync] Error:", error);
        return NextResponse.json({ error: "Sync failed" }, { status: 500 });
    }
}

// POST: Manual trigger (admin only)
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { userAddress, knowledgeId, agentId } = body;

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Verify admin status
        const { data: adminData } = await supabase
            .from("shout_admins")
            .select("wallet_address")
            .eq("wallet_address", normalizedAddress)
            .single();

        // If not admin, verify ownership
        if (!adminData) {
            if (!agentId) {
                return NextResponse.json({ error: "Agent ID required for non-admins" }, { status: 400 });
            }

            const { data: agent } = await supabase
                .from("shout_agents")
                .select("owner_address")
                .eq("id", agentId)
                .single();

            if (!agent || agent.owner_address !== normalizedAddress) {
                return NextResponse.json({ error: "Access denied" }, { status: 403 });
            }
        }

        // If specific knowledge ID provided, sync just that item
        if (knowledgeId) {
            const { data: knowledge } = await supabase
                .from("shout_agent_knowledge")
                .select("*")
                .eq("id", knowledgeId)
                .single();

            if (!knowledge) {
                return NextResponse.json({ error: "Knowledge item not found" }, { status: 404 });
            }

            const result = await reindexKnowledgeItem(
                knowledge.id,
                knowledge.agent_id,
                knowledge.url,
                {
                    scrapeMethod: knowledge.scrape_method,
                    crawlDepth: knowledge.crawl_depth,
                    excludePatterns: knowledge.exclude_patterns,
                }
            );

            return NextResponse.json({
                success: result.success,
                chunksIndexed: result.chunksIndexed,
                error: result.error,
            });
        }

        // If agent ID provided, sync all knowledge for that agent
        if (agentId) {
            const { data: items } = await supabase
                .from("shout_agent_knowledge")
                .select("*")
                .eq("agent_id", agentId);

            const results = [];
            for (const item of items || []) {
                const result = await reindexKnowledgeItem(
                    item.id,
                    item.agent_id,
                    item.url,
                    {
                        scrapeMethod: item.scrape_method,
                        crawlDepth: item.crawl_depth,
                        excludePatterns: item.exclude_patterns,
                    }
                );
                results.push({ url: item.url, ...result });
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            return NextResponse.json({
                message: "Sync completed",
                results,
            });
        }

        return NextResponse.json({ error: "Provide knowledgeId or agentId" }, { status: 400 });

    } catch (error) {
        console.error("[Sync] Manual sync error:", error);
        return NextResponse.json({ error: "Sync failed" }, { status: 500 });
    }
}
