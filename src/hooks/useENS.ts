"use client";

import { useState, useCallback, useEffect } from "react";
import { createPublicClient, http, isAddress, type Address, fallback } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { isSolanaAddress } from "@/utils/address";

// Multiple RPC endpoints for reliability
const publicClient = createPublicClient({
  chain: mainnet,
  transport: fallback([
    http("https://eth.llamarpc.com", { timeout: 10000 }),
    http("https://cloudflare-eth.com", { timeout: 10000 }),
    http("https://mainnet.rpc.buidlguidl.com", { timeout: 10000 }),
  ]),
});

export type ENSResolution = {
  address: Address | string | null; // Can be EVM Address or Solana address string
  ensName: string | null;
  avatar: string | null;
};

// Cache TTL: 24 hours (ENS names rarely change)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ENS_CACHE_KEY = "spritz_ens_cache";

type CachedENSEntry = ENSResolution & { timestamp: number };

// In-memory cache for fast access during session
const ensCache = new Map<string, CachedENSEntry>();

// Load cache from localStorage on startup
function loadCacheFromStorage(): void {
  if (typeof window === "undefined") return;
  
  try {
    const stored = localStorage.getItem(ENS_CACHE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, CachedENSEntry>;
      const now = Date.now();
      
      // Load non-expired entries
      for (const [key, entry] of Object.entries(parsed)) {
        if (now - entry.timestamp < CACHE_TTL_MS) {
          ensCache.set(key, entry);
        }
      }
      
      console.log(`[ENS] Loaded ${ensCache.size} cached entries from localStorage`);
    }
  } catch (err) {
    console.warn("[ENS] Failed to load cache from localStorage:", err);
  }
}

// Save cache to localStorage (debounced)
let saveTimeout: NodeJS.Timeout | null = null;
function saveCacheToStorage(): void {
  if (typeof window === "undefined") return;
  
  // Debounce saves
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const cacheObj: Record<string, CachedENSEntry> = {};
      ensCache.forEach((value, key) => {
        cacheObj[key] = value;
      });
      localStorage.setItem(ENS_CACHE_KEY, JSON.stringify(cacheObj));
    } catch (err) {
      console.warn("[ENS] Failed to save cache to localStorage:", err);
    }
  }, 1000);
}

// Initialize cache from localStorage
let cacheInitialized = false;
function initCache() {
  if (!cacheInitialized && typeof window !== "undefined") {
    loadCacheFromStorage();
    cacheInitialized = true;
  }
}

// Check if cache entry is still valid
function isCacheValid(entry: CachedENSEntry | undefined): entry is CachedENSEntry {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

export function useENS() {
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize cache on first render
  useEffect(() => {
    initCache();
  }, []);

  const resolveAddressOrENS = useCallback(
    async (input: string): Promise<ENSResolution | null> => {
      initCache(); // Ensure cache is loaded
      
      // Check cache first (with TTL validation)
      const cacheKey = input.toLowerCase();
      const cached = ensCache.get(cacheKey);
      if (isCacheValid(cached)) {
        return cached;
      }

      setIsResolving(true);
      setError(null);

      try {
        // Check if input is a Solana address - return it directly (no ENS for Solana)
        if (isSolanaAddress(input)) {
          const result: CachedENSEntry = { address: input, ensName: null, avatar: null, timestamp: Date.now() };
          ensCache.set(cacheKey, result);
          saveCacheToStorage();
          return result;
        }

        // Check if input is already an EVM address
        if (isAddress(input)) {
          let ensName: string | null = null;
          let avatar: string | null = null;

          // Get primary ENS name (reverse record)
          try {
            ensName = await publicClient.getEnsName({ address: input });
            if (ensName) {
              console.log("[ENS] Found name for", input.slice(0, 8) + "...:", ensName);
            }
          } catch (err) {
            // Silent fail - many addresses don't have ENS
          }

          // Get avatar if we have an ENS name
          if (ensName) {
            try {
              avatar = await publicClient.getEnsAvatar({
                name: normalize(ensName),
              });
              if (avatar) {
                console.log("[ENS] Found avatar for", ensName);
              }
            } catch (err) {
              // Silent fail - many ENS names don't have avatars
            }
          }

          const result: CachedENSEntry = { address: input, ensName, avatar, timestamp: Date.now() };
          ensCache.set(cacheKey, result);
          saveCacheToStorage();
          return result;
        }

        // Input looks like an ENS name - forward resolution
        const normalizedName = input.endsWith(".eth") ? input : `${input}.eth`;

        try {
          const address = await publicClient.getEnsAddress({
            name: normalize(normalizedName),
          });

          if (!address) {
            setError("ENS name not found");
            return null;
          }

          // Get avatar
          let avatar: string | null = null;
          try {
            avatar = await publicClient.getEnsAvatar({
              name: normalize(normalizedName),
            });
          } catch {
            // Silent fail
          }

          const result: CachedENSEntry = { address, ensName: normalizedName, avatar, timestamp: Date.now() };
          ensCache.set(cacheKey, result);
          ensCache.set(address.toLowerCase(), result);
          saveCacheToStorage();
          return result;
        } catch (err) {
          setError("Could not resolve ENS name");
          return null;
        }
      } catch (err) {
        console.warn("[ENS] Resolution error:", err);
        setError("Resolution failed");
        return null;
      } finally {
        setIsResolving(false);
      }
    },
    []
  );

  // Batch resolve - returns partial results even if some fail
  const resolveAddresses = useCallback(
    async (addresses: string[]): Promise<Map<string, ENSResolution>> => {
      initCache(); // Ensure cache is loaded
      const results = new Map<string, ENSResolution>();
      
      const uncached: string[] = [];
      for (const addr of addresses) {
        const cacheKey = addr.toLowerCase();
        const cached = ensCache.get(cacheKey);
        if (isCacheValid(cached)) {
          results.set(addr, cached);
        } else {
          uncached.push(addr);
        }
      }

      if (uncached.length === 0) {
        console.log(`[ENS] All ${addresses.length} addresses resolved from cache`);
        return results;
      }
      
      console.log(`[ENS] Resolving ${uncached.length} addresses (${addresses.length - uncached.length} from cache)`);

      // Resolve in small batches with error tolerance
      const batchSize = 2;
      for (let i = 0; i < uncached.length; i += batchSize) {
        const batch = uncached.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(addr => resolveAddressOrENS(addr))
        );
        batch.forEach((addr, idx) => {
          const result = batchResults[idx];
          if (result.status === "fulfilled" && result.value) {
            results.set(addr, result.value);
          }
        });
      }

      return results;
    },
    [resolveAddressOrENS]
  );

  const clearCache = useCallback(() => {
    ensCache.clear();
  }, []);

  return {
    resolveAddressOrENS,
    resolveAddresses,
    clearCache,
    isResolving,
    error,
    clearError: () => setError(null),
  };
}
