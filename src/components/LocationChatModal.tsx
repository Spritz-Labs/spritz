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
                                    <div className="bg-gradient-to-b from-zinc-800/80 to-zinc-900/80">
                                        {/* Hero Section with Map */}
                                        <div className="relative h-44 sm:h-52">
                                            <iframe
                                                src={`https://www.openstreetmap.org/export/embed.html?bbox=${displayChat.longitude - 0.008},${displayChat.latitude - 0.005},${displayChat.longitude + 0.008},${displayChat.latitude + 0.005}&layer=mapnik&marker=${displayChat.latitude},${displayChat.longitude}`}
                                                className="w-full h-full border-0"
                                                title="Location Map"
                                                loading="lazy"
                                            />
                                            {/* Gradient overlay at bottom */}
                                            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-zinc-900/90 to-transparent" />
                                            
                                            {/* Place badge overlay */}
                                            <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-orange-600 shadow-lg shadow-orange-500/20 flex items-center justify-center text-2xl border-2 border-zinc-900">
                                                        {displayChat.emoji}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-white text-lg drop-shadow-lg">
                                                            {displayChat.google_place_name || displayChat.name}
                                                        </h3>
                                                        {displayChat.google_place_types?.[0] && (
                                                            <span className="text-xs text-zinc-300 capitalize">
                                                                {displayChat.google_place_types[0].replace(/_/g, " ")}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {displayChat.google_place_rating && (
                                                    <div className="bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                                                        <span className="text-amber-400">★</span>
                                                        <span className="text-white font-semibold text-sm">
                                                            {displayChat.google_place_rating.toFixed(1)}
                                                        </span>
                                                        {displayChat.google_place_user_ratings_total && (
                                                            <span className="text-zinc-400 text-xs">
                                                                ({displayChat.google_place_user_ratings_total > 999 
                                                                    ? `${(displayChat.google_place_user_ratings_total / 1000).toFixed(1)}k`
                                                                    : displayChat.google_place_user_ratings_total})
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Info Content */}
                                        <div className="p-4 space-y-4">
                                            {/* Address */}
                                            {(displayChat.google_place_address || displayChat.formatted_address) && (
                                                <div className="flex items-start gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
                                                        <svg className="w-4.5 h-4.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">Address</p>
                                                        <p className="text-sm text-zinc-200">
                                                            {displayChat.google_place_address || displayChat.formatted_address}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Phone & Website Row */}
                                            {(displayChat.google_place_phone || displayChat.google_place_website) && (
                                                <div className="flex gap-3">
                                                    {displayChat.google_place_phone && (
                                                        <a
                                                            href={`tel:${displayChat.google_place_phone}`}
                                                            className="flex-1 flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors group"
                                                        >
                                                            <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
                                                                <svg className="w-4.5 h-4.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                                                </svg>
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-xs text-zinc-500">Call</p>
                                                                <p className="text-sm text-zinc-200 truncate group-hover:text-green-400 transition-colors">
                                                                    {displayChat.google_place_phone}
                                                                </p>
                                                            </div>
                                                        </a>
                                                    )}
                                                    {displayChat.google_place_website && (
                                                        <a
                                                            href={displayChat.google_place_website}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex-1 flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors group"
                                                        >
                                                            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                                                <svg className="w-4.5 h-4.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                                                </svg>
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-xs text-zinc-500">Website</p>
                                                                <p className="text-sm text-zinc-200 truncate group-hover:text-blue-400 transition-colors">
                                                                    {new URL(displayChat.google_place_website).hostname.replace('www.', '')}
                                                                </p>
                                                            </div>
                                                        </a>
                                                    )}
                                                </div>
                                            )}

                                            {/* Description */}
                                            {displayChat.description && (
                                                <div className="p-3 bg-zinc-800/30 rounded-xl border border-zinc-700/50">
                                                    <p className="text-sm text-zinc-300 leading-relaxed">{displayChat.description}</p>
                                                </div>
                                            )}

                                            {/* Stats */}
                                            <div className="flex gap-3">
                                                <div className="flex-1 p-3 bg-zinc-800/30 rounded-xl text-center">
                                                    <p className="text-2xl font-bold text-white">{displayChat.member_count}</p>
                                                    <p className="text-xs text-zinc-500">Members</p>
                                                </div>
                                                <div className="flex-1 p-3 bg-zinc-800/30 rounded-xl text-center">
                                                    <p className="text-2xl font-bold text-white">{displayChat.message_count}</p>
                                                    <p className="text-xs text-zinc-500">Messages</p>
                                                </div>
                                                {displayChat.google_place_types && displayChat.google_place_types.length > 0 && (
                                                    <div className="flex-1 p-3 bg-zinc-800/30 rounded-xl text-center">
                                                        <p className="text-2xl">{
                                                            displayChat.google_place_types[0]?.includes('restaurant') ? '🍽️' :
                                                            displayChat.google_place_types[0]?.includes('cafe') ? '☕' :
                                                            displayChat.google_place_types[0]?.includes('bar') ? '🍺' :
                                                            displayChat.google_place_types[0]?.includes('hotel') ? '🏨' :
                                                            displayChat.google_place_types[0]?.includes('park') ? '🌳' :
                                                            displayChat.google_place_types[0]?.includes('museum') ? '🏛️' :
                                                            displayChat.google_place_types[0]?.includes('store') ? '🛍️' :
                                                            displayChat.google_place_types[0]?.includes('gym') ? '💪' :
                                                            displayChat.google_place_types[0]?.includes('airport') ? '✈️' :
                                                            displayChat.google_place_types[0]?.includes('hospital') ? '🏥' :
                                                            '📍'
                                                        }</p>
                                                        <p className="text-xs text-zinc-500 capitalize truncate">
                                                            {displayChat.google_place_types[0]?.replace(/_/g, " ")}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex gap-3 pt-1">
                                                <a
                                                    href={`https://www.google.com/maps/dir/?api=1&destination=${displayChat.latitude},${displayChat.longitude}&travelmode=walking`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-[#FF5500] to-[#FF7722] hover:from-[#E64D00] hover:to-[#FF5500] text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-orange-500/20"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                                    </svg>
                                                    Get Directions
                                                </a>
                                                <button
                                                    onClick={() => leaveChat().then(() => onClose())}
                                                    className="py-3 px-4 bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 text-zinc-400 text-sm font-medium rounded-xl transition-all border border-zinc-700 hover:border-red-500/50"
                                                >
                                                    Leave
                                                </button>
                                            </div>
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
