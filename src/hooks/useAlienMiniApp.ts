"use client";

import { useState, useEffect, useCallback } from "react";

// Type for Alien launch params
interface AlienLaunchParams {
    authToken?: string;
    contractVersion?: string;
    hostAppVersion?: string;
    platform?: "ios" | "android" | "web";
    startParam?: string;
}

// Extend Window interface for the injected token
declare global {
    interface Window {
        __ALIEN_AUTH_TOKEN__?: string;
    }
}

interface UseAlienMiniAppReturn {
    /** Whether the app is running inside the Alien app */
    isInsideAlienApp: boolean;
    /** The auth token injected by the Alien app (if available) */
    authToken: string | null;
    /** Launch parameters from the Alien app */
    launchParams: AlienLaunchParams | null;
    /** Whether the hook is still loading/checking */
    isLoading: boolean;
    /** Send a message to the Alien app (fire and forget) */
    send: (method: string, payload?: Record<string, unknown>) => void;
}

/**
 * Hook to detect if the app is running as an Alien Mini App
 * and to get the injected auth token.
 * 
 * Usage:
 * ```tsx
 * const { isInsideAlienApp, authToken, isLoading } = useAlienMiniApp();
 * 
 * if (isInsideAlienApp && authToken) {
 *   // Auto-authenticate with the token
 * }
 * ```
 */
export function useAlienMiniApp(): UseAlienMiniAppReturn {
    const [isInsideAlienApp, setIsInsideAlienApp] = useState(false);
    const [authToken, setAuthToken] = useState<string | null>(null);
    const [launchParams, setLaunchParams] = useState<AlienLaunchParams | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [bridgeModule, setBridgeModule] = useState<typeof import("@alien_org/bridge") | null>(null);

    // Dynamically import the bridge module to avoid SSR issues
    useEffect(() => {
        if (typeof window === "undefined") {
            setIsLoading(false);
            return;
        }

        const loadBridge = async () => {
            try {
                const bridge = await import("@alien_org/bridge");
                setBridgeModule(bridge);

                // Check if running inside Alien app
                const isAvailable = bridge.isBridgeAvailable();
                setIsInsideAlienApp(isAvailable);

                if (isAvailable) {
                    console.log("[AlienMiniApp] Running inside Alien app");

                    // Get launch params (includes auth token)
                    const params = bridge.getLaunchParams() as AlienLaunchParams | undefined;
                    if (params) {
                        setLaunchParams(params);
                        if (params.authToken) {
                            setAuthToken(params.authToken);
                            console.log("[AlienMiniApp] Got auth token from launch params");
                        }
                    }

                    // Also check for the global auth token (fallback)
                    if (!params?.authToken && window.__ALIEN_AUTH_TOKEN__) {
                        setAuthToken(window.__ALIEN_AUTH_TOKEN__);
                        console.log("[AlienMiniApp] Got auth token from window.__ALIEN_AUTH_TOKEN__");
                    }

                    // Signal that mini app is ready
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (bridge.send as any)("app:ready", {});
                } else {
                    console.log("[AlienMiniApp] Not running inside Alien app (browser mode)");
                }
            } catch (error) {
                console.warn("[AlienMiniApp] Failed to load bridge:", error);
                setIsInsideAlienApp(false);
            } finally {
                setIsLoading(false);
            }
        };

        loadBridge();
    }, []);

    // Send method for communicating with the Alien app
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const send = useCallback((method: string, payload: Record<string, unknown> = {}) => {
        if (bridgeModule && isInsideAlienApp) {
            try {
                // Cast method to any to satisfy the bridge SDK's strict typing
                // The bridge accepts string methods but has strict TypeScript types
                (bridgeModule.send as (method: string, payload: unknown) => void)(method, payload);
            } catch (error) {
                console.warn("[AlienMiniApp] Failed to send:", method, error);
            }
        }
    }, [bridgeModule, isInsideAlienApp]);

    return {
        isInsideAlienApp,
        authToken,
        launchParams,
        isLoading,
        send,
    };
}
