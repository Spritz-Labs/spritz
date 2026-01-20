"use client";

/**
 * Inactivity Monitor Hook
 * 
 * Monitors user activity and triggers a callback when the user has been
 * inactive for a specified duration. Also handles app backgrounding.
 * 
 * SECURITY: This is critical for wallet security to prevent unauthorized
 * access when users leave their devices unattended.
 * 
 * Features:
 * - Tracks mouse, keyboard, and touch events
 * - Shorter timeout when app is backgrounded (visibility change)
 * - Configurable timeout duration
 * - Supports "warning" callback before lock
 */

import { useEffect, useRef, useCallback, useState } from "react";

export type InactivityConfig = {
    /** Timeout in milliseconds (default: 15 minutes) */
    timeout?: number;
    /** Timeout when app is backgrounded in milliseconds (default: 1 minute) */
    backgroundTimeout?: number;
    /** Warning threshold before lock in milliseconds (default: 1 minute before lock) */
    warningThreshold?: number;
    /** Callback when user becomes inactive */
    onInactive: () => void;
    /** Callback when warning threshold is reached (optional) */
    onWarning?: () => void;
    /** Whether the monitor is enabled (default: true) */
    enabled?: boolean;
};

const DEFAULT_TIMEOUT = 15 * 60 * 1000; // 15 minutes
const DEFAULT_BACKGROUND_TIMEOUT = 60 * 1000; // 1 minute
const DEFAULT_WARNING_THRESHOLD = 60 * 1000; // 1 minute before lock

export function useInactivityMonitor({
    timeout = DEFAULT_TIMEOUT,
    backgroundTimeout = DEFAULT_BACKGROUND_TIMEOUT,
    warningThreshold = DEFAULT_WARNING_THRESHOLD,
    onInactive,
    onWarning,
    enabled = true,
}: InactivityConfig) {
    const lastActivityRef = useRef<number>(Date.now());
    const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const backgroundTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const warningShownRef = useRef<boolean>(false);
    const [isWarningShown, setIsWarningShown] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

    // Reset the activity timer
    const resetActivity = useCallback(() => {
        lastActivityRef.current = Date.now();
        warningShownRef.current = false;
        setIsWarningShown(false);
        setTimeRemaining(null);
    }, []);

    // Check for inactivity
    const checkInactivity = useCallback(() => {
        const now = Date.now();
        const elapsed = now - lastActivityRef.current;
        const remaining = timeout - elapsed;

        // Update time remaining for UI
        if (remaining <= warningThreshold && remaining > 0) {
            setTimeRemaining(Math.ceil(remaining / 1000));
        } else {
            setTimeRemaining(null);
        }

        // Check for warning threshold
        if (remaining <= warningThreshold && remaining > 0 && !warningShownRef.current) {
            warningShownRef.current = true;
            setIsWarningShown(true);
            onWarning?.();
        }

        // Check for timeout
        if (elapsed >= timeout) {
            console.log("[InactivityMonitor] User inactive, triggering lock");
            onInactive();
        }
    }, [timeout, warningThreshold, onInactive, onWarning]);

    // Handle visibility change (app backgrounded)
    const handleVisibilityChange = useCallback(() => {
        if (document.hidden) {
            // App is now hidden - start shorter timeout
            console.log("[InactivityMonitor] App backgrounded");
            
            if (backgroundTimeoutRef.current) {
                clearTimeout(backgroundTimeoutRef.current);
            }
            
            backgroundTimeoutRef.current = setTimeout(() => {
                if (document.hidden) {
                    console.log("[InactivityMonitor] Background timeout reached");
                    onInactive();
                }
            }, backgroundTimeout);
        } else {
            // App is visible again - cancel background timeout
            console.log("[InactivityMonitor] App foregrounded");
            
            if (backgroundTimeoutRef.current) {
                clearTimeout(backgroundTimeoutRef.current);
                backgroundTimeoutRef.current = null;
            }
            
            // Reset activity on foreground
            resetActivity();
        }
    }, [backgroundTimeout, onInactive, resetActivity]);

    // Activity event handler
    const handleActivity = useCallback(() => {
        resetActivity();
    }, [resetActivity]);

    useEffect(() => {
        if (!enabled || typeof window === "undefined") {
            return;
        }

        // Activity events to track
        const events = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"];

        // Add event listeners
        events.forEach((event) => {
            document.addEventListener(event, handleActivity, { passive: true });
        });

        // Add visibility change listener
        document.addEventListener("visibilitychange", handleVisibilityChange);

        // Start periodic check (every 30 seconds)
        checkIntervalRef.current = setInterval(checkInactivity, 30000);

        // Initial check
        checkInactivity();

        // Cleanup
        return () => {
            events.forEach((event) => {
                document.removeEventListener(event, handleActivity);
            });
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            
            if (checkIntervalRef.current) {
                clearInterval(checkIntervalRef.current);
            }
            if (backgroundTimeoutRef.current) {
                clearTimeout(backgroundTimeoutRef.current);
            }
        };
    }, [enabled, handleActivity, handleVisibilityChange, checkInactivity]);

    return {
        /** Manually reset the activity timer (e.g., after re-authentication) */
        resetActivity,
        /** Whether the warning is currently being shown */
        isWarningShown,
        /** Seconds remaining until lock (only set when in warning period) */
        timeRemaining,
    };
}

/**
 * Session lock state management
 * 
 * This manages a "locked" state that requires re-authentication
 */
export function useSessionLock() {
    const [isLocked, setIsLocked] = useState(false);
    const [lockReason, setLockReason] = useState<"inactivity" | "manual" | null>(null);

    const lock = useCallback((reason: "inactivity" | "manual" = "inactivity") => {
        console.log("[SessionLock] Locking session:", reason);
        setIsLocked(true);
        setLockReason(reason);
    }, []);

    const unlock = useCallback(() => {
        console.log("[SessionLock] Unlocking session");
        setIsLocked(false);
        setLockReason(null);
    }, []);

    return {
        isLocked,
        lockReason,
        lock,
        unlock,
    };
}
