"use client";

import { useEffect, useRef, useCallback, useState } from "react";

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
    const [dailyBonusAvailable, setDailyBonusAvailable] = useState(false);
    const [isClaimingBonus, setIsClaimingBonus] = useState(false);

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
            // Still check daily bonus availability
            checkDailyBonus();
            return;
        }

        hasTracked.current = true;

        try {
            // Get invite code from URL if present
            const urlParams = new URLSearchParams(window.location.search);
            const inviteCode = urlParams.get("invite") || urlParams.get("ref");

            const response = await fetch("/api/admin/track-login", {
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
                credentials: "include", // Important for session cookie
            });

            const data = await response.json();
            
            // Check if daily bonus is available
            if (data.dailyBonusAvailable) {
                setDailyBonusAvailable(true);
            }

            // Save tracking timestamp
            localStorage.setItem(
                TRACKING_KEY,
                JSON.stringify({
                    address: walletAddress.toLowerCase(),
                    timestamp: Date.now(),
                })
            );

            console.log("[Login] Tracked user login:", walletAddress, "dailyBonus:", data.dailyBonusAvailable);
        } catch (error) {
            console.error("[Login] Failed to track login:", error);
        }
    }, [walletAddress, walletType, chain, ensName, username]);

    // Check daily bonus availability
    const checkDailyBonus = useCallback(async () => {
        if (!walletAddress) return;
        
        try {
            const response = await fetch(`/api/points/daily?address=${walletAddress}`, {
                credentials: "include", // Important for session cookie
            });
            const data = await response.json();
            setDailyBonusAvailable(data.available || false);
        } catch (error) {
            console.error("[Login] Failed to check daily bonus:", error);
        }
    }, [walletAddress]);

    // Claim daily bonus
    const claimDailyBonus = useCallback(async (): Promise<boolean> => {
        if (!walletAddress || !dailyBonusAvailable || isClaimingBonus) return false;
        
        setIsClaimingBonus(true);
        try {
            const response = await fetch("/api/points/daily", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ walletAddress }),
                credentials: "include", // Important for session cookie
            });
            
            const data = await response.json();
            
            if (data.success) {
                setDailyBonusAvailable(false);
                console.log("[Login] Daily bonus claimed:", data.points, "points");
                return true;
            } else {
                console.log("[Login] Daily bonus claim failed:", data.error);
                setDailyBonusAvailable(false);
                return false;
            }
        } catch (error) {
            console.error("[Login] Failed to claim daily bonus:", error);
            return false;
        } finally {
            setIsClaimingBonus(false);
        }
    }, [walletAddress, dailyBonusAvailable, isClaimingBonus]);

    // Track login on mount
    useEffect(() => {
        trackLogin();
    }, [trackLogin]);

    return { 
        trackLogin, 
        dailyBonusAvailable, 
        claimDailyBonus, 
        isClaimingBonus,
        checkDailyBonus,
    };
}

