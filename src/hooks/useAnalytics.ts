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
    | { type: "sync_groups"; count: number }
    | { type: "stream_created" }
    | { type: "stream_started" }
    | { type: "stream_ended"; durationMinutes: number }
    | { type: "stream_viewed"; durationMinutes?: number }
    | { type: "room_created" }
    | { type: "room_joined" }
    | { type: "schedule_created" }
    | { type: "schedule_joined" }
    | { type: "channel_joined" }
    | { type: "channel_left" };

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
                        const response = await fetch("/api/admin/track-analytics", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ walletAddress, event: evt }),
                        });

                        // Check if response is ok, but don't throw on errors
                        // Analytics failures should be silent to not disrupt user experience
                        if (!response.ok) {
                            console.warn("[Analytics] Failed to track event:", response.status, response.statusText);
                        }
                    } catch (err) {
                        // Silently fail - analytics should never break the app
                        // Only log in development
                        if (process.env.NODE_ENV === "development") {
                            console.warn("[Analytics] Failed to track event:", err);
                        }
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

    const trackStreamCreated = useCallback(() => {
        trackEvent({ type: "stream_created" });
    }, [trackEvent]);

    const trackStreamStarted = useCallback(() => {
        trackEvent({ type: "stream_started" });
    }, [trackEvent]);

    const trackStreamEnded = useCallback((durationMinutes: number) => {
        trackEvent({ type: "stream_ended", durationMinutes });
    }, [trackEvent]);

    const trackStreamViewed = useCallback((durationMinutes?: number) => {
        trackEvent({ type: "stream_viewed", durationMinutes });
    }, [trackEvent]);

    const trackRoomCreated = useCallback(() => {
        trackEvent({ type: "room_created" });
    }, [trackEvent]);

    const trackRoomJoined = useCallback(() => {
        trackEvent({ type: "room_joined" });
    }, [trackEvent]);

    const trackScheduleCreated = useCallback(() => {
        trackEvent({ type: "schedule_created" });
    }, [trackEvent]);

    const trackScheduleJoined = useCallback(() => {
        trackEvent({ type: "schedule_joined" });
    }, [trackEvent]);

    const trackChannelJoined = useCallback(() => {
        trackEvent({ type: "channel_joined" });
    }, [trackEvent]);

    const trackChannelLeft = useCallback(() => {
        trackEvent({ type: "channel_left" });
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
        trackStreamCreated,
        trackStreamStarted,
        trackStreamEnded,
        trackStreamViewed,
        trackRoomCreated,
        trackRoomJoined,
        trackScheduleCreated,
        trackScheduleJoined,
        trackChannelJoined,
        trackChannelLeft,
    };
}


