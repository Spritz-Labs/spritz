"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import type { SearchResult } from "@/app/api/search/route";

type GlobalSearchModalProps = {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string;
    onOpenChannel?: (channelId: string) => void;
    onOpenDM?: (peerAddress: string) => void;
    onOpenGroup?: (groupId: string) => void;
    getUserInfo?: (address: string) => { name: string | null; avatar: string | null } | null;
};

export function GlobalSearchModal({
    isOpen,
    onClose,
    userAddress,
    onOpenChannel,
    onOpenDM,
    onOpenGroup,
    getUserInfo,
}: GlobalSearchModalProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<"all" | "channels" | "dms" | "groups">("all");
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Clear state when closed
    useEffect(() => {
        if (!isOpen) {
            setQuery("");
            setResults([]);
            setError(null);
        }
    }, [isOpen]);

    // Prevent body scroll
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    const search = useCallback(async (searchQuery: string) => {
        if (searchQuery.length < 2) {
            setResults([]);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                q: searchQuery,
                userAddress,
                type: filter,
                limit: "50",
            });

            const res = await fetch(`/api/search?${params}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Search failed");
            }

            setResults(data.results);
        } catch (err) {
            console.error("[GlobalSearch] Error:", err);
            setError(err instanceof Error ? err.message : "Search failed");
        } finally {
            setIsLoading(false);
        }
    }, [userAddress, filter]);

    const handleSearch = (value: string) => {
        setQuery(value);
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
            search(value);
        }, 300);
    };

    const handleResultClick = (result: SearchResult) => {
        if (result.type === "channel_message" && result.channel_id) {
            onOpenChannel?.(result.channel_id);
        } else if (result.type === "dm" && result.peer_address) {
            onOpenDM?.(result.peer_address);
        } else if (result.type === "group" && result.group_id) {
            onOpenGroup?.(result.group_id);
        }
        onClose();
    };

    const getSenderName = (address: string, fallbackName?: string) => {
        const info = getUserInfo?.(address);
        return info?.name || fallbackName || `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    const getResultIcon = (result: SearchResult) => {
        switch (result.type) {
            case "channel_message":
                return result.channel_emoji || "#";
            case "dm":
                return "💬";
            case "group":
                return "👥";
            default:
                return "📝";
        }
    };

    const getResultTitle = (result: SearchResult) => {
        switch (result.type) {
            case "channel_message":
                return `#${result.channel_name}`;
            case "dm":
                return result.peer_name || `${result.peer_address?.slice(0, 6)}...`;
            case "group":
                return result.group_name;
            default:
                return "Message";
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-[10vh]"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: -20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: -20 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-zinc-900 rounded-2xl w-full max-w-2xl border border-zinc-800 shadow-2xl overflow-hidden"
                    >
                        {/* Search Header */}
                        <div className="p-4 border-b border-zinc-800">
                            <div className="relative">
                                <svg
                                    className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                    />
                                </svg>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={query}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    placeholder="Search messages, channels, and more..."
                                    className="w-full pl-12 pr-12 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-lg placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF5500]/50 focus:border-[#FF5500]"
                                />
                                {query && (
                                    <button
                                        onClick={() => {
                                            setQuery("");
                                            setResults([]);
                                            inputRef.current?.focus();
                                        }}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            {/* Filter Tabs */}
                            <div className="flex gap-2 mt-3">
                                {[
                                    { value: "all", label: "All" },
                                    { value: "channels", label: "Channels" },
                                    // { value: "dms", label: "DMs" },
                                    // { value: "groups", label: "Groups" },
                                ].map((tab) => (
                                    <button
                                        key={tab.value}
                                        onClick={() => {
                                            setFilter(tab.value as typeof filter);
                                            if (query.length >= 2) search(query);
                                        }}
                                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                                            filter === tab.value
                                                ? "bg-[#FF5500] text-white"
                                                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Results */}
                        <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-16">
                                    <div className="w-8 h-8 border-2 border-zinc-600 border-t-[#FF5500] rounded-full animate-spin" />
                                </div>
                            ) : error ? (
                                <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                                    <svg className="w-12 h-12 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p>{error}</p>
                                </div>
                            ) : query.length < 2 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                                    <svg className="w-16 h-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <p className="text-sm">Type to search across your chats</p>
                                    <p className="text-xs text-zinc-600 mt-1">Search messages in channels you've joined</p>
                                </div>
                            ) : results.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                                    <span className="text-5xl mb-4">🔍</span>
                                    <p>No results found for "{query}"</p>
                                    <p className="text-xs text-zinc-600 mt-1">Try different keywords</p>
                                </div>
                            ) : (
                                <div className="p-2">
                                    <p className="text-xs text-zinc-500 px-3 py-2">
                                        {results.length} result{results.length !== 1 ? "s" : ""}
                                    </p>
                                    {results.map((result) => (
                                        <button
                                            key={result.id}
                                            onClick={() => handleResultClick(result)}
                                            className="w-full px-4 py-3 rounded-xl hover:bg-zinc-800/50 transition-colors text-left flex gap-3"
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                                                <span className="text-lg">{getResultIcon(result)}</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="text-sm font-medium text-white truncate">
                                                        {getResultTitle(result)}
                                                    </span>
                                                    <span className="text-xs text-zinc-500">
                                                        {formatDistanceToNow(new Date(result.created_at), { addSuffix: true })}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-zinc-400 mb-1">
                                                    {getSenderName(result.sender_address, result.sender_name)}
                                                </p>
                                                <p className="text-sm text-zinc-300 line-clamp-2">
                                                    {result.highlight || result.content.slice(0, 150)}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="border-t border-zinc-800 px-4 py-3 flex items-center justify-between text-xs text-zinc-500">
                            <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">⌘</kbd>
                                    <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">K</kbd>
                                </span>
                                <span>to open search</span>
                            </div>
                            <button
                                onClick={onClose}
                                className="text-zinc-400 hover:text-white transition-colors"
                            >
                                Press <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded mx-1">Esc</kbd> to close
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
