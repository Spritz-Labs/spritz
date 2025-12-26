"use client";

import { useEffect, useRef, useCallback } from "react";

type LoginTrackingParams = {
    walletAddress: string;
    walletType?: string | null;
    chain?: string;
    ensName?: string | null;
    username?: string | null;
};

const TRACKING_KEY = "spritz_last_login_track";

export function useLoginTracking({
    walletAddress,
    walletType = "unknown",
    chain = "ethereum",
    ensName,
    username,
}: LoginTrackingParams) {
    const hasTracked = useRef(false);

    const trackLogin = useCallback(async () => {
        if (!walletAddress || hasTracked.current) return;

        // Check if we've tracked this session already
        const lastTracked = localStorage.getItem(TRACKING_KEY);
        const trackingData = lastTracked ? JSON.parse(lastTracked) : null;
        
        // Only track once per session (every 30 minutes)
        const thirtyMinutes = 30 * 60 * 1000;
        if (
            trackingData && 
            trackingData.address === walletAddress.toLowerCase() &&
            Date.now() - trackingData.timestamp < thirtyMinutes
        ) {
            hasTracked.current = true;
            return;
        }

        hasTracked.current = true;

        try {
            // Get invite code from URL if present
            const urlParams = new URLSearchParams(window.location.search);
            const inviteCode = urlParams.get("invite") || urlParams.get("ref");

            await fetch("/api/admin/track-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    walletAddress,
                    walletType,
                    chain,
                    ensName,
                    username,
                    inviteCode,
                }),
            });

            // Save tracking timestamp
            localStorage.setItem(
                TRACKING_KEY,
                JSON.stringify({
                    address: walletAddress.toLowerCase(),
                    timestamp: Date.now(),
                })
            );

            console.log("[Login] Tracked user login:", walletAddress);
        } catch (error) {
            console.error("[Login] Failed to track login:", error);
        }
    }, [walletAddress, walletType, chain, ensName, username]);

    // Track login on mount
    useEffect(() => {
        trackLogin();
    }, [trackLogin]);

    return { trackLogin };
}

