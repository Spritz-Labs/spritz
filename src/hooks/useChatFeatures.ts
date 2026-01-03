"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase, isSupabaseConfigured } from "@/config/supabase";

// ============= TYPING INDICATORS =============

export function useTypingIndicator(
    userAddress: string | null,
    conversationId: string | null
) {
    const [isTyping, setIsTyping] = useState(false);
    const [peerTyping, setPeerTyping] = useState(false);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Send typing status
    const sendTypingStatus = useCallback(
        async (typing: boolean) => {
            if (!isSupabaseConfigured || !supabase || !userAddress || !conversationId)
                return;

            const client = supabase; // Capture for type narrowing
            try {
                if (typing) {
                    console.log("[Typing] Setting typing status to true");
                    await client.from("shout_typing_status").upsert(
                        {
                            conversation_id: conversationId,
                            user_address: userAddress.toLowerCase(),
                            is_typing: true,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: "conversation_id,user_address" }
                    );
                } else {
                    console.log("[Typing] Deleting typing status for", userAddress.toLowerCase());
                    const { error } = await client
                        .from("shout_typing_status")
                        .delete()
                        .eq("conversation_id", conversationId)
                        .eq("user_address", userAddress.toLowerCase());
                    
                    if (error) {
                        console.error("[Typing] Delete failed:", error);
                    } else {
                        console.log("[Typing] Typing status deleted successfully");
                    }
                }
            } catch (err) {
                console.error("[Typing] Error:", err);
            }
        },
        [userAddress, conversationId]
    );

    // Handle input change - debounced typing indicator
    const handleTyping = useCallback(() => {
        if (!isTyping) {
            setIsTyping(true);
            sendTypingStatus(true);
        }

        // Clear previous timeout
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        // Stop typing after 2 seconds of no input
        typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false);
            sendTypingStatus(false);
        }, 2000);
    }, [isTyping, sendTypingStatus]);

    // Subscribe to peer's typing status
    useEffect(() => {
        if (!isSupabaseConfigured || !supabase || !conversationId || !userAddress)
            return;

        // Reset peer typing state when conversation changes
        setPeerTyping(false);

        const client = supabase; // Capture for closure
        const channel = client
            .channel(`typing-${conversationId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "shout_typing_status",
                    filter: `conversation_id=eq.${conversationId}`,
                },
                (payload) => {
                    console.log("[Typing] Realtime event:", payload.eventType, payload);
                    const data = payload.new as any;
                    if (data && data.user_address !== userAddress.toLowerCase()) {
                        setPeerTyping(payload.eventType !== "DELETE" && data.is_typing);
                    }
                    if (payload.eventType === "DELETE") {
                        const old = payload.old as any;
                        if (old && old.user_address !== userAddress.toLowerCase()) {
                            setPeerTyping(false);
                        }
                    }
                }
            )
            .subscribe();

        // Check for stale typing status periodically (every 3 seconds)
        const checkStaleTyping = async () => {
            try {
                const { data } = await client
                    .from("shout_typing_status")
                    .select("*")
                    .eq("conversation_id", conversationId)
                    .neq("user_address", userAddress.toLowerCase())
                    .maybeSingle();
                
                if (data) {
                    // Check if it's stale (older than 5 seconds)
                    const updatedAt = new Date(data.updated_at);
                    const now = new Date();
                    const ageMs = now.getTime() - updatedAt.getTime();
                    
                    if (ageMs > 5000) {
                        // Stale, clear typing indicator
                        console.log("[Typing] Stale typing status detected, age:", ageMs, "ms");
                        setPeerTyping(false);
                        // Also delete the stale row
                        await client
                            .from("shout_typing_status")
                            .delete()
                            .eq("id", data.id);
                    } else {
                        setPeerTyping(data.is_typing);
                    }
                } else {
                    // No typing status found, ensure we show not typing
                    setPeerTyping(false);
                }
            } catch (err) {
                // Ignore errors
            }
        };
        
        // Check immediately and then every 3 seconds
        checkStaleTyping();
        const staleCheckInterval = setInterval(checkStaleTyping, 3000);

        return () => {
            client.removeChannel(channel);
            clearInterval(staleCheckInterval);
            // Clean up typing status on unmount - fire and forget
            sendTypingStatus(false);
        };
    }, [conversationId, userAddress, sendTypingStatus]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
        };
    }, []);

    // Stop typing function - clears local state and sends to server
    const stopTyping = useCallback(() => {
        setIsTyping(false);
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }
        sendTypingStatus(false);
    }, [sendTypingStatus]);

    return {
        peerTyping,
        handleTyping,
        stopTyping,
    };
}

// ============= READ RECEIPTS =============

export type MessageStatus = "pending" | "sending" | "sent" | "delivered" | "read" | "failed";

export function useReadReceipts(
    userAddress: string | null,
    conversationId: string | null
) {
    const [readReceipts, setReadReceipts] = useState<Record<string, string[]>>({});

    // Mark messages as read
    const markMessagesRead = useCallback(
        async (messageIds: string[]) => {
            if (
                !isSupabaseConfigured ||
                !supabase ||
                !userAddress ||
                !conversationId ||
                messageIds.length === 0
            )
                return;

            try {
                const receipts = messageIds.map((id) => ({
                    message_id: id,
                    conversation_id: conversationId,
                    reader_address: userAddress.toLowerCase(),
                }));

                await supabase
                    .from("shout_read_receipts")
                    .upsert(receipts, { onConflict: "message_id,reader_address" });
            } catch (err) {
                console.error("[ReadReceipts] Error marking read:", err);
            }
        },
        [userAddress, conversationId]
    );

    // Fetch read receipts for messages
    const fetchReadReceipts = useCallback(
        async (messageIds: string[]) => {
            if (!isSupabaseConfigured || !supabase || messageIds.length === 0) return;

            try {
                const { data, error } = await supabase
                    .from("shout_read_receipts")
                    .select("message_id, reader_address")
                    .in("message_id", messageIds);

                if (error) {
                    console.error("[ReadReceipts] Fetch error:", error);
                    return;
                }

                if (data && data.length > 0) {
                    console.log("[ReadReceipts] Fetched", data.length, "receipts for", messageIds.length, "messages");
                    // Merge with existing receipts instead of replacing
                    setReadReceipts((prev) => {
                        const updated = { ...prev };
                        data.forEach((row) => {
                            if (!updated[row.message_id]) {
                                updated[row.message_id] = [];
                            }
                            // Avoid duplicates
                            if (!updated[row.message_id].includes(row.reader_address)) {
                                updated[row.message_id].push(row.reader_address);
                            }
                        });
                        return updated;
                    });
                }
            } catch (err) {
                console.error("[ReadReceipts] Fetch error:", err);
            }
        },
        []
    );

    // Subscribe to realtime read receipt updates
    useEffect(() => {
        if (!isSupabaseConfigured || !supabase || !conversationId) return;

        const client = supabase; // Capture for closure
        const channel = client
            .channel(`receipts-${conversationId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "shout_read_receipts",
                    filter: `conversation_id=eq.${conversationId}`,
                },
                (payload) => {
                    const data = payload.new as any;
                    if (data) {
                        setReadReceipts((prev) => ({
                            ...prev,
                            [data.message_id]: [
                                ...(prev[data.message_id] || []),
                                data.reader_address,
                            ],
                        }));
                    }
                }
            )
            .subscribe();

        return () => {
            client.removeChannel(channel);
        };
    }, [conversationId]);

    // Get status for a message
    const getMessageStatus = useCallback(
        (messageId: string, isMine: boolean, peerAddress: string): MessageStatus => {
            if (!isMine) return "read"; // Received messages are always "read" from our perspective

            const readers = readReceipts[messageId] || [];
            const isRead = readers.some((r) => r.toLowerCase() === peerAddress.toLowerCase());
            
            // Debug logging
            if (readers.length > 0) {
                console.log("[ReadReceipts] Message", messageId.slice(0, 8), "readers:", readers, "peer:", peerAddress.slice(0, 8), "isRead:", isRead);
            }
            
            return isRead ? "read" : "sent";
        },
        [readReceipts]
    );

    return {
        readReceipts,
        markMessagesRead,
        fetchReadReceipts,
        getMessageStatus,
    };
}

