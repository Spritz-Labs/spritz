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
    // According to Alien docs, user_id should be consistent across sessions
    const extractAlienAddress = useCallback(
        (token: string | null, tokenInfo: any): string | null => {
            if (!token) return null;

            // First, check tokenInfo for user_id (most consistent identifier per Alien docs)
            if (tokenInfo) {
                console.log(
                    "[AlienAuthProvider] Full tokenInfo:",
                    JSON.stringify(tokenInfo, null, 2)
                );
                // Priority 1: user_id (consistent across sessions per Alien docs)
                if (tokenInfo.user_id) {
                    console.log(
                        "[AlienAuthProvider] Using user_id:",
                        tokenInfo.user_id
                    );
                    return tokenInfo.user_id;
                }
                // Priority 2: Other consistent address fields
                if (tokenInfo.identity_address)
                    return tokenInfo.identity_address;
                if (tokenInfo.user_address) return tokenInfo.user_address;
                if (tokenInfo.alien_address) return tokenInfo.alien_address;
                if (tokenInfo.address) return tokenInfo.address;
                if (tokenInfo.sub) return tokenInfo.sub;
                if (tokenInfo.identity) return tokenInfo.identity;
                if (tokenInfo.wallet_address) return tokenInfo.wallet_address;
            }

            try {
                // Try to decode JWT token to get consistent address
                const parts = token.split(".");
                if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1]));
                    console.log(
                        "[AlienAuthProvider] JWT payload:",
                        JSON.stringify(payload, null, 2)
                    );
                    // Priority 1: user_id from JWT (consistent identifier)
                    if (payload.user_id) {
                        console.log(
                            "[AlienAuthProvider] Using user_id from JWT:",
                            payload.user_id
                        );
                        return payload.user_id;
                    }
                    // Priority 2: Other consistent fields
                    if (payload.sub) return payload.sub;
                    if (payload.address) return payload.address;
                    if (payload.identity_address)
                        return payload.identity_address;
                    if (payload.alien_address) return payload.alien_address;
                    if (payload.identity) return payload.identity;
                    if (payload.wallet_address) return payload.wallet_address;
                    // Check for nested objects
                    if (payload.user?.user_id) return payload.user.user_id;
                    if (payload.user?.address) return payload.user.address;
                    if (payload.user?.identity_address)
                        return payload.user.identity_address;
                    if (payload.identity?.address)
                        return payload.identity.address;
                }
            } catch (e) {
                console.error("[AlienAuthProvider] Failed to decode JWT:", e);
            }

            // Last resort: use session address (will change per session)
            if (tokenInfo?.app_callback_session_address) {
                console.warn(
                    "[AlienAuthProvider] WARNING: Using session address as fallback - this will change per session. No consistent identifier found."
                );
                return tokenInfo.app_callback_session_address;
            }

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
    }, []);

    // Sync with Alien auth state
    useEffect(() => {
        if (typeof window === "undefined") return;

        // Log full auth object to see what's available
        if (alienAuth?.auth) {
            console.log(
                "[AlienAuthProvider] Full auth object:",
                JSON.stringify(alienAuth.auth, null, 2)
            );
            if (alienAuth.auth.tokenInfo) {
                console.log(
                    "[AlienAuthProvider] Full tokenInfo:",
                    JSON.stringify(alienAuth.auth.tokenInfo, null, 2)
                );
                console.log(
                    "[AlienAuthProvider] tokenInfo keys:",
                    Object.keys(alienAuth.auth.tokenInfo)
                );
            }
        }

        if (alienAuth.auth.isAuthenticated && alienAuth.auth.token) {
            const tokenInfo = alienAuth.auth.tokenInfo || {};
            const token = alienAuth.auth.token || null;

            // Try to get consistent address - check all possible sources
            let alienAddress = extractAlienAddress(token, tokenInfo);

            // If we still don't have a consistent address, check if we have a stored one
            // This prevents getting a new random address on each login
            if (!alienAddress) {
                const stored = localStorage.getItem(ALIEN_STORAGE_KEY);
                if (stored) {
                    try {
                        const parsed = JSON.parse(stored);
                        if (parsed.alienAddress) {
                            console.log(
                                "[AlienAuthProvider] Using stored consistent address:",
                                parsed.alienAddress
                            );
                            alienAddress = parsed.alienAddress;
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            }

            // If still no address, we can't use a consistent one - log warning
            if (!alienAddress) {
                console.warn(
                    "[AlienAuthProvider] WARNING: No consistent address found. Alien SDK may not provide user_id. Check console logs above for available fields."
                );
                // Don't set an address - let it be null so user knows there's an issue
            }

            console.log(
                "[AlienAuthProvider] Final alienAddress:",
                alienAddress
            );

            const authData = {
                isAuthenticated: true,
                token,
                tokenInfo,
                alienAddress, // Store consistent address
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
