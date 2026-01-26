"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useAgentChat, Agent } from "@/hooks/useAgents";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SchedulingCard } from "./SchedulingCard";

interface AgentChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    agent: Agent | null;
    userAddress: string;
}

export function AgentChatModal({ isOpen, onClose, agent, userAddress }: AgentChatModalProps) {
    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const {
        messages,
        isLoading,
        isSending,
        error,
        sendMessage,
        clearHistory,
    } = useAgentChat(userAddress, agent?.id || null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleSend = async () => {
        if (!input.trim() || isSending) return;
        const message = input;
        setInput("");
        await sendMessage(message);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    if (!agent) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
                    style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 100px, 120px)' }}
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="bg-zinc-900 rounded-2xl w-full max-w-2xl max-h-[70vh] h-[600px] flex flex-col border border-zinc-800 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                            <div className="flex items-center gap-3">
                                {agent.avatar_url ? (
                                    <img
                                        src={agent.avatar_url}
                                        alt={agent.name}
                                        className="w-10 h-10 rounded-xl object-cover"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xl">
                                        {agent.avatar_emoji}
                                    </div>
                                )}
                                <div>
                                    <h3 className="font-semibold text-white">{agent.name}</h3>
                                    <p className="text-xs text-zinc-400">
                                        {agent.personality?.slice(0, 50) || "AI Assistant"}
                                        {(agent.personality?.length || 0) > 50 && "..."}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Clear History */}
                                {messages.length > 0 && (
                                    <button
                                        onClick={async () => {
                                            if (confirm("Clear chat history?")) {
                                                await clearHistory();
                                            }
                                        }}
                                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                                        title="Clear History"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                )}
                                {/* Close */}
                                <button
                                    onClick={onClose}
                                    className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-full">
                                    <div className="flex items-center gap-3 text-zinc-400">
                                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Loading...
                                    </div>
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center">
                                    {agent.avatar_url ? (
                                        <img
                                            src={agent.avatar_url}
                                            alt={agent.name}
                                            className="w-16 h-16 rounded-2xl object-cover mb-4"
                                        />
                                    ) : (
                                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center text-3xl mb-4">
                                            {agent.avatar_emoji}
                                        </div>
                                    )}
                                    <h4 className="text-lg font-semibold text-white mb-1">
                                        Chat with {agent.name}
                                    </h4>
                                    <p className="text-sm text-zinc-400 max-w-sm">
                                        {agent.personality || "Start a conversation with your AI assistant!"}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {messages.map((msg) => (
                                        <div
                                            key={msg.id}
                                            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                                        >
                                            <div
                                                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                                                    msg.role === "user"
                                                        ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                                                        : "bg-zinc-800 text-white"
                                                }`}
                                            >
                                                {msg.role === "assistant" && (
                                                    <div className="flex items-center gap-2 mb-2">
                                                        {agent.avatar_url ? (
                                                            <img src={agent.avatar_url} alt="" className="w-5 h-5 rounded-md object-cover" />
                                                        ) : (
                                                            <span className="text-sm">{agent.avatar_emoji}</span>
                                                        )}
                                                        <span className="text-xs font-medium text-zinc-400">{agent.name}</span>
                                                    </div>
                                                )}
                                                {msg.role === "assistant" ? (
                                                    <>
                                                        <div className="text-sm prose prose-invert prose-sm max-w-none prose-p:my-1 prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-700 prose-code:text-pink-400 prose-code:before:content-[''] prose-code:after:content-['']">
                                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                                {msg.content}
                                                            </ReactMarkdown>
                                                        </div>
                                                        {/* Render interactive scheduling card if present */}
                                                        {msg.scheduling && msg.scheduling.slots.length > 0 && (
                                                            <SchedulingCard 
                                                                scheduling={msg.scheduling} 
                                                                userAddress={userAddress}
                                                            />
                                                        )}
                                                    </>
                                                ) : (
                                                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                                )}
                                                <p className={`text-xs mt-1 ${msg.role === "user" ? "text-white/60" : "text-zinc-500"}`}>
                                                    {new Date(msg.created_at).toLocaleTimeString([], { 
                                                        hour: "2-digit", 
                                                        minute: "2-digit" 
                                                    })}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                    {isSending && (
                                        <div className="flex justify-start">
                                            <div className="bg-zinc-800 rounded-2xl px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    {agent.avatar_url ? (
                                                        <img src={agent.avatar_url} alt="" className="w-5 h-5 rounded-md object-cover" />
                                                    ) : (
                                                        <span className="text-sm">{agent.avatar_emoji}</span>
                                                    )}
                                                    <div className="flex gap-1">
                                                        <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                                        <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                                        <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </>
                            )}
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/30">
                                <p className="text-sm text-red-400">{error}</p>
                            </div>
                        )}

                        {/* Input */}
                        <div className="p-4 border-t border-zinc-800">
                            <div className="flex gap-2">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    inputMode="text"
                                    enterKeyHint="send"
                                    autoComplete="off"
                                    autoCorrect="on"
                                    autoCapitalize="sentences"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={`Message ${agent.name}...`}
                                    disabled={isSending}
                                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors disabled:opacity-50"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!input.trim() || isSending}
                                    className="px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all"
                                >
                                    {isSending ? (
                                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default AgentChatModal;

