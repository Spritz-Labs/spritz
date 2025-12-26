"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { AlphaMessage, AlphaMembership } from "@/hooks/useAlphaChat";
import { PixelArtEditor } from "./PixelArtEditor";
import { PixelArtImage } from "./PixelArtImage";

interface AlphaChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string;
    // Shared hook state from parent
    alphaChat: {
        messages: AlphaMessage[];
        membership: AlphaMembership | null;
        isMember: boolean;
        isLoading: boolean;
        isSending: boolean;
        sendMessage: (content: string, messageType?: "text" | "pixel_art") => Promise<boolean>;
        markAsRead: () => Promise<void>;
        toggleNotifications: () => Promise<boolean>;
        leaveChannel: () => Promise<boolean>;
        joinChannel: () => Promise<boolean>;
    };
    // For displaying usernames/avatars
    getUserInfo?: (address: string) => {
        name: string | null;
        avatar: string | null;
    } | null;
}

export function AlphaChatModal({
    isOpen,
    onClose,
    userAddress,
    alphaChat,
    getUserInfo,
}: AlphaChatModalProps) {
    const {
        messages,
        membership,
        isMember,
        isLoading,
        isSending,
        sendMessage,
        markAsRead,
        toggleNotifications,
        leaveChannel,
        joinChannel,
    } = alphaChat;

    const [newMessage, setNewMessage] = useState("");
    const [showPixelArt, setShowPixelArt] = useState(false);
    const [isUploadingPixelArt, setIsUploadingPixelArt] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [isLeaving, setIsLeaving] = useState(false);
    const [isJoining, setIsJoining] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Mark as read when opening
    useEffect(() => {
        if (isOpen && isMember) {
            markAsRead();
        }
    }, [isOpen, isMember, markAsRead]);

    // Send message
    const handleSend = useCallback(async () => {
        if (!newMessage.trim() || isSending) return;

        const success = await sendMessage(newMessage.trim());
        if (success) {
            setNewMessage("");
        }
    }, [newMessage, isSending, sendMessage]);

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
                        className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:h-[600px] z-50"
                    >
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl h-full flex flex-col overflow-hidden">
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
                                        <span className="text-lg">🚀</span>
                                        Alpha Channel
                                    </h2>
                                    <p className="text-zinc-500 text-sm">
                                        {memberCountDisplay}
                                    </p>
                                </div>

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

                                {/* Alpha Icon */}
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                    <span className="text-lg">α</span>
                                </div>
                            </div>

                            {/* Not a member state */}
                            {!isMember && !isLoading && (
                                <div className="flex-1 flex items-center justify-center p-8">
                                    <div className="text-center">
                                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mx-auto mb-4">
                                            <span className="text-4xl">🚀</span>
                                        </div>
                                        <h3 className="text-white text-xl font-semibold mb-2">
                                            Join the Alpha Channel
                                        </h3>
                                        <p className="text-zinc-400 text-sm mb-6 max-w-xs">
                                            Connect with the Spritz community! Get updates, share ideas, and meet other users.
                                        </p>
                                        <button
                                            onClick={handleJoin}
                                            disabled={isJoining}
                                            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                                        >
                                            {isJoining ? "Joining..." : "Join Channel"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Messages */}
                            {isMember && (
                                <>
                                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                        {isLoading ? (
                                            <div className="flex items-center justify-center h-full">
                                                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                            </div>
                                        ) : messages.length === 0 ? (
                                            <div className="flex items-center justify-center h-full">
                                                <div className="text-center">
                                                    <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
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
                                            messages.map((msg) => {
                                                const isOwn =
                                                    msg.sender_address.toLowerCase() ===
                                                    userAddress.toLowerCase();
                                                const isPixelArt = isPixelArtMessage(msg.content);
                                                const senderAvatar = getSenderAvatar(msg.sender_address);

                                                return (
                                                    <motion.div
                                                        key={msg.id}
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className={`flex gap-2 ${
                                                            isOwn ? "flex-row-reverse" : ""
                                                        }`}
                                                    >
                                                        {/* Avatar */}
                                                        {!isOwn && (
                                                            <div className="flex-shrink-0">
                                                                {senderAvatar ? (
                                                                    <img
                                                                        src={senderAvatar}
                                                                        alt=""
                                                                        className="w-8 h-8 rounded-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                                                                        {formatSender(msg.sender_address)
                                                                            .slice(0, 2)
                                                                            .toUpperCase()}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        <div
                                                            className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                                                                isOwn
                                                                    ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-br-md"
                                                                    : "bg-zinc-800 text-white rounded-bl-md"
                                                            }`}
                                                        >
                                                            {!isOwn && (
                                                                <p className="text-xs text-purple-300 mb-1 font-medium">
                                                                    {formatSender(msg.sender_address)}
                                                                </p>
                                                            )}
                                                            {isPixelArt ? (
                                                                <PixelArtImage
                                                                    src={getPixelArtUrl(msg.content)}
                                                                    size="md"
                                                                />
                                                            ) : (
                                                                <p className="break-words">
                                                                    {msg.content}
                                                                </p>
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
                                                        </div>
                                                    </motion.div>
                                                );
                                            })
                                        )}
                                        <div ref={messagesEndRef} />
                                    </div>

                                    {/* Input */}
                                    <div className="p-4 border-t border-zinc-800">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setShowPixelArt(true)}
                                                className="p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-purple-400 transition-colors"
                                                title="Send Pixel Art"
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    strokeWidth={2}
                                                    stroke="currentColor"
                                                    className="w-5 h-5"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42"
                                                    />
                                                </svg>
                                            </button>
                                            <input
                                                type="text"
                                                value={newMessage}
                                                onChange={(e) => setNewMessage(e.target.value)}
                                                onKeyPress={handleKeyPress}
                                                placeholder="Message the community..."
                                                className="flex-1 py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all"
                                            />
                                            <button
                                                onClick={handleSend}
                                                disabled={!newMessage.trim() || isSending}
                                                className="p-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isSending ? (
                                                    <svg
                                                        className="w-5 h-5 animate-spin"
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
                                                        className="w-5 h-5"
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

