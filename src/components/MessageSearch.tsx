"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

type Message = {
    id: string;
    content: string;
    senderAddress: string;
    sentAt: Date;
};

type MessageSearchProps = {
    messages: Message[];
    onSelectMessage: (messageId: string) => void;
    onClose: () => void;
    isOpen: boolean;
    userAddress: string;
    peerName: string;
};

export function MessageSearch({
    messages,
    onSelectMessage,
    onClose,
    isOpen,
    userAddress,
    peerName,
}: MessageSearchProps) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Message[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // Reset on close
    useEffect(() => {
        if (!isOpen) {
            setQuery("");
            setResults([]);
        }
    }, [isOpen]);

    // Search messages
    const handleSearch = useCallback(
        (searchQuery: string) => {
            setQuery(searchQuery);

            if (!searchQuery.trim()) {
                setResults([]);
                return;
            }

            const lowerQuery = searchQuery.toLowerCase();
            const filtered = messages.filter((msg) =>
                msg.content.toLowerCase().includes(lowerQuery)
            );

            // Sort by most recent first
            filtered.sort(
                (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
            );

            setResults(filtered.slice(0, 50)); // Limit to 50 results
        },
        [messages]
    );

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            onClose();
        }
    };

    // Format date for display
    const formatDate = (date: Date) => {
        const now = new Date();
        const msgDate = new Date(date);
        const diffDays = Math.floor(
            (now.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (diffDays === 0) {
            return msgDate.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            });
        } else if (diffDays === 1) {
            return "Yesterday";
        } else if (diffDays < 7) {
            return msgDate.toLocaleDateString([], { weekday: "short" });
        } else {
            return msgDate.toLocaleDateString([], {
                month: "short",
                day: "numeric",
            });
        }
    };

    // Highlight matching text
    const highlightMatch = (text: string, query: string) => {
        if (!query.trim()) return text;

        const parts = text.split(new RegExp(`(${query})`, "gi"));
        return parts.map((part, i) =>
            part.toLowerCase() === query.toLowerCase() ? (
                <mark key={i} className="bg-[#FF5500]/30 text-white rounded px-0.5">
                    {part}
                </mark>
            ) : (
                part
            )
        );
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="absolute inset-0 bg-zinc-900 z-20 flex flex-col"
                >
                    {/* Search Header */}
                    <div className="flex items-center gap-3 p-4 border-b border-zinc-800">
                        <button
                            onClick={onClose}
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
                                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                                />
                            </svg>
                        </button>
                        <div className="flex-1 relative">
                            <svg
                                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
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
                                onKeyDown={handleKeyDown}
                                placeholder="Search messages..."
                                className="w-full pl-10 pr-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF5500]/50"
                                spellCheck={false}
                                autoCorrect="off"
                            />
                            {query && (
                                <button
                                    onClick={() => handleSearch("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center text-zinc-400 hover:text-white"
                                >
                                    <svg
                                        className="w-3 h-3"
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
                            )}
                        </div>
                    </div>

                    {/* Results */}
                    <div className="flex-1 overflow-y-auto">
                        {!query.trim() ? (
                            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                                <svg
                                    className="w-12 h-12 mb-3 opacity-50"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.5}
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                    />
                                </svg>
                                <p className="text-sm">Search your conversation</p>
                                <p className="text-xs text-zinc-600 mt-1">
                                    {messages.length} messages to search
                                </p>
                            </div>
                        ) : results.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                                <svg
                                    className="w-12 h-12 mb-3 opacity-50"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.5}
                                        d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                </svg>
                                <p className="text-sm">No messages found</p>
                                <p className="text-xs text-zinc-600 mt-1">
                                    Try a different search term
                                </p>
                            </div>
                        ) : (
                            <div className="p-2">
                                <p className="text-xs text-zinc-500 px-2 py-1">
                                    {results.length} result{results.length !== 1 ? "s" : ""}
                                </p>
                                {results.map((msg) => {
                                    const isOwn =
                                        msg.senderAddress.toLowerCase() ===
                                        userAddress.toLowerCase();
                                    return (
                                        <button
                                            key={msg.id}
                                            onClick={() => {
                                                onSelectMessage(msg.id);
                                                onClose();
                                            }}
                                            className="w-full p-3 rounded-xl hover:bg-zinc-800 transition-colors text-left"
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs text-zinc-500">
                                                    {isOwn ? "You" : peerName}
                                                </span>
                                                <span className="text-xs text-zinc-600">
                                                    {formatDate(msg.sentAt)}
                                                </span>
                                            </div>
                                            <p className="text-sm text-white line-clamp-2">
                                                {highlightMatch(msg.content, query)}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

