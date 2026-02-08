"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useAgentChat, Agent, useAgentLastUsed } from "@/hooks/useAgents";
import { AgentMarkdown, AgentMessageWrapper } from "./AgentMarkdown";
import { SchedulingCard } from "./SchedulingCard";
import { ChatSkeleton } from "./ChatSkeleton";
import { ScrollToBottom, useScrollToBottom } from "./ScrollToBottom";
import { useDraftMessages } from "@/hooks/useDraftMessages";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatTimeInTimezone } from "@/lib/timezone";

interface AgentChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    agent: Agent | null;
    userAddress: string;
}

export function AgentChatModal({
    isOpen,
    onClose,
    agent,
    userAddress,
}: AgentChatModalProps) {
    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const draftAppliedRef = useRef(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showWhatCanYouDo, setShowWhatCanYouDo] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const userTimezone = useUserTimezone();

    const {
        messages,
        isLoading,
        isSending,
        error,
        sendMessage,
        clearHistory,
        regenerateLastResponse,
        removeLastPairAndGetUserContent,
    } = useAgentChat(userAddress, agent?.id || null);
    const { setLastUsed } = useAgentLastUsed();

    const { draft, saveDraft, clearDraft } = useDraftMessages(
        "agent",
        agent?.id || "",
        userAddress
    );

    const {
        newMessageCount,
        isAtBottom,
        onNewMessage,
        resetUnreadCount,
        scrollToBottom: scrollToBottomFn,
    } = useScrollToBottom(messagesContainerRef);

    // Apply draft when modal opens
    useEffect(() => {
        if (!isOpen) {
            draftAppliedRef.current = false;
            return;
        }
        if (draft?.text && !draftAppliedRef.current) {
            setInput(draft.text);
            draftAppliedRef.current = true;
        }
    }, [isOpen, draft?.text]);

    // Escape to close
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    // Auto-scroll to bottom when new messages
    useEffect(() => {
        if (messages.length > 0 && messagesContainerRef.current) {
            messagesContainerRef.current.scrollTo({
                top: messagesContainerRef.current.scrollHeight,
                behavior: "smooth",
            });
        }
    }, [messages]);

    // Track new messages for unread badge when not at bottom
    useEffect(() => {
        if (messages.length > 0 && !isAtBottom) onNewMessage();
    }, [messages.length, isAtBottom, onNewMessage]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Track last used when opening chat or sending
    useEffect(() => {
        if (isOpen && agent?.id) setLastUsed(agent.id);
    }, [isOpen, agent?.id, setLastUsed]);

    const handleSend = useCallback(async () => {
        if (!input.trim() || isSending) return;
        const message = input.trim();
        setInput("");
        clearDraft();
        if (agent?.id) setLastUsed(agent.id);
        try {
            await sendMessage(message);
        } catch (err) {
            setInput(message);
        }
    }, [input, isSending, sendMessage, clearDraft, agent?.id, setLastUsed]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSuggestedQuestion = useCallback((question: string) => {
        setInput(question);
        inputRef.current?.focus();
    }, []);

    const copyMessage = useCallback((content: string, id: string) => {
        navigator.clipboard.writeText(content).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        });
    }, []);

    const handleRegenerate = useCallback(async () => {
        if (isRegenerating || !regenerateLastResponse) return;
        setIsRegenerating(true);
        try {
            await regenerateLastResponse();
        } finally {
            setIsRegenerating(false);
        }
    }, [regenerateLastResponse, isRegenerating]);

    const handleEditLast = useCallback(() => {
        const content = removeLastPairAndGetUserContent();
        if (content != null) setInput(content);
        inputRef.current?.focus();
    }, [removeLastPairAndGetUserContent]);

    // Focus trap: keep Tab inside modal
    useEffect(() => {
        if (!isOpen || !modalRef.current) return;
        const el = modalRef.current;
        const focusables =
            'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return;
            const list = el.querySelectorAll<HTMLElement>(focusables);
            const first = list[0];
            const last = list[list.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last?.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first?.focus();
                }
            }
        };
        el.addEventListener("keydown", handleKeyDown);
        return () => el.removeEventListener("keydown", handleKeyDown);
    }, [isOpen]);

    if (!agent) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
                    style={{
                        paddingBottom:
                            "max(env(safe-area-inset-bottom, 0px) + 100px, 120px)",
                    }}
                    onClick={onClose}
                >
                    <motion.div
                        ref={modalRef}
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="bg-zinc-900 rounded-2xl w-full max-w-2xl h-[min(600px,70vh)] sm:max-h-[70vh] sm:h-[600px] flex flex-col min-h-0 border border-zinc-800 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Chat with ${agent.name}`}
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
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-semibold text-white">
                                            {agent.name}
                                        </h3>
                                        {agent.visibility === "official" && (
                                            <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-medium">
                                                ⭐ Official
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-zinc-400">
                                        {agent.personality?.slice(0, 50) ||
                                            "AI Assistant"}
                                        {(agent.personality?.length || 0) >
                                            50 && "..."}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Clear History */}
                                {messages.length > 0 && (
                                    <button
                                        onClick={async () => {
                                            if (
                                                confirm("Clear chat history?")
                                            ) {
                                                await clearHistory();
                                            }
                                        }}
                                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                                        title="Clear History"
                                    >
                                        <svg
                                            className="w-5 h-5"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                            />
                                        </svg>
                                    </button>
                                )}
                                {/* Close */}
                                <button
                                    onClick={onClose}
                                    className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                                >
                                    <svg
                                        className="w-5 h-5"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M6 18L18 6M6 6l12 12"
                                        />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div
                            ref={messagesContainerRef}
                            role="log"
                            aria-label="Chat messages"
                            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-4 space-y-4"
                        >
                            {isLoading ? (
                                <ChatSkeleton
                                    messageCount={3}
                                    className="p-4"
                                />
                            ) : messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center px-4">
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
                                    <p className="text-sm text-zinc-400 max-w-sm mb-4">
                                        {agent.personality ||
                                            "Start a conversation with your AI assistant!"}
                                    </p>
                                    {agent.personality && (
                                        <div className="w-full max-w-sm mb-4">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowWhatCanYouDo(
                                                        !showWhatCanYouDo
                                                    )
                                                }
                                                className="text-xs text-zinc-500 hover:text-purple-400 transition-colors"
                                            >
                                                {showWhatCanYouDo
                                                    ? "Hide"
                                                    : "What can you do?"}
                                            </button>
                                            {showWhatCanYouDo && (
                                                <p className="text-xs text-zinc-400 mt-2 text-left bg-zinc-800/50 rounded-lg p-3">
                                                    {agent.personality}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    {agent.suggested_questions &&
                                        agent.suggested_questions.length >
                                            0 && (
                                            <div className="w-full max-w-md">
                                                <p className="text-xs text-zinc-500 mb-2">
                                                    Try asking:
                                                </p>
                                                <div className="flex flex-wrap gap-2 justify-center">
                                                    {agent.suggested_questions.map(
                                                        (q, idx) => (
                                                            <button
                                                                key={idx}
                                                                type="button"
                                                                onClick={() =>
                                                                    handleSuggestedQuestion(
                                                                        q
                                                                    )
                                                                }
                                                                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-sm text-zinc-300 hover:text-white transition-all"
                                                            >
                                                                {q}
                                                            </button>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                </div>
                            ) : (
                                <>
                                    {messages.map((msg, idx) => {
                                        const isLastError =
                                            idx === messages.length - 1 &&
                                            msg.role === "assistant" &&
                                            (msg.content.startsWith("❌") ||
                                                msg.content.startsWith(
                                                    "Error"
                                                ));
                                        return (
                                            <div
                                                key={msg.id}
                                                className={`flex ${
                                                    msg.role === "user"
                                                        ? "justify-end"
                                                        : "justify-start"
                                                }`}
                                            >
                                                <div
                                                    className={`max-w-[80%] min-w-0 overflow-hidden rounded-2xl px-4 py-3 group relative ${
                                                        msg.role === "user"
                                                            ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                                                            : "bg-zinc-800 text-white"
                                                    }`}
                                                >
                                                    {msg.role ===
                                                        "assistant" && (
                                                        <div className="flex items-center gap-2 mb-2">
                                                            {agent.avatar_url ? (
                                                                <img
                                                                    src={
                                                                        agent.avatar_url
                                                                    }
                                                                    alt=""
                                                                    className="w-5 h-5 rounded-md object-cover"
                                                                />
                                                            ) : (
                                                                <span className="text-sm">
                                                                    {
                                                                        agent.avatar_emoji
                                                                    }
                                                                </span>
                                                            )}
                                                            <span className="text-xs font-medium text-zinc-400">
                                                                {agent.name}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {msg.role ===
                                                    "assistant" ? (
                                                        <>
                                                            <AgentMessageWrapper content={msg.content} theme="dm">
                                                                <AgentMarkdown content={msg.content} theme="dm" />
                                                            </AgentMessageWrapper>
                                                            {msg.scheduling &&
                                                                msg.scheduling
                                                                    .slots
                                                                    .length >
                                                                    0 && (
                                                                    <SchedulingCard
                                                                        scheduling={
                                                                            msg.scheduling
                                                                        }
                                                                        userAddress={
                                                                            userAddress
                                                                        }
                                                                    />
                                                                )}
                                                        </>
                                                    ) : (
                                                        <p className="text-sm whitespace-pre-wrap">
                                                            {msg.content}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center justify-between gap-2 mt-1">
                                                        <p
                                                            className={`text-xs ${
                                                                msg.role ===
                                                                "user"
                                                                    ? "text-white/60"
                                                                    : "text-zinc-500"
                                                            }`}
                                                        >
                                                            {formatTimeInTimezone(
                                                                new Date(
                                                                    msg.created_at
                                                                ),
                                                                userTimezone
                                                            )}
                                                        </p>
                                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    copyMessage(
                                                                        msg.content,
                                                                        msg.id
                                                                    )
                                                                }
                                                                className="p-1 text-zinc-500 hover:text-white rounded"
                                                                title="Copy"
                                                            >
                                                                {copiedId ===
                                                                msg.id ? (
                                                                    <span className="text-[10px] text-emerald-400">
                                                                        Copied
                                                                    </span>
                                                                ) : (
                                                                    <svg
                                                                        className="w-3.5 h-3.5"
                                                                        fill="none"
                                                                        stroke="currentColor"
                                                                        viewBox="0 0 24 24"
                                                                    >
                                                                        <path
                                                                            strokeLinecap="round"
                                                                            strokeLinejoin="round"
                                                                            strokeWidth={
                                                                                2
                                                                            }
                                                                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h2m8 0h2a2 2 0 012 2v2m0 0V6a2 2 0 00-2-2h-2m-4 0h-2M8 8h8"
                                                                        />
                                                                    </svg>
                                                                )}
                                                            </button>
                                                            {idx ===
                                                                messages.length -
                                                                    1 &&
                                                                msg.role ===
                                                                    "assistant" && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={
                                                                            handleRegenerate
                                                                        }
                                                                        disabled={
                                                                            isRegenerating ||
                                                                            isSending
                                                                        }
                                                                        className="p-1 text-zinc-500 hover:text-purple-400 rounded text-xs"
                                                                        title="Regenerate response"
                                                                    >
                                                                        Regenerate
                                                                    </button>
                                                                )}
                                                            {isLastError && (
                                                                <button
                                                                    type="button"
                                                                    onClick={
                                                                        handleEditLast
                                                                    }
                                                                    className="p-1 text-zinc-500 hover:text-orange-400 rounded text-xs"
                                                                    title="Edit & resend"
                                                                >
                                                                    Edit
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {isSending && (
                                        <div className="flex justify-start">
                                            <div className="bg-zinc-800 rounded-2xl px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    {agent.avatar_url ? (
                                                        <img
                                                            src={
                                                                agent.avatar_url
                                                            }
                                                            alt=""
                                                            className="w-5 h-5 rounded-md object-cover"
                                                        />
                                                    ) : (
                                                        <span className="text-sm">
                                                            {agent.avatar_emoji}
                                                        </span>
                                                    )}
                                                    <div className="flex gap-1">
                                                        <span
                                                            className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce"
                                                            style={{
                                                                animationDelay:
                                                                    "0ms",
                                                            }}
                                                        />
                                                        <span
                                                            className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce"
                                                            style={{
                                                                animationDelay:
                                                                    "150ms",
                                                            }}
                                                        />
                                                        <span
                                                            className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce"
                                                            style={{
                                                                animationDelay:
                                                                    "300ms",
                                                            }}
                                                        />
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

                        <ScrollToBottom
                            containerRef={messagesContainerRef}
                            unreadCount={newMessageCount}
                            onScrollToBottom={resetUnreadCount}
                        />
                        {/* Input */}
                        <div className="p-4 border-t border-zinc-800">
                            <div className="flex flex-col gap-1">
                                <div className="flex gap-2 items-end">
                                    <textarea
                                        ref={inputRef}
                                        rows={1}
                                        inputMode="text"
                                        enterKeyHint="send"
                                        autoComplete="off"
                                        autoCorrect="on"
                                        autoCapitalize="sentences"
                                        aria-label={`Message ${agent.name}`}
                                        value={input}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val.length > 10000) return;
                                            setInput(val);
                                            saveDraft(val);
                                            const ta = e.target;
                                            ta.style.height = "auto";
                                            ta.style.height = `${Math.min(
                                                ta.scrollHeight,
                                                120
                                            )}px`;
                                        }}
                                        onKeyDown={handleKeyDown}
                                        placeholder={`Message ${agent.name}... (Enter to send, Shift+Enter for new line)`}
                                        disabled={isSending}
                                        maxLength={10000}
                                        className="flex-1 min-h-[44px] max-h-[120px] resize-none bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 transition-colors disabled:opacity-50 text-sm"
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={!input.trim() || isSending}
                                        className="px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition-all"
                                    >
                                        {isSending ? (
                                            <svg
                                                className="animate-spin w-5 h-5"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                            >
                                                <circle
                                                    className="opacity-25"
                                                    cx="12"
                                                    cy="12"
                                                    r="10"
                                                    stroke="currentColor"
                                                    strokeWidth="4"
                                                />
                                                <path
                                                    className="opacity-75"
                                                    fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                                />
                                            </svg>
                                        ) : (
                                            <svg
                                                className="w-5 h-5"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                                                />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                                {input.length > 500 && (
                                    <p className="text-xs text-zinc-500">
                                        {input.length.toLocaleString()} / 10,000
                                    </p>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default AgentChatModal;
