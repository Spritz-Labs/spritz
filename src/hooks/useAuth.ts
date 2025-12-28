"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useAccount, useSignMessage } from "wagmi";

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

type AuthCredentials = {
    address: string;
    signature: string;
    message: string;
    timestamp: number;
};

const AUTH_CREDENTIALS_KEY = "spritz_auth_credentials";
const AUTH_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// Hook that provides the auth implementation (used by AuthProvider)
export function useAuthImplementation() {
    const { address, isConnected } = useAccount();
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
    
    // Check if credentials are valid and not expired
    const hasValidCredentials = useMemo(() => {
        if (!credentials?.address || !credentials?.signature || !credentials?.message) {
            return false;
        }
        // Check if credentials are expired
        if (Date.now() - credentials.timestamp > AUTH_TTL) {
            return false;
        }
        return true;
    }, [credentials]);

    // Load saved credentials on mount - wait for address to be available
    useEffect(() => {
        if (typeof window === "undefined") return;
        
        // Don't do anything until we know the wallet connection state
        // address will be undefined initially, then set once wallet reconnects
        if (address === undefined && isConnected === undefined) {
            return; // Still initializing
        }
        
        try {
            const saved = localStorage.getItem(AUTH_CREDENTIALS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                
                // Validate the parsed data structure
                if (
                    parsed &&
                    typeof parsed.address === 'string' && parsed.address.trim() &&
                    typeof parsed.signature === 'string' && parsed.signature.trim() &&
                    typeof parsed.message === 'string' && parsed.message.trim() &&
                    typeof parsed.timestamp === 'number' &&
                    Date.now() - parsed.timestamp < AUTH_TTL
                ) {
                    // If we have an address, verify it matches
                    // If no address yet (wallet reconnecting), keep credentials
                    if (!address || parsed.address.toLowerCase() === address.toLowerCase()) {
                        console.log("[Auth] Loaded valid credentials from localStorage");
                        setCredentials(parsed as AuthCredentials);
                    } else {
                        // Address mismatch - different wallet connected
                        console.log("[Auth] Address mismatch, clearing credentials");
                        localStorage.removeItem(AUTH_CREDENTIALS_KEY);
                        setCredentials(null);
                        setState(prev => ({ ...prev, isLoading: false }));
                    }
                } else {
                    console.log("[Auth] Invalid or expired credentials, clearing");
                    localStorage.removeItem(AUTH_CREDENTIALS_KEY);
                    setCredentials(null);
                    setState(prev => ({ ...prev, isLoading: false }));
                }
            } else {
                setState(prev => ({ ...prev, isLoading: false }));
            }
        } catch (e) {
            console.error("[Auth] Error loading credentials:", e);
            localStorage.removeItem(AUTH_CREDENTIALS_KEY);
            setCredentials(null);
            setState(prev => ({ ...prev, isLoading: false }));
        }
    }, [address, isConnected]);

    // Verify credentials when they change
    useEffect(() => {
        if (!credentials || !address) {
            setState(prev => ({ 
                ...prev, 
                isAuthenticated: false,
                isBetaTester: false,
                subscriptionTier: null,
                subscriptionExpiresAt: null,
                user: null,
                isLoading: false 
            }));
            return;
        }

        const verifyCredentials = async () => {
            setState(prev => ({ ...prev, isLoading: true, error: null }));
            
            try {
                const response = await fetch("/api/auth/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(credentials),
                });

                const data = await response.json();

                if (response.ok && data.verified) {
                    setState({
                        isLoading: false,
                        isAuthenticated: true,
                        isBetaTester: data.user?.beta_access || false,
                        subscriptionTier: data.user?.subscription_tier || "free",
                        subscriptionExpiresAt: data.user?.subscription_expires_at || null,
                        error: null,
                        user: data.user ? {
                            id: data.user.id,
                            walletAddress: data.user.wallet_address,
                            username: data.user.username,
                            ensName: data.user.ens_name,
                            email: data.user.email,
                            emailVerified: data.user.email_verified,
                            points: data.user.points || 0,
                            inviteCount: data.user.invite_count || 0,
                        } : null,
                    });
                } else {
                    // Clear invalid credentials
                    localStorage.removeItem(AUTH_CREDENTIALS_KEY);
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
                }
            } catch (err) {
                console.error("[Auth] Verification error:", err);
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: "Verification failed",
                }));
            }
        };

        verifyCredentials();
    }, [credentials, address]);

    // Sign in with SIWE
    const signIn = useCallback(async () => {
        if (!address || !isConnected) {
            setState(prev => ({ ...prev, error: "Wallet not connected" }));
            return false;
        }

        setState(prev => ({ ...prev, isLoading: true, error: null }));

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
            };

            // Save credentials
            localStorage.setItem(AUTH_CREDENTIALS_KEY, JSON.stringify(newCredentials));
            setCredentials(newCredentials);

            return true;
        } catch (err) {
            console.error("[Auth] Sign in error:", err);
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: err instanceof Error ? err.message : "Sign in failed",
            }));
            return false;
        }
    }, [address, isConnected, signMessageAsync]);

    // Sign out
    const signOut = useCallback(() => {
        localStorage.removeItem(AUTH_CREDENTIALS_KEY);
        setCredentials(null);
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
            });

            const data = await response.json();

            if (response.ok && data.verified) {
                setState(prev => ({
                    ...prev,
                    isBetaTester: data.user?.beta_access || false,
                    subscriptionTier: data.user?.subscription_tier || "free",
                    subscriptionExpiresAt: data.user?.subscription_expires_at || null,
                    user: data.user ? {
                        id: data.user.id,
                        walletAddress: data.user.wallet_address,
                        username: data.user.username,
                        ensName: data.user.ens_name,
                        email: data.user.email,
                        emailVerified: data.user.email_verified,
                        points: data.user.points || 0,
                        inviteCount: data.user.invite_count || 0,
                    } : null,
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

