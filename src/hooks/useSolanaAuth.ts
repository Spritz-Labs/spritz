"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useAppKitProvider, useAppKitAccount } from "@reown/appkit/react";
import type { Provider } from "@reown/appkit-adapter-solana";
import bs58 from "bs58";

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

type SolanaAuthCredentials = {
    address: string;
    signature: string;
    message: string;
    timestamp: number;
    chain: "solana";
};

const SOLANA_AUTH_CREDENTIALS_KEY = "spritz_solana_auth_credentials";
const AUTH_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

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
        if (address === undefined && isConnected === undefined) {
            return; // Still initializing
        }
        
        try {
            const saved = localStorage.getItem(SOLANA_AUTH_CREDENTIALS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                
                // Validate the parsed data structure
                if (
                    parsed &&
                    typeof parsed.address === 'string' && parsed.address.trim() &&
                    typeof parsed.signature === 'string' && parsed.signature.trim() &&
                    typeof parsed.message === 'string' && parsed.message.trim() &&
                    typeof parsed.timestamp === 'number' &&
                    parsed.chain === "solana" &&
                    Date.now() - parsed.timestamp < AUTH_TTL
                ) {
                    // If we have an address, verify it matches (case-sensitive for Solana)
                    // If no address yet (wallet reconnecting), keep credentials
                    if (!address || parsed.address === address) {
                        console.log("[SolanaAuth] Loaded valid credentials from localStorage");
                        setCredentials(parsed as SolanaAuthCredentials);
                    } else {
                        // Address mismatch - different wallet connected
                        console.log("[SolanaAuth] Address mismatch, clearing credentials");
                        localStorage.removeItem(SOLANA_AUTH_CREDENTIALS_KEY);
                        setCredentials(null);
                        setState(prev => ({ ...prev, isLoading: false }));
                    }
                } else {
                    console.log("[SolanaAuth] Invalid or expired credentials, clearing");
                    localStorage.removeItem(SOLANA_AUTH_CREDENTIALS_KEY);
                    setCredentials(null);
                    setState(prev => ({ ...prev, isLoading: false }));
                }
            } else {
                setState(prev => ({ ...prev, isLoading: false }));
            }
        } catch (e) {
            console.error("[SolanaAuth] Error loading credentials:", e);
            localStorage.removeItem(SOLANA_AUTH_CREDENTIALS_KEY);
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
                const response = await fetch("/api/auth/verify-solana", {
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
                    localStorage.removeItem(SOLANA_AUTH_CREDENTIALS_KEY);
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
                console.error("[SolanaAuth] Verification error:", err);
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: "Verification failed",
                }));
            }
        };

        verifyCredentials();
    }, [credentials, address]);

    // Sign in with SIWS (Sign-In With Solana)
    const signIn = useCallback(async () => {
        if (!address || !isConnected || !walletProvider) {
            setState(prev => ({ ...prev, error: "Wallet not connected" }));
            return false;
        }

        setState(prev => ({ ...prev, isLoading: true, error: null }));

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

            // Save credentials
            localStorage.setItem(SOLANA_AUTH_CREDENTIALS_KEY, JSON.stringify(newCredentials));
            setCredentials(newCredentials);

            return true;
        } catch (err) {
            console.error("[SolanaAuth] Sign in error:", err);
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: err instanceof Error ? err.message : "Sign in failed",
            }));
            return false;
        }
    }, [address, isConnected, walletProvider]);

    // Sign out
    const signOut = useCallback(() => {
        localStorage.removeItem(SOLANA_AUTH_CREDENTIALS_KEY);
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
            const response = await fetch("/api/auth/verify-solana", {
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

