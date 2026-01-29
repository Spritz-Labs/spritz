"use client";

import { type MessageStatus } from "@/hooks/useChatFeatures";

type MessageStatusIndicatorProps = {
    status: MessageStatus;
    className?: string;
};

export function MessageStatusIndicator({
    status,
    className = "",
}: MessageStatusIndicatorProps) {
    // Debug: log status
    console.log("[MessageStatus] Rendering status:", status);
    
    return (
        <span className={`inline-flex items-center ${className}`}>
            {/* Pending/Sending - pulsing circle */}
            {(status === "pending" || status === "sending") && (
                <svg
                    className="w-4 h-4 text-white/60 animate-pulse"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                </svg>
            )}
            {/* Failed - warning icon */}
            {status === "failed" && (
                <svg
                    className="w-4 h-4 text-red-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            )}
            {/* Sent/Delivered - single checkmark (white for visibility on orange) */}
            {(status === "sent" || status === "delivered") && (
                <svg
                    className="w-4 h-4 text-white/80"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            )}
            {/* Read - double checkmarks (white for visibility) */}
            {status === "read" && (
                <span className="relative inline-flex">
                    <svg
                        className="w-4 h-4 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <svg
                        className="w-4 h-4 text-white -ml-2"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                </span>
            )}
        </span>
    );
}

// Typing indicator component
type TypingIndicatorProps = {
    name?: string;
};

export function TypingIndicator({ name }: TypingIndicatorProps) {
    return (
        <div className="flex items-center gap-2 px-4 py-2">
            <div className="flex gap-1">
                <span
                    className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                />
                <span
                    className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                />
                <span
                    className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                />
            </div>
            <span className="text-xs text-zinc-500">
                {name ? `${name} is typing...` : "Typing..."}
            </span>
        </div>
    );
}

// E2E Encryption indicator with security status
type EncryptionIndicatorProps = {
    /** Whether the conversation uses secure ECDH key exchange */
    isSecure?: boolean;
    /** Loading state while checking security */
    isLoading?: boolean;
};

export function EncryptionIndicator({ isSecure, isLoading }: EncryptionIndicatorProps = {}) {
    // If loading, show loading state
    if (isLoading) {
        return (
            <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-zinc-500">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Checking encryption...</span>
            </div>
        );
    }

    // Secure ECDH key exchange active
    if (isSecure === true) {
        return (
            <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-emerald-500">
                <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                </svg>
                <span>Secure key exchange active</span>
            </div>
        );
    }
    
    // Legacy encryption (or not yet determined) - still encrypted, still green!
    if (isSecure === false) {
        return (
            <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-emerald-500">
                <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                </svg>
                <span>Encrypted</span>
            </div>
        );
    }
    
    // Default state - encrypted but status unknown - still green
    return (
        <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-emerald-500">
            <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
            </svg>
            <span>Encrypted</span>
        </div>
    );
}

