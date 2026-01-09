"use client";

import {
    createContext,
    useContext,
    type ReactNode,
    useState,
    useEffect,
    useCallback,
} from "react";

const ALIEN_STORAGE_KEY = "alien_auth";
const ALIEN_LOGOUT_FLAG = "alien_logout";

export type AlienAuthState = {
    isLoading: boolean;
    isAuthenticated: boolean;
    token: string | null;
    tokenInfo: {
        // According to Alien docs: https://dev.alien.org/docs/sso-guide/react-integration
        iss?: string;               // Issuer
        sub?: string;               // User identifier (consistent across sessions)
        aud?: string | string[];    // Audience (provider address)
        exp?: number;               // Expiration timestamp
        iat?: number;               // Issued at timestamp
        nonce?: string;
        auth_time?: number;
        app_callback_session_address?: string; // Session-specific (not consistent)
        expired_at?: number;
        [key: string]: any; // Allow other fields
    } | null;
    alienAddress: string | null; // Consistent Alien address (tokenInfo.sub)
    error: string | null;
    hasStoredAuth: boolean;
};

export type AlienAuthContextType = AlienAuthState & {
    logout: () => void;
    verifyAuth: () => Promise<void>;
    clearError: () => void;
};

const defaultContextValue: AlienAuthContextType = {
    isLoading: false,
    isAuthenticated: false,
    token: null,
    tokenInfo: null,
    alienAddress: null,
    error: null,
    hasStoredAuth: false,
    logout: () => {},
    verifyAuth: async () => {},
    clearError: () => {},
};

const AlienAuthContext =
    createContext<AlienAuthContextType>(defaultContextValue);

