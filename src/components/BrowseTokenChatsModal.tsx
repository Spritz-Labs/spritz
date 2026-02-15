"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CHAIN_LIST, getChainById } from "@/config/chains";
import type { TokenChat } from "@/app/api/token-chats/route";

interface BrowseTokenChatsModalProps {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string;
    onJoinChat: (chat: TokenChat) => void;
    onOpenChat: (chat: TokenChat) => void;
    onCreateNew: () => void;
}

type JoinErrorInfo = {
    chatId: string;
    message: string;
    required?: string;
    actual?: string;
    symbol?: string;
    walletsChecked?: number;
    breakdown?: { label: string; balance: string }[];
};

export function BrowseTokenChatsModal({
    isOpen,
    onClose,
    userAddress,
    onJoinChat,
    onOpenChat,
    onCreateNew,
}: BrowseTokenChatsModalProps) {
    const [chats, setChats] = useState<TokenChat[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [selectedChainId, setSelectedChainId] = useState<number | null>(null);
    const [joiningId, setJoiningId] = useState<string | null>(null);
    const [joinError, setJoinError] = useState<JoinErrorInfo | null>(null);
    const [tab, setTab] = useState<"browse" | "my">("browse");

    const fetchChats = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                userAddress: userAddress.toLowerCase(),
                mode: tab,
            });
            if (search) params.set("search", search);
            if (selectedChainId) params.set("chainId", selectedChainId.toString());

            const res = await fetch(`/api/token-chats?${params}`);
            const data = await res.json();
            if (res.ok) {
                setChats(data.chats || []);
            }
        } catch (err) {
            console.error("[BrowseTokenChats] Error:", err);
        } finally {
            setIsLoading(false);
        }
    }, [userAddress, search, selectedChainId, tab]);

    useEffect(() => {
        if (isOpen) {
            fetchChats();
            setJoinError(null);
        }
    }, [isOpen, fetchChats]);

    // Debounced search
    useEffect(() => {
        if (!isOpen) return;
        const timer = setTimeout(() => fetchChats(), 300);
        return () => clearTimeout(timer);
    }, [search, selectedChainId, tab, isOpen, fetchChats]);

    const handleJoin = async (chat: TokenChat) => {
        setJoiningId(chat.id);
        setJoinError(null);

        try {
            const res = await fetch(`/api/token-chats/${chat.id}/join`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userAddress }),
            });

            const data = await res.json();

            if (res.ok) {
                // Update local state
                setChats((prev) =>
                    prev.map((c) =>
                        c.id === chat.id
                            ? { ...c, is_member: true, member_count: c.member_count + 1 }
                            : c,
                    ),
                );
                onJoinChat(chat);
            } else {
                if (res.status === 403) {
                    setJoinError({
                        chatId: chat.id,
                        message: `Need ${data.required} ${data.symbol}, you have ${data.actual} total`,
                        required: data.required,
                        actual: data.actual,
                        symbol: data.symbol,
                        walletsChecked: data.walletsChecked,
                        breakdown: data.breakdown,
                    });
                } else {
                    setJoinError({
                        chatId: chat.id,
                        message: data.error || "Failed to join",
                    });
                }
            }
        } catch {
            setJoinError({
                chatId: chat.id,
                message: "Network error",
            });
        } finally {
            setJoiningId(null);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-zinc-800">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-lg font-semibold text-white">Token Chats</h2>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={onCreateNew}
                                        className="px-3 py-1.5 bg-[#FF5500] hover:bg-[#FF5500]/90 text-white text-xs font-medium rounded-lg transition-colors"
                                    >
                                        + Create
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex gap-1 bg-zinc-800 rounded-lg p-1 mb-3">
                                <button
                                    onClick={() => setTab("browse")}
                                    className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${
                                        tab === "browse"
                                            ? "bg-zinc-700 text-white"
                                            : "text-zinc-400 hover:text-white"
                                    }`}
                                >
                                    Browse
                                </button>
                                <button
                                    onClick={() => setTab("my")}
                                    className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-colors ${
                                        tab === "my"
                                            ? "bg-zinc-700 text-white"
                                            : "text-zinc-400 hover:text-white"
                                    }`}
                                >
                                    My Chats
                                </button>
                            </div>

                            {/* Search */}
                            <div className="relative">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search by token name or symbol..."
                                    className="w-full py-2.5 pl-10 pr-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 text-sm"
                                />
                            </div>

                            {/* Chain Filter */}
                            <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 scrollbar-none">
                                <button
                                    onClick={() => setSelectedChainId(null)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                                        !selectedChainId
                                            ? "bg-[#FF5500]/20 text-[#FF5500] border border-[#FF5500]/30"
                                            : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white"
                                    }`}
                                >
                                    All Chains
                                </button>
                                {CHAIN_LIST.map((chain) => (
                                    <button
                                        key={chain.id}
                                        onClick={() =>
                                            setSelectedChainId(
                                                selectedChainId === chain.id ? null : chain.id,
                                            )
                                        }
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                                            selectedChainId === chain.id
                                                ? "bg-[#FF5500]/20 text-[#FF5500] border border-[#FF5500]/30"
                                                : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white"
                                        }`}
                                    >
                                        <span>{chain.icon}</span>
                                        {chain.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Chat List */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {isLoading && chats.length === 0 && (
                                <div className="flex items-center justify-center py-12">
                                    <div className="w-6 h-6 border-2 border-zinc-600 border-t-[#FF5500] rounded-full animate-spin" />
                                </div>
                            )}

                            {!isLoading && chats.length === 0 && (
                                <div className="text-center py-12">
                                    <div className="text-4xl mb-3">🪙</div>
                                    <p className="text-zinc-400 font-medium">
                                        {tab === "my" ? "You haven't joined any token chats" : "No token chats found"}
                                    </p>
                                    <p className="text-zinc-500 text-sm mt-1">
                                        {tab === "my"
                                            ? "Browse and join token-gated chats"
                                            : "Be the first to create one!"}
                                    </p>
                                    {tab === "browse" && (
                                        <button
                                            onClick={onCreateNew}
                                            className="mt-4 px-4 py-2 bg-[#FF5500] hover:bg-[#FF5500]/90 text-white text-sm font-medium rounded-lg transition-colors"
                                        >
                                            Create Token Chat
                                        </button>
                                    )}
                                </div>
                            )}

                            {chats.map((chat) => {
                                const chatChain = getChainById(chat.token_chain_id);
                                const chatJoinError = joinError?.chatId === chat.id ? joinError : null;
                                return (
                                    <motion.div
                                        key={chat.id}
                                        initial={{ opacity: 0, y: 5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3 hover:bg-zinc-800 transition-colors"
                                    >
                                        <div className="flex items-start gap-3">
                                            {chat.icon_url ? (
                                                <img src={chat.icon_url} alt={chat.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-lg shrink-0">
                                                    {chat.emoji || "🪙"}
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-white font-semibold text-sm truncate">
                                                        {chat.name}
                                                    </p>
                                                    {chat.is_official && (
                                                        <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-500/30 shrink-0">
                                                            OFFICIAL
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-zinc-500 text-xs">
                                                        {chatChain?.icon} {chat.token_symbol}
                                                        {chatChain ? ` on ${chatChain.name}` : ""}
                                                    </span>
                                                    <span className="text-zinc-600 text-xs">·</span>
                                                    <span className="text-zinc-500 text-xs">
                                                        {chat.member_count} members
                                                    </span>
                                                </div>
                                                {chat.min_balance_display && parseFloat(chat.min_balance_display) > 0 && (
                                                    <div className="flex items-center gap-1 mt-1.5">
                                                        <svg className="w-3 h-3 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                        </svg>
                                                        <span className="text-amber-400/80 text-xs">
                                                            Min {Number(chat.min_balance_display).toLocaleString()} {chat.token_symbol}
                                                        </span>
                                                    </div>
                                                )}
                                                {chat.description && (
                                                    <p className="text-zinc-500 text-xs mt-1 line-clamp-1">
                                                        {chat.description}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="shrink-0">
                                                {chat.is_member ? (
                                                    <button
                                                        onClick={() => onOpenChat(chat)}
                                                        className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium rounded-lg transition-colors"
                                                    >
                                                        Open
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleJoin(chat)}
                                                        disabled={joiningId === chat.id}
                                                        className="px-3 py-1.5 bg-[#FF5500] hover:bg-[#FF5500]/90 disabled:bg-zinc-700 text-white text-xs font-medium rounded-lg transition-colors"
                                                    >
                                                        {joiningId === chat.id ? (
                                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                        ) : (
                                                            "Join"
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Inline join error with wallet breakdown */}
                                        {chatJoinError && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: "auto" }}
                                                className="mt-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg"
                                            >
                                                <div className="flex items-start gap-2">
                                                    <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                                    </svg>
                                                    <div className="flex-1">
                                                        <p className="text-red-400 text-xs font-medium">
                                                            {chatJoinError.message}
                                                        </p>
                                                        {chatJoinError.walletsChecked && chatJoinError.walletsChecked > 1 && (
                                                            <p className="text-red-400/60 text-[10px] mt-1">
                                                                Checked {chatJoinError.walletsChecked} wallets (EOA + Spritz Wallet + Vaults)
                                                            </p>
                                                        )}
                                                        {chatJoinError.breakdown && chatJoinError.breakdown.length > 0 && (
                                                            <div className="mt-1.5 space-y-0.5">
                                                                {chatJoinError.breakdown.map((b, i) => (
                                                                    <div key={i} className="flex items-center justify-between text-[10px]">
                                                                        <span className="text-red-400/70">{b.label}</span>
                                                                        <span className="text-red-400/70">{b.balance} {chatJoinError.symbol}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => setJoinError(null)}
                                                        className="text-red-400/50 hover:text-red-400 shrink-0"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
