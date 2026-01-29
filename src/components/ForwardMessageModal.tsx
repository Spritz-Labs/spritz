"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";

type Chat = {
    id: string;
    type: "channel" | "dm" | "group";
    name: string;
    icon?: string;
    avatar?: string;
    lastMessage?: string;
};

type ForwardMessageModalProps = {
    isOpen: boolean;
    onClose: () => void;
    message: {
        id: string;
        content: string;
        senderName: string;
        senderAddress: string;
    } | null;
    onForward: (targetId: string, targetType: "channel" | "dm" | "group") => Promise<boolean>;
    chats: Chat[];
};

export function ForwardMessageModal({
    isOpen,
    onClose,
    message,
    onForward,
    chats,
}: ForwardMessageModalProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
    const [isForwarding, setIsForwarding] = useState(false);
    const [filter, setFilter] = useState<"all" | "channel" | "dm" | "group">("all");

    // Reset state when closed
    useEffect(() => {
        if (!isOpen) {
            setSearchQuery("");
            setSelectedChat(null);
            setIsForwarding(false);
            setFilter("all");
        }
    }, [isOpen]);

    // Filter chats
    const filteredChats = useMemo(() => {
        let filtered = chats;

        if (filter !== "all") {
            filtered = filtered.filter(c => c.type === filter);
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(c => 
                c.name.toLowerCase().includes(query)
            );
        }

        return filtered;
    }, [chats, filter, searchQuery]);

    const handleForward = async () => {
        if (!selectedChat || !message) return;

        setIsForwarding(true);
        try {
            const success = await onForward(selectedChat.id, selectedChat.type);
            if (success) {
                onClose();
            }
        } finally {
            setIsForwarding(false);
        }
    };

    const getChatIcon = (chat: Chat) => {
        if (chat.avatar) {
            return (
                <img src={chat.avatar} alt="" className="w-full h-full object-cover rounded-full" />
            );
        }
        if (chat.icon) {
            return <span className="text-xl">{chat.icon}</span>;
        }
        switch (chat.type) {
            case "channel":
                return <span className="text-lg font-bold text-zinc-400">#</span>;
            case "dm":
                return <span className="text-lg">💬</span>;
            case "group":
                return <span className="text-lg">👥</span>;
        }
    };

    return (
        <AnimatePresence>
            {isOpen && message && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-zinc-900 rounded-2xl w-full max-w-md border border-zinc-800 shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-zinc-800">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-white">Forward Message</h2>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Message Preview */}
                            <div className="bg-zinc-800/50 rounded-xl p-3 mb-4">
                                <p className="text-xs text-zinc-500 mb-1">
                                    From {message.senderName}
                                </p>
                                <p className="text-sm text-zinc-300 line-clamp-3">
                                    {message.content}
                                </p>
                            </div>

                            {/* Search */}
                            <div className="relative">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search chats..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF5500]/50"
                                />
                            </div>

                            {/* Filter Pills */}
                            <div className="flex gap-2 mt-3">
                                {[
                                    { value: "all", label: "All" },
                                    { value: "channel", label: "Channels" },
                                    { value: "dm", label: "DMs" },
                                    { value: "group", label: "Groups" },
                                ].map((tab) => (
                                    <button
                                        key={tab.value}
                                        onClick={() => setFilter(tab.value as typeof filter)}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                                            filter === tab.value
                                                ? "bg-[#FF5500] text-white"
                                                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Chat List */}
                        <div className="flex-1 overflow-y-auto overscroll-contain p-2">
                            {filteredChats.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                                    <span className="text-4xl mb-3">🔍</span>
                                    <p className="text-sm">No chats found</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {filteredChats.map((chat) => (
                                        <button
                                            key={`${chat.type}-${chat.id}`}
                                            onClick={() => setSelectedChat(chat)}
                                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                                                selectedChat?.id === chat.id && selectedChat?.type === chat.type
                                                    ? "bg-[#FF5500]/20 ring-2 ring-[#FF5500]"
                                                    : "hover:bg-zinc-800/50 active:bg-zinc-800"
                                            }`}
                                        >
                                            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden">
                                                {getChatIcon(chat)}
                                            </div>
                                            <div className="flex-1 min-w-0 text-left">
                                                <p className="font-medium text-white truncate">
                                                    {chat.name}
                                                </p>
                                                <p className="text-xs text-zinc-500 capitalize">
                                                    {chat.type === "dm" ? "Direct Message" : chat.type}
                                                </p>
                                            </div>
                                            {selectedChat?.id === chat.id && selectedChat?.type === chat.type && (
                                                <div className="w-6 h-6 rounded-full bg-[#FF5500] flex items-center justify-center">
                                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-zinc-800">
                            <button
                                onClick={handleForward}
                                disabled={!selectedChat || isForwarding}
                                className="w-full py-3 bg-gradient-to-r from-[#FF5500] to-[#FF7700] text-white font-semibold rounded-xl transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isForwarding ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>Forwarding...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                        </svg>
                                        <span>Forward to {selectedChat?.name || "..."}</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
