"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { TokenChatMessage } from "@/app/api/token-chats/[id]/messages/route";
import type { TokenChat } from "@/app/api/token-chats/route";
import { getChainById } from "@/config/chains";

interface TokenChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string;
    chat: TokenChat | null;
    getUserInfo?: (address: string) => {
        name: string | null;
        avatar: string | null;
    } | null;
}

export function TokenChatModal({
    isOpen,
    onClose,
    userAddress,
    chat,
    getUserInfo,
}: TokenChatModalProps) {
    const [messages, setMessages] = useState<TokenChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [messageInput, setMessageInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [memberCount, setMemberCount] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<NodeJS.Timeout | null>(null);
    const lastMessageIdRef = useRef<string | null>(null);

    const chain = chat ? getChainById(chat.token_chain_id) : null;

    // Fetch messages
    const fetchMessages = useCallback(
        async (before?: string) => {
            if (!chat) return;
            setIsLoading(true);
            try {
                const params = new URLSearchParams({
                    userAddress: userAddress.toLowerCase(),
                });
                if (before) params.set("before", before);

                const res = await fetch(
                    `/api/token-chats/${chat.id}/messages?${params}`,
                );
                const data = await res.json();
                if (res.ok) {
                    if (before) {
                        setMessages((prev) => [...data.messages, ...prev]);
                    } else {
                        setMessages(data.messages);
                    }
                    setHasMore(data.hasMore);
                }
            } catch (err) {
                console.error("[TokenChat] Fetch messages error:", err);
            } finally {
                setIsLoading(false);
            }
        },
        [chat, userAddress],
    );

    // Initial load + polling
    useEffect(() => {
        if (!isOpen || !chat) return;

        fetchMessages();
        setMemberCount(chat.member_count || 0);

        // Poll for new messages every 3 seconds
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(
                    `/api/token-chats/${chat.id}/messages?userAddress=${userAddress.toLowerCase()}&limit=10`,
                );
                const data = await res.json();
                if (res.ok && data.messages?.length > 0) {
                    const latest = data.messages[data.messages.length - 1];
                    if (latest.id !== lastMessageIdRef.current) {
                        setMessages(data.messages);
                    }
                }
            } catch {
                // Silent poll error
            }
        }, 3000);

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [isOpen, chat, fetchMessages, userAddress]);

    // Track last message ID for polling dedup
    useEffect(() => {
        if (messages.length > 0) {
            lastMessageIdRef.current = messages[messages.length - 1].id;
        }
    }, [messages]);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = async () => {
        if (!messageInput.trim() || !chat || isSending) return;

        const content = messageInput.trim();
        setMessageInput("");
        setIsSending(true);

        try {
            const res = await fetch(`/api/token-chats/${chat.id}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAddress: userAddress.toLowerCase(),
                    content,
                }),
            });

            const data = await res.json();
            if (res.ok && data.message) {
                setMessages((prev) => [...prev, data.message]);
            }
        } catch (err) {
            console.error("[TokenChat] Send error:", err);
        } finally {
            setIsSending(false);
        }
    };

    const getDisplayName = (address: string) => {
        const info = getUserInfo?.(address);
        if (info?.name) return info.name;
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    if (!chat) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex flex-col bg-zinc-950"
                >
                    {/* Header */}
                    <div className="border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-lg px-4 py-3 safe-area-pt">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onClose}
                                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>

                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-lg">
                                    {chat.emoji || "🪙"}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-white font-semibold truncate">
                                            {chat.name}
                                        </h2>
                                        {chat.is_official && (
                                            <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-500/30 shrink-0">
                                                OFFICIAL
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-zinc-500 text-xs truncate">
                                        {chain?.icon} {chat.token_symbol} {chain ? `on ${chain.name}` : ""} · {memberCount} members
                                        {chat.min_balance_display && parseFloat(chat.min_balance_display) > 0 && (
                                            <> · Min {Number(chat.min_balance_display).toLocaleString()} {chat.token_symbol}</>
                                        )}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                        {/* Load more */}
                        {hasMore && (
                            <button
                                onClick={() => {
                                    if (messages.length > 0) {
                                        fetchMessages(messages[0].created_at);
                                    }
                                }}
                                disabled={isLoading}
                                className="w-full py-2 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
                            >
                                {isLoading ? "Loading..." : "Load earlier messages"}
                            </button>
                        )}

                        {messages.length === 0 && !isLoading && (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <div className="text-4xl mb-3">{chat.emoji || "🪙"}</div>
                                <p className="text-zinc-400 font-medium">No messages yet</p>
                                <p className="text-zinc-500 text-sm mt-1">
                                    Be the first to say something!
                                </p>
                            </div>
                        )}

                        {messages.map((msg) => {
                            const isMe = msg.sender_address === userAddress.toLowerCase();
                            return (
                                <div
                                    key={msg.id}
                                    className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                                >
                                    <div className={`max-w-[80%] ${isMe ? "items-end" : "items-start"}`}>
                                        {!isMe && (
                                            <p className="text-xs text-zinc-500 mb-1 ml-1">
                                                {getDisplayName(msg.sender_address)}
                                            </p>
                                        )}
                                        <div
                                            className={`px-4 py-2.5 rounded-2xl ${
                                                isMe
                                                    ? "bg-[#FF5500] text-white rounded-br-md"
                                                    : "bg-zinc-800 text-zinc-100 rounded-bl-md"
                                            }`}
                                        >
                                            <p className="text-sm whitespace-pre-wrap break-words">
                                                {msg.content}
                                            </p>
                                        </div>
                                        <p className="text-[10px] text-zinc-600 mt-1 mx-1">
                                            {new Date(msg.created_at).toLocaleTimeString([], {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Message Input */}
                    <div className="border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-lg px-4 py-3 safe-area-pb">
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={messageInput}
                                onChange={(e) => setMessageInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                placeholder="Type a message..."
                                className="flex-1 py-2.5 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 transition-all text-sm"
                            />
                            <button
                                onClick={handleSend}
                                disabled={!messageInput.trim() || isSending}
                                className="p-2.5 bg-[#FF5500] hover:bg-[#FF5500]/90 disabled:bg-zinc-700 text-white rounded-xl transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
