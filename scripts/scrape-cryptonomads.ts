#!/usr/bin/env tsx
/**
 * Directly scrape cryptonomads.org and insert events into database
 * This bypasses the admin UI and directly updates the database
 */

import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { fetchContent } from "@/lib/firecrawl";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
if (!geminiApiKey) {
    console.error("❌ Missing GOOGLE_GEMINI_API_KEY");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: geminiApiKey });

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

function normalizeEventName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[''`]/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function generateEventFingerprint(event: { name: string; event_date: string; city?: string }): string {
    const normalized = normalizeEventName(event.name);
    const date = event.event_date;
    const city = event.city?.toLowerCase().trim() || "";
    return `${normalized}|${date}|${city}`;
}

async function scrapeCryptonomads() {
    console.log("🚀 Starting cryptonomads.org scrape...\n");

    const url = "https://cryptonomads.org/";
    const adminAddress = "0x3f22f740d41518f5017b76eed3a63eb14d2e1b07"; // Default admin

    try {
        // Step 1: Scrape the website
        console.log("📡 Fetching content from cryptonomads.org...");
        const result = await fetchContent(url, {
            crawlDepth: 1,
            maxPages: 1,
            infiniteScroll: true,
            scrollCount: 50, // Scroll many times to load all events
        });

        if (!result.content || result.content.length < 100) {
            throw new Error("Not enough content found");
        }

        console.log(`✅ Fetched ${result.content.length} characters of content\n`);

        // Step 2: Extract events using AI
        console.log("🤖 Extracting events with AI...");
        const contentToAnalyze = result.content.length > 200000 
            ? result.content.substring(0, 200000) + "\n\n[Content truncated...]"
            : result.content;

        const prompt = `Extract ALL blockchain/crypto/Web3 events from cryptonomads.org. Be extremely thorough and extract EVERY single event.

CRITICAL: Extract EVERY event you can find. Look in:
- Event listings
- Cards or tiles
- Tables
- Calendar views
- Any format

For each event, provide:
- name (required)
- description (brief)
- event_type (conference, hackathon, meetup, workshop, summit, party, networking, other)
- event_date (YYYY-MM-DD, required)
- start_time (HH:MM 24h, optional)
- end_time (HH:MM 24h, optional)
- venue (optional)
- city (optional)
- country (optional)
- organizer (optional)
- event_url (link to event, optional)
- rsvp_url (optional)
- image_url (optional)
- tags (array, optional)
- blockchain_focus (array, optional)

Extract as many events as possible - aim for 50+ if they exist. Don't skip any.

Return ONLY a valid JSON array, no other text.

Content:
${contentToAnalyze}`;

        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { 
                maxOutputTokens: 32768,
                temperature: 0.3,
            },
        });

        let responseText = response.text || "";
        if (!responseText) {
            throw new Error("AI returned empty response");
        }

        // Extract JSON from response
        let jsonText = responseText;
        const codeBlockMatch = responseText.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
        if (codeBlockMatch && codeBlockMatch[1]) {
            jsonText = codeBlockMatch[1];
        } else {
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (jsonMatch && jsonMatch[0]) {
                jsonText = jsonMatch[0];
            } else {
                throw new Error("No JSON array found in AI response");
            }
        }

        // Clean JSON
        jsonText = jsonText
            .replace(/^[^\[]*/, '')
            .replace(/[^\]]*$/, '')
            .replace(/,\s*}/g, '}')
            .replace(/,\s*]/g, ']')
            .trim();

        const extractedEvents: ExtractedEvent[] = JSON.parse(jsonText);
        
        if (!Array.isArray(extractedEvents)) {
            throw new Error("AI response is not an array");
        }

        console.log(`✅ Extracted ${extractedEvents.length} events\n`);

        // Step 3: Get existing events for duplicate detection
        console.log("🔍 Checking for duplicates...");
        const { data: existingEvents } = await supabase
            .from("shout_events")
            .select("name, event_date, city");

        const existingFingerprints = new Set(
            (existingEvents || []).map(e => generateEventFingerprint(e))
        );

        // Step 4: Prepare events for insertion
        const eventsToInsert: any[] = [];
        let duplicates = 0;
        let invalid = 0;

        for (const event of extractedEvents) {
            if (!event.name || !event.event_date || !event.event_type) {
                invalid++;
                continue;
            }

            const fingerprint = generateEventFingerprint({
                name: event.name,
                event_date: event.event_date,
                city: event.city,
            });

            if (existingFingerprints.has(fingerprint)) {
                duplicates++;
                continue;
            }

            const normalizedName = normalizeEventName(event.name);
            const sourceId = `cryptonomads-${normalizedName}-${event.event_date}`.replace(/[^a-zA-Z0-9-]/g, "-").substring(0, 200);

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
                organizer: event.organizer || null,
                event_url: event.event_url || null,
                rsvp_url: event.rsvp_url || null,
                banner_image_url: event.image_url || null,
                tags: event.tags || [],
                blockchain_focus: event.blockchain_focus || null,
                source: "firecrawl",
                source_url: url,
                source_id: sourceId,
                status: "draft",
                created_by: adminAddress,
            });

            existingFingerprints.add(fingerprint);
        }

        console.log(`📊 Stats: ${eventsToInsert.length} new, ${duplicates} duplicates, ${invalid} invalid\n`);

        // Step 5: Batch insert events
        if (eventsToInsert.length === 0) {
            console.log("ℹ️  No new events to insert");
            return;
        }

        console.log(`💾 Inserting ${eventsToInsert.length} events into database...`);
        const BATCH_SIZE = 100;
        let inserted = 0;

        for (let i = 0; i < eventsToInsert.length; i += BATCH_SIZE) {
            const batch = eventsToInsert.slice(i, i + BATCH_SIZE);
            
            const { data, error } = await supabase
                .from("shout_events")
                .insert(batch)
                .select();

            if (error) {
                console.error(`❌ Error inserting batch ${i / BATCH_SIZE + 1}:`, error);
                // Try individual inserts for this batch
                for (const event of batch) {
                    try {
                        const { error: singleError } = await supabase
                            .from("shout_events")
                            .insert(event);
                        if (!singleError) inserted++;
                    } catch (err) {
                        console.error("Error inserting:", event.name, err);
                    }
                }
            } else {
                inserted += data?.length || 0;
                console.log(`✅ Inserted batch ${i / BATCH_SIZE + 1}: ${data?.length || 0} events`);
            }
        }

        console.log(`\n🎉 Successfully inserted ${inserted} events from cryptonomads.org!`);
        console.log(`📈 Total: ${extractedEvents.length} extracted, ${inserted} inserted, ${duplicates} duplicates, ${invalid} invalid`);

    } catch (error) {
        console.error("\n❌ Error:", error);
        if (error instanceof Error) {
            console.error("Message:", error.message);
            console.error("Stack:", error.stack);
        }
        process.exit(1);
    }
}

scrapeCryptonomads();
