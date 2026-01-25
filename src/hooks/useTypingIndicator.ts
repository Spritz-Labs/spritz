"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase, isSupabaseConfigured } from "@/config/supabase";
import { normalizeAddress } from "@/utils/address";

const TYPING_TIMEOUT = 3000; // Stop showing typing after 3 seconds of no updates
const BROADCAST_DEBOUNCE = 500; // Debounce typing broadcasts

type TypingUser = {
    address: string;
    name?: string;
    timestamp: number;
};

type TypingIndicatorReturn = {
    typingUsers: TypingUser[];
    setTyping: () => void;
    stopTyping: () => void;
};

/**
 * Hook to manage typing indicators in a chat
 * @param chatId - The unique identifier for the chat (channel ID, DM address, group ID)
 * @param chatType - Type of chat: "dm" | "channel" | "group" | "global"
 * @param userAddress - Current user's address
 * @param userName - Current user's display name
 */
export function useTypingIndicator(
    chatId: string | null,
    chatType: "dm" | "channel" | "group" | "global",
    userAddress: string | null,
    userName?: string
): TypingIndicatorReturn {
    const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
    const lastBroadcastRef = useRef<number>(0);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Channel name for Supabase Realtime
    const channelName = chatId ? `typing:${chatType}:${chatId}` : null;

    // Broadcast that the user is typing
    const broadcastTyping = useCallback(async () => {
        if (!chatId || !userAddress || !isSupabaseConfigured || !supabase) return;

        const now = Date.now();
        // Debounce broadcasts
        if (now - lastBroadcastRef.current < BROADCAST_DEBOUNCE) return;
        lastBroadcastRef.current = now;

        try {
            const channel = supabase.channel(channelName!);
            await channel.send({
                type: "broadcast",
                event: "typing",
                payload: {
                    address: normalizeAddress(userAddress),
                    name: userName,
                    timestamp: now,
                },
            });
        } catch (err) {
            // Silently fail - typing indicators are non-critical
        }
    }, [chatId, userAddress, userName, channelName]);

    // Broadcast that the user stopped typing
    const broadcastStopTyping = useCallback(async () => {
        if (!chatId || !userAddress || !isSupabaseConfigured || !supabase) return;

        try {
            const channel = supabase.channel(channelName!);
            await channel.send({
                type: "broadcast",
                event: "stop_typing",
                payload: {
                    address: normalizeAddress(userAddress),
                },
            });
        } catch (err) {
            // Silently fail
        }
    }, [chatId, userAddress, channelName]);

    // Set typing status
    const setTyping = useCallback(() => {
        broadcastTyping();

        // Clear any existing timeout
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        // Auto-stop typing after timeout
        typingTimeoutRef.current = setTimeout(() => {
            broadcastStopTyping();
        }, TYPING_TIMEOUT);
    }, [broadcastTyping, broadcastStopTyping]);

    // Stop typing
    const stopTyping = useCallback(() => {
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }
        broadcastStopTyping();
    }, [broadcastStopTyping]);

    // Subscribe to typing events
    useEffect(() => {
        if (!chatId || !isSupabaseConfigured || !supabase || !channelName) return;

        const channel = supabase.channel(channelName);

        channel
            .on("broadcast", { event: "typing" }, ({ payload }) => {
                if (!payload || payload.address === normalizeAddress(userAddress || "")) return;

                setTypingUsers((prev) => {
                    // Update or add the typing user
                    const existing = prev.find((u) => u.address === payload.address);
                    if (existing) {
                        return prev.map((u) =>
                            u.address === payload.address
                                ? { ...u, timestamp: payload.timestamp, name: payload.name }
                                : u
                        );
                    }
                    return [...prev, { address: payload.address, name: payload.name, timestamp: payload.timestamp }];
                });
            })
            .on("broadcast", { event: "stop_typing" }, ({ payload }) => {
                if (!payload) return;
                setTypingUsers((prev) => prev.filter((u) => u.address !== payload.address));
            })
            .subscribe();

        // Cleanup stale typing users periodically
        cleanupIntervalRef.current = setInterval(() => {
            const now = Date.now();
            setTypingUsers((prev) =>
                prev.filter((u) => now - u.timestamp < TYPING_TIMEOUT)
            );
        }, 1000);

        return () => {
            channel.unsubscribe();
            if (cleanupIntervalRef.current) {
                clearInterval(cleanupIntervalRef.current);
            }
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
        };
    }, [chatId, channelName, userAddress]);

    return {
        typingUsers,
        setTyping,
        stopTyping,
    };
}
