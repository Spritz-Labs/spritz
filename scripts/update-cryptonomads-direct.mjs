#!/usr/bin/env node
/**
 * Directly update database with cryptonomads.org events
 * Standalone script - no Next.js dependencies needed
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiKey = process.env.GOOGLE_GEMINI_API_KEY;
const firecrawlKey = process.env.FIRECRAWL_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiKey || !firecrawlKey) {
    console.error('❌ Missing required environment variables');
    console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_GEMINI_API_KEY, FIRECRAWL_API_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const ai = new GoogleGenAI({ apiKey: geminiKey });
const adminAddress = '0x3f22f740d41518f5017b76eed3a63eb14d2e1b07';

// Use Firecrawl API directly
async function fetchWithFirecrawl(url) {
    console.log('📡 Fetching content from cryptonomads.org with Firecrawl...');
    
    // Generate scroll actions for infinite scroll
    const scrollActions = [];
    for (let i = 0; i < 50; i++) {
        scrollActions.push({ type: 'scroll', direction: 'down', amount: 2000 });
        scrollActions.push({ type: 'wait', milliseconds: 1500 });
    }
    scrollActions.push({ type: 'scroll', direction: 'up', amount: 99999 });
    scrollActions.push({ type: 'wait', milliseconds: 500 });
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            url: url,
            formats: ['markdown'],
            onlyMainContent: true,
            actions: scrollActions,
            timeout: 180000, // 3 minutes for 50 scrolls
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Firecrawl failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.data?.markdown || '';
}

async function extractEvents(content) {
    console.log('🤖 Extracting events with AI...');
    
    const prompt = `Extract ALL blockchain/crypto/Web3 events from cryptonomads.org. Extract EVERY event you can find.

For each event provide:
- name (required)
- description (brief)
- event_type (conference, hackathon, meetup, workshop, summit, party, networking, other)
- event_date (YYYY-MM-DD, required)
- start_time (HH:MM 24h, optional)
- venue (optional)
- city (optional)
- country (optional)
- organizer (optional)
- event_url (optional)
- rsvp_url (optional)
- image_url (optional)
- tags (array, optional)
- blockchain_focus (array, optional)

Extract as many events as possible. Return ONLY a JSON array.

Content:
${content.substring(0, 200000)}`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 32768, temperature: 0.3 },
    });

    let text = response.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found');
    
    return JSON.parse(jsonMatch[0]);
}

function generateFingerprint(event) {
    const name = event.name.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return `${name}|${event.event_date}|${(event.city || '').toLowerCase()}`;
}

async function main() {
    try {
        // 1. Fetch content
        const content = await fetchWithFirecrawl('https://cryptonomads.org/');
        console.log(`✅ Fetched ${content.length} characters\n`);

        // 2. Extract events
        const events = await extractEvents(content);
        console.log(`✅ Extracted ${events.length} events\n`);

        // 3. Get existing events
        const { data: existing } = await supabase
            .from('shout_events')
            .select('name, event_date, city');
        
        const existingFps = new Set(
            (existing || []).map(e => generateFingerprint(e))
        );

        // 4. Prepare new events
        const toInsert = [];
        let duplicates = 0;

        for (const event of events) {
            if (!event.name || !event.event_date || !event.event_type) continue;
            
            const fp = generateFingerprint(event);
            if (existingFps.has(fp)) {
                duplicates++;
                continue;
            }

            const normalizedName = event.name.toLowerCase().replace(/[^\w\s]/g, '-').replace(/\s+/g, '-');
            const sourceId = `cryptonomads-${normalizedName}-${event.event_date}`.substring(0, 200);

            toInsert.push({
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
                banner_image_url: null, // Do not use scraped images
                tags: event.tags || [],
                blockchain_focus: event.blockchain_focus || null,
                source: 'firecrawl',
                source_url: 'https://cryptonomads.org/',
                source_id: sourceId,
                status: 'draft',
                created_by: adminAddress,
            });

            existingFps.add(fp);
        }

        console.log(`📊 ${toInsert.length} new events, ${duplicates} duplicates\n`);

        // 5. Insert in batches
        if (toInsert.length === 0) {
            console.log('ℹ️  No new events to insert');
            return;
        }

        const BATCH = 100;
        let inserted = 0;

        for (let i = 0; i < toInsert.length; i += BATCH) {
            const batch = toInsert.slice(i, i + BATCH);
            const { data, error } = await supabase
                .from('shout_events')
                .insert(batch)
                .select();

            if (error) {
                console.error(`❌ Batch ${i / BATCH + 1} error:`, error.message);
                // Try individual
                for (const event of batch) {
                    const { error: e } = await supabase.from('shout_events').insert(event);
                    if (!e) inserted++;
                }
            } else {
                inserted += data?.length || 0;
                console.log(`✅ Batch ${i / BATCH + 1}: ${data?.length || 0} events`);
            }
        }

        console.log(`\n🎉 Successfully inserted ${inserted} events!`);
        console.log(`📈 Total: ${events.length} extracted, ${inserted} inserted, ${duplicates} duplicates`);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.stack) console.error(error.stack);
        process.exit(1);
    }
}

main();
