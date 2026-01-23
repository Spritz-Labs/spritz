import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

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
    event_type?: string;
    event_date: string; // YYYY-MM-DD
    start_time?: string; // HH:MM
    end_time?: string;
    venue?: string;
    organizer?: string;
    event_url?: string;
    source: "official" | "community" | "sponsor";
}

// POST: Extract events from knowledge base using AI
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    if (!supabase || !ai) {
        return NextResponse.json({ error: "Services not configured" }, { status: 500 });
    }

    try {
        const { id } = await params;
        const body = await request.json();
        const { userAddress, knowledgeId, year = 2026 } = body;

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        const normalizedAddress = userAddress.toLowerCase();

        // Check if user is admin
        const { data: adminData } = await supabase
            .from("shout_admins")
            .select("wallet_address")
            .eq("wallet_address", normalizedAddress)
            .single();

        if (!adminData) {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        // Get knowledge chunks to extract events from
        let query = supabase
            .from("shout_knowledge_chunks")
            .select("id, content, knowledge_id")
            .eq("agent_id", id);

        if (knowledgeId) {
            query = query.eq("knowledge_id", knowledgeId);
        }

        const { data: chunks, error: chunksError } = await query.limit(50);

        if (chunksError || !chunks?.length) {
            return NextResponse.json({ error: "No knowledge chunks found" }, { status: 404 });
        }

        console.log(`[EventExtract] Processing ${chunks.length} chunks for agent ${id}`);

        // Get knowledge source info
        const knowledgeIds = [...new Set(chunks.map(c => c.knowledge_id))];
        const { data: knowledgeSources } = await supabase
            .from("shout_agent_knowledge")
            .select("id, title, url")
            .in("id", knowledgeIds);

        const sourceMap = new Map(knowledgeSources?.map(s => [s.id, s]) || []);

        // Combine chunks for AI processing (batch to avoid token limits)
        const batchSize = 10;
        const allExtractedEvents: ExtractedEvent[] = [];

        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            const combinedContent = batch.map(c => {
                const source = sourceMap.get(c.knowledge_id);
                return `[Source: ${source?.title || "Unknown"}]\n${c.content}`;
            }).join("\n\n---\n\n");

            // Use AI to extract events
            const prompt = `Extract structured event information from this content. The events are happening in ${year}.

IMPORTANT:
- Only extract ACTUAL EVENTS with specific dates, times, and names
- Skip navigation elements, UI text, or generic descriptions
- Use YYYY-MM-DD format for dates (year is ${year})
- Use HH:MM format for times (24-hour)
- Determine if event is "official" (main conference), "community" (side event), or "sponsor" (company-hosted)

Return a JSON array of events. Each event should have:
{
  "name": "Event Name",
  "description": "Brief description (optional)",
  "event_type": "party|summit|meetup|conference|hackathon|workshop|networking|other",
  "event_date": "YYYY-MM-DD",
  "start_time": "HH:MM (optional)",
  "end_time": "HH:MM (optional)",
  "venue": "Location name (optional)",
  "organizer": "Organizer name (optional)",
  "event_url": "URL to event page (optional)",
  "source": "official|community|sponsor"
}

If no valid events found, return an empty array [].

Content to analyze:
${combinedContent}

Return ONLY valid JSON array, no markdown or explanation:`;

            try {
                const result = await ai.models.generateContent({
                    model: "gemini-2.0-flash",
                    contents: prompt,
                    config: {
                        temperature: 0.1, // Low temperature for consistent extraction
                        maxOutputTokens: 4096,
                    }
                });

                const responseText = result.text?.trim() || "[]";
                
                // Clean up response (remove markdown code blocks if present)
                let jsonText = responseText;
                if (jsonText.startsWith("```")) {
                    jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
                }

                try {
                    const events = JSON.parse(jsonText) as ExtractedEvent[];
                    if (Array.isArray(events)) {
                        allExtractedEvents.push(...events);
                    }
                } catch (parseErr) {
                    console.error("[EventExtract] JSON parse error:", parseErr);
                }
            } catch (aiErr) {
                console.error("[EventExtract] AI extraction error:", aiErr);
            }

            // Small delay between batches to avoid rate limits
            if (i + batchSize < chunks.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        console.log(`[EventExtract] Extracted ${allExtractedEvents.length} events`);

        // Deduplicate events by name + date
        const uniqueEvents = new Map<string, ExtractedEvent>();
        for (const event of allExtractedEvents) {
            if (event.name && event.event_date) {
                const key = `${event.name.toLowerCase()}-${event.event_date}`;
                if (!uniqueEvents.has(key)) {
                    uniqueEvents.set(key, event);
                }
            }
        }

        const finalEvents = Array.from(uniqueEvents.values());
        console.log(`[EventExtract] ${finalEvents.length} unique events after deduplication`);

        // Insert events into database
        let inserted = 0;
        let skipped = 0;

        for (const event of finalEvents) {
            try {
                const { error: insertError } = await supabase
                    .from("shout_agent_events")
                    .insert({
                        agent_id: id,
                        knowledge_id: knowledgeId || null,
                        name: event.name,
                        description: event.description || null,
                        event_type: event.event_type || null,
                        event_date: event.event_date,
                        start_time: event.start_time || null,
                        end_time: event.end_time || null,
                        venue: event.venue || null,
                        organizer: event.organizer || null,
                        event_url: event.event_url || null,
                        source: event.source || "community",
                        is_verified: false,
                    });

                if (insertError) {
                    if (insertError.code === "23505") {
                        skipped++; // Duplicate
                    } else {
                        console.error("[EventExtract] Insert error:", insertError);
                    }
                } else {
                    inserted++;
                }
            } catch (err) {
                console.error("[EventExtract] Error inserting event:", err);
            }
        }

        return NextResponse.json({
            success: true,
            extracted: finalEvents.length,
            inserted,
            skipped,
            events: finalEvents,
        });
    } catch (error) {
        console.error("[EventExtract] Error:", error);
        return NextResponse.json({ error: "Failed to extract events" }, { status: 500 });
    }
}
