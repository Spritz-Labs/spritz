"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { startRegistration } from "@simplewebauthn/browser";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    onSkip: () => void;
    userAddress: string;
};

export function PasskeyPromptModal({ isOpen, onClose, onSkip, userAddress }: Props) {
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleCreatePasskey = async () => {
        try {
            setIsCreating(true);
            setError(null);

            // Get registration options
            const optionsResponse = await fetch("/api/passkey/register/options", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAddress,
                    displayName: "Spritz User",
                }),
                credentials: "include",
            });

            if (!optionsResponse.ok) {
                const errData = await optionsResponse.json();
                throw new Error(errData.error || "Failed to get registration options");
            }

            const { options } = await optionsResponse.json();

            // Create credential
            const credential = await startRegistration({ optionsJSON: options });

            // Verify and store
            const verifyResponse = await fetch("/api/passkey/register/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAddress,
                    displayName: "Spritz User",
                    credential,
                    challenge: options.challenge,
                }),
                credentials: "include",
            });

            if (!verifyResponse.ok) {
                const errData = await verifyResponse.json();
                throw new Error(errData.error || "Failed to verify registration");
            }

            setSuccess(true);
            
            // Auto-close after success
            setTimeout(() => {
                onClose();
            }, 2000);
        } catch (err) {
            console.error("[PasskeyPrompt] Error creating passkey:", err);
            setError(err instanceof Error ? err.message : "Failed to create passkey");
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
                        onClick={onSkip}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md z-[60]"
                    >
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
                            {/* Header with gradient */}
                            <div className="relative p-6 pb-4 bg-gradient-to-br from-[#FF5500]/20 to-transparent">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-[#FF5500]/20 flex items-center justify-center">
                                            <svg
                                                className="w-6 h-6 text-[#FF5500]"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                                                />
                                            </svg>
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-white">
                                                Enable Smart Wallet
                                            </h2>
                                            <p className="text-zinc-400 text-sm">
                                                One more step
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={onSkip}
                                        className="w-8 h-8 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                                    >
                                        <svg
                                            className="w-4 h-4"
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
                            </div>

                            {/* Content */}
                            <div className="p-6 pt-2">
                                {success ? (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="text-center py-4"
                                    >
                                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                            <svg
                                                className="w-8 h-8 text-emerald-400"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M5 13l4 4L19 7"
                                                />
                                            </svg>
                                        </div>
                                        <h3 className="text-lg font-semibold text-white mb-1">
                                            Passkey Created!
                                        </h3>
                                        <p className="text-zinc-400 text-sm">
                                            Your Spritz Smart Wallet is ready
                                        </p>
                                    </motion.div>
                                ) : (
                                    <>
                                        <p className="text-zinc-300 text-sm mb-4">
                                            Create a passkey to unlock your <strong className="text-white">Spritz Smart Wallet</strong> - 
                                            a non-custodial crypto wallet you can use to receive payments and tips.
                                        </p>

                                        {/* Benefits */}
                                        <div className="space-y-3 mb-6">
                                            <div className="flex items-start gap-3">
                                                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <p className="text-white text-sm font-medium">Receive crypto on 7 chains</p>
                                                    <p className="text-zinc-500 text-xs">Same address on Ethereum, Base, Arbitrum & more</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <p className="text-white text-sm font-medium">Sign with Face ID or fingerprint</p>
                                                    <p className="text-zinc-500 text-xs">No seed phrases or extensions needed</p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <p className="text-white text-sm font-medium">Free transactions on L2s</p>
                                                    <p className="text-zinc-500 text-xs">We sponsor gas on Base, Arbitrum & Optimism</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Error */}
                                        {error && (
                                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
                                                <p className="text-red-400 text-sm">{error}</p>
                                            </div>
                                        )}

                                        {/* Buttons */}
                                        <div className="space-y-3">
                                            <button
                                                onClick={handleCreatePasskey}
                                                disabled={isCreating}
                                                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FB8D22] text-white font-medium transition-all hover:shadow-lg hover:shadow-[#FF5500]/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            >
                                                {isCreating ? (
                                                    <>
                                                        <svg
                                                            className="w-5 h-5 animate-spin"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                        >
                                                            <circle
                                                                className="opacity-25"
                                                                cx="12"
                                                                cy="12"
                                                                r="10"
                                                                stroke="currentColor"
                                                                strokeWidth="4"
                                                            />
                                                            <path
                                                                className="opacity-75"
                                                                fill="currentColor"
                                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                            />
                                                        </svg>
                                                        Creating...
                                                    </>
                                                ) : (
                                                    <>
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
                                                                d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                                                            />
                                                        </svg>
                                                        Create Passkey
                                                    </>
                                                )}
                                            </button>
                                            <button
                                                onClick={onSkip}
                                                disabled={isCreating}
                                                className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors disabled:opacity-50"
                                            >
                                                Maybe Later
                                            </button>
                                        </div>

                                        <p className="text-zinc-500 text-xs text-center mt-4">
                                            You can always create a passkey later in Settings
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
