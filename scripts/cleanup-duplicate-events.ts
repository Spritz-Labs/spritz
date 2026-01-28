#!/usr/bin/env tsx
/**
 * Cleanup Duplicate Events Script
 * 
 * This script identifies and removes duplicate events from the database.
 * It uses the same fingerprinting logic as the scrape route to ensure consistency.
 * 
 * Duplicate detection strategies:
 * 1. URL-based (most reliable): Same event_url or rsvp_url
 * 2. Fingerprint-based: Same name + date + city/venue
 * 3. Source ID: Same source + source_id
 * 
 * For each group of duplicates, keeps the oldest event (by created_at).
 */

import { createClient } from "@supabase/supabase-js";
import * as crypto from "crypto";

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Supabase credentials");
    console.error("Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Normalize event name for comparison
function normalizeEventName(name: string): string {
    return name
        .toLowerCase()
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
    const venue = (event.venue?.toLowerCase().trim() || "").replace(/[^\w]/g, "");

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
            const normalizedUrl = url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/$/, '');
            fingerprints.push(`url:${normalizedUrl.toLowerCase()}`);
        } catch {
            const normalizedUrl = event.event_url.toLowerCase().replace(/\/$/, '').split('?')[0];
            fingerprints.push(`url:${normalizedUrl}`);
        }
    }

    if (event.rsvp_url) {
        try {
            const url = new URL(event.rsvp_url);
            const normalizedUrl = url.hostname.replace(/^www\./, '') + url.pathname.replace(/\/$/, '');
            fingerprints.push(`rsvp:${normalizedUrl.toLowerCase()}`);
        } catch {
            const normalizedUrl = event.rsvp_url.toLowerCase().replace(/\/$/, '').split('?')[0];
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
        return urlObj.hostname.replace(/^www\./, '') + urlObj.pathname.replace(/\/$/, '').toLowerCase();
    } catch {
        return url.toLowerCase().replace(/\/$/, '').split('?')[0];
    }
}

interface Event {
    id: string;
    name: string;
    event_date: string;
    city: string | null;
    venue: string | null;
    event_url: string | null;
    rsvp_url: string | null;
    source: string;
    source_id: string | null;
    status: string;
    created_at: string;
}

