"use client";

import { motion } from "motion/react";

interface DailyBonusCardProps {
    isClaiming: boolean;
    onClaim: () => void;
}

export function DailyBonusCard({ isClaiming, onClaim }: DailyBonusCardProps) {
    return (
        <div className="mx-1 mt-2 mb-1 sm:mx-4 sm:mt-4 sm:mb-2">
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-lg sm:rounded-xl p-3 sm:p-4"
            >
                <div className="flex items-center justify-between gap-2 sm:gap-4">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-base sm:text-xl">🎁</span>
                        </div>
                        <div className="min-w-0">
                            <p className="text-white font-medium text-xs sm:text-sm">
                                Daily Bonus!
                            </p>
                            <p className="text-amber-400/70 text-[10px] sm:text-xs">
                                +3 points today
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClaim}
                        disabled={isClaiming}
                        className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs sm:text-sm font-semibold hover:shadow-lg hover:shadow-orange-500/25 transition-all disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
                    >
                        {isClaiming ? (
                            <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <span className="hidden sm:inline">✨</span>
                                Claim
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
