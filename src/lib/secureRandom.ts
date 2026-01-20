/**
 * Cryptographically Secure Random Utilities
 * 
 * SECURITY: These functions use crypto.getRandomValues() which is
 * cryptographically secure, unlike Math.random() which is predictable.
 * 
 * Use these for:
 * - Verification codes
 * - Invite codes
 * - Recovery tokens
 * - Any security-sensitive random generation
 * 
 * DO NOT use for:
 * - UI animations (use Math.random() - it's faster)
 * - Non-security logging IDs (Math.random() is fine)
 */

import { randomBytes } from "crypto";

/**
 * Generate a cryptographically secure random string
 * 
 * @param length - Length of the string to generate
 * @param charset - Character set to use (default: alphanumeric without confusing chars)
 * @returns Secure random string
 */
export function secureRandomString(
    length: number, 
    charset: string = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
): string {
    // Use Node.js crypto for server-side
    if (typeof window === "undefined") {
        const bytes = randomBytes(length);
        return Array.from(bytes, (byte) => charset[byte % charset.length]).join("");
    }
    
    // Use Web Crypto API for client-side
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => charset[byte % charset.length]).join("");
}

/**
 * Generate a secure 6-digit verification code
 * 
 * Uses rejection sampling to ensure uniform distribution
 * 
 * @returns 6-digit numeric string (e.g., "847291")
 */
export function secureVerificationCode(): string {
    // Use Node.js crypto for server-side
    if (typeof window === "undefined") {
        // Generate 4 bytes = 32 bits, giving us 0 to 4,294,967,295
        const bytes = randomBytes(4);
        const num = bytes.readUInt32BE(0);
        // Rejection sampling to avoid modulo bias
        // We need numbers 0-999999 (1,000,000 possibilities)
        // 4,294,967,296 % 1,000,000 = 967,296 (bias zone)
        // Max acceptable: 4,294,000,000 (largest multiple of 1,000,000 that fits)
        if (num >= 4294000000) {
            // Retry if in bias zone (very rare ~0.02%)
            return secureVerificationCode();
        }
        const code = num % 1000000;
        return code.toString().padStart(6, "0");
    }
    
    // Client-side fallback
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const num = array[0];
    if (num >= 4294000000) {
        return secureVerificationCode();
    }
    const code = num % 1000000;
    return code.toString().padStart(6, "0");
}

/**
 * Generate a cryptographically secure hex string
 * 
 * @param bytes - Number of bytes (hex string will be 2x this length)
 * @returns Hex string prefixed with 0x
 */
export function secureRandomHex(bytes: number = 32): `0x${string}` {
    // Use Node.js crypto for server-side
    if (typeof window === "undefined") {
        return `0x${randomBytes(bytes).toString("hex")}` as `0x${string}`;
    }
    
    // Client-side fallback
    const array = new Uint8Array(bytes);
    crypto.getRandomValues(array);
    const hex = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
    return `0x${hex}` as `0x${string}`;
}

/**
 * Generate a secure UUID v4
 * 
 * @returns UUID string
 */
export function secureUUID(): string {
    // Use Node.js crypto.randomUUID if available (Node 16+)
    if (typeof window === "undefined") {
        const { randomUUID } = require("crypto");
        if (randomUUID) {
            return randomUUID();
        }
        // Fallback for older Node versions
        const bytes = randomBytes(16);
        // Set version (4) and variant (RFC 4122)
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = bytes.toString("hex");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    
    // Client-side: use crypto.randomUUID if available
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    }
    
    // Fallback
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    array[6] = (array[6] & 0x0f) | 0x40;
    array[8] = (array[8] & 0x3f) | 0x80;
    const hex = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Generate a secure recovery token
 * 
 * @param length - Length of the token (default: 32)
 * @returns URL-safe base64 token
 */
export function secureRecoveryToken(length: number = 32): string {
    // Use URL-safe base64 characters
    const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    return secureRandomString(length, charset);
}

/**
 * Generate a secure invite code
 * 
 * @param length - Length of the code (default: 8)
 * @returns Uppercase alphanumeric code without confusing characters
 */
export function secureInviteCode(length: number = 8): string {
    // Exclude 0, O, I, 1, L to avoid confusion
    const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return secureRandomString(length, charset);
}
