"use client";

import { useState, useEffect, useCallback } from "react";
import type { WalletBalancesResponse, ChainBalance } from "@/app/api/wallet/balances/route";

type UseWalletBalancesReturn = {
    balances: ChainBalance[];
    totalUsd: number;
    isLoading: boolean;
    error: string | null;
    lastUpdated: string | null;
    refresh: () => Promise<void>;
};

export function useWalletBalances(
    userAddress: string | null,
    autoFetch = true
): UseWalletBalancesReturn {
    const [balances, setBalances] = useState<ChainBalance[]>([]);
    const [totalUsd, setTotalUsd] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);

    const fetchBalances = useCallback(async () => {
        if (!userAddress) {
            setBalances([]);
            setTotalUsd(0);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/wallet/balances?address=${encodeURIComponent(userAddress)}`, {
                credentials: "include",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to fetch balances");
            }

            const data: WalletBalancesResponse = await response.json();
            
            setBalances(data.balances);
            setTotalUsd(data.totalUsd);
            setLastUpdated(data.lastUpdated);
        } catch (err) {
            console.error("[useWalletBalances] Error:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch balances");
        } finally {
            setIsLoading(false);
        }
    }, [userAddress]);

    // Auto-fetch on mount if enabled
    useEffect(() => {
        if (autoFetch && userAddress) {
            fetchBalances();
        }
    }, [autoFetch, userAddress, fetchBalances]);

    return {
        balances,
        totalUsd,
        isLoading,
        error,
        lastUpdated,
        refresh: fetchBalances,
    };
}

// Format USD value
export function formatUsd(value: number): string {
    if (value === 0) return "$0.00";
    if (value < 0.01) return "<$0.01";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

// Format token balance
// If balanceFormatted is provided (already decimal-adjusted), use it directly
// Otherwise, convert from raw balance using decimals
export function formatTokenBalance(balance: string, decimals: number = 18, balanceFormatted?: string): string {
    // Use formatted balance if available (already decimal-adjusted)
    const value = balanceFormatted 
        ? parseFloat(balanceFormatted)
        : parseFloat(balance) / Math.pow(10, decimals);
    
    if (isNaN(value) || value === 0) return "0";
    if (value < 0.0001) return "<0.0001";
    if (value < 1) return value.toFixed(4);
    if (value < 1000) return value.toFixed(4);
    return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 4,
    }).format(value);
}
