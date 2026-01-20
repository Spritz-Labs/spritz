"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import {
    authStorage,
    AUTH_CREDENTIALS_KEY,
    AUTH_TTL,
    type AuthCredentials,
} from "@/lib/authStorage";

type AdminState = {
    isAdmin: boolean;
    isSuperAdmin: boolean;
    isLoading: boolean;
    isAuthenticated: boolean;
    error: string | null;
};

type AdminCredentials = {
    address: string;
    signature: string;
    message: string;
    timestamp?: number;
    verifiedAt?: number; // When credentials were last verified with the server
    isSuperAdmin?: boolean; // Cached from verification response
};

const ADMIN_CREDENTIALS_KEY_LOCAL = "spritz_admin_credentials";
// Admin credentials last 30 days (longer than main app)
const ADMIN_TTL = 30 * 24 * 60 * 60 * 1000;
// Skip re-verification for 24 hours after successful verification
const VERIFICATION_CACHE_TTL = 24 * 60 * 60 * 1000;

export function useAdmin() {
    const { address, isConnected, isReconnecting } = useAccount();
    const { signMessageAsync } = useSignMessage();
    
    const [state, setState] = useState<AdminState>({
        isAdmin: false,
        isSuperAdmin: false,
        isLoading: true,
        isAuthenticated: false,
        error: null,
    });

    const [credentials, setCredentials] = useState<AdminCredentials | null>(null);
    const credentialsLoaded = useRef(false);
    const verificationAttempted = useRef(false);
    
    // Track the credentials source for display purposes
    const [credentialsSource, setCredentialsSource] = useState<"main" | "admin" | null>(null);
    
    // Check if credentials are valid and ready to use
    const hasValidCredentials = useMemo(() => {
        return !!(credentials?.address && credentials?.signature && credentials?.message);
    }, [credentials]);

    // Load saved credentials on mount - try admin-specific first (longer TTL), then main app
    useEffect(() => {
        if (typeof window === "undefined" || credentialsLoaded.current) return;
        credentialsLoaded.current = true;

        const loadCredentials = async () => {
            setState(prev => ({ ...prev, isLoading: true }));
            
            try {
                // First, try admin-specific credentials (30-day TTL)
                const savedAdmin = localStorage.getItem(ADMIN_CREDENTIALS_KEY_LOCAL);
                if (savedAdmin) {
                    const parsed = JSON.parse(savedAdmin);
                    
                    if (
                        parsed &&
                        typeof parsed.address === 'string' && parsed.address.trim() &&
                        typeof parsed.signature === 'string' && parsed.signature.trim() &&
                        typeof parsed.message === 'string' && parsed.message.trim()
                    ) {
                        // Check if admin credentials are expired (30 days)
                        const timestamp = parsed.timestamp || 0;
                        if (Date.now() - timestamp < ADMIN_TTL) {
                            console.log("[Admin] Loaded admin-specific credentials from localStorage");
                            setCredentials(parsed as AdminCredentials);
                            setCredentialsSource("admin");
                            return;
                        } else {
                            console.log("[Admin] Admin credentials expired, clearing");
                            localStorage.removeItem(ADMIN_CREDENTIALS_KEY_LOCAL);
                        }
                    } else {
                        console.log("[Admin] Invalid admin credentials in localStorage, clearing");
                        localStorage.removeItem(ADMIN_CREDENTIALS_KEY_LOCAL);
                    }
                }
                
                // Fallback: try to load credentials from main app auth (7-day TTL)
                const mainAppCreds = await authStorage.load(AUTH_CREDENTIALS_KEY);
                
                if (mainAppCreds && !authStorage.isExpired(mainAppCreds, AUTH_TTL)) {
                    console.log("[Admin] Using main app credentials");
                    setCredentials({
                        address: mainAppCreds.address,
                        signature: mainAppCreds.signature,
                        message: mainAppCreds.message,
                        timestamp: mainAppCreds.timestamp,
                    });
                    setCredentialsSource("main");
                    return;
                }
                
                // No valid credentials found
                setState(prev => ({ ...prev, isLoading: false }));
            } catch (e) {
                console.error("[Admin] Error loading credentials:", e);
                localStorage.removeItem(ADMIN_CREDENTIALS_KEY_LOCAL);
                setCredentials(null);
                setState(prev => ({ ...prev, isLoading: false }));
            }
        };

        loadCredentials();
    }, []);

    // Verify credentials when they change
    useEffect(() => {
        if (!credentials) {
            setState(prev => ({ 
                ...prev, 
                isAdmin: false, 
                isSuperAdmin: false, 
                isAuthenticated: false,
                isLoading: false 
            }));
            return;
        }

        // Skip if we've already verified these credentials in this session
        if (verificationAttempted.current && state.isAuthenticated) {
            // Make sure loading is false if already authenticated
            if (state.isLoading) {
                setState(prev => ({ ...prev, isLoading: false }));
            }
            return;
        }

        // Check if we have a recent verification cached - skip API call if so
        // This prevents "nonce already used" errors when navigating between admin pages
        if (credentials.verifiedAt && (Date.now() - credentials.verifiedAt) < VERIFICATION_CACHE_TTL) {
            console.log("[Admin] Using cached verification (verified", Math.round((Date.now() - credentials.verifiedAt) / 60000), "minutes ago)");
            verificationAttempted.current = true;
            setState({
                isAdmin: true,
                isSuperAdmin: credentials.isSuperAdmin || false,
                isLoading: false,
                isAuthenticated: true,
                error: null,
            });
            return;
        }

        // If wallet IS connected and credentials are from a different address,
        // show a warning but don't immediately clear - let them sign with the connected wallet
        // Only clear if they try to sign in with a different wallet
        // Note: We still proceed with verification since server will validate the signature
        if (isConnected && address && !isReconnecting && credentials.address.toLowerCase() !== address.toLowerCase()) {
            console.log("[Admin] Credentials address doesn't match connected wallet");
        }

        const verifyCredentials = async () => {
            setState(prev => ({ ...prev, isLoading: true, error: null }));
            verificationAttempted.current = true;
            
            try {
                const response = await fetch("/api/admin/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(credentials),
                });

                const data = await response.json();

                if (response.ok && data.isAdmin) {
                    // Update credentials with verification timestamp to cache the result
                    const updatedCredentials: AdminCredentials = {
                        ...credentials,
                        verifiedAt: Date.now(),
                        isSuperAdmin: data.isSuperAdmin || false,
                    };
                    localStorage.setItem(ADMIN_CREDENTIALS_KEY_LOCAL, JSON.stringify(updatedCredentials));
                    setCredentials(updatedCredentials);
                    
                    setState({
                        isAdmin: true,
                        isSuperAdmin: data.isSuperAdmin || false,
                        isLoading: false,
                        isAuthenticated: true,
                        error: null,
                    });
                } else {
                    // Only clear admin-specific credentials, not main app
                    if (credentialsSource === "admin") {
                        localStorage.removeItem(ADMIN_CREDENTIALS_KEY_LOCAL);
                    }
                    setCredentials(null);
                    setState({
                        isAdmin: false,
                        isSuperAdmin: false,
                        isLoading: false,
                        isAuthenticated: false,
                        error: data.error || "Not authorized",
                    });
                }
            } catch (err) {
                console.error("[Admin] Verification error:", err);
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: "Verification failed",
                }));
            }
        };

        verifyCredentials();
    }, [credentials, state.isAuthenticated, state.isLoading, credentialsSource, address, isConnected, isReconnecting]);

    // Sign in as admin
    const signIn = useCallback(async () => {
        if (!address || !isConnected) {
            setState(prev => ({ ...prev, error: "Wallet not connected" }));
            return false;
        }

        setState(prev => ({ ...prev, isLoading: true, error: null }));
        verificationAttempted.current = false;

        try {
            // Get message to sign
            const nonceResponse = await fetch(`/api/admin/verify?address=${address}`);
            const { message } = await nonceResponse.json();

            // Sign the message
            const signature = await signMessageAsync({ message });

            const newCredentials: AdminCredentials = {
                address: address.toLowerCase(),
                signature,
                message,
                timestamp: Date.now(), // Add timestamp for TTL checking
            };

            // Save admin-specific credentials with timestamp
            localStorage.setItem(ADMIN_CREDENTIALS_KEY_LOCAL, JSON.stringify(newCredentials));
            setCredentials(newCredentials);
            setCredentialsSource("admin");

            return true;
        } catch (err) {
            console.error("[Admin] Sign in error:", err);
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: err instanceof Error ? err.message : "Sign in failed",
            }));
            return false;
        }
    }, [address, isConnected, signMessageAsync]);

    // Sign out - only clears admin session, not main app
    const signOut = useCallback(() => {
        localStorage.removeItem(ADMIN_CREDENTIALS_KEY_LOCAL);
        setCredentials(null);
        setCredentialsSource(null);
        verificationAttempted.current = false;
        setState({
            isAdmin: false,
            isSuperAdmin: false,
            isLoading: false,
            isAuthenticated: false,
            error: null,
        });
    }, []);

    // Get headers for API requests - returns null if not ready
    const getAuthHeaders = useCallback((): Record<string, string> | null => {
        if (!credentials) {
            console.log("[Admin] No credentials available");
            return null;
        }
        
        const { address: addr, signature, message } = credentials;
        
        // Validate all fields are non-empty strings
        if (typeof addr !== 'string' || !addr.trim()) {
            console.log("[Admin] Invalid address in credentials");
            return null;
        }
        if (typeof signature !== 'string' || !signature.trim()) {
            console.log("[Admin] Invalid signature in credentials");
            return null;
        }
        if (typeof message !== 'string' || !message.trim()) {
            console.log("[Admin] Invalid message in credentials");
            return null;
        }
        
        // Base64 encode the message since it contains newlines which are invalid in headers
        const encodedMessage = btoa(encodeURIComponent(message));
        
        return {
            "x-admin-address": addr,
            "x-admin-signature": signature,
            "x-admin-message": encodedMessage,
        };
    }, [credentials]);

    // Only consider truly ready when authenticated AND credentials are valid
    const isReady = state.isAuthenticated && hasValidCredentials;
    
    // For admin purposes, we're "connected" if we have valid credentials
    // This allows the admin page to work even when wallet isn't immediately connected
    const effectivelyConnected = isConnected || hasValidCredentials;
    
    // Use address from credentials if wallet isn't connected
    const effectiveAddress = address || credentials?.address;

    return {
        ...state,
        isReady, // Use this instead of isAuthenticated for data fetching
        address: effectiveAddress,
        isConnected: effectivelyConnected,
        signIn,
        signOut,
        getAuthHeaders,
    };
}

