/**
 * Sensitive Data Redaction Utilities
 * 
 * SRE Rationale:
 * - Prevents accidental logging of PII, credentials, and secrets
 * - GDPR/CCPA compliance requirement
 * - Defense in depth - redact even if code accidentally logs sensitive data
 */

/**
 * Paths that Pino will automatically redact
 * These use dot notation for nested properties
 * 
 * @see https://getpino.io/#/docs/redaction
 */
export const REDACT_PATHS: string[] = [
    // Authentication
    "password",
    "*.password",
    "newPassword",
    "*.newPassword",
    "oldPassword",
    "*.oldPassword",
    "secret",
    "*.secret",
    "token",
    "*.token",
    "accessToken",
    "*.accessToken",
    "refreshToken",
    "*.refreshToken",
    "apiKey",
    "*.apiKey",
    "privateKey",
    "*.privateKey",
    
    // Headers
    "headers.authorization",
    "headers.cookie",
    "headers.x-api-key",
    "req.headers.authorization",
    "req.headers.cookie",
    "req.headers.x-api-key",
    
    // Personal Information
    "email",
    "*.email",
    "phone",
    "*.phone",
    "ssn",
    "*.ssn",
    "creditCard",
    "*.creditCard",
    "cardNumber",
    "*.cardNumber",
    "cvv",
    "*.cvv",
    
    // Wallet/Crypto
    "seed",
    "*.seed",
    "mnemonic",
    "*.mnemonic",
    "signerKey",
    "*.signerKey",
    
    // Database
    "connectionString",
    "*.connectionString",
    "databaseUrl",
    "*.databaseUrl",
];

/**
 * Patterns that indicate sensitive data
 * Used for runtime scanning of log payloads
 */
const SENSITIVE_PATTERNS: RegExp[] = [
    // JWT tokens
    /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*/g,
    
    // API keys (common formats)
    /sk_[a-zA-Z0-9]{20,}/g, // Stripe secret keys
    /pk_[a-zA-Z0-9]{20,}/g, // Stripe public keys
    /xox[baprs]-[a-zA-Z0-9-]+/g, // Slack tokens
    
    // Credit card numbers (basic pattern)
    /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    
    // Email addresses
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    
    // Private keys (hex)
    /0x[a-fA-F0-9]{64}/g,
    
    // IP addresses (for anonymization)
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    
    // Base64 encoded data (potential secrets)
    // Be careful with this one - only apply in specific contexts
    /[A-Za-z0-9+/]{40,}={0,2}/g,
];

/**
 * Keys that should trigger redaction when found
 */
const SENSITIVE_KEYS = new Set([
    "password",
    "passwd",
    "secret",
    "token",
    "apikey",
    "api_key",
    "apiKey",
    "auth",
    "authorization",
    "bearer",
    "credential",
    "credentials",
    "private",
    "privatekey",
    "private_key",
    "privateKey",
    "seed",
    "mnemonic",
    "ssn",
    "creditcard",
    "credit_card",
    "creditCard",
    "cardnumber",
    "card_number",
    "cardNumber",
    "cvv",
    "cvc",
    "pin",
    "accesstoken",
    "access_token",
    "accessToken",
    "refreshtoken",
    "refresh_token",
    "refreshToken",
]);

/**
 * Redact sensitive data from an object recursively
 * 
 * SRE Notes:
 * - Deep clones the object to avoid mutating the original
 * - Handles nested objects and arrays
 * - Preserves structure for debugging while hiding values
 * 
 * @param obj - Object to redact
 * @param depth - Current recursion depth (prevents stack overflow)
 * @returns Redacted copy of the object
 */
export function redactSensitiveData<T>(obj: T, depth = 0): T {
    // Prevent infinite recursion
    if (depth > 10) {
        return "[MAX_DEPTH]" as unknown as T;
    }

    // Handle null/undefined
    if (obj === null || obj === undefined) {
        return obj;
    }

    // Handle primitives
    if (typeof obj !== "object") {
        if (typeof obj === "string") {
            return redactString(obj) as unknown as T;
        }
        return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
        return obj.map(item => redactSensitiveData(item, depth + 1)) as unknown as T;
    }

    // Handle objects
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const lowerKey = key.toLowerCase();
        
        // Check if key indicates sensitive data
        if (SENSITIVE_KEYS.has(lowerKey)) {
            result[key] = "[REDACTED]";
        } else if (typeof value === "string") {
            result[key] = redactString(value);
        } else if (typeof value === "object" && value !== null) {
            result[key] = redactSensitiveData(value, depth + 1);
        } else {
            result[key] = value;
        }
    }

    return result as T;
}

/**
 * Redact sensitive patterns from a string
 * 
 * @param str - String to scan and redact
 * @returns String with sensitive patterns replaced
 */
export function redactString(str: string): string {
    if (!str || typeof str !== "string") {
        return str;
    }

    let result = str;

    // Apply pattern-based redaction
    for (const pattern of SENSITIVE_PATTERNS) {
        // Reset regex state
        pattern.lastIndex = 0;
        
        if (pattern.test(str)) {
            // Reset again for replace
            pattern.lastIndex = 0;
            result = result.replace(pattern, "[REDACTED]");
        }
    }

    return result;
}

/**
 * Anonymize an IP address (keep first two octets)
 * GDPR-compliant approach to IP logging
 * 
 * @param ip - IP address to anonymize
 * @returns Anonymized IP address
 */
export function anonymizeIp(ip: string): string {
    if (!ip) return ip;
    
    // IPv4
    const ipv4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
        return `${ipv4Match[1]}.${ipv4Match[2]}.0.0`;
    }
    
    // IPv6 - keep first 4 groups
    const ipv6Match = ip.match(/^([0-9a-fA-F:]+)$/);
    if (ipv6Match) {
        const parts = ip.split(":");
        if (parts.length >= 4) {
            return parts.slice(0, 4).join(":") + "::";
        }
    }
    
    return "[ANONYMIZED]";
}

/**
 * Hash a user identifier for privacy while maintaining correlation
 * 
 * @param userId - User identifier to hash
 * @returns Hashed user ID
 */
export function hashUserId(userId: string): string {
    if (!userId) return userId;
    
    // Simple hash for correlation without revealing actual ID
    // In production, consider using a proper HMAC with a secret
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        const char = userId.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return `user_${Math.abs(hash).toString(36)}`;
}

/**
 * Truncate a string for logging (useful for large payloads)
 * 
 * @param str - String to truncate
 * @param maxLength - Maximum length (default 1000)
 * @returns Truncated string with indicator
 */
export function truncateForLog(str: string, maxLength = 1000): string {
    if (!str || str.length <= maxLength) {
        return str;
    }
    return `${str.substring(0, maxLength)}... [TRUNCATED ${str.length - maxLength} chars]`;
}

/**
 * Safe JSON stringify that handles circular references
 * 
 * @param obj - Object to stringify
 * @param maxDepth - Maximum depth to traverse
 * @returns JSON string or error message
 */
export function safeStringify(obj: unknown, maxDepth = 5): string {
    const seen = new WeakSet();
    
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
                return "[Circular]";
            }
            seen.add(value);
        }
        return value;
    });
}
