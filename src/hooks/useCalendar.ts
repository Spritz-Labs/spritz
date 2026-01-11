import { useState, useEffect, useCallback } from "react";

type CalendarConnection = {
    id: string;
    provider: string;
    calendar_email: string | null;
    is_active: boolean;
    last_sync_at: string | null;
    created_at: string;
};

type AvailabilityWindow = {
    id: string;
    wallet_address: string;
    name: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    timezone: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
};

export function useCalendar(userAddress: string | null) {
    const [connection, setConnection] = useState<CalendarConnection | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [availabilityWindows, setAvailabilityWindows] = useState<AvailabilityWindow[]>([]);

    // Fetch connection status
    const fetchStatus = useCallback(async () => {
        if (!userAddress) return;

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/calendar/status?userAddress=${encodeURIComponent(userAddress)}`);
            
            let data;
            try {
                data = await res.json();
            } catch (parseErr) {
                // If JSON parsing fails, treat as not connected
                console.error("[useCalendar] Failed to parse status response:", parseErr);
                setConnection(null);
                setError(null);
                return;
            }
            
            if (!res.ok) {
                // If it's a table not found error or any error, just return not connected
                // Don't throw - gracefully handle all errors
                if (data.details?.includes("does not exist") || 
                    data.error?.includes("does not exist") ||
                    data.error?.includes("Failed to fetch")) {
                    setConnection(null);
                    setError(null);
                    return;
                }
                // For other errors, log but don't throw - just set not connected
                console.warn("[useCalendar] Status fetch returned error:", data.error);
                setConnection(null);
                setError(null);
                return;
            }

            // Success - set connection data
            setConnection(data.connection || null);
            setError(null); // Clear any previous errors
        } catch (err) {
            console.error("[useCalendar] Fetch status error:", err);
            // Always handle gracefully - never throw
            setConnection(null);
            // Only set error for unexpected issues, not network errors
            if (err instanceof Error && !err.message.includes("Failed to fetch")) {
                setError(err.message);
            } else {
                setError(null);
            }
        } finally {
            setIsLoading(false);
        }
    }, [userAddress]);

    // Fetch availability windows
    const fetchAvailabilityWindows = useCallback(async () => {
        if (!userAddress) return;

        try {
            const res = await fetch(`/api/calendar/availability?userAddress=${encodeURIComponent(userAddress)}`);
            
            let data;
            try {
                data = await res.json();
            } catch (parseErr) {
                // If JSON parsing fails, treat as empty
                console.error("[useCalendar] Failed to parse availability response:", parseErr);
                setAvailabilityWindows([]);
                return;
            }
            
            if (!res.ok) {
                // If it's a table not found error or any error, just return empty array
                // Don't throw - gracefully handle all errors
                if (data.details?.includes("does not exist") || 
                    data.error?.includes("does not exist") ||
                    data.error?.includes("Failed to fetch")) {
                    setAvailabilityWindows([]);
                    return;
                }
                // For other errors, log but don't throw - just set empty array
                console.warn("[useCalendar] Availability fetch returned error:", data.error);
                setAvailabilityWindows([]);
                return;
            }

            // Success - set windows data
            setAvailabilityWindows(data.windows || []);
        } catch (err) {
            console.error("[useCalendar] Fetch availability error:", err);
            // Always set empty array on error - never throw
            setAvailabilityWindows([]);
        }
    }, [userAddress]);

    // Connect calendar (initiate OAuth)
    const connect = useCallback(async () => {
        if (!userAddress) return false;

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/calendar/connect?userAddress=${encodeURIComponent(userAddress)}`);
            if (!res.ok) throw new Error("Failed to initiate calendar connection");

            const data = await res.json();
            // Redirect to Google OAuth
            window.location.href = data.authUrl;
            return true;
        } catch (err) {
            console.error("[useCalendar] Connect error:", err);
            setError(err instanceof Error ? err.message : "Failed to connect calendar");
            setIsLoading(false);
            return false;
        }
    }, [userAddress]);

    // Disconnect calendar
    const disconnect = useCallback(async () => {
        if (!userAddress) return false;

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/calendar/disconnect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include", // Important for session cookie
                body: JSON.stringify({ userAddress }),
            });

            if (!res.ok) throw new Error("Failed to disconnect calendar");

            setConnection(null);
            return true;
        } catch (err) {
            console.error("[useCalendar] Disconnect error:", err);
            setError(err instanceof Error ? err.message : "Failed to disconnect calendar");
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [userAddress]);

    // Save availability window
    const saveAvailabilityWindow = useCallback(async (
        windowData: {
            id?: string;
            name: string;
            dayOfWeek: number;
            startTime: string;
            endTime: string;
            timezone?: string;
        }
    ) => {
        if (!userAddress) return null;

        try {
            const res = await fetch("/api/calendar/availability", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include", // Important for session cookie
                body: JSON.stringify({
                    userAddress,
                    ...windowData,
                }),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to save availability window");
            }

            const data = await res.json();
            await fetchAvailabilityWindows(); // Refresh list
            return data.window;
        } catch (err) {
            console.error("[useCalendar] Save availability error:", err);
            throw err;
        }
    }, [userAddress, fetchAvailabilityWindows]);

    // Delete availability window
    const deleteAvailabilityWindow = useCallback(async (id: string) => {
        if (!userAddress) return false;

        try {
            const res = await fetch(
                `/api/calendar/availability?userAddress=${encodeURIComponent(userAddress)}&id=${id}`,
                { method: "DELETE" }
            );

            if (!res.ok) throw new Error("Failed to delete availability window");

            await fetchAvailabilityWindows(); // Refresh list
            return true;
        } catch (err) {
            console.error("[useCalendar] Delete availability error:", err);
            throw err;
        }
    }, [userAddress, fetchAvailabilityWindows]);

    // Load data on mount and when userAddress changes
    useEffect(() => {
        if (userAddress) {
            fetchStatus();
            fetchAvailabilityWindows();
        }
    }, [userAddress, fetchStatus, fetchAvailabilityWindows]);

    // Check for OAuth callback success/error
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const connected = params.get("calendar_connected");
        const error = params.get("calendar_error");

        if (connected === "true") {
            console.log("[useCalendar] OAuth callback successful, refreshing status...");
            // Remove query params and refresh status
            window.history.replaceState({}, "", window.location.pathname);
            // Small delay to ensure database write is complete
            setTimeout(() => {
                fetchStatus();
            }, 500);
        } else if (error) {
            const errorMessage = decodeURIComponent(error);
            console.error("[useCalendar] OAuth callback error:", errorMessage);
            setError(errorMessage);
            window.history.replaceState({}, "", window.location.pathname);
        }
    }, [fetchStatus]);

    return {
        connection,
        isConnected: !!connection,
        isLoading,
        error,
        availabilityWindows,
        connect,
        disconnect,
        saveAvailabilityWindow,
        deleteAvailabilityWindow,
        refresh: fetchStatus,
    };
}

