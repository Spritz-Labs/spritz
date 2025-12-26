"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useAccount, useSignMessage } from "wagmi";

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
};

const ADMIN_CREDENTIALS_KEY = "spritz_admin_credentials";

export function useAdmin() {
    const { address, isConnected } = useAccount();
    const { signMessageAsync } = useSignMessage();
    
    const [state, setState] = useState<AdminState>({
        isAdmin: false,
        isSuperAdmin: false,
        isLoading: true,
        isAuthenticated: false,
        error: null,
    });

    const [credentials, setCredentials] = useState<AdminCredentials | null>(null);
    
    // Check if credentials are valid and ready to use
    const hasValidCredentials = useMemo(() => {
        return !!(credentials?.address && credentials?.signature && credentials?.message);
    }, [credentials]);

    // Load saved credentials on mount
    useEffect(() => {
        if (typeof window === "undefined") return;
        
        try {
            const saved = localStorage.getItem(ADMIN_CREDENTIALS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                
                // Validate the parsed data has all required fields as strings
                if (
                    parsed &&
                    typeof parsed.address === 'string' && parsed.address.trim() &&
                    typeof parsed.signature === 'string' && parsed.signature.trim() &&
                    typeof parsed.message === 'string' && parsed.message.trim() &&
                    parsed.address.toLowerCase() === address?.toLowerCase()
                ) {
                    console.log("[Admin] Loaded valid credentials from localStorage");
                    setCredentials(parsed as AdminCredentials);
                } else {
                    console.log("[Admin] Invalid or mismatched credentials in localStorage, clearing");
                    localStorage.removeItem(ADMIN_CREDENTIALS_KEY);
                    setCredentials(null);
                }
            }
        } catch (e) {
            console.error("[Admin] Error loading credentials:", e);
            localStorage.removeItem(ADMIN_CREDENTIALS_KEY);
            setCredentials(null);
        }
        
        setState(prev => ({ ...prev, isLoading: false }));
    }, [address]);

    // Verify credentials when they change
    useEffect(() => {
        if (!credentials || !address) {
            setState(prev => ({ 
                ...prev, 
                isAdmin: false, 
                isSuperAdmin: false, 
                isAuthenticated: false,
                isLoading: false 
            }));
            return;
        }

        const verifyCredentials = async () => {
            setState(prev => ({ ...prev, isLoading: true, error: null }));
            
            try {
                const response = await fetch("/api/admin/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(credentials),
                });

                const data = await response.json();

                if (response.ok && data.isAdmin) {
                    setState({
                        isAdmin: true,
                        isSuperAdmin: data.isSuperAdmin || false,
                        isLoading: false,
                        isAuthenticated: true,
                        error: null,
                    });
                } else {
                    // Clear invalid credentials
                    localStorage.removeItem(ADMIN_CREDENTIALS_KEY);
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
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: "Verification failed",
                }));
            }
        };

        verifyCredentials();
    }, [credentials, address]);

    // Sign in as admin
    const signIn = useCallback(async () => {
        if (!address || !isConnected) {
            setState(prev => ({ ...prev, error: "Wallet not connected" }));
            return false;
        }

        setState(prev => ({ ...prev, isLoading: true, error: null }));

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
            };

            // Save credentials
            localStorage.setItem(ADMIN_CREDENTIALS_KEY, JSON.stringify(newCredentials));
            setCredentials(newCredentials);

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

    // Sign out
    const signOut = useCallback(() => {
        localStorage.removeItem(ADMIN_CREDENTIALS_KEY);
        setCredentials(null);
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

    return {
        ...state,
        isReady, // Use this instead of isAuthenticated for data fetching
        address,
        isConnected,
        signIn,
        signOut,
        getAuthHeaders,
    };
}

