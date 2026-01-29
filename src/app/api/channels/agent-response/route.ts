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

// Regex to extract agent mentions: @[AgentName](agent-uuid)
const AGENT_MENTION_REGEX = /@\[([^\]]+)\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

// Clean base64 data from content to prevent it from polluting AI context/responses
function cleanBase64FromContent(content: string): string {
    // Remove base64 image data (data:image/... format)
    let cleaned = content.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]{100,}/g, '[image removed]');
    
    // Remove markdown images with base64 src
    cleaned = cleaned.replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/g, '[base64 image removed]');
    
    // Remove standalone long base64-like strings (100+ chars of base64 alphabet)
    cleaned = cleaned.replace(/[A-Za-z0-9+/=]{200,}/g, '[encoded data removed]');
    
    // Remove <Base64-Image-Removed> placeholders that Firecrawl may have added
    cleaned = cleaned.replace(/<Base64-Image-Removed>/g, '');
    
    return cleaned;
}

// POST: Process a message and generate agent responses if mentioned
export async function POST(request: NextRequest) {
    if (!supabase || !ai) {
        return NextResponse.json({ error: "Services not configured" }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { 
            messageContent, 
            senderAddress, 
            senderName,
            channelType, // 'global' or 'channel'
            channelId,   // null for global, UUID for channels
            originalMessageId // The ID of the message that mentioned the agent
        } = body;

        if (!messageContent || !senderAddress) {
            return NextResponse.json({ error: "Message content and sender required" }, { status: 400 });
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
            return NextResponse.json({ processed: false, message: "No agent mentions found" });
        }

        // Process each mentioned agent
        const responses: { agentId: string; agentName: string; response: string; messageId?: string }[] = [];

        for (const mention of mentions) {
            console.log(`[AgentResponse] Processing mention: ${mention.agentName} (${mention.agentId})`);
            console.log(`[AgentResponse] Channel: ${channelType}, ChannelId: ${channelId}`);
            
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

            const { data: membership, error: membershipError } = await membershipQuery.maybeSingle();

            if (membershipError) {
                console.error(`[AgentResponse] Error checking membership:`, membershipError);
                continue;
            }

            if (!membership) {
                console.log(`[AgentResponse] Agent ${mention.agentId} not in channel ${channelType}${channelId ? ` (${channelId})` : ''}`);
                // Log all memberships for this agent for debugging
                const { data: allMemberships } = await supabase
                    .from("shout_agent_channel_memberships")
                    .select("channel_type, channel_id")
                    .eq("agent_id", mention.agentId);
                console.log(`[AgentResponse] Agent ${mention.agentId} is in:`, allMemberships);
                continue;
            }

            // Fetch agent details
            const { data: agent, error: agentError } = await supabase
                .from("shout_agents")
                .select("id, name, personality, system_instructions, avatar_emoji, avatar_url, use_knowledge_base, visibility")
                .eq("id", mention.agentId)
                .maybeSingle();

            if (agentError) {
                console.error(`[AgentResponse] Error fetching agent:`, agentError);
                continue;
            }

            if (!agent) {
                console.log(`[AgentResponse] Agent ${mention.agentId} not found`);
                continue;
            }

            if (agent.visibility !== "official") {
                console.log(`[AgentResponse] Agent ${mention.agentId} (${agent.name}) visibility is "${agent.visibility}", must be "official"`);
                continue;
            }

            // Extract the question (text after the mention)
            const mentionPattern = new RegExp(`@\\[${mention.agentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\([^)]+\\)\\s*`, 'i');
            const question = messageContent.replace(mentionPattern, '').trim();

            if (!question) {
                console.log(`[AgentResponse] No question after mention for agent ${agent.name}`);
                continue;
            }

            console.log(`[AgentResponse] Generating response for agent ${agent.name} to: "${question}"`);

            // Get current date for context
            const now = new Date();
            const currentDate = now.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });

            // Build system prompt
            let systemPrompt = agent.system_instructions || 
                `You are ${agent.name}. ${agent.personality || "Be helpful and friendly."}`;
            
            // Add context about being in a channel
            systemPrompt += `\n\nCURRENT DATE: Today is ${currentDate}. When users ask about "today", "tomorrow", "this week", etc., use this date as reference.

You are participating in a public chat channel. ${senderName || senderAddress} has mentioned you with a question. Keep your response concise and helpful.

You can use markdown formatting:
- Use **bold** and *italic* for emphasis
- Use bullet points for lists
- When referencing images, ONLY use markdown with actual HTTP/HTTPS URLs: ![Description](https://example.com/image.png)
- NEVER output base64 encoded data (data:image/... or long encoded strings) - these are unreadable
- If you see base64 data in your context, ignore it completely`;

            // Get RAG context if knowledge base is enabled
            let ragContext = "";
            if (agent.use_knowledge_base) {
                try {
                    // Generate embedding for the question
                    const embeddingResult = await ai.models.embedContent({
                        model: "text-embedding-004",
                        contents: question,
                    });
                    const queryEmbedding = embeddingResult.embeddings?.[0]?.values;

                    if (queryEmbedding) {
                        const { data: chunks } = await supabase.rpc("match_knowledge_chunks", {
                            p_agent_id: agent.id,
                            p_query_embedding: `[${queryEmbedding.join(",")}]`,
                            p_match_count: 6, // Increased for better coverage
                            p_match_threshold: 0.25 // Lowered to catch more relevant results
                        });

                        if (chunks?.length) {
                            // Include source title for disambiguation, clean base64 data
                            ragContext = "\n\nRelevant context from your knowledge base:\n" + 
                                chunks.map((c: { content: string; source_title?: string }) => 
                                    `[Source: ${c.source_title || "Unknown"}]\n${cleanBase64FromContent(c.content)}`
                                ).join("\n\n---\n\n");
                        }
                    }
                } catch (err) {
                    console.error("[AgentResponse] RAG error:", err);
                }
            }

            // Generate response
            try {
                const chat = ai.chats.create({
                    model: "gemini-2.0-flash",
                    config: {
                        systemInstruction: systemPrompt + ragContext,
                        maxOutputTokens: 1024,
                    },
                });

                const response = await chat.sendMessage({
                    message: question,
                });

                const responseText = response.text?.trim();

                if (responseText) {
                    // Post the agent's response as a message in the channel
                    let insertedMessage = null;

                    if (channelType === "global") {
                        // Insert into alpha messages
                        const { data: msg, error: insertError } = await supabase
                            .from("shout_alpha_messages")
                            .insert({
                                sender_address: `agent:${agent.id}`, // Special prefix for agent messages
                                content: responseText,
                                message_type: "text",
                                reply_to_id: originalMessageId || null,
                            })
                            .select()
                            .single();

                        if (insertError) {
                            console.error("[AgentResponse] Error inserting global message:", insertError);
                        } else {
                            insertedMessage = msg;
                        }
                    } else if (channelId) {
                        // Check if this is a Waku channel
                        const { data: channel, error: channelError } = await supabase
                            .from("shout_public_channels")
                            .select("messaging_type, waku_content_topic")
                            .eq("id", channelId)
                            .single();

                        if (channelError || !channel) {
                            console.error("[AgentResponse] Error fetching channel:", channelError);
                        } else if (channel.messaging_type === "waku") {
                            // Insert into Waku channel messages
                            const { data: msg, error: insertError } = await supabase
                                .from("shout_waku_channel_messages")
                                .insert({
                                    channel_id: channelId,
                                    content_topic: channel.waku_content_topic || "",
                                    sender_address: `agent:${agent.id}`,
                                    content: responseText,
                                    message_type: "text",
                                })
                                .select()
                                .single();

                            if (insertError) {
                                console.error("[AgentResponse] Error inserting Waku channel message:", insertError);
                            } else {
                                insertedMessage = msg;
                            }
                        } else {
                            // Insert into standard channel messages
                            const { data: msg, error: insertError } = await supabase
                                .from("shout_channel_messages")
                                .insert({
                                    channel_id: channelId,
                                    sender_address: `agent:${agent.id}`,
                                    content: responseText,
                                    message_type: "text",
                                    reply_to_id: originalMessageId || null,
                                })
                                .select()
                                .single();

                            if (insertError) {
                                console.error("[AgentResponse] Error inserting channel message:", insertError);
                            } else {
                                insertedMessage = msg;
                            }
                        }
                    }

                    responses.push({
                        agentId: agent.id,
                        agentName: agent.name,
                        response: responseText,
                        messageId: insertedMessage?.id,
                    });
                }
            } catch (genError) {
                console.error(`[AgentResponse] Generation error for ${agent.name}:`, genError);
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
        return NextResponse.json({ error: "Failed to process agent mentions" }, { status: 500 });
    }
}
