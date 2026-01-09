"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChannelMessages, CHANNEL_REACTION_EMOJIS } from "@/hooks/useChannels";
import type { PublicChannel } from "@/app/api/channels/route";
import { QuickReactionPicker } from "./EmojiPicker";

type ChannelChatModalProps = {
    isOpen: boolean;
    onClose: () => void;
    channel: PublicChannel;
    userAddress: string;
    onLeave: () => void;
    // For displaying usernames/avatars
    getUserInfo?: (address: string) => {
        name: string | null;
        avatar: string | null;
    } | null;
    // For adding friends
    onAddFriend?: (address: string) => Promise<boolean>;
    // Check if already a friend
    isFriend?: (address: string) => boolean;
};

export function ChannelChatModal({
    isOpen,
    onClose,
    channel,
    userAddress,
    onLeave,
    getUserInfo,
    onAddFriend,
    isFriend,
}: ChannelChatModalProps) {
    const { 
        messages, 
        reactions,
        isLoading, 
        sendMessage, 
        toggleReaction,
        replyingTo,
        setReplyingTo 
    } = useChannelMessages(channel.id, userAddress);
    const [inputValue, setInputValue] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [addingFriend, setAddingFriend] = useState<string | null>(null);
    const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
    const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Close user popup when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setSelectedUser(null);
        if (selectedUser) {
            document.addEventListener("click", handleClickOutside);
            return () => document.removeEventListener("click", handleClickOutside);
        }
    }, [selectedUser]);

    const handleSend = async () => {
        if (!inputValue.trim() || isSending) return;

        setIsSending(true);
        const content = inputValue.trim();
        setInputValue("");

        await sendMessage(content, "text", replyingTo?.id);
        setIsSending(false);
    };

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

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) {
            alert("Only JPEG, PNG, GIF, and WebP images are allowed");
            return;
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert("Image must be less than 5MB");
            return;
        }

        setIsUploading(true);

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("userAddress", userAddress);
            formData.append("context", "channel");

            const res = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to upload image");
            }

            // Send the image URL as a message
            await sendMessage(data.url, "image");
        } catch (error) {
            console.error("Failed to upload image:", error);
            alert("Failed to upload image. Please try again.");
        } finally {
            setIsUploading(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const handleAddFriend = async (address: string) => {
        if (!onAddFriend || addingFriend) return;
        setAddingFriend(address);
        try {
            await onAddFriend(address);
        } finally {
            setAddingFriend(null);
            setSelectedUser(null);
        }
    };

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    const formatAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    const formatSender = (address: string) => {
        const userInfo = getUserInfo?.(address);
        return userInfo?.name || formatAddress(address);
    };

    const getSenderAvatar = (address: string) => {
        return getUserInfo?.(address)?.avatar || null;
    };

    const isImageUrl = (content: string) => {
        return content.match(/\.(jpeg|jpg|gif|png|webp)$/i) || 
               content.includes("/storage/v1/object/public/chat-images/");
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center ${isFullscreen ? "pt-4" : "p-4"}`}
                style={isFullscreen ? {} : { paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 100px, 120px)' }}
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className={`bg-zinc-900 flex flex-col overflow-hidden ${
                        isFullscreen
                            ? "w-full h-full max-w-none max-h-none"
                            : "w-full max-w-2xl max-h-[70vh] h-[600px] border border-zinc-800 rounded-2xl"
                    }`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-xl">
                                {channel.emoji}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-white font-bold">{channel.name}</h2>
                                    {channel.is_official && (
                                        <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded">
                                            Official
                                        </span>
                                    )}
                                </div>
                                <p className="text-zinc-500 text-sm">
                                    {channel.member_count} members
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={onLeave}
                                className="px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            >
                                Leave
                            </button>
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
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {isLoading && messages.length === 0 ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-orange-500" />
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center">
                                <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-3xl mb-4">
                                    {channel.emoji}
                                </div>
                                <p className="text-zinc-400 mb-2">No messages yet</p>
                                <p className="text-zinc-600 text-sm">
                                    Be the first to say something!
                                </p>
                            </div>
                        ) : (
                            <>
                                {messages.map((msg, index) => {
                                    const isOwn =
                                        msg.sender_address.toLowerCase() ===
                                        userAddress.toLowerCase();
                                    const showSender =
                                        index === 0 ||
                                        messages[index - 1].sender_address !== msg.sender_address;
                                    const isImage = msg.message_type === "image" || isImageUrl(msg.content);
                                    const senderAvatar = getSenderAvatar(msg.sender_address);
                                    const isAlreadyFriend = isFriend?.(msg.sender_address) ?? false;

                                    return (
                                        <motion.div
                                            key={msg.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}
                                        >
                                            {/* Avatar - clickable for non-own messages */}
                                            {!isOwn && (
                                                <div className="flex-shrink-0 relative">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedUser(
                                                                selectedUser === msg.sender_address
                                                                    ? null
                                                                    : msg.sender_address
                                                            );
                                                        }}
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
                                                                {formatAddress(msg.sender_address)
                                                                    .slice(0, 2)
                                                                    .toUpperCase()}
                                                            </div>
                                                        )}
                                                    </button>

                                                    {/* User popup */}
                                                    <AnimatePresence>
                                                        {selectedUser === msg.sender_address && (
                                                            <motion.div
                                                                initial={{ opacity: 0, scale: 0.95 }}
                                                                animate={{ opacity: 1, scale: 1 }}
                                                                exit={{ opacity: 0, scale: 0.95 }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="absolute left-0 bottom-10 z-50 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl p-3 min-w-[200px]"
                                                            >
                                                                <div className="flex items-center gap-3 mb-3 pb-3 border-b border-zinc-700">
                                                                    {senderAvatar ? (
                                                                        <img src={senderAvatar} alt="" className="w-10 h-10 rounded-full" />
                                                                    ) : (
                                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold">
                                                                            {formatAddress(msg.sender_address).slice(0, 2).toUpperCase()}
                                                                        </div>
                                                                    )}
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-white font-medium text-sm truncate">
                                                                            {formatSender(msg.sender_address)}
                                                                        </p>
                                                                        <p className="text-zinc-500 text-xs truncate">
                                                                            {formatAddress(msg.sender_address)}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                {!isAlreadyFriend && onAddFriend && (
                                                                    <button
                                                                        onClick={() => handleAddFriend(msg.sender_address)}
                                                                        disabled={addingFriend === msg.sender_address}
                                                                        className="w-full px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                                                    >
                                                                        {addingFriend === msg.sender_address ? (
                                                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                                        ) : (
                                                                            <>
                                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                                                                </svg>
                                                                                Add Friend
                                                                            </>
                                                                        )}
                                                                    </button>
                                                                )}
                                                                {isAlreadyFriend && (
                                                                    <div className="flex items-center gap-2 text-emerald-400 text-sm">
                                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                        Already friends
                                                                    </div>
                                                                )}
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            )}

                                            {/* Message content */}
                                            <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"} max-w-[80%]`}>
                                                {showSender && !isOwn && (
                                                    <p className="text-xs text-zinc-500 mb-1 ml-1 font-medium">
                                                        {formatSender(msg.sender_address)}
                                                    </p>
                                                )}
                                                {isImage ? (
                                                    <div
                                                        className={`rounded-2xl overflow-hidden relative group ${
                                                            isOwn ? "rounded-br-md" : "rounded-bl-md"
                                                        }`}
                                                    >
                                                        <img
                                                            src={msg.content}
                                                            alt="Shared image"
                                                            className="max-w-full max-h-64 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                                            onClick={() => setPreviewImage(msg.content)}
                                                            onError={(e) => {
                                                                (e.target as HTMLImageElement).style.display = "none";
                                                            }}
                                                        />
                                                        {/* Download Button */}
                                                        <a
                                                            href={msg.content}
                                                            download="image.png"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="absolute top-1 right-1 p-1.5 bg-black/60 hover:bg-black/80 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                                            title="Download"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                            </svg>
                                                        </a>
                                                    </div>
                                                ) : (
                                                    <div
                                                        data-message-bubble
                                                        onClick={() => handleMessageTap(msg.id)}
                                                        className={`px-4 py-2 rounded-2xl relative cursor-pointer ${
                                                            isOwn
                                                                ? "bg-[#FF5500] text-white rounded-br-md"
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
                                                        
                                                        <p className="break-words whitespace-pre-wrap">{msg.content}</p>
                                                        
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
                                                        
                                                        {/* Message Actions - Show on tap (mobile) or hover (desktop) */}
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
                                                                    emojis={CHANNEL_REACTION_EMOJIS}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <p className="text-[10px] text-zinc-600 mt-1 px-1">
                                                    {formatTime(msg.created_at)}
                                                </p>
                                            </div>

                                            {/* Spacer for own messages (to match avatar space) */}
                                            {isOwn && <div className="w-8 flex-shrink-0" />}
                                        </motion.div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </>
                        )}
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
                    <div className="p-4 border-t border-zinc-800">
                        <div className="flex items-center gap-2">
                            {/* Image upload button */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/png,image/gif,image/webp"
                                onChange={handleImageSelect}
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploading}
                                className="p-3 bg-zinc-800 text-zinc-400 rounded-xl hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50"
                                title="Upload image"
                            >
                                {isUploading ? (
                                    <div className="w-5 h-5 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                )}
                            </button>
                            <input
                                ref={inputRef}
                                type="text"
                                inputMode="text"
                                enterKeyHint="send"
                                autoComplete="off"
                                autoCorrect="on"
                                autoCapitalize="sentences"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={`Message #${channel.name}`}
                                className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF5500]"
                            />
                            <button
                                onClick={handleSend}
                                disabled={!inputValue.trim() || isSending}
                                className="p-3 bg-[#FF5500] text-white rounded-xl hover:bg-[#FF6600] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSending ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
                </motion.div>

                {/* Image Preview Modal */}
                <AnimatePresence>
                    {previewImage && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/90 z-60 flex items-center justify-center p-4"
                            onClick={() => setPreviewImage(null)}
                        >
                            <div className="absolute top-4 right-4 flex gap-2">
                                <a
                                    href={previewImage}
                                    download="image.png"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                                    title="Download"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                </a>
                                <button
                                    className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                                    onClick={() => setPreviewImage(null)}
                                >
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <img
                                src={previewImage}
                                alt="Preview"
                                className="max-w-full max-h-full object-contain"
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </AnimatePresence>
    );
}
