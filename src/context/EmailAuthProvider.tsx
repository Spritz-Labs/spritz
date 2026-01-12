"use client";

import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    type ReactNode,
} from "react";
import { type Address } from "viem";

// Storage keys
const EMAIL_STORAGE_KEY = "spritz_email_auth";
const EMAIL_ADDRESS_STORAGE_KEY = "spritz_email_address";
const EMAIL_SESSION_KEY = "spritz_email_session"; // JWT-like token from server
const EMAIL_LOGOUT_FLAG = "spritz_email_logout_flag";

// Browser-compatible base64url decode
function base64UrlDecode(str: string): string {
    // Convert base64url to base64
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    const padding = '='.repeat((4 - base64.length % 4) % 4);
    base64 += padding;
    // Decode
    try {
        return atob(base64);
    } catch {
        // Fallback for Node.js environment (SSR)
        return Buffer.from(str, "base64url").toString();
    }
}

// Validate and decode session token (matches passkey pattern)
function validateSession(token: string): { userAddress: string; exp: number } | null {
    try {
        const payload = JSON.parse(base64UrlDecode(token));
        
        // exp is in milliseconds
        const expMs = payload.exp > 1e12 ? payload.exp : payload.exp * 1000;
        const userAddress = payload.sub;
        
        const isValid = payload.exp && expMs > Date.now() && userAddress;
        console.log("[EmailAuth] Session validation:", { 
            expMs, 
            now: Date.now(), 
            isExpired: expMs <= Date.now(), 
            userAddress: userAddress?.slice(0, 10), 
            isValid 
        });
        
        if (isValid) {
            return { userAddress, exp: expMs };
        }
        return null;
    } catch (e) {
        console.error("[EmailAuth] Session validation error:", e);
        return null;
    }
}

// Derive a deterministic private key from email + secret
async function derivePrivateKeyFromEmail(
    email: string,
    secret: string
): Promise<`0x${string}`> {
    const encoder = new TextEncoder();
    const data = encoder.encode(`${email.toLowerCase()}:${secret}`);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    // Ensure it's a valid private key (64 hex chars, starts with 0x)
    return `0x${hashHex.padStart(64, "0").slice(0, 64)}` as `0x${string}`;
}

// Types
export type EmailAuthState = {
    isLoading: boolean;
    isAuthenticated: boolean;
    email: string | null;
    smartAccountAddress: Address | null;
    error: string | null;
    hasStoredEmail: boolean;
    step: "email" | "code";
};

export type EmailAuthContextType = EmailAuthState & {
    login: (email: string, code: string) => Promise<boolean>;
    sendCode: (email: string) => Promise<boolean>;
    logout: () => void;
    clearError: () => void;
    setStep: (step: "email" | "code") => void;
};

const EmailAuthContext = createContext<EmailAuthContextType | null>(null);

