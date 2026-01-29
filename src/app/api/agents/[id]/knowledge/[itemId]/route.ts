/**
 * API: Update/Delete a specific knowledge item
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// PATCH: Update knowledge item settings
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; itemId: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { id: agentId, itemId } = await params;

    try {
        const body = await request.json();
        const { 
            userAddress, 
            scrape_method, 
            crawl_depth, 
            auto_sync, 
            sync_interval_hours, 
            exclude_patterns 
        } = body;

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Verify agent ownership or admin status
        const { data: agent, error: agentError } = await supabase
            .from("shout_agents")
            .select("owner_address, visibility")
            .eq("id", agentId)
            .single();

        if (agentError || !agent) {
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        // Check admin status for official agents
        const { data: adminData } = await supabase
            .from("shout_admins")
            .select("wallet_address")
            .eq("wallet_address", normalizedAddress)
            .single();

        const isOwner = agent.owner_address === normalizedAddress;
        const isAdmin = !!adminData;

        if (!isOwner && !isAdmin) {
            return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }

        // Verify the knowledge item belongs to this agent
        const { data: knowledgeItem, error: itemError } = await supabase
            .from("shout_agent_knowledge")
            .select("id, agent_id")
            .eq("id", itemId)
            .eq("agent_id", agentId)
            .single();

        if (itemError || !knowledgeItem) {
            return NextResponse.json({ error: "Knowledge item not found" }, { status: 404 });
        }

        // Build update object
        const updates: Record<string, unknown> = {};
        
        if (scrape_method !== undefined) {
            updates.scrape_method = scrape_method;
        }
        if (crawl_depth !== undefined) {
            updates.crawl_depth = Math.min(Math.max(1, crawl_depth), 10);
        }
        if (auto_sync !== undefined) {
            updates.auto_sync = auto_sync;
        }
        if (sync_interval_hours !== undefined) {
            // Validate interval (min 1 hour, max 168 hours = 1 week)
            updates.sync_interval_hours = Math.min(Math.max(1, sync_interval_hours), 168);
        }
        if (exclude_patterns !== undefined) {
            updates.exclude_patterns = Array.isArray(exclude_patterns) ? exclude_patterns : [];
        }

        // Update the knowledge item
        const { data: updated, error: updateError } = await supabase
            .from("shout_agent_knowledge")
            .update(updates)
            .eq("id", itemId)
            .select()
            .single();

        if (updateError) {
            console.error("[Knowledge] Update error:", updateError);
            return NextResponse.json({ error: "Failed to update" }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            item: updated 
        });

    } catch (error) {
        console.error("[Knowledge] Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
