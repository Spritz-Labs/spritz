"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "@/config/supabase";
import { normalizeAddress } from "@/utils/address";

type PhoneData = {
    id: string;
    wallet_address: string;
    phone_number: string;
    verified: boolean;
    verified_at: string | null;
};

type VerificationState =
    | "idle"
    | "sending"
    | "sent"
    | "verifying"
    | "verified"
    | "error";

export function usePhoneVerification(userAddress: string | null) {
    const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
    const [isVerified, setIsVerified] = useState(false);
    const [state, setState] = useState<VerificationState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [codeExpiresAt, setCodeExpiresAt] = useState<Date | null>(null);

    // Fetch current user's phone verification status
    const fetchPhoneStatus = useCallback(async () => {
        if (!userAddress || !isSupabaseConfigured || !supabase) return;
        
        const client = supabase; // TypeScript narrowing
        if (!client) return;

        const { data, error: fetchError } = await client
            .from("shout_phone_numbers")
            .select("phone_number, verified")
            .eq("wallet_address", normalizeAddress(userAddress))
            .maybeSingle();

        if (fetchError) {
            console.error(
                "[usePhoneVerification] Error fetching status:",
                fetchError
            );
        } else if (data) {
            setPhoneNumber(data.phone_number);
            setIsVerified(data.verified);
            if (data.verified) {
                setState("verified");
            }
        }
    }, [userAddress]);

    // Fetch on mount
    useEffect(() => {
        fetchPhoneStatus();
    }, [fetchPhoneStatus]);

    // Send verification code
    const sendCode = useCallback(
        async (phone: string): Promise<boolean> => {
            if (!userAddress) {
                setError("Wallet not connected");
                return false;
            }

            setState("sending");
            setError(null);

            try {
                const response = await fetch("/api/phone/send-code", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        walletAddress: userAddress,
                        phoneNumber: phone,
                    }),
                    credentials: "include", // Important for session cookie
                });

                const data = await response.json();

                if (!response.ok) {
                    setError(data.error || "Failed to send verification code");
                    setState("error");
                    return false;
                }

                setPhoneNumber(phone);
                setCodeExpiresAt(new Date(data.expiresAt));
                setState("sent");
                return true;
            } catch (err) {
                console.error("[usePhoneVerification] Send code error:", err);
                setError("Failed to send verification code. Please try again.");
                setState("error");
                return false;
            }
        },
        [userAddress]
    );

    // Verify the code
    const verifyCode = useCallback(
        async (code: string): Promise<boolean> => {
            if (!userAddress) {
                setError("Wallet not connected");
                return false;
            }

            setState("verifying");
            setError(null);

            try {
                const response = await fetch("/api/phone/verify-code", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        walletAddress: userAddress,
                        code,
                    }),
                    credentials: "include", // Important for session cookie
                });

                const data = await response.json();

                if (!response.ok) {
                    setError(data.error || "Failed to verify code");
                    setState("sent"); // Go back to sent state so they can try again
                    return false;
                }

                setPhoneNumber(data.phoneNumber);
                setIsVerified(true);
                setState("verified");
                return true;
            } catch (err) {
                console.error("[usePhoneVerification] Verify code error:", err);
                setError("Failed to verify code. Please try again.");
                setState("sent");
                return false;
            }
        },
        [userAddress]
    );

    // Lookup user by phone number
    const lookupByPhone = useCallback(
        async (phone: string): Promise<PhoneData | null> => {
            if (!isSupabaseConfigured || !supabase) return null;

            const client = supabase; // TypeScript narrowing
            if (!client) return null;

            // Normalize the phone number for lookup
            let normalized = phone.replace(/[^\d+]/g, "");
            if (!normalized.startsWith("+")) {
                if (normalized.length === 10) {
                    normalized = "+1" + normalized;
                } else if (
                    normalized.length === 11 &&
                    normalized.startsWith("1")
                ) {
                    normalized = "+" + normalized;
                }
            }

            try {
                const { data, error: lookupError } = await client
                    .from("shout_phone_numbers")
                    .select("*")
                    .eq("phone_number", normalized)
                    .eq("verified", true)
                    .maybeSingle();

                if (lookupError) {
                    console.error(
                        "[usePhoneVerification] Lookup error:",
                        lookupError
                    );
                    return null;
                }

                return data;
            } catch (err) {
                console.error("[usePhoneVerification] Lookup error:", err);
                return null;
            }
        },
        []
    );

    // Remove phone number
    const removePhone = useCallback(async (): Promise<boolean> => {
        if (!userAddress) {
            setError("Wallet not connected");
            return false;
        }

        setState("sending"); // Reuse sending state for loading indicator
        setError(null);

        try {
            const response = await fetch("/api/phone/remove", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    walletAddress: userAddress,
                }),
                credentials: "include", // Important for session cookie
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || "Failed to remove phone number");
                setState("verified"); // Go back to verified state
                return false;
            }

            // Clear local state
            setPhoneNumber(null);
            setIsVerified(false);
            setState("idle");
            setCodeExpiresAt(null);
            return true;
        } catch (err) {
            console.error("[usePhoneVerification] Remove phone error:", err);
            setError("Failed to remove phone number. Please try again.");
            setState("verified");
            return false;
        }
    }, [userAddress]);

    // Reset state (for changing number)
    const reset = useCallback(() => {
        setState("idle");
        setError(null);
        setCodeExpiresAt(null);
    }, []);

    // Start change number flow (resets verified status locally to show input)
    const startChangeNumber = useCallback(() => {
        setState("idle");
        setError(null);
        setCodeExpiresAt(null);
        // Don't clear phoneNumber or isVerified - they'll update after new verification
    }, []);

    // Clear error
    const clearError = useCallback(() => setError(null), []);

    return {
        phoneNumber,
        isVerified,
        state,
        error,
        codeExpiresAt,
        isConfigured: isSupabaseConfigured,
        sendCode,
        verifyCode,
        lookupByPhone,
        removePhone,
        startChangeNumber,
        reset,
        clearError,
        refresh: fetchPhoneStatus,
    };
}
