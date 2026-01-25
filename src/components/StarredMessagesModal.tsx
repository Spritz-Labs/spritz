"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import type { StarredMessage } from "@/app/api/messages/starred/route";

type StarredMessagesModalProps = {
    isOpen: boolean;
    onClose: () => void;
    messages: StarredMessage[];
    onUnstar: (messageId: string) => Promise<boolean>;
    onNavigate: (message: StarredMessage) => void;
    isLoading?: boolean;
};

export function StarredMessagesModal({
    isOpen,
    onClose,
    messages,
    onUnstar,
    onNavigate,
    isLoading = false,
}: StarredMessagesModalProps) {
    const [filter, setFilter] = useState<"all" | "channel" | "dm" | "group" | "alpha">("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [unstarring, setUnstarring] = useState<string | null>(null);

    // Filter messages
    const filteredMessages = useMemo(() => {
        let filtered = messages;

        if (filter !== "all") {
            filtered = filtered.filter(m => m.message_type === filter);
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(m =>
                m.content.toLowerCase().includes(query) ||
                m.sender_name?.toLowerCase().includes(query) ||
                m.channel_name?.toLowerCase().includes(query) ||
                m.peer_name?.toLowerCase().includes(query)
            );
        }

        return filtered;
    }, [messages, filter, searchQuery]);

    const handleUnstar = async (messageId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setUnstarring(messageId);
        await onUnstar(messageId);
        setUnstarring(null);
    };

    const getMessageIcon = (msg: StarredMessage) => {
        switch (msg.message_type) {
            case "channel":
                return "#";
            case "dm":
                return "💬";
            case "group":
                return "👥";
            case "alpha":
                return "🌐";
        }
    };

    const getMessageContext = (msg: StarredMessage) => {
        switch (msg.message_type) {
            case "channel":
                return msg.channel_name ? `#${msg.channel_name}` : "Channel";
            case "dm":
                return msg.peer_name || "Direct Message";
            case "group":
                return msg.group_name || "Group Chat";
            case "alpha":
                return "Global Chat";
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
                        className="bg-zinc-900 rounded-2xl w-full max-w-2xl border border-zinc-800 shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-zinc-800">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center">
                                        <span className="text-xl">⭐</span>
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-semibold text-white">Starred Messages</h2>
                                        <p className="text-xs text-zinc-500">{messages.length} saved</p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Search */}
                            <div className="relative mb-3">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search starred messages..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                                />
                            </div>

                            {/* Filter Pills */}
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {[
                                    { value: "all", label: "All", icon: "✨" },
                                    { value: "channel", label: "Channels", icon: "#" },
                                    { value: "dm", label: "DMs", icon: "💬" },
                                    { value: "group", label: "Groups", icon: "👥" },
                                    { value: "alpha", label: "Global", icon: "🌐" },
                                ].map((tab) => (
                                    <button
                                        key={tab.value}
                                        onClick={() => setFilter(tab.value as typeof filter)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                                            filter === tab.value
                                                ? "bg-amber-500 text-white"
                                                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                        }`}
                                    >
                                        <span>{tab.icon}</span>
                                        <span>{tab.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Messages List */}
                        <div className="flex-1 overflow-y-auto overscroll-contain">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-16">
                                    <div className="w-8 h-8 border-2 border-zinc-600 border-t-amber-500 rounded-full animate-spin" />
                                </div>
                            ) : filteredMessages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                                    <span className="text-5xl mb-4">⭐</span>
                                    <p className="font-medium text-white mb-1">
                                        {messages.length === 0 ? "No starred messages yet" : "No matches found"}
                                    </p>
                                    <p className="text-sm text-zinc-500">
                                        {messages.length === 0 
                                            ? "Star important messages to save them here" 
                                            : "Try different keywords or filters"}
                                    </p>
                                </div>
                            ) : (
                                <div className="p-2 space-y-1">
                                    {filteredMessages.map((msg) => (
                                        <motion.button
                                            key={msg.id}
                                            initial={{ opacity: 0, y: 5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            onClick={() => onNavigate(msg)}
                                            className="w-full text-left p-4 rounded-xl hover:bg-zinc-800/50 active:bg-zinc-800 transition-colors group"
                                        >
                                            <div className="flex gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                                                    <span className="text-lg">{getMessageIcon(msg)}</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-sm font-medium text-white">
                                                            {getMessageContext(msg)}
                                                        </span>
                                                        <span className="text-xs text-zinc-600">
                                                            {formatDistanceToNow(new Date(msg.original_created_at), { addSuffix: true })}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-zinc-500 mb-1.5">
                                                        {msg.sender_name || `${msg.sender_address.slice(0, 6)}...${msg.sender_address.slice(-4)}`}
                                                    </p>
                                                    <p className="text-sm text-zinc-300 line-clamp-2">
                                                        {msg.content}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={(e) => handleUnstar(msg.message_id, e)}
                                                    disabled={unstarring === msg.message_id}
                                                    className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-amber-400 hover:text-amber-300 hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100 shrink-0 disabled:opacity-50"
                                                    title="Unstar message"
                                                >
                                                    {unstarring === msg.message_id ? (
                                                        <div className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                                                    ) : (
                                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                        </svg>
                                                    )}
                                                </button>
                                            </div>
                                        </motion.button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
