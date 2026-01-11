"use client";

import { useState, useCallback, useEffect } from "react";
import type { Stream } from "@/app/api/streams/route";
import type { StreamAsset } from "@/app/api/streams/[id]/assets/route";

export function useStreams(userAddress: string | null) {
    const [streams, setStreams] = useState<Stream[]>([]);
    const [liveStreams, setLiveStreams] = useState<Stream[]>([]);
    const [currentStream, setCurrentStream] = useState<Stream | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch user's streams
    const fetchMyStreams = useCallback(async () => {
        if (!userAddress) return;

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/streams?userAddress=${userAddress}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch streams");
            }

            setStreams(data.streams || []);
            
            // Check if user has an active stream
            const activeStream = data.streams?.find(
                (s: Stream) => s.status === "idle" || s.status === "live"
            );
            setCurrentStream(activeStream || null);
        } catch (e) {
            console.error("[useStreams] Error fetching streams:", e);
            setError(e instanceof Error ? e.message : "Failed to fetch streams");
        } finally {
            setIsLoading(false);
        }
    }, [userAddress]);

    // Fetch all live streams
    const fetchLiveStreams = useCallback(async () => {
        try {
            const res = await fetch("/api/streams?live=true");
            const data = await res.json();

            if (res.ok) {
                setLiveStreams(data.streams || []);
            }
        } catch (e) {
            console.error("[useStreams] Error fetching live streams:", e);
        }
    }, []);

    // Create a new stream
    const createStream = useCallback(
        async (title?: string, description?: string): Promise<Stream | null> => {
            if (!userAddress) return null;

            setIsLoading(true);
            setError(null);

            try {
                const res = await fetch("/api/streams", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include", // Important for session cookie
                    body: JSON.stringify({
                        userAddress,
                        title,
                        description,
                    }),
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || "Failed to create stream");
                }

                setCurrentStream(data.stream);
                await fetchMyStreams();
                return data.stream;
            } catch (e) {
                console.error("[useStreams] Error creating stream:", e);
                setError(e instanceof Error ? e.message : "Failed to create stream");
                return null;
            } finally {
                setIsLoading(false);
            }
        },
        [userAddress, fetchMyStreams]
    );

    // Go live
    const goLive = useCallback(
        async (streamId: string): Promise<boolean> => {
            if (!userAddress) return false;

            try {
                const res = await fetch(`/api/streams/${streamId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userAddress,
                        action: "go_live",
                    }),
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || "Failed to go live");
                }

                setCurrentStream(data.stream);
                return true;
            } catch (e) {
                console.error("[useStreams] Error going live:", e);
                setError(e instanceof Error ? e.message : "Failed to go live");
                return false;
            }
        },
        [userAddress]
    );

    // End stream
    const endStream = useCallback(
        async (streamId: string): Promise<boolean> => {
            if (!userAddress) return false;

            try {
                const res = await fetch(`/api/streams/${streamId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userAddress,
                        action: "end",
                    }),
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || "Failed to end stream");
                }

                setCurrentStream(null);
                // Refresh both user streams and live streams list
                await Promise.all([fetchMyStreams(), fetchLiveStreams()]);
                return true;
            } catch (e) {
                console.error("[useStreams] Error ending stream:", e);
                setError(e instanceof Error ? e.message : "Failed to end stream");
                return false;
            }
        },
        [userAddress, fetchMyStreams, fetchLiveStreams]
    );

    // Delete stream
    const deleteStream = useCallback(
        async (streamId: string): Promise<boolean> => {
            if (!userAddress) return false;

            try {
                const res = await fetch(
                    `/api/streams/${streamId}?userAddress=${userAddress}`,
                    { method: "DELETE" }
                );

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || "Failed to delete stream");
                }

                if (currentStream?.id === streamId) {
                    setCurrentStream(null);
                }
                await fetchMyStreams();
                return true;
            } catch (e) {
                console.error("[useStreams] Error deleting stream:", e);
                setError(e instanceof Error ? e.message : "Failed to delete stream");
                return false;
            }
        },
        [userAddress, currentStream, fetchMyStreams]
    );

    // Load on mount
    useEffect(() => {
        if (userAddress) {
            fetchMyStreams();
            fetchLiveStreams();
        }
    }, [userAddress, fetchMyStreams, fetchLiveStreams]);

    // Poll for live streams every 30 seconds
    useEffect(() => {
        const interval = setInterval(fetchLiveStreams, 30000);
        return () => clearInterval(interval);
    }, [fetchLiveStreams]);

    return {
        streams,
        liveStreams,
        currentStream,
        isLoading,
        error,
        createStream,
        goLive,
        endStream,
        deleteStream,
        fetchMyStreams,
        fetchLiveStreams,
    };
}

// Hook for stream assets (recordings)
export function useStreamAssets(streamId: string | null) {
    const [assets, setAssets] = useState<StreamAsset[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchAssets = useCallback(async (refresh = false) => {
        if (!streamId) return;

        setIsLoading(true);
        try {
            const url = `/api/streams/${streamId}/assets${refresh ? "?refresh=true" : ""}`;
            const res = await fetch(url);
            const data = await res.json();

            if (res.ok) {
                setAssets(data.assets || []);
            }
        } catch (e) {
            console.error("[useStreamAssets] Error:", e);
        } finally {
            setIsLoading(false);
        }
    }, [streamId]);

    useEffect(() => {
        if (streamId) {
            fetchAssets();
        }
    }, [streamId, fetchAssets]);

    return {
        assets,
        isLoading,
        fetchAssets,
        refreshAssets: () => fetchAssets(true),
    };
}

