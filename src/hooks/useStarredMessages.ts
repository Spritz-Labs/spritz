"use client";

import { useState, useCallback, useEffect } from "react";
import type { StarredMessage } from "@/app/api/messages/starred/route";

export function useStarredMessages(userAddress: string | null) {
    const [starredMessages, setStarredMessages] = useState<StarredMessage[]>([]);
    const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);

    // Fetch starred messages
    const fetchStarred = useCallback(async () => {
        if (!userAddress) return;

        setIsLoading(true);
        try {
            const res = await fetch(`/api/messages/starred?userAddress=${userAddress}`);
            const data = await res.json();

            if (data.messages) {
                setStarredMessages(data.messages);
                setStarredIds(new Set(data.messages.map((m: StarredMessage) => m.message_id)));
            }
        } catch (error) {
            console.error("[useStarredMessages] Error fetching:", error);
        } finally {
            setIsLoading(false);
        }
    }, [userAddress]);

    // Check if a message is starred
    const isStarred = useCallback((messageId: string) => {
        return starredIds.has(messageId);
    }, [starredIds]);

    // Star a message
    const starMessage = useCallback(async (params: {
        messageId: string;
        messageType: "channel" | "dm" | "group" | "alpha";
        content: string;
        senderAddress: string;
        senderName?: string;
        channelId?: string;
        channelName?: string;
        peerAddress?: string;
        peerName?: string;
        groupId?: string;
        groupName?: string;
        originalCreatedAt: string;
        notes?: string;
    }) => {
        if (!userAddress) return false;

        try {
            const res = await fetch("/api/messages/starred", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAddress,
                    ...params,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setStarredMessages(prev => [data.starred, ...prev]);
                setStarredIds(prev => new Set([...prev, params.messageId]));
                return true;
            }
        } catch (error) {
            console.error("[useStarredMessages] Error starring:", error);
        }
        return false;
    }, [userAddress]);

    // Unstar a message
    const unstarMessage = useCallback(async (messageId: string) => {
        if (!userAddress) return false;

        try {
            const res = await fetch(
                `/api/messages/starred?userAddress=${userAddress}&messageId=${messageId}`,
                { method: "DELETE" }
            );

            if (res.ok) {
                setStarredMessages(prev => prev.filter(m => m.message_id !== messageId));
                setStarredIds(prev => {
                    const next = new Set(prev);
                    next.delete(messageId);
                    return next;
                });
                return true;
            }
        } catch (error) {
            console.error("[useStarredMessages] Error unstarring:", error);
        }
        return false;
    }, [userAddress]);

    // Toggle star
    const toggleStar = useCallback(async (params: Parameters<typeof starMessage>[0]) => {
        if (isStarred(params.messageId)) {
            return unstarMessage(params.messageId);
        } else {
            return starMessage(params);
        }
    }, [isStarred, starMessage, unstarMessage]);

    // Load on mount
    useEffect(() => {
        fetchStarred();
    }, [fetchStarred]);

    return {
        starredMessages,
        isLoading,
        isStarred,
        starMessage,
        unstarMessage,
        toggleStar,
        refresh: fetchStarred,
    };
}
