import { Redis } from "@upstash/redis";
import crypto from "crypto";

// Initialize Redis client (same as ratelimit.ts)
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    : null;

const NONCE_PREFIX = "auth:nonce:";
const NONCE_EXPIRY_SECONDS = 300; // 5 minutes

// Check if we're in production (Vercel sets this)
const isProduction = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";

/**
 * Generate a cryptographically secure nonce
 */
export function generateSecureNonce(): string {
    return crypto.randomBytes(32).toString("hex");
}

/**
 * Store a nonce for an address (valid for 5 minutes)
 */
export async function storeNonce(address: string, nonce: string): Promise<boolean> {
    if (!redis) {
        if (isProduction) {
            console.error("[Nonce] CRITICAL: Redis not configured in production! Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN");
            // In production, fail closed - don't allow auth without nonce verification
            return false;
        }
        console.warn("[Nonce] Redis not configured - nonce verification disabled (dev mode)");
        return true; // Allow without verification only in development
    }

    try {
        const key = `${NONCE_PREFIX}${address.toLowerCase()}:${nonce}`;
        await redis.setex(key, NONCE_EXPIRY_SECONDS, "valid");
        return true;
    } catch (error) {
        console.error("[Nonce] Error storing nonce:", error);
        return false;
    }
}

/**
 * Verify and consume a nonce (one-time use)
 * Returns true if valid, false if invalid/expired/already used
 */
export async function verifyAndConsumeNonce(address: string, nonce: string): Promise<boolean> {
    if (!redis) {
        if (isProduction) {
            console.error("[Nonce] CRITICAL: Redis not configured in production! Rejecting auth request.");
            // In production, fail closed - reject without nonce verification
            return false;
        }
        console.warn("[Nonce] Redis not configured - nonce verification disabled (dev mode)");
        return true; // Allow without verification only in development
    }

    try {
        const key = `${NONCE_PREFIX}${address.toLowerCase()}:${nonce}`;
        
        // Get and delete atomically (one-time use)
        const value = await redis.getdel(key);
        
        if (value === "valid") {
            return true;
        }
        
        console.warn("[Nonce] Invalid or expired nonce for address:", address.toLowerCase());
        return false;
    } catch (error) {
        console.error("[Nonce] Error verifying nonce:", error);
        // On error, be conservative and reject
        return false;
    }
}

/**
 * Extract nonce from a SIWE-style message
 */
export function extractNonceFromMessage(message: string): string | null {
    const nonceMatch = message.match(/Nonce: ([a-zA-Z0-9]+)/);
    return nonceMatch ? nonceMatch[1] : null;
}

/**
 * Check if nonce verification is available
 */
export function isNonceVerificationEnabled(): boolean {
    return redis !== null;
}
