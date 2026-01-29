"use client";

/**
 * Screen Wake Lock Hook
 * 
 * Prevents the screen from dimming/locking while active.
 * Useful for:
 * - Video/audio calls (screen stays on)
 * - Active chat sessions (prevents disconnect from screen lock)
 * 
 * The wake lock is automatically released when:
 * - User switches to another app/tab
 * - The component unmounts
 * - You call release()
 * 
 * It's automatically re-acquired when the page becomes visible again.
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface WakeLockState {
    /** Whether wake lock is currently active */
    isActive: boolean;
    /** Whether the Wake Lock API is supported */
    isSupported: boolean;
    /** Any error that occurred */
    error: string | null;
}

export function useWakeLock(enabled: boolean = false) {
    const [state, setState] = useState<WakeLockState>({
        isActive: false,
        isSupported: false,
        error: null,
    });
    
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;

    // Check if Wake Lock API is supported
    useEffect(() => {
        const isSupported = typeof navigator !== "undefined" && "wakeLock" in navigator;
        setState(prev => ({ ...prev, isSupported }));
        
        if (!isSupported) {
            console.log("[WakeLock] Screen Wake Lock API not supported");
        }
    }, []);

    // Request wake lock
    const requestWakeLock = useCallback(async () => {
        if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
            return false;
        }

        try {
            // Release existing lock first
            if (wakeLockRef.current) {
                await wakeLockRef.current.release();
                wakeLockRef.current = null;
            }

            const wakeLock = await navigator.wakeLock.request("screen");
            wakeLockRef.current = wakeLock;
            
            console.log("[WakeLock] Screen wake lock acquired");
            setState(prev => ({ ...prev, isActive: true, error: null }));

            // Handle wake lock release (e.g., when tab becomes hidden)
            wakeLock.addEventListener("release", () => {
                console.log("[WakeLock] Screen wake lock released");
                wakeLockRef.current = null;
                setState(prev => ({ ...prev, isActive: false }));
            });

            return true;
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to acquire wake lock";
            console.warn("[WakeLock] Failed to acquire:", message);
            setState(prev => ({ ...prev, isActive: false, error: message }));
            return false;
        }
    }, []);

    // Release wake lock
    const releaseWakeLock = useCallback(async () => {
        if (wakeLockRef.current) {
            try {
                await wakeLockRef.current.release();
                wakeLockRef.current = null;
                console.log("[WakeLock] Screen wake lock manually released");
                setState(prev => ({ ...prev, isActive: false }));
            } catch (err) {
                console.warn("[WakeLock] Error releasing wake lock:", err);
            }
        }
    }, []);

    // Re-acquire wake lock when page becomes visible again
    useEffect(() => {
        if (typeof document === "undefined") return;

        const handleVisibilityChange = async () => {
            if (document.visibilityState === "visible" && enabledRef.current && !wakeLockRef.current) {
                console.log("[WakeLock] Page visible, re-acquiring wake lock");
                await requestWakeLock();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [requestWakeLock]);

    // Acquire/release based on enabled prop
    useEffect(() => {
        if (enabled && state.isSupported) {
            requestWakeLock();
        } else if (!enabled && wakeLockRef.current) {
            releaseWakeLock();
        }
    }, [enabled, state.isSupported, requestWakeLock, releaseWakeLock]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch(() => {});
                wakeLockRef.current = null;
            }
        };
    }, []);

    return {
        ...state,
        request: requestWakeLock,
        release: releaseWakeLock,
    };
}
