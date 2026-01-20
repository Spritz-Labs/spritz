"use client";

import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    type ReactNode,
} from "react";
import dynamic from "next/dynamic";

// Storage keys
const ALIEN_SESSION_KEY = "spritz_alien_session";
const ALIEN_ADDRESS_KEY = "spritz_alien_address";

// Types
export type AlienAuthState = {
    isLoading: boolean;
    isAuthenticated: boolean;
    alienAddress: string | null;
    token: string | null;
    error: string | null;
};

export type AlienAuthContextType = AlienAuthState & {
    logout: () => void;
    clearError: () => void;
};

const AlienAuthContext = createContext<AlienAuthContextType | null>(null);

// Dynamically import AlienSsoProvider to avoid SSR issues
const AlienSsoProvider = dynamic(
    () => import("@alien_org/sso-sdk-react").then((mod) => mod.AlienSsoProvider),
    { ssr: false }
);

// Inner component that uses the Alien auth hook
function AlienAuthInner({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AlienAuthState>({
        isLoading: true,
        isAuthenticated: false,
        alienAddress: null,
        token: null,
        error: null,
    });

    // Extract user identifier from token/tokenInfo
    const extractAlienAddress = useCallback(
        (token: string | null, tokenInfo: any): string | null => {
            if (!token && !tokenInfo) return null;

            // First, check tokenInfo for sub (the official user identifier per Alien docs)
            if (tokenInfo) {
                console.log(
                    "[AlienAuth] Full tokenInfo:",
                    JSON.stringify(tokenInfo, null, 2)
                );

                // Priority 1: sub - This is the "User identifier" per Alien docs
                // Note: There's a known issue where sub may change per session (SDK v1.0.37)
                if (tokenInfo.sub) {
                    console.log(
                        "[AlienAuth] Using sub (User identifier):",
                        tokenInfo.sub
                    );
                    return tokenInfo.sub;
                }

                // Fallback fields
                if (tokenInfo.user_id) {
                    console.log("[AlienAuth] Using user_id:", tokenInfo.user_id);
                    return tokenInfo.user_id;
                }
            }

            // Try to decode JWT token to get sub from payload
            if (token) {
                try {
                    const parts = token.split(".");
                    if (parts.length === 3) {
                        const payload = JSON.parse(atob(parts[1]));
                        console.log("[AlienAuth] JWT payload:", payload);

                        if (payload.sub) {
                            return payload.sub;
                        }
                        if (payload.user_id) {
                            return payload.user_id;
                        }
                    }
                } catch (e) {
                    console.error("[AlienAuth] Failed to decode JWT:", e);
                }
            }

            return null;
        },
        []
    );

    // Use the Alien auth hook - dynamically imported
    let alienAuth: any = null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, react-hooks/rules-of-hooks
        const { useAuth } = require("@alien_org/sso-sdk-react");
        // eslint-disable-next-line react-hooks/rules-of-hooks
        alienAuth = useAuth();
    } catch (e) {
        console.warn("[AlienAuth] Failed to load useAuth hook:", e);
    }

    // Restore session on mount
    useEffect(() => {
        const restoreSession = async () => {
            const storedAddress = localStorage.getItem(ALIEN_ADDRESS_KEY);
            const storedSession = localStorage.getItem(ALIEN_SESSION_KEY);

            if (storedAddress && storedSession) {
                try {
                    const session = JSON.parse(storedSession);
                    // Check if session is still valid (not expired)
                    if (session.exp && session.exp > Date.now()) {
                        console.log("[AlienAuth] Restored session for:", storedAddress);
                        
                        // Refresh the server session cookie
                        try {
                            const res = await fetch("/api/auth/session", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ 
                                    userAddress: storedAddress,
                                    authMethod: "alien_id",
                                }),
                                credentials: "include",
                            });
                            if (res.ok) {
                                console.log("[AlienAuth] Server session refreshed");
                            }
                        } catch (e) {
                            console.warn("[AlienAuth] Failed to refresh server session:", e);
                        }
                        
                        setState({
                            isLoading: false,
                            isAuthenticated: true,
                            alienAddress: storedAddress,
                            token: session.token || null,
                            error: null,
                        });
                        return;
                    }
                } catch (e) {
                    console.warn("[AlienAuth] Failed to restore session:", e);
                }
            }

            setState((prev) => ({ ...prev, isLoading: false }));
        };

        // Give a small delay for the SDK to initialize
        const timeout = setTimeout(restoreSession, 100);
        return () => clearTimeout(timeout);
    }, []);

    // React to Alien SDK auth state changes
    useEffect(() => {
        if (!alienAuth) return;

        const { auth } = alienAuth;
        
        console.log("[AlienAuth] ========== AUTH STATE UPDATE ==========");
        console.log("[AlienAuth] isAuthenticated:", auth?.isAuthenticated);
        console.log("[AlienAuth] token exists:", !!auth?.token);
        
        if (auth?.tokenInfo) {
            console.log("[AlienAuth] tokenInfo.sub:", auth.tokenInfo.sub);
            console.log("[AlienAuth] tokenInfo.iss:", auth.tokenInfo.iss);
            console.log("[AlienAuth] tokenInfo.aud:", auth.tokenInfo.aud);
            console.log("[AlienAuth] All tokenInfo keys:", Object.keys(auth.tokenInfo));
        }
        console.log("[AlienAuth] ==========================================");

        if (auth?.isAuthenticated && auth?.token) {
            const tokenInfo = auth.tokenInfo || {};
            const token = auth.token;

            // Extract the user identifier
            const alienAddress = extractAlienAddress(token, tokenInfo);

            if (alienAddress) {
                console.log("[AlienAuth] ✓ Authenticated with address:", alienAddress);

                // Create server-side session for API access (fire and forget)
                fetch("/api/auth/alien-id", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ alienAddress, token }),
                    credentials: "include", // Important for session cookie
                })
                .then((res) => {
                    if (!res.ok) {
                        console.warn("[AlienAuth] Failed to create server session, API calls may fail");
                    } else {
                        console.log("[AlienAuth] Server session created successfully");
                    }
                })
                .catch((e) => {
                    console.warn("[AlienAuth] Failed to create server session:", e);
                });

                // Store session locally as well
                const sessionData = {
                    token,
                    exp: tokenInfo.exp ? tokenInfo.exp * 1000 : Date.now() + 30 * 24 * 60 * 60 * 1000,
                };
                localStorage.setItem(ALIEN_ADDRESS_KEY, alienAddress);
                localStorage.setItem(ALIEN_SESSION_KEY, JSON.stringify(sessionData));

                setState({
                    isLoading: false,
                    isAuthenticated: true,
                    alienAddress,
                    token,
                    error: null,
                });
            } else {
                console.warn("[AlienAuth] Authenticated but no user identifier found");
                setState((prev) => ({
                    ...prev,
                    isLoading: false,
                    error: "No user identifier in token",
                }));
            }
        } else if (auth && !auth.isAuthenticated) {
            // Not authenticated - check if we have a stored session
            const storedAddress = localStorage.getItem(ALIEN_ADDRESS_KEY);
            if (!storedAddress) {
                setState({
                    isLoading: false,
                    isAuthenticated: false,
                    alienAddress: null,
                    token: null,
                    error: null,
                });
            }
        }
    }, [alienAuth?.auth?.isAuthenticated, alienAuth?.auth?.token, alienAuth?.auth?.tokenInfo, extractAlienAddress]);

    const logout = useCallback(() => {
        console.log("[AlienAuth] Logging out...");
        
        // Clear storage
        localStorage.removeItem(ALIEN_ADDRESS_KEY);
        localStorage.removeItem(ALIEN_SESSION_KEY);

        // Call SDK logout if available
        if (alienAuth?.logout) {
            try {
                alienAuth.logout();
            } catch (e) {
                console.warn("[AlienAuth] SDK logout error:", e);
            }
        }

        // SECURITY: Clear ALL user data to prevent data leaking to next user
        try {
            const keysToRemove = Object.keys(localStorage).filter(k => 
                k.startsWith("waku_") || // Clear ALL Waku/messaging data
                k.startsWith("shout_") || // Clear group data
                k.startsWith("spritz_") // Clear other spritz data
            );
            keysToRemove.forEach(k => localStorage.removeItem(k));
            console.log("[AlienAuth] Cleared user data keys:", keysToRemove.length);
        } catch (e) {
            console.error("[AlienAuth] Failed to clear user data:", e);
        }

        setState({
            isLoading: false,
            isAuthenticated: false,
            alienAddress: null,
            token: null,
            error: null,
        });

        // Reload to clear all state
        window.location.reload();
    }, [alienAuth]);

    const clearError = useCallback(() => {
        setState((prev) => ({ ...prev, error: null }));
    }, []);

    return (
        <AlienAuthContext.Provider
            value={{
                ...state,
                logout,
                clearError,
            }}
        >
            {children}
        </AlienAuthContext.Provider>
    );
}

