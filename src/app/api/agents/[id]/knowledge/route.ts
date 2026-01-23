import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export type KnowledgeItem = {
    id: string;
    agent_id: string;
    title: string;
    url: string;
    content_type: "webpage" | "github" | "docs";
    status: "pending" | "processing" | "indexed" | "failed";
    error_message: string | null;
    chunk_count: number;
    created_at: string;
    indexed_at: string | null;
};

// Detect content type from URL
function detectContentType(url: string): "webpage" | "github" | "docs" {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes("github.com")) return "github";
    if (lowerUrl.includes("docs.") || lowerUrl.includes("/docs/") || lowerUrl.includes("documentation")) return "docs";
    return "webpage";
}

// Extract title from URL
function extractTitleFromUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split("/").filter(Boolean);
        if (pathParts.length > 0) {
            // For GitHub repos, use "owner/repo" format
            if (urlObj.hostname === "github.com" && pathParts.length >= 2) {
                return `${pathParts[0]}/${pathParts[1]}`;
            }
            return pathParts[pathParts.length - 1].replace(/[-_]/g, " ");
        }
        return urlObj.hostname;
    } catch {
        return url.slice(0, 50);
    }
}

// GET: List knowledge items for an agent
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

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        // Verify agent ownership
        const { data: agent } = await supabase
            .from("shout_agents")
            .select("owner_address")
            .eq("id", id)
            .single();

        if (!agent || agent.owner_address !== userAddress.toLowerCase()) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Get knowledge items
        const { data: items, error } = await supabase
            .from("shout_agent_knowledge")
            .select("*")
            .eq("agent_id", id)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("[Knowledge] Error fetching items:", error);
            return NextResponse.json({ error: "Failed to fetch knowledge items" }, { status: 500 });
        }

        return NextResponse.json({ items: items || [] });
    } catch (error) {
        console.error("[Knowledge] Error:", error);
        return NextResponse.json({ error: "Failed to fetch knowledge items" }, { status: 500 });
    }
}

// POST: Add a new knowledge item (URL)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const { id } = await params;
        const body = await request.json();
        const { 
            userAddress, 
            url, 
            title,
            // Firecrawl options (for official agents)
            scrapeMethod,
            crawlDepth,
            autoSync,
            syncIntervalHours,
            excludePatterns,
        } = body;

        if (!userAddress || !url) {
            return NextResponse.json({ error: "User address and URL are required" }, { status: 400 });
        }

        // Validate URL
        try {
            new URL(url);
        } catch {
            return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Verify agent ownership and get agent details
        const { data: agent } = await supabase
            .from("shout_agents")
            .select("owner_address, visibility")
            .eq("id", id)
            .single();

        if (!agent || agent.owner_address !== normalizedAddress) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Check if user is admin (for Firecrawl features)
        const { data: adminData } = await supabase
            .from("shout_admins")
            .select("wallet_address")
            .eq("wallet_address", normalizedAddress)
            .single();
        const isAdmin = !!adminData;

        // Only allow Firecrawl features for official agents or admins
        const canUseFirecrawl = isAdmin || agent.visibility === "official";

        // Check limit (max 10 URLs per agent for regular users, 50 for official)
        const maxItems = agent.visibility === "official" ? 50 : 10;
        const { count } = await supabase
            .from("shout_agent_knowledge")
            .select("*", { count: "exact", head: true })
            .eq("agent_id", id);

        if ((count || 0) >= maxItems) {
            return NextResponse.json({ error: `Maximum of ${maxItems} knowledge items per agent` }, { status: 400 });
        }

        // Detect content type and generate title
        const contentType = detectContentType(url);
        const itemTitle = title || extractTitleFromUrl(url);

        // Build insert object
        const insertData: Record<string, unknown> = {
            agent_id: id,
            url: url.trim(),
            title: itemTitle,
            content_type: contentType,
            status: "pending",
        };

        // Add Firecrawl options if allowed
        if (canUseFirecrawl) {
            if (scrapeMethod === "firecrawl") {
                insertData.scrape_method = "firecrawl";
            }
            if (crawlDepth && crawlDepth > 0) {
                insertData.crawl_depth = Math.min(crawlDepth, 5); // Max depth 5
            }
            if (autoSync !== undefined) {
                insertData.auto_sync = autoSync;
            }
            if (syncIntervalHours && syncIntervalHours > 0) {
                insertData.sync_interval_hours = Math.max(1, Math.min(syncIntervalHours, 168)); // 1 hour to 7 days
            }
            if (excludePatterns && Array.isArray(excludePatterns)) {
                insertData.exclude_patterns = excludePatterns.slice(0, 20); // Max 20 patterns
            }
        }

        // Insert knowledge item
        const { data: item, error } = await supabase
            .from("shout_agent_knowledge")
            .insert(insertData)
            .select()
            .single();

        if (error) {
            if (error.code === "23505") {
                return NextResponse.json({ error: "This URL is already added to this agent" }, { status: 400 });
            }
            console.error("[Knowledge] Error adding item:", error);
            return NextResponse.json({ error: "Failed to add knowledge item" }, { status: 500 });
        }

        // TODO: Trigger async indexing job here (Vertex AI)
        // For now, items remain in "pending" status

        return NextResponse.json({ item });
    } catch (error) {
        console.error("[Knowledge] Error:", error);
        return NextResponse.json({ error: "Failed to add knowledge item" }, { status: 500 });
    }
}

// DELETE: Remove a knowledge item
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
        const itemId = searchParams.get("itemId");

        if (!userAddress || !itemId) {
            return NextResponse.json({ error: "User address and item ID are required" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Verify agent ownership
        const { data: agent } = await supabase
            .from("shout_agents")
            .select("owner_address")
            .eq("id", id)
            .single();

        if (!agent || agent.owner_address !== normalizedAddress) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Delete the item
        const { error } = await supabase
            .from("shout_agent_knowledge")
            .delete()
            .eq("id", itemId)
            .eq("agent_id", id);

        if (error) {
            console.error("[Knowledge] Error deleting item:", error);
            return NextResponse.json({ error: "Failed to delete knowledge item" }, { status: 500 });
        }

        // TODO: Remove from Vertex AI vector store

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Knowledge] Error:", error);
        return NextResponse.json({ error: "Failed to delete knowledge item" }, { status: 500 });
    }
}

