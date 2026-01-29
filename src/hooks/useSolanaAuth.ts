"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useAppKitProvider, useAppKitAccount } from "@reown/appkit/react";
import type { Provider } from "@reown/appkit-adapter-solana";
import bs58 from "bs58";
import {
    authStorage,
    SOLANA_AUTH_CREDENTIALS_KEY,
    AUTH_TTL,
    type AuthCredentials,
} from "@/lib/authStorage";

// User state returned from authentication
export type SolanaAuthState = {
    isLoading: boolean;
    isAuthenticated: boolean;
    isBetaTester: boolean;
    subscriptionTier: "free" | "pro" | "enterprise" | null;
    subscriptionExpiresAt: string | null;
    error: string | null;
    user: {
        id: string;
        walletAddress: string;
        username: string | null;
        ensName: string | null;
        email: string | null;
        emailVerified: boolean;
        points: number;
        inviteCount: number;
    } | null;
};

type SolanaAuthCredentials = AuthCredentials & {
    chain: "solana";
};

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

// Hook that provides Solana auth implementation
export function useSolanaAuthImplementation() {
    const { walletProvider } = useAppKitProvider<Provider>("solana");
    const { address, isConnected } = useAppKitAccount();

    const [state, setState] = useState<SolanaAuthState>({
        isLoading: true,
        isAuthenticated: false,
        isBetaTester: false,
        subscriptionTier: null,
        subscriptionExpiresAt: null,
        error: null,
        user: null,
    });

    const [credentials, setCredentials] = useState<SolanaAuthCredentials | null>(null);
    const credentialsLoaded = useRef(false);
    const sessionChecked = useRef(false);
    const verificationInProgress = useRef(false);
    const lastVerifiedAddress = useRef<string | null>(null);
    const connectionStable = useRef(false);

    // Check if credentials are valid and not expired
    const hasValidCredentials = useMemo(() => {
        if (!credentials?.address || !credentials?.signature || !credentials?.message) {
            return false;
        }
        if (authStorage.isExpired(credentials, AUTH_TTL)) {
            return false;
        }
        return true;
    }, [credentials]);

    // Track when connection becomes stable (to avoid clearing credentials during reconnection)
    useEffect(() => {
        if (isConnected && address) {
            // Give a small delay to ensure connection is stable
            const timer = setTimeout(() => {
                connectionStable.current = true;
            }, 500);
            return () => clearTimeout(timer);
        } else {
            connectionStable.current = false;
        }
    }, [isConnected, address]);

    // Check for existing valid session via HttpOnly cookie (7-day session)
    // This is the PRIMARY auth mechanism - credentials are just for initial sign-in
    const checkExistingSession = useCallback(async (): Promise<boolean> => {
        try {
            console.log("[SolanaAuth] Checking for existing server session...");
            const res = await fetch("/api/auth/session", {
                method: "GET",
                credentials: "include", // Send HttpOnly cookie
            });
            
            if (res.ok) {
                const data = await res.json();
                if (data.authenticated && data.user && data.session?.authMethod === "solana") {
                    console.log("[SolanaAuth] Valid server session found for:", data.session?.userAddress?.slice(0, 10) + "...");
                    lastVerifiedAddress.current = data.user.wallet_address;
                    setState({
                        isLoading: false,
                        isAuthenticated: true,
                        isBetaTester: data.user.beta_access || false,
                        subscriptionTier: data.user.subscription_tier || "free",
                        subscriptionExpiresAt: data.user.subscription_expires_at || null,
                        error: null,
                        user: {
                            id: data.user.id,
                            walletAddress: data.user.wallet_address,
                            username: data.user.username,
                            ensName: data.user.ens_name,
                            email: data.user.email,
                            emailVerified: data.user.email_verified || false,
                            points: data.user.points || 0,
                            inviteCount: data.user.invite_count || 0,
                        },
                    });
                    return true;
                }
            }
            console.log("[SolanaAuth] No valid Solana server session");
            return false;
        } catch (e) {
            console.warn("[SolanaAuth] Session check failed:", e);
            return false;
        }
    }, []);

    // Load saved credentials on mount AND check for existing session first
    useEffect(() => {
        if (typeof window === "undefined" || credentialsLoaded.current) return;
        credentialsLoaded.current = true;

        const initAuth = async () => {
            // FIRST: Check if we have a valid server session (HttpOnly cookie)
            // This handles returning users without requiring them to re-sign
            if (!sessionChecked.current) {
                sessionChecked.current = true;
                const hasSession = await checkExistingSession();
                if (hasSession) {
                    // Session is valid - load credentials for reference but don't re-verify
                    const saved = await authStorage.load(SOLANA_AUTH_CREDENTIALS_KEY);
                    if (saved && saved.chain === "solana") {
                        setCredentials(saved as SolanaAuthCredentials);
                    }
                    return; // Already authenticated via session
                }
            }

            // No valid session - check for stored credentials
            try {
                const saved = await authStorage.load(SOLANA_AUTH_CREDENTIALS_KEY);

                if (saved && saved.chain === "solana" && !authStorage.isExpired(saved, AUTH_TTL)) {
                    console.log("[SolanaAuth] Loaded credentials from storage (session expired, will need re-sign)");
                    setCredentials(saved as SolanaAuthCredentials);
                    // Note: We DON'T verify here anymore - nonce is consumed
                    // User will need to sign again when they try to use the app
                    setState((prev) => ({ ...prev, isLoading: false }));
                } else {
                    if (saved) {
                        console.log("[SolanaAuth] Credentials expired or invalid, clearing");
                        await authStorage.remove(SOLANA_AUTH_CREDENTIALS_KEY);
                    }
                    setState((prev) => ({ ...prev, isLoading: false }));
                }
            } catch (e) {
                console.error("[SolanaAuth] Error loading credentials:", e);
                await authStorage.remove(SOLANA_AUTH_CREDENTIALS_KEY);
                setState((prev) => ({ ...prev, isLoading: false }));
            }
        };

        initAuth();
    }, [checkExistingSession]);

    // Check for address mismatch - only after connection is stable
    useEffect(() => {
        if (!credentials || !address || !connectionStable.current) return;

        // Solana addresses are case-sensitive
        if (credentials.address !== address) {
            console.log("[SolanaAuth] Different wallet connected, clearing credentials");
            authStorage.remove(SOLANA_AUTH_CREDENTIALS_KEY);
            setCredentials(null);
            lastVerifiedAddress.current = null;
            setState((prev) => ({
                ...prev,
                isAuthenticated: false,
                user: null,
                isLoading: false,
            }));
        }
    }, [address, credentials]);

    // Auto-refresh session when app becomes visible (user returns to app)
    useEffect(() => {
        if (typeof window === "undefined") return;

        const handleVisibilityChange = async () => {
            if (document.visibilityState === "visible" && state.isAuthenticated) {
                console.log("[SolanaAuth] App became visible, refreshing session...");
                // Try to extend the session
                try {
                    const res = await fetch("/api/auth/session", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                    });
                    if (res.ok) {
                        console.log("[SolanaAuth] Session refreshed on visibility change");
                    } else if (res.status === 401) {
                        // Session expired - user needs to re-authenticate
                        console.log("[SolanaAuth] Session expired, user needs to re-authenticate");
                        setState((prev) => ({
                            ...prev,
                            isAuthenticated: false,
                            user: null,
                            error: "Session expired. Please sign in again.",
                        }));
                    }
                } catch (e) {
                    console.warn("[SolanaAuth] Failed to refresh session on visibility change:", e);
                }
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
    }, [state.isAuthenticated]);

    // Process fresh sign-in verification (only called from signIn flow, not on page load)
    const verifyFreshSignIn = useCallback(
        async (creds: SolanaAuthCredentials, attempt = 1): Promise<boolean> => {
            try {
                const response = await fetch("/api/auth/verify-solana", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(creds),
                    credentials: "include", // Important for session cookie
                });

                const data = await response.json();

                if (response.ok && data.verified) {
                    // Save credentials for reference (address tracking)
                    await authStorage.save(SOLANA_AUTH_CREDENTIALS_KEY, creds);
                    lastVerifiedAddress.current = creds.address;

                    setState({
                        isLoading: false,
                        isAuthenticated: true,
                        isBetaTester: data.user?.beta_access || false,
                        subscriptionTier: data.user?.subscription_tier || "free",
                        subscriptionExpiresAt: data.user?.subscription_expires_at || null,
                        error: null,
                        user: data.user
                            ? {
                                  id: data.user.id,
                                  walletAddress: data.user.wallet_address,
                                  username: data.user.username,
                                  ensName: data.user.ens_name,
                                  email: data.user.email,
                                  emailVerified: data.user.email_verified,
                                  points: data.user.points || 0,
                                  inviteCount: data.user.invite_count || 0,
                              }
                            : null,
                    });
                    return true;
                }

                // If signature is invalid
                if (response.status === 401) {
                    console.log("[SolanaAuth] Invalid signature");
                    await authStorage.remove(SOLANA_AUTH_CREDENTIALS_KEY);
                    setCredentials(null);
                    setState({
                        isLoading: false,
                        isAuthenticated: false,
                        isBetaTester: false,
                        subscriptionTier: null,
                        subscriptionExpiresAt: null,
                        error: data.error || "Authentication failed",
                        user: null,
                    });
                    return false;
                }

                // For other errors, retry
                if (attempt < MAX_RETRY_ATTEMPTS) {
                    console.log(`[SolanaAuth] Verification failed, retrying (${attempt}/${MAX_RETRY_ATTEMPTS})...`);
                    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
                    return verifyFreshSignIn(creds, attempt + 1);
                }

                throw new Error(data.error || "Verification failed after retries");
            } catch (err) {
                if (attempt < MAX_RETRY_ATTEMPTS) {
                    console.log(`[SolanaAuth] Verification error, retrying (${attempt}/${MAX_RETRY_ATTEMPTS})...`);
                    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
                    return verifyFreshSignIn(creds, attempt + 1);
                }

                console.error("[SolanaAuth] Verification error after retries:", err);
                setState((prev) => ({
                    ...prev,
                    isLoading: false,
                    error: "Verification failed - please check your connection",
                }));
                return false;
            }
        },
        []
    );

    // Sign in with SIWS (Sign-In With Solana)
    const signIn = useCallback(async () => {
        if (!address || !isConnected || !walletProvider) {
            setState((prev) => ({ ...prev, error: "Wallet not connected" }));
            return false;
        }

        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        try {
            // Get FRESH message to sign (with new nonce)
            const nonceResponse = await fetch(`/api/auth/verify-solana?address=${address}`);
            const { message } = await nonceResponse.json();

            // Sign the message using Solana wallet
            const encodedMessage = new TextEncoder().encode(message);
            const signatureBytes = await walletProvider.signMessage(encodedMessage);
            const signature = bs58.encode(signatureBytes);

            const newCredentials: SolanaAuthCredentials = {
                address, // Solana addresses are case-sensitive
                signature,
                message,
                timestamp: Date.now(),
                chain: "solana",
            };

            // Verify with server and establish session (nonce is fresh, will succeed)
            const success = await verifyFreshSignIn(newCredentials);
            if (success) {
                setCredentials(newCredentials);
            }
            return success;
        } catch (err) {
            console.error("[SolanaAuth] Sign in error:", err);
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error: err instanceof Error ? err.message : "Sign in failed",
            }));
            return false;
        }
    }, [address, isConnected, walletProvider, verifyFreshSignIn]);

    // Sign out
    const signOut = useCallback(async () => {
        await authStorage.remove(SOLANA_AUTH_CREDENTIALS_KEY);
        setCredentials(null);
        lastVerifiedAddress.current = null;
        setState({
            isLoading: false,
            isAuthenticated: false,
            isBetaTester: false,
            subscriptionTier: null,
            subscriptionExpiresAt: null,
            error: null,
            user: null,
        });
    }, []);

    // Refresh user data by checking session (don't re-verify credentials - nonce is consumed)
    const refresh = useCallback(async () => {
        try {
            // Use session endpoint to refresh user data
            const response = await fetch("/api/auth/session", {
                method: "GET",
                credentials: "include", // Send HttpOnly cookie
            });

            const data = await response.json();

            if (response.ok && data.authenticated && data.user) {
                // Refresh credentials timestamp if we have them
                if (credentials) {
                    await authStorage.refreshTimestamp(SOLANA_AUTH_CREDENTIALS_KEY);
                }

                setState((prev) => ({
                    ...prev,
                    isBetaTester: data.user?.beta_access || false,
                    subscriptionTier: data.user?.subscription_tier || "free",
                    subscriptionExpiresAt: data.user?.subscription_expires_at || null,
                    user: data.user
                        ? {
                              id: data.user.id,
                              walletAddress: data.user.wallet_address,
                              username: data.user.username,
                              ensName: data.user.ens_name,
                              email: data.user.email,
                              emailVerified: data.user.email_verified || false,
                              points: data.user.points || 0,
                              inviteCount: data.user.invite_count || 0,
                          }
                        : null,
                }));
            } else if (response.status === 401 || !data.authenticated) {
                // Session expired
                console.log("[SolanaAuth] Session expired during refresh");
                setState((prev) => ({
                    ...prev,
                    isAuthenticated: false,
                    user: null,
                }));
            }
        } catch (err) {
            console.error("[SolanaAuth] Refresh error:", err);
        }
    }, [credentials]);

    // Get headers for authenticated API requests
    const getAuthHeaders = useCallback((): Record<string, string> | null => {
        if (!credentials || !hasValidCredentials) {
            return null;
        }

        const { address: addr, signature, message } = credentials;

        // Base64 encode the message since it contains newlines
        const encodedMessage = btoa(encodeURIComponent(message));

        return {
            "x-auth-address": addr,
            "x-auth-signature": signature,
            "x-auth-message": encodedMessage,
            "x-auth-chain": "solana",
        };
    }, [credentials, hasValidCredentials]);

    // Only truly ready when authenticated AND credentials are valid
    const isReady = state.isAuthenticated && hasValidCredentials;

    return {
        ...state,
        isReady,
        signIn,
        signOut,
        refresh,
        getAuthHeaders,
    };
}
