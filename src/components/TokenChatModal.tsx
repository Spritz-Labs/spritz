"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { TokenChatMessage } from "@/app/api/token-chats/[id]/messages/route";
import type { TokenChat } from "@/app/api/token-chats/route";
import { getChainById } from "@/config/chains";
import { AvatarWithStatus } from "./OnlineStatus";
import { ChatSkeleton } from "./ChatSkeleton";
import { ChatEmptyState } from "./ChatEmptyState";
import { LinkPreview, detectUrls } from "./LinkPreview";
import { ChatMarkdown, hasMarkdown } from "./ChatMarkdown";
import { PixelArtEditor } from "./PixelArtEditor";
import { PixelArtImage } from "./PixelArtImage";
import { ChatAttachmentMenu } from "./ChatAttachmentMenu";
import {
    MessageActionBar,
    type MessageActionConfig,
    type MessageActionCallbacks,
} from "./MessageActionBar";
import { ImageViewerModal } from "./ImageViewerModal";
import {
    useMessageReactions,
    MESSAGE_REACTION_EMOJIS,
} from "@/hooks/useChatFeatures";
import { ReactionDisplay } from "./EmojiPicker";
import { ChatMembersList } from "./ChatMembersList";
import { MentionInput, type MentionUser } from "./MentionInput";
import { MentionText } from "./MentionText";
import { ScrollToBottom } from "./ScrollToBottom";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatTimeInTimezone } from "@/lib/timezone";

// Helpers
function isGifMessage(content: string): boolean {
    return (
        content.startsWith("https://") &&
        (content.includes("giphy.com") ||
            content.includes("tenor.com") ||
            content.endsWith(".gif"))
    );
}

function isPixelArtMessage(content: string): boolean {
    return (
        content.startsWith("[PIXEL_ART]") ||
        (content.startsWith("https://") && content.includes("pixel-art"))
    );
}

function extractPixelArtUrl(content: string): string | null {
    if (content.startsWith("[PIXEL_ART]")) {
        const match = content.match(/\[PIXEL_ART\](.*)/);
        return match ? match[1].trim() : null;
    }
    if (content.startsWith("https://") && content.includes("pixel-art")) {
        return content;
    }
    return null;
}

interface TokenChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string;
    chat: TokenChat | null;
    getUserInfo?: (address: string) => {
        name: string | null;
        avatar: string | null;
    } | null;
    onOpenUserCard?: (address: string) => void;
}

