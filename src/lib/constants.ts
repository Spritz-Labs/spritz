/**
 * Application Constants
 * 
 * Centralized location for all magic numbers and configuration values.
 * This makes it easier to maintain and audit the codebase.
 */

// ============================================================================
// AUTHENTICATION & SESSION
// ============================================================================

/** Session duration in seconds (7 days) */
export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;

/** Frontend session token duration in seconds (30 days) */
export const FRONTEND_TOKEN_DURATION_SECONDS = 30 * 24 * 60 * 60;

/** Recovery token duration in seconds (15 minutes) */
export const RECOVERY_TOKEN_DURATION_SECONDS = 15 * 60;

/** Auth credentials TTL in milliseconds (7 days) */
export const AUTH_CREDENTIALS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Nonce expiry in seconds (5 minutes) */
export const NONCE_EXPIRY_SECONDS = 300;

/** Passkey challenge expiry in minutes */
export const PASSKEY_CHALLENGE_EXPIRY_MINUTES = 5;

/** Rescue token expiry in minutes */
export const RESCUE_TOKEN_EXPIRY_MINUTES = 10;

// ============================================================================
// RATE LIMITING
// ============================================================================

/** Auth endpoint rate limit (requests per minute) */
export const RATE_LIMIT_AUTH = 10;

/** Contact form rate limit (requests per minute) */
export const RATE_LIMIT_CONTACT = 3;

/** AI chat rate limit (requests per minute) */
export const RATE_LIMIT_AI = 30;

/** Messaging rate limit (requests per minute) */
export const RATE_LIMIT_MESSAGING = 60;

/** General API rate limit (requests per minute) */
export const RATE_LIMIT_GENERAL = 100;

/** Strict rate limit for sensitive operations (requests per minute) */
export const RATE_LIMIT_STRICT = 5;

/** Rescue flow rate limit per address (attempts per hour) */
export const RATE_LIMIT_RESCUE_PER_ADDRESS = 3;

// ============================================================================
// CACHING
// ============================================================================

/** ENS cache TTL in milliseconds (5 minutes) */
export const ENS_CACHE_TTL_MS = 5 * 60 * 1000;

/** ENS cache maximum entries */
export const ENS_CACHE_MAX_ENTRIES = 1000;

/** ETH price cache TTL in milliseconds (1 minute) */
export const ETH_PRICE_CACHE_TTL_MS = 60 * 1000;

// ============================================================================
// VAULT & MULTI-SIG
// ============================================================================

/** Maximum vault members */
export const VAULT_MAX_MEMBERS = 10;

/** Minimum vault threshold */
export const VAULT_MIN_THRESHOLD = 1;

/** Maximum vault name length */
export const VAULT_NAME_MAX_LENGTH = 100;

/** Maximum vault description length */
export const VAULT_DESCRIPTION_MAX_LENGTH = 500;

// ============================================================================
// INPUT VALIDATION
// ============================================================================

/** Maximum short text length (names, titles) */
export const INPUT_MAX_SHORT_TEXT = 100;

/** Maximum medium text length (descriptions, bios) */
export const INPUT_MAX_MEDIUM_TEXT = 500;

/** Maximum long text length (comments, inquiries) */
export const INPUT_MAX_LONG_TEXT = 5000;

/** Maximum message length */
export const INPUT_MAX_MESSAGE = 10000;

/** Username max length */
export const INPUT_MAX_USERNAME = 30;

/** Email max length */
export const INPUT_MAX_EMAIL = 254;

/** Wallet address max length */
export const INPUT_MAX_WALLET_ADDRESS = 66;

/** URL max length */
export const INPUT_MAX_URL = 2048;

/** Verification code length */
export const INPUT_MAX_CODE = 10;

/** Maximum array items */
export const INPUT_MAX_ARRAY_ITEMS = 100;

/** Maximum tags */
export const INPUT_MAX_TAGS = 10;

// ============================================================================
// BLOCKCHAIN
// ============================================================================

/** Supported chain IDs */
export const SUPPORTED_CHAIN_IDS = [1, 8453, 42161, 10, 137, 56, 130, 43114] as const;

/** Default chain ID (Base) */
export const DEFAULT_CHAIN_ID = 8453;

/** Gas estimation buffer percentage */
export const GAS_BUFFER_PERCENTAGE = 20;

/** Safe singleton version */
export const SAFE_VERSION = "1.4.1";

// ============================================================================
// WEBAUTHN
// ============================================================================

/** WebAuthn timeout in milliseconds */
export const WEBAUTHN_TIMEOUT_MS = 120000;

/** WebAuthn verification gas limit */
export const WEBAUTHN_VERIFICATION_GAS_LIMIT = BigInt(800000);

/** WebAuthn call gas limit */
export const WEBAUTHN_CALL_GAS_LIMIT = BigInt(200000);

/** WebAuthn pre-verification gas */
export const WEBAUTHN_PRE_VERIFICATION_GAS = BigInt(100000);

// ============================================================================
// RETRY & TIMEOUT
// ============================================================================

/** Maximum retry attempts */
export const MAX_RETRY_ATTEMPTS = 3;

/** Retry delay base in milliseconds */
export const RETRY_DELAY_BASE_MS = 1000;

/** HTTP request timeout in milliseconds */
export const HTTP_TIMEOUT_MS = 30000;
