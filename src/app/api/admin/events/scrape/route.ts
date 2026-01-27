import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { fetchContent, isFirecrawlConfigured } from "@/lib/firecrawl";
import crypto from "crypto";

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
    image_url?: string;
    tags?: string[];
    blockchain_focus?: string[];
}

// Normalize event name for comparison (removes special chars, lowercase)
function normalizeEventName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[''`]/g, "") // Remove apostrophes
        .replace(/[^\w\s]/g, " ") // Replace special chars with space
        .replace(/\s+/g, " ") // Collapse multiple spaces
        .trim();
}

// Generate a fingerprint for duplicate detection
function generateEventFingerprint(event: { name: string; event_date: string; city?: string }): string {
    const normalized = normalizeEventName(event.name);
    const date = event.event_date;
    const city = event.city?.toLowerCase().trim() || "";
    return `${normalized}|${date}|${city}`;
}

// Calculate content hash for change detection
function hashContent(content: string): string {
    return crypto.createHash("md5").update(content).digest("hex");
}

// Batch geocoding with caching and rate limiting
const geocodeCache = new Map<string, { lat: number; lon: number } | null>();

async function batchGeocodeLocations(locations: string[]): Promise<Map<string, { lat: number; lon: number } | null>> {
    const results = new Map<string, { lat: number; lon: number } | null>();
    const uniqueLocations = [...new Set(locations.filter(Boolean))];
    
    for (const location of uniqueLocations) {
        // Check cache first
        if (geocodeCache.has(location)) {
            results.set(location, geocodeCache.get(location)!);
            continue;
        }
        
        try {
            const query = encodeURIComponent(location);
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
                headers: { "User-Agent": "Spritz-Events/1.0" }
            });
            const data = await res.json();
            
            if (data && data[0]) {
                const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
                geocodeCache.set(location, coords);
                results.set(location, coords);
            } else {
                geocodeCache.set(location, null);
                results.set(location, null);
            }
            
            // Rate limit: 1 request per second for Nominatim
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error("[Geocode] Error for", location, error);
            results.set(location, null);
        }
    }
    
    return results;
}

// Check if event date is in the past
function isEventPast(dateStr: string): boolean {
    const eventDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return eventDate < today;
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

// POST: Scrape events from a URL using Firecrawl + AI extraction
export async function POST(request: NextRequest) {
    console.log("[Event Scrape] ========== SCRAPE REQUEST STARTED ==========");
    console.log("[Event Scrape] Timestamp:", new Date().toISOString());
    
    if (!supabase) {
        console.error("[Event Scrape] ERROR: Database not configured");
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    if (!ai) {
        console.error("[Event Scrape] ERROR: AI not configured");
        return NextResponse.json({ error: "AI not configured" }, { status: 500 });
    }

    if (!isFirecrawlConfigured()) {
        console.error("[Event Scrape] ERROR: Firecrawl not configured");
        return NextResponse.json({ error: "Firecrawl not configured" }, { status: 500 });
    }

    console.log("[Event Scrape] All services configured, verifying admin...");
    const { isAdmin, address } = await verifyAdmin(request);
    if (!isAdmin || !address) {
        console.error("[Event Scrape] ERROR: Unauthorized - isAdmin:", isAdmin, "address:", address);
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.log("[Event Scrape] Admin verified:", address);

    try {
        console.log("[Event Scrape] Parsing request body...");
        const body = await request.json();
        console.log("[Event Scrape] Request body keys:", Object.keys(body));
        const { 
            url, 
            event_types, 
            blockchain_focus, 
            save_source,
            scrape_interval_hours = 24,
            source_type = "event_calendar",
            crawl_depth = 2,
            max_pages = 20,
            infinite_scroll = false,
            scroll_count = 5,
            preview_only = false,
            events_to_save,
            skip_past_events = false, // Default to false - let user decide
            skip_if_unchanged = false, // Default to false - always extract to catch new events
        } = body;

        if (!url) {
            console.error("[Event Scrape] ERROR: URL is required");
            return NextResponse.json({ error: "URL is required" }, { status: 400 });
        }
        
        console.log("[Event Scrape] Scraping URL:", url);
        console.log("[Event Scrape] Options:", {
            crawl_depth: crawl_depth,
            max_pages: max_pages,
            infinite_scroll: infinite_scroll,
            scroll_count: scroll_count,
            skip_past_events: skip_past_events,
            skip_if_unchanged: skip_if_unchanged,
            preview_only: preview_only,
        });

        // If events_to_save is provided, skip scraping and just save
        let extractedEvents: ExtractedEvent[];
        let pageCount = 1;
        let contentHash = "";
        let skippedPast = 0;
        let sourceUrl = url; // Store URL for later use

        if (events_to_save && Array.isArray(events_to_save)) {
            // Direct save from preview selection
            console.log("[Event Scrape] Mode: Saving pre-selected events");
            console.log("[Event Scrape] Events to save count:", events_to_save.length);
            extractedEvents = events_to_save.map((e: ExtractedEvent & { type?: string; start_date?: string }) => ({
                ...e,
                event_type: e.event_type || e.type || "other",
                event_date: e.event_date || e.start_date || new Date().toISOString().split("T")[0],
            }));
            console.log("[Event Scrape] Mapped", extractedEvents.length, "events for saving");
            
            // For preview saves, try to get URL from first event's metadata or use a default
            if (!sourceUrl && extractedEvents.length > 0) {
                sourceUrl = extractedEvents[0].event_url || "preview";
            }
        } else {
            console.log("[Event Scrape] Mode: Full scrape from URL");
            console.log("[Event Scrape] Calling fetchContent with:", {
                url,
                crawlDepth: crawl_depth,
                maxPages: max_pages,
                infiniteScroll: infinite_scroll,
                scrollCount: scroll_count,
            });

            // Scrape the URL using Firecrawl
            let result;
            try {
                result = await fetchContent(url, {
                    crawlDepth: crawl_depth,
                    maxPages: max_pages,
                    infiniteScroll: infinite_scroll,
                    scrollCount: scroll_count,
                });
                console.log("[Event Scrape] fetchContent completed successfully");
            } catch (fetchError) {
                console.error("[Event Scrape] fetchContent ERROR:", fetchError);
                throw new Error(`Failed to fetch content: ${fetchError instanceof Error ? fetchError.message : "Unknown error"}`);
            }

            if (!result.content || result.content.length < 100) {
                return NextResponse.json({ error: "Not enough content found" }, { status: 400 });
            }

            pageCount = result.pageCount;
            contentHash = hashContent(result.content);
            console.log("[Event Scrape] Fetched content, length:", result.content.length, "hash:", contentHash);

            // Check if content has changed since last scrape (skip if unchanged)
            if (skip_if_unchanged && !preview_only) {
                const { data: existingSource } = await supabase
                    .from("shout_event_sources")
                    .select("content_hash")
                    .eq("url", url)
                    .single();
                
                if (existingSource?.content_hash === contentHash) {
                    console.log("[Event Scrape] Content unchanged, skipping extraction");
                    return NextResponse.json({
                        success: true,
                        unchanged: true,
                        message: "Page content has not changed since last scrape",
                        extracted: 0,
                        inserted: 0,
                        skipped: 0,
                    });
                }
            }

            // Use AI to extract events from the content
            // Use more content (up to 100k chars) and increase token limit for more events
            const contentToAnalyze = result.content.length > 100000 
                ? result.content.substring(0, 100000) + "\n\n[Content truncated for length...]"
                : result.content;
            
            console.log("[Event Scrape] Analyzing content length:", contentToAnalyze.length, "chars");
            
            const prompt = `Extract ALL blockchain/crypto/Web3 events from the following content. Be thorough and extract every event you can find.

For each event, provide:
- name (required) - the full event name
- description (brief) - what the event is about
- event_type (one of: conference, hackathon, meetup, workshop, summit, party, networking, other)
- event_date (YYYY-MM-DD format, required) - if only month/year is given, use the first day of that month
- start_time (HH:MM 24h format, optional)
- end_time (HH:MM 24h format, optional)
- venue (name of venue, optional)
- city (optional)
- country (optional)
- organizer (optional)
- event_url (link to event page, optional)
- rsvp_url (link to register, optional)
- image_url (URL to event banner/thumbnail image if visible, optional)
- tags (array of relevant tags, optional)
- blockchain_focus (array of blockchain names like 'ethereum', 'solana', 'bitcoin', etc., optional)

${event_types?.length ? `Only include events of these types: ${event_types.join(", ")}` : "Include ALL event types found."}
${blockchain_focus?.length ? `Only include events focused on: ${blockchain_focus.join(", ")}` : ""}

IMPORTANT: Extract as many events as possible. Don't skip any events. If you see a list of events, extract all of them.

Return ONLY a valid JSON array of events, no other text. Example:
[{"name": "ETHDenver", "event_type": "hackathon", "event_date": "2026-02-23", "image_url": "https://...", ...}]

Content to analyze:
${contentToAnalyze}`;

            let responseText = "";
            try {
                const response = await ai.models.generateContent({
                    model: "gemini-2.0-flash",
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    config: { maxOutputTokens: 16384 }, // Increased for more events
                });

                responseText = response.text || "";
                console.log("[Event Scrape] AI response length:", responseText.length);
                console.log("[Event Scrape] AI response preview:", responseText.substring(0, 500));
            } catch (aiError) {
                console.error("[Event Scrape] AI API error:", aiError);
                throw new Error(`AI extraction failed: ${aiError instanceof Error ? aiError.message : "Unknown error"}`);
            }

            // Parse the JSON response - handle markdown code blocks and clean up
            console.log("[Event Scrape] Raw AI response (first 1000 chars):", responseText.substring(0, 1000));
            
            // Try to extract JSON from markdown code blocks first
            let jsonText = responseText;
            
            // Remove markdown code blocks if present
            const codeBlockMatch = responseText.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
            if (codeBlockMatch) {
                jsonText = codeBlockMatch[1];
                console.log("[Event Scrape] Found JSON in code block");
            } else {
                // Try to find JSON array in the text
                const jsonMatch = responseText.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    jsonText = jsonMatch[0];
                    console.log("[Event Scrape] Found JSON array in text");
                }
            }
            
            // Clean up common JSON issues
            jsonText = jsonText
                .replace(/^[^\[]*/, '') // Remove anything before first [
                .replace(/[^\]]*$/, '') // Remove anything after last ]
                .replace(/,\s*}/g, '}') // Remove trailing commas in objects
                .replace(/,\s*]/g, ']') // Remove trailing commas in arrays
                .trim();
            
            if (!jsonText.startsWith('[') || !jsonText.endsWith(']')) {
                console.error("[Event Scrape] No valid JSON array found in response");
                console.error("[Event Scrape] Cleaned text (first 500 chars):", jsonText.substring(0, 500));
                return NextResponse.json({ 
                    error: "Could not extract events from content",
                    details: "AI response did not contain a valid JSON array",
                    rawResponse: responseText.substring(0, 1000)
                }, { status: 400 });
            }

            try {
                extractedEvents = JSON.parse(jsonText);
                console.log("[Event Scrape] Successfully parsed JSON, got", extractedEvents.length, "events");
            } catch (parseError) {
                console.error("[Event Scrape] JSON parse error:", parseError);
                console.error("[Event Scrape] Attempted to parse (first 1000 chars):", jsonText.substring(0, 1000));
                
                // Try to fix common JSON issues and parse again
                try {
                    // Try fixing escaped quotes and other common issues
                    const fixedJson = jsonText
                        .replace(/\\'/g, "'")
                        .replace(/\\"/g, '"')
                        .replace(/'/g, '"'); // Replace single quotes with double quotes
                    
                    extractedEvents = JSON.parse(fixedJson);
                    console.log("[Event Scrape] Successfully parsed after fixing quotes");
                } catch (retryError) {
                    console.error("[Event Scrape] Retry parse also failed:", retryError);
                    return NextResponse.json({ 
                        error: "Failed to parse extracted events",
                        details: parseError instanceof Error ? parseError.message : "Invalid JSON format",
                        rawResponse: jsonText.substring(0, 1000),
                        fullResponse: responseText.substring(0, 2000)
                    }, { status: 400 });
                }
            }
            
            // Validate that we got an array
            if (!Array.isArray(extractedEvents)) {
                console.error("[Event Scrape] Parsed result is not an array:", typeof extractedEvents);
                return NextResponse.json({ 
                    error: "Invalid response format",
                    details: "Expected an array of events, got: " + typeof extractedEvents,
                    rawResponse: jsonText.substring(0, 500)
                }, { status: 400 });
            }

            console.log("[Event Scrape] Extracted", extractedEvents.length, "events before filtering");
            console.log("[Event Scrape] Sample events:", extractedEvents.slice(0, 3).map(e => ({ name: e.name, date: e.event_date, type: e.event_type })));

            // Filter out past events if option enabled
            if (skip_past_events) {
                const originalCount = extractedEvents.length;
                const beforeFilter = [...extractedEvents];
                extractedEvents = extractedEvents.filter(e => {
                    const isPast = isEventPast(e.event_date);
                    if (isPast) {
                        console.log("[Event Scrape] Skipping past event:", e.name, e.event_date);
                    }
                    return !isPast;
                });
                skippedPast = originalCount - extractedEvents.length;
                if (skippedPast > 0) {
                    console.log("[Event Scrape] Skipped", skippedPast, "past events (out of", originalCount, "total)");
                }
            }
            
            console.log("[Event Scrape] After filtering:", extractedEvents.length, "events remaining");

            // If preview only, return events with duplicate status
            if (preview_only) {
                // Fetch existing events to check for duplicates
                const { data: existingEvents } = await supabase
                    .from("shout_events")
                    .select("name, event_date, city");
                
                const existingFingerprints = new Set(
                    (existingEvents || []).map(e => generateEventFingerprint(e))
                );

                const previewData = extractedEvents.map(e => {
                    const fingerprint = generateEventFingerprint({ 
                        name: e.name, 
                        event_date: e.event_date, 
                        city: e.city 
                    });
                    const isDuplicate = existingFingerprints.has(fingerprint);
                    
                    return {
                        name: e.name,
                        type: e.event_type,
                        start_date: e.event_date,
                        end_date: e.event_date,
                        location: e.venue,
                        city: e.city,
                        country: e.country,
                        description: e.description,
                        url: e.event_url,
                        image_url: e.image_url,
                        is_duplicate: isDuplicate,
                        is_past: isEventPast(e.event_date),
                    };
                });

                const duplicateCount = previewData.filter(e => e.is_duplicate).length;

                return NextResponse.json({
                    success: true,
                    preview: true,
                    extracted: extractedEvents.length,
                    duplicates: duplicateCount,
                    skipped_past: skippedPast,
                    pages_scraped: pageCount,
                    events: previewData,
                });
            }
        }

        // Insert events into database
        let inserted = 0;
        let skipped = 0;
        let duplicates = 0;
        const insertedEvents = [];

        // Fetch existing event fingerprints for duplicate detection
        const { data: existingEvents } = await supabase
            .from("shout_events")
            .select("name, event_date, city");
        
        const existingFingerprints = new Set(
            (existingEvents || []).map(e => generateEventFingerprint(e))
        );

        // Batch geocode all unique locations first
        const locations = extractedEvents
            .map(e => [e.city, e.country].filter(Boolean).join(", "))
            .filter(Boolean);
        const geocodeResults = await batchGeocodeLocations(locations);

        console.log("[Event Scrape] Checking", extractedEvents.length, "events against", existingFingerprints.size, "existing fingerprints");
        
        for (const event of extractedEvents) {
            if (!event.name || !event.event_date || !event.event_type) {
                console.log("[Event Scrape] Skipping invalid event (missing required fields):", { name: event.name, date: event.event_date, type: event.event_type });
                skipped++;
                continue;
            }

            // Check for duplicates using fingerprint
            const fingerprint = generateEventFingerprint({ 
                name: event.name, 
                event_date: event.event_date, 
                city: event.city 
            });
            
            if (existingFingerprints.has(fingerprint)) {
                console.log("[Event Scrape] Duplicate detected:", event.name, event.event_date, "fingerprint:", fingerprint);
                duplicates++;
                skipped++;
                continue;
            }
            
            console.log("[Event Scrape] Processing new event:", event.name, event.event_date, "fingerprint:", fingerprint);

            // Generate a unique source_id using normalized name
            const normalizedName = normalizeEventName(event.name);
            let sourceId: string;
            try {
                if (sourceUrl && sourceUrl !== "preview") {
                    const urlObj = new URL(sourceUrl);
                    sourceId = `${urlObj.hostname}-${normalizedName}-${event.event_date}`.replace(/[^a-zA-Z0-9-]/g, "-").substring(0, 200);
                } else {
                    // Fallback for preview saves or missing URL
                    sourceId = `preview-${normalizedName}-${event.event_date}`.replace(/[^a-zA-Z0-9-]/g, "-").substring(0, 200);
                }
            } catch {
                // If URL parsing fails, use fallback
                sourceId = `preview-${normalizedName}-${event.event_date}`.replace(/[^a-zA-Z0-9-]/g, "-").substring(0, 200);
            }

            // Get geocoded location from batch results
            const locationStr = [event.city, event.country].filter(Boolean).join(", ");
            const coords = geocodeResults.get(locationStr);
            const latitude = coords?.lat || null;
            const longitude = coords?.lon || null;

            try {
                const { data: newEvent, error: insertError } = await supabase
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
                        latitude,
                        longitude,
                        organizer: event.organizer || null,
                        event_url: event.event_url || null,
                        rsvp_url: event.rsvp_url || null,
                        banner_image_url: event.image_url || null,
                        tags: event.tags || [],
                        blockchain_focus: event.blockchain_focus || null,
                        source: "firecrawl",
                        source_url: sourceUrl || event.event_url || null,
                        source_id: sourceId,
                        status: "draft", // Scraped events start as draft for review
                        created_by: address,
                    })
                    .select()
                    .single();

                if (insertError) {
                    if (insertError.code === "23505") {
                        duplicates++;
                        skipped++;
                    } else {
                        console.error("[Event Scrape] Insert error:", insertError);
                        skipped++;
                    }
                } else {
                    inserted++;
                    insertedEvents.push(newEvent);
                    // Add to existing fingerprints to prevent duplicates within same batch
                    existingFingerprints.add(fingerprint);
                }
            } catch (err) {
                console.error("[Event Scrape] Error inserting event:", err);
                skipped++;
            }
        }

        // Optionally save the source for recurring scrapes
        if (save_source && sourceUrl && sourceUrl !== "preview") {
            try {
                const nextScrapeAt = new Date();
                nextScrapeAt.setHours(nextScrapeAt.getHours() + scrape_interval_hours);
                const urlObj = new URL(sourceUrl);

                await supabase
                    .from("shout_event_sources")
                    .upsert({
                        name: urlObj.hostname,
                        url: sourceUrl,
                        source_type: source_type,
                        scrape_interval_hours: scrape_interval_hours,
                        event_types: event_types || [],
                        blockchain_focus: blockchain_focus || [],
                        last_scraped_at: new Date().toISOString(),
                        next_scrape_at: nextScrapeAt.toISOString(),
                        events_found: extractedEvents.length,
                        content_hash: contentHash || null, // Store content hash for change detection
                        is_active: true,
                        created_by: address,
                    }, { onConflict: "url" });
            } catch (err) {
                console.error("[Event Scrape] Error saving source:", err);
                // Don't fail the whole request if source save fails
            }
        }

        console.log("[Event Scrape] Final results:", {
            extracted: extractedEvents.length,
            inserted,
            skipped,
            duplicates,
            skipped_past: skippedPast,
            pages_scraped: pageCount
        });

        return NextResponse.json({
            success: true,
            extracted: extractedEvents.length,
            inserted,
            skipped,
            duplicates,
            skipped_past: skippedPast,
            pages_scraped: pageCount,
            events: insertedEvents,
        });
    } catch (error) {
        console.error("[Event Scrape] ========== FATAL ERROR ==========");
        console.error("[Event Scrape] Error type:", error?.constructor?.name);
        console.error("[Event Scrape] Error message:", error instanceof Error ? error.message : String(error));
        console.error("[Event Scrape] Error stack:", error instanceof Error ? error.stack : "No stack trace");
        console.error("[Event Scrape] Full error object:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
        console.error("[Event Scrape] ==================================");
        
        return NextResponse.json({ 
            error: "Failed to scrape events",
            details: error instanceof Error ? error.message : "Unknown error",
            type: error?.constructor?.name || "Unknown",
        }, { status: 500 });
    }
}
