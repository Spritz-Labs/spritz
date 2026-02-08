import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { checkRateLimit } from "@/lib/ratelimit";
import {
    estimateCostUsd,
    sanitizeErrorMessage,
    inferErrorCode,
} from "@/lib/agent-cost";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

function isEventQuery(message: string): boolean {
    const eventKeywords = [
        "event",
        "events",
        "happening",
        "schedule",
        "party",
        "parties",
        "meetup",
        "summit",
        "conference",
        "hackathon",
        "workshop",
        "gathering",
        "privacy",
        "what's on",
        "whats on",
        "register",
        "registration",
        "rsvp",
        "sign up",
        "ticket",
        "tickets",
        "feb",
        "february",
        "today",
        "tomorrow",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
    ];
    const lower = message.toLowerCase();
    return eventKeywords.some((k) => lower.includes(k));
}

async function getChannelAgentEventContext(
    supabaseClient: NonNullable<typeof supabase>,
    agentId: string,
    message: string,
): Promise<string | null> {
    if (!isEventQuery(message)) return null;
    try {
        const { data: events, error } = await supabaseClient
            .from("shout_agent_events")
            .select(
                "name, event_date, start_time, end_time, venue, organizer, event_url, rsvp_url, is_featured",
            )
            .eq("agent_id", agentId)
            .order("is_featured", { ascending: false })
            .order("event_date", { ascending: true })
            .limit(8);
        if (error || !events?.length) return null;
        const formatTime = (t: string | null) => {
            if (!t) return "";
            const [h, m] = t.split(":");
            const hour = parseInt(h, 10);
            const ampm = hour >= 12 ? "PM" : "AM";
            const h12 = hour % 12 || 12;
            return `${h12}:${m} ${ampm}`;
        };
        const lines = events.map(
            (e) =>
                `- ${e.is_featured ? "⭐ " : ""}${e.name} | 📅 ${e.event_date} ${e.start_time ? formatTime(e.start_time) : ""} | ${e.venue || ""} | ${e.rsvp_url ? `🎫 Register: ${e.rsvp_url}` : e.event_url || ""}`,
        );
        const regUrl =
            events.find(
                (e) =>
                    e.rsvp_url ||
                    (e.event_url &&
                        (e.event_url.includes("lu.ma") ||
                            e.event_url.includes("luma.com"))),
            )?.rsvp_url ||
            events.find(
                (e) =>
                    e.event_url?.includes("lu.ma") ||
                    e.event_url?.includes("luma.com"),
            )?.event_url;
        let out = `\n\n=== EVENT DATA (use this to answer) ===\n${lines.join("\n")}\nFull schedule: https://app.spritz.chat/agent/${agentId}/events\n`;
        if (regUrl) {
            out += `\nWhen users ask to register: say "I'd be happy to help!" and use this link: [Register](${regUrl}). Never say you can't register them.\n`;
        }
        return out;
    } catch {
        return null;
    }
}

async function getChannelGlobalEventsContext(
    supabaseClient: NonNullable<typeof supabase>,
    message: string,
): Promise<string | null> {
    if (!isEventQuery(message)) return null;
    try {
        const today = new Date().toISOString().split("T")[0];
        const messageLower = message.toLowerCase();
        const askToday =
            messageLower.includes("today") || messageLower.includes("tonight");
        const askTomorrow = messageLower.includes("tomorrow");
        let eventDateFilter = today;
        if (askTomorrow) {
            const t = new Date();
            t.setDate(t.getDate() + 1);
            eventDateFilter = t.toISOString().split("T")[0];
        }
        let q = supabaseClient
            .from("shout_events")
            .select(
                "name, event_type, event_date, start_time, venue, city, country, is_virtual, event_url, rsvp_url, is_featured",
            )
            .eq("status", "published")
            .gte("event_date", today)
            .order("is_featured", { ascending: false })
            .order("event_date", { ascending: true })
            .limit(25);
        if (askToday || askTomorrow) q = q.eq("event_date", eventDateFilter);
        const { data: events, error } = await q;
        if (error || !events?.length) return null;
        const lines = events.map(
            (e) =>
                `- **${e.name}** (${e.event_type}) | 📅 ${e.event_date} ${e.start_time || ""} | ${e.is_virtual ? "Virtual" : [e.venue, e.city, e.country].filter(Boolean).join(", ") || "TBA"} | ${e.rsvp_url ? `🎫 ${e.rsvp_url}` : ""}`,
        );
        return `\n\n## Global Events (use to answer)\n${lines.join("\n")}\nDirectory: https://app.spritz.chat/events\n`;
    } catch {
        return null;
    }
}

