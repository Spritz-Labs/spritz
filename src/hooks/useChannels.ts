import { useState, useCallback, useEffect, useRef } from "react";
import type { PublicChannel } from "@/app/api/channels/route";
import type { ChannelMessage, ChannelReaction } from "@/app/api/channels/[id]/messages/route";
import { createClient } from "@supabase/supabase-js";

export const CHANNEL_REACTION_EMOJIS = ["👍", "❤️", "🤙🏼", "😂", "😮", "🔥"];

// Initialize Supabase client for realtime
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey 
    ? createClient(supabaseUrl, supabaseAnonKey) 
    : null;

// Channel new message callback type
export type ChannelMessageCallback = (data: {
    channelId: string;
    channelName: string;
    senderAddress: string;
    content: string;
}) => void;

export type ChannelMessageReaction = {
    emoji: string;
    count: number;
    hasReacted: boolean;
    users: string[];
};

export function useChannels(userAddress: string | null) {
    const [channels, setChannels] = useState<PublicChannel[]>([]);
    const [joinedChannels, setJoinedChannels] = useState<PublicChannel[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Track which channels have notifications enabled (stored locally)
    const [notificationSettings, setNotificationSettings] = useState<Record<string, boolean>>(() => {
        if (typeof window !== "undefined") {
            try {
                const stored = localStorage.getItem("channel_notifications");
                return stored ? JSON.parse(stored) : {};
            } catch {
                return {};
            }
        }
        return {};
    });
    
    // Callbacks for new channel messages
    const newMessageCallbacksRef = useRef<Set<ChannelMessageCallback>>(new Set());
    
    // Track the currently open channel to avoid notifications for it
    const activeChannelRef = useRef<string | null>(null);

    const fetchChannels = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const url = userAddress
                ? `/api/channels?userAddress=${encodeURIComponent(userAddress)}`
                : "/api/channels";

            const res = await fetch(url);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch channels");
            }

            setChannels(data.channels || []);
        } catch (e) {
            console.error("[useChannels] Error:", e);
            setError(e instanceof Error ? e.message : "Failed to fetch channels");
        } finally {
            setIsLoading(false);
        }
    }, [userAddress]);

    const fetchJoinedChannels = useCallback(async () => {
        if (!userAddress) {
            setJoinedChannels([]);
            return;
        }

        try {
            const res = await fetch(
                `/api/channels?userAddress=${encodeURIComponent(userAddress)}&joined=true`
            );
            const data = await res.json();

            if (res.ok) {
                setJoinedChannels(data.channels || []);
            }
        } catch (e) {
            console.error("[useChannels] Error fetching joined channels:", e);
        }
    }, [userAddress]);

    const joinChannel = useCallback(
        async (channelId: string) => {
            if (!userAddress) return false;

            try {
                const res = await fetch(`/api/channels/${channelId}/join`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userAddress }),
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || "Failed to join channel");
                }

                // Refresh channels
                await fetchChannels();
                await fetchJoinedChannels();

                return true;
            } catch (e) {
                console.error("[useChannels] Error joining channel:", e);
                return false;
            }
        },
        [userAddress, fetchChannels, fetchJoinedChannels]
    );

    const leaveChannel = useCallback(
        async (channelId: string) => {
            if (!userAddress) return false;

            try {
                const res = await fetch(`/api/channels/${channelId}/leave`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userAddress }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || "Failed to leave channel");
                }

                // Refresh channels
                await fetchChannels();
                await fetchJoinedChannels();

                return true;
            } catch (e) {
                console.error("[useChannels] Error leaving channel:", e);
                return false;
            }
        },
        [userAddress, fetchChannels, fetchJoinedChannels]
    );

    const createChannel = useCallback(
        async (params: {
            name: string;
            description?: string;
            emoji?: string;
            category?: string;
        }) => {
            if (!userAddress) return null;

            try {
                const res = await fetch("/api/channels", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include", // Important for session cookie
                    body: JSON.stringify({
                        ...params,
                        creatorAddress: userAddress,
                    }),
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || "Failed to create channel");
                }

                // Refresh channels
                await fetchChannels();
                await fetchJoinedChannels();

                return data.channel as PublicChannel;
            } catch (e) {
                console.error("[useChannels] Error creating channel:", e);
                throw e;
            }
        },
        [userAddress, fetchChannels, fetchJoinedChannels]
    );

    // Fetch on mount
    useEffect(() => {
        fetchChannels();
        fetchJoinedChannels();
    }, [fetchChannels, fetchJoinedChannels]);

    // Toggle notification setting for a channel
    const toggleChannelNotifications = useCallback((channelId: string) => {
        setNotificationSettings(prev => {
            const newSettings = {
                ...prev,
                [channelId]: !prev[channelId],
            };
            // Persist to localStorage
            if (typeof window !== "undefined") {
                localStorage.setItem("channel_notifications", JSON.stringify(newSettings));
            }
            return newSettings;
        });
    }, []);

    // Check if notifications are enabled for a channel
    const isNotificationsEnabled = useCallback((channelId: string) => {
        return notificationSettings[channelId] === true;
    }, [notificationSettings]);

    // Register callback for new channel messages
    const onNewChannelMessage = useCallback((callback: ChannelMessageCallback) => {
        newMessageCallbacksRef.current.add(callback);
        return () => {
            newMessageCallbacksRef.current.delete(callback);
        };
    }, []);

    // Set active channel (to prevent notifications for currently open channel)
    const setActiveChannel = useCallback((channelId: string | null) => {
        activeChannelRef.current = channelId;
    }, []);

    // Subscribe to realtime channel messages for joined channels
    useEffect(() => {
        if (!supabase || !userAddress || joinedChannels.length === 0) return;

        console.log("[useChannels] Setting up realtime subscription for", joinedChannels.length, "channels");

        const channelIds = joinedChannels.map(c => c.id);
        
        const subscription = supabase
            .channel("channel-messages-global")
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "shout_channel_messages",
                },
                (payload) => {
                    const newMessage = payload.new as {
                        id: string;
                        channel_id: string;
                        sender_address: string;
                        content: string;
                        created_at: string;
                    };

                    // Only process messages for joined channels
                    if (!channelIds.includes(newMessage.channel_id)) return;

                    // Skip if message is from self
                    if (newMessage.sender_address.toLowerCase() === userAddress.toLowerCase()) return;

                    // Skip if this channel is currently active (chat is open)
                    if (activeChannelRef.current === newMessage.channel_id) return;

                    // Check if notifications are enabled for this channel
                    if (!notificationSettings[newMessage.channel_id]) return;

                    // Find channel info
                    const channel = joinedChannels.find(c => c.id === newMessage.channel_id);
                    if (!channel) return;

                    console.log("[useChannels] New message in channel:", channel.name);

                    // Trigger callbacks
                    newMessageCallbacksRef.current.forEach(callback => {
                        try {
                            callback({
                                channelId: newMessage.channel_id,
                                channelName: channel.name,
                                senderAddress: newMessage.sender_address,
                                content: newMessage.content,
                            });
                        } catch (err) {
                            console.error("[useChannels] Callback error:", err);
                        }
                    });
                }
            )
            .subscribe();

        return () => {
            console.log("[useChannels] Cleaning up realtime subscription");
            subscription.unsubscribe();
        };
    }, [userAddress, joinedChannels, notificationSettings]);

    return {
        channels,
        joinedChannels,
        isLoading,
        error,
        fetchChannels,
        fetchJoinedChannels,
        joinChannel,
        leaveChannel,
        createChannel,
        // Notification methods
        toggleChannelNotifications,
        isNotificationsEnabled,
        onNewChannelMessage,
        setActiveChannel,
    };
}

