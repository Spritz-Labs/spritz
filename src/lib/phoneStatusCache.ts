/**
 * In-memory per-instance cache of phone status.
 *
 * Phone numbers rarely change, so caching for a minute trims an enormous amount
 * of DB load from repeat callers (FriendsList, Dashboard mount, PhoneVerificationModal
 * open, etc. all pound `/api/phone/status`). Cached on globalThis so HMR / repeat
 * imports share the same map.
 */

type CacheEntry = {
    phoneNumber: string | null;
    verified: boolean;
    expiresAt: number;
};

const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 5_000;

const CACHE_KEY = Symbol.for("spritz.phoneStatus.cache.v1");
type GlobalWithCache = typeof globalThis & {
    [CACHE_KEY]?: Map<string, CacheEntry>;
};
const g = globalThis as GlobalWithCache;
const cache: Map<string, CacheEntry> = g[CACHE_KEY] ?? (g[CACHE_KEY] = new Map());

export function readPhoneStatusCache(
    walletAddress: string
): CacheEntry | null {
    const hit = cache.get(walletAddress);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
        cache.delete(walletAddress);
        return null;
    }
    return hit;
}

export function writePhoneStatusCache(
    walletAddress: string,
    phoneNumber: string | null,
    verified: boolean
): void {
    if (cache.size >= CACHE_MAX) {
        const toDrop = Math.ceil(CACHE_MAX * 0.1);
        let i = 0;
        for (const k of cache.keys()) {
            cache.delete(k);
            if (++i >= toDrop) break;
        }
    }
    cache.set(walletAddress, {
        phoneNumber,
        verified,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });
}

export function invalidatePhoneStatusCache(walletAddress: string): void {
    cache.delete(walletAddress.toLowerCase());
}
