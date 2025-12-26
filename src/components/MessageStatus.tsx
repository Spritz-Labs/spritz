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
    return (
        <span className={`inline-flex items-center ${className}`}>
            {/* Pending/Sending - pulsing circle */}
            {(status === "pending" || status === "sending") && (
                <svg
                    className="w-3.5 h-3.5 text-zinc-500 animate-pulse"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                </svg>
            )}
            {/* Failed - warning icon */}
            {status === "failed" && (
                <svg
                    className="w-3.5 h-3.5 text-red-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            )}
            {/* Sent/Delivered - single checkmark */}
            {(status === "sent" || status === "delivered") && (
                <svg
                    className="w-3.5 h-3.5 text-zinc-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            )}
            {/* Read - double checkmarks (orange) */}
            {status === "read" && (
                <span className="relative inline-flex">
                    <svg
                        className="w-3.5 h-3.5 text-[#FF5500]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <svg
                        className="w-3.5 h-3.5 text-[#FF5500] -ml-2"
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

// E2E Encryption indicator
export function EncryptionIndicator() {
    return (
        <div className="flex items-center justify-center gap-1.5 py-2 text-xs text-zinc-500">
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
            <span>Messages are end-to-end encrypted</span>
        </div>
    );
}

