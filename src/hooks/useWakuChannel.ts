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

// Constants for Waku
const WAKU_STORE_ENDPOINT = "https://store.waku.org"; // Placeholder - actual endpoint would depend on setup

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
                `/api/channels/${channelId}/waku-messages?contentTopic=${encodeURIComponent(contentTopic)}`
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
            setError(err instanceof Error ? err.message : "Failed to load messages");
        } finally {
            setIsLoading(false);
        }
    }, [channelId, contentTopic]);

    // Send a message to the Waku channel
    const sendMessage = useCallback(
        async (content: string, messageType: "text" | "image" | "pixel_art" | "gif" | "location" = "text") => {
            if (!content.trim() || isSending) return false;
            
            setIsSending(true);
            try {
                const res = await fetch(`/api/channels/${channelId}/waku-messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        content,
                        senderAddress: userAddress,
                        contentTopic,
                        messageType,
                    }),
                });
                
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
                
                setMessages(prev => [...prev, newMessage]);
                messagesRef.current = [...messagesRef.current, newMessage];
                
                onNewMessage?.();
                return true;
            } catch (err) {
                console.error("[WakuChannel] Error sending message:", err);
                setError(err instanceof Error ? err.message : "Failed to send message");
                return false;
            } finally {
                setIsSending(false);
            }
        },
        [channelId, contentTopic, userAddress, isSending, onNewMessage]
    );

    // Poll for new messages (until we have WebSocket/Waku subscription)
    useEffect(() => {
        loadMessages();
        
        // Poll every 3 seconds for new messages
        pollingRef.current = setInterval(async () => {
            try {
                const res = await fetch(
                    `/api/channels/${channelId}/waku-messages?contentTopic=${encodeURIComponent(contentTopic)}&since=${messagesRef.current.length > 0 ? messagesRef.current[messagesRef.current.length - 1].timestamp.toISOString() : ""}`
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
                            .filter((msg: WakuChannelMessage) => 
                                !messagesRef.current.some(m => m.id === msg.id)
                            );
                        
                        if (newMessages.length > 0) {
                            setMessages(prev => [...prev, ...newMessages]);
                            messagesRef.current = [...messagesRef.current, ...newMessages];
                            onNewMessage?.();
                        }
                    }
                }
            } catch (err) {
                // Silently ignore polling errors
            }
        }, 3000);
        
        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
        };
    }, [channelId, contentTopic, loadMessages, onNewMessage]);

    return {
        messages,
        isLoading,
        isSending,
        error,
        sendMessage,
        refreshMessages: loadMessages,
    };
}
