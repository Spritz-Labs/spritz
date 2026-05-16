"use client";

import { motion, AnimatePresence } from "motion/react";

interface DailyBonusModalProps {
    isOpen: boolean;
    isAvailable: boolean;
    isClaiming: boolean;
    onClaim: () => void;
    onDismiss: () => void;
}

export function DailyBonusModal({
    isOpen,
    isAvailable,
    isClaiming,
    onClaim,
    onDismiss,
}: DailyBonusModalProps) {
    return (
        <AnimatePresence>
            {isOpen && isAvailable && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    onClick={onDismiss}
                >
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm text-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{
                                type: "spring",
                                delay: 0.1,
                                stiffness: 200,
                            }}
                            className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center"
                        >
                            <motion.span
                                animate={{
                                    rotate: [0, -10, 10, -10, 0],
                                    scale: [1, 1.1, 1],
                                }}
                                transition={{
                                    duration: 0.5,
                                    repeat: Infinity,
                                    repeatDelay: 2,
                                }}
                                className="text-4xl"
                            >
                                🎁
                            </motion.span>
                        </motion.div>

                        <h2 className="text-xl font-bold text-white mb-2">
                            Daily Bonus Available!
                        </h2>
                        <p className="text-zinc-400 mb-6">
                            Claim your{" "}
                            <span className="text-amber-400 font-semibold">+3 points</span> for
                            logging in today
                        </p>

                        <button
                            onClick={onClaim}
                            disabled={isClaiming}
                            className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold transition-all hover:shadow-lg hover:shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isClaiming ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Claiming...
                                </>
                            ) : (
                                <>
                                    <span>✨</span>
                                    Claim +3 Points
                                </>
                            )}
                        </button>

                        <button
                            onClick={onDismiss}
                            className="mt-3 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                        >
                            Maybe later
                        </button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