// Component that uses Alien's useAuth hook - only rendered when provider is ready
function AlienAuthInner({ children }: { children: ReactNode }) {
    // This will only be called when AlienSsoProvider is mounted, so useAuth is safe
    const { useAuth } = require("@alien_org/sso-sdk-react");
    const alienAuth = useAuth();

    const [state, setState] = useState<AlienAuthState>({
        isLoading: false,
        isAuthenticated: false,
        token: null,
        tokenInfo: null,
        alienAddress: null,
        error: null,
        hasStoredAuth: false,
    });

    // Helper function to extract consistent Alien address from token
    // According to Alien docs (https://dev.alien.org/docs/sso-guide/react-integration):
    // tokenInfo.sub is the "User identifier" - this is the consistent ID across sessions
    const extractAlienAddress = useCallback(
        (token: string | null, tokenInfo: any): string | null => {
            if (!token && !tokenInfo) return null;

            // First, check tokenInfo for sub (the official user identifier per Alien docs)
            if (tokenInfo) {
                console.log(
                    "[AlienAuthProvider] Full tokenInfo:",
                    JSON.stringify(tokenInfo, null, 2)
                );
                
                // Priority 1: sub - This is the "User identifier" per Alien docs
                // This should be consistent across all sessions for the same user
                if (tokenInfo.sub) {
                    console.log(
                        "[AlienAuthProvider] Using sub (User identifier):",
                        tokenInfo.sub
                    );
                    return tokenInfo.sub;
                }
                
                // Fallback fields in case sub is not available
                if (tokenInfo.user_id) {
                    console.log("[AlienAuthProvider] Using user_id:", tokenInfo.user_id);
                    return tokenInfo.user_id;
                }
            }

            // Try to decode JWT token to get sub from payload
            if (token) {
                try {
                    const parts = token.split(".");
                    if (parts.length === 3) {
                        const payload = JSON.parse(atob(parts[1]));
                        console.log(
                            "[AlienAuthProvider] JWT payload:",
                            JSON.stringify(payload, null, 2)
                        );
                        
                        // Priority 1: sub from JWT (the user identifier)
                        if (payload.sub) {
                            console.log(
                                "[AlienAuthProvider] Using sub from JWT:",
                                payload.sub
                            );
                            return payload.sub;
                        }
                        
                        // Fallback
                        if (payload.user_id) return payload.user_id;
                    }
                } catch (e) {
                    console.error("[AlienAuthProvider] Failed to decode JWT:", e);
                }
            }

            // Last resort: use session address (will change per session) - NOT RECOMMENDED
            if (tokenInfo?.app_callback_session_address) {
                console.warn(
                    "[AlienAuthProvider] WARNING: Using session address as fallback - this will change per session! " +
                    "The 'sub' field should be used as the consistent user identifier. " +
                    "Check if tokenInfo.sub is being returned by the Alien SDK."
                );
                return tokenInfo.app_callback_session_address;
            }

            console.error(
                "[AlienAuthProvider] ERROR: No consistent user identifier found! " +
                "Expected tokenInfo.sub to be present. Available fields:",
                tokenInfo ? Object.keys(tokenInfo) : "none"
            );
            return null;
        },
        []
    );

    // Check for stored auth on mount
    useEffect(() => {
        if (typeof window === "undefined") return;

        // Check if user just logged out (don't restore if logout flag is set)
        const logoutFlag = sessionStorage.getItem(ALIEN_LOGOUT_FLAG);
        console.log(
            "[AlienAuthProvider] Mount check - logout flag:",
            logoutFlag
        );

        if (logoutFlag === "true") {
            console.log(
                "[AlienAuthProvider] Logout flag detected, clearing and not restoring"
            );
            sessionStorage.removeItem(ALIEN_LOGOUT_FLAG);
            localStorage.removeItem(ALIEN_STORAGE_KEY);
            setState({
                isLoading: false,
                isAuthenticated: false,
                token: null,
                tokenInfo: null,
                alienAddress: null,
                error: null,
                hasStoredAuth: false,
            });
            return;
        }

        // Check for stored auth
        const stored = localStorage.getItem(ALIEN_STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                const storedToken = parsed.token || null;
                const storedTokenInfo = parsed.tokenInfo || null;
                const storedAddress =
                    parsed.alienAddress ||
                    extractAlienAddress(storedToken, storedTokenInfo);

                setState((prev) => ({
                    ...prev,
                    hasStoredAuth: true,
                    isAuthenticated: parsed.isAuthenticated || false,
                    token: storedToken,
                    tokenInfo: storedTokenInfo,
                    alienAddress: storedAddress,
                }));
            } catch (e) {
                console.error(
                    "[AlienAuthProvider] Failed to parse stored auth:",
                    e
                );
                localStorage.removeItem(ALIEN_STORAGE_KEY);
            }
        }
    }, [extractAlienAddress]);

    // Sync with Alien auth state
    useEffect(() => {
        if (typeof window === "undefined") return;

        // Log full auth object to see what's available
        if (alienAuth?.auth) {
            console.log(
                "[AlienAuthProvider] ========== AUTH STATE UPDATE =========="
            );
            console.log(
                "[AlienAuthProvider] isAuthenticated:",
                alienAuth.auth.isAuthenticated
            );
            console.log(
                "[AlienAuthProvider] token exists:",
                !!alienAuth.auth.token
            );
            if (alienAuth.auth.tokenInfo) {
                console.log(
                    "[AlienAuthProvider] tokenInfo.sub (User identifier):",
                    alienAuth.auth.tokenInfo.sub
                );
                console.log(
                    "[AlienAuthProvider] tokenInfo.iss (Issuer):",
                    alienAuth.auth.tokenInfo.iss
                );
                console.log(
                    "[AlienAuthProvider] tokenInfo.aud (Audience):",
                    alienAuth.auth.tokenInfo.aud
                );
                console.log(
                    "[AlienAuthProvider] All tokenInfo keys:",
                    Object.keys(alienAuth.auth.tokenInfo)
                );
                console.log(
                    "[AlienAuthProvider] Full tokenInfo:",
                    JSON.stringify(alienAuth.auth.tokenInfo, null, 2)
                );
            } else {
                console.log("[AlienAuthProvider] tokenInfo is null/undefined");
            }
            console.log(
                "[AlienAuthProvider] ======================================"
            );
        }

        if (alienAuth.auth.isAuthenticated && alienAuth.auth.token) {
            const tokenInfo = alienAuth.auth.tokenInfo || {};
            const token = alienAuth.auth.token || null;

            // Extract the consistent user identifier (should be tokenInfo.sub per Alien docs)
            let alienAddress = extractAlienAddress(token, tokenInfo);

            // Verify we got the sub field specifically
            if (tokenInfo.sub && alienAddress === tokenInfo.sub) {
                console.log(
                    "[AlienAuthProvider] ✓ Successfully using tokenInfo.sub as user identifier:",
                    alienAddress
                );
            } else if (alienAddress) {
                console.warn(
                    "[AlienAuthProvider] ⚠ Using fallback identifier (not sub):",
                    alienAddress
                );
            }

            // If still no address, we can't authenticate properly
            if (!alienAddress) {
                console.error(
                    "[AlienAuthProvider] ✗ CRITICAL: No user identifier found! " +
                    "Expected tokenInfo.sub to be present per Alien docs. " +
                    "User cannot be authenticated without a consistent identifier."
                );
                setState((prev) => ({
                    ...prev,
                    isAuthenticated: false,
                    error: "No user identifier (sub) found in authentication response",
                }));
                return;
            }

            console.log(
                "[AlienAuthProvider] Final alienAddress for user:",
                alienAddress
            );

            const authData = {
                isAuthenticated: true,
                token,
                tokenInfo,
                alienAddress, // Store consistent address (should be tokenInfo.sub)
            };

            // Store in localStorage
            localStorage.setItem(ALIEN_STORAGE_KEY, JSON.stringify(authData));

            setState((prev) => ({
                ...prev,
                isAuthenticated: true,
                token,
                tokenInfo,
                alienAddress,
                hasStoredAuth: true,
                error: null,
            }));
        } else if (!alienAuth.auth.isAuthenticated) {
            // Only clear if not in logout process
            const logoutFlag = sessionStorage.getItem(ALIEN_LOGOUT_FLAG);
            if (logoutFlag !== "true") {
                setState((prev) => ({
                    ...prev,
                    isAuthenticated: false,
                    token: null,
                    tokenInfo: null,
                    alienAddress: null,
                }));
            }
        }
    }, [
        alienAuth.auth.isAuthenticated,
        alienAuth.auth.token,
        alienAuth.auth.tokenInfo,
        extractAlienAddress,
    ]);

    const verifyAuth = useCallback(async () => {
        if (!alienAuth.auth.token || typeof window === "undefined") return;

        setState((prev) => ({ ...prev, isLoading: true }));
        try {
            await alienAuth.verifyAuth();
            // State will be updated by the useEffect above
        } catch (error) {
            console.error(
                "[AlienAuthProvider] Auth verification failed:",
                error
            );
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to verify authentication",
            }));
        } finally {
            setState((prev) => ({ ...prev, isLoading: false }));
        }
    }, [alienAuth]);

    const logout = useCallback(() => {
        if (typeof window === "undefined") return;

        console.log("[AlienAuthProvider] Logging out...");
        // Set logout flag before clearing
        sessionStorage.setItem(ALIEN_LOGOUT_FLAG, "true");

        // Clear localStorage
        localStorage.removeItem(ALIEN_STORAGE_KEY);

        // Call Alien logout
        alienAuth.logout();

        // Reset state
        setState({
            isLoading: false,
            isAuthenticated: false,
            token: null,
            tokenInfo: null,
            alienAddress: null,
            error: null,
            hasStoredAuth: false,
        });

        // Reload page to ensure clean state
        window.location.reload();
    }, [alienAuth]);

    const clearError = useCallback(() => {
        setState((prev) => ({ ...prev, error: null }));
    }, []);

    // Verify token on mount if authenticated
    useEffect(() => {
        if (state.isAuthenticated && state.token && !state.isLoading) {
            verifyAuth();
        }
    }, [state.isAuthenticated, state.token, state.isLoading, verifyAuth]);

    return (
        <AlienAuthContext.Provider
            value={{
                ...state,
                logout,
                verifyAuth,
                clearError,
            }}
        >
            {children}
        </AlienAuthContext.Provider>
    );
}

