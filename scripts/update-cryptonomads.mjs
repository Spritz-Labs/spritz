#!/usr/bin/env node
/**
 * Multi-source event scraper: Cryptonomads + Coinpedia.
 *
 * Cryptonomads:
 * 1. Scrape main page; discover ALL side-event listing URLs.
 * 2. Scrape each side-event page (no cap).
 * 3. Extract main events from main page; individual events from each side page.
 *
 * Coinpedia:
 * 4. Scrape https://events.coinpedia.org/ (infinite scroll); extract all events.
 *
 * 5. Dedupe by fingerprint (name|date|city) and source_id; batch insert into shout_events.
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *           GOOGLE_GEMINI_API_KEY, FIRECRAWL_API_KEY
 * Usage:
 *   Full run:  node scripts/update-cryptonomads.mjs   (or npm run update-cryptonomads)
 *   One URL:   node scripts/update-cryptonomads.mjs https://cryptonomads.org/ETHDenverSideEvents2026
 *   Or:        npm run update-cryptonomads -- https://cryptonomads.org/ETHDenverSideEvents2026
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
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
} catch (e) {
    // .env optional if vars set in shell
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
const firecrawlKey = process.env.FIRECRAWL_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiApiKey || !firecrawlKey) {
    console.error(
        "❌ Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_GEMINI_API_KEY, FIRECRAWL_API_KEY",
    );
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const adminAddress = "0x3f22f740d41518f5017b76eed3a63eb14d2e1b07";
const BASE_URL = "https://cryptonomads.org";
const COINPEDIA_EVENTS_URL = "https://events.coinpedia.org/";

// —— Firecrawl: single consistent scraper ——
// Firecrawl: max 50 actions, total wait ≤ 60s. Use 24 scrolls + 24 waits + scroll up + wait.
const SCROLL_COUNT = 24;
const SCROLL_WAIT_MS = 2450; // 24*2450 + 500 = 59.3s (under 60s limit)

function buildScrollActions() {
    const actions = [];
    for (let i = 0; i < SCROLL_COUNT; i++) {
        actions.push({ type: "scroll", direction: "down", amount: 3000 });
        actions.push({ type: "wait", milliseconds: SCROLL_WAIT_MS });
    }
    actions.push({ type: "scroll", direction: "up", amount: 99999 });
    actions.push({ type: "wait", milliseconds: 500 });
    return actions;
}

async function scrapeWithFirecrawl(url, options = {}) {
    const onlyMainContent = options.onlyMainContent !== false;
    const label = options.label || url;
    const actions = buildScrollActions();

    const doScrape = async () => {
        const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${firecrawlKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                url,
                formats: ["markdown"],
                onlyMainContent,
                actions,
                timeout: 120000,
            }),
        });
        if (!res.ok)
            throw new Error(`Firecrawl ${res.status}: ${await res.text()}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Firecrawl failed");
        return data.data?.markdown || "";
    };

    try {
        const markdown = await doScrape();
        console.log(`  ✅ ${label} → ${markdown.length} chars`);
        return markdown;
    } catch (err) {
        console.warn(`  ⚠️ ${label} failed (${err.message}), retrying once...`);
        const markdown = await doScrape();
        console.log(`  ✅ ${label} (retry) → ${markdown.length} chars`);
        return markdown;
    }
}

// —— URL discovery: all side-event listing pages ——
const KNOWN_SIDE_EVENT_PATHS = [
    "ETHDenverSideEvents2026",
    "ConsensusHKEvents2026",
    "ETHCCSideEvents2026",
    "ETHDenverSideEvents2025",
    "ConsensusHKEvents2025",
    "ETHCCSideEvents2025",
];

function discoverSideEventUrls(mainPageMarkdown) {
    const base = BASE_URL.replace(/\/$/, "");
    const seen = new Set();
    const out = [];

    function add(path) {
        const normalized = path.replace(/\/$/, "").trim();
        if (!normalized || normalized === "events") return;
        const lower = normalized.toLowerCase();
        if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(normalized)) return;
        if (lower.includes("companies")) return;
        const full = `${base}/${normalized}`;
        if (seen.has(full)) return;
        seen.add(full);
        out.push(full);
    }

    KNOWN_SIDE_EVENT_PATHS.forEach(add);

    const linkRegex = /https?:\/\/cryptonomads\.org\/([^\s)\]>"']+)/gi;
    let m;
    while ((m = linkRegex.exec(mainPageMarkdown)) !== null) {
        const path = m[1].replace(/\/$/, "");
        const lower = path.toLowerCase();
        if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(path)) continue;
        if (path.includes("companies")) continue;
        const looksLikeEventList =
            lower.includes("sideevents") ||
            lower.includes("side-events") ||
            (lower.includes("events") && /\d{4}$/.test(path)) ||
            /^[a-z0-9]+(side)?events\d{4}$/i.test(path.replace(/-/g, ""));
        if (looksLikeEventList) add(path);
    }

    return out;
}

// —— AI extraction: shared JSON parsing ——
const VALID_EVENT_TYPES = [
    "conference",
    "hackathon",
    "meetup",
    "workshop",
    "summit",
    "party",
    "networking",
    "other",
];

function parseEventsJson(text) {
    let jsonText = text.trim();
    const inCodeBlock = jsonText.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
    if (inCodeBlock && inCodeBlock[1]) jsonText = inCodeBlock[1];
    else if (jsonText.startsWith("[")) {
        const arr = text.match(/\[[\s\S]*\]/);
        if (arr && arr[0]) jsonText = arr[0];
    } else if (jsonText.startsWith("{")) {
        try {
            const obj = JSON.parse(jsonText);
            if (Array.isArray(obj.events)) return obj.events;
            if (Array.isArray(obj.data)) return obj.data;
            if (Array.isArray(obj)) return obj;
        } catch (_) {}
        const arr = text.match(/\[[\s\S]*\]/);
        if (arr && arr[0]) jsonText = arr[0];
    } else {
        const arr = text.match(/\[[\s\S]*\]/);
        if (arr && arr[0]) jsonText = arr[0];
    }
    jsonText = jsonText
        .replace(/^[^\[]*/, "")
        .replace(/[^\]]*$/, "")
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .trim();

    try {
        const parsed = JSON.parse(jsonText);
        if (Array.isArray(parsed)) return parsed;
        return [];
    } catch (e) {
        const events = [];
        let current = "";
        let depth = 0;
        let inStr = false;
        let escape = false;
        for (let i = 0; i < jsonText.length; i++) {
            const c = jsonText[i];
            if (escape) {
                current += c;
                escape = false;
                continue;
            }
            if (c === "\\") {
                escape = true;
                current += c;
                continue;
            }
            if (c === '"' && !escape) {
                inStr = !inStr;
                current += c;
                continue;
            }
            if (inStr) {
                current += c;
                continue;
            }
            if (c === "{") {
                if (depth === 0) current = "{";
                else current += c;
                depth++;
            } else if (c === "}") {
                current += c;
                depth--;
                if (depth === 0) {
                    try {
                        const one = JSON.parse("[" + current + "]")[0];
                        if (one && one.name && one.event_date) events.push(one);
                    } catch (_) {}
                    current = "";
                }
            } else if (depth > 0) current += c;
        }
        if (events.length > 0) {
            console.warn(
                "  ⚠️ Recovered",
                events.length,
                "events from truncated JSON",
            );
            return events;
        }
        throw new Error("No valid JSON array and could not recover objects");
    }
}

