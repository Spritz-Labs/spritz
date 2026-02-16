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
    const [copied, setCopied] = useState(false);

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

    const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}/token-chat/${id}`;
    const shareText = chat ? `Join the ${chat.name} token chat on Spritz!` : "";

    const handleCopyLink = async () => {
        if (!shareUrl) return;
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Copy failed:", err);
        }
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

                        {/* Share: Copy + Social */}
                        <div className="mb-6">
                            <p className="text-zinc-500 text-sm mb-2">Share this chat</p>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleCopyLink}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors"
                                >
                                    {copied ? (
                                        <>
                                            <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            Copied!
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                            Copy link
                                        </>
                                    )}
                                </button>
                                <a
                                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText + "\n\n" + shareUrl)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-black rounded-full text-zinc-300 hover:text-white transition-colors"
                                    title="Share on X"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                    </svg>
                                </a>
                                <a
                                    href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-[#0088cc] rounded-full text-zinc-300 hover:text-white transition-colors"
                                    title="Share on Telegram"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                                    </svg>
                                </a>
                                <a
                                    href={`https://wa.me/?text=${encodeURIComponent(shareText + "\n\n" + shareUrl)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-[#25D366] rounded-full text-zinc-300 hover:text-white transition-colors"
                                    title="Share on WhatsApp"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                    </svg>
                                </a>
                                <a
                                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-[#1877F2] rounded-full text-zinc-300 hover:text-white transition-colors"
                                    title="Share on Facebook"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                    </svg>
                                </a>
                                <a
                                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-[#0077B5] rounded-full text-zinc-300 hover:text-white transition-colors"
                                    title="Share on LinkedIn"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                                    </svg>
                                </a>
                                <a
                                    href={`https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-[#FF4500] rounded-full text-zinc-300 hover:text-white transition-colors"
                                    title="Share on Reddit"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.33-1.01 1.614l.042.016c.01.636.516 1.15 1.165 1.15.63 0 1.15-.49 1.163-1.114l.666-.036c.043-.597.506-1.05 1.101-1.05.605 0 1.04.507 1.04 1.091 0 .2-.05.41-.121.61l-.315 1.105c.708.327 1.208.96 1.208 1.694 0 1.097-.933 1.988-2.084 1.988-1.145 0-2.086-.89-2.086-1.988 0-.734.5-1.367 1.21-1.694l-.314-1.104a1.18 1.18 0 0 1-.12-.61c0-.584.435-1.09 1.04-1.09.595 0 1.058.453 1.101 1.05l.665.035c.014.625.533 1.114 1.163 1.114.65 0 1.156-.514 1.165-1.15l.041-.016c-.576-.283-1.01-.898-1.01-1.614 0-.968.786-1.754 1.754-1.754.477 0 .9.182 1.207.49 1.194-.856 2.85-1.418 4.673-1.489l-.8-3.747-2.596.547c0 .688-.561 1.25-1.25 1.25a1.25 1.25 0 0 1-1.249-1.249l.001-.021z" />
                                    </svg>
                                </a>
                            </div>
                        </div>

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
