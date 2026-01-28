#!/usr/bin/env node
/**
 * Directly scrape and insert cryptonomads.org events into database
 * Uses environment variables from .env
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env file manually
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env');
const envContent = readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        envVars[key] = value;
    }
});
Object.assign(process.env, envVars);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
const firecrawlKey = process.env.FIRECRAWL_API_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

if (!geminiApiKey) {
    console.error('❌ Missing GOOGLE_GEMINI_API_KEY');
    process.exit(1);
}

if (!firecrawlKey) {
    console.error('❌ Missing FIRECRAWL_API_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const adminAddress = '0x3f22f740d41518f5017b76eed3a63eb14d2e1b07';

// Call Firecrawl API directly
async function fetchWithFirecrawl(url) {
    console.log('📡 Fetching content from Firecrawl...');
    
    // Generate scroll actions for infinite scroll (max 50 actions, max 60s wait)
    // Use 20 scrolls with 2.5s wait each = 50s total wait (under 60s limit)
    const scrollActions = [];
    for (let i = 0; i < 20; i++) {
        scrollActions.push({
            type: 'scroll',
            direction: 'down',
            amount: 3000, // Larger scrolls to load more content
        });
        scrollActions.push({
            type: 'wait',
            milliseconds: 2500, // 2.5s wait per scroll
        });
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
            timeout: 120000, // 2 minutes for 20 scrolls
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Firecrawl failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    if (!data.success) {
        throw new Error(`Firecrawl error: ${data.error || 'Unknown'}`);
    }

    return data.data?.markdown || '';
}

// Call Gemini API directly
async function extractEventsWithAI(content) {
    console.log('🤖 Extracting events with AI...');
    
    const contentToAnalyze = content.length > 200000 
        ? content.substring(0, 200000) + '\n\n[Content truncated...]'
        : content;

    const prompt = `Extract ALL blockchain/crypto/Web3 events from cryptonomads.org. Extract EVERY single event you can find.

CRITICAL INSTRUCTIONS FOR EVENT NAMES:
- Extract the ACTUAL EVENT NAME, not promotional text, discounts, or member benefits
- Skip things like "CNC Member Discount", "CNC Member tix", "Member Discount" - these are NOT event names
- The event name should be the actual conference/event title (e.g., "ETHDenver", "Consensus HK", "Satoshi Roundtable")
- If you see "Side Events" or "Events" after a name, include it (e.g., "ETHDenver Side Events")
- Look for the main event title/heading, not secondary text

CRITICAL INSTRUCTIONS FOR RSVP/REGISTRATION:
- ALWAYS look for registration/RSVP links - these are often separate from the main event URL
- Common patterns: "Register", "RSVP", "Get Tickets", "Sign Up", "Book Now", buttons with registration links
- Look for Luma links (lu.ma), Eventbrite, or other registration platforms
- If there's a registration button/link, extract it as rsvp_url
- event_url should be the main event page/info page
- rsvp_url should be the direct registration/RSVP link (if different from event_url)

For each event, provide:
- name (required) - the ACTUAL event name/title, not promotional text or discounts
- description (brief) - what the event is about
- event_type (conference, hackathon, meetup, workshop, summit, party, networking, other)
- event_date (YYYY-MM-DD, required)
- start_time (HH:MM 24h, optional)
- end_time (HH:MM 24h, optional)
- venue (optional)
- city (optional)
- country (optional)
- organizer (optional)
- event_url (link to main event page/info, optional)
- rsvp_url (link to register/RSVP - IMPORTANT: extract registration links here, optional)
- image_url (optional)
- tags (array, optional)
- blockchain_focus (array, optional)

Extract as many events as possible - aim for 50+ if they exist. Don't skip any.
Use ACTUAL event names, not promotional text.
ALWAYS look for and extract rsvp_url if a registration link exists.

Return ONLY a valid JSON array, no other text.

Content:
${contentToAnalyze}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{
                role: 'user',
                parts: [{ text: prompt }],
            }],
            generationConfig: {
                maxOutputTokens: 32768,
                temperature: 0.3,
            },
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (!text) {
        throw new Error('Empty response from Gemini');
    }

    // Extract JSON - try multiple methods
    let jsonText = text;
    
    // Try code block first
    const codeBlockMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
        jsonText = codeBlockMatch[1];
    } else {
        // Try finding JSON array
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch && jsonMatch[0]) {
            jsonText = jsonMatch[0];
        } else {
            throw new Error('No JSON array found in response');
        }
    }

    // Clean JSON
    jsonText = jsonText
        .replace(/^[^\[]*/, '')
        .replace(/[^\]]*$/, '')
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .trim();

    // Try parsing with error recovery
    try {
        return JSON.parse(jsonText);
    } catch (parseError) {
        console.warn('JSON parse error, attempting to extract valid portion...');
        console.log('Error position:', parseError.message.match(/position (\d+)/)?.[1] || 'unknown');
        
        // Strategy: Find all complete objects by counting braces
        const events = [];
        let currentObj = '';
        let depth = 0;
        let inString = false;
        let escapeNext = false;
        
        for (let i = 0; i < jsonText.length; i++) {
            const char = jsonText[i];
            
            if (escapeNext) {
                currentObj += char;
                escapeNext = false;
                continue;
            }
            
            if (char === '\\') {
                escapeNext = true;
                currentObj += char;
                continue;
            }
            
            if (char === '"' && !escapeNext) {
                inString = !inString;
                currentObj += char;
                continue;
            }
            
            if (inString) {
                currentObj += char;
                continue;
            }
            
            if (char === '{') {
                if (depth === 0) {
                    currentObj = '{';
                } else {
                    currentObj += char;
                }
                depth++;
            } else if (char === '}') {
                currentObj += char;
                depth--;
                if (depth === 0) {
                    // Complete object found
                    try {
                        const parsed = JSON.parse('[' + currentObj + ']');
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            events.push(parsed[0]);
                        }
                    } catch (e) {
                        // Skip malformed object
                    }
                    currentObj = '';
                }
            } else {
                if (depth > 0) {
                    currentObj += char;
                }
            }
        }
        
        if (events.length > 0) {
            console.log(`⚠️  Extracted ${events.length} events from truncated JSON`);
            return events;
        }
        
        // Fallback: Try simple last object extraction
        let lastValidIndex = jsonText.lastIndexOf('}');
        if (lastValidIndex > 0) {
            // Find the start of this object
            let objStart = jsonText.lastIndexOf('{', lastValidIndex);
            if (objStart > 0) {
                const objStr = jsonText.substring(objStart, lastValidIndex + 1);
                try {
                    const testObj = JSON.parse(objStr);
                    // Count how many complete objects we can extract
                    const allObjects = [];
                    let searchIndex = 0;
                    while (searchIndex < lastValidIndex) {
                        const nextObjStart = jsonText.indexOf('{', searchIndex);
                        if (nextObjStart === -1 || nextObjStart >= lastValidIndex) break;
                        const nextObjEnd = jsonText.indexOf('}', nextObjStart);
                        if (nextObjEnd !== -1 && nextObjEnd <= lastValidIndex) {
                            try {
                                const obj = JSON.parse(jsonText.substring(nextObjStart, nextObjEnd + 1));
                                allObjects.push(obj);
                            } catch (e) {
                                // Skip
                            }
                            searchIndex = nextObjEnd + 1;
                        } else {
                            break;
                        }
                    }
                    if (allObjects.length > 0) {
                        console.log(`⚠️  Extracted ${allObjects.length} events from JSON`);
                        return allObjects;
                    }
                } catch (e) {
                    // Continue to error
                }
            }
        }
        
        throw new Error(`JSON parse failed: ${parseError.message}. Could not recover any events.`);
    }
}

