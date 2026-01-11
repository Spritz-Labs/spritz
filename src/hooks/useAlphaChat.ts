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

export const ALPHA_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

export type AlphaMembership = {
    user_address: string;
    notifications_muted: boolean;
    last_read_at: string;
    joined_at: string;
    left_at: string | null;
};

type AlphaChatState = {
    messages: AlphaMessage[];
    reactions: Record<string, AlphaMessageReaction[]>;
    membership: AlphaMembership | null;
    unreadCount: number;
    isLoading: boolean;
    isMember: boolean;
    replyingTo: AlphaMessage | null;
};

export function useAlphaChat(userAddress: string | null) {
    const [state, setState] = useState<AlphaChatState>({
        messages: [],
        reactions: {},
        membership: null,
        unreadCount: 0,
        isLoading: true,
        isMember: false,
        replyingTo: null,
    });
    const [isSending, setIsSending] = useState(false);
    const channelRef = useRef<RealtimeChannel | null>(null);

    // Load membership and messages
    const loadData = useCallback(async () => {
        if (!isSupabaseConfigured || !supabase || !userAddress) {
            setState(prev => ({ ...prev, isLoading: false }));
            return;
        }

        try {
            // Get membership
            const { data: membership } = await supabase
                .from("shout_alpha_membership")
                .select("*")
                .eq("user_address", userAddress.toLowerCase())
                .is("left_at", null)
                .single();

            if (!membership) {
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    isMember: false,
                    membership: null,
                }));
                return;
            }

            // Get messages (last 100) with reply_to data
            const { data: messages } = await supabase
                .from("shout_alpha_messages")
                .select("*, reply_to:reply_to_id(id, sender_address, content, message_type)")
                .order("created_at", { ascending: true })
                .limit(100);

            // Get reactions for these messages
            const messageIds = messages?.map(m => m.id) || [];
            let reactionsData: AlphaReaction[] = [];
            if (messageIds.length > 0) {
                const { data } = await supabase
                    .from("shout_alpha_reactions")
                    .select("*")
                    .in("message_id", messageIds);
                reactionsData = data || [];
            }

            // Process reactions into grouped format
            const processedReactions: Record<string, AlphaMessageReaction[]> = {};
            messageIds.forEach(msgId => {
                processedReactions[msgId] = ALPHA_REACTION_EMOJIS.map(emoji => ({
                    emoji,
                    count: 0,
                    hasReacted: false,
                    users: [],
                }));
            });
            reactionsData.forEach(r => {
                if (processedReactions[r.message_id]) {
                    const idx = processedReactions[r.message_id].findIndex(x => x.emoji === r.emoji);
                    if (idx >= 0) {
                        processedReactions[r.message_id][idx].count++;
                        processedReactions[r.message_id][idx].users.push(r.user_address);
                        if (userAddress && r.user_address.toLowerCase() === userAddress.toLowerCase()) {
                            processedReactions[r.message_id][idx].hasReacted = true;
                        }
                    }
                }
            });

            // Calculate unread count
            const unreadCount = messages?.filter(
                msg => new Date(msg.created_at) > new Date(membership.last_read_at)
            ).length || 0;

            setState({
                messages: messages || [],
                reactions: processedReactions,
                membership,
                unreadCount,
                isLoading: false,
                isMember: true,
                replyingTo: null,
            });
        } catch (err) {
            console.error("[AlphaChat] Load error:", err);
            setState(prev => ({ ...prev, isLoading: false }));
        }
    }, [userAddress]);

    // Subscribe to realtime updates
    useEffect(() => {
        if (!isSupabaseConfigured || !supabase || !userAddress || !state.isMember) {
            return;
        }

        // Subscribe to new messages
        const channel = supabase
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
                    setState(prev => ({
                        ...prev,
                        messages: [...prev.messages, newMessage],
                        unreadCount: prev.unreadCount + 1,
                    }));
                }
            )
            .subscribe();

        channelRef.current = channel;

        return () => {
            if (channelRef.current && supabase) {
                supabase.removeChannel(channelRef.current);
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
        if (!isSupabaseConfigured || !supabase || !userAddress || !state.isMember) {
            return;
        }

        const client = supabase; // Capture for closure
        const pollInterval = setInterval(async () => {
            try {
                // Fetch latest messages
                const { data: messages } = await client
                    .from("shout_alpha_messages")
                    .select("*, reply_to:reply_to_id(id, sender_address, content, message_type)")
                    .order("created_at", { ascending: true })
                    .limit(100);

                if (messages && messages.length > 0) {
                    setState(prev => {
                        // Only update if we have new messages
                        if (messages.length !== prev.messages.length || 
                            messages[messages.length - 1]?.id !== prev.messages[prev.messages.length - 1]?.id) {
                            console.log("[AlphaChat] Polling found new messages");
                            return { ...prev, messages };
                        }
                        return prev;
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
        setState(prev => ({ ...prev, replyingTo: message }));
    }, []);

    // Send a message
    const sendMessage = useCallback(async (content: string, messageType: "text" | "pixel_art" = "text", replyToId?: string): Promise<boolean> => {
        if (!isSupabaseConfigured || !supabase || !userAddress || !content.trim()) {
            return false;
        }

        setIsSending(true);
        try {
            const insertData: Record<string, unknown> = {
                sender_address: userAddress.toLowerCase(),
                content: content.trim(),
                message_type: messageType,
            };
            
            // Add reply_to_id if replying or from state
            const finalReplyToId = replyToId || state.replyingTo?.id;
            if (finalReplyToId) {
                insertData.reply_to_id = finalReplyToId;
            }

            const { error } = await supabase.from("shout_alpha_messages").insert(insertData);

            if (error) throw error;
            
            // Clear reply state
            setState(prev => ({ ...prev, replyingTo: null }));
            
            return true;
        } catch (err) {
            console.error("[AlphaChat] Send error:", err);
            return false;
        } finally {
            setIsSending(false);
        }
    }, [userAddress, state.replyingTo]);

    // Toggle reaction
    const toggleReaction = useCallback(async (messageId: string, emoji: string): Promise<boolean> => {
        if (!isSupabaseConfigured || !supabase || !userAddress) return false;

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
                setState(prev => {
                    const updated = { ...prev.reactions };
                    if (updated[messageId]) {
                        const idx = updated[messageId].findIndex(r => r.emoji === emoji);
                        if (idx >= 0) {
                            updated[messageId][idx] = {
                                ...updated[messageId][idx],
                                count: Math.max(0, updated[messageId][idx].count - 1),
                                hasReacted: false,
                                users: updated[messageId][idx].users.filter(u => u.toLowerCase() !== userAddress.toLowerCase()),
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
                setState(prev => {
                    const updated = { ...prev.reactions };
                    if (!updated[messageId]) {
                        updated[messageId] = ALPHA_REACTION_EMOJIS.map(e => ({
                            emoji: e,
                            count: 0,
                            hasReacted: false,
                            users: [],
                        }));
                    }
                    const idx = updated[messageId].findIndex(r => r.emoji === emoji);
                    if (idx >= 0) {
                        updated[messageId][idx] = {
                            ...updated[messageId][idx],
                            count: updated[messageId][idx].count + 1,
                            hasReacted: true,
                            users: [...updated[messageId][idx].users, userAddress.toLowerCase()],
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
    }, [userAddress]);

    // Mark messages as read
    const markAsRead = useCallback(async () => {
        if (!isSupabaseConfigured || !supabase || !userAddress) return;

        try {
            await supabase
                .from("shout_alpha_membership")
                .update({ last_read_at: new Date().toISOString() })
                .eq("user_address", userAddress.toLowerCase());

            setState(prev => ({ ...prev, unreadCount: 0 }));
        } catch (err) {
            console.error("[AlphaChat] Mark read error:", err);
        }
    }, [userAddress]);

    // Toggle notifications
    const toggleNotifications = useCallback(async (): Promise<boolean> => {
        if (!isSupabaseConfigured || !supabase || !userAddress || !state.membership) {
            return false;
        }

        const newMuted = !state.membership.notifications_muted;

        try {
            const { error } = await supabase
                .from("shout_alpha_membership")
                .update({ notifications_muted: newMuted })
                .eq("user_address", userAddress.toLowerCase());

            if (error) throw error;

            setState(prev => ({
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

            setState(prev => ({
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
                setState(prev => ({ ...prev, unreadCount: data }));
            }
        } catch (err) {
            console.error("[AlphaChat] Refresh unread error:", err);
        }
    }, [userAddress]);

    // Force refresh messages (for manual refresh)
    const refreshMessages = useCallback(async () => {
        if (!isSupabaseConfigured || !supabase || !userAddress || !state.isMember) {
            return;
        }

        const client = supabase; // Capture for closure

        try {
            const { data: messages } = await client
                .from("shout_alpha_messages")
                .select("*, reply_to:reply_to_id(id, sender_address, content, message_type)")
                .order("created_at", { ascending: true })
                .limit(100);

            if (messages) {
                // Get reactions for these messages
                const messageIds = messages.map(m => m.id);
                let reactionsData: AlphaReaction[] = [];
                if (messageIds.length > 0) {
                    const { data } = await client
                        .from("shout_alpha_reactions")
                        .select("*")
                        .in("message_id", messageIds);
                    reactionsData = data || [];
                }

                // Process reactions
                const processedReactions: Record<string, AlphaMessageReaction[]> = {};
                messageIds.forEach(msgId => {
                    processedReactions[msgId] = ALPHA_REACTION_EMOJIS.map(emoji => ({
                        emoji,
                        count: 0,
                        hasReacted: false,
                        users: [],
                    }));
                });
                reactionsData.forEach(r => {
                    if (processedReactions[r.message_id]) {
                        const idx = processedReactions[r.message_id].findIndex(x => x.emoji === r.emoji);
                        if (idx >= 0) {
                            processedReactions[r.message_id][idx].count++;
                            processedReactions[r.message_id][idx].users.push(r.user_address);
                            if (userAddress && r.user_address.toLowerCase() === userAddress.toLowerCase()) {
                                processedReactions[r.message_id][idx].hasReacted = true;
                            }
                        }
                    }
                });

                setState(prev => ({
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
        sendMessage,
        markAsRead,
        toggleNotifications,
        joinChannel,
        leaveChannel,
        refreshUnreadCount,
        refresh: loadData,
        refreshMessages,
        setReplyingTo,
        toggleReaction,
    };
}