export function AlienAuthProvider({ children }: { children: ReactNode }) {
    const [mounted, setMounted] = useState(false);
    const [AlienSsoProviderComponent, setAlienSsoProviderComponent] =
        useState<any>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;

        setMounted(true);
        // Dynamically import AlienSsoProvider only on client
        import("@alien_org/sso-sdk-react").then((mod) => {
            setAlienSsoProviderComponent(() => mod.AlienSsoProvider);
        });
    }, []);

    // Get config from environment variables
    const ssoBaseUrl =
        process.env.NEXT_PUBLIC_ALIEN_SSO_BASE_URL ||
        "https://sso.alien-api.com";
    const providerAddress =
        process.env.NEXT_PUBLIC_ALIEN_PROVIDER_ADDRESS ||
        "000000010400000000000ea97cc74f25";

    // Don't render until mounted and component loaded
    if (!mounted || !AlienSsoProviderComponent) {
        return (
            <AlienAuthContext.Provider value={defaultContextValue}>
                {children}
            </AlienAuthContext.Provider>
        );
    }

    const Provider = AlienSsoProviderComponent;

    return (
        <Provider
            config={{
                ssoBaseUrl,
                providerAddress,
            }}
        >
            <AlienAuthInner>{children}</AlienAuthInner>
        </Provider>
    );
}

export function useAlienAuthContext() {
    return useContext(AlienAuthContext);
}