async function findDuplicates() {
    console.log("🔍 Fetching all events from database...");

    // Fetch all events (including drafts)
    const { data: events, error } = await supabase
        .from("shout_events")
        .select("id, name, event_date, city, venue, event_url, rsvp_url, source, source_id, status, created_at")
        .order("created_at", { ascending: true });

    if (error) {
        console.error("❌ Error fetching events:", error);
        process.exit(1);
    }

    if (!events || events.length === 0) {
        console.log("✅ No events found in database");
        return;
    }

    console.log(`📊 Found ${events.length} total events`);

    // Group events by fingerprints, URLs, and source_ids
    // Use a Set to track which events we've already marked for deletion
    const eventsToDelete = new Set<string>();
    const duplicateGroups = new Set<string>();

    // First pass: Group by source_id (database unique constraint - most reliable)
    const sourceIdGroups = new Map<string, Event[]>();
    for (const event of events as Event[]) {
        if (event.source && event.source_id) {
            const sourceIdKey = `${event.source}|${event.source_id}`;
            if (!sourceIdGroups.has(sourceIdKey)) {
                sourceIdGroups.set(sourceIdKey, []);
            }
            sourceIdGroups.get(sourceIdKey)!.push(event);
        }
    }

    // Process source_id duplicates
    for (const [sourceId, group] of sourceIdGroups.entries()) {
        if (group.length > 1) {
            group.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            const keep = group[0];
            for (let i = 1; i < group.length; i++) {
                duplicateGroups.add(`${sourceId} (source_id)`);
                eventsToDelete.add(group[i].id);
                console.log(`  🔴 Duplicate (source_id): "${group[i].name}" (${group[i].event_date}) - keeping "${keep.name}"`);
            }
        }
    }

    // Second pass: Group by URLs (very reliable)
    const urlGroups = new Map<string, Event[]>();
    for (const event of events as Event[]) {
        // Skip events already marked for deletion
        if (eventsToDelete.has(event.id)) continue;

        const normalizedEventUrl = normalizeUrl(event.event_url);
        if (normalizedEventUrl) {
            if (!urlGroups.has(normalizedEventUrl)) {
                urlGroups.set(normalizedEventUrl, []);
            }
            urlGroups.get(normalizedEventUrl)!.push(event);
        }

        const normalizedRsvpUrl = normalizeUrl(event.rsvp_url);
        if (normalizedRsvpUrl && normalizedRsvpUrl !== normalizedEventUrl) {
            if (!urlGroups.has(normalizedRsvpUrl)) {
                urlGroups.set(normalizedRsvpUrl, []);
            }
            urlGroups.get(normalizedRsvpUrl)!.push(event);
        }
    }

    // Process URL duplicates
    for (const [url, group] of urlGroups.entries()) {
        if (group.length > 1) {
            // Remove events already marked for deletion
            const uniqueGroup = group.filter(e => !eventsToDelete.has(e.id));
            if (uniqueGroup.length > 1) {
                uniqueGroup.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                const keep = uniqueGroup[0];
                for (let i = 1; i < uniqueGroup.length; i++) {
                    duplicateGroups.add(`${url} (URL)`);
                    eventsToDelete.add(uniqueGroup[i].id);
                    console.log(`  🔴 Duplicate (URL): "${uniqueGroup[i].name}" (${uniqueGroup[i].event_date}) - keeping "${keep.name}"`);
                }
            }
        }
    }

    // Third pass: Group by fingerprints (name + date + location)
    const fingerprintGroups = new Map<string, Event[]>();
    for (const event of events as Event[]) {
        // Skip events already marked for deletion
        if (eventsToDelete.has(event.id)) continue;

        const fingerprints = generateEventFingerprints(event);
        for (const fp of fingerprints) {
            if (!fingerprintGroups.has(fp)) {
                fingerprintGroups.set(fp, []);
            }
            fingerprintGroups.get(fp)!.push(event);
        }
    }

    // Process fingerprint duplicates
    for (const [fp, group] of fingerprintGroups.entries()) {
        if (group.length > 1) {
            // Remove events already marked for deletion
            const uniqueGroup = group.filter(e => !eventsToDelete.has(e.id));
            if (uniqueGroup.length > 1) {
                uniqueGroup.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                const keep = uniqueGroup[0];
                for (let i = 1; i < uniqueGroup.length; i++) {
                    duplicateGroups.add(`${fp} (fingerprint)`);
                    eventsToDelete.add(uniqueGroup[i].id);
                    console.log(`  🔴 Duplicate (fingerprint): "${uniqueGroup[i].name}" (${uniqueGroup[i].event_date}) - keeping "${keep.name}"`);
                }
            }
        }
    }

    console.log(`\n📈 Summary:`);
    console.log(`   Total events: ${events.length}`);
    console.log(`   Duplicate groups found: ${duplicateGroups.size}`);
    console.log(`   Events to delete: ${eventsToDelete.size}`);

    if (eventsToDelete.size === 0) {
        console.log("\n✅ No duplicates found!");
        return;
    }

    // Show breakdown by status
    const toDelete = Array.from(eventsToDelete);
    const eventsToDeleteData = events.filter(e => toDelete.includes(e.id));
    const byStatus = eventsToDeleteData.reduce((acc, e) => {
        acc[e.status] = (acc[e.status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    console.log(`\n📊 Duplicates by status:`);
    for (const [status, count] of Object.entries(byStatus)) {
        console.log(`   ${status}: ${count}`);
    }

    return Array.from(eventsToDelete);
}

async function deleteDuplicates(eventIds: string[]) {
    if (eventIds.length === 0) {
        return;
    }

    console.log(`\n🗑️  Deleting ${eventIds.length} duplicate events...`);

    // Delete in batches of 100
    const BATCH_SIZE = 100;
    let deleted = 0;

    for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
        const batch = eventIds.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
            .from("shout_events")
            .delete()
            .in("id", batch);

        if (error) {
            console.error(`❌ Error deleting batch ${i / BATCH_SIZE + 1}:`, error);
        } else {
            deleted += batch.length;
            console.log(`   ✅ Deleted ${deleted}/${eventIds.length} events...`);
        }
    }

    console.log(`\n✅ Successfully deleted ${deleted} duplicate events!`);
}

async function main() {
    console.log("🧹 Starting duplicate event cleanup...\n");

    try {
        const duplicateIds = await findDuplicates();

        if (!duplicateIds || duplicateIds.length === 0) {
            return;
        }

        console.log(`\n⚠️  About to delete ${duplicateIds.length} duplicate events.`);
        console.log("   (Keeping the oldest event in each duplicate group)");

        // For safety, we'll just show what would be deleted
        // Uncomment the next line to actually delete
        // await deleteDuplicates(duplicateIds);

        console.log("\n💡 To actually delete duplicates, uncomment the deleteDuplicates call in the script.");
        console.log(`   Or run with: DELETE=true npx tsx scripts/cleanup-duplicate-events.ts`);

        // Check if DELETE env var is set
        if (process.env.DELETE === "true") {
            await deleteDuplicates(duplicateIds);
        }
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

main();