// Regex to extract agent mentions: @[AgentName](agent-uuid)
const AGENT_MENTION_REGEX =
    /@\[([^\]]+)\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

// Clean base64 data from content to prevent it from polluting AI context/responses
function cleanBase64FromContent(content: string): string {
    // Remove base64 image data (data:image/... format)
    let cleaned = content.replace(
        /data:image\/[^;]+;base64,[A-Za-z0-9+/=]{100,}/g,
        "[image removed]",
    );

    // Remove markdown images with base64 src
    cleaned = cleaned.replace(
        /!\[[^\]]*\]\(data:image\/[^)]+\)/g,
        "[base64 image removed]",
    );

    // Remove standalone long base64-like strings (100+ chars of base64 alphabet)
    cleaned = cleaned.replace(
        /[A-Za-z0-9+/=]{200,}/g,
        "[encoded data removed]",
    );

    // Remove <Base64-Image-Removed> placeholders that Firecrawl may have added
    cleaned = cleaned.replace(/<Base64-Image-Removed>/g, "");

    return cleaned;
}

// POST: Process a message and generate agent responses if mentioned
export async function POST(request: NextRequest) {
    if (!supabase || !ai) {
        return NextResponse.json(
            { error: "Services not configured" },
            { status: 500 },
        );
    }

    const rateLimitResponse = await checkRateLimit(request, "ai");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const body = await request.json();
        const {
            messageContent,
            senderAddress,
            senderName,
            channelType, // 'global', 'channel', or 'location'
            channelId, // null for global, UUID for channels/locations
            originalMessageId, // The ID of the message that mentioned the agent
        } = body;

        if (!messageContent || !senderAddress) {
            return NextResponse.json(
                { error: "Message content and sender required" },
                { status: 400 },
            );
        }

        // Find all agent mentions in the message
        const mentions: { agentId: string; agentName: string }[] = [];
        let match;
        while ((match = AGENT_MENTION_REGEX.exec(messageContent)) !== null) {
            mentions.push({
                agentName: match[1],
                agentId: match[2],
            });
        }

        if (mentions.length === 0) {
            return NextResponse.json({
                processed: false,
                message: "No agent mentions found",
            });
        }

        // Process each mentioned agent
        const responses: {
            agentId: string;
            agentName: string;
            response: string;
            messageId?: string;
        }[] = [];

        for (const mention of mentions) {
            console.log(
                `[AgentResponse] Processing mention: ${mention.agentName} (${mention.agentId})`,
            );
            console.log(
                `[AgentResponse] Channel: ${channelType}, ChannelId: ${channelId}`,
            );

            // Verify agent is in this channel
            let membershipQuery = supabase
                .from("shout_agent_channel_memberships")
                .select("agent_id")
                .eq("agent_id", mention.agentId)
                .eq("channel_type", channelType);

            if (channelType === "global") {
                membershipQuery = membershipQuery.is("channel_id", null);
            } else if (channelId) {
                membershipQuery = membershipQuery.eq("channel_id", channelId);
            }

            const { data: membership, error: membershipError } =
                await membershipQuery.maybeSingle();

            if (membershipError) {
                console.error(
                    `[AgentResponse] Error checking membership:`,
                    membershipError,
                );
                continue;
            }

            if (!membership) {
                console.log(
                    `[AgentResponse] Agent ${mention.agentId} not in channel ${channelType}${channelId ? ` (${channelId})` : ""}`,
                );
                // Log all memberships for this agent for debugging
                const { data: allMemberships } = await supabase
                    .from("shout_agent_channel_memberships")
                    .select("channel_type, channel_id")
                    .eq("agent_id", mention.agentId);
                console.log(
                    `[AgentResponse] Agent ${mention.agentId} is in:`,
                    allMemberships,
                );
                continue;
            }

            // Fetch agent details (include events_access for event context)
            const { data: agent, error: agentError } = await supabase
                .from("shout_agents")
                .select(
                    "id, name, personality, system_instructions, avatar_emoji, avatar_url, use_knowledge_base, visibility, events_access",
                )
                .eq("id", mention.agentId)
                .maybeSingle();

            if (agentError) {
                console.error(
                    `[AgentResponse] Error fetching agent:`,
                    agentError,
                );
                continue;
            }

            if (!agent) {
                console.log(
                    `[AgentResponse] Agent ${mention.agentId} not found`,
                );
                continue;
            }

            if (agent.visibility !== "official") {
                console.log(
                    `[AgentResponse] Agent ${mention.agentId} (${agent.name}) visibility is "${agent.visibility}", must be "official"`,
                );
                continue;
            }

            // Extract the question (text after the mention); allow empty for greeting reply
            const mentionPattern = new RegExp(
                `@\\[${mention.agentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\([^)]+\\)\\s*`,
                "i",
            );
            let question = messageContent.replace(mentionPattern, "").trim();
            const isGreeting = !question || question.length < 2;
            if (isGreeting) {
                question =
                    "[The user just said hi or mentioned you with no specific question.]";
            }

            console.log(
                `[AgentResponse] Generating response for agent ${agent.name} to: "${question}"`,
            );

            // Get current date for context
            const now = new Date();
            const currentDate = now.toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
            });

            // Build system prompt
            let systemPrompt =
                agent.system_instructions ||
                `You are ${agent.name}. ${agent.personality || "Be helpful and friendly."}`;

            systemPrompt += `\n\nCURRENT DATE: Today is ${currentDate}. When users ask about "today", "tomorrow", "this week", etc., use this date as reference.

You are participating in a public chat channel. ${senderName || senderAddress} has mentioned you with a question. Keep your response concise and helpful.`;

            if (isGreeting) {
                systemPrompt += `\n\nThe user just said hi or mentioned you with no specific question. Reply in one short, friendly sentence (e.g. "Howdy! How can I help?" or "Hi! What can I do for you?"). Keep it under 25 words.`;
            }

            systemPrompt += `

You MUST use rich markdown formatting to make responses readable and useful:
- Use **bold** for key terms and *italic* for emphasis
- Use bullet points and numbered lists for structured information
- ALWAYS use proper markdown links when referencing URLs: [Link Text](https://example.com)
  - Links MUST be clickable markdown links, never just plain text with arrows like "Learn more →"
  - If you know a URL from your knowledge base, always include it as a markdown link
  - Example: [Start building for Alien](https://docs.alien.org/quickstart) NOT "Start building for Alien →"
- Use ### headings to organize sections in longer responses
- Use \`inline code\` for technical terms, commands, or identifiers
- Use code blocks with language tags for code snippets
- When referencing images, ONLY use markdown with actual HTTP/HTTPS URLs: ![Description](https://example.com/image.png)
- NEVER output base64 encoded data (data:image/... or long encoded strings) - these are unreadable
- If you see base64 data in your context, ignore it completely`;

            // Event context for official agents (agent-specific + global when events_access)
            let eventContext = "";
            if (agent.visibility === "official" && isEventQuery(question)) {
                const agentEvents = await getChannelAgentEventContext(
                    supabase,
                    agent.id,
                    question,
                );
                if (agentEvents) eventContext += agentEvents;
                if (agent.events_access === true) {
                    const globalEvents = await getChannelGlobalEventsContext(
                        supabase,
                        question,
                    );
                    if (globalEvents) eventContext += globalEvents;
                }
                if (eventContext) {
                    eventContext += `\nWhen users ask to register for an event: NEVER say you can't. Say "I'd be happy to help!" and provide the registration link from the data above.`;
                }
            }

            if (eventContext) systemPrompt += eventContext;

            // Get RAG context if knowledge base is enabled
            let ragContext = "";
            if (agent.use_knowledge_base) {
                try {
                    // Generate embedding for the question
                    const embeddingResult = await ai.models.embedContent({
                        model: "gemini-embedding-001",
                        contents: question,
                        config: { outputDimensionality: 768 },
                    });
                    const queryEmbedding =
                        embeddingResult.embeddings?.[0]?.values;

                    if (queryEmbedding) {
                        const { data: chunks } = await supabase.rpc(
                            "match_knowledge_chunks",
                            {
                                p_agent_id: agent.id,
                                p_query_embedding: `[${queryEmbedding.join(",")}]`,
                                p_match_count: 6, // Increased for better coverage
                                p_match_threshold: 0.25, // Lowered to catch more relevant results
                            },
                        );

                        if (chunks?.length) {
                            // Include source title for disambiguation, clean base64 data
                            ragContext =
                                "\n\nRelevant context from your knowledge base:\n" +
                                chunks
                                    .map(
                                        (c: {
                                            content: string;
                                            source_title?: string;
                                        }) =>
                                            `[Source: ${c.source_title || "Unknown"}]\n${cleanBase64FromContent(c.content)}`,
                                    )
                                    .join("\n\n---\n\n");
                        }
                    }
                } catch (err) {
                    console.error("[AgentResponse] RAG error:", err);
                }
            }

            // Generate response
            const modelName = "gemini-2.0-flash";
            try {
                const startMs = Date.now();
                const chat = ai.chats.create({
                    model: modelName,
                    config: {
                        systemInstruction: systemPrompt + ragContext,
                        maxOutputTokens: 1024,
                    },
                });

                const response = await chat.sendMessage({
                    message: question,
                });
                const latencyMs = Date.now() - startMs;

                const responseText = response.text?.trim();

                // Extract usage metadata from chat response
                const usage = (
                    response as {
                        usageMetadata?: {
                            totalTokenCount?: number;
                            promptTokenCount?: number;
                            candidatesTokenCount?: number;
                        };
                    }
                ).usageMetadata;
                const inputTokens = usage?.promptTokenCount ?? null;
                const outputTokens = usage?.candidatesTokenCount ?? null;
                const totalTokens = usage?.totalTokenCount ?? null;
                const estimatedCost = estimateCostUsd(inputTokens, outputTokens);

                const textToPost =
                    responseText ||
                    "Sorry, I couldn't generate a response right now. Try again in a moment.";

                // Post the agent's response as a message in the channel
                let insertedMessage = null;
                if (channelType === "global") {
                    const { data: msg, error: insertError } = await supabase
                        .from("shout_alpha_messages")
                        .insert({
                            sender_address: `agent:${agent.id}`,
                            content: textToPost,
                            message_type: "text",
                            reply_to_id: originalMessageId || null,
                        })
                        .select()
                        .single();

                    if (insertError) {
                        console.error(
                            "[AgentResponse] Error inserting global message:",
                            insertError,
                        );
                    } else {
                        insertedMessage = msg;
                    }
                } else if (channelType === "location" && channelId) {
                    const { data: msg, error: insertError } = await supabase
                        .from("shout_location_chat_messages")
                        .insert({
                            location_chat_id: channelId,
                            sender_address: `agent:${agent.id}`,
                            content: textToPost,
                            message_type: "text",
                            reply_to: originalMessageId || null,
                        })
                        .select()
                        .single();

                    if (insertError) {
                        console.error(
                            "[AgentResponse] Error inserting location chat message:",
                            insertError,
                        );
                    } else {
                        insertedMessage = msg;
                    }
                } else if (channelId) {
                    const { data: channel, error: channelError } =
                        await supabase
                            .from("shout_public_channels")
                            .select("messaging_type, waku_content_topic")
                            .eq("id", channelId)
                            .single();

                    if (channelError || !channel) {
                        console.error(
                            "[AgentResponse] Error fetching channel:",
                            channelError,
                        );
                    } else if (channel.messaging_type === "waku") {
                        const { data: msg, error: insertError } = await supabase
                            .from("shout_waku_channel_messages")
                            .insert({
                                channel_id: channelId,
                                content_topic: channel.waku_content_topic || "",
                                sender_address: `agent:${agent.id}`,
                                content: textToPost,
                                message_type: "text",
                            })
                            .select()
                            .single();
                        if (insertError) {
                            console.error(
                                "[AgentResponse] Error inserting Waku channel message:",
                                insertError,
                            );
                        } else {
                            insertedMessage = msg;
                        }
                    } else {
                        const { data: msg, error: insertError } = await supabase
                            .from("shout_channel_messages")
                            .insert({
                                channel_id: channelId,
                                sender_address: `agent:${agent.id}`,
                                content: textToPost,
                                message_type: "text",
                                reply_to_id: originalMessageId || null,
                            })
                            .select()
                            .single();
                        if (insertError) {
                            console.error(
                                "[AgentResponse] Error inserting channel message:",
                                insertError,
                            );
                        } else {
                            insertedMessage = msg;
                        }
                    }
                }

                responses.push({
                    agentId: agent.id,
                    agentName: agent.name,
                    response: textToPost,
                    messageId: insertedMessage?.id,
                });

                // shout_agent_chats = single source for AI agent usage analytics (direct, public, channel @mentions)
                try {
                    await supabase.from("shout_agent_chats").insert([
                        {
                            agent_id: agent.id,
                            user_address: senderAddress,
                            role: "user",
                            content: messageContent,
                            source: "channel",
                            channel_id: channelId || null,
                            channel_type: channelType || null,
                        },
                        {
                            agent_id: agent.id,
                            user_address: senderAddress,
                            role: "assistant",
                            content: textToPost,
                            source: "channel",
                            channel_id: channelId || null,
                            channel_type: channelType || null,
                            model: modelName,
                            input_tokens: inputTokens,
                            output_tokens: outputTokens,
                            total_tokens: totalTokens,
                            latency_ms: latencyMs,
                            estimated_cost_usd: estimatedCost,
                        },
                    ]);
                } catch (kgErr) {
                    console.error(
                        "[AgentResponse] Knowledge graph insert error:",
                        kgErr,
                    );
                }
            } catch (genError) {
                console.error(
                    `[AgentResponse] Generation error for ${agent.name}:`,
                    genError,
                );
                const errMessage = sanitizeErrorMessage(genError);
                const errCode = inferErrorCode(genError);
                const fallback =
                    "Sorry, I couldn't generate a response right now. Try again in a moment.";
                try {
                    if (channelType === "global") {
                        await supabase.from("shout_alpha_messages").insert({
                            sender_address: `agent:${agent.id}`,
                            content: fallback,
                            message_type: "text",
                            reply_to_id: originalMessageId || null,
                        });
                    } else if (channelType === "location" && channelId) {
                        await supabase
                            .from("shout_location_chat_messages")
                            .insert({
                                location_chat_id: channelId,
                                sender_address: `agent:${agent.id}`,
                                content: fallback,
                                message_type: "text",
                                reply_to: originalMessageId || null,
                            });
                    } else if (channelId) {
                        const { data: ch } = await supabase
                            .from("shout_public_channels")
                            .select("messaging_type, waku_content_topic")
                            .eq("id", channelId)
                            .single();
                        if (
                            ch?.messaging_type === "waku" &&
                            ch?.waku_content_topic
                        ) {
                            await supabase
                                .from("shout_waku_channel_messages")
                                .insert({
                                    channel_id: channelId,
                                    content_topic: ch.waku_content_topic,
                                    sender_address: `agent:${agent.id}`,
                                    content: fallback,
                                    message_type: "text",
                                });
                        } else {
                            await supabase
                                .from("shout_channel_messages")
                                .insert({
                                    channel_id: channelId,
                                    sender_address: `agent:${agent.id}`,
                                    content: fallback,
                                    message_type: "text",
                                    reply_to_id: originalMessageId || null,
                                });
                        }
                    }
                    responses.push({
                        agentId: agent.id,
                        agentName: agent.name,
                        response: fallback,
                        messageId: undefined,
                    });
                    try {
                        await supabase.from("shout_agent_chats").insert([
                            {
                                agent_id: agent.id,
                                user_address: senderAddress,
                                role: "user",
                                content: messageContent,
                                source: "channel",
                                channel_id: channelId || null,
                                channel_type: channelType || null,
                            },
                            {
                                agent_id: agent.id,
                                user_address: senderAddress,
                                role: "assistant",
                                content: fallback,
                                source: "channel",
                                channel_id: channelId || null,
                                channel_type: channelType || null,
                                model: modelName,
                                error_code: errCode,
                                error_message: errMessage,
                            },
                        ]);
                    } catch (kgErr) {
                        console.error(
                            "[AgentResponse] Knowledge graph fallback insert error:",
                            kgErr,
                        );
                    }
                } catch (insertErr) {
                    console.error(
                        "[AgentResponse] Fallback insert error:",
                        insertErr,
                    );
                }
            }
        }

        return NextResponse.json({
            processed: true,
            mentionsFound: mentions.length,
            responsesGenerated: responses.length,
            responses,
        });
    } catch (error) {
        console.error("[AgentResponse] Error:", error);
        return NextResponse.json(
            { error: "Failed to process agent mentions" },
            { status: 500 },
        );
    }
}
