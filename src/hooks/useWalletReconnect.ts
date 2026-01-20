"use client";

/**
 * Hook to handle wallet reconnection for PWA scenarios
 * 
 * Provides utilities to:
 * - Check if wallet needs reconnection
 * - Trigger reconnection attempts
 * - Wait for reconnection before operations
 */

import { useCallback, useRef } from "react";
import { useAccount, useReconnect } from "wagmi";

const RECONNECT_TIMEOUT = 5000; // 5 seconds timeout for reconnection
const RECONNECT_COOLDOWN = 2000; // 2 seconds between attempts

export function useWalletReconnect() {
    const { isConnected, isReconnecting, address } = useAccount();
    const { reconnect, connectors } = useReconnect();
    const lastAttempt = useRef<number>(0);
    const reconnectPromise = useRef<Promise<boolean> | null>(null);

    /**
     * Check if wallet appears disconnected but might have a saved session
     */
    const needsReconnect = useCallback(() => {
        if (isConnected || isReconnecting) return false;
        
        // Check for saved wagmi state
        try {
            const wagmiState = localStorage.getItem("wagmi.store");
            if (wagmiState) {
                const parsed = JSON.parse(wagmiState);
                if (parsed?.state?.current || (parsed?.state?.connections && Object.keys(parsed.state.connections).length > 0)) {
                    return true;
                }
            }
            
            // Check for WalletConnect sessions
            for (const key of Object.keys(localStorage)) {
                if (key.startsWith("wc@") || key.includes("walletconnect") || key.startsWith("@reown")) {
                    return true;
                }
            }
        } catch {
            // Ignore parse errors
        }
        
        return false;
    }, [isConnected, isReconnecting]);

    /**
     * Attempt to reconnect the wallet
     * Returns a promise that resolves when connected or times out
     */
    const attemptReconnect = useCallback(async (): Promise<boolean> => {
        // If already connected, return true immediately
        if (isConnected && address) {
            return true;
        }

        // If already reconnecting, wait for it
        if (reconnectPromise.current) {
            return reconnectPromise.current;
        }

        // Check cooldown
        const now = Date.now();
        if (now - lastAttempt.current < RECONNECT_COOLDOWN) {
            console.log("[WalletReconnect] Cooldown active, waiting...");
            await new Promise(resolve => setTimeout(resolve, RECONNECT_COOLDOWN));
        }

        lastAttempt.current = Date.now();
        console.log("[WalletReconnect] Starting reconnection attempt...");

        // Create a promise that resolves when connected or times out
        reconnectPromise.current = new Promise((resolve) => {
            const timeout = setTimeout(() => {
                console.log("[WalletReconnect] Reconnection timed out");
                reconnectPromise.current = null;
                resolve(false);
            }, RECONNECT_TIMEOUT);

            // Trigger reconnection
            try {
                reconnect({ connectors });
            } catch (err) {
                console.error("[WalletReconnect] Reconnect error:", err);
            }

            // Poll for connection
            const checkInterval = setInterval(() => {
                // Need to re-check from localStorage since React state might not update immediately
                try {
                    const wagmiState = localStorage.getItem("wagmi.store");
                    if (wagmiState) {
                        const parsed = JSON.parse(wagmiState);
                        if (parsed?.state?.current) {
                            console.log("[WalletReconnect] Reconnection successful");
                            clearInterval(checkInterval);
                            clearTimeout(timeout);
                            reconnectPromise.current = null;
                            resolve(true);
                        }
                    }
                } catch {
                    // Ignore
                }
            }, 200);

            // Cleanup interval on timeout
            setTimeout(() => clearInterval(checkInterval), RECONNECT_TIMEOUT + 100);
        });

        return reconnectPromise.current;
    }, [isConnected, address, reconnect, connectors]);

    /**
     * Ensure wallet is connected before an operation
     * Attempts reconnection if needed, returns false if can't connect
     */
    const ensureConnected = useCallback(async (): Promise<boolean> => {
        if (isConnected && address) {
            return true;
        }

        if (isReconnecting) {
            console.log("[WalletReconnect] Already reconnecting, waiting...");
            // Wait for reconnecting state to resolve
            await new Promise(resolve => setTimeout(resolve, 3000));
            return isConnected && !!address;
        }

        if (needsReconnect()) {
            return attemptReconnect();
        }

        return false;
    }, [isConnected, address, isReconnecting, needsReconnect, attemptReconnect]);

    return {
        /** Check if wallet needs reconnection */
        needsReconnect,
        /** Attempt to reconnect the wallet */
        attemptReconnect,
        /** Ensure wallet is connected, attempting reconnection if needed */
        ensureConnected,
        /** Current connection state */
        isConnected,
        /** Whether a reconnection is in progress */
        isReconnecting,
        /** Current wallet address */
        address,
    };
}
