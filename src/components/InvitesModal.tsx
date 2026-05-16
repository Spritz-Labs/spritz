"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useUserInvites } from "@/hooks/useUserInvites";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    walletAddress: string;
    onBack?: () => void;
};

export function InvitesModal({ isOpen, onClose, walletAddress, onBack }: Props) {
    const { invites, used, available, isLoading, copyInvite, shareInvite, getInviteLink } =
        useUserInvites(walletAddress);

    const [copiedCode, setCopiedCode] = useState<string | null>(null);

    const handleCopy = async (code: string) => {
        const success = await copyInvite(code);
        if (success) {
            setCopiedCode(code);
            setTimeout(() => setCopiedCode(null), 2000);
        }
    };

    const handleShare = async (code: string) => {
        await shareInvite(code);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-zinc-900 rounded-2xl p-6 max-w-md w-full border border-zinc-800 max-h-[80vh] overflow-y-auto"
                >
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            {onBack && (
                                <button
                                    onClick={onBack}
                                    className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
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
                                            d="M15 19l-7-7 7-7"
                                        />
                                    </svg>
                                </button>
                            )}
                            <div>
                                <h2 className="text-xl font-bold text-white">Your Invites</h2>
                                <p className="text-zinc-500 text-sm mt-1">
                                    Share with friends & earn 100 points each
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-zinc-500 hover:text-white transition-colors"
                        >
                            <svg
                                className="w-6 h-6"
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

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-[#FF5500]">{available}</p>
                            <p className="text-zinc-500 text-sm">Available</p>
                        </div>
                        <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                            <p className="text-2xl font-bold text-emerald-400">{used}</p>
                            <p className="text-zinc-500 text-sm">Redeemed</p>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="py-8 text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#FF5500] mx-auto"></div>
                        </div>
                    ) : invites.length === 0 ? (
                        <div className="py-10 text-center px-4">
                            <div className="w-14 h-14 rounded-2xl bg-zinc-800/50 flex items-center justify-center mx-auto mb-4 border border-zinc-700/30">
                                <svg
                                    className="w-7 h-7 text-zinc-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.5}
                                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                    />
                                </svg>
                            </div>
                            <p className="text-zinc-200 font-semibold text-base">No invites yet</p>
                            <p className="text-zinc-500 text-sm mt-1.5 max-w-[260px] mx-auto">
                                Invite codes let you bring friends to Spritz. Earn more invites by
                                being active and climbing the leaderboard.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {invites.map((invite) => (
                                <div
                                    key={invite.id}
                                    className={`rounded-xl p-4 border transition-colors ${
                                        invite.used_by
                                            ? "bg-zinc-800/30 border-zinc-800"
                                            : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                            <code
                                                className={`font-mono text-lg ${
                                                    invite.used_by
                                                        ? "text-zinc-500"
                                                        : "text-[#FF5500]"
                                                }`}
                                            >
                                                {invite.code}
                                            </code>
                                            {invite.used_by && (
                                                <p className="text-xs text-zinc-600 mt-1">
                                                    Used by {invite.used_by.slice(0, 6)}...
                                                    {invite.used_by.slice(-4)}
                                                </p>
                                            )}
                                        </div>

                                        {!invite.used_by && (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleCopy(invite.code)}
                                                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                                        copiedCode === invite.code
                                                            ? "bg-emerald-500/20 text-emerald-400"
                                                            : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                                                    }`}
                                                >
                                                    {copiedCode === invite.code
                                                        ? "Copied!"
                                                        : "Copy"}
                                                </button>
                                                <button
                                                    onClick={() => handleShare(invite.code)}
                                                    className="px-3 py-1.5 bg-[#FF5500] hover:bg-[#E04D00] text-white rounded-lg text-sm transition-colors"
                                                >
                                                    Share
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Info */}
                    <div className="mt-6 p-4 bg-[#FF5500]/10 border border-[#FF5500]/20 rounded-xl">
                        <div className="flex items-start gap-3">
                            <svg
                                className="w-5 h-5 text-[#FF5500] flex-shrink-0 mt-0.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <div>
                                <p className="text-[#FFBBA7] text-sm font-medium">
                                    Earn 100 points per invite!
                                </p>
                                <p className="text-zinc-400 text-xs mt-1">
                                    When someone joins Spritz using your invite code, you&apos;ll
                                    earn 100 points.
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
