/**
 * Error Logging Utility
 * 
 * Captures critical errors (Safe transactions, passkey signing, etc.)
 * and stores them in the database for admin review.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export type ErrorType = 
    | "safe_transaction"
    | "passkey_signing"
    | "passkey_registration"
    | "wallet_connect"
    | "wallet_send"
    | "vault_transaction"
    | "api_error"
    | "other";

export interface ErrorLogContext {
    // User info
    userAddress?: string;
    userEmail?: string;
    
    // Safe/wallet specific
    safeAddress?: string;
    chainId?: number;
    transactionHash?: string;
    
    // Passkey specific
    credentialId?: string;
    rpId?: string;
    publicKeyX?: string;
    publicKeyY?: string;
    
    // WebAuthn details
    authenticatorData?: string;
    clientDataJSON?: string;
    signatureHex?: string;
    
    // Request context
    requestPath?: string;
    requestMethod?: string;
    userAgent?: string;
    ipAddress?: string;
    
    // Additional data
    [key: string]: unknown;
}

export interface ErrorLogInput {
    errorType: ErrorType;
    errorCode?: string;
    errorMessage: string;
    stackTrace?: string;
    context?: ErrorLogContext;
}

/**
 * Extract Safe error code from error message
 * Safe errors look like: "GS026" or "0x08c379a0...4753303236..."
 */
function extractSafeErrorCode(error: Error | string): string | undefined {
    const message = typeof error === "string" ? error : error.message;
    
    // Direct GS error codes
    const gsMatch = message.match(/GS\d{3}/);
    if (gsMatch) return gsMatch[0];
    
    // Hex-encoded GS errors (0x4753303236 = GS026)
    const hexMatch = message.match(/0x[0-9a-fA-F]*4753303(\d{2})/);
    if (hexMatch) {
        const code = hexMatch[1];
        return `GS0${code}`;
    }
    
    // Try to decode from full revert reason
    if (message.includes("0x08c379a0")) {
        // Standard Error(string) revert
        // Look for "GS" pattern in ASCII
        const asciiMatch = message.match(/47533\d{4}/);
        if (asciiMatch) {
            // Convert hex to ASCII: 4753 = GS, then 30XX for numbers
            try {
                const hex = asciiMatch[0];
                const ascii = Buffer.from(hex, "hex").toString("ascii");
                if (ascii.startsWith("GS")) return ascii;
            } catch {
                // Ignore parsing errors
            }
        }
    }
    
    return undefined;
}

/**
 * Log an error to the database
 */
export async function logError(input: ErrorLogInput): Promise<string | null> {
    if (!supabase) {
        console.error("[ErrorLogger] Supabase not configured, logging to console only");
        console.error("[ErrorLogger]", JSON.stringify(input, null, 2));
        return null;
    }
    
    try {
        const { data, error } = await supabase
            .from("shout_error_logs")
            .insert({
                error_type: input.errorType,
                error_code: input.errorCode,
                error_message: input.errorMessage.slice(0, 10000), // Limit size
                stack_trace: input.stackTrace?.slice(0, 50000),
                user_address: input.context?.userAddress?.toLowerCase(),
                user_email: input.context?.userEmail,
                request_path: input.context?.requestPath,
                request_method: input.context?.requestMethod,
                user_agent: input.context?.userAgent,
                ip_address: input.context?.ipAddress,
                context: input.context || {},
            })
            .select("id")
            .single();
        
        if (error) {
            console.error("[ErrorLogger] Failed to log error:", error);
            // Still log to console as fallback
            console.error("[ErrorLogger] Original error:", JSON.stringify(input, null, 2));
            return null;
        }
        
        console.log("[ErrorLogger] Logged error:", data.id, input.errorType, input.errorCode || "");
        return data.id;
    } catch (err) {
        console.error("[ErrorLogger] Exception while logging:", err);
        console.error("[ErrorLogger] Original error:", JSON.stringify(input, null, 2));
        return null;
    }
}

/**
 * Log a Safe transaction error with full context
 */
export async function logSafeTransactionError(
    error: Error | string,
    context: ErrorLogContext
): Promise<string | null> {
    const message = typeof error === "string" ? error : error.message;
    const stack = typeof error === "string" ? undefined : error.stack;
    const errorCode = extractSafeErrorCode(error);
    
    return logError({
        errorType: "safe_transaction",
        errorCode,
        errorMessage: message,
        stackTrace: stack,
        context,
    });
}

/**
 * Log a passkey signing error with full context
 */
export async function logPasskeySigningError(
    error: Error | string,
    context: ErrorLogContext
): Promise<string | null> {
    const message = typeof error === "string" ? error : error.message;
    const stack = typeof error === "string" ? undefined : error.stack;
    
    // Check for common WebAuthn error codes
    let errorCode: string | undefined;
    if (message.includes("NotAllowedError")) errorCode = "WEBAUTHN_NOT_ALLOWED";
    else if (message.includes("InvalidStateError")) errorCode = "WEBAUTHN_INVALID_STATE";
    else if (message.includes("AbortError")) errorCode = "WEBAUTHN_ABORTED";
    else if (message.includes("SecurityError")) errorCode = "WEBAUTHN_SECURITY_ERROR";
    else if (message.includes("NotSupportedError")) errorCode = "WEBAUTHN_NOT_SUPPORTED";
    else if (message.includes("GS0")) errorCode = extractSafeErrorCode(error);
    
    return logError({
        errorType: "passkey_signing",
        errorCode,
        errorMessage: message,
        stackTrace: stack,
        context,
    });
}

/**
 * Log a vault transaction error
 */
export async function logVaultTransactionError(
    error: Error | string,
    context: ErrorLogContext
): Promise<string | null> {
    const message = typeof error === "string" ? error : error.message;
    const stack = typeof error === "string" ? undefined : error.stack;
    const errorCode = extractSafeErrorCode(error);
    
    return logError({
        errorType: "vault_transaction",
        errorCode,
        errorMessage: message,
        stackTrace: stack,
        context,
    });
}

/**
 * Log a wallet send error
 */
export async function logWalletSendError(
    error: Error | string,
    context: ErrorLogContext
): Promise<string | null> {
    const message = typeof error === "string" ? error : error.message;
    const stack = typeof error === "string" ? undefined : error.stack;
    
    return logError({
        errorType: "wallet_send",
        errorMessage: message,
        stackTrace: stack,
        context,
    });
}

/**
 * Client-side error logging (sends to API)
 */
export async function logErrorFromClient(input: ErrorLogInput): Promise<boolean> {
    try {
        const response = await fetch("/api/admin/error-log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
            credentials: "include",
        });
        return response.ok;
    } catch {
        console.error("[ErrorLogger] Failed to send error to server:", input);
        return false;
    }
}
