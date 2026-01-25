"use client";

import { motion } from "framer-motion";

type MessageDeliveryStatusProps = {
    status: "sending" | "sent" | "delivered" | "read" | "failed";
    timestamp?: Date;
    readBy?: string[]; // For group chats: list of user names who read it
    showTimestamp?: boolean;
    className?: string;
};

export function MessageDeliveryStatus({
    status,
    timestamp,
    readBy = [],
    showTimestamp = true,
    className = "",
}: MessageDeliveryStatusProps) {
    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    return (
        <div className={`flex items-center gap-1 text-xs ${className}`}>
            {showTimestamp && timestamp && (
                <span className="text-zinc-500">{formatTime(timestamp)}</span>
            )}
            
            <DeliveryStatusIcon status={status} />
            
            {/* Show read count for groups */}
            {status === "read" && readBy.length > 0 && (
                <span className="text-zinc-500 ml-0.5">
                    {readBy.length === 1 
                        ? `Seen` 
                        : `Seen by ${readBy.length}`}
                </span>
            )}
        </div>
    );
}

function DeliveryStatusIcon({ status }: { status: MessageDeliveryStatusProps["status"] }) {
    switch (status) {
        case "sending":
            return (
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-3.5 h-3.5 border border-zinc-500 border-t-transparent rounded-full"
                />
            );
        
        case "sent":
            // Single checkmark
            return (
                <motion.svg
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-4 h-4 text-zinc-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                    />
                </motion.svg>
            );
        
        case "delivered":
            // Double checkmark (gray)
            return (
                <motion.svg
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-5 h-4 text-zinc-500"
                    viewBox="0 0 28 24"
                    fill="none"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2 13l4 4L16 7"
                    />
                    <motion.path
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ delay: 0.2 }}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 13l4 4L22 7"
                    />
                </motion.svg>
            );
        
        case "read":
            // Double checkmark (blue)
            return (
                <motion.svg
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-5 h-4 text-blue-400"
                    viewBox="0 0 28 24"
                    fill="none"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2 13l4 4L16 7"
                    />
                    <motion.path
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ delay: 0.1 }}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 13l4 4L22 7"
                    />
                </motion.svg>
            );
        
        case "failed":
            return (
                <motion.svg
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-4 h-4 text-red-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                </motion.svg>
            );
        
        default:
            return null;
    }
}

// Compact version for message bubbles
export function MessageDeliveryStatusCompact({
    status,
    className = "",
}: {
    status: MessageDeliveryStatusProps["status"];
    className?: string;
}) {
    return (
        <div className={`inline-flex items-center ${className}`}>
            <DeliveryStatusIcon status={status} />
        </div>
    );
}
