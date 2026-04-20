"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/config/supabase";

/**
 * usePhoneVerification
 *
 * This hook is mounted in at least 5 components at the same time (Dashboard,
 * QRCodeModal, AddFriendModal, PhoneVerificationModal, …). Before this file
 * was migrated to React Query every mount issued its own
 * `GET /api/phone/status` request, which is the workload that was blowing
 * up the Supabase connection pool.
 *
 * The migration keeps the public API identical — consumers don't need to
 * change — but dedupes the GET via a shared React Query cache and only
 * revalidates every 30s (matching the server's in-memory cache TTL).
 */

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

type PhoneStatus = {
    phoneNumber: string | null;
    verified: boolean;
};

const PHONE_STATUS_KEY = (address: string | null) =>
    ["phone-status", address?.toLowerCase() ?? null] as const;

async function fetchPhoneStatus(): Promise<PhoneStatus> {
    const res = await fetch("/api/phone/status", { credentials: "include" });
    if (!res.ok) {
        // Surface no-phone as an empty status, not an error, so the UI can
        // render the "add phone" prompt without bubbling up a toast.
        return { phoneNumber: null, verified: false };
    }
    const data = await res.json();
    return {
        phoneNumber: data.phoneNumber ?? null,
        verified: Boolean(data.verified),
    };
}

export function usePhoneVerification(userAddress: string | null) {
    const queryClient = useQueryClient();

    // Only the status fetch goes through React Query — mutations below stay
    // imperative so the call-sites that depend on their boolean return value
    // don't need to change.
    const query = useQuery({
        queryKey: PHONE_STATUS_KEY(userAddress),
        queryFn: fetchPhoneStatus,
        enabled: Boolean(userAddress),
        // Matches the server-side cache TTL in /api/phone/status.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
    });

    const [state, setState] = useState<VerificationState>("idle");
    const [error, setError] = useState<string | null>(null);
    const [codeExpiresAt, setCodeExpiresAt] = useState<Date | null>(null);
    // Local phone-number override so the UI reflects what the user just typed
    // before the server round-trip completes.
    const [pendingPhone, setPendingPhone] = useState<string | null>(null);

    const phoneNumber = pendingPhone ?? query.data?.phoneNumber ?? null;
    const isVerified = Boolean(query.data?.verified);

    // Promote `state` to "verified" when the cached status says so. Done in
    // an effect (not inline during render) to keep the render pure.
    useEffect(() => {
        if (isVerified && state === "idle") {
            setState("verified");
        }
    }, [isVerified, state]);

    const invalidateStatus = useCallback(() => {
        queryClient.invalidateQueries({
            queryKey: PHONE_STATUS_KEY(userAddress),
        });
    }, [queryClient, userAddress]);

    const setStatusCache = useCallback(
        (next: PhoneStatus) => {
            queryClient.setQueryData<PhoneStatus>(
                PHONE_STATUS_KEY(userAddress),
                next
            );
        },
        [queryClient, userAddress]
    );

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
                    credentials: "include",
                });

                const data = await response.json();

                if (!response.ok) {
                    setError(data.error || "Failed to send verification code");
                    setState("error");
                    return false;
                }

                setPendingPhone(phone);
                setCodeExpiresAt(new Date(data.expiresAt));
                setState("sent");
                return true;
            } catch (err) {
                console.error("[usePhoneVerification] Send code error:", err);
                setError(
                    "Failed to send verification code. Please try again."
                );
                setState("error");
                return false;
            }
        },
        [userAddress]
    );

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
                    credentials: "include",
                });

                const data = await response.json();

                if (!response.ok) {
                    setError(data.error || "Failed to verify code");
                    setState("sent");
                    return false;
                }

                // Optimistic cache update — avoids a follow-up fetch and keeps
                // every other consumer of this hook in sync immediately.
                setStatusCache({
                    phoneNumber: data.phoneNumber ?? pendingPhone,
                    verified: true,
                });
                setPendingPhone(null);
                setState("verified");
                return true;
            } catch (err) {
                console.error("[usePhoneVerification] Verify code error:", err);
                setError("Failed to verify code. Please try again.");
                setState("sent");
                return false;
            }
        },
        [userAddress, setStatusCache, pendingPhone]
    );

    const lookupByPhone = useCallback(
        async (phone: string): Promise<PhoneData | null> => {
            if (!isSupabaseConfigured || !supabase) return null;

            const client = supabase;

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

    const removePhone = useCallback(async (): Promise<boolean> => {
        if (!userAddress) {
            setError("Wallet not connected");
            return false;
        }

        setState("sending");
        setError(null);

        try {
            const response = await fetch("/api/phone/remove", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ walletAddress: userAddress }),
                credentials: "include",
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || "Failed to remove phone number");
                setState("verified");
                return false;
            }

            setStatusCache({ phoneNumber: null, verified: false });
            setPendingPhone(null);
            setCodeExpiresAt(null);
            setState("idle");
            return true;
        } catch (err) {
            console.error("[usePhoneVerification] Remove phone error:", err);
            setError("Failed to remove phone number. Please try again.");
            setState("verified");
            return false;
        }
    }, [userAddress, setStatusCache]);

    const reset = useCallback(() => {
        setState("idle");
        setError(null);
        setCodeExpiresAt(null);
    }, []);

    const startChangeNumber = useCallback(() => {
        setState("idle");
        setError(null);
        setCodeExpiresAt(null);
    }, []);

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
        refresh: invalidateStatus,
    };
}
