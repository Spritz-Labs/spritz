/**
 * Content sanitization utilities to prevent XSS attacks
 */

// Characters that need to be escaped in HTML
const HTML_ESCAPE_MAP: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;",
    "`": "&#x60;",
    "=": "&#x3D;",
};

/**
 * Escape HTML special characters to prevent XSS
 * Use this for user-generated content that will be displayed as text
 */
export function escapeHtml(str: string): string {
    return str.replace(/[&<>"'`=/]/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Strip all HTML tags from a string
 * Use this for content that should be plain text only
 */
export function stripHtml(str: string): string {
    return str
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "") // Remove scripts
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")   // Remove styles
        .replace(/<[^>]+>/g, "")                           // Remove all tags
        .replace(/&nbsp;/g, " ")                           // Replace nbsp
        .trim();
}

/**
 * Sanitize user input for safe storage
 * - Trims whitespace
 * - Limits length
 * - Removes null bytes and control characters
 */
export function sanitizeInput(str: string, maxLength: number = 10000): string {
    return str
        .slice(0, maxLength)
        // Remove null bytes
        .replace(/\0/g, "")
        // Remove most control characters (keep newlines, tabs)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .trim();
}

/**
 * Sanitize message content for chat messages
 * - Preserves text content
 * - Removes dangerous HTML/scripts
 * - Limits length
 */
export function sanitizeMessageContent(content: string, maxLength: number = 10000): string {
    // First strip any HTML tags (we don't allow HTML in messages)
    let sanitized = stripHtml(content);
    
    // Apply input sanitization
    sanitized = sanitizeInput(sanitized, maxLength);
    
    return sanitized;
}

/**
 * Sanitize a URL to prevent javascript: and data: attacks
 */
export function sanitizeUrl(url: string): string | null {
    try {
        const parsed = new URL(url);
        
        // Only allow http, https, and ipfs protocols
        if (!["http:", "https:", "ipfs:"].includes(parsed.protocol)) {
            return null;
        }
        
        return parsed.href;
    } catch {
        return null;
    }
}

/**
 * Validate and sanitize an email address
 */
export function sanitizeEmail(email: string): string | null {
    const trimmed = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!emailRegex.test(trimmed) || trimmed.length > 254) {
        return null;
    }
    
    return trimmed;
}

/**
 * Sanitize a username/display name
 * - Alphanumeric, underscores, hyphens only
 * - 3-30 characters
 */
export function sanitizeUsername(username: string): string | null {
    const trimmed = username.trim();
    
    // Only allow alphanumeric, underscores, and hyphens
    if (!/^[a-zA-Z0-9_-]{3,30}$/.test(trimmed)) {
        return null;
    }
    
    return trimmed.toLowerCase();
}

/**
 * Input validation helpers with length limits
 */
export const INPUT_LIMITS = {
    // General
    SHORT_TEXT: 100,      // Names, titles
    MEDIUM_TEXT: 500,     // Descriptions, bios
    LONG_TEXT: 5000,      // Comments, inquiries
    MESSAGE: 10000,       // Chat messages
    
    // Specific
    USERNAME: 30,
    EMAIL: 254,
    WALLET_ADDRESS: 66,   // 0x + 64 hex chars (or Solana ~44 chars)
    URL: 2048,
    CODE: 10,             // Invite codes, verification codes
    
    // Arrays
    MAX_ARRAY_ITEMS: 100,
    MAX_TAGS: 10,
};

/**
 * Validate string length
 */
export function validateLength(
    value: string | undefined | null, 
    maxLength: number, 
    fieldName: string
): { valid: boolean; error?: string } {
    if (!value) {
        return { valid: true }; // Let required validation handle this
    }
    
    if (value.length > maxLength) {
        return { 
            valid: false, 
            error: `${fieldName} exceeds maximum length of ${maxLength} characters` 
        };
    }
    
    return { valid: true };
}

/**
 * Validate array length
 */
export function validateArrayLength(
    arr: unknown[] | undefined | null,
    maxItems: number,
    fieldName: string
): { valid: boolean; error?: string } {
    if (!arr) {
        return { valid: true };
    }
    
    if (arr.length > maxItems) {
        return {
            valid: false,
            error: `${fieldName} exceeds maximum of ${maxItems} items`
        };
    }
    
    return { valid: true };
}

/**
 * Validate multiple fields at once
 * Returns first error found, or null if all valid
 */
export function validateInputs(validations: { valid: boolean; error?: string }[]): string | null {
    for (const v of validations) {
        if (!v.valid && v.error) {
            return v.error;
        }
    }
    return null;
}
