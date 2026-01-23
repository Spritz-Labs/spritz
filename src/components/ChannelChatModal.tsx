"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChannelMessages, CHANNEL_REACTION_EMOJIS } from "@/hooks/useChannels";
import type { PublicChannel } from "@/app/api/channels/route";
import { QuickReactionPicker } from "./EmojiPicker";
import { MentionInput, type MentionUser } from "./MentionInput";
import { MentionText } from "./MentionText";
import { PixelArtEditor } from "./PixelArtEditor";
import { PixelArtImage } from "./PixelArtImage";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Helper to detect if a message is emoji-only (for larger display)
const EMOJI_REGEX = /^[\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Modifier_Base}\p{Emoji_Presentation}\u200d\ufe0f\s]+$/u;
const isEmojiOnly = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (!EMOJI_REGEX.test(trimmed)) return false;
    const emojiCount = [...trimmed].filter(char => /\p{Emoji}/u.test(char) && !/\d/u.test(char)).length;
    return emojiCount >= 1 && emojiCount <= 3;
};

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
    // Notification controls
    notificationsEnabled?: boolean;
    onToggleNotifications?: () => void;
    onSetActiveChannel?: (channelId: string | null) => void;
    // Admin controls
    isAdmin?: boolean;
    // Callback when message is sent (for updating chat order)
    onMessageSent?: () => void;
};

