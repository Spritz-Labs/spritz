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

    try {
        const body = await request.json();
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
            skip_past_events = true, // NEW: Skip events with past dates
            skip_if_unchanged = true, // NEW: Skip scrape if content unchanged
        } = body;

        if (!url) {
            return NextResponse.json({ error: "URL is required" }, { status: 400 });
        }

        // If events_to_save is provided, skip scraping and just save
        let extractedEvents: ExtractedEvent[];
        let pageCount = 1;
        let contentHash = "";
        let skippedPast = 0;

        if (events_to_save && Array.isArray(events_to_save)) {
            // Direct save from preview selection
            extractedEvents = events_to_save.map((e: ExtractedEvent & { type?: string; start_date?: string }) => ({
                ...e,
                event_type: e.event_type || e.type || "other",
                event_date: e.event_date || e.start_date || new Date().toISOString().split("T")[0],
            }));
            console.log("[Event Scrape] Saving", extractedEvents.length, "pre-selected events");
        } else {
            console.log("[Event Scrape] Scraping URL:", url, "depth:", crawl_depth, "max pages:", max_pages, "infinite scroll:", infinite_scroll);

            // Scrape the URL using Firecrawl
            const result = await fetchContent(url, {
                crawlDepth: crawl_depth,
                maxPages: max_pages,
                infiniteScroll: infinite_scroll,
                scrollCount: scroll_count,
            });

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
- image_url (URL to event banner/thumbnail image if visible)
- tags (array of relevant tags)
- blockchain_focus (array of blockchain names like 'ethereum', 'solana', 'bitcoin', etc.)

${event_types?.length ? `Only include events of these types: ${event_types.join(", ")}` : ""}
${blockchain_focus?.length ? `Only include events focused on: ${blockchain_focus.join(", ")}` : ""}

Return ONLY a valid JSON array of events, no other text. Example:
[{"name": "ETHDenver", "event_type": "hackathon", "event_date": "2026-02-23", "image_url": "https://...", ...}]

Content to analyze:
${result.content.substring(0, 50000)}`;

            const response = await ai.models.generateContent({
                model: "gemini-2.0-flash",
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: { maxOutputTokens: 8192 },
            });

            const responseText = response.text || "";
            console.log("[Event Scrape] AI response length:", responseText.length);

            // Parse the JSON response
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                return NextResponse.json({ 
                    error: "Could not extract events from content",
                    rawResponse: responseText.substring(0, 500)
                }, { status: 400 });
            }

            try {
                extractedEvents = JSON.parse(jsonMatch[0]);
            } catch {
                return NextResponse.json({ 
                    error: "Failed to parse extracted events",
                    rawResponse: jsonMatch[0].substring(0, 500)
                }, { status: 400 });
            }

            console.log("[Event Scrape] Extracted", extractedEvents.length, "events");

            // Filter out past events if option enabled
            if (skip_past_events) {
                const originalCount = extractedEvents.length;
                extractedEvents = extractedEvents.filter(e => !isEventPast(e.event_date));
                skippedPast = originalCount - extractedEvents.length;
                if (skippedPast > 0) {
                    console.log("[Event Scrape] Skipped", skippedPast, "past events");
                }
            }

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

        for (const event of extractedEvents) {
            if (!event.name || !event.event_date || !event.event_type) {
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
                console.log("[Event Scrape] Duplicate detected:", event.name, event.event_date);
                duplicates++;
                skipped++;
                continue;
            }

            // Generate a unique source_id using normalized name
            const normalizedName = normalizeEventName(event.name);
            const sourceId = `${new URL(url).hostname}-${normalizedName}-${event.event_date}`.replace(/[^a-zA-Z0-9-]/g, "-").substring(0, 200);

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
                        source_url: url,
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
        if (save_source) {
            const nextScrapeAt = new Date();
            nextScrapeAt.setHours(nextScrapeAt.getHours() + scrape_interval_hours);

            await supabase
                .from("shout_event_sources")
                .upsert({
                    name: new URL(url).hostname,
                    url,
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
        }

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
        console.error("[Event Scrape] Error:", error);
        return NextResponse.json({ 
            error: "Failed to scrape events",
            details: error instanceof Error ? error.message : "Unknown error"
        }, { status: 500 });
    }
}
