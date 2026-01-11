"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { AlphaMessage, AlphaMembership, AlphaMessageReaction } from "@/hooks/useAlphaChat";
import { ALPHA_REACTION_EMOJIS } from "@/hooks/useAlphaChat";
import { PixelArtEditor } from "./PixelArtEditor";
import { PixelArtImage } from "./PixelArtImage";
import { PixelArtShare } from "./PixelArtShare";
import { QuickReactionPicker } from "./EmojiPicker";
import { MentionInput, type MentionUser } from "./MentionInput";
import { MentionText } from "./MentionText";

// Helper to detect if a message is emoji-only (for larger display)
const EMOJI_REGEX = /^[\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Modifier_Base}\p{Emoji_Presentation}\u200d\ufe0f\s]+$/u;
const isEmojiOnly = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (!EMOJI_REGEX.test(trimmed)) return false;
    const emojiCount = [...trimmed].filter(char => /\p{Emoji}/u.test(char) && !/\d/u.test(char)).length;
    return emojiCount >= 1 && emojiCount <= 3;
};

interface AlphaChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string;
    // Shared hook state from parent
    alphaChat: {
        messages: AlphaMessage[];
        reactions: Record<string, AlphaMessageReaction[]>;
        membership: AlphaMembership | null;
        isMember: boolean;
        isLoading: boolean;
        isSending: boolean;
        replyingTo: AlphaMessage | null;
        sendMessage: (content: string, messageType?: "text" | "pixel_art", replyToId?: string) => Promise<boolean>;
        markAsRead: () => Promise<void>;
        toggleNotifications: () => Promise<boolean>;
        leaveChannel: () => Promise<boolean>;
        joinChannel: () => Promise<boolean>;
        setReplyingTo: (message: AlphaMessage | null) => void;
        toggleReaction: (messageId: string, emoji: string) => Promise<boolean>;
        refreshMessages?: () => Promise<void>;
    };
    // For displaying usernames/avatars
    getUserInfo?: (address: string) => {
        name: string | null;
        avatar: string | null;
    } | null;
    // For adding friends
    onAddFriend?: (address: string) => Promise<boolean>;
    // Check if already a friend
    isFriend?: (address: string) => boolean;
}