function normalizeEventName(name) {
    return name
        .toLowerCase()
        .replace(/[''`]/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function generateFingerprint(event) {
    const normalized = normalizeEventName(event.name);
    const date = event.event_date;
    const city = (event.city || '').toLowerCase().trim();
    return `${normalized}|${date}|${city}`;
}

async function main() {
    try {
        console.log('🚀 Starting cryptonomads.org scrape...\n');
        const url = 'https://cryptonomads.org/';

        // Step 1: Fetch content
        const content = await fetchWithFirecrawl(url);
        console.log(`✅ Fetched ${content.length} characters\n`);

        // Step 2: Extract events
        const extractedEvents = await extractEventsWithAI(content);
        console.log(`✅ Extracted ${extractedEvents.length} events\n`);

        // Step 3: Get existing events
        console.log('🔍 Checking for duplicates...');
        const { data: existingEvents } = await supabase
            .from('shout_events')
            .select('name, event_date, city');

        const existingFingerprints = new Set(
            (existingEvents || []).map(e => generateFingerprint(e))
        );

        // Step 4: Prepare events
        const eventsToInsert = [];
        let duplicates = 0;
        let invalid = 0;

        for (const event of extractedEvents) {
            if (!event.name || !event.event_date || !event.event_type) {
                invalid++;
                continue;
            }

            const fingerprint = generateFingerprint(event);
            if (existingFingerprints.has(fingerprint)) {
                duplicates++;
                continue;
            }

            const normalizedName = normalizeEventName(event.name);
            const sourceId = `cryptonomads-${normalizedName}-${event.event_date}`
                .replace(/[^a-zA-Z0-9-]/g, '-')
                .substring(0, 200);

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
                source: 'firecrawl',
                source_url: url,
                source_id: sourceId,
                status: 'draft',
                created_by: adminAddress,
            });

            existingFingerprints.add(fingerprint);
        }

        console.log(`📊 Stats: ${eventsToInsert.length} new, ${duplicates} duplicates, ${invalid} invalid\n`);

        // Step 5: Insert events
        if (eventsToInsert.length === 0) {
            console.log('ℹ️  No new events to insert');
            return;
        }

        console.log(`💾 Inserting ${eventsToInsert.length} events...`);
        const BATCH_SIZE = 100;
        let inserted = 0;

        for (let i = 0; i < eventsToInsert.length; i += BATCH_SIZE) {
            const batch = eventsToInsert.slice(i, i + BATCH_SIZE);
            const { data, error } = await supabase
                .from('shout_events')
                .insert(batch)
                .select();

            if (error) {
                console.error(`❌ Batch ${i / BATCH_SIZE + 1} error:`, error.message);
                // Try individual
                for (const event of batch) {
                    const { error: singleError } = await supabase
                        .from('shout_events')
                        .insert(event);
                    if (!singleError) inserted++;
                }
            } else {
                inserted += data?.length || 0;
                console.log(`✅ Batch ${i / BATCH_SIZE + 1}: ${data?.length || 0} events`);
            }
        }

        console.log(`\n🎉 Successfully inserted ${inserted} events from cryptonomads.org!`);
        console.log(`📈 Total: ${extractedEvents.length} extracted, ${inserted} inserted, ${duplicates} duplicates`);

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.stack) console.error(error.stack);
        process.exit(1);
    }
}

main();
