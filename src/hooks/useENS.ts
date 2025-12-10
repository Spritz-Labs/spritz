"use client";

import { useState, useCallback } from "react";
import { createPublicClient, http, isAddress, type Address, fallback } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

// Multiple RPC endpoints for reliability
const publicClient = createPublicClient({
  chain: mainnet,
  transport: fallback([
    http("https://eth.llamarpc.com", { timeout: 10000 }),
    http("https://rpc.ankr.com/eth", { timeout: 10000 }),
    http("https://mainnet.rpc.buidlguidl.com", { timeout: 10000 }),
    http("https://cloudflare-eth.com", { timeout: 10000 }),
  ]),
});

export type ENSResolution = {
  address: Address | null;
  ensName: string | null;
  avatar: string | null;
};

// Cache for ENS lookups
const ensCache = new Map<string, ENSResolution>();

export function useENS() {
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolveAddressOrENS = useCallback(
    async (input: string): Promise<ENSResolution | null> => {
      // Check cache first
      const cacheKey = input.toLowerCase();
      if (ensCache.has(cacheKey)) {
        return ensCache.get(cacheKey)!;
      }

      setIsResolving(true);
      setError(null);

      try {
        // Check if input is already an address
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

          const result: ENSResolution = { address: input, ensName, avatar };
          ensCache.set(cacheKey, result);
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

          const result: ENSResolution = { address, ensName: normalizedName, avatar };
          ensCache.set(cacheKey, result);
          ensCache.set(address.toLowerCase(), result);
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
      const results = new Map<string, ENSResolution>();
      
      const uncached: string[] = [];
      for (const addr of addresses) {
        const cacheKey = addr.toLowerCase();
        if (ensCache.has(cacheKey)) {
          results.set(addr, ensCache.get(cacheKey)!);
        } else {
          uncached.push(addr);
        }
      }

      if (uncached.length === 0) return results;

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