export function AlphaChatModal({
    isOpen,
    onClose,
    userAddress,
    alphaChat,
    getUserInfo,
    onAddFriend,
    isFriend,
}: AlphaChatModalProps) {
    const {
        messages,
        reactions,
        membership,
        isMember,
        isLoading,
        isSending,
        replyingTo,
        sendMessage,
        markAsRead,
        toggleNotifications,
        leaveChannel,
        joinChannel,
        setReplyingTo,
        toggleReaction,
        refreshMessages,
    } = alphaChat;
    
    const [isRefreshing, setIsRefreshing] = useState(false);

    const [newMessage, setNewMessage] = useState("");
    const [showPixelArt, setShowPixelArt] = useState(false);
    const [isUploadingPixelArt, setIsUploadingPixelArt] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);
    const [isJoining, setIsJoining] = useState(false);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [isAddingFriend, setIsAddingFriend] = useState(false);
    const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
    const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const userPopupRef = useRef<HTMLDivElement>(null);

    // Build list of mentionable users from message senders
    const mentionableUsers: MentionUser[] = useMemo(() => {
        const userMap = new Map<string, MentionUser>();
        
        // Add all message senders
        messages.forEach((msg) => {
            const address = msg.sender_address.toLowerCase();
            if (!userMap.has(address) && address !== userAddress.toLowerCase()) {
                const info = getUserInfo?.(msg.sender_address);
                userMap.set(address, {
                    address: msg.sender_address,
                    name: info?.name || null,
                    avatar: info?.avatar || null,
                });
            }
        });
        
        return Array.from(userMap.values());
    }, [messages, userAddress, getUserInfo]);

    // Handle mention click - show user popup
    const handleMentionClick = useCallback((address: string) => {
        setSelectedUser(address);
    }, []);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Scroll to bottom immediately when modal opens
    useEffect(() => {
        if (isOpen && messages.length > 0) {
            // Use setTimeout to ensure DOM is rendered
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
            }, 100);
        }
    }, [isOpen, messages.length]);

    // Mark as read when opening and when new messages arrive while open
    useEffect(() => {
        if (isOpen && isMember) {
            markAsRead();
        }
    }, [isOpen, isMember, markAsRead]);

    // Keep marking as read while modal is open (catches new messages)
    useEffect(() => {
        if (!isOpen || !isMember) return;
        
        // Mark as read periodically to catch any messages that come in while modal is open
        const interval = setInterval(() => {
            markAsRead();
        }, 2000);
        
        return () => clearInterval(interval);
    }, [isOpen, isMember, markAsRead]);

    // Close user popup when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (userPopupRef.current && !userPopupRef.current.contains(e.target as Node)) {
                setSelectedUser(null);
            }
        };
        if (selectedUser) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [selectedUser]);

    // Handle add friend
    const handleAddFriend = async (address: string) => {
        if (!onAddFriend) return;
        setIsAddingFriend(true);
        try {
            await onAddFriend(address);
            setSelectedUser(null);
        } finally {
            setIsAddingFriend(false);
        }
    };

    // Send message
    const handleSend = useCallback(async () => {
        if (!newMessage.trim() || isSending) return;

        const success = await sendMessage(newMessage.trim(), "text", replyingTo?.id);
        if (success) {
            setNewMessage("");
        }
    }, [newMessage, isSending, sendMessage, replyingTo]);

    // Handle reaction
    const handleReaction = async (messageId: string, emoji: string) => {
        await toggleReaction(messageId, emoji);
        setShowReactionPicker(null);
        setSelectedMessage(null);
    };

    // Toggle message selection for mobile tap actions
    const handleMessageTap = (messageId: string) => {
        setSelectedMessage(selectedMessage === messageId ? null : messageId);
        setShowReactionPicker(null);
    };

    // Close selected message when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('[data-message-actions]') && !target.closest('[data-message-bubble]')) {
                setSelectedMessage(null);
                setShowReactionPicker(null);
            }
        };
        if (selectedMessage) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [selectedMessage]);

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Handle pixel art send
    const handleSendPixelArt = useCallback(
        async (imageData: string) => {
            setIsUploadingPixelArt(true);

            try {
                const uploadResponse = await fetch("/api/pixel-art/upload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        imageData,
                        senderAddress: userAddress,
                    }),
                });

                const uploadResult = await uploadResponse.json();
                if (!uploadResult.success) {
                    throw new Error(uploadResult.error || "Failed to upload");
                }

                const pixelArtMessage = `[PIXEL_ART]${uploadResult.ipfsUrl}`;
                await sendMessage(pixelArtMessage, "pixel_art");
                setShowPixelArt(false);
            } catch (err) {
                console.error("[AlphaChat] Pixel art error:", err);
            } finally {
                setIsUploadingPixelArt(false);
            }
        },
        [userAddress, sendMessage]
    );

    // Handle leave
    const handleLeave = async () => {
        const confirmed = window.confirm(
            "Are you sure you want to leave the Alpha channel? You can rejoin anytime from the menu."
        );
        if (!confirmed) return;

        setIsLeaving(true);
        await leaveChannel();
        setIsLeaving(false);
        onClose();
    };

    // Handle join
    const handleJoin = async () => {
        setIsJoining(true);
        await joinChannel();
        setIsJoining(false);
    };

    // Check if message is pixel art
    const isPixelArtMessage = (content: string) =>
        content.startsWith("[PIXEL_ART]");
    const getPixelArtUrl = (content: string) =>
        content.replace("[PIXEL_ART]", "");

    // Format sender address
    const formatSender = (address: string) => {
        const info = getUserInfo?.(address);
        if (info?.name) return info.name;
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    const getSenderAvatar = (address: string) => {
        return getUserInfo?.(address)?.avatar || null;
    };

    // Get member count (we don't have this easily, so we'll show a placeholder)
    const memberCountDisplay = "Community";

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className={`fixed z-50 ${
                            isFullscreen
                                ? "top-4 left-0 right-0 bottom-0"
                                : "inset-4 bottom-32 sm:inset-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:max-h-[65vh] sm:h-[550px]"
                        }`}
                    >
                        <div className={`bg-zinc-900 h-full flex flex-col overflow-hidden ${
                            isFullscreen ? "" : "border border-zinc-800 rounded-2xl shadow-2xl"
                        }`}>
                            {/* Header */}
                            <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                                >
                                    <svg
                                        className="w-5 h-5 text-zinc-400"
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

                                <div className="flex-1 min-w-0">
                                    <h2 className="text-white font-semibold flex items-center gap-2">
                                        <span className="text-lg">🍊</span>
                                        Spritz Global Chat
                                    </h2>
                                    <p className="text-zinc-500 text-sm">
                                        {memberCountDisplay}
                                    </p>
                                </div>

                                {/* Refresh Button */}
                                {isMember && refreshMessages && (
                                    <button
                                        onClick={async () => {
                                            setIsRefreshing(true);
                                            await refreshMessages();
                                            setIsRefreshing(false);
                                        }}
                                        disabled={isRefreshing}
                                        className="p-2 rounded-lg transition-colors bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 disabled:opacity-50"
                                        title="Refresh messages"
                                    >
                                        <svg
                                            className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`}
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                            />
                                        </svg>
                                    </button>
                                )}

                                {/* Notification Toggle */}
                                {isMember && membership && (
                                    <button
                                        onClick={toggleNotifications}
                                        className={`p-2 rounded-lg transition-colors ${
                                            membership.notifications_muted
                                                ? "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                                                : "bg-[#FF5500]/20 text-[#FF5500]"
                                        }`}
                                        title={
                                            membership.notifications_muted
                                                ? "Notifications muted"
                                                : "Notifications enabled"
                                        }
                                    >
                                        {membership.notifications_muted ? (
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
                                                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                                />
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                                                />
                                            </svg>
                                        ) : (
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
                                                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                                />
                                            </svg>
                                        )}
                                    </button>
                                )}

                                {/* Fullscreen Toggle */}
                                <button
                                    onClick={() => setIsFullscreen(!isFullscreen)}
                                    className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
                                    title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                                >
                                    {isFullscreen ? (
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                                        </svg>
                                    )}
                                </button>

                                {/* Settings Menu */}
                                {isMember && (
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowSettings(!showSettings)}
                                            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                                        >
                                            <svg
                                                className="w-5 h-5 text-zinc-400"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                                                />
                                            </svg>
                                        </button>

                                        <AnimatePresence>
                                            {showSettings && (
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                                    className="absolute right-0 top-full mt-1 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-10"
                                                >
                                                    <button
                                                        onClick={() => {
                                                            setShowSettings(false);
                                                            handleLeave();
                                                        }}
                                                        disabled={isLeaving}
                                                        className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-zinc-700 transition-colors flex items-center gap-2"
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
                                                                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                                            />
                                                        </svg>
                                                        {isLeaving ? "Leaving..." : "Leave Channel"}
                                                    </button>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                {/* Close Button */}
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                                >
                                    <svg
                                        className="w-6 h-6 text-zinc-400"
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

                                {/* Alpha Icon */}
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center">
                                    <span className="text-lg">α</span>
                                </div>
                            </div>

                            {/* Not a member state */}
                            {!isMember && !isLoading && (
                                <div className="flex-1 flex items-center justify-center p-8">
                                    <div className="text-center">
                                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center mx-auto mb-4">
                                            <span className="text-4xl">🍊</span>
                                        </div>
                                        <h3 className="text-white text-xl font-semibold mb-2">
                                            Join the Spritz Global Chat
                                        </h3>
                                        <p className="text-zinc-400 text-sm mb-6 max-w-xs">
                                            Connect with the Spritz community! Get updates, share ideas, and meet other users.
                                        </p>
                                        <button
                                            onClick={handleJoin}
                                            disabled={isJoining}
                                            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                                        >
                                            {isJoining ? "Joining..." : "Join Channel"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Messages */}
                            {isMember && (
                                <>
                                    <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${isFullscreen ? "px-8" : ""}`}>
                                        {isLoading ? (
                                            <div className="flex items-center justify-center h-full">
                                                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                            </div>
                                        ) : messages.length === 0 ? (
                                            <div className="flex items-center justify-center h-full">
                                                <div className="text-center">
                                                    <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mx-auto mb-4">
                                                        <span className="text-2xl">💬</span>
                                                    </div>
                                                    <p className="text-zinc-400">
                                                        No messages yet
                                                    </p>
                                                    <p className="text-zinc-500 text-sm mt-1">
                                                        Be the first to say hello!
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            messages.map((msg, msgIndex) => {
                                                const isOwn =
                                                    msg.sender_address.toLowerCase() ===
                                                    userAddress.toLowerCase();
                                                const isPixelArt = isPixelArtMessage(msg.content);
                                                const senderAvatar = getSenderAvatar(msg.sender_address);
                                                // Only show user popup on the FIRST message from this sender to avoid duplicates
                                                const isFirstMessageFromSender = messages.findIndex(
                                                    m => m.sender_address.toLowerCase() === msg.sender_address.toLowerCase()
                                                ) === msgIndex;

                                                return (
                                                    <motion.div
                                                        key={msg.id}
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className={`flex gap-2 ${
                                                            isOwn ? "flex-row-reverse" : ""
                                                        }`}
                                                    >
                                                        {/* Avatar - clickable for non-own messages */}
                                                        {!isOwn && (
                                                            <div className="flex-shrink-0 relative">
                                                                <button
                                                                    onClick={() => setSelectedUser(msg.sender_address)}
                                                                    className="focus:outline-none focus:ring-2 focus:ring-orange-500/50 rounded-full"
                                                                >
                                                                    {senderAvatar ? (
                                                                        <img
                                                                            src={senderAvatar}
                                                                            alt=""
                                                                            className="w-8 h-8 rounded-full object-cover hover:ring-2 hover:ring-orange-500/50 transition-all"
                                                                        />
                                                                    ) : (
                                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white text-xs font-bold hover:ring-2 hover:ring-orange-500/50 transition-all">
                                                                            {formatSender(msg.sender_address)
                                                                                .slice(0, 2)
                                                                                .toUpperCase()}
                                                                        </div>
                                                                    )}
                                                                </button>
                                                                
                                                                {/* User popup - only render once per sender */}
                                                                {selectedUser === msg.sender_address && isFirstMessageFromSender && (
                                                                    <div
                                                                        ref={userPopupRef}
                                                                        className="absolute left-0 bottom-10 z-50 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl p-3 min-w-[200px]"
                                                                    >
                                                                        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-zinc-700">
                                                                            {senderAvatar ? (
                                                                                <img src={senderAvatar} alt="" className="w-10 h-10 rounded-full" />
                                                                            ) : (
                                                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold">
                                                                                    {formatSender(msg.sender_address).slice(0, 2).toUpperCase()}
                                                                                </div>
                                                                            )}
                                                                            <div className="flex-1 min-w-0">
                                                                                <p className="text-white font-medium text-sm truncate">
                                                                                    {formatSender(msg.sender_address)}
                                                                                </p>
                                                                                <p className="text-zinc-500 text-xs truncate">
                                                                                    {msg.sender_address.slice(0, 10)}...{msg.sender_address.slice(-6)}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                        
                                                                        {onAddFriend && (
                                                                            isFriend && isFriend(msg.sender_address) ? (
                                                                                <div className="flex items-center gap-2 text-emerald-400 text-sm">
                                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                                    </svg>
                                                                                    Already friends
                                                                                </div>
                                                                            ) : (
                                                                                <button
                                                                                    onClick={() => handleAddFriend(msg.sender_address)}
                                                                                    disabled={isAddingFriend}
                                                                                    className="w-full flex items-center gap-2 px-3 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                                                                >
                                                                                    {isAddingFriend ? (
                                                                                        <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                                                                                    ) : (
                                                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                                                                        </svg>
                                                                                    )}
                                                                                    Add Friend
                                                                                </button>
                                                                            )
                                                                        )}
                                                                        
                                                                        <button
                                                                            onClick={() => {
                                                                                navigator.clipboard.writeText(msg.sender_address);
                                                                                setSelectedUser(null);
                                                                            }}
                                                                            className="w-full flex items-center gap-2 px-3 py-2 mt-2 hover:bg-zinc-700 text-zinc-400 rounded-lg text-sm transition-colors"
                                                                        >
                                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                                            </svg>
                                                                            Copy Address
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        <div
                                                            data-message-bubble
                                                            onClick={() => handleMessageTap(msg.id)}
                                                            className={`${isFullscreen ? "max-w-[90%]" : "max-w-[75%]"} rounded-2xl px-4 py-2 relative cursor-pointer ${
                                                                isOwn
                                                                    ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-br-md"
                                                                    : "bg-zinc-800 text-white rounded-bl-md"
                                                            } ${selectedMessage === msg.id ? "ring-2 ring-orange-400/50" : ""}`}
                                                        >
                                                            {/* Reply Preview - More visible styling */}
                                                            {msg.reply_to && (
                                                                <div 
                                                                    className={`mb-2 p-2 rounded-lg ${
                                                                        isOwn 
                                                                            ? "bg-white/10 border-l-2 border-white/40" 
                                                                            : "bg-zinc-700/50 border-l-2 border-orange-500"
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center gap-1.5 text-xs font-medium">
                                                                        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                                        </svg>
                                                                        <span className={isOwn ? "text-white/80" : "text-orange-400"}>
                                                                            {formatSender(msg.reply_to.sender_address)}
                                                                        </span>
                                                                    </div>
                                                                    <p className={`text-xs mt-1 line-clamp-2 ${isOwn ? "text-white/70" : "text-zinc-400"}`}>
                                                                        {msg.reply_to.content}
                                                                    </p>
                                                                </div>
                                                            )}

                                                            {!isOwn && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedUser(msg.sender_address);
                                                                    }}
                                                                    className="text-xs text-orange-300 mb-1 font-medium hover:text-orange-200 transition-colors"
                                                                >
                                                                    {formatSender(msg.sender_address)}
                                                                </button>
                                                            )}
                                                            {isPixelArt ? (
                                                                <div className="relative group">
                                                                    <PixelArtImage
                                                                        src={getPixelArtUrl(msg.content)}
                                                                        size="md"
                                                                    />
                                                                    {/* Quick Share Actions */}
                                                                    <div 
                                                                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <PixelArtShare
                                                                            imageUrl={getPixelArtUrl(msg.content)}
                                                                            showQuickActions
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <p className={`break-words ${isEmojiOnly(msg.content) ? "text-4xl leading-tight" : ""}`}>
                                                                    <MentionText
                                                                        text={msg.content}
                                                                        currentUserAddress={userAddress}
                                                                        onMentionClick={handleMentionClick}
                                                                    />
                                                                </p>
                                                            )}

                                                            {/* Reactions Display */}
                                                            {reactions[msg.id]?.some(r => r.count > 0) && (
                                                                <div className="flex flex-wrap gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                                                                    {reactions[msg.id]
                                                                        ?.filter(r => r.count > 0)
                                                                        .map(reaction => (
                                                                            <button
                                                                                key={reaction.emoji}
                                                                                onClick={() => handleReaction(msg.id, reaction.emoji)}
                                                                                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-colors ${
                                                                                    reaction.hasReacted
                                                                                        ? isOwn ? "bg-white/30" : "bg-orange-500/30 text-orange-300"
                                                                                        : isOwn ? "bg-white/10 hover:bg-white/20" : "bg-zinc-700/50 hover:bg-zinc-600/50"
                                                                            }`}
                                                                            >
                                                                                <span>{reaction.emoji}</span>
                                                                                <span className="text-[10px]">{reaction.count}</span>
                                                                            </button>
                                                                        ))}
                                                                </div>
                                                            )}

                                                            <p
                                                                className={`text-xs mt-1 ${
                                                                    isOwn
                                                                        ? "text-white/70"
                                                                        : "text-zinc-500"
                                                                }`}
                                                            >
                                                                {new Date(
                                                                    msg.created_at
                                                                ).toLocaleTimeString([], {
                                                                    hour: "2-digit",
                                                                    minute: "2-digit",
                                                                })}
                                                            </p>

                                                            {/* Message Actions - Show on tap (mobile) or click */}
                                                            <AnimatePresence>
                                                                {selectedMessage === msg.id && (
                                                                    <motion.div
                                                                        data-message-actions
                                                                        initial={{ opacity: 0, scale: 0.9 }}
                                                                        animate={{ opacity: 1, scale: 1 }}
                                                                        exit={{ opacity: 0, scale: 0.9 }}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        className={`absolute ${isOwn ? "left-0 -translate-x-full pr-2" : "right-0 translate-x-full pl-2"} top-0 flex items-center gap-1 z-10`}
                                                                    >
                                                                        <button
                                                                            onClick={() => setShowReactionPicker(showReactionPicker === msg.id ? null : msg.id)}
                                                                            className="w-8 h-8 rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center text-sm shadow-lg border border-zinc-600"
                                                                            title="React"
                                                                        >
                                                                            😊
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                setReplyingTo(msg);
                                                                                setSelectedMessage(null);
                                                                            }}
                                                                            className="w-8 h-8 rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center shadow-lg border border-zinc-600"
                                                                            title="Reply"
                                                                        >
                                                                            <svg className="w-4 h-4 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                                            </svg>
                                                                        </button>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>

                                                            {/* Reaction Picker */}
                                                            {showReactionPicker === msg.id && (
                                                                <div 
                                                                    className={`absolute ${isOwn ? "right-0" : "left-0"} -top-12 z-20`}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <QuickReactionPicker
                                                                        isOpen={true}
                                                                        onClose={() => setShowReactionPicker(null)}
                                                                        onSelect={(emoji) => handleReaction(msg.id, emoji)}
                                                                        emojis={ALPHA_REACTION_EMOJIS}
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </motion.div>
                                                );
                                            })
                                        )}
                                        <div ref={messagesEndRef} />
                                    </div>

                                    {/* Reply Preview */}
                                    {replyingTo && (
                                        <div className="px-4 py-2 bg-zinc-800/50 border-t border-zinc-700 flex items-center gap-2">
                                            <div className="w-1 h-8 bg-orange-500 rounded-full" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs text-orange-400 font-medium">
                                                    Replying to {replyingTo.sender_address.toLowerCase() === userAddress.toLowerCase() ? "yourself" : formatSender(replyingTo.sender_address)}
                                                </p>
                                                <p className="text-xs text-zinc-400 truncate">{replyingTo.content}</p>
                                            </div>
                                            <button
                                                onClick={() => setReplyingTo(null)}
                                                className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    )}

                                    {/* Input */}
                                    <div className={`border-t border-zinc-800 ${isFullscreen ? "p-6 pb-8" : "p-4"}`}>
                                        <div className={`flex items-center ${isFullscreen ? "gap-3" : "gap-2"}`}>
                                            <button
                                                onClick={() => setShowPixelArt(true)}
                                                className={`rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-orange-400 transition-colors ${isFullscreen ? "p-4" : "p-3"}`}
                                                title="Send Pixel Art"
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    strokeWidth={2}
                                                    stroke="currentColor"
                                                    className={isFullscreen ? "w-6 h-6" : "w-5 h-5"}
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42"
                                                    />
                                                </svg>
                                            </button>
                                            <MentionInput
                                                value={newMessage}
                                                onChange={setNewMessage}
                                                onKeyDown={handleKeyPress}
                                                placeholder={replyingTo ? "Type your reply... (@ to mention)" : "Message the community... (@ to mention)"}
                                                users={mentionableUsers}
                                                className={`w-full bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20 transition-all ${
                                                    isFullscreen ? "py-4 px-5 text-lg" : "py-3 px-4"
                                                }`}
                                            />
                                            <button
                                                onClick={handleSend}
                                                disabled={!newMessage.trim() || isSending}
                                                className={`rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed ${isFullscreen ? "p-4" : "p-3"}`}
                                            >
                                                {isSending ? (
                                                    <svg
                                                        className={`${isFullscreen ? "w-6 h-6" : "w-5 h-5"} animate-spin`}
                                                        viewBox="0 0 24 24"
                                                        fill="none"
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
                                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                        />
                                                    </svg>
                                                ) : (
                                                    <svg
                                                        className={isFullscreen ? "w-6 h-6" : "w-5 h-5"}
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
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
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>

                    {/* Pixel Art Editor */}
                    <PixelArtEditor
                        isOpen={showPixelArt}
                        onClose={() => setShowPixelArt(false)}
                        onSend={handleSendPixelArt}
                        isSending={isUploadingPixelArt}
                    />
                </>
            )}
        </AnimatePresence>
    );
}