export function ChannelChatModal({
    isOpen,
    onClose,
    channel,
    userAddress,
    onLeave,
    onMessageSent,
    getUserInfo,
    onAddFriend,
    isFriend,
    notificationsEnabled = false,
    onToggleNotifications,
    onSetActiveChannel,
    isAdmin = false,
}: ChannelChatModalProps) {
    const { 
        messages, 
        pinnedMessages,
        reactions,
        isLoading,
        isLoadingMore,
        hasMore,
        sendMessage, 
        toggleReaction,
        togglePinMessage,
        loadMoreMessages,
        replyingTo,
        setReplyingTo 
    } = useChannelMessages(channel.id, userAddress);
    const [inputValue, setInputValue] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [showPixelArt, setShowPixelArt] = useState(false);
    const [isUploadingPixelArt, setIsUploadingPixelArt] = useState(false);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [userPopupPosition, setUserPopupPosition] = useState<{ x: number; y: number } | null>(null);
    const [addingFriend, setAddingFriend] = useState<string | null>(null);
    const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
    const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(true);
    const [showPinnedMessages, setShowPinnedMessages] = useState(false);
    const [pinningMessage, setPinningMessage] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const previousScrollHeightRef = useRef<number>(0);

    // Local cache for user info fetched from API
    const [localUserInfoCache, setLocalUserInfoCache] = useState<
        Map<string, { name: string | null; avatar: string | null }>
    >(new Map());

    // Combined getUserInfo that checks local cache first, then falls back to prop
    const getEffectiveUserInfo = useCallback((address: string) => {
        // Check prop first
        const propInfo = getUserInfo?.(address);
        if (propInfo) return propInfo;
        // Check local cache
        return localUserInfoCache.get(address.toLowerCase()) || null;
    }, [getUserInfo, localUserInfoCache]);

    // Fetch AI agents in this channel
    const [channelAgents, setChannelAgents] = useState<MentionUser[]>([]);
    useEffect(() => {
        async function fetchAgents() {
            try {
                const res = await fetch(`/api/channels/${channel.id}/agents`);
                if (res.ok) {
                    const data = await res.json();
                    const agents: MentionUser[] = (data.agents || []).map((agent: any) => ({
                        address: agent.id, // Use agent ID as "address" for mentions
                        name: agent.name,
                        avatar: agent.avatar_url || null,
                        avatarEmoji: agent.avatar_emoji,
                        isAgent: true,
                    }));
                    setChannelAgents(agents);
                }
            } catch (err) {
                console.error("[ChannelChat] Error fetching channel agents:", err);
            }
        }
        if (isOpen && channel.id) {
            fetchAgents();
        }
    }, [isOpen, channel.id]);

    // Build list of mentionable users from message senders + channel agents
    const mentionableUsers: MentionUser[] = useMemo(() => {
        const userMap = new Map<string, MentionUser>();
        
        // Add channel agents first (so they appear at the top)
        channelAgents.forEach((agent) => {
            userMap.set(agent.address, agent);
        });
        
        messages.forEach((msg) => {
            const address = msg.sender_address.toLowerCase();
            if (!userMap.has(address) && address !== userAddress.toLowerCase()) {
                const info = getEffectiveUserInfo(msg.sender_address);
                userMap.set(address, {
                    address: msg.sender_address,
                    name: info?.name || null,
                    avatar: info?.avatar || null,
                });
            }
        });
        
        return Array.from(userMap.values());
    }, [messages, userAddress, getEffectiveUserInfo, channelAgents]);

    // Handle mention click
    const handleMentionClick = useCallback((address: string, event?: React.MouseEvent) => {
        if (event) {
            const rect = (event.target as HTMLElement).getBoundingClientRect();
            setUserPopupPosition({ x: rect.left, y: rect.bottom + 8 });
        }
        setSelectedUser(address);
    }, []);
    
    // Handle user click with position tracking
    const handleUserClick = useCallback((address: string, event: React.MouseEvent) => {
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const popupHeight = 250;
        const y = rect.bottom + 8;
        const adjustedY = y + popupHeight > viewportHeight ? rect.top - popupHeight - 8 : y;
        setUserPopupPosition({ x: Math.max(8, rect.left), y: Math.max(8, adjustedY) });
        setSelectedUser(address);
    }, []);

    // Scroll to bottom only for new messages (not when loading older ones)
    const lastMessageIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            // Only scroll to bottom if there's a new message at the end
            if (lastMessage.id !== lastMessageIdRef.current) {
                lastMessageIdRef.current = lastMessage.id;
                // Only auto-scroll if we're near the bottom already
                const container = messagesContainerRef.current;
                if (container) {
                    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
                    if (isNearBottom) {
                        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                    }
                }
            }
        }
    }, [messages]);

    // Preserve scroll position when loading older messages
    useEffect(() => {
        const container = messagesContainerRef.current;
        if (container && previousScrollHeightRef.current > 0) {
            const newScrollHeight = container.scrollHeight;
            const scrollDiff = newScrollHeight - previousScrollHeightRef.current;
            if (scrollDiff > 0) {
                container.scrollTop = scrollDiff;
            }
            previousScrollHeightRef.current = 0;
        }
    }, [messages]);

    // Handle scroll to load more messages
    const handleScroll = useCallback(() => {
        const container = messagesContainerRef.current;
        if (!container || isLoadingMore || !hasMore) return;

        // Load more when scrolled near the top (within 100px)
        if (container.scrollTop < 100) {
            previousScrollHeightRef.current = container.scrollHeight;
            loadMoreMessages();
        }
    }, [isLoadingMore, hasMore, loadMoreMessages]);

    // Fetch user info for message senders not in cache
    useEffect(() => {
        if (!messages || messages.length === 0) return;

        const uniqueSenders = new Set<string>();
        messages.forEach((msg) => {
            const sender = msg.sender_address.toLowerCase();
            // Skip current user
            if (sender !== userAddress.toLowerCase()) {
                uniqueSenders.add(sender);
            }
        });

        // Only fetch for senders not in cache (check both getUserInfo and local cache)
        const sendersToFetch = Array.from(uniqueSenders).filter(
            (address) => !getUserInfo?.(address) && !localUserInfoCache.has(address)
        );

        // Fetch user info for all unique senders not in cache
        sendersToFetch.forEach((address) => {
            fetch(`/api/public/user?address=${encodeURIComponent(address)}`)
                .then((res) => res.json())
                .then((data) => {
                    if (data.user) {
                        const name = data.user.username
                            ? `@${data.user.username}`
                            : data.user.display_name ||
                              data.user.ens_name ||
                              null;
                        const userInfo = {
                            name,
                            avatar: data.user.avatar_url || null,
                        };
                        setLocalUserInfoCache((prev) => {
                            if (prev.has(address.toLowerCase())) {
                                return prev;
                            }
                            return new Map(prev).set(address.toLowerCase(), userInfo);
                        });
                    }
                })
                .catch((err) => {
                    console.error("[ChannelChat] Error fetching user info for", address, err);
                });
        });
    }, [messages, userAddress, getUserInfo, localUserInfoCache]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Track active channel for notification suppression
    useEffect(() => {
        if (isOpen) {
            onSetActiveChannel?.(channel.id);
        } else {
            onSetActiveChannel?.(null);
        }
        return () => {
            onSetActiveChannel?.(null);
        };
    }, [isOpen, channel.id, onSetActiveChannel]);

    // Close user popup when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setSelectedUser(null);
        if (selectedUser) {
            document.addEventListener("click", handleClickOutside);
            return () => document.removeEventListener("click", handleClickOutside);
        }
    }, [selectedUser]);

    // Auto-focus input when replying to a message
    useEffect(() => {
        if (replyingTo) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [replyingTo]);

    const handleSend = async () => {
        if (!inputValue.trim() || isSending) return;

        setIsSending(true);
        const content = inputValue.trim();
        setInputValue("");

        await sendMessage(content, "text", replyingTo?.id);
        setIsSending(false);
        
        // Notify parent that message was sent (for updating chat order)
        onMessageSent?.();
    };

    // Handle sending pixel art
    const handleSendPixelArt = async (imageData: string) => {
        setIsUploadingPixelArt(true);
        try {
            // Convert base64 to blob
            const response = await fetch(imageData);
            const blob = await response.blob();
            const file = new File([blob], "pixel-art.png", { type: "image/png" });
            
            // Upload to storage
            const formData = new FormData();
            formData.append("file", file);
            formData.append("userAddress", userAddress);
            
            const uploadRes = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });
            
            if (!uploadRes.ok) throw new Error("Upload failed");
            
            const { url } = await uploadRes.json();
            
            // Send as pixel art message
            await sendMessage(url, "pixel_art");
            setShowPixelArt(false);
            onMessageSent?.();
        } catch (error) {
            console.error("Failed to send pixel art:", error);
            alert("Failed to send pixel art. Please try again.");
        } finally {
            setIsUploadingPixelArt(false);
        }
    };

    const handleReaction = async (messageId: string, emoji: string) => {
        await toggleReaction(messageId, emoji);
        setShowReactionPicker(null);
        setSelectedMessage(null);
    };

    const handlePinMessage = async (messageId: string, currentlyPinned: boolean) => {
        if (!isAdmin || pinningMessage) return;
        
        setPinningMessage(messageId);
        try {
            await togglePinMessage(messageId, !currentlyPinned);
        } finally {
            setPinningMessage(null);
            setSelectedMessage(null);
        }
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
            // Notify parent that message was sent (for updating chat order)
            onMessageSent?.();
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

    // Agent info cache for displaying agent messages
    const [agentInfoCache, setAgentInfoCache] = useState<Map<string, { name: string; avatar_url?: string; avatar_emoji: string }>>(new Map());
    
    // Fetch agent info when we see agent messages
    useEffect(() => {
        const agentIds = messages
            .filter(m => m.sender_address.startsWith("agent:"))
            .map(m => m.sender_address.replace("agent:", ""))
            .filter(id => !agentInfoCache.has(id));
        
        if (agentIds.length === 0) return;
        
        const uniqueIds = [...new Set(agentIds)];
        uniqueIds.forEach(async (agentId) => {
            try {
                const res = await fetch(`/api/public/agents/${agentId}`);
                if (res.ok) {
                    const agent = await res.json();
                    setAgentInfoCache(prev => new Map(prev).set(agentId, {
                        name: agent.name,
                        avatar_url: agent.avatar_url,
                        avatar_emoji: agent.avatar_emoji || "🤖",
                    }));
                }
            } catch (err) {
                console.error("[ChannelChat] Error fetching agent info:", err);
            }
        });
    }, [messages, agentInfoCache]);
    
    // Check if sender is an agent
    const isAgentMessage = (address: string) => address.startsWith("agent:");
    const getAgentId = (address: string) => address.replace("agent:", "");

    const formatSender = (address: string) => {
        // Check for agent messages
        if (address.startsWith("agent:")) {
            const agentId = address.replace("agent:", "");
            const agentInfo = agentInfoCache.get(agentId);
            return agentInfo?.name || "AI Agent";
        }
        const userInfo = getEffectiveUserInfo(address);
        return userInfo?.name || formatAddress(address);
    };

    const getSenderAvatar = (address: string) => {
        // Check for agent messages
        if (address.startsWith("agent:")) {
            const agentId = address.replace("agent:", "");
            const agentInfo = agentInfoCache.get(agentId);
            return agentInfo?.avatar_url || null;
        }
        return getEffectiveUserInfo(address)?.avatar || null;
    };
    
    const getSenderAvatarEmoji = (address: string) => {
        if (address.startsWith("agent:")) {
            const agentId = address.replace("agent:", "");
            const agentInfo = agentInfoCache.get(agentId);
            return agentInfo?.avatar_emoji || "🤖";
        }
        return null;
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
                className={`fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center ${isFullscreen ? "" : "p-4"}`}
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
                    style={isFullscreen ? {
                        paddingTop: 'env(safe-area-inset-top)',
                        paddingLeft: 'env(safe-area-inset-left)',
                        paddingRight: 'env(safe-area-inset-right)',
                    } : undefined}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header - unified mobile-first design */}
                    <div className="flex items-center gap-2 px-2 sm:px-3 py-2.5 border-b border-zinc-800">
                        {/* Avatar */}
                        <div className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-lg ml-1">
                                {channel.emoji}
                            </div>

                        {/* Title area - takes remaining space */}
                        <div className="flex-1 min-w-0 pr-1">
                            <div className="flex items-center gap-1.5">
                                <h2 className="text-white font-semibold text-[15px] truncate leading-tight">
                                    {channel.name}
                                </h2>
                                    {channel.is_official && (
                                    <span className="shrink-0 px-1 py-0.5 bg-orange-500/20 text-orange-400 text-[10px] rounded font-medium">
                                        ✓
                                        </span>
                                    )}
                                </div>
                            <p className="text-zinc-500 text-xs truncate">
                                    {channel.member_count} members
                                </p>
                            </div>

                        {/* Action buttons */}
                        <div className="shrink-0 flex items-center">
                            {/* Pinned Messages - icon only */}
                            {pinnedMessages.length > 0 && (
                                <button
                                    onClick={() => setShowPinnedMessages(!showPinnedMessages)}
                                    className={`p-2.5 rounded-xl flex items-center gap-1 transition-colors ${
                                        showPinnedMessages
                                            ? "bg-amber-500/20 text-amber-400"
                                            : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                                    }`}
                                    aria-label="View pinned messages"
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
                                    </svg>
                                    <span className="hidden sm:inline text-xs font-medium">{pinnedMessages.length}</span>
                                </button>
                            )}
                            
                            {/* Notification Toggle - hidden on small mobile */}
                            {onToggleNotifications && (
                                <button
                                    onClick={onToggleNotifications}
                                    className={`hidden sm:flex p-2.5 rounded-xl transition-colors ${
                                        notificationsEnabled
                                            ? "text-[#FF5500] bg-[#FF5500]/10"
                                            : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                                    }`}
                                    aria-label={notificationsEnabled ? "Mute notifications" : "Enable notifications"}
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    {notificationsEnabled ? (
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                        ) : (
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                        )}
                                    </svg>
                                </button>
                            )}

                            {/* Leave button - text on desktop, icon on mobile */}
                            <button
                                onClick={onLeave}
                                className="p-2.5 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                                aria-label="Leave channel"
                            >
                                <svg className="w-5 h-5 sm:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                <span className="hidden sm:inline text-sm">Leave</span>
                            </button>

                            {/* Close button (X) */}
                            <button
                                onClick={onClose}
                                className="p-2.5 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white -mr-1"
                                aria-label="Close chat"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>


                    {/* Pinned Messages Panel */}
                    <AnimatePresence>
                        {showPinnedMessages && pinnedMessages.length > 0 && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="border-b border-zinc-800 overflow-hidden"
                            >
                                <div className="p-3 bg-amber-500/5 max-h-48 overflow-y-auto">
                                    <div className="flex items-center gap-2 mb-2 text-amber-400">
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                                        </svg>
                                        <span className="text-sm font-medium">Pinned Messages</span>
                                    </div>
                                    <div className="space-y-2">
                                        {pinnedMessages.map((msg) => (
                                            <div
                                                key={msg.id}
                                                className="flex items-start gap-2 p-2 bg-zinc-800/50 rounded-lg group"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-zinc-400 mb-0.5">
                                                        {formatSender(msg.sender_address)}
                                                    </p>
                                                    <p className="text-sm text-white truncate">
                                                        {msg.content}
                                                    </p>
                                                </div>
                                                {isAdmin && (
                                                    <button
                                                        onClick={() => handlePinMessage(msg.id, true)}
                                                        disabled={pinningMessage === msg.id}
                                                        className="p-1 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                                        title="Unpin message"
                                                    >
                                                        {pinningMessage === msg.id ? (
                                                            <div className="w-4 h-4 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                                                        ) : (
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Messages */}
                    <div 
                        ref={messagesContainerRef}
                        onScroll={handleScroll}
                        className="flex-1 overflow-y-auto p-4 space-y-3"
                    >
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
                                {/* Loading indicator for older messages */}
                                {isLoadingMore && (
                                    <div className="flex justify-center py-4">
                                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-zinc-600 border-t-orange-500" />
                                    </div>
                                )}
                                {/* "Load more" indicator when there's more history */}
                                {!isLoadingMore && hasMore && messages.length > 0 && (
                                    <div className="flex justify-center py-2">
                                        <span className="text-xs text-zinc-500">Scroll up to load more</span>
                                    </div>
                                )}
                                {messages.map((msg, index) => {
                                    const isOwn =
                                        msg.sender_address.toLowerCase() ===
                                        userAddress.toLowerCase();
                                    const isAgent = isAgentMessage(msg.sender_address);
                                    const showSender =
                                        index === 0 ||
                                        messages[index - 1].sender_address !== msg.sender_address;
                                    const isPixelArt = msg.message_type === "pixel_art";
                                    const isImage = !isPixelArt && (msg.message_type === "image" || isImageUrl(msg.content));
                                    const senderAvatar = getSenderAvatar(msg.sender_address);
                                    const senderAvatarEmoji = getSenderAvatarEmoji(msg.sender_address);
                                    const isAlreadyFriend = !isAgent && (isFriend?.(msg.sender_address) ?? false);
                                    // Only show user popup on the FIRST message from this sender to avoid duplicates
                                    const isFirstMessageFromSender = messages.findIndex(
                                        m => m.sender_address.toLowerCase() === msg.sender_address.toLowerCase()
                                    ) === index;

                                    return (
                                        <motion.div
                                            key={msg.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}
                                        >
                                            {/* Avatar - clickable for non-own, non-agent messages */}
                                            {!isOwn && (
                                                <div className="flex-shrink-0 relative">
                                                    {isAgent ? (
                                                        // Agent avatar (not clickable)
                                                        <div className="relative">
                                                            {senderAvatar ? (
                                                                <img
                                                                    src={senderAvatar}
                                                                    alt=""
                                                                    className="w-8 h-8 rounded-lg object-cover ring-1 ring-purple-500/50"
                                                                />
                                                            ) : senderAvatarEmoji ? (
                                                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-lg ring-1 ring-purple-500/50">
                                                                    {senderAvatarEmoji}
                                                                </div>
                                                            ) : (
                                                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white text-xs ring-1 ring-purple-500/50">
                                                                    🤖
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        // User avatar (clickable)
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                                if (selectedUser === msg.sender_address) {
                                                                    setSelectedUser(null);
                                                                } else {
                                                                    handleUserClick(msg.sender_address, e);
                                                                }
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
                                                    )}

                                                    {/* User popup rendered as fixed position element below */}
                                                </div>
                                            )}

                                            {/* Message content */}
                                            <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"} max-w-[80%]`}>
                                                {showSender && !isOwn && (
                                                    <p className={`text-xs mb-1 ml-1 font-medium flex items-center gap-1 ${isAgent ? "text-purple-400" : "text-zinc-500"}`}>
                                                        {formatSender(msg.sender_address)}
                                                        {isAgent && (
                                                            <span className="text-[9px] px-1 py-0.5 bg-purple-500/30 text-purple-300 rounded font-medium">
                                                                AI
                                                            </span>
                                                        )}
                                                        {msg.is_pinned && (
                                                            <span className="text-amber-400" title="Pinned message">
                                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                                    <path d="M5 5a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 19V5z" />
                                                                </svg>
                                                            </span>
                                                        )}
                                                    </p>
                                                )}
                                                {/* Pinned indicator for own messages or when sender not shown */}
                                                {msg.is_pinned && (showSender || isOwn) && isOwn && (
                                                    <p className="text-xs text-amber-400 mb-1 mr-1 font-medium flex items-center gap-1 justify-end">
                                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                            <path d="M5 5a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 19V5z" />
                                                        </svg>
                                                        Pinned
                                                    </p>
                                                )}
                                                {isPixelArt ? (
                                                    <div
                                                        className={`rounded-2xl overflow-hidden relative group ${
                                                            isOwn ? "rounded-br-md" : "rounded-bl-md"
                                                        }`}
                                                    >
                                                        <PixelArtImage
                                                            src={msg.content}
                                                            size="lg"
                                                            className="cursor-pointer hover:opacity-90 transition-opacity"
                                                            onClick={() => setPreviewImage(msg.content)}
                                                        />
                                                    </div>
                                                ) : isImage ? (
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
                                                        className={`px-4 py-2.5 rounded-2xl relative cursor-pointer ${
                                                            isOwn
                                                                ? "bg-[#FF5500] text-white rounded-br-md"
                                                                : isAgent
                                                                    ? "bg-gradient-to-br from-purple-900/80 to-indigo-900/80 border border-purple-500/30 text-white rounded-bl-md"
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
                                                        
                                                        {isAgent ? (
                                                            // Agent messages - render markdown with images
                                                            <div className="prose prose-sm prose-invert max-w-none
                                                                prose-p:my-1.5 prose-p:leading-relaxed prose-p:text-zinc-100
                                                                prose-headings:text-white prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1.5
                                                                prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
                                                                prose-strong:text-purple-200 prose-strong:font-semibold
                                                                prose-em:text-zinc-200
                                                                prose-ul:my-2 prose-ul:pl-4 prose-ul:space-y-1
                                                                prose-ol:my-2 prose-ol:pl-4 prose-ol:space-y-1
                                                                prose-li:my-0 prose-li:text-zinc-100 prose-li:marker:text-purple-400
                                                                prose-code:bg-black/30 prose-code:text-purple-200 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-[''] prose-code:after:content-['']
                                                                prose-pre:bg-black/30 prose-pre:border prose-pre:border-purple-500/20 prose-pre:rounded-lg prose-pre:my-2 prose-pre:overflow-x-auto
                                                                prose-a:text-purple-300 prose-a:no-underline hover:prose-a:underline hover:prose-a:text-purple-200
                                                                prose-hr:border-purple-500/30 prose-hr:my-3
                                                                prose-blockquote:border-l-purple-400 prose-blockquote:bg-black/20 prose-blockquote:pl-3 prose-blockquote:py-1 prose-blockquote:my-2 prose-blockquote:rounded-r prose-blockquote:text-zinc-300
                                                            ">
                                                                <ReactMarkdown
                                                                    remarkPlugins={[remarkGfm]}
                                                                    components={{
                                                                        img: ({ src, alt }) => {
                                                                            const srcStr = typeof src === "string" ? src : undefined;
                                                                            if (!srcStr) return <span className="text-xs text-purple-300/70">🖼️ {alt || "Image"}</span>;
                                                                            return (
                                                                                <span className="inline-block my-2">
                                                                                    <img 
                                                                                        src={srcStr} 
                                                                                        alt={alt || ""} 
                                                                                        className="max-h-40 rounded-lg border border-purple-500/30 bg-black/30"
                                                                                        onError={(e) => {
                                                                                            (e.target as HTMLImageElement).style.display = "none";
                                                                                        }}
                                                                                    />
                                                                                    {alt && <span className="block text-[10px] text-purple-300/70 mt-1">{alt}</span>}
                                                                                </span>
                                                                            );
                                                                        },
                                                                    }}
                                                                >
                                                                    {msg.content}
                                                                </ReactMarkdown>
                                                            </div>
                                                        ) : (
                                                        <p className={`break-words whitespace-pre-wrap ${isEmojiOnly(msg.content) ? "text-4xl leading-tight" : ""}`}>
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
                                                                    {/* Pin Button - Admin Only */}
                                                                    {isAdmin && (
                                                                        <button
                                                                            onClick={() => handlePinMessage(msg.id, msg.is_pinned || false)}
                                                                            disabled={pinningMessage === msg.id}
                                                                            className={`w-8 h-8 rounded-full flex items-center justify-center shadow-lg border transition-colors ${
                                                                                msg.is_pinned
                                                                                    ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                                                                                    : "bg-zinc-700 hover:bg-zinc-600 border-zinc-600 text-zinc-300"
                                                                            }`}
                                                                            title={msg.is_pinned ? "Unpin message" : "Pin message"}
                                                                        >
                                                                            {pinningMessage === msg.id ? (
                                                                                <div className="w-4 h-4 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                                                                            ) : (
                                                                                <svg className="w-4 h-4" fill={msg.is_pinned ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={msg.is_pinned ? 0 : 2}>
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                                                                </svg>
                                                                            )}
                                                                        </button>
                                                                    )}
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

                    {/* Input - with safe area padding for bottom */}
                    <div 
                        className={`border-t border-zinc-800 ${isFullscreen ? "px-4 pt-4" : "p-4"}`}
                        style={isFullscreen ? { paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' } : undefined}
                    >
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
                            {/* Pixel Art button */}
                            <button
                                onClick={() => setShowPixelArt(true)}
                                className="p-3 bg-zinc-800 text-zinc-400 rounded-xl hover:bg-zinc-700 hover:text-white transition-colors"
                                title="Create pixel art"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                    <rect x="4" y="4" width="4" height="4" />
                                    <rect x="8" y="4" width="4" height="4" opacity="0.7" />
                                    <rect x="12" y="4" width="4" height="4" />
                                    <rect x="4" y="8" width="4" height="4" opacity="0.7" />
                                    <rect x="8" y="8" width="4" height="4" />
                                    <rect x="12" y="8" width="4" height="4" opacity="0.7" />
                                    <rect x="4" y="12" width="4" height="4" />
                                    <rect x="8" y="12" width="4" height="4" opacity="0.7" />
                                    <rect x="12" y="12" width="4" height="4" />
                                    <rect x="16" y="8" width="4" height="4" opacity="0.5" />
                                    <rect x="16" y="12" width="4" height="4" opacity="0.5" />
                                    <rect x="16" y="16" width="4" height="4" opacity="0.3" />
                                    <rect x="12" y="16" width="4" height="4" opacity="0.3" />
                                    <rect x="8" y="16" width="4" height="4" opacity="0.3" />
                                    <rect x="4" y="16" width="4" height="4" opacity="0.3" />
                                </svg>
                            </button>
                            <MentionInput
                                inputRef={inputRef}
                                value={inputValue}
                                onChange={setInputValue}
                                onKeyDown={handleKeyDown}
                                placeholder={`Message #${channel.name} (@ to mention)`}
                                users={mentionableUsers}
                                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF5500]"
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

                {/* User Popup - Fixed position near click */}
                <AnimatePresence>
                    {selectedUser && userPopupPosition && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            onClick={(e) => e.stopPropagation()}
                            className="fixed z-[100] bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl p-3 min-w-[220px] max-w-[280px]"
                            style={{
                                left: Math.min(userPopupPosition.x, typeof window !== "undefined" ? window.innerWidth - 290 : 0),
                                top: userPopupPosition.y,
                            }}
                        >
                            {(() => {
                                const userInfo = getUserInfo?.(selectedUser);
                                const alreadyFriend = isFriend?.(selectedUser);
                                return (
                                    <>
                                        <div className="flex items-center gap-3 mb-3 pb-3 border-b border-zinc-700">
                                            {userInfo?.avatar ? (
                                                <img src={userInfo.avatar} alt="" className="w-10 h-10 rounded-full" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold">
                                                    {(userInfo?.name || selectedUser).slice(0, 2).toUpperCase()}
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white font-medium text-sm truncate">
                                                    {userInfo?.name || `${selectedUser.slice(0, 6)}...${selectedUser.slice(-4)}`}
                                                </p>
                                                <p className="text-zinc-500 text-xs truncate font-mono">
                                                    {selectedUser.slice(0, 10)}...{selectedUser.slice(-6)}
                                                </p>
                                            </div>
                                        </div>
                                        
                                        {!alreadyFriend && onAddFriend && (
                                            <button
                                                onClick={() => handleAddFriend(selectedUser)}
                                                disabled={addingFriend === selectedUser}
                                                className="w-full px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                {addingFriend === selectedUser ? (
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
                                        {alreadyFriend && (
                                            <div className="flex items-center gap-2 text-emerald-400 text-sm py-2">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                Already friends
                                            </div>
                                        )}
                                        
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(selectedUser);
                                                setSelectedUser(null);
                                            }}
                                            className="w-full flex items-center gap-2 px-3 py-2 mt-1 hover:bg-zinc-700 text-zinc-400 rounded-lg text-sm transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                            Copy Address
                                        </button>
                                    </>
                                );
                            })()}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Pixel Art Editor */}
                <PixelArtEditor
                    isOpen={showPixelArt}
                    onClose={() => setShowPixelArt(false)}
                    onSend={handleSendPixelArt}
                    isSending={isUploadingPixelArt}
                />

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