export function useChannelMessages(channelId: string | null, userAddress: string | null) {
    const [messages, setMessages] = useState<ChannelMessage[]>([]);
    const [pinnedMessages, setPinnedMessages] = useState<ChannelMessage[]>([]);
    const [reactions, setReactions] = useState<Record<string, ChannelMessageReaction[]>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [replyingTo, setReplyingTo] = useState<ChannelMessage | null>(null);
    
    const PAGE_SIZE = 50;

    // Process raw reactions into grouped format
    const processReactions = useCallback((rawReactions: ChannelReaction[]) => {
        const reactionMap: Record<string, ChannelMessageReaction[]> = {};
        
        rawReactions.forEach(r => {
            if (!reactionMap[r.message_id]) {
                reactionMap[r.message_id] = CHANNEL_REACTION_EMOJIS.map(emoji => ({
                    emoji,
                    count: 0,
                    hasReacted: false,
                    users: [],
                }));
            }
            
            const idx = reactionMap[r.message_id].findIndex(x => x.emoji === r.emoji);
            if (idx >= 0) {
                reactionMap[r.message_id][idx].count++;
                reactionMap[r.message_id][idx].users.push(r.user_address);
                if (userAddress && r.user_address.toLowerCase() === userAddress.toLowerCase()) {
                    reactionMap[r.message_id][idx].hasReacted = true;
                }
            }
        });
        
        return reactionMap;
    }, [userAddress]);

    const fetchMessages = useCallback(async () => {
        if (!channelId) return;

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/channels/${channelId}/messages?limit=${PAGE_SIZE}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch messages");
            }

            const fetchedMessages = data.messages || [];
            setMessages(fetchedMessages);
            setHasMore(fetchedMessages.length >= PAGE_SIZE);
            
            // Process reactions
            if (data.reactions) {
                setReactions(processReactions(data.reactions));
            }
        } catch (e) {
            console.error("[useChannelMessages] Error:", e);
            setError(e instanceof Error ? e.message : "Failed to fetch messages");
        } finally {
            setIsLoading(false);
        }
    }, [channelId, processReactions]);

    // Load older messages (for infinite scroll)
    const loadMoreMessages = useCallback(async () => {
        if (!channelId || isLoadingMore || !hasMore || messages.length === 0) return;

        setIsLoadingMore(true);

        try {
            // Get the oldest message's timestamp
            const oldestMessage = messages[0];
            const before = oldestMessage.created_at;

            const res = await fetch(
                `/api/channels/${channelId}/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(before)}`
            );
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch older messages");
            }

            const olderMessages = data.messages || [];
            
            if (olderMessages.length > 0) {
                // Prepend older messages
                setMessages(prev => [...olderMessages, ...prev]);
                
                // Process and merge reactions
                if (data.reactions) {
                    setReactions(prev => ({
                        ...prev,
                        ...processReactions(data.reactions),
                    }));
                }
            }
            
            setHasMore(olderMessages.length >= PAGE_SIZE);
        } catch (e) {
            console.error("[useChannelMessages] Error loading more:", e);
        } finally {
            setIsLoadingMore(false);
        }
    }, [channelId, isLoadingMore, hasMore, messages, processReactions]);

    const sendMessage = useCallback(
        async (content: string, messageType: "text" | "image" | "pixel_art" = "text", replyToId?: string) => {
            if (!channelId || !userAddress || !content.trim()) return null;

            try {
                const res = await fetch(`/api/channels/${channelId}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        senderAddress: userAddress,
                        content: content.trim(),
                        messageType,
                        replyToId: replyToId || replyingTo?.id,
                    }),
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || "Failed to send message");
                }

                // Add message to local state
                setMessages((prev) => [...prev, data.message]);
                
                // Clear reply state
                setReplyingTo(null);
                
                // Check for agent mentions and trigger responses (fire and forget)
                if (content.includes("@[") && content.includes("](")) {
                    fetch("/api/channels/agent-response", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            messageContent: content,
                            senderAddress: userAddress,
                            channelType: "channel",
                            channelId: channelId,
                            originalMessageId: data.message?.id,
                        }),
                    }).catch(err => console.error("[useChannelMessages] Agent response error:", err));
                }

                return data.message as ChannelMessage;
            } catch (e) {
                console.error("[useChannelMessages] Error sending:", e);
                return null;
            }
        },
        [channelId, userAddress, replyingTo]
    );

    const toggleReaction = useCallback(
        async (messageId: string, emoji: string) => {
            if (!channelId || !userAddress) return false;

            try {
                const res = await fetch(`/api/channels/${channelId}/messages`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        messageId,
                        userAddress,
                        emoji,
                    }),
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || "Failed to toggle reaction");
                }

                // Optimistically update local state
                setReactions(prev => {
                    const updated = { ...prev };
                    if (!updated[messageId]) {
                        updated[messageId] = CHANNEL_REACTION_EMOJIS.map(e => ({
                            emoji: e,
                            count: 0,
                            hasReacted: false,
                            users: [],
                        }));
                    }

                    const idx = updated[messageId].findIndex(r => r.emoji === emoji);
                    if (idx >= 0) {
                        const wasReacted = updated[messageId][idx].hasReacted;
                        updated[messageId][idx] = {
                            ...updated[messageId][idx],
                            count: wasReacted 
                                ? Math.max(0, updated[messageId][idx].count - 1) 
                                : updated[messageId][idx].count + 1,
                            hasReacted: !wasReacted,
                            users: wasReacted
                                ? updated[messageId][idx].users.filter(u => u.toLowerCase() !== userAddress.toLowerCase())
                                : [...updated[messageId][idx].users, userAddress.toLowerCase()],
                        };
                    }

                    return updated;
                });

                return true;
            } catch (e) {
                console.error("[useChannelMessages] Reaction error:", e);
                return false;
            }
        },
        [channelId, userAddress]
    );

    // Fetch pinned messages for a channel
    const fetchPinnedMessages = useCallback(async () => {
        if (!channelId) return;

        try {
            const res = await fetch(`/api/channels/${channelId}/messages/pin`);
            const data = await res.json();

            if (res.ok) {
                setPinnedMessages(data.pinnedMessages || []);
            }
        } catch (e) {
            console.error("[useChannelMessages] Error fetching pinned messages:", e);
        }
    }, [channelId]);

    // Pin or unpin a message (admin only)
    const togglePinMessage = useCallback(
        async (messageId: string, pin: boolean) => {
            if (!channelId) return false;

            try {
                const res = await fetch(`/api/channels/${channelId}/messages/pin`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ messageId, pin }),
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || "Failed to update pin status");
                }

                // Update local state
                setMessages((prev) =>
                    prev.map((msg) =>
                        msg.id === messageId
                            ? {
                                  ...msg,
                                  is_pinned: pin,
                                  pinned_by: pin ? userAddress : null,
                                  pinned_at: pin ? new Date().toISOString() : null,
                              }
                            : msg
                    )
                );

                // Update pinned messages list
                if (pin) {
                    const pinnedMsg = messages.find((m) => m.id === messageId);
                    if (pinnedMsg) {
                        setPinnedMessages((prev) => [
                            {
                                ...pinnedMsg,
                                is_pinned: true,
                                pinned_by: userAddress,
                                pinned_at: new Date().toISOString(),
                            },
                            ...prev,
                        ]);
                    }
                } else {
                    setPinnedMessages((prev) => prev.filter((m) => m.id !== messageId));
                }

                return true;
            } catch (e) {
                console.error("[useChannelMessages] Pin error:", e);
                return false;
            }
        },
        [channelId, userAddress, messages]
    );

    // Fetch messages on mount and when channel changes
    useEffect(() => {
        fetchMessages();
        fetchPinnedMessages();
    }, [fetchMessages, fetchPinnedMessages]);

    // Poll for new messages every 5 seconds
    useEffect(() => {
        if (!channelId) return;

        const interval = setInterval(fetchMessages, 5000);
        return () => clearInterval(interval);
    }, [channelId, fetchMessages]);

    // Edit message (within 15 minute window)
    const editMessage = useCallback(
        async (messageId: string, newContent: string) => {
            if (!channelId || !userAddress || !newContent.trim()) return false;

            try {
                const res = await fetch(`/api/channels/${channelId}/messages/${messageId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        content: newContent.trim(),
                        userAddress,
                    }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || "Failed to edit message");
                }

                // Update local state
                setMessages((prev) =>
                    prev.map((msg) =>
                        msg.id === messageId
                            ? { ...msg, content: newContent.trim(), is_edited: true, edited_at: new Date().toISOString() }
                            : msg
                    )
                );

                return true;
            } catch (err) {
                console.error("[useChannels] Error editing message:", err);
                return false;
            }
        },
        [channelId, userAddress]
    );

    // Delete message (own messages or admin)
    const deleteMessage = useCallback(
        async (messageId: string) => {
            if (!channelId || !userAddress) return false;

            try {
                const res = await fetch(`/api/channels/${channelId}/messages/${messageId}`, {
                    method: "DELETE",
                    headers: { 
                        "Content-Type": "application/json",
                        "x-user-address": userAddress,
                    },
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || "Failed to delete message");
                }

                // Update local state - mark as deleted
                setMessages((prev) =>
                    prev.map((msg) =>
                        msg.id === messageId
                            ? { ...msg, content: "[Message deleted]", is_deleted: true }
                            : msg
                    )
                );

                return true;
            } catch (err) {
                console.error("[useChannels] Error deleting message:", err);
                return false;
            }
        },
        [channelId, userAddress]
    );

    return {
        messages,
        pinnedMessages,
        reactions,
        isLoading,
        isLoadingMore,
        hasMore,
        error,
        fetchMessages,
        fetchPinnedMessages,
        loadMoreMessages,
        sendMessage,
        editMessage,
        deleteMessage,
        toggleReaction,
        togglePinMessage,
        replyingTo,
        setReplyingTo,
    };
}

