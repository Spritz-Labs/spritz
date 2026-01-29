import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

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
function generateEventFingerprints(event: {
    name: string;
    event_date: string;
    city?: string | null;
    venue?: string | null;
    event_url?: string | null;
    rsvp_url?: string | null;
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
            const normalizedUrl =
                url.hostname.replace(/^www\./, "") +
                url.pathname.replace(/\/$/, "");
            fingerprints.push(`url:${normalizedUrl.toLowerCase()}`);
        } catch {
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

// Normalize URL for comparison
function normalizeUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        const urlObj = new URL(url);
        return (
            urlObj.hostname.replace(/^www\./, "") +
            urlObj.pathname.replace(/\/$/, "")
        );
    } catch {
        return url.toLowerCase().replace(/\/$/, "").split("?")[0];
    }
}

// Deduplicate events using the same logic as the scrape route
function deduplicateEvents(events: any[]): any[] {
    if (!events || events.length === 0) return events;

    // Sort so featured events are processed first (we keep the first occurrence of each duplicate).
    // Then by created_at so among same featured status we keep the oldest.
    const sortedEvents = [...events].sort((a, b) => {
        const aFeatured = a.is_featured === true ? 1 : 0;
        const bFeatured = b.is_featured === true ? 1 : 0;
        if (bFeatured !== aFeatured) return bFeatured - aFeatured; // featured first
        const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
        return aDate - bDate;
    });

    const seen = new Set<string>();
    const seenUrls = new Set<string>();
    const seenSourceIds = new Set<string>();
    const uniqueEvents: any[] = [];

    for (const event of sortedEvents) {
        let isDuplicate = false;

        // Check 1: source_id (most reliable - database constraint)
        if (event.source && event.source_id) {
            const sourceIdKey = `${event.source}|${event.source_id}`;
            if (seenSourceIds.has(sourceIdKey)) {
                isDuplicate = true;
            } else {
                seenSourceIds.add(sourceIdKey);
            }
        }

        // Check 2: URLs (very reliable)
        if (!isDuplicate) {
            const normalizedEventUrl = normalizeUrl(event.event_url);
            if (
                normalizedEventUrl &&
                seenUrls.has(normalizedEventUrl.toLowerCase())
            ) {
                isDuplicate = true;
            } else if (normalizedEventUrl) {
                seenUrls.add(normalizedEventUrl.toLowerCase());
            }

            if (!isDuplicate && event.rsvp_url) {
                const normalizedRsvpUrl = normalizeUrl(event.rsvp_url);
                if (
                    normalizedRsvpUrl &&
                    normalizedRsvpUrl !== normalizedEventUrl &&
                    seenUrls.has(normalizedRsvpUrl.toLowerCase())
                ) {
                    isDuplicate = true;
                } else if (
                    normalizedRsvpUrl &&
                    normalizedRsvpUrl !== normalizedEventUrl
                ) {
                    seenUrls.add(normalizedRsvpUrl.toLowerCase());
                }
            }
        }

        // Check 3: Fingerprints (name + date + location)
        if (!isDuplicate) {
            const fingerprints = generateEventFingerprints({
                name: event.name,
                event_date: event.event_date,
                city: event.city,
                venue: event.venue,
                event_url: event.event_url,
                rsvp_url: event.rsvp_url,
            });

            for (const fp of fingerprints) {
                if (seen.has(fp)) {
                    isDuplicate = true;
                    break;
                }
            }

            if (!isDuplicate) {
                fingerprints.forEach((fp) => seen.add(fp));
            }
        }

        if (!isDuplicate) {
            uniqueEvents.push(event);
        }
    }

    return uniqueEvents;
}

export interface PublicEvent {
    id: string;
    name: string;
    description: string | null;
    event_type: string;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    timezone: string;
    is_multi_day: boolean;
    end_date: string | null;
    venue: string | null;
    city: string | null;
    country: string | null;
    is_virtual: boolean;
    virtual_url: string | null;
    organizer: string | null;
    organizer_logo_url: string | null;
    event_url: string | null;
    rsvp_url: string | null;
    ticket_url: string | null;
    banner_image_url: string | null;
    tags: string[];
    blockchain_focus: string[] | null;
    is_featured: boolean;
    registration_enabled: boolean;
    max_attendees: number | null;
    current_registrations: number;
}

