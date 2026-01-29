"use client";

import { useState, useCallback, useEffect, useRef } from "react";

export type WakuChannelMessage = {
    id: string;
    content: string;
    senderAddress: string;
    timestamp: Date;
    messageType: "text" | "image" | "pixel_art" | "gif" | "location";
};

type UseWakuChannelProps = {
    channelId: string;
    contentTopic: string;
    symmetricKey: string;
    userAddress: string;
    onNewMessage?: () => void;
};

export function useWakuChannel({
    channelId,
    contentTopic,
    symmetricKey,
    userAddress,
    onNewMessage,
}: UseWakuChannelProps) {
    const [messages, setMessages] = useState<WakuChannelMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesRef = useRef<WakuChannelMessage[]>([]);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);
    const onNewMessageRef = useRef(onNewMessage);
    const isSendingRef = useRef(false);

    onNewMessageRef.current = onNewMessage;
    isSendingRef.current = isSending;

    // For now, we'll use a hybrid approach - store messages in Supabase
    // but route them through a Waku-compatible API
    // This allows us to leverage existing infrastructure while preparing for full Waku integration

    // Load messages from the Waku channel storage
    const loadMessages = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            // Fetch from our Waku channel messages API
            const res = await fetch(
                `/api/channels/${channelId}/waku-messages?contentTopic=${encodeURIComponent(contentTopic)}`,
            );

            if (!res.ok) {
                throw new Error("Failed to load messages");
            }

            const data = await res.json();
            const loadedMessages = (data.messages || []).map((msg: any) => ({
                id: msg.id,
                content: msg.content,
                senderAddress: msg.sender_address,
                timestamp: new Date(msg.created_at),
                messageType: msg.message_type || "text",
            }));

            setMessages(loadedMessages);
            messagesRef.current = loadedMessages;
        } catch (err) {
            console.error("[WakuChannel] Error loading messages:", err);
            setError(
                err instanceof Error ? err.message : "Failed to load messages",
            );
        } finally {
            setIsLoading(false);
        }
    }, [channelId, contentTopic]);

    // Send a message to the Waku channel
    const sendMessage = useCallback(
        async (
            content: string,
            messageType:
                | "text"
                | "image"
                | "pixel_art"
                | "gif"
                | "location" = "text",
        ) => {
            if (!content.trim() || isSendingRef.current) return false;

            setIsSending(true);
            try {
                const res = await fetch(
                    `/api/channels/${channelId}/waku-messages`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            content,
                            senderAddress: userAddress,
                            contentTopic,
                            messageType,
                        }),
                    },
                );

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || "Failed to send message");
                }

                const data = await res.json();

                // Add the new message optimistically
                const newMessage: WakuChannelMessage = {
                    id: data.message.id,
                    content,
                    senderAddress: userAddress,
                    timestamp: new Date(),
                    messageType,
                };

                setMessages((prev) => [...prev, newMessage]);
                messagesRef.current = [...messagesRef.current, newMessage];

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
                    })
                        .then(async (res) => {
                            const result = await res.json();
                            if (!res.ok) {
                                console.error(
                                    "[WakuChannel] Agent response error:",
                                    result.error,
                                );
                            } else {
                                console.log(
                                    "[WakuChannel] Agent response:",
                                    result,
                                );
                                if (
                                    result.processed &&
                                    result.responsesGenerated === 0 &&
                                    result.mentionsFound > 0
                                ) {
                                    console.warn(
                                        "[WakuChannel] Agent mentioned but no response generated. Check server logs for details.",
                                    );
                                }
                            }
                        })
                        .catch((err) =>
                            console.error(
                                "[WakuChannel] Agent response error:",
                                err,
                            ),
                        );
                }

                setError(null);
                onNewMessageRef.current?.();
                return true;
            } catch (err) {
                console.error("[WakuChannel] Error sending message:", err);
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to send message",
                );
                return false;
            } finally {
                setIsSending(false);
            }
        },
        [channelId, contentTopic, userAddress],
    );

    // Poll for new messages (until we have WebSocket/Waku subscription).
    // Effect does NOT depend on onNewMessage so parent re-renders don't re-run loadMessages (avoids flashing).
    useEffect(() => {
        loadMessages();

        const intervalId = setInterval(async () => {
            try {
                const res = await fetch(
                    `/api/channels/${channelId}/waku-messages?contentTopic=${encodeURIComponent(contentTopic)}&since=${messagesRef.current.length > 0 ? messagesRef.current[messagesRef.current.length - 1].timestamp.toISOString() : ""}`,
                );

                if (res.ok) {
                    const data = await res.json();
                    if (data.messages && data.messages.length > 0) {
                        const newMessages = data.messages
                            .map((msg: any) => ({
                                id: msg.id,
                                content: msg.content,
                                senderAddress: msg.sender_address,
                                timestamp: new Date(msg.created_at),
                                messageType: msg.message_type || "text",
                            }))
                            .filter(
                                (msg: WakuChannelMessage) =>
                                    !messagesRef.current.some(
                                        (m) => m.id === msg.id,
                                    ),
                            );

                        if (newMessages.length > 0) {
                            setMessages((prev) => [...prev, ...newMessages]);
                            messagesRef.current = [
                                ...messagesRef.current,
                                ...newMessages,
                            ];
                            onNewMessageRef.current?.();
                        }
                    }
                }
            } catch (err) {
                // Silently ignore polling errors
            }
        }, 3000);

        return () => clearInterval(intervalId);
    }, [channelId, contentTopic, loadMessages]);

    const clearError = useCallback(() => setError(null), []);

    return {
        messages,
        isLoading,
        isSending,
        error,
        clearError,
        sendMessage,
        refreshMessages: loadMessages,
    };
}
