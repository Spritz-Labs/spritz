"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";

// Kevin's wallet address for friend requests
const KEVIN_ADDRESS = "0x89480c2E67876650b48622907ff5C48A569a36C7";

type WelcomeModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSendFriendRequest: (address: string) => Promise<boolean>;
    userAddress: string;
};

export function WelcomeModal({
    isOpen,
    onClose,
    onSendFriendRequest,
    userAddress,
}: WelcomeModalProps) {
    const [isSending, setIsSending] = useState(false);
    const [requestSent, setRequestSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSendRequest = async () => {
        if (isSending || requestSent) return;
        
        // Don't let Kevin send himself a friend request
        if (userAddress.toLowerCase() === KEVIN_ADDRESS.toLowerCase()) {
            onClose();
            return;
        }

        setIsSending(true);
        setError(null);

        try {
            const success = await onSendFriendRequest(KEVIN_ADDRESS);
            if (success) {
                setRequestSent(true);
            } else {
                setError("Already friends or request pending!");
            }
        } catch (err) {
            setError("Failed to send request");
        } finally {
            setIsSending(false);
        }
    };

    if (!isOpen || typeof document === "undefined") return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="w-full max-w-md bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header with avatar */}
                        <div className="relative bg-gradient-to-br from-[#FF5500] to-[#FF7733] p-6 pb-16">
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                            >
                                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                            <h2 className="text-white text-xl font-bold">Welcome to Spritz! 🎉</h2>
                        </div>

                        {/* Kevin's avatar floating */}
                        <div className="relative -mt-10 flex justify-center">
                            <div className="w-20 h-20 rounded-2xl bg-zinc-800 border-4 border-zinc-900 flex items-center justify-center text-4xl shadow-lg">
                                👨‍💻
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-6 pt-4 text-center">
                            <p className="text-zinc-300 text-base leading-relaxed mb-6">
                                Hey, its Kevin from Spritz! 😎 Thanks so much for joining and I hope you love the app! I am here if you need anything, just drop me a friend request below. 🍊
                            </p>

                            {error && (
                                <p className="text-amber-400 text-sm mb-4">{error}</p>
                            )}

                            {requestSent ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-center gap-2 text-emerald-400">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span className="font-medium">Friend request sent!</span>
                                    </div>
                                    <button
                                        onClick={onClose}
                                        className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-xl transition-colors"
                                    >
                                        Let&apos;s Go!
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <button
                                        onClick={handleSendRequest}
                                        disabled={isSending}
                                        className="w-full py-3 bg-[#FF5500] hover:bg-[#FF6600] disabled:opacity-50 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                                    >
                                        {isSending ? (
                                            <>
                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                <span>Sending...</span>
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                                </svg>
                                                <span>Add Kevin as Friend</span>
                                            </>
                                        )}
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="w-full py-3 text-zinc-400 hover:text-white font-medium transition-colors"
                                    >
                                        Maybe Later
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
