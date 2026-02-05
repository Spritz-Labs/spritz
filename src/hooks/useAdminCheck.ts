"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/config/supabase";

type AdminStatus = {
    isAdmin: boolean;
    isSuperAdmin: boolean;
    isLoading: boolean;
};

/**
 * Lightweight hook to check if a wallet address (or any of several) is an admin.
 * Does not require SIWE - just checks the database.
 * Pass additionalAddresses (e.g. smart wallet when userAddress is EOA, or vice versa) so admins are recognized regardless of which address they signed in with.
 */
export function useAdminCheck(
    walletAddress: string | null,
    additionalAddresses?: (string | null)[]
): AdminStatus {
    const [status, setStatus] = useState<AdminStatus>({
        isAdmin: false,
        isSuperAdmin: false,
        isLoading: true,
    });

    useEffect(() => {
        const checkAdminStatus = async () => {
            const addresses = [walletAddress, ...(additionalAddresses ?? [])]
                .filter((a): a is string => !!a && typeof a === "string")
                .map((a) => a.toLowerCase());
            const unique = [...new Set(addresses)];

            if (unique.length === 0 || !supabase) {
                setStatus({
                    isAdmin: false,
                    isSuperAdmin: false,
                    isLoading: false,
                });
                return;
            }

            try {
                const { data, error } = await supabase
                    .from("shout_admins")
                    .select("is_super_admin")
                    .in("wallet_address", unique)
                    .limit(1)
                    .maybeSingle();

                if (error || !data) {
                    setStatus({
                        isAdmin: false,
                        isSuperAdmin: false,
                        isLoading: false,
                    });
                    return;
                }

                setStatus({
                    isAdmin: true,
                    isSuperAdmin: data.is_super_admin || false,
                    isLoading: false,
                });
            } catch (err) {
                console.error("[AdminCheck] Error checking admin status:", err);
                setStatus({
                    isAdmin: false,
                    isSuperAdmin: false,
                    isLoading: false,
                });
            }
        };

        checkAdminStatus();
    }, [walletAddress, additionalAddresses?.join(",")]);

    return status;
}
