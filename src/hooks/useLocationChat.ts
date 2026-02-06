"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/config/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type LocationChat = {
    id: string;
    name: string;
    description?: string;
    emoji: string;
    google_place_id: string;
    google_place_name: string;
    google_place_address?: string;
    google_place_rating?: number;
    google_place_user_ratings_total?: number;
    google_place_types?: string[];
    google_place_phone?: string;
    google_place_website?: string;
    google_place_hours?: Record<string, unknown>;
    latitude: number;
    longitude: number;
    formatted_address?: string;
    ipfs_url?: string;
    waku_content_topic?: string;
    creator_address: string;
    member_count: number;
    message_count: number;
    is_active: boolean;
    created_at: string;
};

export type LocationChatMessage = {
    id: string;
    location_chat_id: string;
    sender_address: string;
    content: string;
    message_type: "text" | "image" | "pixel_art" | "gif" | "location" | "voice";
    waku_message_id?: string;
    reply_to?: string; // ID of the message being replied to
    reply_to_message?: { // Populated reply data
        id: string;
        sender_address: string;
        content: string;
    };
    created_at: string;
};

export type LocationChatMember = {
    id: string;
    location_chat_id: string;
    user_address: string;
    joined_at: string;
    notifications_muted: boolean;
    last_read_at: string;
};

export function useLocationChat(chatId: string | null, userAddress: string) {
    const [chat, setChat] = useState<LocationChat | null>(null);
    const [messages, setMessages] = useState<LocationChatMessage[]>([]);
    const [members, setMembers] = useState<LocationChatMember[]>([]);
    const [isMember, setIsMember] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSending, setIsSending] = useState(false);
    
    const subscriptionRef = useRef<RealtimeChannel | null>(null);

    // Fetch chat details
    const fetchChat = useCallback(async () => {
        if (!chatId) return;

        try {
            const response = await fetch(`/api/location-chats/${chatId}`);
            if (!response.ok) throw new Error("Failed to fetch chat");
            
            const data = await response.json();
            setChat(data.chat);
            setIsMember(data.isMember);
            setMembers(data.members || []);
        } catch (err) {
            console.error("[useLocationChat] Fetch error:", err);
            setError("Failed to load chat");
        }
    }, [chatId]);

    // Fetch messages
    const fetchMessages = useCallback(async () => {
        if (!chatId) return;

        try {
            const response = await fetch(`/api/location-chats/${chatId}/messages?limit=100`);
            if (!response.ok) throw new Error("Failed to fetch messages");
            
            const data = await response.json();
            setMessages(data.messages || []);
        } catch (err) {
            console.error("[useLocationChat] Messages error:", err);
        }
    }, [chatId]);

    // Join the chat
    const joinChat = useCallback(async () => {
        if (!chatId) return false;

        try {
            const response = await fetch(`/api/location-chats/${chatId}/join`, {
                method: "POST",
            });
            
            if (!response.ok) throw new Error("Failed to join");
            
            setIsMember(true);
            await fetchChat();
            return true;
        } catch (err) {
            console.error("[useLocationChat] Join error:", err);
            return false;
        }
    }, [chatId, fetchChat]);

    // Leave the chat
    const leaveChat = useCallback(async () => {
        if (!chatId) return false;

        try {
            const response = await fetch(`/api/location-chats/${chatId}/join`, {
                method: "DELETE",
            });
            
            if (!response.ok) throw new Error("Failed to leave");
            
            setIsMember(false);
            return true;
        } catch (err) {
            console.error("[useLocationChat] Leave error:", err);
            return false;
        }
    }, [chatId]);

    // Send a message
    const sendMessage = useCallback(async (content: string, messageType: string = "text", replyToId?: string) => {
        if (!chatId || !content.trim()) return false;

        setIsSending(true);
        try {
            const response = await fetch(`/api/location-chats/${chatId}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content, messageType, replyToId }),
            });
            
            if (!response.ok) throw new Error("Failed to send");
            
            const data = await response.json();
            
            // Optimistically add message
            if (data.message) {
                setMessages(prev => [...prev, data.message]);
            }
            
            return true;
        } catch (err) {
            console.error("[useLocationChat] Send error:", err);
            return false;
        } finally {
            setIsSending(false);
        }
    }, [chatId]);

    // Delete a message
    const deleteMessage = useCallback(async (messageId: string) => {
        if (!chatId || !messageId) return false;

        try {
            const response = await fetch(`/api/location-chats/${chatId}/messages?messageId=${messageId}`, {
                method: "DELETE",
            });
            
            if (!response.ok) throw new Error("Failed to delete");
            
            // Optimistically remove message from local state
            setMessages(prev => prev.filter(m => m.id !== messageId));
            
            return true;
        } catch (err) {
            console.error("[useLocationChat] Delete error:", err);
            return false;
        }
    }, [chatId]);

    // Initial fetch
    useEffect(() => {
        if (!chatId) {
            setChat(null);
            setMessages([]);
            setMembers([]);
            setIsMember(false);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        Promise.all([fetchChat(), fetchMessages()])
            .finally(() => setIsLoading(false));
    }, [chatId, fetchChat, fetchMessages]);

    // Subscribe to realtime updates
    useEffect(() => {
        if (!chatId || !supabase) return;

        // Subscribe to new messages
        const channel = supabase
            .channel(`location-chat-${chatId}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "shout_location_chat_messages",
                    filter: `location_chat_id=eq.${chatId}`,
                },
                (payload) => {
                    const newMessage = payload.new as LocationChatMessage;
                    // Avoid duplicates
                    setMessages(prev => {
                        if (prev.some(m => m.id === newMessage.id)) return prev;
                        return [...prev, newMessage];
                    });
                }
            )
            .subscribe();

        subscriptionRef.current = channel;

        return () => {
            if (subscriptionRef.current && supabase) {
                supabase.removeChannel(subscriptionRef.current);
                subscriptionRef.current = null;
            }
        };
    }, [chatId]);

    return {
        chat,
        messages,
        members,
        isMember,
        isLoading,
        error,
        isSending,
        sendMessage,
        deleteMessage,
        joinChat,
        leaveChat,
        refreshMessages: fetchMessages,
        refreshChat: fetchChat,
    };
}
