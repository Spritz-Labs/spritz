"use client";

/**
 * PWA Wallet Persistence Hook
 * 
 * Provides robust wallet reconnection for PWA scenarios where:
 * - App is backgrounded and WebSocket connections are killed
 * - User returns to app after extended period
 * - Mobile browser aggressively manages resources
 * 
 * Key features:
 * - Automatic reconnection on visibility change
 * - Retry logic with exponential backoff
 * - Separate "authenticated" state from "connected" state
 * - Grace period before showing "disconnected" UI
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useAccount, useReconnect } from "wagmi";

const RECONNECT_DELAY_MS = 500; // Initial delay before reconnect attempt
const MAX_RECONNECT_ATTEMPTS = 3; // Reduced from 5 - don't spam reconnects
const RECONNECT_BACKOFF_MULTIPLIER = 1.5;
const GRACE_PERIOD_MS = 3000; // Time to wait before showing "disconnected" UI
const SESSION_CHECK_INTERVAL = 30000; // Check session health every 30s

type ConnectionState = "connected" | "reconnecting" | "disconnected" | "checking";

export function usePWAWalletPersistence() {
    const { isConnected, isReconnecting: wagmiReconnecting, address } = useAccount();
    const { reconnect, connectors } = useReconnect();
    
    const [connectionState, setConnectionState] = useState<ConnectionState>("checking");
    const [reconnectAttempts, setReconnectAttempts] = useState(0);
    const [lastConnectedAddress, setLastConnectedAddress] = useState<string | null>(null);
    
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const gracePeriodRef = useRef<NodeJS.Timeout | null>(null);
    const mountedRef = useRef(true);
    const isReconnectingRef = useRef(false);

    // Check if user intentionally disconnected (escape hatch for reconnect loop)
    const wasIntentionallyDisconnected = useCallback((): boolean => {
        if (typeof window === "undefined") return false;
        return sessionStorage.getItem("wallet_intentionally_disconnected") === "true";
    }, []);

    // Check if we have a saved session that should reconnect
    const hasSavedSession = useCallback((): boolean => {
        if (typeof window === "undefined") return false;
        
        // Don't auto-reconnect if user intentionally disconnected
        if (wasIntentionallyDisconnected()) {
            return false;
        }
        
        try {
            // Check wagmi store
            const wagmiState = localStorage.getItem("wagmi.store");
            if (wagmiState) {
                const parsed = JSON.parse(wagmiState);
                if (parsed?.state?.current || parsed?.state?.connections) {
                    return true;
                }
            }
            // Check WalletConnect/AppKit sessions
            for (const key of Object.keys(localStorage)) {
                if (key.startsWith("wc@") || key.startsWith("@reown") || key.includes("walletconnect")) {
                    return true;
                }
            }
        } catch {
            // Ignore
        }
        return false;
    }, [wasIntentionallyDisconnected]);

    // Attempt reconnection with exponential backoff
    const attemptReconnect = useCallback(async () => {
        if (!mountedRef.current || isReconnectingRef.current) return false;
        if (!hasSavedSession()) {
            setConnectionState("disconnected");
            return false;
        }

        isReconnectingRef.current = true;
        setConnectionState("reconnecting");
        
        const currentAttempt = reconnectAttempts + 1;
        setReconnectAttempts(currentAttempt);
        
        console.log(`[PWA-Wallet] Reconnect attempt ${currentAttempt}/${MAX_RECONNECT_ATTEMPTS}`);
        
        try {
            await reconnect({ connectors });
            
            // Wait a bit to see if connection succeeds
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            if (!mountedRef.current) return false;
            
            // Check if we're now connected
            // Note: isConnected might not be updated yet, so we check again later
            return true;
        } catch (err) {
            console.warn("[PWA-Wallet] Reconnect attempt failed:", err);
            return false;
        } finally {
            isReconnectingRef.current = false;
        }
    }, [reconnect, connectors, hasSavedSession, reconnectAttempts]);

    // Schedule a reconnect with backoff
    const scheduleReconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }
        
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            console.log("[PWA-Wallet] Max reconnect attempts reached");
            setConnectionState("disconnected");
            return;
        }

        const delay = RECONNECT_DELAY_MS * Math.pow(RECONNECT_BACKOFF_MULTIPLIER, reconnectAttempts);
        console.log(`[PWA-Wallet] Scheduling reconnect in ${delay}ms`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
            attemptReconnect();
        }, delay);
    }, [attemptReconnect, reconnectAttempts]);

    // Reset reconnect attempts when successfully connected
    useEffect(() => {
        if (isConnected && address) {
            setReconnectAttempts(0);
            setConnectionState("connected");
            setLastConnectedAddress(address);
            
            // Clear any pending reconnect
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
            if (gracePeriodRef.current) {
                clearTimeout(gracePeriodRef.current);
                gracePeriodRef.current = null;
            }
        }
    }, [isConnected, address]);

    // Handle visibility change (app foreground/background)
    useEffect(() => {
        if (typeof window === "undefined") return;

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                console.log("[PWA-Wallet] App foregrounded");
                
                // If we were connected before and now appear disconnected, try to reconnect
                if (!isConnected && hasSavedSession()) {
                    // Give a grace period before showing disconnected state
                    setConnectionState("reconnecting");
                    setReconnectAttempts(0); // Reset attempts on foreground
                    
                    // Clear existing grace period
                    if (gracePeriodRef.current) {
                        clearTimeout(gracePeriodRef.current);
                    }
                    
                    // Attempt immediate reconnect
                    attemptReconnect();
                    
                    // Set grace period - if still not connected after this, show disconnected
                    gracePeriodRef.current = setTimeout(() => {
                        if (!mountedRef.current) return;
                        if (connectionState !== "connected") {
                            scheduleReconnect();
                        }
                    }, GRACE_PERIOD_MS);
                }
            }
        };

        // Also handle focus for additional coverage
        const handleFocus = () => {
            if (!isConnected && hasSavedSession() && connectionState !== "reconnecting") {
                console.log("[PWA-Wallet] Window focused, checking connection...");
                handleVisibilityChange();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("focus", handleFocus);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("focus", handleFocus);
        };
    }, [isConnected, hasSavedSession, attemptReconnect, scheduleReconnect, connectionState]);

    // Periodic session health check
    useEffect(() => {
        if (typeof window === "undefined") return;
        
        const checkSession = () => {
            if (!isConnected && hasSavedSession() && connectionState === "connected") {
                console.log("[PWA-Wallet] Session health check - connection lost, reconnecting...");
                setConnectionState("reconnecting");
                attemptReconnect();
            }
        };

        const interval = setInterval(checkSession, SESSION_CHECK_INTERVAL);
        return () => clearInterval(interval);
    }, [isConnected, hasSavedSession, attemptReconnect, connectionState]);

    // Initial mount - check connection state
    useEffect(() => {
        mountedRef.current = true;
        
        if (isConnected && address) {
            setConnectionState("connected");
            setLastConnectedAddress(address);
        } else if (hasSavedSession()) {
            setConnectionState("reconnecting");
            attemptReconnect();
        } else {
            setConnectionState("disconnected");
        }

        return () => {
            mountedRef.current = false;
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (gracePeriodRef.current) {
                clearTimeout(gracePeriodRef.current);
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Force reconnect - can be called manually
    const forceReconnect = useCallback(() => {
        setReconnectAttempts(0);
        setConnectionState("reconnecting");
        attemptReconnect();
    }, [attemptReconnect]);

    // Clear session - for logout or to escape reconnect loop
    const clearSession = useCallback(() => {
        setLastConnectedAddress(null);
        setReconnectAttempts(0);
        setConnectionState("disconnected");
        
        // Clear any pending reconnect attempts
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (gracePeriodRef.current) {
            clearTimeout(gracePeriodRef.current);
            gracePeriodRef.current = null;
        }
        
        // Clear stored wallet sessions to escape reconnect loop
        if (typeof window !== "undefined") {
            try {
                // Mark that we intentionally disconnected
                sessionStorage.setItem("wallet_intentionally_disconnected", "true");
                
                // Clear wagmi state that causes reconnect loop
                localStorage.removeItem("wagmi.store");
                localStorage.removeItem("wagmi.connected");
                localStorage.removeItem("wagmi.wallet");
                localStorage.removeItem("wagmi.recentConnectorId");
                
                // Clear WalletConnect/AppKit sessions
                const keysToRemove: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (
                        key.startsWith("wc@") || 
                        key.startsWith("@reown") || 
                        key.startsWith("@w3m") ||
                        key.startsWith("@appkit") ||
                        key.includes("walletconnect")
                    )) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(key => localStorage.removeItem(key));
                
                console.log("[PWA-Wallet] Cleared wallet session data to escape reconnect loop");
            } catch (err) {
                console.warn("[PWA-Wallet] Error clearing session:", err);
            }
        }
    }, []);

    // Allow reconnection again (called when user explicitly tries to connect wallet)
    const allowReconnect = useCallback(() => {
        if (typeof window !== "undefined") {
            sessionStorage.removeItem("wallet_intentionally_disconnected");
            console.log("[PWA-Wallet] Cleared intentional disconnect flag");
        }
    }, []);

    return {
        /** Current connection state with reconnection awareness */
        connectionState,
        /** Whether wallet is fully connected and ready */
        isConnected: connectionState === "connected",
        /** Whether actively trying to reconnect */
        isReconnecting: connectionState === "reconnecting" || wagmiReconnecting,
        /** Number of reconnect attempts made */
        reconnectAttempts,
        /** Last known connected address (persists through reconnection) */
        lastConnectedAddress,
        /** Force a reconnection attempt */
        forceReconnect,
        /** Clear session (for logout or to escape reconnect loop) */
        clearSession,
        /** Check if there's a saved session */
        hasSavedSession,
        /** Allow reconnection (clears intentional disconnect flag) */
        allowReconnect,
    };
}