// GET: List public events (published only)
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const city = searchParams.get("city");
    const country = searchParams.get("country");
    const blockchain = searchParams.get("blockchain");
    const featured = searchParams.get("featured");
    const search = searchParams.get("search");
    const from = searchParams.get("from"); // Start date filter
    const to = searchParams.get("to"); // End date filter
    const upcoming = searchParams.get("upcoming"); // Only future events
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");

    try {
        let query = supabase
            .from("shout_events")
            .select(
                `
                id, slug, name, description, event_type, event_date, start_time, end_time,
                timezone, is_multi_day, end_date, venue, address, city, country, is_virtual,
                virtual_url, organizer, organizer_logo_url, organizer_website, event_url, rsvp_url,
                ticket_url, banner_image_url, tags, blockchain_focus, is_featured,
                registration_enabled, max_attendees, current_registrations, source, source_id, created_at
            `,
                { count: "exact" },
            )
            .eq("status", "published")
            .order("is_featured", { ascending: false })
            .order("event_date", { ascending: true });

        // Filters
        if (type) query = query.eq("event_type", type);
        if (city) query = query.ilike("city", `%${city}%`);
        if (country) query = query.ilike("country", `%${country}%`);
        if (blockchain)
            query = query.contains("blockchain_focus", [blockchain]);
        if (featured === "true") query = query.eq("is_featured", true);
        if (from) query = query.gte("event_date", from);
        if (to) query = query.lte("event_date", to);
        if (upcoming === "true") {
            const today = new Date().toISOString().split("T")[0];
            query = query.gte("event_date", today);
        }
        if (search) {
            query = query.or(
                `name.ilike.%${search}%,description.ilike.%${search}%,organizer.ilike.%${search}%,city.ilike.%${search}%`,
            );
        }

        const { data: events, error, count } = await query;

        if (error) {
            console.error("[Public Events] Error fetching events:", error);
            return NextResponse.json(
                { error: "Failed to fetch events" },
                { status: 500 },
            );
        }

        // Deduplicate events before applying pagination
        const uniqueEvents = deduplicateEvents(events || []);

        // Apply pagination after deduplication
        const paginatedEvents = uniqueEvents.slice(offset, offset + limit);

        // Get interest counts for all events
        const eventIds = paginatedEvents.map((e) => e.id);
        let interestCounts: Record<
            string,
            { interested: number; going: number }
        > = {};

        if (eventIds.length > 0) {
            const { data: interests } = await supabase
                .from("shout_event_interests")
                .select("event_id, interest_type")
                .in("event_id", eventIds);

            if (interests) {
                for (const eventId of eventIds) {
                    const eventInterests = interests.filter(
                        (i) => i.event_id === eventId,
                    );
                    interestCounts[eventId] = {
                        interested: eventInterests.filter(
                            (i) => i.interest_type === "interested",
                        ).length,
                        going: eventInterests.filter(
                            (i) => i.interest_type === "going",
                        ).length,
                    };
                }
            }
        }

        // Attach interest counts to events
        const eventsWithInterests = paginatedEvents.map((event) => ({
            ...event,
            interested_count: interestCounts[event.id]?.interested || 0,
            going_count: interestCounts[event.id]?.going || 0,
        }));

        // Get unique values for filters
        const { data: filterData } = await supabase
            .from("shout_events")
            .select("event_type, city, country, blockchain_focus")
            .eq("status", "published");

        const eventTypes = [
            ...new Set(
                filterData?.map((e) => e.event_type).filter(Boolean) || [],
            ),
        ];
        const cities = [
            ...new Set(filterData?.map((e) => e.city).filter(Boolean) || []),
        ];
        const countries = [
            ...new Set(filterData?.map((e) => e.country).filter(Boolean) || []),
        ];
        const blockchains = [
            ...new Set(
                filterData
                    ?.flatMap((e) => e.blockchain_focus || [])
                    .filter(Boolean) || [],
            ),
        ];

        return NextResponse.json({
            events: eventsWithInterests,
            total: uniqueEvents.length, // Use deduplicated count
            limit,
            offset,
            filters: {
                eventTypes,
                cities,
                countries,
                blockchains,
            },
        });
    } catch (error) {
        console.error("[Public Events] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch events" },
            { status: 500 },
        );
    }
}
