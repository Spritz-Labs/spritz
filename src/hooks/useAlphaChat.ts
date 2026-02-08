"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { supabase, isSupabaseConfigured } from "@/config/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type AlphaMessage = {
    id: string;
    sender_address: string;
    content: string;
    message_type: "text" | "pixel_art" | "system";
    created_at: string;
    reply_to_id?: string | null;
    reply_to?: AlphaMessage | null;
    is_pinned?: boolean;
    pinned_by?: string | null;
    pinned_at?: string | null;
    is_deleted?: boolean;
    deleted_by?: string | null;
    deleted_at?: string | null;
};

export type AlphaReaction = {
    id: string;
    message_id: string;
    user_address: string;
    emoji: string;
    created_at: string;
};

export type AlphaMessageReaction = {
    emoji: string;
    count: number;
    hasReacted: boolean;
    users: string[];
};

export const ALPHA_REACTION_EMOJIS = [
    "👍",
    "❤️",
    "🔥",
    "😂",
    "🤙",
    "🤯",
    "🙏",
    "💯",
    "🙌",
    "🎉",
];

export type AlphaMembership = {
    user_address: string;
    notifications_muted: boolean;
    last_read_at: string;
    joined_at: string;
    left_at: string | null;
};

type AlphaChatState = {
    messages: AlphaMessage[];
    pinnedMessages: AlphaMessage[];
    reactions: Record<string, AlphaMessageReaction[]>;
    membership: AlphaMembership | null;
    unreadCount: number;
    isLoading: boolean;
    isLoadingMore: boolean;
    hasMore: boolean;
    isMember: boolean;
    replyingTo: AlphaMessage | null;
};

const PAGE_SIZE = 50;