async function callGemini(prompt, responseMimeType = null) {
    const body = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            maxOutputTokens: 32768,
            temperature: 0.2,
            ...(responseMimeType ? { responseMimeType } : {}),
        },
    };
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
    );
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!text) throw new Error("Empty Gemini response");
    return text;
}

// Main page: conferences, summits, main event cards (not individual side events).
async function extractMainPageEvents(markdown) {
    const content =
        markdown.length > 200000
            ? markdown.substring(0, 200000) + "\n\n[Content truncated...]"
            : markdown;
    const prompt = `You are extracting blockchain/crypto/Web3 events from the cryptonomads.org MAIN page.

Rules:
- Extract each MAIN event card (conferences, summits, hackathons, big campaigns). Use the exact event name (e.g. "ETHDenver 2026", "Consensus HK").
- Do NOT use "Side Events" as the event name; that is a link to a sub-page. The main card name is e.g. "ETHDenver" or "ETHDenver 2026".
- Skip: "CNC Member Discount", "Member tix", standalone promos.
- For each event include: name (required), event_type (one of: conference, hackathon, meetup, workshop, summit, party, networking, other), event_date (YYYY-MM-DD), city, country, venue, organizer, event_url, rsvp_url, description, image_url, tags, blockchain_focus.
- Extract as many main events as you can. Return ONLY a JSON array, no other text.

Content:
${content}`;
    const text = await callGemini(prompt);
    return parseEventsJson(text);
}