export function AlienAuthProvider({ children }: { children: ReactNode }) {
    // Get config from environment variables
    const ssoBaseUrl = process.env.NEXT_PUBLIC_ALIEN_SSO_BASE_URL || "https://sso.alien-api.com";
    const providerAddress = process.env.NEXT_PUBLIC_ALIEN_PROVIDER_ADDRESS || "000000010400000000000f89739b0806";

    // Check if we're on the client
    const [isClient, setIsClient] = useState(false);
    useEffect(() => {
        setIsClient(true);
    }, []);

    // Provide a fallback context for SSR
    if (!isClient) {
        return (
            <AlienAuthContext.Provider
                value={{
                    isLoading: true,
                    isAuthenticated: false,
                    alienAddress: null,
                    token: null,
                    error: null,
                    logout: () => {},
                    clearError: () => {},
                }}
            >
                {children}
            </AlienAuthContext.Provider>
        );
    }

    return (
        <AlienSsoProvider
            config={{
                ssoBaseUrl,
                providerAddress,
            }}
        >
            <AlienAuthInner>{children}</AlienAuthInner>
        </AlienSsoProvider>
    );
}

export function useAlienAuthContext() {
    const context = useContext(AlienAuthContext);
    if (!context) {
        throw new Error(
            "useAlienAuthContext must be used within an AlienAuthProvider"
        );
    }
    return context;
}
