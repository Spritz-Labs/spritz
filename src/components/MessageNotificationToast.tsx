"use client";

import { motion, AnimatePresence } from "motion/react";

export interface ToastData {
    sender: string;
    message: string;
}

interface MessageNotificationToastProps {
    toast: ToastData | null;
    onDismiss: () => void;
    onTap: (sender: string) => void;
}

export function MessageNotificationToast({
    toast,
    onDismiss,
    onTap,
}: MessageNotificationToastProps) {
    return (
        <AnimatePresence>
            {toast && (
                <motion.div
                    initial={{ opacity: 0, y: 50, x: "-50%" }}
                    animate={{ opacity: 1, y: 0, x: "-50%" }}
                    exit={{ opacity: 0, y: 50, x: "-50%" }}
                    className="fixed bottom-6 left-1/2 z-50"
                >
                    <div
                        onClick={() => {
                            onTap(toast.sender);
                            onDismiss();
                        }}
                        className="bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-4 shadow-2xl cursor-pointer hover:bg-zinc-750 transition-colors flex items-center gap-4 max-w-sm"
                    >
                        <div className="w-10 h-10 rounded-full bg-[#FF5500] flex items-center justify-center shrink-0">
                            <svg
                                className="w-5 h-5 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                />
                            </svg>
                        </div>
                        <div className="min-w-0">
                            <p className="text-white font-medium truncate">{toast.sender}</p>
                            <p className="text-zinc-400 text-sm truncate">{toast.message}</p>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDismiss();
                            }}
                            className="shrink-0 text-zinc-500 hover:text-white transition-colors"
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
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
