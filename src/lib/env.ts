/**
 * Environment Variable Validation
 * 
 * SRE-018 FIX: Validates required environment variables at startup
 * to fail fast rather than encountering runtime errors.
 * 
 * Usage:
 * - Import this module early in your application
 * - It will throw an error if required variables are missing
 * - Optional variables will be logged as warnings
 */

import { createLogger } from "@/lib/logger";

const log = createLogger("Env");

// ============================================================================
// Environment Variable Schema
// ============================================================================

interface EnvConfig {
    // Required variables - app won't function without these
    required: {
        server: string[];  // Only available server-side
        client: string[];  // Available both client and server (NEXT_PUBLIC_)
    };
    // Optional variables - app can function without these but with reduced features
    optional: {
        server: string[];
        client: string[];
    };
}

const envConfig: EnvConfig = {
    required: {
        server: [
            // Core database
            "SUPABASE_SERVICE_ROLE_KEY",
            // Session security
            // Note: SESSION_SECRET or NEXTAUTH_SECRET - at least one required
        ],
        client: [
            // Core services
            "NEXT_PUBLIC_SUPABASE_URL",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        ],
    },
    optional: {
        server: [
            // Session (one of these required)
            "SESSION_SECRET",
            "NEXTAUTH_SECRET",
            // Redis for rate limiting
            "UPSTASH_REDIS_REST_URL",
            "UPSTASH_REDIS_REST_TOKEN",
            // Google Calendar
            "GOOGLE_CLIENT_ID",
            "GOOGLE_CLIENT_SECRET",
            "GOOGLE_REDIRECT_URI",
            // Video/Audio
            "HUDDLE01_API_KEY",
            "AGORA_APP_ID",
            "AGORA_APP_CERTIFICATE",
            // Streaming
            "LIVEPEER_API_KEY",
            // AI
            "OPENAI_API_KEY",
            "ANTHROPIC_API_KEY",
            // Pimlico bundler
            "PIMLICO_API_KEY",
            // World ID
            "WORLDCOIN_APP_ID",
            // Admin
            "ADMIN_ADDRESSES",
        ],
        client: [
            // Web3
            "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
            "NEXT_PUBLIC_PIMLICO_API_KEY",
            // WebAuthn
            "NEXT_PUBLIC_WEBAUTHN_RP_ID",
            // App URL
            "NEXT_PUBLIC_APP_URL",
            // World ID
            "NEXT_PUBLIC_WORLDCOIN_APP_ID",
        ],
    },
};

// ============================================================================
// Validation Functions
// ============================================================================

interface ValidationResult {
    isValid: boolean;
    missingRequired: string[];
    missingOptional: string[];
    warnings: string[];
}

/**
 * Validate environment variables
 * Call this at application startup
 */
export function validateEnv(): ValidationResult {
    const missingRequired: string[] = [];
    const missingOptional: string[] = [];
    const warnings: string[] = [];

    // Check server-side only on server
    if (typeof window === "undefined") {
        // Check required server variables
        for (const key of envConfig.required.server) {
            if (!process.env[key]) {
                missingRequired.push(key);
            }
        }

        // Check optional server variables
        for (const key of envConfig.optional.server) {
            if (!process.env[key]) {
                missingOptional.push(key);
            }
        }

        // Special check: either SESSION_SECRET or NEXTAUTH_SECRET must exist
        if (!process.env.SESSION_SECRET && !process.env.NEXTAUTH_SECRET) {
            if (process.env.NODE_ENV === "production") {
                missingRequired.push("SESSION_SECRET or NEXTAUTH_SECRET");
            } else {
                warnings.push("SESSION_SECRET not set - using insecure default for development");
            }
        }

        // Check rate limiting
        if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
            warnings.push("Redis not configured - rate limiting will be disabled");
        }
    }

    // Check client variables (available on both client and server)
    for (const key of envConfig.required.client) {
        if (!process.env[key]) {
            missingRequired.push(key);
        }
    }

    for (const key of envConfig.optional.client) {
        if (!process.env[key]) {
            missingOptional.push(key);
        }
    }

    const isValid = missingRequired.length === 0;

    return {
        isValid,
        missingRequired,
        missingOptional,
        warnings,
    };
}

/**
 * Validate and log environment status
 * Throws in production if required variables are missing
 */
export function assertEnv(): void {
    const result = validateEnv();

    // Log warnings
    for (const warning of result.warnings) {
        log.warn(warning);
    }

    // Log missing optional variables (debug level)
    if (result.missingOptional.length > 0) {
        log.debug("Optional env vars not set:", result.missingOptional.join(", "));
    }

    // Handle missing required variables
    if (!result.isValid) {
        const errorMsg = `Missing required environment variables: ${result.missingRequired.join(", ")}`;
        
        if (process.env.NODE_ENV === "production") {
            log.error(errorMsg);
            throw new Error(`CRITICAL: ${errorMsg}`);
        } else {
            log.warn(`Development mode: ${errorMsg}`);
        }
    }
}

/**
 * Get a typed environment variable with fallback
 */
export function getEnv(key: string, fallback?: string): string {
    const value = process.env[key];
    if (value !== undefined) return value;
    if (fallback !== undefined) return fallback;
    throw new Error(`Environment variable ${key} is not set and no fallback provided`);
}

/**
 * Get a boolean environment variable
 */
export function getEnvBool(key: string, fallback = false): boolean {
    const value = process.env[key];
    if (value === undefined) return fallback;
    return value.toLowerCase() === "true" || value === "1";
}

/**
 * Get a numeric environment variable
 */
export function getEnvNumber(key: string, fallback?: number): number {
    const value = process.env[key];
    if (value === undefined) {
        if (fallback !== undefined) return fallback;
        throw new Error(`Environment variable ${key} is not set and no fallback provided`);
    }
    const num = parseInt(value, 10);
    if (isNaN(num)) {
        throw new Error(`Environment variable ${key} is not a valid number: ${value}`);
    }
    return num;
}

// ============================================================================
// Auto-validate on module load (server-side only)
// ============================================================================

if (typeof window === "undefined") {
    // Only validate once per process
    const validated = (global as unknown as { __envValidated?: boolean }).__envValidated;
    if (!validated) {
        (global as unknown as { __envValidated: boolean }).__envValidated = true;
        
        // Run validation in next tick to allow all env vars to be loaded
        setImmediate(() => {
            try {
                assertEnv();
            } catch (error) {
                // In production, this will throw and crash the process (intended behavior)
                // In development, we just log the warning
                if (process.env.NODE_ENV === "production") {
                    throw error;
                }
            }
        });
    }
}
