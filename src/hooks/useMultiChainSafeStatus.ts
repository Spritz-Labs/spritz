"use client";

import { useState, useCallback, useEffect, useRef } from "react";

// Cache for Safe status - shared across hook instances
const statusCache = new Map<string, { data: MultiChainSafeStatus; timestamp: number }>();
const CACHE_TTL_MS = 60000; // Cache for 60 seconds
const STALE_TTL_MS = 300000; // Consider stale after 5 minutes (but still usable)

export interface DeploymentGasEstimate {
    gasUnits: string;
    gasPriceGwei: string;
    estimatedCostEth: string;
    estimatedCostUsd: number;
    isSponsored: boolean;
}

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
    deploymentEstimate: DeploymentGasEstimate | null;
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
 * Uses stale-while-revalidate pattern for snappy UX
 */
export function useMultiChainSafeStatus(
    safeAddress: string | null,
    primarySigner: string | null
): UseMultiChainSafeStatusReturn {
    const [status, setStatus] = useState<MultiChainSafeStatus | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fetchInProgress = useRef(false);

    const getCacheKey = useCallback(() => {
        return `${safeAddress}-${primarySigner}`;
    }, [safeAddress, primarySigner]);

    const fetchStatus = useCallback(async (skipCache = false) => {
        if (!safeAddress) {
            setStatus(null);
            setIsLoading(false);
            return;
        }

        const cacheKey = getCacheKey();
        const cached = statusCache.get(cacheKey);
        const now = Date.now();

        // If we have fresh cached data and not forcing refresh, use it
        if (!skipCache && cached && (now - cached.timestamp) < CACHE_TTL_MS) {
            setStatus(cached.data);
            setIsLoading(false);
            return;
        }

        // If we have stale cached data, show it immediately while fetching fresh
        if (cached && (now - cached.timestamp) < STALE_TTL_MS) {
            setStatus(cached.data);
            // Don't show loading spinner for background refresh
        } else {
            setIsLoading(true);
        }

        // Prevent duplicate fetches
        if (fetchInProgress.current) {
            return;
        }
        fetchInProgress.current = true;

        setError(null);

        try {
            const params = new URLSearchParams({ address: safeAddress });
            if (primarySigner) {
                params.set("primarySigner", primarySigner);
            }

            // Add timeout to prevent hanging forever
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout (reduced)

            const response = await fetch(`/api/wallet/safe-status?${params}`, {
                credentials: "include",
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to fetch Safe status");
            }

            const data = await response.json();
            
            // Update cache
            statusCache.set(cacheKey, { data, timestamp: Date.now() });
            
            setStatus(data);
        } catch (err) {
            console.error("[MultiChainSafeStatus] Error:", err);
            // Only show error if we don't have cached data to show
            if (!cached) {
                if (err instanceof Error && err.name === "AbortError") {
                    setError("Request timed out. Please try again.");
                } else {
                    setError(err instanceof Error ? err.message : "Failed to fetch Safe status");
                }
            }
        } finally {
            setIsLoading(false);
            fetchInProgress.current = false;
        }
    }, [safeAddress, primarySigner, getCacheKey]);

    // On mount: check cache first, then fetch
    useEffect(() => {
        if (!safeAddress) {
            setStatus(null);
            return;
        }

        const cacheKey = getCacheKey();
        const cached = statusCache.get(cacheKey);
        
        // Immediately show cached data if available
        if (cached) {
            setStatus(cached.data);
            // If cache is fresh, don't refetch
            if ((Date.now() - cached.timestamp) < CACHE_TTL_MS) {
                return;
            }
        }
        
        // Fetch fresh data (will update in background if we showed cached)
        fetchStatus();
    }, [safeAddress, getCacheKey, fetchStatus]);

    // Force refresh function (bypasses cache)
    const refresh = useCallback(() => {
        return fetchStatus(true);
    }, [fetchStatus]);

    return {
        status,
        isLoading,
        error,
        refresh,
    };
}
