"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseAnonKey 
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

// Cache for beta access status
const CACHE_KEY = "spritz_beta_access";
const CACHE_TTL = 60 * 1000; // 1 minute (shorter to catch beta access grants faster)

type CachedBetaAccess = {
    hasBetaAccess: boolean;
    timestamp: number;
};

// Helper to check if address is a Solana address (base58, not starting with 0x)
function isSolanaAddress(address: string): boolean {
    return !address.startsWith("0x") && address.length >= 32 && address.length <= 44;
}

export function useBetaAccess(userAddress: string | null) {
    const [hasBetaAccess, setHasBetaAccess] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const checkBetaAccess = useCallback(async () => {
        if (!userAddress || !supabase) {
            setHasBetaAccess(false);
            setIsLoading(false);
            return;
        }

        // Solana addresses are case-sensitive, EVM addresses should be lowercased
        const normalizedAddress = isSolanaAddress(userAddress) 
            ? userAddress 
            : userAddress.toLowerCase();
        const cacheKey = `${CACHE_KEY}_${normalizedAddress}`;

        // Check cache first
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const parsed: CachedBetaAccess = JSON.parse(cached);
                if (Date.now() - parsed.timestamp < CACHE_TTL) {
                    setHasBetaAccess(parsed.hasBetaAccess);
                    setIsLoading(false);
                    return;
                }
            }
        } catch (e) {
            console.error("[Beta Access] Cache error:", e);
        }

        // Fetch from database
        try {
            const { data, error } = await supabase
                .from("shout_users")
                .select("beta_access")
                .eq("wallet_address", normalizedAddress)
                .single();

            if (error) {
                // PGRST116 means no rows found - user doesn't exist yet, not an error
                if (error.code !== "PGRST116") {
                    console.error("[Beta Access] Error fetching:", error);
                }
                setHasBetaAccess(false);
            } else {
                const hasAccess = data?.beta_access || false;
                setHasBetaAccess(hasAccess);

                // Cache the result
                try {
                    localStorage.setItem(cacheKey, JSON.stringify({
                        hasBetaAccess: hasAccess,
                        timestamp: Date.now(),
                    }));
                } catch (e) {
                    console.error("[Beta Access] Cache save error:", e);
                }
            }
        } catch (error) {
            console.error("[Beta Access] Error:", error);
            setHasBetaAccess(false);
        } finally {
            setIsLoading(false);
        }
    }, [userAddress]);

    useEffect(() => {
        checkBetaAccess();
    }, [checkBetaAccess]);

    // Function to clear cache and refresh
    const refresh = useCallback(() => {
        if (userAddress) {
            const normalizedAddress = isSolanaAddress(userAddress) 
                ? userAddress 
                : userAddress.toLowerCase();
            const cacheKey = `${CACHE_KEY}_${normalizedAddress}`;
            localStorage.removeItem(cacheKey);
        }
        setIsLoading(true);
        checkBetaAccess();
    }, [userAddress, checkBetaAccess]);

    return {
        hasBetaAccess,
        isLoading,
        refresh,
    };
}

export default useBetaAccess;

