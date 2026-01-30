import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { fetchContent, isFirecrawlConfigured } from "@/lib/firecrawl";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

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

// Normalize event name for comparison (removes special chars, lowercase, strips year/Events suffix)
function normalizeEventName(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s+events?\s*$/i, "") // " 2026 Events" or " Event"
        .replace(/\s+20\d{2}\s*$/i, "") // trailing year e.g. " 2026"
        .replace(/[''`]/g, "") // Remove apostrophes
        .replace(/[^\w\s]/g, " ") // Replace special chars with space
        .replace(/\s+/g, " ") // Collapse multiple spaces
        .trim();
}

// Generate multiple fingerprints for duplicate detection
// Returns an array of fingerprint strings to check against
function generateEventFingerprints(event: {
    name: string;
    event_date: string;
    city?: string;
    venue?: string;
    event_url?: string;
    rsvp_url?: string;
}): string[] {
    const normalized = normalizeEventName(event.name);
    const date = event.event_date;
    const city = (event.city?.toLowerCase().trim() || "").replace(/[^\w]/g, "");
    const venue = (event.venue?.toLowerCase().trim() || "").replace(
        /[^\w]/g,
        "",
    );

    const fingerprints: string[] = [];

    // Primary fingerprint: name + date + city
    fingerprints.push(`${normalized}|${date}|${city}`);

    // Alternative: name + date + venue (if city is missing)
    if (!city && venue) {
        fingerprints.push(`${normalized}|${date}|venue:${venue}`);
    }

    // URL-based fingerprints (most reliable)
    if (event.event_url) {
        try {
            const url = new URL(event.event_url);
            // Normalize URL: remove query params, trailing slashes, www
            const normalizedUrl =
                url.hostname.replace(/^www\./, "") +
                url.pathname.replace(/\/$/, "");
            fingerprints.push(`url:${normalizedUrl.toLowerCase()}`);
        } catch {
            // Invalid URL, use as-is but normalized
            const normalizedUrl = event.event_url
                .toLowerCase()
                .replace(/\/$/, "")
                .split("?")[0];
            fingerprints.push(`url:${normalizedUrl}`);
        }
    }

    if (event.rsvp_url) {
        try {
            const url = new URL(event.rsvp_url);
            const normalizedUrl =
                url.hostname.replace(/^www\./, "") +
                url.pathname.replace(/\/$/, "");
            fingerprints.push(`rsvp:${normalizedUrl.toLowerCase()}`);
        } catch {
            const normalizedUrl = event.rsvp_url
                .toLowerCase()
                .replace(/\/$/, "")
                .split("?")[0];
            fingerprints.push(`rsvp:${normalizedUrl}`);
        }
    }

    return fingerprints;
}

// Legacy function for backward compatibility
function generateEventFingerprint(event: {
    name: string;
    event_date: string;
    city?: string;
}): string {
    return generateEventFingerprints(event)[0];
}

// Calculate content hash for change detection
function hashContent(content: string): string {
    return crypto.createHash("md5").update(content).digest("hex");
}

// Batch geocoding with caching and rate limiting
// Cache persists across requests (in-memory, cleared on server restart)
const geocodeCache = new Map<string, { lat: number; lon: number } | null>();

async function batchGeocodeLocations(
    locations: string[],
): Promise<Map<string, { lat: number; lon: number } | null>> {
    const results = new Map<string, { lat: number; lon: number } | null>();
    const uniqueLocations = [...new Set(locations.filter(Boolean))];

    // Separate cached and uncached locations
    const uncachedLocations: string[] = [];
    for (const location of uniqueLocations) {
        if (geocodeCache.has(location)) {
            results.set(location, geocodeCache.get(location)!);
        } else {
            uncachedLocations.push(location);
        }
    }

    console.log(
        "[Geocode] Cached:",
        uniqueLocations.length - uncachedLocations.length,
        "Uncached:",
        uncachedLocations.length,
    );

    // Process uncached locations in parallel batches (respecting rate limits)
    const BATCH_SIZE = 5; // Process 5 at a time
    for (let i = 0; i < uncachedLocations.length; i += BATCH_SIZE) {
        const batch = uncachedLocations.slice(i, i + BATCH_SIZE);

        // Process batch in parallel (but still rate limited)
        await Promise.all(
            batch.map(async (location, index) => {
                // Stagger requests slightly to respect rate limits
                await new Promise((resolve) =>
                    setTimeout(resolve, index * 250),
                ); // 250ms between requests

                try {
                    const query = encodeURIComponent(location);
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
                        {
                            headers: { "User-Agent": "Spritz-Events/1.0" },
                        },
                    );
                    const data = await res.json();

                    if (data && data[0]) {
                        const coords = {
                            lat: parseFloat(data[0].lat),
                            lon: parseFloat(data[0].lon),
                        };
                        geocodeCache.set(location, coords);
                        results.set(location, coords);
                    } else {
                        geocodeCache.set(location, null);
                        results.set(location, null);
                    }
                } catch (error) {
                    console.error("[Geocode] Error for", location, error);
                    geocodeCache.set(location, null);
                    results.set(location, null);
                }
            }),
        );

        // Rate limit between batches: 1 second
        if (i + BATCH_SIZE < uncachedLocations.length) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
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
async function verifyAdmin(
    request: NextRequest,
): Promise<{ isAdmin: boolean; address: string | null }> {
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
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    if (!ai) {
        console.error("[Event Scrape] ERROR: AI not configured");
        return NextResponse.json(
            { error: "AI not configured" },
            { status: 500 },
        );
    }

    if (!isFirecrawlConfigured()) {
        console.error("[Event Scrape] ERROR: Firecrawl not configured");
        return NextResponse.json(
            { error: "Firecrawl not configured" },
            { status: 500 },
        );
    }

    console.log("[Event Scrape] All services configured, verifying admin...");
    const { isAdmin, address } = await verifyAdmin(request);
    if (!isAdmin || !address) {
        console.error(
            "[Event Scrape] ERROR: Unauthorized - isAdmin:",
            isAdmin,
            "address:",
            address,
        );
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
            crawl_depth = 1, // Default 1 for infinite scroll pages (optimal for cryptonomads)
            max_pages = 1, // Default 1 page with infinite scroll (optimal for cryptonomads)
            infinite_scroll = true, // Default enabled for event listing pages
            scroll_count = 18, // Default 18 scrolls (aligned with update-cryptonomads; avoids SCRAPE_TIMEOUT)
            preview_only = false,
            events_to_save,
            skip_past_events = false, // Default to false - let user decide
            skip_if_unchanged = false, // Default to false - always extract to catch new events
            refresh_event_id = null as string | null, // When set: scrape URL, extract, then PATCH this event (no insert)
        } = body;

        if (!url) {
            console.error("[Event Scrape] ERROR: URL is required");
            return NextResponse.json(
                { error: "URL is required" },
                { status: 400 },
            );
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
            save_source: save_source,
            events_to_save_provided: !!events_to_save,
        });

        // If events_to_save is provided, skip scraping and just save
        let extractedEvents: ExtractedEvent[] = [];
        let pageCount = 1;
        let contentHash = "";
        let skippedPast = 0;
        let sourceUrl = url; // Store URL for later use

        if (events_to_save && Array.isArray(events_to_save)) {
            // Direct save from preview selection
            console.log("[Event Scrape] Mode: Saving pre-selected events");
            console.log(
                "[Event Scrape] Events to save count:",
                events_to_save.length,
            );
            extractedEvents = events_to_save.map(
                (
                    e: ExtractedEvent & { type?: string; start_date?: string },
                ) => ({
                    ...e,
                    event_type: e.event_type || e.type || "other",
                    event_date:
                        e.event_date ||
                        e.start_date ||
                        new Date().toISOString().split("T")[0],
                }),
            );
            console.log(
                "[Event Scrape] Mapped",
                extractedEvents.length,
                "events for saving",
            );

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
                console.log("[Event Scrape] Calling fetchContent...");
                result = await fetchContent(url, {
                    crawlDepth: crawl_depth,
                    maxPages: max_pages,
                    infiniteScroll: infinite_scroll,
                    scrollCount: scroll_count,
                });
                console.log(
                    "[Event Scrape] fetchContent completed successfully",
                );
                console.log(
                    "[Event Scrape] Result keys:",
                    Object.keys(result || {}),
                );
                console.log(
                    "[Event Scrape] Content length:",
                    result?.content?.length || 0,
                );
            } catch (fetchError) {
                console.error("[Event Scrape] fetchContent ERROR:", fetchError);
                console.error(
                    "[Event Scrape] fetchContent error type:",
                    fetchError?.constructor?.name,
                );
                console.error(
                    "[Event Scrape] fetchContent error stack:",
                    fetchError instanceof Error ? fetchError.stack : "No stack",
                );
                return NextResponse.json(
                    {
                        error: "Failed to fetch content",
                        details:
                            fetchError instanceof Error
                                ? fetchError.message
                                : "Unknown error",
                        type: fetchError?.constructor?.name || "Unknown",
                    },
                    { status: 500 },
                );
            }

            if (!result) {
                console.error(
                    "[Event Scrape] fetchContent returned null/undefined",
                );
                return NextResponse.json(
                    {
                        error: "Failed to fetch content",
                        details: "fetchContent returned no result",
                    },
                    { status: 500 },
                );
            }

            if (!result.content || result.content.length < 100) {
                console.error("[Event Scrape] Insufficient content:", {
                    hasContent: !!result.content,
                    contentLength: result.content?.length || 0,
                });
                return NextResponse.json(
                    {
                        error: "Not enough content found",
                        details: `Content length: ${result.content?.length || 0} (minimum 100 required)`,
                    },
                    { status: 400 },
                );
            }

            pageCount = result.pageCount;
            contentHash = hashContent(result.content);
            console.log(
                "[Event Scrape] Fetched content, length:",
                result.content.length,
                "hash:",
                contentHash,
            );

            // Check if content has changed since last scrape (skip if unchanged)
            if (skip_if_unchanged && !preview_only) {
                const { data: existingSource } = await supabase
                    .from("shout_event_sources")
                    .select("content_hash")
                    .eq("url", url)
                    .single();

                if (existingSource?.content_hash === contentHash) {
                    console.log(
                        "[Event Scrape] Content unchanged, skipping extraction",
                    );
                    return NextResponse.json({
                        success: true,
                        unchanged: true,
                        message:
                            "Page content has not changed since last scrape",
                        extracted: 0,
                        inserted: 0,
                        skipped: 0,
                    });
                }
            }

            // Use AI to extract events from the content
            // Use more content (up to 200k chars) for sites with many events
            const maxContentLength = 200000; // Increased for sites with many events
            const contentToAnalyze =
                result.content.length > maxContentLength
                    ? result.content.substring(0, maxContentLength) +
                      "\n\n[Content truncated for length...]"
                    : result.content;

            console.log(
                "[Event Scrape] Analyzing content length:",
                contentToAnalyze.length,
                "chars",
            );
            console.log(
                "[Event Scrape] Full content length:",
                result.content.length,
                "chars",
            );
            console.log(
                "[Event Scrape] Content preview (first 2000 chars):",
                result.content.substring(0, 2000),
            );

            // Count potential event mentions in content
            const eventKeywords = [
                "event",
                "conference",
                "hackathon",
                "meetup",
                "workshop",
                "summit",
                "party",
                "networking",
            ];
            const keywordCount = eventKeywords.reduce((count, keyword) => {
                const matches = result.content
                    .toLowerCase()
                    .match(new RegExp(keyword, "g"));
                return count + (matches ? matches.length : 0);
            }, 0);
            console.log(
                "[Event Scrape] Event keyword mentions in content:",
                keywordCount,
            );

            const prompt = `Extract ALL blockchain/crypto/Web3 events from the following content. Be extremely thorough and extract EVERY single event you can find.

CRITICAL INSTRUCTIONS FOR EVENT NAMES (accuracy is essential):
- Use the EXACT event name as displayed on the page. Copy it verbatim; do not paraphrase, shorten, or rewrite.
- Use the primary title/heading of each event card (the main event name), not a tagline, subtitle, or description.
- Preserve capitalization and spelling as shown (e.g. "ETHDenver 2026", "Consensus HK", "Satoshi Roundtable").
- Do NOT invent or combine names. If the card shows "ETHDenver 2026", use exactly that.
- Do NOT use attendee lists, "Who's going", speaker lists, or comma-separated usernames/handles as the event name. The name must be the actual event title, not a list of people.
- Skip entries that are NOT event names: "CNC Member Discount", "CNC Member tix", "Member Discount", standalone promos.
- If you see "Side Events" or "Events" as the card label for a link to a sub-page, use that exact label for that entry (e.g. "ETHDenver Side Events").
- On side-events listing pages: each card has its own specific event name—use that card’s exact title, not the page title.
- If this is a side events page, most events will be meetups, parties, workshops, or networking—categorize by type.

CRITICAL INSTRUCTIONS FOR LINKS (event_url = Event website on Spritz):
- event_url = the event's OFFICIAL website or info page. On Cryptonomads, extract the "Link to Website" when present—that is the preferred event_url so Spritz can show it as "Event website".
- If Cryptonomads has both a cryptonomads.org detail link and a "Link to Website", use the "Link to Website" for event_url.
- If there is no "Link to Website", use the event detail page URL (e.g. cryptonomads.org/.../event-slug) for event_url.

CRITICAL INSTRUCTIONS FOR RSVP/REGISTRATION (MUST EXTRACT):
- For EVERY event, look for a direct registration/RSVP link. This is essential for users to sign up.
- rsvp_url = the link users click to register/RSVP (Luma lu.ma, Eventbrite, Google Forms, typeform, etc.)
- If the only link on an event card is a registration link, put it in BOTH event_url and rsvp_url.
- Common patterns: "Register", "RSVP", "Get Tickets", "Sign Up", "Book Now", "Add to calendar", button hrefs
- Cryptonomads: event cards often have "Link to Website" (→ event_url) AND a separate RSVP/Register link (rsvp_url). Extract BOTH.
- If you see lu.ma, eventbrite.com, forms.gle, typeform.com, or similar in a link, that is almost always rsvp_url.
- rsvp_url = direct registration link (e.g. lu.ma/xyz, eventbrite.com/...)

EXTRACTION RULES:
- Extract EVERY event mentioned, listed, or referenced in the content
- If you see a list, table, or grid of events, extract ALL of them
- If events are in cards, tiles, or sections, extract ALL of them
- Don't skip any events - be exhaustive
- Look for event names, dates, locations in ANY format

For each event, provide:
- name (required) - the EXACT event name as shown on the page (copy verbatim; do not paraphrase or shorten)
- description (brief) - what the event is about
- event_type (one of: conference, hackathon, meetup, workshop, summit, party, networking, other)
  * If this is a side events page, most events will be: meetup, party, workshop, or networking
  * Main conferences/summits are typically on their own pages, not side events pages
- event_date (YYYY-MM-DD format, required) - if only month/year is given, use the first day of that month
- start_time (HH:MM 24h format, optional)
- end_time (HH:MM 24h format, optional)
- venue (name of venue, optional)
- city (optional)
- country (optional)
- organizer (optional)
- event_url (link to event info/detail page, optional)
- rsvp_url (REQUIRED when visible - direct link to register/RSVP e.g. lu.ma, eventbrite; extract for every event that has a signup link)
- image_url (URL to event banner/thumbnail image if visible, optional)
- tags (array of relevant tags, optional)
- blockchain_focus (array of blockchain names like 'ethereum', 'solana', 'bitcoin', etc., optional)

${event_types?.length ? `Only include events of these types: ${event_types.join(", ")}` : "Include ALL event types found."}
${blockchain_focus?.length ? `Only include events focused on: ${blockchain_focus.join(", ")}` : ""}

REMEMBER: 
- Extract the MAXIMUM number of events possible
- Use ACTUAL event names, not promotional text
- ALWAYS look for and extract rsvp_url if a registration link exists

Return ONLY a valid JSON array of events, no other text. Example:
[{"name": "ETHDenver", "event_type": "hackathon", "event_date": "2026-02-23", "event_url": "https://...", "rsvp_url": "https://lu.ma/ethdenver", ...}]

Content to analyze:
${contentToAnalyze}`;

            let responseText = "";
            try {
                console.log(
                    "[Event Scrape] Calling AI with prompt length:",
                    prompt.length,
                );
                const response = await ai.models.generateContent({
                    model: "gemini-2.0-flash",
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    config: {
                        maxOutputTokens: 32768, // Increased to 32k for many events
                        temperature: 0.3, // Lower temperature for more consistent extraction
                    },
                });

                // Get text from response - should be a direct property
                responseText = response.text || "";

                if (!responseText) {
                    console.error(
                        "[Event Scrape] Empty response.text, checking response structure:",
                    );
                    console.error(
                        "[Event Scrape] Response keys:",
                        Object.keys(response || {}),
                    );
                    console.error(
                        "[Event Scrape] Response type:",
                        typeof response,
                    );
                    if (response) {
                        try {
                            console.error(
                                "[Event Scrape] Response stringified (first 500):",
                                JSON.stringify(response).substring(0, 500),
                            );
                        } catch {
                            console.error(
                                "[Event Scrape] Could not stringify response",
                            );
                        }
                    }
                    throw new Error("AI returned empty response");
                }

                console.log(
                    "[Event Scrape] AI response length:",
                    responseText.length,
                );
                console.log(
                    "[Event Scrape] AI response preview:",
                    responseText.substring(0, 500),
                );
            } catch (aiError) {
                console.error("[Event Scrape] AI API error:", aiError);
                console.error(
                    "[Event Scrape] AI error type:",
                    aiError?.constructor?.name,
                );
                console.error(
                    "[Event Scrape] AI error message:",
                    aiError instanceof Error
                        ? aiError.message
                        : String(aiError),
                );
                console.error(
                    "[Event Scrape] AI error stack:",
                    aiError instanceof Error ? aiError.stack : "No stack",
                );
                throw new Error(
                    `AI extraction failed: ${aiError instanceof Error ? aiError.message : "Unknown error"}`,
                );
            }

            // Parse the JSON response - handle markdown code blocks and clean up
            console.log(
                "[Event Scrape] Raw AI response (first 1000 chars):",
                responseText.substring(0, 1000),
            );

            if (!responseText || responseText.trim().length === 0) {
                console.error("[Event Scrape] Empty AI response");
                return NextResponse.json(
                    {
                        error: "Empty response from AI",
                        details: "AI returned an empty response",
                    },
                    { status: 400 },
                );
            }

            // Try to extract JSON from markdown code blocks first
            let jsonText = responseText;

            // Remove markdown code blocks if present
            const codeBlockMatch = responseText.match(
                /```(?:json)?\s*(\[[\s\S]*?\])\s*```/,
            );
            if (codeBlockMatch && codeBlockMatch[1]) {
                jsonText = codeBlockMatch[1];
                console.log("[Event Scrape] Found JSON in code block");
            } else {
                // Try to find JSON array in the text
                const jsonMatch = responseText.match(/\[[\s\S]*\]/);
                if (jsonMatch && jsonMatch[0]) {
                    jsonText = jsonMatch[0];
                    console.log("[Event Scrape] Found JSON array in text");
                } else {
                    console.error(
                        "[Event Scrape] No JSON array pattern found in response",
                    );
                    return NextResponse.json(
                        {
                            error: "Could not extract events from content",
                            details: "AI response did not contain a JSON array",
                            rawResponse: responseText.substring(0, 1000),
                        },
                        { status: 400 },
                    );
                }
            }

            if (!jsonText || jsonText.trim().length === 0) {
                console.error("[Event Scrape] Extracted JSON text is empty");
                return NextResponse.json(
                    {
                        error: "Could not extract events from content",
                        details: "Extracted JSON text is empty",
                        rawResponse: responseText.substring(0, 1000),
                    },
                    { status: 400 },
                );
            }

            // Clean up common JSON issues
            jsonText = jsonText
                .replace(/^[^\[]*/, "") // Remove anything before first [
                .replace(/[^\]]*$/, "") // Remove anything after last ]
                .replace(/,\s*}/g, "}") // Remove trailing commas in objects
                .replace(/,\s*]/g, "]") // Remove trailing commas in arrays
                .trim();

            if (
                !jsonText ||
                !jsonText.startsWith("[") ||
                !jsonText.endsWith("]")
            ) {
                console.error(
                    "[Event Scrape] No valid JSON array found in response",
                );
                console.error(
                    "[Event Scrape] Cleaned text (first 500 chars):",
                    jsonText?.substring(0, 500) || "null/undefined",
                );
                return NextResponse.json(
                    {
                        error: "Could not extract events from content",
                        details:
                            "AI response did not contain a valid JSON array",
                        rawResponse: responseText.substring(0, 1000),
                    },
                    { status: 400 },
                );
            }

            try {
                extractedEvents = JSON.parse(jsonText);
                console.log(
                    "[Event Scrape] Successfully parsed JSON, got",
                    extractedEvents.length,
                    "events",
                );
                // Filter out bad extractions: event "names" that are attendee/speaker lists (e.g. "user1, user2, user3")
                const beforeFilter = extractedEvents.length;
                extractedEvents = extractedEvents.filter(
                    (e: { name?: string }) => {
                        const name = (e?.name || "").trim();
                        if (!name) return false;
                        const commaCount = (name.match(/,/g) || []).length;
                        if (commaCount >= 2) {
                            const parts = name
                                .split(",")
                                .map((p: string) => p.trim());
                            const lookLikeHandles = parts.every(
                                (p: string) =>
                                    p.length > 0 &&
                                    p.length < 40 &&
                                    /^[\w.-]+$/i.test(p),
                            );
                            if (lookLikeHandles) {
                                console.log(
                                    "[Event Scrape] Skipping attendee-list name:",
                                    name.substring(0, 80),
                                );
                                return false;
                            }
                        }
                        return true;
                    },
                );
                if (extractedEvents.length < beforeFilter) {
                    console.log(
                        "[Event Scrape] Filtered",
                        beforeFilter - extractedEvents.length,
                        "attendee-list entries",
                    );
                }
            } catch (parseError) {
                console.warn(
                    "[Event Scrape] JSON parse error, attempting to extract valid portion...",
                );
                // Try to extract valid portion if JSON was truncated (like in working script)
                try {
                    let lastValidIndex = jsonText.lastIndexOf("}");
                    if (lastValidIndex > 0) {
                        // Find matching opening brace
                        let depth = 1;
                        let startIndex = lastValidIndex;
                        while (startIndex > 0 && depth > 0) {
                            startIndex--;
                            if (jsonText[startIndex] === "}") depth++;
                            if (jsonText[startIndex] === "{") depth--;
                        }

                        // Extract up to last complete object
                        const validJson =
                            jsonText.substring(0, lastValidIndex + 1) + "]";
                        extractedEvents = JSON.parse(validJson);
                        console.log(
                            "[Event Scrape] Extracted",
                            extractedEvents.length,
                            "events from truncated JSON",
                        );
                    } else {
                        throw parseError; // Re-throw if we can't fix it
                    }
                } catch (retryError) {
                    // Fall back to original error handling
                    console.error(
                        "[Event Scrape] JSON parse error:",
                        parseError,
                    );
                    console.error(
                        "[Event Scrape] Attempted to parse (first 1000 chars):",
                        jsonText.substring(0, 1000),
                    );

                    // Try fixing common JSON issues and parse again
                    try {
                        const fixedJson = jsonText
                            .replace(/\\'/g, "'")
                            .replace(/\\"/g, '"')
                            .replace(/'/g, '"'); // Replace single quotes with double quotes

                        extractedEvents = JSON.parse(fixedJson);
                        console.log(
                            "[Event Scrape] Successfully parsed after fixing quotes",
                        );
                    } catch (retryError2) {
                        console.error(
                            "[Event Scrape] Retry parse also failed:",
                            retryError2,
                        );
                        return NextResponse.json(
                            {
                                error: "Failed to parse extracted events",
                                details:
                                    parseError instanceof Error
                                        ? parseError.message
                                        : "Invalid JSON format",
                                rawResponse: jsonText.substring(0, 1000),
                                fullResponse: responseText.substring(0, 2000),
                            },
                            { status: 400 },
                        );
                    }
                }
            }

            // If very few events found and content is large, try a second extraction pass with different approach
            if (
                extractedEvents.length < 5 &&
                result.content.length > 50000 &&
                !preview_only
            ) {
                console.log(
                    "[Event Scrape] Few events found (" +
                        extractedEvents.length +
                        "), attempting second extraction pass...",
                );

                // Try a more aggressive prompt focused on finding ALL events
                const retryPrompt = `You are extracting events from a webpage. The previous extraction found only ${extractedEvents.length} events, but the page likely contains many more.

Look VERY carefully through the content. Events might be in:
- Lists or tables
- Cards or tiles
- Calendar views
- Event listings
- Any structured format

Extract EVERY single event you can find, even if information is minimal. If you see event names, dates, or locations mentioned anywhere, extract them.

Return a JSON array with ALL events found. Be exhaustive - extract 50+ events if they exist.

Content:
${contentToAnalyze.substring(0, 150000)}`;

                try {
                    const retryResponse = await ai.models.generateContent({
                        model: "gemini-2.0-flash",
                        contents: [
                            { role: "user", parts: [{ text: retryPrompt }] },
                        ],
                        config: {
                            maxOutputTokens: 32768,
                            temperature: 0.2, // Even lower for retry
                        },
                    });

                    const retryText = retryResponse.text || "";
                    if (retryText) {
                        const retryJsonMatch = retryText.match(/\[[\s\S]*\]/);
                        if (retryJsonMatch) {
                            const retryEvents = JSON.parse(retryJsonMatch[0]);
                            if (
                                Array.isArray(retryEvents) &&
                                retryEvents.length > extractedEvents.length
                            ) {
                                console.log(
                                    "[Event Scrape] Retry found",
                                    retryEvents.length,
                                    "events (vs",
                                    extractedEvents.length,
                                    "before)",
                                );
                                extractedEvents = retryEvents; // Use the better result
                            }
                        }
                    }
                } catch (retryError) {
                    console.warn(
                        "[Event Scrape] Retry extraction failed, using original result:",
                        retryError,
                    );
                }
            }

            // Validate that we got an array
            if (!Array.isArray(extractedEvents)) {
                console.error(
                    "[Event Scrape] Parsed result is not an array:",
                    typeof extractedEvents,
                );
                return NextResponse.json(
                    {
                        error: "Invalid response format",
                        details:
                            "Expected an array of events, got: " +
                            typeof extractedEvents,
                        rawResponse: jsonText.substring(0, 500),
                    },
                    { status: 400 },
                );
            }

            console.log(
                "[Event Scrape] Extracted",
                extractedEvents.length,
                "events before filtering",
            );

            // Filter out invalid event names (promotional text, discounts, etc.) - early filtering
            const invalidNamePatterns = [
                /^CNC Member/i,
                /^Member Discount/i,
                /^Member tix/i,
                /^Member ticket/i,
                /^Discount$/i,
                /^tix$/i,
                /^ticket$/i,
                /^RSVP$/i,
                /^Register$/i,
                /^Sign up$/i,
                /^Get tickets$/i,
            ];

            const originalCount = extractedEvents.length;
            extractedEvents = extractedEvents.filter((event) => {
                if (!event.name) return false;
                const name = event.name.trim();
                // Filter out very short names that are likely not event names
                if (name.length < 3) return false;
                // Filter out promotional text
                if (invalidNamePatterns.some((pattern) => pattern.test(name))) {
                    console.log(
                        "[Event Scrape] Filtered out invalid event name:",
                        name,
                    );
                    return false;
                }
                return true;
            });

            const filteredCount = originalCount - extractedEvents.length;
            if (filteredCount > 0) {
                console.log(
                    "[Event Scrape] Filtered out",
                    filteredCount,
                    "invalid event names",
                );
            }

            console.log(
                "[Event Scrape] After filtering:",
                extractedEvents.length,
                "events remaining",
            );
            console.log(
                "[Event Scrape] Sample events:",
                extractedEvents.slice(0, 3).map((e) => ({
                    name: e.name,
                    date: e.event_date,
                    type: e.event_type,
                    rsvp: !!e.rsvp_url,
                    event_url: e.event_url ? "yes" : "no",
                })),
            );

            // Filter out past events if option enabled
            if (skip_past_events) {
                const originalCount = extractedEvents.length;
                const beforeFilter = [...extractedEvents];
                extractedEvents = extractedEvents.filter((e) => {
                    const isPast = isEventPast(e.event_date);
                    if (isPast) {
                        console.log(
                            "[Event Scrape] Skipping past event:",
                            e.name,
                            e.event_date,
                        );
                    }
                    return !isPast;
                });
                skippedPast = originalCount - extractedEvents.length;
                if (skippedPast > 0) {
                    console.log(
                        "[Event Scrape] Skipped",
                        skippedPast,
                        "past events (out of",
                        originalCount,
                        "total)",
                    );
                }
            }

            console.log(
                "[Event Scrape] After filtering:",
                extractedEvents.length,
                "events remaining",
            );
            console.log("[Event Scrape] preview_only flag:", preview_only);

            // If preview only, return events with duplicate status
            if (preview_only) {
                console.log(
                    "[Event Scrape] Preview mode - returning preview data without saving",
                );
                // Fetch existing events to check for duplicates (include URLs for better detection)
                const { data: existingEvents } = await supabase
                    .from("shout_events")
                    .select(
                        "name, event_date, city, venue, event_url, rsvp_url",
                    )
                    .limit(1000);

                // Build sets for duplicate detection with URLs
                const existingFingerprints = new Set<string>();
                const existingUrls = new Set<string>();

                for (const e of existingEvents || []) {
                    const fps = generateEventFingerprints({
                        name: e.name,
                        event_date: e.event_date,
                        city: e.city,
                        venue: e.venue,
                        event_url: e.event_url,
                        rsvp_url: e.rsvp_url,
                    });
                    fps.forEach((fp) => existingFingerprints.add(fp));

                    // Track URLs
                    if (e.event_url) {
                        try {
                            const url = new URL(e.event_url);
                            const normalizedUrl =
                                url.hostname.replace(/^www\./, "") +
                                url.pathname.replace(/\/$/, "");
                            existingUrls.add(normalizedUrl.toLowerCase());
                        } catch {
                            existingUrls.add(
                                e.event_url
                                    .toLowerCase()
                                    .replace(/\/$/, "")
                                    .split("?")[0],
                            );
                        }
                    }
                    if (e.rsvp_url) {
                        try {
                            const url = new URL(e.rsvp_url);
                            const normalizedUrl =
                                url.hostname.replace(/^www\./, "") +
                                url.pathname.replace(/\/$/, "");
                            existingUrls.add(normalizedUrl.toLowerCase());
                        } catch {
                            existingUrls.add(
                                e.rsvp_url
                                    .toLowerCase()
                                    .replace(/\/$/, "")
                                    .split("?")[0],
                            );
                        }
                    }
                }

                const previewData = extractedEvents.map((e) => {
                    const eventFingerprints = generateEventFingerprints({
                        name: e.name,
                        event_date: e.event_date,
                        city: e.city,
                        venue: e.venue,
                        event_url: e.event_url,
                        rsvp_url: e.rsvp_url,
                    });

                    // Check URL-based duplicates first (most reliable)
                    let isDuplicate = false;
                    if (e.event_url) {
                        try {
                            const url = new URL(e.event_url);
                            const normalizedUrl =
                                url.hostname.replace(/^www\./, "") +
                                url.pathname.replace(/\/$/, "");
                            if (existingUrls.has(normalizedUrl.toLowerCase())) {
                                isDuplicate = true;
                            }
                        } catch {
                            const normalizedUrl = e.event_url
                                .toLowerCase()
                                .replace(/\/$/, "")
                                .split("?")[0];
                            if (existingUrls.has(normalizedUrl)) {
                                isDuplicate = true;
                            }
                        }
                    }

                    if (!isDuplicate && e.rsvp_url) {
                        try {
                            const url = new URL(e.rsvp_url);
                            const normalizedUrl =
                                url.hostname.replace(/^www\./, "") +
                                url.pathname.replace(/\/$/, "");
                            if (existingUrls.has(normalizedUrl.toLowerCase())) {
                                isDuplicate = true;
                            }
                        } catch {
                            const normalizedUrl = e.rsvp_url
                                .toLowerCase()
                                .replace(/\/$/, "")
                                .split("?")[0];
                            if (existingUrls.has(normalizedUrl)) {
                                isDuplicate = true;
                            }
                        }
                    }

                    // Check fingerprint-based duplicates
                    if (!isDuplicate) {
                        isDuplicate = eventFingerprints.some((fp) =>
                            existingFingerprints.has(fp),
                        );
                    }

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

                const duplicateCount = previewData.filter(
                    (e) => e.is_duplicate,
                ).length;

                return NextResponse.json({
                    success: true,
                    preview: true,
                    extracted: extractedEvents.length,
                    duplicates: duplicateCount,
                    skipped_past: skippedPast,
                    pages_scraped: pageCount,
                    events: previewData,
                });
            } else {
                console.log(
                    "[Event Scrape] Not preview mode - will save events to database",
                );
            }
        }

        // Validate extractedEvents before processing
        console.log(
            "[Event Scrape] About to validate and save events. extractedEvents length:",
            extractedEvents?.length || 0,
        );
        console.log("[Event Scrape] preview_only at save point:", preview_only);
        console.log(
            "[Event Scrape] events_to_save provided:",
            !!events_to_save,
        );

        if (!extractedEvents || !Array.isArray(extractedEvents)) {
            console.error(
                "[Event Scrape] extractedEvents is not a valid array:",
                typeof extractedEvents,
            );
            return NextResponse.json(
                {
                    error: "Invalid events data",
                    details: "Extracted events is not a valid array",
                },
                { status: 500 },
            );
        }

        if (extractedEvents.length === 0) {
            console.warn(
                "[Event Scrape] No events to save - extractedEvents array is empty",
            );
            return NextResponse.json({
                success: true,
                extracted: 0,
                inserted: 0,
                skipped: 0,
                duplicates: 0,
                skipped_past: skippedPast,
                pages_scraped: pageCount,
                message: "No events found to save",
            });
        }

        // Insert events into database
        console.log(
            "[Event Scrape] Starting to insert",
            extractedEvents.length,
            "events into database",
        );
        let inserted = 0;
        let skipped = 0;
        let duplicates = 0;
        const insertedEvents = [];

        // Fetch existing event fingerprints for duplicate detection
        // Optimize: Only fetch events from the same source or recent events (last 90 days)
        // This reduces the query size significantly for large databases
        let existingFingerprints: Set<string>;
        let existingSourceIds: Set<string>;
        let existingUrls: Set<string>; // Track URLs for duplicate detection

        try {
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            const dateStr = ninetyDaysAgo.toISOString().split("T")[0];

            // Try optimized query: same source OR recent events
            // Fetch URLs too for better duplicate detection
            const { data: existingEvents, error: fetchError } = await supabase
                .from("shout_events")
                .select(
                    "name, event_date, city, venue, event_url, rsvp_url, source, source_id",
                )
                .or(`source_url.eq.${sourceUrl},event_date.gte.${dateStr}`);

            if (fetchError || !existingEvents) {
                throw fetchError || new Error("No data returned");
            }

            // Generate all fingerprints for existing events
            existingFingerprints = new Set();
            existingUrls = new Set();
            for (const e of existingEvents) {
                const fps = generateEventFingerprints(e);
                fps.forEach((fp) => existingFingerprints.add(fp));

                // Also track URLs directly
                if (e.event_url) {
                    try {
                        const url = new URL(e.event_url);
                        const normalizedUrl =
                            url.hostname.replace(/^www\./, "") +
                            url.pathname.replace(/\/$/, "");
                        existingUrls.add(normalizedUrl.toLowerCase());
                    } catch {
                        existingUrls.add(
                            e.event_url
                                .toLowerCase()
                                .replace(/\/$/, "")
                                .split("?")[0],
                        );
                    }
                }
                if (e.rsvp_url) {
                    try {
                        const url = new URL(e.rsvp_url);
                        const normalizedUrl =
                            url.hostname.replace(/^www\./, "") +
                            url.pathname.replace(/\/$/, "");
                        existingUrls.add(normalizedUrl.toLowerCase());
                    } catch {
                        existingUrls.add(
                            e.rsvp_url
                                .toLowerCase()
                                .replace(/\/$/, "")
                                .split("?")[0],
                        );
                    }
                }
            }

            existingSourceIds = new Set(
                existingEvents
                    .filter((e) => e.source && e.source_id)
                    .map((e) => `${e.source}|${e.source_id}`),
            );
            console.log(
                "[Event Scrape] Fetched",
                existingFingerprints.size,
                "existing fingerprints,",
                existingUrls.size,
                "URLs, and",
                existingSourceIds.size,
                "source_ids (optimized query)",
            );
        } catch (error) {
            console.warn(
                "[Event Scrape] Optimized query failed, falling back to full query:",
                error,
            );
            // Fallback to fetching all if optimized query fails
            const { data: allEvents, error: fetchError } = await supabase
                .from("shout_events")
                .select(
                    "name, event_date, city, venue, event_url, rsvp_url, source, source_id",
                );

            if (fetchError) {
                console.error(
                    "[Event Scrape] Error fetching existing events:",
                    fetchError,
                );
                return NextResponse.json(
                    {
                        error: "Database error",
                        details:
                            "Failed to fetch existing events for duplicate detection",
                    },
                    { status: 500 },
                );
            }

            // Generate all fingerprints for existing events
            existingFingerprints = new Set();
            existingUrls = new Set();
            for (const e of allEvents || []) {
                const fps = generateEventFingerprints(e);
                fps.forEach((fp) => existingFingerprints.add(fp));

                // Track URLs
                if (e.event_url) {
                    try {
                        const url = new URL(e.event_url);
                        const normalizedUrl =
                            url.hostname.replace(/^www\./, "") +
                            url.pathname.replace(/\/$/, "");
                        existingUrls.add(normalizedUrl.toLowerCase());
                    } catch {
                        existingUrls.add(
                            e.event_url
                                .toLowerCase()
                                .replace(/\/$/, "")
                                .split("?")[0],
                        );
                    }
                }
                if (e.rsvp_url) {
                    try {
                        const url = new URL(e.rsvp_url);
                        const normalizedUrl =
                            url.hostname.replace(/^www\./, "") +
                            url.pathname.replace(/\/$/, "");
                        existingUrls.add(normalizedUrl.toLowerCase());
                    } catch {
                        existingUrls.add(
                            e.rsvp_url
                                .toLowerCase()
                                .replace(/\/$/, "")
                                .split("?")[0],
                        );
                    }
                }
            }

            existingSourceIds = new Set(
                (allEvents || [])
                    .filter((e) => e.source && e.source_id)
                    .map((e) => `${e.source}|${e.source_id}`),
            );
            console.log(
                "[Event Scrape] Using fallback: fetched",
                existingFingerprints.size,
                "existing fingerprints,",
                existingUrls.size,
                "URLs, and",
                existingSourceIds.size,
                "source_ids",
            );
        }

        // Batch geocode all unique locations first
        const locations = extractedEvents
            .map((e) => [e.city, e.country].filter(Boolean).join(", "))
            .filter(Boolean);
        const geocodeResults = await batchGeocodeLocations(locations);

        console.log(
            "[Event Scrape] Checking",
            extractedEvents.length,
            "events against",
            existingFingerprints.size,
            "existing fingerprints",
        );

        // Prepare events for batch insert (filter out duplicates and invalid events first)
        const eventsToInsert: any[] = [];
        const eventFingerprints: string[] = [];

        // Filter out invalid event names (promotional text, discounts, etc.)
        const invalidNamePatterns = [
            /^CNC Member/i,
            /^Member Discount/i,
            /^Member tix/i,
            /^Member ticket/i,
            /^Discount$/i,
            /^tix$/i,
            /^ticket$/i,
            /^RSVP$/i,
            /^Register$/i,
            /^Sign up$/i,
            /^Get tickets$/i,
        ];

        function isValidEventName(name: string): boolean {
            if (!name || name.trim().length < 3) return false;
            // Check against invalid patterns
            for (const pattern of invalidNamePatterns) {
                if (pattern.test(name.trim())) {
                    return false;
                }
            }
            // Event names should be at least 3 characters and not just generic words
            const trimmed = name.trim();
            if (trimmed.length < 3) return false;
            return true;
        }

        // Refresh single event: scrape URL, extract, then PATCH the given event (no insert)
        if (refresh_event_id) {
            const { data: existingEvent, error: fetchErr } = await supabase
                .from("shout_events")
                .select("id, name, event_date")
                .eq("id", refresh_event_id)
                .single();
            if (fetchErr || !existingEvent) {
                return NextResponse.json(
                    {
                        error: "Event not found for refresh",
                        id: refresh_event_id,
                    },
                    { status: 404 },
                );
            }
            const match =
                extractedEvents.find(
                    (e) =>
                        e.name?.trim() === existingEvent.name &&
                        e.event_date === existingEvent.event_date,
                ) || extractedEvents[0];
            if (
                !match ||
                !match.name ||
                !match.event_date ||
                !match.event_type
            ) {
                return NextResponse.json(
                    {
                        error: "No matching event extracted from page",
                        extracted: extractedEvents.length,
                    },
                    { status: 400 },
                );
            }
            const locationStr = [match.city, match.country]
                .filter(Boolean)
                .join(", ");
            const coords = geocodeResults.get(locationStr);
            let rsvpUrl = match.rsvp_url || null;
            let eventUrl = match.event_url || null;
            if (eventUrl && !rsvpUrl) {
                const registrationPlatforms = [
                    "lu.ma",
                    "eventbrite.com",
                    "meetup.com",
                    "lu.ma/event",
                ];
                if (
                    registrationPlatforms.some((platform) =>
                        eventUrl!.includes(platform),
                    )
                ) {
                    rsvpUrl = eventUrl;
                    eventUrl = null;
                }
            }
            const normalizedName = normalizeEventName(match.name);
            let sourceId: string;
            try {
                sourceId = (
                    sourceUrl && sourceUrl !== "preview"
                        ? `${new URL(sourceUrl).hostname}-${normalizedName}-${match.event_date}`
                        : `preview-${normalizedName}-${match.event_date}`
                )
                    .replace(/[^a-zA-Z0-9-]/g, "-")
                    .substring(0, 200);
            } catch {
                sourceId = `preview-${normalizedName}-${match.event_date}`
                    .replace(/[^a-zA-Z0-9-]/g, "-")
                    .substring(0, 200);
            }
            const updatePayload = {
                name: match.name.trim(),
                description: match.description || null,
                event_type: match.event_type,
                event_date: match.event_date,
                start_time: match.start_time || null,
                end_time: match.end_time || null,
                venue: match.venue || null,
                city: match.city || null,
                country: match.country || null,
                latitude: coords?.lat ?? null,
                longitude: coords?.lon ?? null,
                organizer: match.organizer || null,
                event_url: eventUrl,
                rsvp_url: rsvpUrl,
                tags: match.tags || [],
                blockchain_focus: match.blockchain_focus || null,
                source: "firecrawl",
                source_url: sourceUrl || eventUrl || null,
                source_id: sourceId,
            };
            const { data: updated, error: updateErr } = await supabase
                .from("shout_events")
                .update(updatePayload)
                .eq("id", refresh_event_id)
                .select()
                .single();
            if (updateErr) {
                console.error(
                    "[Event Scrape] Refresh update error:",
                    updateErr,
                );
                return NextResponse.json(
                    {
                        error: "Failed to update event",
                        details: updateErr.message,
                    },
                    { status: 500 },
                );
            }
            console.log("[Event Scrape] Refreshed event:", refresh_event_id);
            return NextResponse.json({
                success: true,
                updated: true,
                event: updated,
            });
        }

        console.log("[Event Scrape] Pre-processing events for batch insert...");
        const seenFingerprints = new Set<string>(); // Track fingerprints within this batch

        for (const event of extractedEvents) {
            if (!event.name || !event.event_date || !event.event_type) {
                console.log(
                    "[Event Scrape] Skipping invalid event (missing required fields):",
                    {
                        name: event.name,
                        date: event.event_date,
                        type: event.event_type,
                    },
                );
                skipped++;
                continue;
            }

            // Clean and validate event name
            const cleanedName = event.name.trim();
            if (!isValidEventName(cleanedName)) {
                console.log(
                    "[Event Scrape] Skipping invalid event name (promotional text):",
                    cleanedName,
                );
                skipped++;
                continue;
            }

            // Use cleaned name
            event.name = cleanedName;

            // Generate source_id first (for source_id duplicate check)
            const normalizedName = normalizeEventName(event.name);
            let sourceId: string;
            try {
                if (sourceUrl && sourceUrl !== "preview") {
                    const urlObj = new URL(sourceUrl);
                    sourceId =
                        `${urlObj.hostname}-${normalizedName}-${event.event_date}`
                            .replace(/[^a-zA-Z0-9-]/g, "-")
                            .substring(0, 200);
                } else {
                    sourceId = `preview-${normalizedName}-${event.event_date}`
                        .replace(/[^a-zA-Z0-9-]/g, "-")
                        .substring(0, 200);
                }
            } catch {
                sourceId = `preview-${normalizedName}-${event.event_date}`
                    .replace(/[^a-zA-Z0-9-]/g, "-")
                    .substring(0, 200);
            }

            // Check for duplicate source_id FIRST (database unique constraint - most reliable)
            const sourceIdKey = `firecrawl|${sourceId}`;
            if (existingSourceIds.has(sourceIdKey)) {
                console.log(
                    "[Event Scrape] Duplicate detected (same source_id in DB):",
                    event.name,
                    event.event_date,
                    sourceId,
                );
                duplicates++;
                skipped++;
                continue;
            }

            // Track this source_id to prevent duplicates within the same batch
            existingSourceIds.add(sourceIdKey);

            // Generate all fingerprints for this event (name+date+city, URLs, etc.)
            const eventFingerprints = generateEventFingerprints({
                name: event.name,
                event_date: event.event_date,
                city: event.city,
                venue: event.venue,
                event_url: event.event_url,
                rsvp_url: event.rsvp_url,
            });

            // Check URL-based duplicates SECOND (very reliable)
            let isDuplicate = false;
            if (event.event_url) {
                try {
                    const url = new URL(event.event_url);
                    const normalizedUrl =
                        url.hostname.replace(/^www\./, "") +
                        url.pathname.replace(/\/$/, "");
                    if (existingUrls.has(normalizedUrl.toLowerCase())) {
                        console.log(
                            "[Event Scrape] Duplicate detected (URL match in DB):",
                            event.name,
                            event.event_url,
                        );
                        isDuplicate = true;
                    }
                } catch {
                    const normalizedUrl = event.event_url
                        .toLowerCase()
                        .replace(/\/$/, "")
                        .split("?")[0];
                    if (existingUrls.has(normalizedUrl)) {
                        console.log(
                            "[Event Scrape] Duplicate detected (URL match in DB):",
                            event.name,
                            event.event_url,
                        );
                        isDuplicate = true;
                    }
                }
            }

            if (!isDuplicate && event.rsvp_url) {
                try {
                    const url = new URL(event.rsvp_url);
                    const normalizedUrl =
                        url.hostname.replace(/^www\./, "") +
                        url.pathname.replace(/\/$/, "");
                    if (existingUrls.has(normalizedUrl.toLowerCase())) {
                        console.log(
                            "[Event Scrape] Duplicate detected (RSVP URL match in DB):",
                            event.name,
                            event.rsvp_url,
                        );
                        isDuplicate = true;
                    }
                } catch {
                    const normalizedUrl = event.rsvp_url
                        .toLowerCase()
                        .replace(/\/$/, "")
                        .split("?")[0];
                    if (existingUrls.has(normalizedUrl)) {
                        console.log(
                            "[Event Scrape] Duplicate detected (RSVP URL match in DB):",
                            event.name,
                            event.rsvp_url,
                        );
                        isDuplicate = true;
                    }
                }
            }

            // Check fingerprint-based duplicates THIRD (name + date + location)
            if (!isDuplicate) {
                for (const fp of eventFingerprints) {
                    if (existingFingerprints.has(fp)) {
                        console.log(
                            "[Event Scrape] Duplicate detected (fingerprint match in DB):",
                            event.name,
                            event.event_date,
                            "fingerprint:",
                            fp,
                        );
                        isDuplicate = true;
                        break;
                    }
                    if (seenFingerprints.has(fp)) {
                        console.log(
                            "[Event Scrape] Duplicate detected (fingerprint match in batch):",
                            event.name,
                            event.event_date,
                            "fingerprint:",
                            fp,
                        );
                        isDuplicate = true;
                        break;
                    }
                }
            }

            if (isDuplicate) {
                duplicates++;
                skipped++;
                continue;
            }

            // Mark all fingerprints as seen
            eventFingerprints.forEach((fp) => seenFingerprints.add(fp));

            // Track URLs in this batch
            if (event.event_url) {
                try {
                    const url = new URL(event.event_url);
                    const normalizedUrl =
                        url.hostname.replace(/^www\./, "") +
                        url.pathname.replace(/\/$/, "");
                    existingUrls.add(normalizedUrl.toLowerCase());
                } catch {
                    existingUrls.add(
                        event.event_url
                            .toLowerCase()
                            .replace(/\/$/, "")
                            .split("?")[0],
                    );
                }
            }
            if (event.rsvp_url) {
                try {
                    const url = new URL(event.rsvp_url);
                    const normalizedUrl =
                        url.hostname.replace(/^www\./, "") +
                        url.pathname.replace(/\/$/, "");
                    existingUrls.add(normalizedUrl.toLowerCase());
                } catch {
                    existingUrls.add(
                        event.rsvp_url
                            .toLowerCase()
                            .replace(/\/$/, "")
                            .split("?")[0],
                    );
                }
            }

            // Get geocoded location from batch results
            const locationStr = [event.city, event.country]
                .filter(Boolean)
                .join(", ");
            const coords = geocodeResults.get(locationStr);
            const latitude = coords?.lat || null;
            const longitude = coords?.lon || null;

            // Normalize RSVP URL - ensure we capture registration links
            let rsvpUrl = event.rsvp_url || null;
            let eventUrl = event.event_url || null;

            // If event_url is a registration platform (Luma, Eventbrite), use it as rsvp_url
            if (eventUrl && !rsvpUrl) {
                const registrationPlatforms = [
                    "lu.ma",
                    "eventbrite.com",
                    "meetup.com",
                    "lu.ma/event",
                ];
                if (
                    registrationPlatforms.some((platform) =>
                        eventUrl!.includes(platform),
                    )
                ) {
                    rsvpUrl = eventUrl;
                    eventUrl = null; // Keep event_url empty if it's just a registration link
                }
            }

            // Prepare event for batch insert
            eventsToInsert.push({
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
                event_url: eventUrl,
                rsvp_url: rsvpUrl, // Ensure RSVP URL is captured
                banner_image_url: null, // Do not use scraped images; they were often wrong
                tags: event.tags || [],
                blockchain_focus: event.blockchain_focus || null,
                source: "firecrawl",
                source_url: sourceUrl || eventUrl || null,
                source_id: sourceId,
                status: "published",
                created_by: address,
            });

            // Store primary fingerprint for batch tracking
            const primaryFingerprint = eventFingerprints[0];
            eventFingerprints.push(primaryFingerprint);
        }

        // Batch insert events (Supabase supports up to 1000 rows per insert)
        console.log(
            "[Event Scrape] Batch inserting",
            eventsToInsert.length,
            "events...",
        );
        const BATCH_SIZE = 100; // Insert in batches of 100 for better performance

        for (let i = 0; i < eventsToInsert.length; i += BATCH_SIZE) {
            const batch = eventsToInsert.slice(i, i + BATCH_SIZE);
            const batchFingerprints = eventFingerprints.slice(
                i,
                i + BATCH_SIZE,
            );

            try {
                const { data: newEvents, error: batchError } = await supabase
                    .from("shout_events")
                    .insert(batch)
                    .select();

                if (batchError) {
                    // If batch fails, try inserting individually to identify problematic events
                    console.error(
                        "[Event Scrape] Batch insert error, falling back to individual inserts:",
                        batchError,
                    );
                    for (let j = 0; j < batch.length; j++) {
                        try {
                            const { data: newEvent, error: insertError } =
                                await supabase
                                    .from("shout_events")
                                    .insert(batch[j])
                                    .select()
                                    .single();

                            if (insertError) {
                                if (insertError.code === "23505") {
                                    duplicates++;
                                    skipped++;
                                } else {
                                    console.error(
                                        "[Event Scrape] Insert error for",
                                        batch[j].name,
                                        ":",
                                        insertError,
                                    );
                                    skipped++;
                                }
                            } else {
                                inserted++;
                                insertedEvents.push(newEvent);
                                // Add fingerprints and URLs to prevent duplicates
                                const insertedEvent = batch[j];
                                if (insertedEvent.event_url) {
                                    try {
                                        const url = new URL(
                                            insertedEvent.event_url,
                                        );
                                        const normalizedUrl =
                                            url.hostname.replace(/^www\./, "") +
                                            url.pathname.replace(/\/$/, "");
                                        existingUrls.add(
                                            normalizedUrl.toLowerCase(),
                                        );
                                    } catch {
                                        existingUrls.add(
                                            insertedEvent.event_url
                                                .toLowerCase()
                                                .replace(/\/$/, "")
                                                .split("?")[0],
                                        );
                                    }
                                }
                                if (insertedEvent.rsvp_url) {
                                    try {
                                        const url = new URL(
                                            insertedEvent.rsvp_url,
                                        );
                                        const normalizedUrl =
                                            url.hostname.replace(/^www\./, "") +
                                            url.pathname.replace(/\/$/, "");
                                        existingUrls.add(
                                            normalizedUrl.toLowerCase(),
                                        );
                                    } catch {
                                        existingUrls.add(
                                            insertedEvent.rsvp_url
                                                .toLowerCase()
                                                .replace(/\/$/, "")
                                                .split("?")[0],
                                        );
                                    }
                                }
                                existingFingerprints.add(batchFingerprints[j]);
                            }
                        } catch (err) {
                            console.error(
                                "[Event Scrape] Error inserting event:",
                                err,
                            );
                            skipped++;
                        }
                    }
                } else {
                    // Batch insert succeeded
                    inserted += newEvents?.length || 0;
                    insertedEvents.push(...(newEvents || []));
                    // Add fingerprints, URLs, and source_ids to prevent duplicates
                    batchFingerprints.forEach((fp) =>
                        existingFingerprints.add(fp),
                    );
                    batch.forEach((event, idx) => {
                        if (event.source_id) {
                            existingSourceIds.add(
                                `firecrawl|${event.source_id}`,
                            );
                        }
                        // Track URLs
                        if (event.event_url) {
                            try {
                                const url = new URL(event.event_url);
                                const normalizedUrl =
                                    url.hostname.replace(/^www\./, "") +
                                    url.pathname.replace(/\/$/, "");
                                existingUrls.add(normalizedUrl.toLowerCase());
                            } catch {
                                existingUrls.add(
                                    event.event_url
                                        .toLowerCase()
                                        .replace(/\/$/, "")
                                        .split("?")[0],
                                );
                            }
                        }
                        if (event.rsvp_url) {
                            try {
                                const url = new URL(event.rsvp_url);
                                const normalizedUrl =
                                    url.hostname.replace(/^www\./, "") +
                                    url.pathname.replace(/\/$/, "");
                                existingUrls.add(normalizedUrl.toLowerCase());
                            } catch {
                                existingUrls.add(
                                    event.rsvp_url
                                        .toLowerCase()
                                        .replace(/\/$/, "")
                                        .split("?")[0],
                                );
                            }
                        }
                    });
                    console.log(
                        "[Event Scrape] Successfully batch inserted",
                        newEvents?.length || 0,
                        "events",
                    );
                }
            } catch (err) {
                console.error("[Event Scrape] Error in batch insert:", err);
                skipped += batch.length;
            }
        }

        // Optionally save the source for recurring scrapes
        if (save_source && sourceUrl && sourceUrl !== "preview") {
            try {
                const nextScrapeAt = new Date();
                nextScrapeAt.setHours(
                    nextScrapeAt.getHours() + scrape_interval_hours,
                );
                const urlObj = new URL(sourceUrl);

                await supabase.from("shout_event_sources").upsert(
                    {
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
                    },
                    { onConflict: "url" },
                );
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
            pages_scraped: pageCount,
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
        console.error(
            "[Event Scrape] Error message:",
            error instanceof Error ? error.message : String(error),
        );
        console.error(
            "[Event Scrape] Error stack:",
            error instanceof Error ? error.stack : "No stack trace",
        );

        // Try to stringify error for more details
        let errorDetails: any = {};
        try {
            if (error instanceof Error) {
                errorDetails = {
                    name: error.name,
                    message: error.message,
                    stack: error.stack?.split("\n").slice(0, 10), // First 10 lines of stack
                };
            } else {
                errorDetails = { raw: String(error) };
            }
        } catch {
            errorDetails = { message: String(error) };
        }

        console.error(
            "[Event Scrape] Error details:",
            JSON.stringify(errorDetails, null, 2),
        );
        console.error("[Event Scrape] ==================================");

        // Return detailed error for debugging
        return NextResponse.json(
            {
                error: "Failed to scrape events",
                details:
                    error instanceof Error ? error.message : "Unknown error",
                type: error?.constructor?.name || "Unknown",
                errorInfo: errorDetails,
                timestamp: new Date().toISOString(),
            },
            { status: 500 },
        );
    }
}
