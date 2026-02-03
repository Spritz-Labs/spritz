"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/config/supabase";

type EmailState = {
    email: string | null;
    isVerified: boolean;
    emailUpdatesOptIn: boolean;
    isLoading: boolean;
    isSending: boolean;
    isVerifying: boolean;
    error: string | null;
    codeSent: boolean;
};

export function useEmailVerification(walletAddress: string | null) {
    const [state, setState] = useState<EmailState>({
        email: null,
        isVerified: false,
        emailUpdatesOptIn: false,
        isLoading: true,
        isSending: false,
        isVerifying: false,
        error: null,
        codeSent: false,
    });

    // Load email status
    const loadEmailStatus = useCallback(async () => {
        if (!walletAddress || !supabase) {
            setState(prev => ({ ...prev, isLoading: false }));
            return;
        }

        try {
            const { data, error } = await supabase
                .from("shout_users")
                .select("email, email_verified, email_updates_opt_in")
                .eq("wallet_address", walletAddress.toLowerCase())
                .single();

            if (error) {
                setState(prev => ({ ...prev, isLoading: false }));
                return;
            }

            setState(prev => ({
                ...prev,
                email: data.email,
                isVerified: data.email_verified || false,
                emailUpdatesOptIn: data.email_updates_opt_in ?? false,
                isLoading: false,
            }));
        } catch (err) {
            console.error("[Email] Load error:", err);
            setState(prev => ({ ...prev, isLoading: false }));
        }
    }, [walletAddress]);

    useEffect(() => {
        loadEmailStatus();
    }, [loadEmailStatus]);

    // Send verification code
    const sendCode = useCallback(async (email: string) => {
        if (!walletAddress) {
            setState(prev => ({ ...prev, error: "Wallet not connected" }));
            return false;
        }

        setState(prev => ({ ...prev, isSending: true, error: null, codeSent: false }));

        try {
            const response = await fetch("/api/email/send-code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ walletAddress, email }),
                credentials: "include", // Important for session cookie
            });

            const data = await response.json();

            if (!response.ok) {
                setState(prev => ({
                    ...prev,
                    isSending: false,
                    error: data.error || "Failed to send code",
                }));
                return false;
            }

            setState(prev => ({
                ...prev,
                isSending: false,
                codeSent: true,
                error: null,
            }));
            return true;
        } catch (err) {
            console.error("[Email] Send error:", err);
            setState(prev => ({
                ...prev,
                isSending: false,
                error: "Failed to send verification code",
            }));
            return false;
        }
    }, [walletAddress]);

    // Verify code
    const verifyCode = useCallback(async (code: string) => {
        if (!walletAddress) {
            setState(prev => ({ ...prev, error: "Wallet not connected" }));
            return false;
        }

        setState(prev => ({ ...prev, isVerifying: true, error: null }));

        try {
            const response = await fetch("/api/email/verify-code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ walletAddress, code }),
                credentials: "include", // Important for session cookie
            });

            const data = await response.json();

            if (!response.ok) {
                setState(prev => ({
                    ...prev,
                    isVerifying: false,
                    error: data.error || "Invalid code",
                }));
                return false;
            }

            setState(prev => ({
                ...prev,
                isVerifying: false,
                isVerified: true,
                email: data.email,
                emailUpdatesOptIn: true, // Auto opt-in when they verify
                codeSent: false,
                error: null,
            }));
            return true;
        } catch (err) {
            console.error("[Email] Verify error:", err);
            setState(prev => ({
                ...prev,
                isVerifying: false,
                error: "Failed to verify code",
            }));
            return false;
        }
    }, [walletAddress]);

    // Reset state
    const reset = useCallback(() => {
        setState(prev => ({
            ...prev,
            codeSent: false,
            error: null,
        }));
    }, []);

    // Remove email
    const removeEmail = useCallback(async () => {
        if (!walletAddress || !supabase) {
            setState(prev => ({ ...prev, error: "Wallet not connected" }));
            return false;
        }

        try {
            const { error } = await supabase
                .from("shout_users")
                .update({
                    email: null,
                    email_verified: false,
                })
                .eq("wallet_address", walletAddress.toLowerCase());

            if (error) {
                console.error("[Email] Remove error:", error);
                setState(prev => ({ ...prev, error: "Failed to remove email" }));
                return false;
            }

            setState(prev => ({
                ...prev,
                email: null,
                isVerified: false,
                codeSent: false,
                error: null,
            }));
            return true;
        } catch (err) {
            console.error("[Email] Remove error:", err);
            setState(prev => ({ ...prev, error: "Failed to remove email" }));
            return false;
        }
    }, [walletAddress]);

    // Start changing email
    const startChangeEmail = useCallback(() => {
        setState(prev => ({
            ...prev,
            codeSent: false,
            error: null,
        }));
    }, []);

    // Clear error
    const clearError = useCallback(() => {
        setState(prev => ({ ...prev, error: null }));
    }, []);

    // Update email updates opt-in (for Settings toggle)
    const updateEmailUpdatesOptIn = useCallback(async (enabled: boolean) => {
        if (!walletAddress) return false;
        try {
            const res = await fetch("/api/user/email-updates", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email_updates_opt_in: enabled }),
            });
            const data = await res.json();
            if (!res.ok) {
                console.error("[Email] Update opt-in error:", data.error);
                return false;
            }
            setState(prev => ({ ...prev, emailUpdatesOptIn: data.email_updates_opt_in ?? enabled }));
            return true;
        } catch (err) {
            console.error("[Email] Update opt-in error:", err);
            return false;
        }
    }, [walletAddress]);

    return {
        ...state,
        sendCode,
        verifyCode,
        reset,
        removeEmail,
        startChangeEmail,
        clearError,
        updateEmailUpdatesOptIn,
        refresh: loadEmailStatus,
    };
}