// Chunk size for side-event pages: smaller = fewer events per AI call = complete JSON (avoids output truncation).
// With ~45k chars per chunk, we get ~25–40 events per chunk; 90k was yielding 50+ and truncated responses.
const SIDE_PAGE_CHUNK_CHARS = 45000;
const SIDE_PAGE_CHUNK_OVERLAP = 8000;

function chunkMarkdown(markdown, chunkSize, overlap) {
    const chunks = [];
    let start = 0;
    while (start < markdown.length) {
        let end = Math.min(start + chunkSize, markdown.length);
        chunks.push(markdown.slice(start, end));
        if (end >= markdown.length) break;
        start = end - overlap;
    }
    return chunks;
}

// Side-event listing page: each card = one event. Uses chunked extraction for long pages (100+ events).
async function extractSidePageEvents(markdown) {
    const maxSingle = 250000;
    const content =
        markdown.length > maxSingle
            ? markdown.substring(0, maxSingle) + "\n\n[Content truncated...]"
            : markdown;

    const promptForChunk = (
        chunk,
        partLabel,
    ) => `You are extracting INDIVIDUAL events from a SIDE EVENTS listing page (e.g. ETHDenver Side Events). Each card/row/tile is ONE event. This is ${partLabel} of the page.

Rules:
- One output object per event card. Use the EXACT title of that card as "name". Do not use the page title as the event name.
- Include: name (required), event_type (meetup, party, workshop, networking, conference, other), event_date (YYYY-MM-DD), start_time, end_time, venue, city, country, organizer, event_url, rsvp_url, description, image_url, tags, blockchain_focus.
- Extract EVERY card in this section. Do not summarize. Skip only: navigation, footers, "Member Discount" promos.
- Return ONLY a JSON array. No markdown fences, no explanation. Include every event in this section (we process the page in multiple sections).

Content:
${chunk}`;

    if (content.length <= SIDE_PAGE_CHUNK_CHARS) {
        const text = await callGemini(
            promptForChunk(content, "the full"),
            "application/json",
        );
        return parseEventsJson(text);
    }

    const chunks = chunkMarkdown(
        content,
        SIDE_PAGE_CHUNK_CHARS,
        SIDE_PAGE_CHUNK_OVERLAP,
    );
    const allEvents = [];
    const seenFp = new Set();
    const fp = (e) =>
        `${(e.name || "").toLowerCase().trim()}|${e.event_date || ""}|${(e.city || "").toLowerCase().trim()}`;

    for (let i = 0; i < chunks.length; i++) {
        const partLabel =
            chunks.length > 1
                ? `part ${i + 1} of ${chunks.length}`
                : "the full";
        const text = await callGemini(
            promptForChunk(chunks[i], partLabel),
            "application/json",
        );
        const events = parseEventsJson(text);
        for (const e of events) {
            if (!e.name || !e.event_date) continue;
            const key = fp(e);
            if (seenFp.has(key)) continue;
            seenFp.add(key);
            allEvents.push(e);
        }
        if (chunks.length > 1)
            console.log(
                `     chunk ${i + 1}/${chunks.length} → ${events.length} events`,
            );
    }
    return allEvents;
}

// Generic event listing page (e.g. Coinpedia): extract all crypto/blockchain/fintech events.
async function extractGenericEventListPage(markdown, siteLabel = "this site") {
    const content =
        markdown.length > 250000
            ? markdown.substring(0, 250000) + "\n\n[Content truncated...]"
            : markdown;
    const prompt = `You are extracting cryptocurrency, blockchain, and Web3/fintech events from ${siteLabel}. The page lists upcoming or ongoing events.

Rules:
- Extract EVERY event listed: each row, card, or list item is one event. Use the EXACT event name/title as shown.
- Include: name (required), event_type (conference, hackathon, meetup, workshop, summit, party, networking, other), event_date (YYYY-MM-DD; if only month/year use first day of month), start_time, end_time, venue, city, country, organizer, event_url, rsvp_url, description, image_url, tags, blockchain_focus.
- Skip: navigation, footers, filters, "Create Event" buttons, ads. Only real event entries.
- Return ONLY a JSON array. No markdown fences, no explanation.

Content:
${content}`;
    const text = await callGemini(prompt, "application/json");
    return parseEventsJson(text);
}

