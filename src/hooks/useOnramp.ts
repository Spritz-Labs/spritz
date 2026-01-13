"use client";

import { useState, useCallback } from "react";

export type OnrampStatus = "idle" | "loading" | "ready" | "error";

export interface UseOnrampReturn {
    status: OnrampStatus;
    error: string | null;
    sessionToken: string | null;
    onrampUrl: string | null;
    initializeOnramp: (walletAddress: string, options?: OnrampOptions) => Promise<string | null>;
    openOnramp: () => void;
    reset: () => void;
}

export interface OnrampOptions {
    presetFiatAmount?: number;
    fiatCurrency?: string;
    defaultAsset?: string;
    defaultNetwork?: string;
}

const COINBASE_PAY_BASE_URL = "https://pay.coinbase.com/buy/select-asset";

/**
 * Hook for Coinbase Onramp functionality
 * 
 * Handles:
 * - Session token generation via our API
 * - Building the onramp URL with parameters
 * - Opening the onramp in a popup or redirect
 */
export function useOnramp(): UseOnrampReturn {
    const [status, setStatus] = useState<OnrampStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [sessionToken, setSessionToken] = useState<string | null>(null);
    const [onrampUrl, setOnrampUrl] = useState<string | null>(null);

    /**
     * Initialize onramp by getting a session token
     * Falls back to direct Coinbase Pay URL if session token unavailable
     */
    const initializeOnramp = useCallback(async (
        walletAddress: string,
        options: OnrampOptions = {}
    ): Promise<string | null> => {
        setStatus("loading");
        setError(null);

        try {
            // Try to get session token from our API
            const response = await fetch("/api/wallet/onramp/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ walletAddress }),
            });

            let url: string;

            if (response.ok) {
                // Got session token - use secure initialization
                const { sessionToken: token } = await response.json();
                setSessionToken(token);

                // Build the onramp URL with session token
                const params = new URLSearchParams({
                    sessionToken: token,
                });

                // Add optional parameters
                if (options.presetFiatAmount) {
                    params.set("presetFiatAmount", options.presetFiatAmount.toString());
                }
                if (options.fiatCurrency) {
                    params.set("fiatCurrency", options.fiatCurrency);
                }
                if (options.defaultAsset) {
                    params.set("defaultAsset", options.defaultAsset);
                }
                if (options.defaultNetwork) {
                    params.set("defaultNetwork", options.defaultNetwork);
                }

                url = `${COINBASE_PAY_BASE_URL}?${params.toString()}`;
                console.log("[Onramp] Initialized with session token for:", walletAddress.slice(0, 10) + "...");
            } else {
                // Fallback: Use direct Coinbase Pay URL without session token
                // This works but with fewer security features
                console.log("[Onramp] Session token unavailable, using direct URL");
                
                const params = new URLSearchParams({
                    destinationWallets: JSON.stringify([{
                        address: walletAddress,
                        blockchains: ["base", "ethereum", "polygon", "arbitrum", "optimism"],
                    }]),
                });

                if (options.presetFiatAmount) {
                    params.set("presetFiatAmount", options.presetFiatAmount.toString());
                }
                if (options.fiatCurrency) {
                    params.set("fiatCurrency", options.fiatCurrency || "USD");
                }
                if (options.defaultAsset) {
                    params.set("defaultAsset", options.defaultAsset);
                }
                if (options.defaultNetwork) {
                    params.set("defaultNetwork", options.defaultNetwork);
                }

                url = `${COINBASE_PAY_BASE_URL}?${params.toString()}`;
                console.log("[Onramp] Using fallback URL for:", walletAddress.slice(0, 10) + "...");
            }

            setOnrampUrl(url);
            setStatus("ready");
            return url;

        } catch (err) {
            console.error("[Onramp] Error:", err);
            const message = err instanceof Error ? err.message : "Failed to initialize onramp";
            setError(message);
            setStatus("error");
            return null;
        }
    }, []);

    /**
     * Open the onramp in a popup window
     */
    const openOnramp = useCallback(() => {
        if (!onrampUrl) {
            console.error("[Onramp] No URL available - call initializeOnramp first");
            return;
        }

        // Open in a centered popup
        const width = 450;
        const height = 700;
        const left = Math.max(0, (window.innerWidth - width) / 2 + window.screenX);
        const top = Math.max(0, (window.innerHeight - height) / 2 + window.screenY);

        const popup = window.open(
            onrampUrl,
            "coinbase-onramp",
            `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
        );

        // Fallback to redirect if popup blocked
        if (!popup || popup.closed) {
            console.log("[Onramp] Popup blocked, redirecting...");
            window.location.href = onrampUrl;
        }
    }, [onrampUrl]);

    /**
     * Reset state
     */
    const reset = useCallback(() => {
        setStatus("idle");
        setError(null);
        setSessionToken(null);
        setOnrampUrl(null);
    }, []);

    return {
        status,
        error,
        sessionToken,
        onrampUrl,
        initializeOnramp,
        openOnramp,
        reset,
    };
}
