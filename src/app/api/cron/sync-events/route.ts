/**
 * Cron Job: Auto-sync Event Sources
 * 
 * Automatically scrapes event sources that have is_active enabled.
 * Checks each source's individual scrape_interval_hours to determine if it needs scraping.
 * 
 * Called by Vercel Cron (see vercel.json):
 * - Default: Every 6 hours
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

interface ExtractedEvent {
    name: string;
    description?: string;
    event_type: string;
    event_date: string;
    start_time?: string;
    end_time?: string;
    venue?: string;
    city?: string;
    country?: string;
    organizer?: string;
    event_url?: string;
    rsvp_url?: string;
    tags?: string[];
    blockchain_focus?: string[];
}

interface EventSource {
    id: string;
    url: string;
    event_types: string[] | null;
    blockchain_focus: string[] | null;
    scrape_interval_hours: number;
    last_scraped_at: string | null;
    created_by: string;
}

// Scrape a single event source
async function scrapeSource(source: EventSource): Promise<{ 
    success: boolean; 
    extracted: number; 
    inserted: number; 
    skipped: number;
    error?: string;
}> {
    if (!supabase || !ai) {
        return { success: false, extracted: 0, inserted: 0, skipped: 0, error: "Services not configured" };
    }

    try {
        console.log("[Event Sync] Scraping:", source.url);

        // Scrape the URL using Firecrawl
        const result = await fetchContent(source.url, {
            crawlDepth: 2,
            maxPages: 20,
        });

        if (!result.content || result.content.length < 100) {
            throw new Error("Not enough content found");
        }

        // Build AI prompt
        const eventTypesFilter = source.event_types?.length 
            ? `Only include events of these types: ${source.event_types.join(", ")}` 
            : "";
        const blockchainFilter = source.blockchain_focus?.length 
            ? `Only include events focused on: ${source.blockchain_focus.join(", ")}` 
            : "";

        const prompt = `Extract all blockchain/crypto events from the following content. 
For each event, provide:
- name (required)
- description (brief)
- event_type (one of: conference, hackathon, meetup, workshop, summit, party, networking, other)
- event_date (YYYY-MM-DD format, required)
- start_time (HH:MM 24h format)
- end_time (HH:MM 24h format)
- venue (name of venue)
- city
- country
- organizer
- event_url (link to event page)
- rsvp_url (link to register)
- tags (array of relevant tags)
- blockchain_focus (array of blockchain names like 'ethereum', 'solana', 'bitcoin', etc.)

${eventTypesFilter}
${blockchainFilter}

Return ONLY a valid JSON array of events, no other text. Example:
[{"name": "ETHDenver", "event_type": "hackathon", "event_date": "2026-02-23", ...}]

Content to analyze:
${result.content.substring(0, 50000)}`;

        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { maxOutputTokens: 8192 },
        });

        const responseText = response.text || "";

        // Parse the JSON response
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            throw new Error("Could not extract events from content");
        }

        let extractedEvents: ExtractedEvent[];
        try {
            extractedEvents = JSON.parse(jsonMatch[0]);
        } catch {
            throw new Error("Failed to parse extracted events");
        }

        // Insert events into database
        let inserted = 0;
        let skipped = 0;

        for (const event of extractedEvents) {
            if (!event.name || !event.event_date || !event.event_type) {
                skipped++;
                continue;
            }

            const sourceId = `${source.url}-${event.name}-${event.event_date}`.replace(/[^a-zA-Z0-9-]/g, "-");

            try {
                const { error: insertError } = await supabase
                    .from("shout_events")
                    .insert({
                        name: event.name,
                        description: event.description || null,
                        event_type: event.event_type,
                        event_date: event.event_date,
                        start_time: event.start_time || null,
                        end_time: event.end_time || null,
                        venue: event.venue || null,
                        city: event.city || null,
                        country: event.country || null,
                        organizer: event.organizer || null,
                        event_url: event.event_url || null,
                        rsvp_url: event.rsvp_url || null,
                        tags: event.tags || [],
                        blockchain_focus: event.blockchain_focus || null,
                        source: "firecrawl",
                        source_url: source.url,
                        source_id: sourceId,
                        status: "draft",
                        created_by: source.created_by,
                    });

                if (insertError) {
                    if (insertError.code === "23505") {
                        skipped++; // Duplicate
                    } else {
                        skipped++;
                    }
                } else {
                    inserted++;
                }
            } catch {
                skipped++;
            }
        }

        // Update source with results
        const nextScrapeAt = new Date();
        nextScrapeAt.setHours(nextScrapeAt.getHours() + (source.scrape_interval_hours || 24));

        await supabase
            .from("shout_event_sources")
            .update({
                last_scraped_at: new Date().toISOString(),
                next_scrape_at: nextScrapeAt.toISOString(),
                events_found: inserted,
                last_error: null,
            })
            .eq("id", source.id);

        return {
            success: true,
            extracted: extractedEvents.length,
            inserted,
            skipped,
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("[Event Sync] Error scraping", source.url, ":", errorMessage);

        await supabase
            ?.from("shout_event_sources")
            .update({
                last_error: errorMessage,
                last_scraped_at: new Date().toISOString(),
            })
            .eq("id", source.id);

        return { success: false, extracted: 0, inserted: 0, skipped: 0, error: errorMessage };
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

    if (!ai) {
        return NextResponse.json({ error: "AI not configured" }, { status: 500 });
    }

    if (!isFirecrawlConfigured()) {
        return NextResponse.json({ error: "Firecrawl not configured" }, { status: 500 });
    }

    console.log("[Event Sync] Starting auto-sync cron job...");

    try {
        // Find active sources that need syncing
        const { data: sources, error } = await supabase
            .from("shout_event_sources")
            .select("*")
            .eq("is_active", true);

        if (error) {
            console.error("[Event Sync] Error fetching sources:", error);
            return NextResponse.json({ error: "Failed to fetch sources" }, { status: 500 });
        }

        // Filter sources that need syncing based on their interval
        const now = new Date();
        const needsSync = (sources || []).filter(source => {
            if (!source.last_scraped_at) return true;
            const lastSync = new Date(source.last_scraped_at);
            const intervalMs = (source.scrape_interval_hours || 24) * 60 * 60 * 1000;
            return now.getTime() - lastSync.getTime() > intervalMs;
        });

        console.log("[Event Sync] Found", needsSync.length, "sources needing sync out of", sources?.length || 0, "active");

        const results = {
            total: needsSync.length,
            successful: 0,
            failed: 0,
            totalExtracted: 0,
            totalInserted: 0,
            details: [] as { url: string; success: boolean; extracted?: number; inserted?: number; error?: string }[],
        };

        // Process each source
        for (const source of needsSync) {
            const result = await scrapeSource(source);

            if (result.success) {
                results.successful++;
                results.totalExtracted += result.extracted;
                results.totalInserted += result.inserted;
            } else {
                results.failed++;
            }

            results.details.push({
                url: source.url,
                success: result.success,
                extracted: result.extracted,
                inserted: result.inserted,
                error: result.error,
            });

            // Add delay between sources to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log("[Event Sync] Completed:", results.successful, "successful,", results.failed, "failed,", results.totalInserted, "events inserted");

        return NextResponse.json({
            message: "Event sync completed",
            results,
        });

    } catch (error) {
        console.error("[Event Sync] Error:", error);
        return NextResponse.json({ error: "Sync failed" }, { status: 500 });
    }
}
