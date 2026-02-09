"use client";

import { useEffect, useRef, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/config/supabase";
import { normalizeAddress } from "@/utils/address";

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const ONLINE_THRESHOLD = 120000; // 2 minutes - consider online if seen within this time

/**
 * Hook to manage user presence (online status)
 * Sends a heartbeat every 30 seconds to update last_seen
 */
export function usePresence(userAddress: string | null) {
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const sendHeartbeat = useCallback(async () => {
        if (!userAddress || !isSupabaseConfigured || !supabase) return;

        try {
            await supabase
                .from("shout_user_settings")
                .upsert(
                    {
                        wallet_address: normalizeAddress(userAddress),
                        last_seen: new Date().toISOString(),
                    },
                    { onConflict: "wallet_address" }
                );
        } catch (err) {
            // Silently fail - presence is non-critical
        }
    }, [userAddress]);

    useEffect(() => {
        if (!userAddress || !isSupabaseConfigured || !supabase) return;

        // Send initial heartbeat
        sendHeartbeat();

        // Set up interval
        intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        // Also send heartbeat on visibility change (when user returns to tab)
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                sendHeartbeat();
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [userAddress, sendHeartbeat]);
}

/**
 * Check if a timestamp is within the online threshold
 */
export function isUserOnline(lastSeen: string | null): boolean {
    if (!lastSeen) return false;
    const lastSeenTime = new Date(lastSeen).getTime();
    const now = Date.now();
    return now - lastSeenTime < ONLINE_THRESHOLD;
}

/**
 * Fetch online status for multiple addresses
 */
export async function fetchOnlineStatuses(
    addresses: string[]
): Promise<Record<string, boolean>> {
    if (!isSupabaseConfigured || !supabase || addresses.length === 0) {
        return {};
    }

    try {
        const normalizedAddresses = addresses.map((a) => normalizeAddress(a));

        const { data, error } = await supabase
            .from("shout_user_settings")
            .select("wallet_address, last_seen")
            .in("wallet_address", normalizedAddresses);

        if (error || !data) {
            return {};
        }

        const statuses: Record<string, boolean> = {};
        data.forEach((row) => {
            statuses[row.wallet_address] = isUserOnline(row.last_seen);
        });

        return statuses;
    } catch (err) {
        console.warn("[usePresence] Failed to fetch online statuses");
        return {};
    }
}