export function useAlphaChat(
    userAddress: string | null,
    additionalAddresses?: (string | null)[]
) {
    const [state, setState] = useState<AlphaChatState>({
        messages: [],
        pinnedMessages: [],
        reactions: {},
        membership: null,
        unreadCount: 0,
        isLoading: true,
        isLoadingMore: false,
        hasMore: true,
        isMember: false,
        replyingTo: null,
    });
    const [isSending, setIsSending] = useState(false);
    const [thinkingAgents, setThinkingAgents] = useState<
        { id: string; name: string; emoji?: string; avatarUrl?: string }[]
    >([]);
    const channelRef = useRef<RealtimeChannel | null>(null);

    // Load membership and messages
    const loadData = useCallback(async () => {
        if (!isSupabaseConfigured || !supabase || !userAddress) {
            console.log("[AlphaChat] Not configured or no user address");
            setState((prev) => ({ ...prev, isLoading: false }));
            return;
        }

        const client = supabase;
        const addressesToCheck = [
            userAddress.toLowerCase(),
            ...(additionalAddresses || [])
                .filter((a): a is string => !!a)
                .map((a) => a.toLowerCase()),
        ].filter((a, i, arr) => arr.indexOf(a) === i);

        console.log(
            "[AlphaChat] Loading data for:",
            userAddress.toLowerCase(),
            "checking addresses:",
            addressesToCheck
        );

        try {
            // Get membership for any of the user's addresses (EOA + smart wallet) so passkey users are recognized
            const { data: membershipRows, error: membershipError } =
                await client
                    .from("shout_alpha_membership")
                    .select("*")
                    .in("user_address", addressesToCheck)
                    .is("left_at", null);

            if (membershipError) {
                console.error(
                    "[AlphaChat] Membership query error:",
                    membershipError
                );
            }

            const membershipData = membershipRows?.length
                ? membershipRows.find(
                      (r) => r.user_address === userAddress.toLowerCase()
                  ) ?? membershipRows[0]
                : null;

            console.log(
                "[AlphaChat] Membership result:",
                membershipData ? "Found" : "Not found"
            );

            if (!membershipData) {
                setState((prev) => ({
                    ...prev,
                    isLoading: false,
                    isMember: false,
                    membership: null,
                    messages: [],
                }));
                return;
            }

            // Get messages with reply_to data
            // Order descending first to get newest, then reverse for display
            const { data: messagesDesc, error: messagesError } = await client
                .from("shout_alpha_messages")
                .select(
                    "*, reply_to:reply_to_id(id, sender_address, content, message_type)"
                )
                .order("created_at", { ascending: false })
                .limit(PAGE_SIZE);

            // Reverse to get chronological order for display
            const messages = messagesDesc?.reverse() || [];
            const hasMore = (messagesDesc?.length || 0) >= PAGE_SIZE;

            if (messagesError) {
                console.error(
                    "[AlphaChat] Messages query error:",
                    messagesError
                );
            }

            // Get pinned messages
            const { data: pinnedData, error: pinnedError } = await client
                .from("shout_alpha_messages")
                .select(
                    "*, reply_to:reply_to_id(id, sender_address, content, message_type)"
                )
                .eq("is_pinned", true)
                .order("pinned_at", { ascending: false });

            if (pinnedError) {
                console.error(
                    "[AlphaChat] Pinned messages query error:",
                    pinnedError
                );
            }
            const pinnedMessages = pinnedData || [];

            console.log(
                "[AlphaChat] Loaded",
                messages?.length || 0,
                "messages"
            );

            // Get reactions for these messages
            const messageIds = messages?.map((m) => m.id) || [];
            let reactionsData: AlphaReaction[] = [];
            if (messageIds.length > 0) {
                const { data, error: reactionsError } = await client
                    .from("shout_alpha_reactions")
                    .select("*")
                    .in("message_id", messageIds);
                if (reactionsError) {
                    console.error(
                        "[AlphaChat] Reactions query error:",
                        reactionsError
                    );
                }
                reactionsData = data || [];
            }

            // Process reactions into grouped format
            const processedReactions: Record<string, AlphaMessageReaction[]> =
                {};
            messageIds.forEach((msgId) => {
                processedReactions[msgId] = ALPHA_REACTION_EMOJIS.map(
                    (emoji) => ({
                        emoji,
                        count: 0,
                        hasReacted: false,
                        users: [],
                    })
                );
            });
            reactionsData.forEach((r) => {
                if (processedReactions[r.message_id]) {
                    const idx = processedReactions[r.message_id].findIndex(
                        (x) => x.emoji === r.emoji
                    );
                    if (idx >= 0) {
                        processedReactions[r.message_id][idx].count++;
                        processedReactions[r.message_id][idx].users.push(
                            r.user_address
                        );
                        if (
                            userAddress &&
                            r.user_address.toLowerCase() ===
                                userAddress.toLowerCase()
                        ) {
                            processedReactions[r.message_id][idx].hasReacted =
                                true;
                        }
                    }
                }
            });

            // Calculate unread count
            const unreadCount =
                messages?.filter(
                    (msg) =>
                        new Date(msg.created_at) >
                        new Date(membershipData.last_read_at)
                ).length || 0;

            setState({
                messages: messages || [],
                pinnedMessages,
                reactions: processedReactions,
                membership: membershipData,
                unreadCount,
                isLoading: false,
                isLoadingMore: false,
                hasMore,
                isMember: true,
                replyingTo: null,
            });
        } catch (err) {
            console.error("[AlphaChat] Load error:", err);
            setState((prev) => ({ ...prev, isLoading: false }));
        }
    }, [userAddress, additionalAddresses]);

    // Load older messages (for infinite scroll)
    const loadMoreMessages = useCallback(async () => {
        if (
            !isSupabaseConfigured ||
            !supabase ||
            !userAddress ||
            state.isLoadingMore ||
            !state.hasMore ||
            state.messages.length === 0
        ) {
            return;
        }

        const client = supabase;
        setState((prev) => ({ ...prev, isLoadingMore: true }));

        try {
            // Get the oldest message's timestamp
            const oldestMessage = state.messages[0];
            const before = oldestMessage.created_at;

            const { data: messagesDesc, error } = await client
                .from("shout_alpha_messages")
                .select(
                    "*, reply_to:reply_to_id(id, sender_address, content, message_type)"
                )
                .lt("created_at", before)
                .order("created_at", { ascending: false })
                .limit(PAGE_SIZE);

            if (error) {
                console.error("[AlphaChat] Load more error:", error);
                setState((prev) => ({ ...prev, isLoadingMore: false }));
                return;
            }

            const olderMessages = messagesDesc?.reverse() || [];

            if (olderMessages.length > 0) {
                // Get reactions for these messages
                const messageIds = olderMessages.map((m) => m.id);
                let reactionsData: AlphaReaction[] = [];
                if (messageIds.length > 0) {
                    const { data } = await client
                        .from("shout_alpha_reactions")
                        .select("*")
                        .in("message_id", messageIds);
                    reactionsData = data || [];
                }

                // Process reactions
                const processedReactions: Record<
                    string,
                    AlphaMessageReaction[]
                > = {};
                messageIds.forEach((msgId) => {
                    processedReactions[msgId] = ALPHA_REACTION_EMOJIS.map(
                        (emoji) => ({
                            emoji,
                            count: 0,
                            hasReacted: false,
                            users: [],
                        })
                    );
                });
                reactionsData.forEach((r) => {
                    if (processedReactions[r.message_id]) {
                        const idx = processedReactions[r.message_id].findIndex(
                            (x) => x.emoji === r.emoji
                        );
                        if (idx >= 0) {
                            processedReactions[r.message_id][idx].count++;
                            processedReactions[r.message_id][idx].users.push(
                                r.user_address
                            );
                            if (
                                userAddress &&
                                r.user_address.toLowerCase() ===
                                    userAddress.toLowerCase()
                            ) {
                                processedReactions[r.message_id][
                                    idx
                                ].hasReacted = true;
                            }
                        }
                    }
                });

                setState((prev) => ({
                    ...prev,
                    messages: [...olderMessages, ...prev.messages],
                    reactions: { ...processedReactions, ...prev.reactions },
                    isLoadingMore: false,
                    hasMore: olderMessages.length >= PAGE_SIZE,
                }));

                console.log(
                    "[AlphaChat] Loaded",
                    olderMessages.length,
                    "older messages"
                );
            } else {
                setState((prev) => ({
                    ...prev,
                    isLoadingMore: false,
                    hasMore: false,
                }));
            }
        } catch (err) {
            console.error("[AlphaChat] Load more error:", err);
            setState((prev) => ({ ...prev, isLoadingMore: false }));
        }
    }, [userAddress, state.isLoadingMore, state.hasMore, state.messages]);

    // Subscribe to realtime updates
    useEffect(() => {
        if (
            !isSupabaseConfigured ||
            !supabase ||
            !userAddress ||
            !state.isMember
        ) {
            return;
        }

        const client = supabase;
        console.log("[AlphaChat] Setting up realtime subscription");

        // Subscribe to new messages
        const channel = client
            .channel("alpha-messages")
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "shout_alpha_messages",
                },
                (payload) => {
                    const newMessage = payload.new as AlphaMessage;
                    console.log(
                        "[AlphaChat] Realtime message received:",
                        newMessage.id
                    );

                    setState((prev) => {
                        // Check if message already exists (from optimistic update or duplicate)
                        const exists = prev.messages.some(
                            (m) =>
                                m.id === newMessage.id ||
                                (m.id.startsWith("temp-") &&
                                    m.sender_address ===
                                        newMessage.sender_address &&
                                    m.content === newMessage.content)
                        );

                        if (exists) {
                            console.log(
                                "[AlphaChat] Message already exists, replacing temp if needed"
                            );
                            // Replace temp message with real one
                            return {
                                ...prev,
                                messages: prev.messages.map((m) =>
                                    m.id.startsWith("temp-") &&
                                    m.sender_address ===
                                        newMessage.sender_address &&
                                    m.content === newMessage.content
                                        ? newMessage
                                        : m
                                ),
                            };
                        }

                        console.log("[AlphaChat] Adding new message to state");
                        // Only increment unread if message is from someone else
                        const isMine =
                            newMessage.sender_address.toLowerCase() ===
                            userAddress?.toLowerCase();
                        return {
                            ...prev,
                            messages: [...prev.messages, newMessage],
                            unreadCount: isMine
                                ? prev.unreadCount
                                : prev.unreadCount + 1,
                        };
                    });
                }
            )
            .subscribe((status) => {
                console.log(
                    "[AlphaChat] Realtime subscription status:",
                    status
                );
            });

        channelRef.current = channel;

        return () => {
            console.log("[AlphaChat] Cleaning up realtime subscription");
            if (channelRef.current && client) {
                client.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [userAddress, state.isMember]);

    // Load data on mount
    useEffect(() => {
        loadData();
    }, [loadData]);

    // Poll for new messages every 10 seconds as a fallback for realtime
    useEffect(() => {
        if (
            !isSupabaseConfigured ||
            !supabase ||
            !userAddress ||
            !state.isMember
        ) {
            return;
        }

        const client = supabase; // Capture for closure
        const pollInterval = setInterval(async () => {
            try {
                // Fetch latest messages (newest 100, then reverse for chronological order)
                const { data: messagesDesc, error } = await client
                    .from("shout_alpha_messages")
                    .select(
                        "*, reply_to:reply_to_id(id, sender_address, content, message_type)"
                    )
                    .order("created_at", { ascending: false })
                    .limit(100);

                if (error) {
                    console.error("[AlphaChat] Poll query error:", error);
                    return;
                }

                const messages = messagesDesc?.reverse() || [];

                if (messages.length > 0) {
                    setState((prev) => {
                        // Get the IDs of real messages (not temp ones)
                        const prevRealIds = new Set(
                            prev.messages
                                .filter((m) => !m.id.startsWith("temp-"))
                                .map((m) => m.id)
                        );
                        const newIds = new Set(messages.map((m) => m.id));

                        // Check if there are any new messages we don't have
                        const hasNewMessages = messages.some(
                            (m) => !prevRealIds.has(m.id)
                        );

                        if (
                            !hasNewMessages &&
                            prevRealIds.size === newIds.size
                        ) {
                            return prev; // No changes
                        }

                        console.log(
                            "[AlphaChat] Polling found updates, syncing messages"
                        );

                        // Keep any temp messages that aren't in the server response yet
                        const tempMessages = prev.messages.filter(
                            (m) =>
                                m.id.startsWith("temp-") &&
                                !messages.some(
                                    (serverMsg) =>
                                        serverMsg.sender_address ===
                                            m.sender_address &&
                                        serverMsg.content === m.content
                                )
                        );

                        return {
                            ...prev,
                            messages: [...messages, ...tempMessages],
                        };
                    });
                }
            } catch (err) {
                console.error("[AlphaChat] Poll error:", err);
            }
        }, 10000); // Poll every 10 seconds

        return () => clearInterval(pollInterval);
    }, [userAddress, state.isMember]);

    // Set replying to
    const setReplyingTo = useCallback((message: AlphaMessage | null) => {
        setState((prev) => ({ ...prev, replyingTo: message }));
    }, []);

    // Send a message
    const sendMessage = useCallback(
        async (
            content: string,
            messageType: "text" | "pixel_art" = "text",
            replyToId?: string
        ): Promise<boolean> => {
            if (
                !isSupabaseConfigured ||
                !supabase ||
                !userAddress ||
                !content.trim()
            ) {
                return false;
            }

            const client = supabase;
            setIsSending(true);

            // Generate temporary ID for optimistic update
            const tempId = `temp-${Date.now()}`;
            const finalReplyToId = replyToId || state.replyingTo?.id;

            // Optimistically add message to state
            const optimisticMessage: AlphaMessage = {
                id: tempId,
                sender_address: userAddress.toLowerCase(),
                content: content.trim(),
                message_type: messageType,
                created_at: new Date().toISOString(),
                reply_to_id: finalReplyToId || null,
                reply_to: state.replyingTo || null,
            };

            setState((prev) => ({
                ...prev,
                messages: [...prev.messages, optimisticMessage],
                replyingTo: null,
            }));

            try {
                const insertData: Record<string, unknown> = {
                    sender_address: userAddress.toLowerCase(),
                    content: content.trim(),
                    message_type: messageType,
                };

                // Add reply_to_id if replying
                if (finalReplyToId) {
                    insertData.reply_to_id = finalReplyToId;
                }

                const { data, error } = await client
                    .from("shout_alpha_messages")
                    .insert(insertData)
                    .select()
                    .single();

                if (error) {
                    console.error("[AlphaChat] Send error:", error);
                    // Remove optimistic message on error
                    setState((prev) => ({
                        ...prev,
                        messages: prev.messages.filter((m) => m.id !== tempId),
                    }));
                    return false;
                }

                console.log("[AlphaChat] Message sent:", data?.id);

                // Replace optimistic message with real one
                if (data) {
                    setState((prev) => ({
                        ...prev,
                        messages: prev.messages.map((m) =>
                            m.id === tempId
                                ? {
                                      ...data,
                                      reply_to: optimisticMessage.reply_to,
                                  }
                                : m
                        ),
                    }));

                    // Check for agent mentions and trigger responses
                    if (content.includes("@[") && content.includes("](")) {
                        // Extract mentioned agent names for thinking indicator
                        const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
                        const mentionedAgents: { id: string; name: string }[] = [];
                        let mentionMatch;
                        while ((mentionMatch = mentionRegex.exec(content)) !== null) {
                            const mentionId = mentionMatch[2];
                            if (mentionId && !mentionId.startsWith("0x") && !mentionId.startsWith("00")) {
                                mentionedAgents.push({ id: mentionId, name: mentionMatch[1] });
                            }
                        }

                        if (mentionedAgents.length > 0) {
                            setThinkingAgents((prev) => [
                                ...prev,
                                ...mentionedAgents.filter(
                                    (a) => !prev.some((p) => p.id === a.id)
                                ),
                            ]);
                        }

                        fetch("/api/channels/agent-response", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                messageContent: content,
                                senderAddress: userAddress,
                                channelType: "global",
                                channelId: null,
                                originalMessageId: data.id,
                            }),
                        })
                            .catch((err) =>
                                console.error(
                                    "[AlphaChat] Agent response error:",
                                    err
                                )
                            )
                            .finally(() => {
                                if (mentionedAgents.length > 0) {
                                    setThinkingAgents((prev) =>
                                        prev.filter(
                                            (a) => !mentionedAgents.some((m) => m.id === a.id)
                                        )
                                    );
                                }
                            });
                    }
                }

                return true;
            } catch (err) {
                console.error("[AlphaChat] Send error:", err);
                // Remove optimistic message on error
                setState((prev) => ({
                    ...prev,
                    messages: prev.messages.filter((m) => m.id !== tempId),
                }));
                return false;
            } finally {
                setIsSending(false);
            }
        },
        [userAddress, state.replyingTo]
    );

    // Toggle reaction
    const toggleReaction = useCallback(
        async (messageId: string, emoji: string): Promise<boolean> => {
            if (!isSupabaseConfigured || !supabase || !userAddress)
                return false;

            try {
                // Check if reaction exists
                const { data: existing } = await supabase
                    .from("shout_alpha_reactions")
                    .select("id")
                    .eq("message_id", messageId)
                    .eq("user_address", userAddress.toLowerCase())
                    .eq("emoji", emoji)
                    .single();

                if (existing) {
                    // Remove reaction
                    await supabase
                        .from("shout_alpha_reactions")
                        .delete()
                        .eq("id", existing.id);

                    // Update local state
                    setState((prev) => {
                        const updated = { ...prev.reactions };
                        if (updated[messageId]) {
                            const idx = updated[messageId].findIndex(
                                (r) => r.emoji === emoji
                            );
                            if (idx >= 0) {
                                updated[messageId][idx] = {
                                    ...updated[messageId][idx],
                                    count: Math.max(
                                        0,
                                        updated[messageId][idx].count - 1
                                    ),
                                    hasReacted: false,
                                    users: updated[messageId][idx].users.filter(
                                        (u) =>
                                            u.toLowerCase() !==
                                            userAddress.toLowerCase()
                                    ),
                                };
                            }
                        }
                        return { ...prev, reactions: updated };
                    });
                } else {
                    // Add reaction
                    await supabase.from("shout_alpha_reactions").insert({
                        message_id: messageId,
                        user_address: userAddress.toLowerCase(),
                        emoji,
                    });

                    // Update local state
                    setState((prev) => {
                        const updated = { ...prev.reactions };
                        if (!updated[messageId]) {
                            updated[messageId] = ALPHA_REACTION_EMOJIS.map(
                                (e) => ({
                                    emoji: e,
                                    count: 0,
                                    hasReacted: false,
                                    users: [],
                                })
                            );
                        }
                        const idx = updated[messageId].findIndex(
                            (r) => r.emoji === emoji
                        );
                        if (idx >= 0) {
                            updated[messageId][idx] = {
                                ...updated[messageId][idx],
                                count: updated[messageId][idx].count + 1,
                                hasReacted: true,
                                users: [
                                    ...updated[messageId][idx].users,
                                    userAddress.toLowerCase(),
                                ],
                            };
                        }
                        return { ...prev, reactions: updated };
                    });
                }

                return true;
            } catch (err) {
                console.error("[AlphaChat] Toggle reaction error:", err);
                return false;
            }
        },
        [userAddress]
    );

    // Toggle pin on a message (admin only)
    const togglePinMessage = useCallback(
        async (messageId: string, shouldPin: boolean): Promise<boolean> => {
            if (!isSupabaseConfigured || !supabase || !userAddress)
                return false;

            try {
                const updateData = shouldPin
                    ? {
                          is_pinned: true,
                          pinned_by: userAddress.toLowerCase(),
                          pinned_at: new Date().toISOString(),
                      }
                    : {
                          is_pinned: false,
                          pinned_by: null,
                          pinned_at: null,
                      };

                const { error } = await supabase
                    .from("shout_alpha_messages")
                    .update(updateData)
                    .eq("id", messageId);

                if (error) {
                    console.error("[AlphaChat] Toggle pin error:", error);
                    return false;
                }

                // Update local state
                setState((prev) => {
                    // Update the message in messages array
                    const updatedMessages = prev.messages.map((m) =>
                        m.id === messageId
                            ? {
                                  ...m,
                                  is_pinned: shouldPin,
                                  pinned_by: shouldPin
                                      ? userAddress.toLowerCase()
                                      : null,
                                  pinned_at: shouldPin
                                      ? new Date().toISOString()
                                      : null,
                              }
                            : m
                    );

                    // Update pinned messages list
                    let updatedPinned: AlphaMessage[];
                    if (shouldPin) {
                        const pinnedMsg = updatedMessages.find(
                            (m) => m.id === messageId
                        );
                        if (pinnedMsg) {
                            updatedPinned = [
                                pinnedMsg,
                                ...prev.pinnedMessages.filter(
                                    (m) => m.id !== messageId
                                ),
                            ];
                        } else {
                            updatedPinned = prev.pinnedMessages;
                        }
                    } else {
                        updatedPinned = prev.pinnedMessages.filter(
                            (m) => m.id !== messageId
                        );
                    }

                    return {
                        ...prev,
                        messages: updatedMessages,
                        pinnedMessages: updatedPinned,
                    };
                });

                console.log(
                    "[AlphaChat] Message",
                    shouldPin ? "pinned" : "unpinned",
                    messageId
                );
                return true;
            } catch (err) {
                console.error("[AlphaChat] Toggle pin error:", err);
                return false;
            }
        },
        [userAddress]
    );

    // Mark messages as read
    const markAsRead = useCallback(async () => {
        if (!isSupabaseConfigured || !supabase || !userAddress) return;

        try {
            await supabase
                .from("shout_alpha_membership")
                .update({ last_read_at: new Date().toISOString() })
                .eq("user_address", userAddress.toLowerCase());

            setState((prev) => ({ ...prev, unreadCount: 0 }));
        } catch (err) {
            console.error("[AlphaChat] Mark read error:", err);
        }
    }, [userAddress]);

    // Toggle notifications
    const toggleNotifications = useCallback(async (): Promise<boolean> => {
        if (
            !isSupabaseConfigured ||
            !supabase ||
            !userAddress ||
            !state.membership
        ) {
            return false;
        }

        const newMuted = !state.membership.notifications_muted;

        try {
            const { error } = await supabase
                .from("shout_alpha_membership")
                .update({ notifications_muted: newMuted })
                .eq("user_address", userAddress.toLowerCase());

            if (error) throw error;

            setState((prev) => ({
                ...prev,
                membership: prev.membership
                    ? { ...prev.membership, notifications_muted: newMuted }
                    : null,
            }));

            return true;
        } catch (err) {
            console.error("[AlphaChat] Toggle notifications error:", err);
            return false;
        }
    }, [userAddress, state.membership]);

    // Join Alpha channel
    const joinChannel = useCallback(async (): Promise<boolean> => {
        if (!isSupabaseConfigured || !supabase || !userAddress) return false;

        try {
            const { error } = await supabase.rpc("join_alpha_channel", {
                p_user_address: userAddress.toLowerCase(),
            });

            if (error) throw error;

            // Reload data
            await loadData();
            return true;
        } catch (err) {
            console.error("[AlphaChat] Join error:", err);
            return false;
        }
    }, [userAddress, loadData]);

    // Leave Alpha channel
    const leaveChannel = useCallback(async (): Promise<boolean> => {
        if (!isSupabaseConfigured || !supabase || !userAddress) return false;

        try {
            const { error } = await supabase.rpc("leave_alpha_channel", {
                p_user_address: userAddress.toLowerCase(),
            });

            if (error) throw error;

            setState((prev) => ({
                ...prev,
                isMember: false,
                membership: null,
                messages: [],
                reactions: {},
                unreadCount: 0,
                replyingTo: null,
            }));

            return true;
        } catch (err) {
            console.error("[AlphaChat] Leave error:", err);
            return false;
        }
    }, [userAddress]);

    // Get unread count (for external polling)
    const refreshUnreadCount = useCallback(async () => {
        if (!isSupabaseConfigured || !supabase || !userAddress) return;

        try {
            const { data } = await supabase.rpc("get_alpha_unread_count", {
                p_user_address: userAddress.toLowerCase(),
            });

            if (typeof data === "number") {
                setState((prev) => ({ ...prev, unreadCount: data }));
            }
        } catch (err) {
            console.error("[AlphaChat] Refresh unread error:", err);
        }
    }, [userAddress]);

    // Force refresh messages (for manual refresh)
    const refreshMessages = useCallback(async () => {
        if (
            !isSupabaseConfigured ||
            !supabase ||
            !userAddress ||
            !state.isMember
        ) {
            return;
        }

        const client = supabase; // Capture for closure
        console.log("[AlphaChat] Manual refresh triggered");

        try {
            // Fetch newest 100, then reverse for chronological order
            const { data: messagesDesc, error } = await client
                .from("shout_alpha_messages")
                .select(
                    "*, reply_to:reply_to_id(id, sender_address, content, message_type)"
                )
                .order("created_at", { ascending: false })
                .limit(100);

            if (error) {
                console.error("[AlphaChat] Refresh query error:", error);
                return;
            }

            const messages = messagesDesc?.reverse() || [];

            if (messages.length > 0) {
                // Get reactions for these messages
                const messageIds = messages.map((m) => m.id);
                let reactionsData: AlphaReaction[] = [];
                if (messageIds.length > 0) {
                    const { data } = await client
                        .from("shout_alpha_reactions")
                        .select("*")
                        .in("message_id", messageIds);
                    reactionsData = data || [];
                }

                // Process reactions
                const processedReactions: Record<
                    string,
                    AlphaMessageReaction[]
                > = {};
                messageIds.forEach((msgId) => {
                    processedReactions[msgId] = ALPHA_REACTION_EMOJIS.map(
                        (emoji) => ({
                            emoji,
                            count: 0,
                            hasReacted: false,
                            users: [],
                        })
                    );
                });
                reactionsData.forEach((r) => {
                    if (processedReactions[r.message_id]) {
                        const idx = processedReactions[r.message_id].findIndex(
                            (x) => x.emoji === r.emoji
                        );
                        if (idx >= 0) {
                            processedReactions[r.message_id][idx].count++;
                            processedReactions[r.message_id][idx].users.push(
                                r.user_address
                            );
                            if (
                                userAddress &&
                                r.user_address.toLowerCase() ===
                                    userAddress.toLowerCase()
                            ) {
                                processedReactions[r.message_id][
                                    idx
                                ].hasReacted = true;
                            }
                        }
                    }
                });

                setState((prev) => ({
                    ...prev,
                    messages,
                    reactions: processedReactions,
                }));
                console.log("[AlphaChat] Messages refreshed:", messages.length);
            }
        } catch (err) {
            console.error("[AlphaChat] Refresh error:", err);
        }
    }, [userAddress, state.isMember]);

    return {
        ...state,
        isSending,
        thinkingAgents,
        sendMessage,
        markAsRead,
        toggleNotifications,
        joinChannel,
        leaveChannel,
        refreshUnreadCount,
        refresh: loadData,
        refreshMessages,
        loadMoreMessages,
        setReplyingTo,
        toggleReaction,
        togglePinMessage,
    };
}
