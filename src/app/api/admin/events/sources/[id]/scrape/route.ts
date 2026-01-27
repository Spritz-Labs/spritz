import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { fetchContent, isFirecrawlConfigured } from "@/lib/firecrawl";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

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

// Verify admin signature from headers
async function verifyAdmin(request: NextRequest): Promise<{ isAdmin: boolean; address: string | null }> {
    const address = request.headers.get("x-admin-address");
    const signature = request.headers.get("x-admin-signature");
    const encodedMessage = request.headers.get("x-admin-message");

    if (!address || !signature || !encodedMessage || !supabase) {
        return { isAdmin: false, address: null };
    }

    const normalizedAddress = address.toLowerCase();
    const { data: admin } = await supabase
        .from("shout_admins")
        .select("wallet_address")
        .eq("wallet_address", normalizedAddress)
        .single();

    return { isAdmin: !!admin, address: normalizedAddress };
}

// POST: Manually trigger scrape for a specific source
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    if (!ai) {
        return NextResponse.json({ error: "AI not configured" }, { status: 500 });
    }

    if (!isFirecrawlConfigured()) {
        return NextResponse.json({ error: "Firecrawl not configured" }, { status: 500 });
    }

    const { isAdmin, address } = await verifyAdmin(request);
    if (!isAdmin || !address) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        // Get the source
        const { data: source, error: sourceError } = await supabase
            .from("shout_event_sources")
            .select("*")
            .eq("id", id)
            .single();

        if (sourceError || !source) {
            return NextResponse.json({ error: "Source not found" }, { status: 404 });
        }

        console.log("[Event Scrape] Manual scrape triggered for:", source.url);

        // Scrape the URL using Firecrawl
        const result = await fetchContent(source.url, {
            crawlDepth: 2,
            maxPages: 20,
        });

        if (!result.content || result.content.length < 100) {
            await supabase
                .from("shout_event_sources")
                .update({
                    last_error: "Not enough content found",
                    last_scraped_at: new Date().toISOString(),
                })
                .eq("id", id);
            return NextResponse.json({ error: "Not enough content found" }, { status: 400 });
        }

        // Use AI to extract events from the content
        const eventTypesFilter = source.event_types?.length > 0 
            ? `Only include events of these types: ${source.event_types.join(", ")}` 
            : "";
        const blockchainFilter = source.blockchain_focus?.length > 0 
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
            await supabase
                .from("shout_event_sources")
                .update({
                    last_error: "Could not extract events from content",
                    last_scraped_at: new Date().toISOString(),
                })
                .eq("id", id);
            return NextResponse.json({ error: "Could not extract events from content" }, { status: 400 });
        }

        let extractedEvents: ExtractedEvent[];
        try {
            extractedEvents = JSON.parse(jsonMatch[0]);
        } catch {
            await supabase
                .from("shout_event_sources")
                .update({
                    last_error: "Failed to parse extracted events",
                    last_scraped_at: new Date().toISOString(),
                })
                .eq("id", id);
            return NextResponse.json({ error: "Failed to parse extracted events" }, { status: 400 });
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
                        created_by: address,
                    });

                if (insertError) {
                    if (insertError.code === "23505") {
                        skipped++; // Duplicate
                    } else {
                        console.error("[Event Scrape] Insert error:", insertError);
                        skipped++;
                    }
                } else {
                    inserted++;
                }
            } catch (err) {
                console.error("[Event Scrape] Error inserting event:", err);
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
                events_found: (source.events_found || 0) + inserted,
                last_error: null,
            })
            .eq("id", id);

        return NextResponse.json({
            success: true,
            extracted: extractedEvents.length,
            inserted,
            skipped,
        });
    } catch (error) {
        console.error("[Event Scrape] Error:", error);
        
        await supabase
            .from("shout_event_sources")
            .update({
                last_error: error instanceof Error ? error.message : "Unknown error",
                last_scraped_at: new Date().toISOString(),
            })
            .eq("id", id);

        return NextResponse.json({ 
            error: "Failed to scrape events",
            details: error instanceof Error ? error.message : "Unknown error"
        }, { status: 500 });
    }
}
