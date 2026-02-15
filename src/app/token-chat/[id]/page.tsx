"use client";

import { useState, useEffect, use } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { useAuth } from "@/context/AuthProvider";
import { getChainById } from "@/config/chains";

type TokenChatInfo = {
    id: string;
    name: string;
    description: string | null;
    emoji: string;
    icon_url: string | null;
    token_address: string;
    token_chain_id: number;
    token_name: string | null;
    token_symbol: string | null;
    token_decimals: number;
    min_balance: string;
    min_balance_display: string | null;
    is_official: boolean;
    member_count: number;
    messaging_type: "standard" | "waku";
    created_at: string;
};

export default function TokenChatInvitePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const { user, isLoading: authLoading, isAuthenticated } = useAuth();
    const userAddress = user?.walletAddress || null;
    const [chat, setChat] = useState<TokenChatInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [joining, setJoining] = useState(false);
    const [joined, setJoined] = useState(false);
    const [joinError, setJoinError] = useState<string | null>(null);

    useEffect(() => {
        fetchChat();
    }, [id]);

    const fetchChat = async () => {
        try {
            const res = await fetch(`/api/public/token-chats/${id}`);
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Token chat not found");
                return;
            }

            setChat(data.chat);
        } catch {
            setError("Failed to load token chat");
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async () => {
        if (!userAddress || joining || !chat) return;

        setJoining(true);
        setJoinError(null);
        try {
            const res = await fetch(`/api/token-chats/${chat.id}/join`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userAddress }),
            });

            const data = await res.json();

            if (res.ok || data.alreadyMember) {
                setJoined(true);
                localStorage.setItem("spritz_open_token_chat", chat.id);
                window.location.href = "/";
            } else {
                setJoinError(data.error || "Failed to join. You may not meet the token balance requirement.");
            }
        } catch (err) {
            console.error("Error joining token chat:", err);
            setJoinError("Failed to join token chat. Please try again.");
        } finally {
            setJoining(false);
        }
    };

    const handleLoginAndJoin = () => {
        localStorage.setItem("spritz_pending_token_chat_join", id);
        window.location.href = "/";
    };

    if (loading || authLoading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !chat) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-zinc-800 flex items-center justify-center text-4xl">
                        🪙
                    </div>
                    <h1 className="text-xl font-bold text-white mb-2">
                        Token Chat Not Found
                    </h1>
                    <p className="text-zinc-500 mb-6">
                        {error || "This token chat doesn't exist or has been removed."}
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all"
                    >
                        Go to Spritz
                    </Link>
                </div>
            </div>
        );
    }

    if (userAddress && (joining || joined) && !joinError) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-8 h-8 mx-auto border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-white">Joining token chat...</p>
                </div>
            </div>
        );
    }

    const chain = getChainById(chat.token_chain_id);
    const explorerUrl = chain?.explorerUrl
        ? `${chain.explorerUrl}/token/${chat.token_address}`
        : `https://etherscan.io/token/${chat.token_address}`;
    const hasMinBalance = chat.min_balance_display && parseFloat(chat.min_balance_display) > 0;

    return (
        <div className="min-h-screen bg-zinc-950 relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-[128px]" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-[128px]" />
            </div>

            <div className="relative z-10 max-w-lg mx-auto px-4 py-16">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center"
                >
                    {/* Logo */}
                    <div className="mb-8">
                        <Link
                            href="/"
                            className="inline-block text-3xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent"
                        >
                            Spritz
                        </Link>
                    </div>

                    {/* Token Chat Card */}
                    <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8">
                        {/* Token Chat Icon */}
                        {chat.icon_url ? (
                            <img
                                src={chat.icon_url}
                                alt={chat.name}
                                className="w-24 h-24 mx-auto mb-6 rounded-2xl object-cover shadow-lg"
                            />
                        ) : (
                            <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-5xl shadow-lg shadow-orange-500/20">
                                {chat.emoji || "🪙"}
                            </div>
                        )}

                        {/* Chat Name + Badges */}
                        <h1 className="text-2xl font-bold text-white mb-2">
                            {chat.name}
                        </h1>

                        <div className="flex items-center justify-center gap-2 mb-4">
                            {chat.is_official && (
                                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full border border-emerald-500/30">
                                    OFFICIAL
                                </span>
                            )}
                            {chat.messaging_type === "waku" && (
                                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs font-bold rounded-full border border-purple-500/30">
                                    Decentralized
                                </span>
                            )}
                        </div>

                        {/* Token Info */}
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <span className="text-lg">{chain?.icon}</span>
                            <span className="text-zinc-300 font-medium">
                                {chat.token_name} ({chat.token_symbol})
                            </span>
                            <span className="text-zinc-500 text-sm">
                                on {chain?.name}
                            </span>
                        </div>

                        {/* Description */}
                        {chat.description && (
                            <p className="text-zinc-400 mb-6 leading-relaxed">
                                {chat.description}
                            </p>
                        )}

                        {/* Token-gating requirement */}
                        {hasMinBalance && (
                            <div className="mb-6 p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl inline-flex items-center gap-2">
                                <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                <span className="text-amber-300 text-sm font-medium">
                                    Requires {Number(chat.min_balance_display).toLocaleString()} {chat.token_symbol} to join
                                </span>
                            </div>
                        )}

                        {/* Stats */}
                        <div className="flex items-center justify-center gap-6 mb-6 text-sm">
                            <div className="flex items-center gap-2 text-zinc-400">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>{chat.member_count?.toLocaleString() || 0} members</span>
                            </div>
                        </div>

                        {/* Explorer link */}
                        <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 mb-6 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 text-sm transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            View Token on Explorer
                        </a>

                        {/* Join Error */}
                        {joinError && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                                <p className="text-red-400 text-sm">{joinError}</p>
                            </div>
                        )}

                        {/* Join Button */}
                        {userAddress ? (
                            <button
                                onClick={handleJoin}
                                disabled={joining}
                                className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-lg font-semibold hover:shadow-lg hover:shadow-orange-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {joining ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Verifying balance...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                        </svg>
                                        Join Token Chat
                                    </>
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={handleLoginAndJoin}
                                className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-lg font-semibold hover:shadow-lg hover:shadow-orange-500/25 transition-all flex items-center justify-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                                </svg>
                                Sign in to Join
                            </button>
                        )}

                        {!userAddress && (
                            <p className="text-zinc-500 text-sm mt-4">
                                Create a free Spritz account to join this token chat
                                {hasMinBalance && (
                                    <span className="block mt-1 text-amber-500/70">
                                        You&apos;ll need {Number(chat.min_balance_display).toLocaleString()} {chat.token_symbol} in your wallet
                                    </span>
                                )}
                            </p>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="mt-8">
                        <Link
                            href="/"
                            className="text-zinc-500 hover:text-white text-sm transition-colors"
                        >
                            Powered by{" "}
                            <span className="text-orange-400 font-semibold">
                                Spritz
                            </span>
                        </Link>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