export function TokenChatModal({
    isOpen,
    onClose,
    userAddress,
    chat,
    getUserInfo,
    onOpenUserCard,
}: TokenChatModalProps) {
    // Messages state
    const [messages, setMessages] = useState<TokenChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [messageInput, setMessageInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [memberCount, setMemberCount] = useState(0);

    // UI state
    const [showInfo, setShowInfo] = useState(false);
    const [showMembersList, setShowMembersList] = useState(false);
    const [showPixelArt, setShowPixelArt] = useState(false);
    const [replyingTo, setReplyingTo] = useState<TokenChatMessage | null>(null);
    const [selectedMessage, setSelectedMessage] = useState<MessageActionConfig | null>(null);
    const [showMessageActions, setShowMessageActions] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isUploading] = useState(false);

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const pollRef = useRef<NodeJS.Timeout | null>(null);
    const lastMessageIdRef = useRef<string | null>(null);
    const userScrolledUpRef = useRef(false);
    const justSentMessageRef = useRef(false);

    const timezone = useUserTimezone();
    const chain = chat ? getChainById(chat.token_chain_id) : null;

    // Message reactions
    const {
        reactions: msgReactions,
        fetchReactions: fetchMsgReactions,
        toggleReaction: toggleMsgReaction,
    } = useMessageReactions(userAddress, isOpen && chat ? chat.id : null);

    // Fetch reactions when messages change
    useEffect(() => {
        const messageIds = messages.map((msg) => msg.id);
        if (messageIds.length > 0) {
            fetchMsgReactions(messageIds);
        }
    }, [messages, fetchMsgReactions]);

    // Mentionable users from message senders
    const mentionableUsers: MentionUser[] = useMemo(() => {
        const userMap = new Map<string, MentionUser>();
        messages.forEach((msg) => {
            const address = msg.sender_address.toLowerCase();
            if (address === userAddress.toLowerCase()) return;
            if (userMap.has(address)) return;
            const info = getUserInfo?.(address);
            userMap.set(address, {
                address,
                name: info?.name || null,
                avatar: info?.avatar || null,
            });
        });
        return Array.from(userMap.values());
    }, [messages, userAddress, getUserInfo]);

    // Helpers
    const getDisplayName = useCallback(
        (address: string) => {
            const info = getUserInfo?.(address);
            if (info?.name) return info.name;
            return `${address.slice(0, 6)}...${address.slice(-4)}`;
        },
        [getUserInfo],
    );

    const getAvatar = useCallback(
        (address: string) => {
            return getUserInfo?.(address)?.avatar || null;
        },
        [getUserInfo],
    );

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

        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(
                    `/api/token-chats/${chat.id}/messages?userAddress=${userAddress.toLowerCase()}&limit=50`,
                );
                const data = await res.json();
                if (res.ok && data.messages?.length > 0) {
                    const latest = data.messages[data.messages.length - 1];
                    if (latest.id !== lastMessageIdRef.current) {
                        // Count new messages if user has scrolled up
                        if (userScrolledUpRef.current) {
                            const prevIds = new Set(messages.map((m) => m.id));
                            const newCount = data.messages.filter(
                                (m: TokenChatMessage) => !prevIds.has(m.id),
                            ).length;
                            if (newCount > 0) setUnreadCount((prev) => prev + newCount);
                        }
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
    }, [isOpen, chat, fetchMessages, userAddress, messages]);

    // Track last message ID
    useEffect(() => {
        if (messages.length > 0) {
            lastMessageIdRef.current = messages[messages.length - 1].id;
        }
    }, [messages]);

    // Auto-scroll on new messages (if not scrolled up)
    useEffect(() => {
        if (!userScrolledUpRef.current || justSentMessageRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            justSentMessageRef.current = false;
        }
    }, [messages]);

    // Handle messages scroll
    const handleMessagesScroll = useCallback(() => {
        const container = messagesContainerRef.current;
        if (!container) return;
        const { scrollHeight, scrollTop, clientHeight } = container;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
        userScrolledUpRef.current = !isNearBottom;
        if (isNearBottom) {
            setUnreadCount(0);
        }
    }, []);

    // Send message
    const handleSend = useCallback(async () => {
        if (!messageInput.trim() || !chat || isSending) return;

        const content = messageInput.trim();
        setMessageInput("");
        setIsSending(true);
        justSentMessageRef.current = true;

        try {
            const res = await fetch(`/api/token-chats/${chat.id}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAddress: userAddress.toLowerCase(),
                    content,
                    replyTo: replyingTo?.id || null,
                }),
            });

            const data = await res.json();
            if (res.ok && data.message) {
                setMessages((prev) => [...prev, data.message]);
                setReplyingTo(null);
            }
        } catch (err) {
            console.error("[TokenChat] Send error:", err);
        } finally {
            setIsSending(false);
        }
    }, [messageInput, chat, isSending, userAddress, replyingTo]);

    // Send pixel art
    const handleSendPixelArt = useCallback(
        async (dataUrl: string) => {
            if (!chat) return;
            setIsSending(true);
            justSentMessageRef.current = true;
            try {
                const res = await fetch(`/api/token-chats/${chat.id}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userAddress: userAddress.toLowerCase(),
                        content: `[PIXEL_ART]${dataUrl}`,
                    }),
                });
                const data = await res.json();
                if (res.ok && data.message) {
                    setMessages((prev) => [...prev, data.message]);
                }
            } catch (err) {
                console.error("[TokenChat] Send pixel art error:", err);
            } finally {
                setIsSending(false);
            }
        },
        [chat, userAddress],
    );

    // Send GIF
    const handleSendGif = useCallback(
        async (gifUrl: string) => {
            if (!chat) return;
            setIsSending(true);
            justSentMessageRef.current = true;
            try {
                const res = await fetch(`/api/token-chats/${chat.id}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userAddress: userAddress.toLowerCase(),
                        content: gifUrl,
                    }),
                });
                const data = await res.json();
                if (res.ok && data.message) {
                    setMessages((prev) => [...prev, data.message]);
                }
            } catch (err) {
                console.error("[TokenChat] Send GIF error:", err);
            } finally {
                setIsSending(false);
            }
        },
        [chat, userAddress],
    );

    // Cancel reply
    const cancelReply = useCallback(() => {
        setReplyingTo(null);
        inputRef.current?.focus();
    }, []);

    // Delete message
    const handleDeleteMessage = useCallback(
        async (messageId: string) => {
            if (!chat) return;
            try {
                const res = await fetch(`/api/token-chats/${chat.id}/messages?messageId=${messageId}&userAddress=${userAddress.toLowerCase()}`, {
                    method: "DELETE",
                });
                if (res.ok) {
                    setMessages((prev) => prev.filter((m) => m.id !== messageId));
                }
            } catch (err) {
                console.error("[TokenChat] Delete error:", err);
            }
        },
        [chat, userAddress],
    );

    // Track message being acted on for callbacks
    const actionMessageRef = useRef<TokenChatMessage | null>(null);

    // Message action callbacks
    const messageActionCallbacks: MessageActionCallbacks = useMemo(
        () => ({
            onReply: () => {
                const msg = actionMessageRef.current;
                setShowMessageActions(false);
                setSelectedMessage(null);
                if (msg) {
                    setReplyingTo(msg);
                    inputRef.current?.focus();
                }
            },
            onReaction: async (emoji: string) => {
                const msg = actionMessageRef.current;
                if (msg) {
                    await toggleMsgReaction(msg.id, emoji);
                }
                setShowMessageActions(false);
                setSelectedMessage(null);
            },
            onCopy: () => {
                const msg = actionMessageRef.current;
                if (msg) {
                    navigator.clipboard.writeText(msg.content);
                }
                setShowMessageActions(false);
                setSelectedMessage(null);
            },
            onDelete: () => {
                const msg = actionMessageRef.current;
                if (msg) handleDeleteMessage(msg.id);
                setShowMessageActions(false);
                setSelectedMessage(null);
            },
        }),
        [toggleMsgReaction, handleDeleteMessage],
    );

    // Open message actions
    const handleMessagePress = useCallback(
        (msg: TokenChatMessage, isOwn: boolean) => {
            actionMessageRef.current = msg;
            const config: MessageActionConfig = {
                messageId: msg.id,
                messageContent: msg.content,
                isOwn,
                canEdit: false,
                canDelete: isOwn,
            };
            setSelectedMessage(config);
            setShowMessageActions(true);
        },
        [],
    );

    // Copy address helper
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    if (!chat) return null;

    const explorerUrl = chain?.explorerUrl
        ? `${chain.explorerUrl}/token/${chat.token_address}`
        : `https://etherscan.io/token/${chat.token_address}`;

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/60"
                        onClick={onClose}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="w-full h-full max-w-none max-h-none bg-zinc-900 flex flex-col overflow-hidden"
                            style={{
                                paddingTop: "env(safe-area-inset-top)",
                                paddingLeft: "env(safe-area-inset-left)",
                                paddingRight: "env(safe-area-inset-right)",
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="flex items-center gap-2 px-2 sm:px-3 py-2.5 border-b border-zinc-800 shrink-0">
                                <div
                                    className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                                    onClick={() => setShowInfo(!showInfo)}
                                >
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center text-xl shrink-0">
                                        {chat.emoji || "🪙"}
                                    </div>
                                    <div className="flex-1 min-w-0 pr-1">
                                        <div className="flex items-center gap-1.5">
                                            <h2 className="font-semibold text-white text-[15px] truncate leading-tight">
                                                {chat.name}
                                            </h2>
                                            {chat.is_official && (
                                                <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] font-bold rounded-full border border-emerald-500/30 shrink-0">
                                                    OFFICIAL
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setShowMembersList(true);
                                            }}
                                            className="text-zinc-500 text-xs truncate hover:text-zinc-300 transition-colors flex items-center gap-1 text-left w-full"
                                        >
                                            <svg
                                                className="w-3.5 h-3.5 shrink-0"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                                                />
                                            </svg>
                                            {memberCount} {memberCount === 1 ? "member" : "members"}
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                    {/* Token badge */}
                                    <span className="text-xs text-zinc-500 flex items-center gap-1 px-1.5">
                                        {chain?.icon} {chat.token_symbol}
                                    </span>
                                    {/* Info button */}
                                    <button
                                        onClick={() => setShowInfo(!showInfo)}
                                        className={`p-2.5 rounded-xl transition-colors ${
                                            showInfo
                                                ? "text-[#FF5500] bg-[#FF5500]/10"
                                                : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                                        }`}
                                        aria-label="Token info"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </button>
                                    {/* Close */}
                                    <button
                                        onClick={onClose}
                                        className="p-2.5 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white -mr-1"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Token Info Panel */}
                            <AnimatePresence>
                                {showInfo && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="border-b border-zinc-800 overflow-hidden"
                                    >
                                        <div className="bg-gradient-to-b from-zinc-800/80 to-zinc-900/80">
                                            {/* Hero Section */}
                                            <div className="relative h-36 bg-gradient-to-br from-amber-600/20 via-orange-500/10 to-zinc-900">
                                                {/* Decorative grid pattern */}
                                                <div className="absolute inset-0 opacity-10">
                                                    <div className="w-full h-full" style={{
                                                        backgroundImage: "radial-gradient(circle, rgba(255,85,0,0.3) 1px, transparent 1px)",
                                                        backgroundSize: "20px 20px",
                                                    }} />
                                                </div>
                                                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-zinc-900/90 to-transparent" />

                                                {/* Token badge overlay */}
                                                <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-orange-500/20 flex items-center justify-center text-2xl border-2 border-zinc-900">
                                                            {chat.emoji || "🪙"}
                                                        </div>
                                                        <div>
                                                            <h3 className="font-bold text-white text-lg drop-shadow-lg">
                                                                {chat.token_name} ({chat.token_symbol})
                                                            </h3>
                                                            <span className="text-xs text-zinc-300 flex items-center gap-1">
                                                                {chain?.icon} {chain?.name}
                                                                {chat.is_official && (
                                                                    <span className="ml-1 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] font-bold rounded-full border border-emerald-500/30">
                                                                        OFFICIAL
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {chat.min_balance_display &&
                                                        parseFloat(chat.min_balance_display) > 0 && (
                                                            <div className="bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                                                                <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                                </svg>
                                                                <span className="text-white text-xs font-semibold">
                                                                    {Number(chat.min_balance_display).toLocaleString()} {chat.token_symbol}
                                                                </span>
                                                            </div>
                                                        )}
                                                </div>
                                            </div>

                                            {/* Info Content */}
                                            <div className="p-4 space-y-4">
                                                {/* Contract Address */}
                                                <div className="flex items-start gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
                                                        <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">
                                                            Contract Address
                                                        </p>
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm text-zinc-200 font-mono truncate">
                                                                {chat.token_address}
                                                            </p>
                                                            <button
                                                                onClick={() => copyToClipboard(chat.token_address)}
                                                                className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
                                                                title="Copy address"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Chain & Explorer row */}
                                                <div className="flex gap-3">
                                                    <a
                                                        href={explorerUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex-1 flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors group"
                                                    >
                                                        <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                                            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                            </svg>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-xs text-zinc-500">Explorer</p>
                                                            <p className="text-sm text-zinc-200 truncate group-hover:text-blue-400 transition-colors">
                                                                View on {chain?.name || "Etherscan"}
                                                            </p>
                                                        </div>
                                                    </a>
                                                    <button
                                                        onClick={() => {
                                                            const inviteText = `Join the ${chat.name} token chat on Spritz!`;
                                                            navigator.clipboard.writeText(inviteText);
                                                        }}
                                                        className="py-3 px-4 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-white text-sm font-medium rounded-xl transition-all"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                                        </svg>
                                                    </button>
                                                </div>

                                                {/* Description */}
                                                {chat.description && (
                                                    <div className="p-3 bg-zinc-800/30 rounded-xl border border-zinc-700/50">
                                                        <p className="text-sm text-zinc-300 leading-relaxed">
                                                            {chat.description}
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Stats */}
                                                <div className="flex gap-3">
                                                    <div className="flex-1 p-3 bg-zinc-800/30 rounded-xl text-center">
                                                        <p className="text-2xl font-bold text-white">{memberCount}</p>
                                                        <p className="text-xs text-zinc-500">Members</p>
                                                    </div>
                                                    <div className="flex-1 p-3 bg-zinc-800/30 rounded-xl text-center">
                                                        <p className="text-2xl font-bold text-white">{messages.length}</p>
                                                        <p className="text-xs text-zinc-500">Messages</p>
                                                    </div>
                                                    <div className="flex-1 p-3 bg-zinc-800/30 rounded-xl text-center">
                                                        <p className="text-2xl">{chain?.icon || "🪙"}</p>
                                                        <p className="text-xs text-zinc-500">{chain?.name || "Chain"}</p>
                                                    </div>
                                                </div>

                                                {/* Token-gating info */}
                                                <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        <span className="text-amber-400 text-xs font-semibold">Token-Gated Access</span>
                                                    </div>
                                                    <p className="text-zinc-400 text-xs leading-relaxed">
                                                        {chat.min_balance_display && parseFloat(chat.min_balance_display) > 0
                                                            ? `Members must hold at least ${Number(chat.min_balance_display).toLocaleString()} ${chat.token_symbol} to join. Balance is checked across all connected wallets including EOA, Spritz Wallet, and Vaults.`
                                                            : `Open to all ${chat.token_symbol} holders. No minimum balance required.`}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Messages */}
                            <div
                                ref={messagesContainerRef}
                                onScroll={handleMessagesScroll}
                                className="flex-1 overflow-y-auto p-4 space-y-4"
                            >
                                {isLoading && messages.length === 0 ? (
                                    <ChatSkeleton />
                                ) : messages.length === 0 ? (
                                    <ChatEmptyState
                                        title="Start the conversation"
                                        subtitle={`Be the first to say something in ${chat.name}!`}
                                        icon={chat.emoji || "🪙"}
                                    />
                                ) : (
                                    <>
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

                                        {messages.map((msg, idx) => {
                                            const isOwn =
                                                msg.sender_address.toLowerCase() ===
                                                userAddress.toLowerCase();
                                            const showAvatar =
                                                idx === 0 ||
                                                messages[idx - 1].sender_address !== msg.sender_address;
                                            const isGif = isGifMessage(msg.content);
                                            const isPixelArt = isPixelArtMessage(msg.content);
                                            const pixelArtUrl = isPixelArt ? extractPixelArtUrl(msg.content) : null;
                                            const urls = !isGif && !isPixelArt ? detectUrls(msg.content) : [];
                                            const messageReactions = msgReactions[msg.id] || [];
                                            const hasReactions = messageReactions.some((r) => r.count > 0);

                                            return (
                                                <div
                                                    key={msg.id}
                                                    className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}
                                                >
                                                    {/* Avatar */}
                                                    {showAvatar && !isOwn ? (
                                                        <button
                                                            onClick={() => onOpenUserCard?.(msg.sender_address)}
                                                            className="shrink-0"
                                                        >
                                                            <AvatarWithStatus
                                                                name={getDisplayName(msg.sender_address)}
                                                                src={getAvatar(msg.sender_address)}
                                                                size="sm"
                                                            />
                                                        </button>
                                                    ) : !isOwn ? (
                                                        <div className="w-8" />
                                                    ) : null}

                                                    <div
                                                        className={`flex flex-col ${
                                                            isOwn ? "items-end" : "items-start"
                                                        } max-w-[75%]`}
                                                    >
                                                        {/* Sender name */}
                                                        {showAvatar && !isOwn && (
                                                            <span className="text-xs text-zinc-500 mb-1 ml-1">
                                                                {getDisplayName(msg.sender_address)}
                                                            </span>
                                                        )}

                                                        {/* Reply Preview */}
                                                        {msg.reply_to_message && (
                                                            <div
                                                                className={`mb-1 p-2 rounded-lg text-xs max-w-full ${
                                                                    isOwn
                                                                        ? "bg-white/10 border-l-2 border-white/40"
                                                                        : "bg-zinc-700/50 border-l-2 border-orange-500"
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-1.5 font-medium">
                                                                    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                                    </svg>
                                                                    <span className={isOwn ? "text-white/80" : "text-orange-400"}>
                                                                        {getDisplayName(msg.reply_to_message.sender_address)}
                                                                    </span>
                                                                </div>
                                                                <p className={`truncate mt-0.5 ${isOwn ? "text-white/60" : "text-zinc-400"}`}>
                                                                    {msg.reply_to_message.content}
                                                                </p>
                                                            </div>
                                                        )}

                                                        {/* Message Bubble */}
                                                        <div
                                                            onClick={() => handleMessagePress(msg, isOwn)}
                                                            className={`rounded-2xl cursor-pointer transition-colors ${
                                                                isGif || isPixelArt
                                                                    ? "p-0 bg-transparent"
                                                                    : isOwn
                                                                        ? "px-4 py-2.5 bg-[#FF5500] text-white rounded-br-md hover:bg-[#E64D00]"
                                                                        : "px-4 py-2.5 bg-zinc-800 text-zinc-100 rounded-bl-md hover:bg-zinc-750"
                                                            }`}
                                                        >
                                                            {isGif ? (
                                                                <img
                                                                    src={msg.content}
                                                                    alt="GIF"
                                                                    className="max-w-[250px] rounded-xl"
                                                                    loading="lazy"
                                                                />
                                                            ) : isPixelArt && pixelArtUrl ? (
                                                                <div
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setPreviewImage(pixelArtUrl);
                                                                    }}
                                                                >
                                                                    <PixelArtImage
                                                                        src={pixelArtUrl}
                                                                        alt="Pixel art"
                                                                        className="w-[200px] h-[200px] rounded-xl"
                                                                    />
                                                                </div>
                                                            ) : hasMarkdown(msg.content) ? (
                                                                <ChatMarkdown content={msg.content} isOwnMessage={isOwn} />
                                                            ) : (
                                                                <MentionText
                                                                    text={msg.content}
                                                                    currentUserAddress={userAddress}
                                                                    onMentionClick={onOpenUserCard}
                                                                />
                                                            )}
                                                        </div>

                                                        {/* Link Previews */}
                                                        {urls.length > 0 && (
                                                            <div className="mt-1 space-y-1 max-w-full">
                                                                {urls.slice(0, 1).map((url) => (
                                                                    <LinkPreview key={url} url={url} />
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Reactions */}
                                                        {hasReactions && (
                                                            <div className="mt-1">
                                                                <ReactionDisplay
                                                                    reactions={messageReactions}
                                                                    onReaction={(emoji) =>
                                                                        toggleMsgReaction(msg.id, emoji)
                                                                    }
                                                                />
                                                            </div>
                                                        )}

                                                        {/* Timestamp */}
                                                        <p className="text-[10px] text-zinc-600 mt-1 mx-1">
                                                            {timezone
                                                                ? formatTimeInTimezone(msg.created_at, timezone)
                                                                : new Date(msg.created_at).toLocaleTimeString([], {
                                                                      hour: "2-digit",
                                                                      minute: "2-digit",
                                                                  })}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}

                                <div ref={messagesEndRef} />
                            </div>

                            {/* Scroll to Bottom */}
                            <ScrollToBottom
                                containerRef={messagesContainerRef}
                                unreadCount={unreadCount}
                                onScrollToBottom={() => setUnreadCount(0)}
                            />

                            {/* Input Area */}
                            <div className="border-t border-zinc-800 bg-zinc-900">
                                {/* Reply indicator */}
                                {replyingTo && (
                                    <div className="px-4 pt-3 pb-0">
                                        <div className="flex items-center gap-2 p-2 bg-zinc-800/50 rounded-lg border-l-2 border-[#FF5500]">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs text-[#FF5500] font-medium">
                                                    Replying to {getDisplayName(replyingTo.sender_address)}
                                                </p>
                                                <p className="text-xs text-zinc-400 truncate">
                                                    {isGifMessage(replyingTo.content)
                                                        ? "GIF"
                                                        : isPixelArtMessage(replyingTo.content)
                                                            ? "Pixel Art"
                                                            : replyingTo.content}
                                                </p>
                                            </div>
                                            <button
                                                onClick={cancelReply}
                                                className="p-1 text-zinc-400 hover:text-white transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="p-4">
                                    <div className="flex items-end gap-2">
                                        {/* Attachment menu */}
                                        <ChatAttachmentMenu
                                            onPixelArt={() => setShowPixelArt(true)}
                                            onGif={handleSendGif}
                                            showLocation={false}
                                            isUploading={isUploading}
                                            disabled={isSending}
                                        />

                                        <MentionInput
                                            inputRef={inputRef}
                                            value={messageInput}
                                            onChange={(val) => {
                                                if (val.length > 10000) return;
                                                setMessageInput(val);
                                            }}
                                            onSubmit={handleSend}
                                            placeholder={
                                                replyingTo
                                                    ? "Type your reply..."
                                                    : `Message ${chat.name}...`
                                            }
                                            users={mentionableUsers}
                                            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF5500]/50 focus:border-[#FF5500]"
                                        />

                                        <button
                                            onClick={handleSend}
                                            disabled={!messageInput.trim() || isSending}
                                            className="p-3 bg-[#FF5500] hover:bg-[#E64D00] disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-xl transition-colors"
                                        >
                                            {isSending ? (
                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Pixel Art Editor */}
            {showPixelArt && (
                <PixelArtEditor
                    isOpen={showPixelArt}
                    onClose={() => setShowPixelArt(false)}
                    onSend={handleSendPixelArt}
                />
            )}

            {/* Message Action Bar */}
            <MessageActionBar
                isOpen={showMessageActions}
                onClose={() => {
                    setShowMessageActions(false);
                    setSelectedMessage(null);
                }}
                config={selectedMessage}
                callbacks={messageActionCallbacks}
                reactions={MESSAGE_REACTION_EMOJIS}
            />

            {/* Image Preview Modal */}
            <ImageViewerModal
                isOpen={!!previewImage}
                onClose={() => setPreviewImage(null)}
                imageUrl={previewImage ?? ""}
                alt="Shared image"
            />

            {/* Members List Panel */}
            <ChatMembersList
                channelId={chat.id}
                tokenChatId={chat.id}
                isOpen={showMembersList}
                onClose={() => setShowMembersList(false)}
                onUserClick={onOpenUserCard}
                getUserInfo={getUserInfo}
                currentUserAddress={userAddress}
            />
        </>
    );
}
