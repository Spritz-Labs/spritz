"use client";

import { useState, useCallback, useEffect } from "react";

export interface ChainSafeStatus {
    chainId: number;
    chainName: string;
    symbol: string;
    explorer: string;
    isDeployed: boolean;
    owners: string[];
    threshold: number;
    hasRecoverySigner: boolean;
    primarySigner: string | null;
    balanceUsd: number;
    safeAppUrl: string | null;
}

export interface SafeStatusSummary {
    totalChains: number;
    deployedChains: number;
    chainsWithFunds: number;
    chainsWithRecovery: number;
    chainsNeedingRecovery: number;
    totalBalanceUsd: number;
}

export interface MultiChainSafeStatus {
    safeAddress: string;
    primarySigner: string;
    chains: ChainSafeStatus[];
    summary: SafeStatusSummary;
}

export interface UseMultiChainSafeStatusReturn {
    status: MultiChainSafeStatus | null;
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

/**
 * Hook to fetch Safe deployment and recovery status across all supported chains
 */
export function useMultiChainSafeStatus(
    safeAddress: string | null,
    primarySigner: string | null
): UseMultiChainSafeStatusReturn {
    const [status, setStatus] = useState<MultiChainSafeStatus | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
        if (!safeAddress) {
            setStatus(null);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({ address: safeAddress });
            if (primarySigner) {
                params.set("primarySigner", primarySigner);
            }

            const response = await fetch(`/api/wallet/safe-status?${params}`, {
                credentials: "include",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to fetch Safe status");
            }

            const data = await response.json();
            setStatus(data);
        } catch (err) {
            console.error("[MultiChainSafeStatus] Error:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch Safe status");
        } finally {
            setIsLoading(false);
        }
    }, [safeAddress, primarySigner]);

    // Fetch on mount and when address changes
    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    return {
        status,
        isLoading,
        error,
        refresh: fetchStatus,
    };
}
