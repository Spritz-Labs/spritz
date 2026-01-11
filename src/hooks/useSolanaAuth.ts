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

    // Load saved credentials on mount (async with IndexedDB fallback)
    useEffect(() => {
        if (typeof window === "undefined" || credentialsLoaded.current) return;
        credentialsLoaded.current = true;

        const loadCredentials = async () => {
            try {
                const saved = await authStorage.load(SOLANA_AUTH_CREDENTIALS_KEY);

                if (saved && saved.chain === "solana" && !authStorage.isExpired(saved, AUTH_TTL)) {
                    console.log("[SolanaAuth] Loaded valid credentials from storage");
                    setCredentials(saved as SolanaAuthCredentials);
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

        loadCredentials();
    }, []);

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

    // Verify credentials with retry logic
    const verifyWithRetry = useCallback(
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
                    // Refresh timestamp on successful verification
                    await authStorage.refreshTimestamp(SOLANA_AUTH_CREDENTIALS_KEY);
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

                // If signature is invalid, clear credentials
                if (response.status === 401) {
                    console.log("[SolanaAuth] Invalid signature, clearing credentials");
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
                    return verifyWithRetry(creds, attempt + 1);
                }

                throw new Error(data.error || "Verification failed after retries");
            } catch (err) {
                if (attempt < MAX_RETRY_ATTEMPTS) {
                    console.log(`[SolanaAuth] Verification error, retrying (${attempt}/${MAX_RETRY_ATTEMPTS})...`);
                    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
                    return verifyWithRetry(creds, attempt + 1);
                }

                console.error("[SolanaAuth] Verification error after retries:", err);
                // Don't clear credentials on network errors
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

    // Verify credentials when they change
    // Note: We can verify credentials even without wallet connected since credentials contain the address
    useEffect(() => {
        if (!credentials) {
            setState((prev) => ({
                ...prev,
                isAuthenticated: false,
                isBetaTester: false,
                subscriptionTier: null,
                subscriptionExpiresAt: null,
                user: null,
                isLoading: false,
            }));
            return;
        }

        // Skip if already verified for this address and still valid
        if (
            lastVerifiedAddress.current === credentials.address &&
            state.isAuthenticated &&
            hasValidCredentials
        ) {
            return;
        }

        // Skip if already verifying
        if (verificationInProgress.current) return;

        const verify = async () => {
            verificationInProgress.current = true;
            setState((prev) => ({ ...prev, isLoading: true, error: null }));

            try {
                await verifyWithRetry(credentials);
            } finally {
                verificationInProgress.current = false;
            }
        };

        verify();
    }, [credentials, hasValidCredentials, verifyWithRetry, state.isAuthenticated]);

    // Sign in with SIWS (Sign-In With Solana)
    const signIn = useCallback(async () => {
        if (!address || !isConnected || !walletProvider) {
            setState((prev) => ({ ...prev, error: "Wallet not connected" }));
            return false;
        }

        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        try {
            // Get message to sign
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

            // Save credentials to robust storage
            await authStorage.save(SOLANA_AUTH_CREDENTIALS_KEY, newCredentials);
            setCredentials(newCredentials);

            return true;
        } catch (err) {
            console.error("[SolanaAuth] Sign in error:", err);
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error: err instanceof Error ? err.message : "Sign in failed",
            }));
            return false;
        }
    }, [address, isConnected, walletProvider]);

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

    // Refresh user data without re-signing
    const refresh = useCallback(async () => {
        if (!credentials) return;

        try {
            const response = await fetch("/api/auth/verify-solana", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(credentials),
                credentials: "include", // Important for session cookie
            });

            const data = await response.json();

            if (response.ok && data.verified) {
                // Refresh timestamp
                await authStorage.refreshTimestamp(SOLANA_AUTH_CREDENTIALS_KEY);

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
                              emailVerified: data.user.email_verified,
                              points: data.user.points || 0,
                              inviteCount: data.user.invite_count || 0,
                          }
                        : null,
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
