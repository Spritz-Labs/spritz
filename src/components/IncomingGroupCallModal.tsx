"use client";

import { motion } from "motion/react";
import type { GroupCall } from "@/hooks/useGroupCallSignaling";

interface IncomingGroupCallModalProps {
    call: GroupCall;
    onJoin: () => void;
    onDismiss: () => void;
}

export function IncomingGroupCallModal({
    call,
    onJoin,
    onDismiss,
}: IncomingGroupCallModalProps) {
    const formatAddress = (address: string) =>
        `${address.slice(0, 6)}...${address.slice(-4)}`;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        >
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-sm w-full mx-4 text-center"
            >
                {/* Animated Group Icon */}
                <div className="relative w-24 h-24 mx-auto mb-6">
                    <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className={`absolute inset-0 rounded-full ${
                            call.isVideo
                                ? "bg-[#FB8D22]/20"
                                : "bg-emerald-500/20"
                        }`}
                    />
                    <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{
                            repeat: Infinity,
                            duration: 2,
                            delay: 0.2,
                        }}
                        className={`absolute inset-2 rounded-full ${
                            call.isVideo
                                ? "bg-[#FB8D22]/30"
                                : "bg-emerald-500/30"
                        }`}
                    />
                    <div
                        className={`absolute inset-4 rounded-full flex items-center justify-center ${
                            call.isVideo
                                ? "bg-gradient-to-br from-[#FB8D22] to-[#FF5500]"
                                : "bg-gradient-to-br from-emerald-500 to-green-500"
                        }`}
                    >
                        {call.isVideo ? (
                            <svg
                                className="w-8 h-8 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                            </svg>
                        ) : (
                            <svg
                                className="w-8 h-8 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                />
                            </svg>
                        )}
                    </div>
                </div>

                {/* Group Info */}
                <h2 className="text-2xl font-bold text-white mb-2">
                    {call.groupName}
                </h2>
                <p className="text-zinc-400 mb-2">
                    {call.isVideo ? "Video call" : "Voice call"} started
                </p>
                <p className="text-zinc-500 text-sm mb-6">
                    Started by {formatAddress(call.startedBy)}
                    {call.participantCount > 1 && (
                        <>
                            {" "}
                            • {call.participantCount} participant
                            {call.participantCount !== 1 ? "s" : ""}
                        </>
                    )}
                </p>

                {/* Actions */}
                <div className="flex gap-4">
                    <button
                        onClick={onDismiss}
                        className="flex-1 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors"
                    >
                        Dismiss
                    </button>
                    <button
                        onClick={onJoin}
                        className={`flex-1 py-3 px-4 rounded-xl text-white font-medium transition-colors flex items-center justify-center gap-2 ${
                            call.isVideo
                                ? "bg-[#FF5500] hover:bg-[#E04D00]"
                                : "bg-emerald-600 hover:bg-emerald-700"
                        }`}
                    >
                        <svg
                            className="w-5 h-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                            />
                        </svg>
                        Join Call
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}









