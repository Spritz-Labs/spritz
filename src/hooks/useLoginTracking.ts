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
const DAILY_BONUS_DISMISSED_KEY = "spritz_daily_bonus_dismissed";
const WELCOME_SEEN_KEY = "spritz_welcome_seen";

export function useLoginTracking({
    walletAddress,
    walletType = "unknown",
    chain = "ethereum",
    ensName,
    username,
}: LoginTrackingParams) {
    const hasTracked = useRef(false);
    const hasFetchedBonus = useRef(false); // Prevent double fetching
    const [dailyBonusAvailable, setDailyBonusAvailable] = useState(false);
    const [isClaimingBonus, setIsClaimingBonus] = useState(false);
    const [showWelcome, setShowWelcome] = useState(false);

    // Check if daily bonus was already dismissed today
    const wasDismissedToday = useCallback((): boolean => {
        try {
            const dismissed = localStorage.getItem(DAILY_BONUS_DISMISSED_KEY);
            if (!dismissed) return false;
            const data = JSON.parse(dismissed);
            const today = new Date().toISOString().split('T')[0];
            return data.date === today && data.address === walletAddress?.toLowerCase();
        } catch {
            return false;
        }
    }, [walletAddress]);

    // Mark daily bonus as dismissed for today
    const dismissDailyBonus = useCallback(() => {
        if (!walletAddress) return;
        const today = new Date().toISOString().split('T')[0];
        localStorage.setItem(DAILY_BONUS_DISMISSED_KEY, JSON.stringify({
            date: today,
            address: walletAddress.toLowerCase(),
        }));
    }, [walletAddress]);

    // Check if welcome message was already seen
    const wasWelcomeSeen = useCallback((): boolean => {
        try {
            const seen = localStorage.getItem(WELCOME_SEEN_KEY);
            if (!seen) return false;
            const data = JSON.parse(seen);
            return data.address === walletAddress?.toLowerCase();
        } catch {
            return false;
        }
    }, [walletAddress]);

    // Mark welcome as seen
    const dismissWelcome = useCallback(() => {
        if (!walletAddress) return;
        localStorage.setItem(WELCOME_SEEN_KEY, JSON.stringify({
            address: walletAddress.toLowerCase(),
            timestamp: Date.now(),
        }));
        setShowWelcome(false);
    }, [walletAddress]);

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
            // Still check daily bonus availability (only if not already fetched)
            if (!hasFetchedBonus.current) {
                checkDailyBonus();
            }
            // Check if we should show welcome (if user was marked as new and hasn't seen it)
            if (trackingData.isNewUser && !wasWelcomeSeen()) {
                setShowWelcome(true);
            }
            return;
        }

        hasTracked.current = true;
        hasFetchedBonus.current = true; // Prevent double fetching

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
            
            // Check if daily bonus is available (only if not dismissed today)
            if (data.dailyBonusAvailable && !wasDismissedToday()) {
                setDailyBonusAvailable(true);
            }

            // Show welcome message for new users (only if not seen before)
            if (data.isNewUser && !wasWelcomeSeen()) {
                setShowWelcome(true);
            }

            // Save tracking timestamp (and isNewUser flag for subsequent checks)
            localStorage.setItem(
                TRACKING_KEY,
                JSON.stringify({
                    address: walletAddress.toLowerCase(),
                    timestamp: Date.now(),
                    isNewUser: data.isNewUser || false,
                })
            );

            console.log("[Login] Tracked user login:", walletAddress, "isNewUser:", data.isNewUser, "dailyBonus:", data.dailyBonusAvailable);
        } catch (error) {
            console.error("[Login] Failed to track login:", error);
        }
    }, [walletAddress, walletType, chain, ensName, username, wasDismissedToday, wasWelcomeSeen]);

    // Check daily bonus availability
    const checkDailyBonus = useCallback(async () => {
        if (!walletAddress || hasFetchedBonus.current) return;
        
        hasFetchedBonus.current = true; // Prevent double fetching
        
        try {
            const response = await fetch(`/api/points/daily?address=${walletAddress}`, {
                credentials: "include", // Important for session cookie
            });
            const data = await response.json();
            
            // Only set available if not dismissed today
            if (data.available && !wasDismissedToday()) {
                setDailyBonusAvailable(true);
            } else {
                setDailyBonusAvailable(false);
            }
        } catch (error) {
            console.error("[Login] Failed to check daily bonus:", error);
        }
    }, [walletAddress, wasDismissedToday]);

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
                dismissDailyBonus(); // Mark as dismissed so it won't show again
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
    }, [walletAddress, dailyBonusAvailable, isClaimingBonus, dismissDailyBonus]);

    // Track login on mount
    useEffect(() => {
        trackLogin();
    }, [trackLogin]);

    // Reset hasFetchedBonus when wallet changes
    useEffect(() => {
        hasFetchedBonus.current = false;
    }, [walletAddress]);

    return { 
        trackLogin, 
        dailyBonusAvailable, 
        claimDailyBonus, 
        isClaimingBonus,
        checkDailyBonus,
        dismissDailyBonus, // Export so Dashboard can call it when user dismisses modal
        showWelcome,
        dismissWelcome,
    };
}

