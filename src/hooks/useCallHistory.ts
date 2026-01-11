import { useState, useCallback, useEffect } from "react";
import type { CallHistoryEntry } from "@/app/api/calls/route";

export function useCallHistory(userAddress: string | null) {
    const [calls, setCalls] = useState<CallHistoryEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchCallHistory = useCallback(async () => {
        if (!userAddress) return;

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(
                `/api/calls?userAddress=${encodeURIComponent(userAddress)}&limit=50`
            );
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch call history");
            }

            setCalls(data.calls || []);
        } catch (e) {
            console.error("[useCallHistory] Error:", e);
            setError(e instanceof Error ? e.message : "Failed to fetch call history");
        } finally {
            setIsLoading(false);
        }
    }, [userAddress]);

    const logCall = useCallback(
        async (params: {
            calleeAddress: string;
            callType: "audio" | "video";
            status: "completed" | "missed" | "declined" | "failed";
            channelName?: string;
            startedAt?: string;
            endedAt?: string;
            durationSeconds?: number;
            callerAddress?: string; // Override if user is callee (for declined/missed incoming calls)
        }) => {
            if (!userAddress) return null;

            try {
                const { callerAddress: overrideCallerAddress, ...rest } = params;
                const res = await fetch("/api/calls", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include", // Important for session cookie
                    body: JSON.stringify({
                        callerAddress: overrideCallerAddress || userAddress,
                        ...rest,
                    }),
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || "Failed to log call");
                }

                // Refresh call history
                await fetchCallHistory();

                return data.call as CallHistoryEntry;
            } catch (e) {
                console.error("[useCallHistory] Error logging call:", e);
                return null;
            }
        },
        [userAddress, fetchCallHistory]
    );

    const updateCall = useCallback(
        async (
            callId: string,
            updates: {
                endedAt?: string;
                durationSeconds?: number;
                status?: "completed" | "missed" | "declined" | "failed";
            }
        ) => {
            try {
                const res = await fetch("/api/calls", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include", // Important for session cookie
                    body: JSON.stringify({ callId, ...updates }),
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || "Failed to update call");
                }

                // Refresh call history
                await fetchCallHistory();

                return data.call as CallHistoryEntry;
            } catch (e) {
                console.error("[useCallHistory] Error updating call:", e);
                return null;
            }
        },
        [fetchCallHistory]
    );

    // Fetch call history on mount
    useEffect(() => {
        fetchCallHistory();
    }, [fetchCallHistory]);

    return {
        calls,
        isLoading,
        error,
        fetchCallHistory,
        logCall,
        updateCall,
    };
}

// Helper to format call duration
export function formatCallDuration(seconds: number): string {
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
        return `${minutes}m ${remainingSeconds}s`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
}

// Helper to get relative time
export function getRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
}

