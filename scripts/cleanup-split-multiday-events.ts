#!/usr/bin/env tsx
/**
 * Cleanup Split Multi-Day Events
 *
 * Finds events that have the same name + location but different dates (e.g. "Camp BUIDL"
 * scraped as 3 rows for Feb 14, 15, 16). Merges them into one event with:
 *   event_date = earliest date, end_date = latest date, is_multi_day = true.
 * Deletes the other rows.
 *
 * Groups by: normalized name + city (and venue if city empty).
 * Only merges when dates are within MAX_DAYS_APART (default 14).
 *
 * Usage:
 *   npx tsx scripts/cleanup-split-multiday-events.ts           # dry run, print groups
 *   MERGE=true npx tsx scripts/cleanup-split-multiday-events.ts   # apply merge + delete
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// Load .env from project root
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
try {
    const envContent = readFileSync(envPath, "utf-8");
    envContent.split("\n").forEach((line) => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|["']$/g, "");
            process.env[key] = value;
        }
    });
} catch {
    // .env optional if vars set in shell
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MAX_DAYS_APART = parseInt(process.env.MAX_DAYS_APART || "14", 10);

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Supabase credentials");
    console.error(
        "Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function normalizeEventName(name: string): string {
    return name
        .toLowerCase()
        .replace(/\s+events?\s*$/i, "")
        .replace(/\s+20\d{2}\s*$/i, "")
        .replace(/[''`]/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function groupKey(event: {
    name: string;
    city: string | null;
    venue: string | null;
}): string {
    const name = normalizeEventName(event.name);
    const city = (event.city || "").trim().toLowerCase();
    const venue = (event.venue || "").trim().toLowerCase();
    const loc = city || (venue ? `venue:${venue}` : "");
    return `${name}|${loc}`;
}

interface EventRow {
    id: string;
    name: string;
    event_date: string;
    end_date: string | null;
    start_time: string | null;
    end_time: string | null;
    city: string | null;
    venue: string | null;
    is_multi_day: boolean;
    created_at: string;
}

async function main() {
    console.log("🧹 Cleanup split multi-day events\n");
    console.log(
        `   Grouping by: same name + same city (dates within ${MAX_DAYS_APART} days)\n`,
    );

    const { data: events, error } = await supabase
        .from("shout_events")
        .select(
            "id, name, event_date, end_date, start_time, end_time, city, venue, is_multi_day, created_at",
        )
        .order("event_date", { ascending: true });

    if (error) {
        console.error("❌ Error fetching events:", error);
        process.exit(1);
    }

    if (!events?.length) {
        console.log("✅ No events found.");
        return;
    }

    // Group by (normalized name, city)
    const groups = new Map<string, EventRow[]>();
    for (const e of events as EventRow[]) {
        const key = groupKey(e);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(e);
    }

    // Keep only groups with >1 event and dates within MAX_DAYS_APART
    const mergeCandidates: { key: string; events: EventRow[] }[] = [];
    for (const [key, evs] of groups.entries()) {
        if (evs.length < 2) continue;
        const dates = evs.map((e) => new Date(e.event_date).getTime());
        const minDate = Math.min(...dates);
        const maxDate = Math.max(...dates);
        const daysApart = (maxDate - minDate) / (24 * 60 * 60 * 1000);
        if (daysApart <= MAX_DAYS_APART) {
            mergeCandidates.push({ key, events: evs });
        }
    }

    if (mergeCandidates.length === 0) {
        console.log(
            "✅ No split multi-day groups found (same name + city, dates within range).",
        );
        return;
    }

    console.log(`📋 Found ${mergeCandidates.length} group(s) to merge:\n`);

    const toUpdate: { id: string; end_date: string; is_multi_day: boolean }[] =
        [];
    const toDelete: string[] = [];

    for (const { key, events: evs } of mergeCandidates) {
        const sorted = [...evs].sort(
            (a, b) =>
                new Date(a.event_date).getTime() -
                new Date(b.event_date).getTime(),
        );
        const keep = sorted[0];
        const remove = sorted.slice(1);
        const latestDate = sorted[sorted.length - 1].event_date;

        console.log(`   "${keep.name}" (${keep.city || keep.venue || "—"})`);
        console.log(`      Keep: ${keep.event_date} (id: ${keep.id})`);
        console.log(`      Set: end_date = ${latestDate}, is_multi_day = true`);
        for (const r of remove) {
            console.log(`      Delete: ${r.event_date} (id: ${r.id})`);
            toDelete.push(r.id);
        }
        toUpdate.push({
            id: keep.id,
            end_date: latestDate,
            is_multi_day: true,
        });
        console.log("");
    }

    const doMerge = process.env.MERGE === "true";
    if (!doMerge) {
        console.log("💡 Dry run. To apply merge and delete, run:");
        console.log(
            "   MERGE=true npx tsx scripts/cleanup-split-multiday-events.ts\n",
        );
        return;
    }

    console.log("🔄 Applying merge...\n");

    for (const u of toUpdate) {
        const { error: updateErr } = await supabase
            .from("shout_events")
            .update({
                end_date: u.end_date,
                is_multi_day: true,
                updated_at: new Date().toISOString(),
            })
            .eq("id", u.id);
        if (updateErr) {
            console.error(`❌ Failed to update ${u.id}:`, updateErr);
        } else {
            console.log(`   ✅ Updated ${u.id} (end_date=${u.end_date})`);
        }
    }

    if (toDelete.length > 0) {
        const { error: deleteErr } = await supabase
            .from("shout_events")
            .delete()
            .in("id", toDelete);
        if (deleteErr) {
            console.error("❌ Failed to delete duplicates:", deleteErr);
        } else {
            console.log(`   ✅ Deleted ${toDelete.length} duplicate row(s)`);
        }
    }

    console.log("\n✅ Done.");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
