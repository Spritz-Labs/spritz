"use client";

import { useState, useEffect, useCallback } from "react";
import { ETH_PRICE_CACHE_TTL_MS } from "@/lib/constants";

interface PriceData {
    price: number;
    timestamp: number;
}

// Module-level cache for ETH price (shared across hook instances)
let priceCache: PriceData | null = null;

/**
 * Hook to fetch and cache ETH price
 * 
 * M-3 FIX: Replaces hardcoded ETH_PRICE_USD with live price data
 */
export function useEthPrice() {
    const [price, setPrice] = useState<number | null>(priceCache?.price || null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchPrice = useCallback(async (force = false) => {
        // Check cache validity
        const now = Date.now();
        if (!force && priceCache && (now - priceCache.timestamp) < ETH_PRICE_CACHE_TTL_MS) {
            setPrice(priceCache.price);
            return priceCache.price;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Try our API first (might have its own caching)
            const response = await fetch("/api/prices?tokens=eth");

            if (!response.ok) {
                throw new Error(
                    `Price API returned ${response.status}`,
                );
            }

            const data = await response.json();
            const ethPrice = data.prices?.eth ?? data.eth;

            if (typeof ethPrice === "number" && ethPrice > 0) {
                priceCache = { price: ethPrice, timestamp: now };
                setPrice(ethPrice);
                return ethPrice;
            }

            throw new Error("Invalid price data");
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to fetch price";
            setError(msg);

            // Fallback to cached price if available — no need to log an error, we recovered.
            if (priceCache) {
                console.warn("[useEthPrice] Using cached price after fetch error:", msg);
                setPrice(priceCache.price);
                return priceCache.price;
            }

            // Last resort fallback (only used if no cached price) — downgrade to warn.
            console.warn("[useEthPrice] Price fetch failed, using fallback:", msg);
            const fallbackPrice = 3000;
            setPrice(fallbackPrice);
            return fallbackPrice;
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Fetch price on mount
    useEffect(() => {
        fetchPrice();
    }, [fetchPrice]);

    // Refresh price periodically
    useEffect(() => {
        const interval = setInterval(() => {
            fetchPrice();
        }, ETH_PRICE_CACHE_TTL_MS);

        return () => clearInterval(interval);
    }, [fetchPrice]);

    return {
        price,
        isLoading,
        error,
        refresh: () => fetchPrice(true),
    };
}

/**
 * Get cached ETH price synchronously (for non-hook contexts)
 * Returns cached price or fallback
 */
export function getCachedEthPrice(): number {
    return priceCache?.price || 3000;
}
