import { useState, useCallback, useEffect } from "react";
import type { PublicChannel } from "@/app/api/channels/route";
import type { ChannelMessage, ChannelReaction } from "@/app/api/channels/[id]/messages/route";

export const CHANNEL_REACTION_EMOJIS = ["👍", "❤️", "🤙🏼", "😂", "😮", "🔥"];

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
    };
}

export function useChannelMessages(channelId: string | null, userAddress: string | null) {
    const [messages, setMessages] = useState<ChannelMessage[]>([]);
    const [reactions, setReactions] = useState<Record<string, ChannelMessageReaction[]>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [replyingTo, setReplyingTo] = useState<ChannelMessage | null>(null);

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
            const res = await fetch(`/api/channels/${channelId}/messages?limit=100`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch messages");
            }

            setMessages(data.messages || []);
            
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

    const sendMessage = useCallback(
        async (content: string, messageType: "text" | "image" = "text", replyToId?: string) => {
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

    // Fetch messages on mount and when channel changes
    useEffect(() => {
        fetchMessages();
    }, [fetchMessages]);

    // Poll for new messages every 5 seconds
    useEffect(() => {
        if (!channelId) return;

        const interval = setInterval(fetchMessages, 5000);
        return () => clearInterval(interval);
    }, [channelId, fetchMessages]);

    return {
        messages,
        reactions,
        isLoading,
        error,
        fetchMessages,
        sendMessage,
        toggleReaction,
        replyingTo,
        setReplyingTo,
    };
}

