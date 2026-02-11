"use client";

import { useState, useEffect, useCallback } from "react";
import type { PoapItem } from "@/components/MentionInput";

/**
 * Hook to fetch and cache the current user's POAPs for the /poap chat command.
 * Uses the existing /api/poap/scan endpoint.
 */
export function usePoaps(walletAddress: string | null | undefined) {
    const [poaps, setPoaps] = useState<PoapItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetched, setFetched] = useState(false);

    const fetchPoaps = useCallback(async () => {
        if (!walletAddress || fetched || loading) return;
        setLoading(true);
        try {
            const res = await fetch(
                `/api/poap/scan?address=${encodeURIComponent(walletAddress)}`
            );
            if (res.ok) {
                const data = await res.json();
                const events: PoapItem[] = (data.events || []).map(
                    (e: { eventId: number; eventName: string; imageUrl: string | null }) => ({
                        eventId: e.eventId,
                        eventName: e.eventName,
                        imageUrl: e.imageUrl,
                    })
                );
                setPoaps(events);
            }
        } catch (err) {
            console.error("[usePoaps] Failed to fetch:", err);
        } finally {
            setLoading(false);
            setFetched(true);
        }
    }, [walletAddress, fetched, loading]);

    // Fetch on mount / when wallet address changes
    useEffect(() => {
        if (walletAddress && !fetched) {
            fetchPoaps();
        }
    }, [walletAddress, fetched, fetchPoaps]);

    // Reset when wallet changes
    useEffect(() => {
        setFetched(false);
        setPoaps([]);
    }, [walletAddress]);

    return { poaps, loading };
}