// —— Normalize & DB row ——
function normalizeEventName(name) {
    return (name || "")
        .toLowerCase()
        .replace(/[''`]/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function fingerprint(event) {
    const n = normalizeEventName(event.name);
    const d = event.event_date || "";
    const c = (event.city || "").toLowerCase().trim();
    return `${n}|${d}|${c}`;
}

function eventToRow(event, sourceUrl, sourceIdPrefix) {
    const n = normalizeEventName(event.name);
    const sourceId = `${sourceIdPrefix}-${n}-${event.event_date}`
        .replace(/[^a-zA-Z0-9-]/g, "-")
        .substring(0, 200);
    const eventType =
        event.event_type && VALID_EVENT_TYPES.includes(event.event_type)
            ? event.event_type
            : "other";
    return {
        name: event.name,
        description: event.description || null,
        event_type: eventType,
        event_date: event.event_date,
        start_time: event.start_time || null,
        end_time: event.end_time || null,
        venue: event.venue || null,
        city: event.city || null,
        country: event.country || null,
        organizer: event.organizer || null,
        event_url: event.event_url || null,
        rsvp_url: event.rsvp_url || null,
        banner_image_url: event.image_url || null,
        tags: Array.isArray(event.tags) ? event.tags : [],
        blockchain_focus: Array.isArray(event.blockchain_focus)
            ? event.blockchain_focus
            : null,
        source: "firecrawl",
        source_url: sourceUrl,
        source_id: sourceId,
        status: "published",
        created_by: adminAddress,
    };
}

async function main() {
    const singleUrlArg = process.argv[2]?.trim();

    if (singleUrlArg) {
        console.log("🚀 Event scraper – single URL mode\n");
        console.log("   URL:", singleUrlArg, "\n");
    } else {
        console.log("🚀 Event scraper – Cryptonomads + Coinpedia\n");
    }

    // Load existing events once for dedupe (updated after each batch insert)
    const { data: existing } = await supabase
        .from("shout_events")
        .select("name, event_date, city");
    const existingFps = new Set((existing || []).map((e) => fingerprint(e)));
    const seenSourceId = new Set();

    const skipNamePatterns = [
        /^CNC Member/i,
        /^Member Discount/i,
        /^Member tix/i,
        /^Discount$/i,
        /^tix$/i,
        /^RSVP$/i,
        /^Register$/i,
    ];

    async function processAndInsertBatch(extractedEvents, sourceUrl, label) {
        const toInsert = [];
        let duplicates = 0;
        let invalid = 0;
        const isCoinpedia =
            sourceUrl.startsWith(COINPEDIA_EVENTS_URL) ||
            sourceUrl.includes("coinpedia.org");
        const isSide =
            !isCoinpedia &&
            sourceUrl !== BASE_URL + "/" &&
            sourceUrl !== BASE_URL;
        const prefix = isCoinpedia
            ? "coinpedia"
            : isSide
              ? "cryptonomads-side"
              : "cryptonomads";

        for (const event of extractedEvents) {
            if (!event.name || !event.event_date) {
                invalid++;
                continue;
            }
            const nameTrim = String(event.name).trim();
            if (
                nameTrim.length < 3 ||
                skipNamePatterns.some((p) => p.test(nameTrim))
            ) {
                invalid++;
                continue;
            }
            const fp = fingerprint(event);
            if (existingFps.has(fp)) {
                duplicates++;
                continue;
            }
            const row = eventToRow(event, sourceUrl, prefix);
            if (seenSourceId.has(row.source_id)) {
                duplicates++;
                continue;
            }
            seenSourceId.add(row.source_id);
            existingFps.add(fp);
            toInsert.push(row);
        }

        if (toInsert.length === 0) {
            console.log(
                "   ",
                label,
                "→ 0 new (",
                duplicates,
                "duplicates,",
                invalid,
                "invalid)",
            );
            return 0;
        }

        const BATCH = 100;
        let inserted = 0;
        for (let i = 0; i < toInsert.length; i += BATCH) {
            const batch = toInsert.slice(i, i + BATCH);
            const { data, error } = await supabase
                .from("shout_events")
                .insert(batch)
                .select();
            if (error) {
                for (const row of batch) {
                    const { error: e } = await supabase
                        .from("shout_events")
                        .insert(row);
                    if (!e) inserted++;
                }
            } else {
                inserted += data?.length || 0;
            }
        }
        console.log(
            "   ",
            label,
            "→",
            inserted,
            "inserted (",
            duplicates,
            "duplicates,",
            invalid,
            "invalid)",
        );
        return inserted;
    }

    // —— Single URL mode: scrape only the given side-event (or main/coinpedia) URL ——
    if (singleUrlArg) {
        try {
            const markdown = await scrapeWithFirecrawl(singleUrlArg, {
                onlyMainContent: false,
                label: singleUrlArg,
            });
            if (!markdown || markdown.length < 300) {
                console.error("❌ Too little content from URL");
                process.exit(1);
            }
            let extracted = [];
            if (
                singleUrlArg.startsWith(COINPEDIA_EVENTS_URL) ||
                singleUrlArg.includes("coinpedia.org")
            ) {
                extracted = await extractGenericEventListPage(
                    markdown,
                    "events.coinpedia.org (crypto/blockchain events list)",
                );
            } else if (
                singleUrlArg === BASE_URL + "/" ||
                singleUrlArg === BASE_URL
            ) {
                extracted = await extractMainPageEvents(markdown);
            } else {
                extracted = await extractSidePageEvents(markdown);
            }
            const n = await processAndInsertBatch(
                extracted.map((e) => ({ ...e, _sourceUrl: singleUrlArg })),
                singleUrlArg,
                singleUrlArg,
            );
            console.log("\n🎉 Done. Inserted", n, "events from", singleUrlArg);
        } catch (e) {
            console.error("❌", e?.message || e);
            process.exit(1);
        }
        return;
    }

    // —— Full pipeline: main page, then all side-event URLs, then Coinpedia ——

    // 1) Scrape main page (full content so we get all links and cards)
    console.log("1️⃣ Scraping main page...");
    let mainMarkdown;
    try {
        mainMarkdown = await scrapeWithFirecrawl(BASE_URL + "/", {
            onlyMainContent: false,
            label: "main",
        });
    } catch (e) {
        console.error("❌ Main page scrape failed:", e.message);
        process.exit(1);
    }
    if (!mainMarkdown || mainMarkdown.length < 500) {
        console.error("❌ Main page returned too little content");
        process.exit(1);
    }

    // 2) Discover all side-event URLs (no cap)
    const sideUrls = discoverSideEventUrls(mainMarkdown);
    console.log("\n2️⃣ Side-event URLs:", sideUrls.length);
    sideUrls.forEach((u) => console.log("   ", u));

    // 3) Extract main page events and insert
    console.log("\n3️⃣ Main page: extract + insert...");
    let mainEvents = [];
    try {
        mainEvents = await extractMainPageEvents(mainMarkdown);
        const n = await processAndInsertBatch(
            mainEvents.map((e) => ({ ...e, _sourceUrl: BASE_URL + "/" })),
            BASE_URL + "/",
            "main",
        );
        console.log(
            "   Main page →",
            mainEvents.length,
            "extracted,",
            n,
            "inserted",
        );
    } catch (e) {
        console.warn("   ⚠️ Main page failed:", e.message);
    }

    // 4) Each side-event page: scrape, extract, insert immediately
    console.log("\n4️⃣ Side-event pages: scrape → extract → insert per page...");
    let sideInserted = 0;
    for (const sideUrl of sideUrls) {
        try {
            const sideMarkdown = await scrapeWithFirecrawl(sideUrl, {
                onlyMainContent: false,
                label: sideUrl,
            });
            if (!sideMarkdown || sideMarkdown.length < 300) continue;
            const sideEvents = await extractSidePageEvents(sideMarkdown);
            const n = await processAndInsertBatch(
                sideEvents.map((e) => ({ ...e, _sourceUrl: sideUrl })),
                sideUrl,
                sideUrl,
            );
            sideInserted += n;
        } catch (e) {
            console.warn("   ⚠️", sideUrl, "failed:", e.message);
        }
    }

    // 5) Coinpedia: scrape, extract, insert
    console.log("\n5️⃣ Coinpedia: scrape → extract → insert...");
    try {
        const coinpediaMarkdown = await scrapeWithFirecrawl(
            COINPEDIA_EVENTS_URL,
            { onlyMainContent: false, label: "coinpedia" },
        );
        if (coinpediaMarkdown && coinpediaMarkdown.length >= 300) {
            const coinpediaEvents = await extractGenericEventListPage(
                coinpediaMarkdown,
                "events.coinpedia.org (crypto/blockchain events list)",
            );
            await processAndInsertBatch(
                coinpediaEvents.map((e) => ({
                    ...e,
                    _sourceUrl: COINPEDIA_EVENTS_URL,
                })),
                COINPEDIA_EVENTS_URL,
                "coinpedia",
            );
        } else {
            console.warn("   ⚠️ Coinpedia returned too little content");
        }
    } catch (e) {
        console.warn("   ⚠️ Coinpedia failed:", e.message);
    }

    console.log(
        "\n🎉 Done. DB updated after each batch (main, each side page, Coinpedia).",
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
