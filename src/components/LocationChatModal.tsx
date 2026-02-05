"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { useLocationChat, type LocationChat, type LocationChatMessage } from "@/hooks/useLocationChat";
import { AvatarWithStatus } from "./OnlineStatus";
import { ChatSkeleton } from "./ChatSkeleton";
import { ChatEmptyState } from "./ChatEmptyState";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatTimeInTimezone } from "@/lib/timezone";
import {
    LocationMessage,
    isLocationMessage,
    parseLocationMessage,
    formatLocationMessage,
    type LocationData,
} from "./LocationMessage";

type LocationChatModalProps = {
    isOpen: boolean;
    onClose: () => void;
    locationChat: LocationChat;
    userAddress: string;
    getUserInfo?: (address: string) => { name: string | null; avatar: string | null } | null;
    onOpenUserCard?: (address: string) => void;
};

export function LocationChatModal({
    isOpen,
    onClose,
    locationChat,
    userAddress,
    getUserInfo,
    onOpenUserCard,
}: LocationChatModalProps) {
    const [newMessage, setNewMessage] = useState("");
    const [showInfo, setShowInfo] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const timezone = useUserTimezone();

    const {
        chat,
        messages,
        members,
        isMember,
        isLoading,
        error,
        isSending,
        sendMessage,
        joinChat,
        leaveChat,
    } = useLocationChat(isOpen ? locationChat.id : null, userAddress);

    // Auto-join when opening if not a member
    useEffect(() => {
        if (isOpen && !isMember && !isLoading) {
            joinChat();
        }
    }, [isOpen, isMember, isLoading, joinChat]);

    // Scroll to bottom when messages change
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

    const handleSend = useCallback(async () => {
        if (!newMessage.trim() || isSending) return;

        const content = newMessage.trim();
        setNewMessage("");
        await sendMessage(content);
    }, [newMessage, isSending, sendMessage]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const formatMessageTime = (timestamp: string) => {
        return formatTimeInTimezone(new Date(timestamp), timezone);
    };

    const getDisplayName = (address: string) => {
        const info = getUserInfo?.(address);
        if (info?.name) return info.name;
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    const getAvatar = (address: string) => {
        return getUserInfo?.(address)?.avatar || null;
    };

    if (!isOpen || typeof document === "undefined") return null;

    const displayChat = chat || locationChat;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="w-full h-full sm:w-[95%] sm:max-w-2xl sm:h-[90vh] sm:rounded-2xl bg-zinc-900 flex flex-col overflow-hidden"
                        style={{
                            paddingTop: "env(safe-area-inset-top, 0px)",
                            paddingBottom: "env(safe-area-inset-bottom, 0px)",
                        }}
                    >
                        {/* Header */}
                        <div className="flex items-center gap-3 p-4 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-sm">
                            <button
                                onClick={onClose}
                                className="p-2 -ml-2 text-zinc-400 hover:text-white transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>

                            <div
                                className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                                onClick={() => setShowInfo(!showInfo)}
                            >
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center text-xl">
                                    {displayChat.emoji}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h2 className="font-semibold text-white truncate">
                                        {displayChat.name}
                                    </h2>
                                    <p className="text-xs text-zinc-500 truncate">
                                        {displayChat.google_place_address || displayChat.formatted_address}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {displayChat.google_place_rating && (
                                    <span className="text-xs text-amber-400 flex items-center gap-1">
                                        ⭐ {displayChat.google_place_rating.toFixed(1)}
                                    </span>
                                )}
                                <button
                                    onClick={() => setShowInfo(!showInfo)}
                                    className="p-2 text-zinc-400 hover:text-white transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Info Panel */}
                        <AnimatePresence>
                            {showInfo && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="border-b border-zinc-800 overflow-hidden"
                                >
                                    <div className="p-4 space-y-3 bg-zinc-800/50">
                                        {displayChat.description && (
                                            <p className="text-sm text-zinc-400">{displayChat.description}</p>
                                        )}
                                        
                                        <div className="flex flex-wrap gap-2 text-xs">
                                            <span className="px-2 py-1 bg-zinc-700 rounded-full text-zinc-300">
                                                👥 {displayChat.member_count} members
                                            </span>
                                            <span className="px-2 py-1 bg-zinc-700 rounded-full text-zinc-300">
                                                💬 {displayChat.message_count} messages
                                            </span>
                                            {displayChat.google_place_types?.slice(0, 2).map((type) => (
                                                <span key={type} className="px-2 py-1 bg-zinc-700 rounded-full text-zinc-300">
                                                    {type.replace(/_/g, " ")}
                                                </span>
                                            ))}
                                        </div>

                                        {displayChat.google_place_website && (
                                            <a
                                                href={displayChat.google_place_website}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm text-[#FF5500] hover:underline flex items-center gap-1"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                </svg>
                                                Visit website
                                            </a>
                                        )}

                                        {/* Map Preview */}
                                        <div className="rounded-lg overflow-hidden h-32">
                                            <iframe
                                                src={`https://www.openstreetmap.org/export/embed.html?bbox=${displayChat.longitude - 0.005},${displayChat.latitude - 0.003},${displayChat.longitude + 0.005},${displayChat.latitude + 0.003}&layer=mapnik&marker=${displayChat.latitude},${displayChat.longitude}`}
                                                className="w-full h-full border-0"
                                                title="Location Map"
                                                loading="lazy"
                                            />
                                        </div>

                                        <div className="flex gap-2 pt-2">
                                            <a
                                                href={`https://www.google.com/maps/dir/?api=1&destination=${displayChat.latitude},${displayChat.longitude}&travelmode=walking`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex-1 py-2 px-3 bg-[#FF5500] hover:bg-[#E64D00] text-white text-sm font-medium rounded-lg text-center transition-colors"
                                            >
                                                Get Directions
                                            </a>
                                            <button
                                                onClick={() => leaveChat().then(() => onClose())}
                                                className="py-2 px-3 bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium rounded-lg transition-colors"
                                            >
                                                Leave Chat
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {isLoading ? (
                                <ChatSkeleton />
                            ) : messages.length === 0 ? (
                                <ChatEmptyState
                                    title="Start the conversation"
                                    subtitle={`Be the first to say something at ${displayChat.name}!`}
                                    icon="💬"
                                />
                            ) : (
                                messages.map((msg, idx) => {
                                    const isOwn = msg.sender_address.toLowerCase() === userAddress.toLowerCase();
                                    const showAvatar = idx === 0 || 
                                        messages[idx - 1].sender_address !== msg.sender_address;

                                    // Check for location message
                                    const isLocation = isLocationMessage(msg.content);
                                    const locationData = isLocation ? parseLocationMessage(msg.content) : null;

                                    return (
                                        <div
                                            key={msg.id}
                                            className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}
                                        >
                                            {/* Avatar */}
                                            {showAvatar && !isOwn ? (
                                                <button
                                                    onClick={() => onOpenUserCard?.(msg.sender_address)}
                                                    className="flex-shrink-0"
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

                                            <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"} max-w-[75%]`}>
                                                {/* Sender name */}
                                                {showAvatar && !isOwn && (
                                                    <span className="text-xs text-zinc-500 mb-1 ml-1">
                                                        {getDisplayName(msg.sender_address)}
                                                    </span>
                                                )}

                                                {/* Message bubble */}
                                                {isLocation && locationData ? (
                                                    <LocationMessage
                                                        location={locationData}
                                                        isOwn={isOwn}
                                                    />
                                                ) : (
                                                    <div
                                                        className={`px-4 py-2.5 rounded-2xl ${
                                                            isOwn
                                                                ? "bg-[#FF5500] text-white rounded-br-md"
                                                                : "bg-zinc-800 text-white rounded-bl-md"
                                                        }`}
                                                    >
                                                        <p className="text-sm whitespace-pre-wrap break-words">
                                                            {msg.content}
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Time */}
                                                <span className="text-[10px] text-zinc-600 mt-1 mx-1">
                                                    {formatMessageTime(msg.created_at)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="border-t border-zinc-800 p-4 bg-zinc-900">
                            {!isMember ? (
                                <button
                                    onClick={joinChat}
                                    className="w-full py-3 bg-[#FF5500] hover:bg-[#E64D00] text-white font-medium rounded-xl transition-colors"
                                >
                                    Join Chat to Send Messages
                                </button>
                            ) : (
                                <div className="flex items-end gap-2">
                                    <textarea
                                        ref={inputRef}
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder={`Message ${displayChat.name}...`}
                                        rows={1}
                                        className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 resize-none focus:outline-none focus:ring-2 focus:ring-[#FF5500]/50 focus:border-[#FF5500]"
                                        style={{ maxHeight: "120px" }}
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={!newMessage.trim() || isSending}
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
                            )}
                        </div>

                        {/* Decentralized indicator */}
                        <div className="px-4 py-2 bg-zinc-950 border-t border-zinc-800 flex items-center justify-center gap-2 text-xs text-zinc-500">
                            <svg className="w-3.5 h-3.5 text-[#FF5500]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <span>Decentralized chat via Logos</span>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