// ============= MESSAGE REACTIONS =============

export type MessageReaction = {
    emoji: string;
    count: number;
    hasReacted: boolean;
    users: string[];
};

export const MESSAGE_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

export function useMessageReactions(
    userAddress: string | null,
    conversationId: string | null
) {
    const [reactions, setReactions] = useState<
        Record<string, MessageReaction[]>
    >({});

    // Fetch reactions for messages
    const fetchReactions = useCallback(
        async (messageIds: string[]) => {
            if (!isSupabaseConfigured || !supabase || messageIds.length === 0) return;

            try {
                const { data } = await supabase
                    .from("shout_message_reactions")
                    .select("message_id, user_address, emoji")
                    .in("message_id", messageIds);

                if (data) {
                    const reactionMap: Record<string, MessageReaction[]> = {};

                    // Initialize all message IDs
                    messageIds.forEach((id) => {
                        reactionMap[id] = MESSAGE_REACTION_EMOJIS.map((emoji) => ({
                            emoji,
                            count: 0,
                            hasReacted: false,
                            users: [],
                        }));
                    });

                    // Count reactions
                    data.forEach((row) => {
                        const msgReactions = reactionMap[row.message_id];
                        if (msgReactions) {
                            const idx = msgReactions.findIndex(
                                (r) => r.emoji === row.emoji
                            );
                            if (idx >= 0) {
                                msgReactions[idx].count++;
                                msgReactions[idx].users.push(row.user_address);
                                if (
                                    userAddress &&
                                    row.user_address.toLowerCase() ===
                                        userAddress.toLowerCase()
                                ) {
                                    msgReactions[idx].hasReacted = true;
                                }
                            }
                        }
                    });

                    setReactions(reactionMap);
                }
            } catch (err) {
                console.error("[MessageReactions] Fetch error:", err);
            }
        },
        [userAddress]
    );

    // Toggle reaction
    const toggleReaction = useCallback(
        async (messageId: string, emoji: string): Promise<boolean> => {
            if (!isSupabaseConfigured || !supabase || !userAddress || !conversationId)
                return false;

            const client = supabase; // Capture for type narrowing
            try {
                const { data: existing } = await client
                    .from("shout_message_reactions")
                    .select("id")
                    .eq("message_id", messageId)
                    .eq("user_address", userAddress.toLowerCase())
                    .eq("emoji", emoji)
                    .single();

                if (existing) {
                    const { error: deleteError } = await client
                        .from("shout_message_reactions")
                        .delete()
                        .eq("id", existing.id);

                    if (deleteError) {
                        console.error("[MessageReactions] Delete error:", deleteError);
                        throw deleteError;
                    }

                    setReactions((prev) => {
                        // Initialize reactions for this message if not already present
                        let msgReactions = prev[messageId];
                        if (!msgReactions) {
                            msgReactions = MESSAGE_REACTION_EMOJIS.map((e) => ({
                                emoji: e,
                                count: 0,
                                hasReacted: false,
                                users: [],
                            }));
                        } else {
                            msgReactions = [...msgReactions];
                        }

                        const idx = msgReactions.findIndex((r) => r.emoji === emoji);
                        if (idx >= 0) {
                            msgReactions[idx] = {
                                ...msgReactions[idx],
                                count: Math.max(0, msgReactions[idx].count - 1),
                                hasReacted: false,
                                users: msgReactions[idx].users.filter(
                                    (u) => u.toLowerCase() !== userAddress.toLowerCase()
                                ),
                            };
                        }
                        return { ...prev, [messageId]: msgReactions };
                    });
                } else {
                    const { error: insertError } = await client.from("shout_message_reactions").insert({
                        message_id: messageId,
                        conversation_id: conversationId,
                        user_address: userAddress.toLowerCase(),
                        emoji,
                    });

                    if (insertError) {
                        console.error("[MessageReactions] Insert error:", insertError);
                        throw insertError;
                    }

                    setReactions((prev) => {
                        // Initialize reactions for this message if not already present
                        let msgReactions = prev[messageId];
                        if (!msgReactions) {
                            msgReactions = MESSAGE_REACTION_EMOJIS.map((e) => ({
                                emoji: e,
                                count: 0,
                                hasReacted: false,
                                users: [],
                            }));
                        } else {
                            msgReactions = [...msgReactions];
                        }

                        const idx = msgReactions.findIndex((r) => r.emoji === emoji);
                        if (idx >= 0) {
                            msgReactions[idx] = {
                                ...msgReactions[idx],
                                count: msgReactions[idx].count + 1,
                                hasReacted: true,
                                users: [...msgReactions[idx].users, userAddress.toLowerCase()],
                            };
                        }
                        return { ...prev, [messageId]: msgReactions };
                    });
                }

                return true;
            } catch (err) {
                console.error("[MessageReactions] Toggle error:", err);
                return false;
            }
        },
        [userAddress, conversationId]
    );

    // Subscribe to realtime reaction updates
    useEffect(() => {
        if (!isSupabaseConfigured || !supabase || !conversationId) return;

        const client = supabase; // Capture for closure
        const channel = client
            .channel(`msg-reactions-${conversationId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "shout_message_reactions",
                    filter: `conversation_id=eq.${conversationId}`,
                },
                (payload) => {
                    // When reactions change, refetch for the affected message
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const newData = payload.new as any;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const oldData = payload.old as any;
                    const messageId = newData?.message_id || oldData?.message_id;
                    if (messageId) {
                        fetchReactions([messageId]);
                    }
                }
            )
            .subscribe();

        return () => {
            client.removeChannel(channel);
        };
    }, [conversationId, fetchReactions]);

    return {
        reactions,
        fetchReactions,
        toggleReaction,
    };
}

// ============= MUTED CONVERSATIONS =============

export function useMutedConversations(userAddress: string | null) {
    const [mutedConversations, setMutedConversations] = useState<Set<string>>(
        new Set()
    );

    // Fetch muted conversations
    useEffect(() => {
        if (!isSupabaseConfigured || !supabase || !userAddress) return;

        const client = supabase; // Capture for closure
        const fetchMuted = async () => {
            const { data } = await client
                .from("shout_muted_conversations")
                .select("conversation_id, muted_until")
                .eq("user_address", userAddress.toLowerCase());

            if (data) {
                const now = new Date();
                const muted = new Set(
                    data
                        .filter(
                            (row) =>
                                !row.muted_until || new Date(row.muted_until) > now
                        )
                        .map((row) => row.conversation_id)
                );
                setMutedConversations(muted);
            }
        };

        fetchMuted();
    }, [userAddress]);

    // Toggle mute
    const toggleMute = useCallback(
        async (conversationId: string, duration?: number) => {
            if (!isSupabaseConfigured || !supabase || !userAddress) return;

            const client = supabase; // Capture for closure
            const isMuted = mutedConversations.has(conversationId);

            if (isMuted) {
                // Unmute
                await client
                    .from("shout_muted_conversations")
                    .delete()
                    .eq("user_address", userAddress.toLowerCase())
                    .eq("conversation_id", conversationId);

                setMutedConversations((prev) => {
                    const next = new Set(prev);
                    next.delete(conversationId);
                    return next;
                });
            } else {
                // Mute
                const mutedUntil = duration
                    ? new Date(Date.now() + duration).toISOString()
                    : null;

                await client.from("shout_muted_conversations").upsert(
                    {
                        user_address: userAddress.toLowerCase(),
                        conversation_id: conversationId,
                        muted_until: mutedUntil,
                    },
                    { onConflict: "user_address,conversation_id" }
                );

                setMutedConversations((prev) => new Set([...prev, conversationId]));
            }
        },
        [userAddress, mutedConversations]
    );

    const isMuted = useCallback(
        (conversationId: string) => mutedConversations.has(conversationId),
        [mutedConversations]
    );

    return {
        mutedConversations,
        toggleMute,
        isMuted,
    };
}

// ============= LINK PREVIEWS =============

export type LinkPreview = {
    url: string;
    title: string | null;
    description: string | null;
    image: string | null;
    siteName: string | null;
};

// URL regex
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export function extractUrls(text: string): string[] {
    const matches = text.match(URL_REGEX);
    return matches || [];
}

export function useLinkPreviews() {
    const [previews, setPreviews] = useState<Record<string, LinkPreview>>({});
    const [loading, setLoading] = useState<Set<string>>(new Set());

    const fetchPreview = useCallback(async (url: string) => {
        if (previews[url] || loading.has(url)) return;

        setLoading((prev) => new Set([...prev, url]));

        try {
            // Check cache first
            if (isSupabaseConfigured && supabase) {
                const { data: cached } = await supabase
                    .from("shout_link_previews")
                    .select("*")
                    .eq("url", url)
                    .single();

                if (cached) {
                    setPreviews((prev) => ({
                        ...prev,
                        [url]: {
                            url,
                            title: cached.title,
                            description: cached.description,
                            image: cached.image_url,
                            siteName: cached.site_name,
                        },
                    }));
                    setLoading((prev) => {
                        const next = new Set(prev);
                        next.delete(url);
                        return next;
                    });
                    return;
                }
            }

            // Fetch from external API (you'd need to implement this endpoint)
            // For now, just extract basic info from URL
            const urlObj = new URL(url);
            const preview: LinkPreview = {
                url,
                title: null,
                description: null,
                image: null,
                siteName: urlObj.hostname.replace("www.", ""),
            };

            setPreviews((prev) => ({ ...prev, [url]: preview }));
        } catch (err) {
            // Invalid URL or fetch failed
        } finally {
            setLoading((prev) => {
                const next = new Set(prev);
                next.delete(url);
                return next;
            });
        }
    }, [previews, loading]);

    return {
        previews,
        loading,
        fetchPreview,
        extractUrls,
    };
}

