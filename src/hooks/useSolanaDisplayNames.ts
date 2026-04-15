"use client";

import { useState, useEffect, useMemo } from "react";
import {
    formatAddress,
    isSolanaAddress,
    walletCacheKey,
} from "@/utils/address";
import { getENSCache } from "@/lib/lruCache";
import { useENS } from "./useENS";

type FetchLabel = { addr: string; label: string };

/**
 * Primary label for an address: SNS .sol when resolvable (Solana), else truncated address.
 * EVM addresses are returned as `formatAddress` without RPC calls.
 */
export function useSolanaDisplayLabel(
    address: string | null | undefined
): string {
    const { resolveAddressOrENS } = useENS();

    const [fetchLabel, setFetchLabel] = useState<FetchLabel | null>(null);

    const label = useMemo(() => {
        if (!address?.trim()) return "";
        if (!isSolanaAddress(address)) return formatAddress(address);
        const key = walletCacheKey(address);
        const cached = getENSCache().get(key);
        if (cached?.snsName) return cached.snsName;
        if (fetchLabel?.addr === address) return fetchLabel.label;
        return formatAddress(address);
    }, [address, fetchLabel]);

    useEffect(() => {
        if (!address?.trim() || !isSolanaAddress(address)) return;

        const key = walletCacheKey(address);
        if (getENSCache().get(key)?.snsName) return;

        let cancelled = false;
        (async () => {
            try {
                const r = await resolveAddressOrENS(address);
                const sns = r?.snsName ?? null;
                const resolved = sns || formatAddress(address);
                if (r) {
                    getENSCache().set(key, {
                        ensName: r.ensName ?? null,
                        snsName: sns,
                        avatar: r.avatar ?? null,
                    });
                }
                if (!cancelled) {
                    setFetchLabel({ addr: address, label: resolved });
                }
            } catch {
                if (!cancelled) {
                    setFetchLabel({ addr: address, label: formatAddress(address) });
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [address, resolveAddressOrENS]);

    return label;
}

/**
 * Map of wallet cache key → display label (SNS or truncated) for batch UIs.
 */
export function useSolanaDisplayLabelMap(
    addresses: readonly (string | null | undefined)[] | undefined
): Record<string, string> {
    const { resolveAddressOrENS } = useENS();

    const uniq = useMemo(() => {
        const s = new Set<string>();
        for (const a of addresses || []) {
            if (a && isSolanaAddress(a)) {
                s.add(walletCacheKey(a));
            }
        }
        return [...s];
    }, [addresses]);

    const uniqKey = uniq.slice().sort().join("|");

    const baseLabels = useMemo(() => {
        const out: Record<string, string> = {};
        const cache = getENSCache();
        for (const addr of uniq) {
            const key = walletCacheKey(addr);
            const c = cache.get(key);
            out[key] = c?.snsName || formatAddress(addr);
        }
        return out;
    }, [uniq]);

    const keySet = useMemo(
        () => new Set(uniq.map((a) => walletCacheKey(a))),
        [uniq]
    );

    const [asyncLabels, setAsyncLabels] = useState<Record<string, string>>(
        {}
    );

    useEffect(() => {
        if (uniq.length === 0) return;

        const cache = getENSCache();
        const pending = uniq.filter(
            (addr) => !cache.get(walletCacheKey(addr))?.snsName
        );
        if (pending.length === 0) return;

        let cancelled = false;

        Promise.all(
            pending.map(async (addr) => {
                const key = walletCacheKey(addr);
                try {
                    const r = await resolveAddressOrENS(addr);
                    const sns = r?.snsName ?? null;
                    if (r) {
                        cache.set(key, {
                            ensName: r.ensName ?? null,
                            snsName: sns,
                            avatar: r.avatar ?? null,
                        });
                    }
                    return [key, sns || formatAddress(addr)] as const;
                } catch {
                    return [key, formatAddress(addr)] as const;
                }
            })
        ).then((rows) => {
            if (cancelled) return;
            const next: Record<string, string> = {};
            for (const [k, v] of rows) next[k] = v;
            setAsyncLabels((prev) => ({ ...prev, ...next }));
        });

        return () => {
            cancelled = true;
        };
    }, [uniqKey, resolveAddressOrENS, uniq]);

    return useMemo(() => {
        const filtered: Record<string, string> = {};
        for (const [k, v] of Object.entries(asyncLabels)) {
            if (keySet.has(k)) filtered[k] = v;
        }
        return { ...baseLabels, ...filtered };
    }, [baseLabels, asyncLabels, keySet]);
}

/** Lookup label for an address using the map (keys are canonical walletCacheKey). */
export function solanaLabelFromMap(
    address: string,
    map: Record<string, string>
): string {
    if (!isSolanaAddress(address)) return formatAddress(address);
    const key = walletCacheKey(address);
    return map[key] || formatAddress(address);
}

/** Use as `snsName` in getDisplayName only when reverse lookup returned a .sol domain */
export function solanaSnsFromResolvedLabel(
    address: string,
    mapLabel: string | undefined
): string | null {
    if (!mapLabel || !isSolanaAddress(address)) return null;
    return mapLabel.endsWith(".sol") ? mapLabel : null;
}
