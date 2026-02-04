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
    getUserInfo?: (
        address: string
    ) => { name: string | null; avatar: string | null } | null;
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
    const [filter, setFilter] = useState<"all" | "channels" | "dms" | "groups">(
        "all"
    );
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

    // Prevent background scroll when search is open (fixes scroll bleed on mobile/PWA)
    useEffect(() => {
        if (isOpen) {
            const scrollY = window.scrollY;
            document.body.style.overflow = "hidden";
            document.body.style.position = "fixed";
            document.body.style.top = `-${scrollY}px`;
            document.body.style.left = "0";
            document.body.style.right = "0";
            return () => {
                document.body.style.overflow = "";
                document.body.style.position = "";
                document.body.style.top = "";
                document.body.style.left = "";
                document.body.style.right = "";
                window.scrollTo(0, scrollY);
            };
        }
    }, [isOpen]);

    const search = useCallback(
        async (searchQuery: string) => {
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
        },
        [userAddress, filter]
    );

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
        return (
            info?.name ||
            fallbackName ||
            `${address.slice(0, 6)}...${address.slice(-4)}`
        );
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
                return (
                    result.peer_name || `${result.peer_address?.slice(0, 6)}...`
                );
            case "group":
                return result.group_name;
            default:
                return "Message";
        }
    };

    // Recent searches for empty state
    const recentCategories = [
        { icon: "💬", label: "Messages", desc: "Search in your conversations" },
        { icon: "#", label: "Channels", desc: "Find public channels" },
        { icon: "👤", label: "People", desc: "Search users by name" },
    ];

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-zinc-950 sm:bg-black/80 sm:backdrop-blur-sm z-50"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{
                            type: "spring",
                            damping: 25,
                            stiffness: 300,
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-full sm:h-auto sm:max-h-[85vh] bg-zinc-950 sm:bg-zinc-900 sm:rounded-2xl w-full sm:max-w-2xl sm:mx-auto sm:mt-[8vh] sm:border sm:border-zinc-800 sm:shadow-2xl overflow-hidden flex flex-col"
                        style={{
                            paddingTop: "env(safe-area-inset-top)",
                            paddingBottom: "env(safe-area-inset-bottom)",
                        }}
                    >
                        {/* Mobile Header */}
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 bg-zinc-950 sm:hidden">
                            <button
                                onClick={onClose}
                                className="w-10 h-10 flex items-center justify-center rounded-full bg-zinc-800 text-white active:bg-zinc-700"
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
                                        d="M15 19l-7-7 7-7"
                                    />
                                </svg>
                            </button>
                            <h1 className="text-lg font-semibold text-white">
                                Search
                            </h1>
                        </div>

                        {/* Search Input */}
                        <div className="p-4 sm:border-b sm:border-zinc-800">
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
                                    onChange={(e) =>
                                        handleSearch(e.target.value)
                                    }
                                    placeholder="Search messages..."
                                    className="w-full pl-12 pr-12 py-4 bg-zinc-800/80 border border-zinc-700/50 rounded-2xl text-white text-[16px] placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF5500]/50 focus:border-[#FF5500]"
                                />
                                {query ? (
                                    <button
                                        onClick={() => {
                                            setQuery("");
                                            setResults([]);
                                            inputRef.current?.focus();
                                        }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-zinc-700 rounded-full text-zinc-400 hover:text-white active:bg-zinc-600 transition-colors"
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
                                                strokeWidth={2.5}
                                                d="M6 18L18 6M6 6l12 12"
                                            />
                                        </svg>
                                    </button>
                                ) : (
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1">
                                        <kbd className="px-1.5 py-0.5 bg-zinc-700/50 rounded text-xs text-zinc-500">
                                            ⌘K
                                        </kbd>
                                    </div>
                                )}
                            </div>

                            {/* Filter Pills - Scrollable on mobile */}
                            <div className="flex gap-2 mt-3 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
                                {[
                                    { value: "all", label: "All", icon: "✨" },
                                    {
                                        value: "channels",
                                        label: "Channels",
                                        icon: "#",
                                    },
                                    { value: "dms", label: "DMs", icon: "💬" },
                                    {
                                        value: "groups",
                                        label: "Groups",
                                        icon: "👥",
                                    },
                                ].map((tab) => (
                                    <button
                                        key={tab.value}
                                        onClick={() => {
                                            setFilter(
                                                tab.value as typeof filter
                                            );
                                            if (query.length >= 2)
                                                search(query);
                                        }}
                                        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-full whitespace-nowrap transition-all active:scale-95 ${
                                            filter === tab.value
                                                ? "bg-gradient-to-r from-[#FF5500] to-[#FF7700] text-white shadow-lg shadow-[#FF5500]/25"
                                                : "bg-zinc-800/80 text-zinc-400 active:bg-zinc-700"
                                        }`}
                                    >
                                        <span>{tab.icon}</span>
                                        <span>{tab.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Results */}
                        <div className="flex-1 overflow-y-auto overscroll-contain">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <div className="w-10 h-10 border-3 border-zinc-700 border-t-[#FF5500] rounded-full animate-spin mb-4" />
                                    <p className="text-zinc-500 text-sm">
                                        Searching...
                                    </p>
                                </div>
                            ) : error ? (
                                <div className="flex flex-col items-center justify-center py-20 text-zinc-500 px-8">
                                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                                        <svg
                                            className="w-8 h-8 text-red-400"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={1.5}
                                                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                        </svg>
                                    </div>
                                    <p className="text-red-400 font-medium">
                                        {error}
                                    </p>
                                    <button
                                        onClick={() => search(query)}
                                        className="mt-4 px-4 py-2 bg-zinc-800 rounded-lg text-zinc-300 text-sm active:bg-zinc-700"
                                    >
                                        Try again
                                    </button>
                                </div>
                            ) : query.length < 2 ? (
                                <div className="py-8 px-4">
                                    {/* Empty state with suggestions */}
                                    <div className="text-center mb-8">
                                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#FF5500]/20 to-amber-500/20 flex items-center justify-center mx-auto mb-4">
                                            <span className="text-4xl">🔍</span>
                                        </div>
                                        <p className="text-white font-medium mb-1">
                                            Search your chats
                                        </p>
                                        <p className="text-zinc-500 text-sm">
                                            Find messages, channels, and more
                                        </p>
                                    </div>

                                    {/* Quick categories */}
                                    <p className="text-xs text-zinc-600 uppercase tracking-wider font-medium mb-3 px-2">
                                        Quick access
                                    </p>
                                    <div className="space-y-2">
                                        {recentCategories.map((cat) => (
                                            <button
                                                key={cat.label}
                                                onClick={() => {
                                                    if (
                                                        cat.label === "Channels"
                                                    )
                                                        setFilter("channels");
                                                    inputRef.current?.focus();
                                                }}
                                                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-zinc-800/50 active:bg-zinc-800 transition-colors text-left"
                                            >
                                                <div className="w-12 h-12 rounded-xl bg-zinc-700/50 flex items-center justify-center">
                                                    <span className="text-xl">
                                                        {cat.icon}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="text-white font-medium">
                                                        {cat.label}
                                                    </p>
                                                    <p className="text-zinc-500 text-sm">
                                                        {cat.desc}
                                                    </p>
                                                </div>
                                                <svg
                                                    className="w-5 h-5 text-zinc-600 ml-auto"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M9 5l7 7-7 7"
                                                    />
                                                </svg>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : results.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-zinc-500 px-8">
                                    <div className="w-20 h-20 rounded-full bg-zinc-800/50 flex items-center justify-center mb-4">
                                        <span className="text-4xl">🤷</span>
                                    </div>
                                    <p className="text-white font-medium mb-1">
                                        No results found
                                    </p>
                                    <p className="text-zinc-500 text-sm text-center">
                                        No matches for "
                                        <span className="text-zinc-400">
                                            {query}
                                        </span>
                                        "
                                    </p>
                                    <p className="text-zinc-600 text-xs mt-2">
                                        Try different keywords
                                    </p>
                                </div>
                            ) : (
                                <div className="px-4 py-2">
                                    <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-3">
                                        {results.length} result
                                        {results.length !== 1 ? "s" : ""}
                                    </p>
                                    <div className="space-y-1">
                                        {results.map((result, index) => (
                                            <motion.button
                                                key={result.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{
                                                    delay: index * 0.03,
                                                }}
                                                onClick={() =>
                                                    handleResultClick(result)
                                                }
                                                className="w-full p-4 rounded-2xl bg-zinc-800/30 active:bg-zinc-800 transition-all text-left flex gap-4 group"
                                            >
                                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center shrink-0 group-active:scale-95 transition-transform">
                                                    <span className="text-xl">
                                                        {getResultIcon(result)}
                                                    </span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-semibold text-white truncate">
                                                            {getResultTitle(
                                                                result
                                                            )}
                                                        </span>
                                                        <span className="text-xs text-zinc-600 shrink-0">
                                                            {formatDistanceToNow(
                                                                new Date(
                                                                    result.created_at
                                                                ),
                                                                {
                                                                    addSuffix:
                                                                        true,
                                                                }
                                                            )}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-zinc-500 mb-1.5 truncate">
                                                        {getSenderName(
                                                            result.sender_address,
                                                            result.sender_name
                                                        )}
                                                    </p>
                                                    <p className="text-sm text-zinc-400 line-clamp-2 leading-relaxed">
                                                        {result.highlight ||
                                                            result.content.slice(
                                                                0,
                                                                150
                                                            )}
                                                    </p>
                                                </div>
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Desktop Footer - Hidden on mobile */}
                        <div className="hidden sm:flex border-t border-zinc-800 px-4 py-3 items-center justify-between text-xs text-zinc-500">
                            <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">
                                        ⌘
                                    </kbd>
                                    <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">
                                        K
                                    </kbd>
                                </span>
                                <span>to open search</span>
                            </div>
                            <button
                                onClick={onClose}
                                className="text-zinc-400 hover:text-white transition-colors"
                            >
                                Press{" "}
                                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded mx-1">
                                    Esc
                                </kbd>{" "}
                                to close
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
