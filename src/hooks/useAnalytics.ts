"use client";

import { useCallback, useRef } from "react";

type AnalyticsEvent = 
    | { type: "message_sent" }
    | { type: "friend_added" }
    | { type: "friend_removed" }
    | { type: "voice_call"; durationMinutes: number }
    | { type: "video_call"; durationMinutes: number }
    | { type: "group_joined" }
    | { type: "group_left" }
    | { type: "sync_friends"; count: number }
    | { type: "sync_groups"; count: number };

export function useAnalytics(walletAddress: string | null) {
    const pendingEvents = useRef<AnalyticsEvent[]>([]);
    const isProcessing = useRef(false);

    const trackEvent = useCallback(async (event: AnalyticsEvent) => {
        if (!walletAddress) return;

        // Queue the event
        pendingEvents.current.push(event);

        // Process queue if not already processing
        if (!isProcessing.current) {
            isProcessing.current = true;
            
            // Debounce - wait a bit to batch events
            setTimeout(async () => {
                const events = [...pendingEvents.current];
                pendingEvents.current = [];
                isProcessing.current = false;

                // Send each event (could batch these in future)
                for (const evt of events) {
                    try {
                        await fetch("/api/admin/track-analytics", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ walletAddress, event: evt }),
                        });
                    } catch (err) {
                        console.error("[Analytics] Failed to track event:", err);
                    }
                }
            }, 500);
        }
    }, [walletAddress]);

    // Convenience methods
    const trackMessageSent = useCallback(() => {
        trackEvent({ type: "message_sent" });
    }, [trackEvent]);

    const trackFriendAdded = useCallback(() => {
        trackEvent({ type: "friend_added" });
    }, [trackEvent]);

    const trackFriendRemoved = useCallback(() => {
        trackEvent({ type: "friend_removed" });
    }, [trackEvent]);

    const trackVoiceCall = useCallback((durationMinutes: number) => {
        trackEvent({ type: "voice_call", durationMinutes });
    }, [trackEvent]);

    const trackVideoCall = useCallback((durationMinutes: number) => {
        trackEvent({ type: "video_call", durationMinutes });
    }, [trackEvent]);

    const trackGroupJoined = useCallback(() => {
        trackEvent({ type: "group_joined" });
    }, [trackEvent]);

    const trackGroupLeft = useCallback(() => {
        trackEvent({ type: "group_left" });
    }, [trackEvent]);

    const syncFriendsCount = useCallback((count: number) => {
        trackEvent({ type: "sync_friends", count });
    }, [trackEvent]);

    const syncGroupsCount = useCallback((count: number) => {
        trackEvent({ type: "sync_groups", count });
    }, [trackEvent]);

    return {
        trackEvent,
        trackMessageSent,
        trackFriendAdded,
        trackFriendRemoved,
        trackVoiceCall,
        trackVideoCall,
        trackGroupJoined,
        trackGroupLeft,
        syncFriendsCount,
        syncGroupsCount,
    };
}

