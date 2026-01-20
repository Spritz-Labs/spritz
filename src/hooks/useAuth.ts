"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import {
    authStorage,
    AUTH_CREDENTIALS_KEY,
    AUTH_TTL,
    type AuthCredentials,
} from "@/lib/authStorage";

// User state returned from authentication
export type UserAuthState = {
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

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

// Hook that provides the auth implementation (used by AuthProvider)
export function useAuthImplementation() {
    const { address, isConnected, isReconnecting } = useAccount();
    const { signMessageAsync } = useSignMessage();

    const [state, setState] = useState<UserAuthState>({
        isLoading: true,
        isAuthenticated: false,
        isBetaTester: false,
        subscriptionTier: null,
        subscriptionExpiresAt: null,
        error: null,
        user: null,
    });

    const [credentials, setCredentials] = useState<AuthCredentials | null>(null);
    const credentialsLoaded = useRef(false);
    const verificationInProgress = useRef(false);
    const lastVerifiedAddress = useRef<string | null>(null);

    // Check if credentials are valid and not expired
    const hasValidCredentials = useMemo(() => {
        if (!credentials?.address || !credentials?.signature || !credentials?.message) {
            return false;
        }
        // Check if credentials are expired
        if (authStorage.isExpired(credentials, AUTH_TTL)) {
            return false;
        }
        return true;
    }, [credentials]);

    // Load saved credentials on mount (async with IndexedDB fallback)
    useEffect(() => {
        if (typeof window === "undefined" || credentialsLoaded.current) return;
        credentialsLoaded.current = true;

        const loadCredentials = async () => {
            try {
                const saved = await authStorage.load(AUTH_CREDENTIALS_KEY);

                if (saved && !authStorage.isExpired(saved, AUTH_TTL)) {
                    console.log("[Auth] Loaded valid credentials from storage");
                    setCredentials(saved);
                } else {
                    if (saved) {
                        console.log("[Auth] Credentials expired, clearing");
                        await authStorage.remove(AUTH_CREDENTIALS_KEY);
                    }
                    setState((prev) => ({ ...prev, isLoading: false }));
                }
            } catch (e) {
                console.error("[Auth] Error loading credentials:", e);
                await authStorage.remove(AUTH_CREDENTIALS_KEY);
                setState((prev) => ({ ...prev, isLoading: false }));
            }
        };

        loadCredentials();
    }, []);

    // Check for address mismatch - but only after wallet is fully connected (not reconnecting)
    // This prevents premature credential clearing during reconnection
    useEffect(() => {
        if (!credentials || !address || isReconnecting) return;

        // Only clear if a DIFFERENT wallet is connected (not during reconnection)
        if (credentials.address.toLowerCase() !== address.toLowerCase()) {
            console.log("[Auth] Different wallet connected, clearing credentials");
            authStorage.remove(AUTH_CREDENTIALS_KEY);
            setCredentials(null);
            lastVerifiedAddress.current = null;
            setState((prev) => ({
                ...prev,
                isAuthenticated: false,
                user: null,
                isLoading: false,
            }));
        }
    }, [address, credentials, isReconnecting]);

    // Verify credentials with retry logic
    const verifyWithRetry = useCallback(
        async (creds: AuthCredentials, attempt = 1): Promise<boolean> => {
            try {
                const response = await fetch("/api/auth/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(creds),
                    credentials: "include", // Important for session cookie
                });

                const data = await response.json();

                if (response.ok && data.verified) {
                    // Refresh timestamp on successful verification to extend session
                    await authStorage.refreshTimestamp(AUTH_CREDENTIALS_KEY);
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
                    console.log("[Auth] Invalid signature, clearing credentials");
                    await authStorage.remove(AUTH_CREDENTIALS_KEY);
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

                // For other errors, retry if we haven't exceeded max attempts
                if (attempt < MAX_RETRY_ATTEMPTS) {
                    console.log(`[Auth] Verification failed, retrying (${attempt}/${MAX_RETRY_ATTEMPTS})...`);
                    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
                    return verifyWithRetry(creds, attempt + 1);
                }

                throw new Error(data.error || "Verification failed after retries");
            } catch (err) {
                if (attempt < MAX_RETRY_ATTEMPTS) {
                    console.log(`[Auth] Verification error, retrying (${attempt}/${MAX_RETRY_ATTEMPTS})...`);
                    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
                    return verifyWithRetry(creds, attempt + 1);
                }

                console.error("[Auth] Verification error after retries:", err);
                // Don't clear credentials on network errors - keep trying next time
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
            lastVerifiedAddress.current === credentials.address.toLowerCase() &&
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

    // Sign in with SIWE
    const signIn = useCallback(async () => {
        if (!address || !isConnected) {
            setState((prev) => ({ ...prev, error: "Wallet not connected" }));
            return false;
        }

        // If still reconnecting, wait a moment
        if (isReconnecting) {
            console.log("[Auth] Wallet reconnecting, waiting...");
            await new Promise(resolve => setTimeout(resolve, 2000));
            if (!isConnected) {
                setState((prev) => ({ ...prev, error: "Wallet connection lost. Please reconnect." }));
                return false;
            }
        }

        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        try {
            // Get message to sign
            const nonceResponse = await fetch(`/api/auth/verify?address=${address}`);
            const { message } = await nonceResponse.json();

            // Sign the message
            const signature = await signMessageAsync({ message });

            const newCredentials: AuthCredentials = {
                address: address.toLowerCase(),
                signature,
                message,
                timestamp: Date.now(),
                chain: "evm",
            };

            // Save credentials to robust storage
            await authStorage.save(AUTH_CREDENTIALS_KEY, newCredentials);
            setCredentials(newCredentials);

            return true;
        } catch (err) {
            console.error("[Auth] Sign in error:", err);
            const errorMessage = err instanceof Error ? err.message : "Sign in failed";
            
            // Detect wallet disconnection errors
            const isDisconnectError = errorMessage.toLowerCase().includes("disconnect") ||
                errorMessage.toLowerCase().includes("not connected") ||
                errorMessage.toLowerCase().includes("no provider") ||
                errorMessage.toLowerCase().includes("user rejected") ||
                errorMessage.includes("connector not connected");
            
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error: isDisconnectError 
                    ? "Wallet connection lost. Please reconnect your wallet."
                    : errorMessage,
            }));
            return false;
        }
    }, [address, isConnected, isReconnecting, signMessageAsync]);

    // Sign out
    const signOut = useCallback(async () => {
        await authStorage.remove(AUTH_CREDENTIALS_KEY);
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
            const response = await fetch("/api/auth/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(credentials),
                credentials: "include", // Important for session cookie
            });

            const data = await response.json();

            if (response.ok && data.verified) {
                // Refresh timestamp
                await authStorage.refreshTimestamp(AUTH_CREDENTIALS_KEY);

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
            console.error("[Auth] Refresh error:", err);
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
