/**
 * Simple LRU (Least Recently Used) Cache implementation
 * 
 * Features:
 * - Fixed maximum size to prevent memory leaks
 * - TTL (time-to-live) support for automatic expiration
 * - O(1) get/set operations
 */

interface CacheEntry<T> {
    value: T;
    timestamp: number;
}

export class LRUCache<K, V> {
    private cache: Map<K, CacheEntry<V>>;
    private readonly maxSize: number;
    private readonly ttlMs: number;

    /**
     * Create a new LRU Cache
     * @param maxSize - Maximum number of entries (default: 1000)
     * @param ttlMs - Time-to-live in milliseconds (default: 5 minutes)
     */
    constructor(maxSize = 1000, ttlMs = 5 * 60 * 1000) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttlMs = ttlMs;
    }

    /**
     * Get a value from the cache
     * Returns undefined if not found or expired
     */
    get(key: K): V | undefined {
        const entry = this.cache.get(key);
        
        if (!entry) {
            return undefined;
        }

        // Check if expired
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return undefined;
        }

        // Move to end (most recently used)
        this.cache.delete(key);
        this.cache.set(key, entry);
        
        return entry.value;
    }

    /**
     * Set a value in the cache
     */
    set(key: K, value: V): void {
        // Delete existing to reset position
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // Evict oldest entries if at capacity
        while (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) {
                this.cache.delete(oldestKey);
            }
        }

        this.cache.set(key, {
            value,
            timestamp: Date.now(),
        });
    }

    /**
     * Check if a key exists and is not expired
     */
    has(key: K): boolean {
        return this.get(key) !== undefined;
    }

    /**
     * Delete a key from the cache
     */
    delete(key: K): boolean {
        return this.cache.delete(key);
    }

    /**
     * Clear all entries from the cache
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get the current size of the cache
     */
    get size(): number {
        return this.cache.size;
    }

    /**
     * Remove expired entries (useful for periodic cleanup)
     */
    prune(): number {
        const now = Date.now();
        let pruned = 0;
        
        for (const [key, entry] of this.cache) {
            if (now - entry.timestamp > this.ttlMs) {
                this.cache.delete(key);
                pruned++;
            }
        }
        
        return pruned;
    }
}

/**
 * Create a singleton cache for ENS resolutions
 * This ensures consistent caching across hook instances
 */
export function createENSCache() {
    return new LRUCache<string, { ensName: string | null; avatar: string | null }>(
        1000, // Max 1000 entries
        5 * 60 * 1000 // 5 minute TTL
    );
}

// Singleton instance for ENS - only created on client side
let ensCache: LRUCache<string, { ensName: string | null; avatar: string | null }> | null = null;

export function getENSCache() {
    if (typeof window === "undefined") {
        // Server-side: return a new instance each time (no persistence)
        return new LRUCache<string, { ensName: string | null; avatar: string | null }>(100, 60000);
    }
    
    if (!ensCache) {
        ensCache = createENSCache();
    }
    return ensCache;
}