export function EmailAuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<EmailAuthState>({
        isLoading: false,
        isAuthenticated: false,
        email: null,
        smartAccountAddress: null,
        error: null,
        hasStoredEmail: false,
        step: "email",
    });

    const setStep = useCallback((step: "email" | "code") => {
        setState((prev) => ({ ...prev, step }));
    }, []);

    // Check for stored email on mount and restore server session if needed
    useEffect(() => {
        const restoreSession = async () => {
            // Check if user just logged out (don't restore if logout flag is set)
            const logoutFlag = sessionStorage.getItem(EMAIL_LOGOUT_FLAG);
            console.log("[EmailAuthProvider] Mount check - logout flag:", logoutFlag);
            
            if (logoutFlag === "true") {
                console.log("[EmailAuthProvider] Logout flag detected, clearing and not restoring");
                // Remove flag first
                sessionStorage.removeItem(EMAIL_LOGOUT_FLAG);
                // Clear localStorage
                localStorage.removeItem(EMAIL_STORAGE_KEY);
                localStorage.removeItem(EMAIL_ADDRESS_STORAGE_KEY);
                localStorage.removeItem(EMAIL_SESSION_KEY);
                // Verify they're cleared
                const stillHasStorage = localStorage.getItem(EMAIL_STORAGE_KEY) !== null;
                console.log("[EmailAuthProvider] After clear, still has storage:", stillHasStorage);
                // Ensure state is cleared
                setState({
                    isLoading: false,
                    isAuthenticated: false,
                    email: null,
                    smartAccountAddress: null,
                    error: null,
                    hasStoredEmail: false,
                    step: "email",
                });
                return;
            }

            // Check for stored session token (new system matching passkey)
            const storedSession = localStorage.getItem(EMAIL_SESSION_KEY);
            const stored = localStorage.getItem(EMAIL_STORAGE_KEY);
            console.log("[EmailAuthProvider] Checking stored auth:", { 
                hasSession: !!storedSession, 
                hasAuth: !!stored 
            });
            
            // If we have a valid session token, validate and restore
            if (storedSession && stored) {
                const session = validateSession(storedSession);
                if (session) {
                    console.log("[EmailAuthProvider] Restored valid session, expires:", 
                        new Date(session.exp).toLocaleDateString());
                    
                    const parsed = JSON.parse(stored);
                    
                    // Refresh the server session cookie (same pattern as passkey)
                    try {
                        const res = await fetch("/api/auth/session", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ 
                                userAddress: session.userAddress,
                                authMethod: "email",
                            }),
                            credentials: "include",
                        });
                        if (res.ok) {
                            console.log("[EmailAuthProvider] Server session refreshed");
                        } else {
                            console.warn("[EmailAuthProvider] Failed to refresh server session");
                        }
                    } catch (e) {
                        console.warn("[EmailAuthProvider] Failed to refresh server session:", e);
                    }
                    
                    setState({
                        isLoading: false,
                        isAuthenticated: true,
                        email: parsed.email,
                        smartAccountAddress: session.userAddress as Address,
                        error: null,
                        hasStoredEmail: true,
                        step: "email",
                    });
                    return;
                } else {
                    console.log("[EmailAuthProvider] Session token expired or invalid");
                }
            }
            
            // Legacy: If we have stored auth but no session token, try to restore via restore-session
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (parsed?.email && parsed?.address) {
                        console.log("[EmailAuthProvider] Found legacy email auth, attempting restore...");
                        
                        // Try to restore server session
                        const res = await fetch("/api/email/restore-session", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ 
                                email: parsed.email, 
                                address: parsed.address 
                            }),
                            credentials: "include",
                        });
                        
                        const data = await res.json();
                        if (data.success) {
                            console.log("[EmailAuthProvider] Legacy session restored successfully");
                            
                            // Create a session token for future use
                            const newSessionToken = btoa(JSON.stringify({
                                sub: parsed.address.toLowerCase(),
                                iat: Date.now(),
                                exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
                                type: "email",
                            })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                            localStorage.setItem(EMAIL_SESSION_KEY, newSessionToken);
                            
                            setState({
                                isLoading: false,
                                isAuthenticated: true,
                                email: parsed.email,
                                smartAccountAddress: parsed.address as Address,
                                error: null,
                                hasStoredEmail: true,
                                step: "email",
                            });
                            return;
                        } else {
                            console.warn("[EmailAuthProvider] Failed to restore legacy session:", data.error);
                            // Clear invalid data
                            localStorage.removeItem(EMAIL_STORAGE_KEY);
                            localStorage.removeItem(EMAIL_ADDRESS_STORAGE_KEY);
                        }
                    }
                } catch (e) {
                    console.error("[EmailAuth] Error restoring session:", e);
                    // Clear corrupted data
                    localStorage.removeItem(EMAIL_STORAGE_KEY);
                    localStorage.removeItem(EMAIL_ADDRESS_STORAGE_KEY);
                }
            }
            
            console.log("[EmailAuthProvider] No valid session found");
            setState((prev) => ({ ...prev, hasStoredEmail: false }));
        };

        restoreSession();
    }, []);

    const clearError = useCallback(() => {
        setState((prev) => ({ ...prev, error: null }));
    }, []);

    const sendCode = useCallback(async (email: string): Promise<boolean> => {
        setState((prev) => ({ ...prev, isLoading: true, error: null, email: email.toLowerCase() }));

        try {
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                setState((prev) => ({
                    ...prev,
                    isLoading: false,
                    error: "Invalid email format",
                }));
                return false;
            }

            // Send verification code via API
            console.log("[EmailAuthProvider] Sending code request for:", email);
            const response = await fetch("/api/email/login/send-code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
                credentials: "include", // Required for session cookies
            });

            console.log("[EmailAuthProvider] Response status:", response.status);
            
            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                console.error("[EmailAuthProvider] Failed to parse response:", parseError);
                const text = await response.text();
                console.error("[EmailAuthProvider] Response text:", text);
                throw new Error("Invalid response from server");
            }
            
            console.log("[EmailAuthProvider] Response data:", data);

            if (!response.ok) {
                const errorMsg = data?.error || `Server error: ${response.status}`;
                console.error("[EmailAuthProvider] API error:", errorMsg);
                throw new Error(errorMsg);
            }

            console.log("[EmailAuthProvider] Code sent successfully");
            setState((prev) => ({ ...prev, isLoading: false, step: "code" }));
            return true;
        } catch (error) {
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : "Failed to send verification code";
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error: errorMessage,
            }));
            return false;
        }
    }, []);

    const login = useCallback(
        async (email: string, code: string): Promise<boolean> => {
            setState((prev) => ({ ...prev, isLoading: true, error: null }));

            try {
                // Verify the code via API
                const response = await fetch("/api/email/login/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, code }),
                    credentials: "include", // Required for session cookies
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || "Invalid verification code");
                }

                // Server returns the wallet address and session token
                const walletAddress = data.walletAddress;
                const sessionToken = data.sessionToken;

                if (!walletAddress) {
                    throw new Error("Server did not return wallet address");
                }

                // Store email, address, and session token
                const authData = {
                    email: email.toLowerCase(),
                    address: walletAddress,
                };

                localStorage.setItem(EMAIL_STORAGE_KEY, JSON.stringify(authData));
                localStorage.setItem(EMAIL_ADDRESS_STORAGE_KEY, walletAddress);
                if (sessionToken) {
                    localStorage.setItem(EMAIL_SESSION_KEY, sessionToken);
                }
                
                console.log("[EmailAuthProvider] Login successful, address:", walletAddress);

                setState({
                    isLoading: false,
                    isAuthenticated: true,
                    email: email.toLowerCase(),
                    smartAccountAddress: walletAddress as Address,
                    error: null,
                    hasStoredEmail: true,
                    step: "email",
                });

                return true;
            } catch (error) {
                const errorMessage =
                    error instanceof Error
                        ? error.message
                        : "Failed to login with email";
                setState((prev) => ({
                    ...prev,
                    isLoading: false,
                    error: errorMessage,
                }));
                return false;
            }
        },
        []
    );

    const logout = useCallback(() => {
        console.log("[EmailAuthProvider] Logging out...");
        // Set logout flag FIRST in sessionStorage (survives reload but clears on tab close)
        // This MUST happen before clearing localStorage
        sessionStorage.setItem(EMAIL_LOGOUT_FLAG, "true");
        console.log("[EmailAuthProvider] Set logout flag in sessionStorage");
        
        // Clear state immediately
        setState({
            isLoading: false,
            isAuthenticated: false,
            email: null,
            smartAccountAddress: null,
            error: null,
            hasStoredEmail: false,
            step: "email",
        });
        
        // Clear localStorage - do this synchronously
        localStorage.removeItem(EMAIL_STORAGE_KEY);
        localStorage.removeItem(EMAIL_ADDRESS_STORAGE_KEY);
        localStorage.removeItem(EMAIL_SESSION_KEY);
        
        // Verify they're cleared
        const keyStillExists = localStorage.getItem(EMAIL_STORAGE_KEY) !== null;
        const addressStillExists = localStorage.getItem(EMAIL_ADDRESS_STORAGE_KEY) !== null;
        console.log("[EmailAuthProvider] After clear - key exists:", keyStillExists, "address exists:", addressStillExists);
        
        // Verify flag is set
        const flagSet = sessionStorage.getItem(EMAIL_LOGOUT_FLAG) === "true";
        console.log("[EmailAuthProvider] Logout flag verified:", flagSet);
        
        console.log("[EmailAuthProvider] Logout complete, reloading page...");
        // Reload immediately - the flag will prevent restore on next mount
        window.location.reload();
    }, []);

    return (
        <EmailAuthContext.Provider
            value={{
                ...state,
                login,
                sendCode,
                logout,
                clearError,
                setStep,
            }}
        >
            {children}
        </EmailAuthContext.Provider>
    );
}

export function useEmailAuthContext() {
    const context = useContext(EmailAuthContext);
    if (!context) {
        throw new Error(
            "useEmailAuthContext must be used within an EmailAuthProvider"
        );
    }
    return context;
}

