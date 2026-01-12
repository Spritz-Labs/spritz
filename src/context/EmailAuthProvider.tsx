"use client";

import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    type ReactNode,
} from "react";
import { type Address, privateKeyToAccount } from "viem/accounts";
import { type SmartAccount } from "viem/account-abstraction";
import { type SafeSmartAccountImplementation } from "permissionless/accounts";

// Storage keys
const EMAIL_STORAGE_KEY = "spritz_email_auth";
const EMAIL_ADDRESS_STORAGE_KEY = "spritz_email_address";
const EMAIL_LOGOUT_FLAG = "spritz_email_logout_flag";

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

    // Check for stored email on mount
    useEffect(() => {
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

        // Only restore if no logout flag and localStorage exists
        const stored = localStorage.getItem(EMAIL_STORAGE_KEY);
        console.log("[EmailAuthProvider] Checking for stored auth, found:", stored !== null);
        
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed?.email && parsed?.address) {
                    console.log("[EmailAuthProvider] Found stored email auth, restoring session");
                    setState((prev) => ({
                        ...prev,
                        hasStoredEmail: true,
                        email: parsed.email,
                        smartAccountAddress: parsed.address as Address,
                        isAuthenticated: true,
                        step: "email",
                    }));
                }
            } catch (e) {
                console.error("[EmailAuth] Error parsing stored email:", e);
                // Clear corrupted data
                localStorage.removeItem(EMAIL_STORAGE_KEY);
                localStorage.removeItem(EMAIL_ADDRESS_STORAGE_KEY);
            }
        } else {
            console.log("[EmailAuthProvider] No stored email auth found");
        }
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

                // Derive private key from email + secret
                // In production, this secret should be stored securely on the server
                // For now, we'll use a client-side approach with a fixed secret
                // TODO: Consider using a server-side key derivation for better security
                const secret = data.secret || "spritz-email-auth-secret"; // Server should provide this
                const privateKey = await derivePrivateKeyFromEmail(email, secret);

                // Create account from private key
                const account = privateKeyToAccount(privateKey);

                // Store email and address
                const authData = {
                    email: email.toLowerCase(),
                    address: account.address,
                    privateKey: privateKey, // Store encrypted in production
                };

                localStorage.setItem(EMAIL_STORAGE_KEY, JSON.stringify(authData));
                localStorage.setItem(EMAIL_ADDRESS_STORAGE_KEY, account.address);

                setState({
                    isLoading: false,
                    isAuthenticated: true,
                    email: email.toLowerCase(),
                    smartAccountAddress: account.address,
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

