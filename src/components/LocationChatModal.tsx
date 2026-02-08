"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import {
    useLocationChat,
    type LocationChat,
    type LocationChatMessage,
} from "@/hooks/useLocationChat";
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
import { ChatAttachmentMenu } from "./ChatAttachmentMenu";
import { PixelArtEditor } from "./PixelArtEditor";
import { PixelArtImage } from "./PixelArtImage";
import { LinkPreview, detectUrls } from "./LinkPreview";
import {
    MessageActionBar,
    type MessageActionConfig,
    type MessageActionCallbacks,
} from "./MessageActionBar";
import {
    useMessageReactions,
    MESSAGE_REACTION_EMOJIS,
} from "@/hooks/useChatFeatures";
import { ReactionDisplay } from "./EmojiPicker";
import { ChatMembersList } from "./ChatMembersList";
import { MentionInput, type MentionUser } from "./MentionInput";
import { MentionText } from "./MentionText";
import { ChatMarkdown, hasMarkdown } from "./ChatMarkdown";
import { AgentMarkdown, AgentMessageWrapper, AgentThinkingIndicator } from "./AgentMarkdown";

type LocationChatModalProps = {
    isOpen: boolean;
    onClose: () => void;
    locationChat: LocationChat;
    userAddress: string;
    getUserInfo?: (
        address: string
    ) => { name: string | null; avatar: string | null } | null;
    onOpenUserCard?: (address: string) => void;
};

// Helper to check if content is a GIF URL
function isGifMessage(content: string): boolean {
    return (
        content.startsWith("https://") &&
        (content.includes("giphy.com") ||
            content.includes("tenor.com") ||
            content.endsWith(".gif"))
    );
}

// Helper to check if content is pixel art
function isPixelArtMessage(content: string): boolean {
    return (
        content.startsWith("[PIXEL_ART]") ||
        (content.startsWith("https://") && content.includes("pixel-art"))
    );
}

// Extract pixel art URL from message
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

// Toast helper
function showToast(message: string, type: "success" | "error" = "success") {
    const existing = document.querySelector("[data-toast]");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.setAttribute("data-toast", "true");
    toast.className = `fixed bottom-32 left-1/2 -translate-x-1/2 px-4 py-3 ${
        type === "success" ? "bg-zinc-800" : "bg-red-600"
    } text-white text-sm font-medium rounded-2xl shadow-xl z-[9999] flex items-center gap-2`;
    toast.innerHTML = `
        ${
            type === "success"
                ? '<svg class="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>'
                : '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>'
        }
        <span>${message}</span>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s";
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

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
    const [showMembersList, setShowMembersList] = useState(false);
    const [showPixelArt, setShowPixelArt] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [replyingTo, setReplyingTo] = useState<LocationChatMessage | null>(
        null
    );
    const [selectedMessage, setSelectedMessage] =
        useState<MessageActionConfig | null>(null);
    const [showMessageActions, setShowMessageActions] = useState(false);
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
        deleteMessage,
        joinChat,
        leaveChat,
    } = useLocationChat(isOpen ? locationChat.id : null, userAddress);

    // Message reactions hook (using location chat id as conversation_id)
    const {
        reactions: msgReactions,
        fetchReactions: fetchMsgReactions,
        toggleReaction: toggleMsgReaction,
    } = useMessageReactions(userAddress, isOpen ? locationChat.id : null);

    // Fetch reactions for all messages
    useEffect(() => {
        const messageIds = messages.map((msg) => msg.id);
        if (messageIds.length > 0) {
            fetchMsgReactions(messageIds);
        }
    }, [messages, fetchMsgReactions]);

    // Fetch AI agents assigned to this location chat
    const [locationAgents, setLocationAgents] = useState<MentionUser[]>([]);
    useEffect(() => {
        async function fetchAgents() {
            try {
                const res = await fetch(`/api/channels/${locationChat.id}/agents`);
                if (res.ok) {
                    const data = await res.json();
                    const agents: MentionUser[] = (data.agents || []).map(
                        (agent: any) => ({
                            address: agent.id,
                            name: agent.name,
                            avatar: agent.avatar_url || null,
                            avatarEmoji: agent.avatar_emoji,
                            isAgent: true,
                        })
                    );
                    setLocationAgents(agents);
                }
            } catch (err) {
                console.error("[LocationChat] Failed to fetch agents:", err);
            }
        }
        if (isOpen && locationChat.id) {
            fetchAgents();
        }
    }, [isOpen, locationChat.id]);

    // Build list of mentionable users from message senders + location agents
    const mentionableUsers: MentionUser[] = useMemo(() => {
        const userMap = new Map<string, MentionUser>();

        // Add location agents first (so they appear at the top)
        locationAgents.forEach((agent) => {
            userMap.set(agent.address, agent);
        });

        // Add message senders
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
    }, [messages, userAddress, getUserInfo, locationAgents]);

    // Agent message helpers
    const isAgentMessage = (address: string) => address.startsWith("agent:");
    const getAgentId = (address: string) => address.replace("agent:", "");

    // Cache agent info (name, avatar) for agent messages
    const [agentInfoCache, setAgentInfoCache] = useState<
        Map<string, { name: string; avatar_url?: string; avatar_emoji?: string }>
    >(new Map());

    useEffect(() => {
        // Find agent addresses in messages that we haven't cached yet
        const agentAddresses = messages
            .filter((m) => isAgentMessage(m.sender_address))
            .map((m) => getAgentId(m.sender_address))
            .filter((id) => !agentInfoCache.has(id));

        const uniqueIds = [...new Set(agentAddresses)];
        if (uniqueIds.length === 0) return;

        uniqueIds.forEach(async (agentId) => {
            try {
                const res = await fetch(`/api/public/agents/${agentId}`);
                if (res.ok) {
                    const data = await res.json();
                    setAgentInfoCache((prev) => {
                        const next = new Map(prev);
                        next.set(agentId, {
                            name: data.agent?.name || "AI Agent",
                            avatar_url: data.agent?.avatar_url,
                            avatar_emoji: data.agent?.avatar_emoji,
                        });
                        return next;
                    });
                }
            } catch {
                // Fallback — check locationAgents list
                const localAgent = locationAgents.find((a) => a.address === agentId);
                if (localAgent) {
                    setAgentInfoCache((prev) => {
                        const next = new Map(prev);
                        next.set(agentId, {
                            name: localAgent.name || "AI Agent",
                            avatar_url: localAgent.avatar || undefined,
                            avatar_emoji: localAgent.avatarEmoji,
                        });
                        return next;
                    });
                }
            }
        });
    }, [messages, agentInfoCache, locationAgents]);

    // Agent thinking state
    const [thinkingAgents, setThinkingAgents] = useState<
        { id: string; name: string; emoji?: string; avatarUrl?: string }[]
    >([]);

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
        const replyId = replyingTo?.id;
        setNewMessage("");
        setReplyingTo(null);
        const sent = await sendMessage(content, "text", replyId);

        // Check for agent mentions and trigger responses
        if (sent && content.includes("@[") && content.includes("](")) {
            // Extract mentioned agent names for thinking indicator
            const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
            const mentionedAgents: { id: string; name: string }[] = [];
            let match;
            while ((match = mentionRegex.exec(content)) !== null) {
                const mentionId = match[2];
                if (mentionId && !mentionId.startsWith("0x") && !mentionId.startsWith("00")) {
                    mentionedAgents.push({ id: mentionId, name: match[1] });
                }
            }

            if (mentionedAgents.length > 0) {
                setThinkingAgents((prev) => [
                    ...prev,
                    ...mentionedAgents.filter((a) => !prev.some((p) => p.id === a.id)),
                ]);
            }

            fetch("/api/channels/agent-response", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messageContent: content,
                    senderAddress: userAddress,
                    channelType: "location",
                    channelId: locationChat.id,
                }),
            })
                .catch((err) =>
                    console.error("[LocationChat] Agent response error:", err)
                )
                .finally(() => {
                    if (mentionedAgents.length > 0) {
                        setThinkingAgents((prev) =>
                            prev.filter((a) => !mentionedAgents.some((m) => m.id === a.id))
                        );
                    }
                });
        }
    }, [newMessage, isSending, sendMessage, replyingTo, userAddress, locationChat.id]);

    // Handle GIF sending
    const handleSendGif = useCallback(
        async (gifUrl: string) => {
            await sendMessage(gifUrl, "gif");
        },
        [sendMessage]
    );

    // Handle pixel art sending
    const handleSendPixelArt = useCallback(
        async (dataUrl: string) => {
            setIsUploading(true);
            try {
                // Upload pixel art to storage
                const response = await fetch("/api/pixel-art/upload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ image: dataUrl }),
                });

                if (!response.ok) {
                    throw new Error("Failed to upload pixel art");
                }

                const { url } = await response.json();
                await sendMessage(`[PIXEL_ART]${url}`, "pixel_art");
                setShowPixelArt(false);
            } catch (error) {
                console.error("[LocationChat] Pixel art upload error:", error);
                showToast("Failed to send pixel art", "error");
            } finally {
                setIsUploading(false);
            }
        },
        [sendMessage]
    );

    // Handle sharing location
    const handleShareLocation = useCallback(
        (location: LocationData) => {
            const content = formatLocationMessage(location);
            sendMessage(content, "location");
        },
        [sendMessage]
    );

    // Handle share invite link
    const handleShareInvite = useCallback(async () => {
        const inviteUrl = `${window.location.origin}/location-chat/${locationChat.id}`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Join ${locationChat.name} on Spritz`,
                    text: `Chat with others at ${
                        locationChat.google_place_name || locationChat.name
                    }! 📍`,
                    url: inviteUrl,
                });
            } catch (err) {
                if ((err as Error).name !== "AbortError") {
                    navigator.clipboard.writeText(inviteUrl);
                    showToast("Invite link copied!");
                }
            }
        } else {
            navigator.clipboard.writeText(inviteUrl);
            showToast("Invite link copied!");
        }
    }, [locationChat]);

    // Handle message tap for actions
    const handleMessageTap = useCallback(
        (msg: LocationChatMessage) => {
            const isOwn =
                msg.sender_address.toLowerCase() === userAddress.toLowerCase();
            const isPixelArt = isPixelArtMessage(msg.content);
            const pixelArtUrl = isPixelArt
                ? extractPixelArtUrl(msg.content)
                : null;

            setSelectedMessage({
                messageId: msg.id,
                messageContent: msg.content,
                isOwn,
                hasMedia: isGifMessage(msg.content) || isPixelArt,
                isPixelArt,
                mediaUrl: isGifMessage(msg.content)
                    ? msg.content
                    : pixelArtUrl || undefined,
            });
            setShowMessageActions(true);
        },
        [userAddress]
    );

    // Message action callbacks
    const messageActionCallbacks: MessageActionCallbacks = {
        onReaction: selectedMessage
            ? (emoji) => toggleMsgReaction(selectedMessage.messageId, emoji)
            : undefined,
        onReply: () => {
            const msg = messages.find(
                (m) => m.id === selectedMessage?.messageId
            );
            if (msg) {
                setReplyingTo(msg);
                inputRef.current?.focus();
            }
        },
        onCopy: () => {
            if (selectedMessage?.messageContent) {
                navigator.clipboard.writeText(selectedMessage.messageContent);
            }
        },
        onDelete: selectedMessage?.isOwn
            ? async () => {
                  if (selectedMessage?.messageId) {
                      await deleteMessage(selectedMessage.messageId);
                      showToast("Message deleted");
                  }
              }
            : undefined,
    };

    // Cancel reply
    const cancelReply = useCallback(() => {
        setReplyingTo(null);
    }, []);

    const formatMessageTime = (timestamp: string) => {
        return formatTimeInTimezone(new Date(timestamp), timezone);
    };

    const getDisplayName = (address: string) => {
        if (isAgentMessage(address)) {
            const agentId = getAgentId(address);
            const agentInfo = agentInfoCache.get(agentId);
            return agentInfo?.name || "AI Agent";
        }
        const info = getUserInfo?.(address);
        if (info?.name) return info.name;
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    const getAvatar = (address: string) => {
        if (isAgentMessage(address)) {
            const agentId = getAgentId(address);
            return agentInfoCache.get(agentId)?.avatar_url || null;
        }
        return getUserInfo?.(address)?.avatar || null;
    };

    const getAgentEmoji = (address: string) => {
        if (!isAgentMessage(address)) return null;
        const agentId = getAgentId(address);
        return agentInfoCache.get(agentId)?.avatar_emoji || null;
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
                    className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4"
                    style={{
                        paddingBottom: "env(safe-area-inset-bottom, 0px)",
                    }}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="w-full h-full max-w-none max-h-none rounded-none border-0 bg-zinc-900 flex flex-col overflow-hidden sm:w-full sm:max-w-2xl sm:max-h-[70vh] sm:h-[600px] sm:rounded-2xl sm:border sm:border-zinc-800"
                        style={{
                            paddingTop: "env(safe-area-inset-top, 0px)",
                            paddingBottom: "env(safe-area-inset-bottom, 0px)",
                        }}
                    >
                        {/* Header - same layout as ChannelChatModal: icon + title left, actions + X right */}
                        <div className="flex items-center gap-2 px-2 sm:px-3 py-2.5 border-b border-zinc-800 shrink-0">
                            <div
                                className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                                onClick={() => setShowInfo(!showInfo)}
                            >
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center text-xl shrink-0">
                                    {displayChat.emoji}
                                </div>
                                <div className="flex-1 min-w-0 pr-1">
                                    <h2 className="font-semibold text-white text-[15px] truncate leading-tight">
                                        {displayChat.name}
                                    </h2>
                                    <button
                                        type="button"
                                        onClick={() => setShowMembersList(true)}
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
                                        {typeof displayChat.member_count ===
                                        "number"
                                            ? `${displayChat.member_count} ${
                                                  displayChat.member_count === 1
                                                      ? "member"
                                                      : "members"
                                              }`
                                            : "Members"}
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                                {displayChat.google_place_rating && (
                                    <span className="text-xs text-amber-400 flex items-center gap-1 px-1">
                                        ⭐{" "}
                                        {displayChat.google_place_rating.toFixed(
                                            1
                                        )}
                                    </span>
                                )}
                                <button
                                    onClick={() => setShowInfo(!showInfo)}
                                    className="p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                                    aria-label="Place info"
                                >
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
                                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                        />
                                    </svg>
                                </button>
                                <button
                                    onClick={onClose}
                                    className="p-2.5 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white -mr-1"
                                    aria-label="Close chat"
                                >
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
                                            d="M6 18L18 6M6 6l12 12"
                                        />
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
                                                src={`https://www.openstreetmap.org/export/embed.html?bbox=${
                                                    displayChat.longitude -
                                                    0.008
                                                },${
                                                    displayChat.latitude - 0.005
                                                },${
                                                    displayChat.longitude +
                                                    0.008
                                                },${
                                                    displayChat.latitude + 0.005
                                                }&layer=mapnik&marker=${
                                                    displayChat.latitude
                                                },${displayChat.longitude}`}
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
                                                            {displayChat.google_place_name ||
                                                                displayChat.name}
                                                        </h3>
                                                        {displayChat
                                                            .google_place_types?.[0] && (
                                                            <span className="text-xs text-zinc-300 capitalize">
                                                                {displayChat.google_place_types[0].replace(
                                                                    /_/g,
                                                                    " "
                                                                )}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {displayChat.google_place_rating && (
                                                    <div className="bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                                                        <span className="text-amber-400">
                                                            ★
                                                        </span>
                                                        <span className="text-white font-semibold text-sm">
                                                            {displayChat.google_place_rating.toFixed(
                                                                1
                                                            )}
                                                        </span>
                                                        {displayChat.google_place_user_ratings_total && (
                                                            <span className="text-zinc-400 text-xs">
                                                                (
                                                                {displayChat.google_place_user_ratings_total >
                                                                999
                                                                    ? `${(
                                                                          displayChat.google_place_user_ratings_total /
                                                                          1000
                                                                      ).toFixed(
                                                                          1
                                                                      )}k`
                                                                    : displayChat.google_place_user_ratings_total}
                                                                )
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Info Content */}
                                        <div className="p-4 space-y-4">
                                            {/* Address */}
                                            {(displayChat.google_place_address ||
                                                displayChat.formatted_address) && (
                                                <div className="flex items-start gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
                                                        <svg
                                                            className="w-4.5 h-4.5 text-zinc-400"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={
                                                                    1.5
                                                                }
                                                                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                                            />
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={
                                                                    1.5
                                                                }
                                                                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">
                                                            Address
                                                        </p>
                                                        <p className="text-sm text-zinc-200">
                                                            {displayChat.google_place_address ||
                                                                displayChat.formatted_address}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Phone & Website Row */}
                                            {(displayChat.google_place_phone ||
                                                displayChat.google_place_website) && (
                                                <div className="flex gap-3">
                                                    {displayChat.google_place_phone && (
                                                        <a
                                                            href={`tel:${displayChat.google_place_phone}`}
                                                            className="flex-1 flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors group"
                                                        >
                                                            <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
                                                                <svg
                                                                    className="w-4.5 h-4.5 text-green-400"
                                                                    fill="none"
                                                                    viewBox="0 0 24 24"
                                                                    stroke="currentColor"
                                                                >
                                                                    <path
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                        strokeWidth={
                                                                            1.5
                                                                        }
                                                                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                                                    />
                                                                </svg>
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-xs text-zinc-500">
                                                                    Call
                                                                </p>
                                                                <p className="text-sm text-zinc-200 truncate group-hover:text-green-400 transition-colors">
                                                                    {
                                                                        displayChat.google_place_phone
                                                                    }
                                                                </p>
                                                            </div>
                                                        </a>
                                                    )}
                                                    {displayChat.google_place_website && (
                                                        <a
                                                            href={
                                                                displayChat.google_place_website
                                                            }
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex-1 flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors group"
                                                        >
                                                            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                                                <svg
                                                                    className="w-4.5 h-4.5 text-blue-400"
                                                                    fill="none"
                                                                    viewBox="0 0 24 24"
                                                                    stroke="currentColor"
                                                                >
                                                                    <path
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                        strokeWidth={
                                                                            1.5
                                                                        }
                                                                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                                                    />
                                                                </svg>
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-xs text-zinc-500">
                                                                    Website
                                                                </p>
                                                                <p className="text-sm text-zinc-200 truncate group-hover:text-blue-400 transition-colors">
                                                                    {new URL(
                                                                        displayChat.google_place_website
                                                                    ).hostname.replace(
                                                                        "www.",
                                                                        ""
                                                                    )}
                                                                </p>
                                                            </div>
                                                        </a>
                                                    )}
                                                </div>
                                            )}

                                            {/* Description */}
                                            {displayChat.description && (
                                                <div className="p-3 bg-zinc-800/30 rounded-xl border border-zinc-700/50">
                                                    <p className="text-sm text-zinc-300 leading-relaxed">
                                                        {
                                                            displayChat.description
                                                        }
                                                    </p>
                                                </div>
                                            )}

                                            {/* Stats */}
                                            <div className="flex gap-3">
                                                <div className="flex-1 p-3 bg-zinc-800/30 rounded-xl text-center">
                                                    <p className="text-2xl font-bold text-white">
                                                        {
                                                            displayChat.member_count
                                                        }
                                                    </p>
                                                    <p className="text-xs text-zinc-500">
                                                        Members
                                                    </p>
                                                </div>
                                                <div className="flex-1 p-3 bg-zinc-800/30 rounded-xl text-center">
                                                    <p className="text-2xl font-bold text-white">
                                                        {
                                                            displayChat.message_count
                                                        }
                                                    </p>
                                                    <p className="text-xs text-zinc-500">
                                                        Messages
                                                    </p>
                                                </div>
                                                {displayChat.google_place_types &&
                                                    displayChat
                                                        .google_place_types
                                                        .length > 0 && (
                                                        <div className="flex-1 p-3 bg-zinc-800/30 rounded-xl text-center">
                                                            <p className="text-2xl">
                                                                {displayChat.google_place_types[0]?.includes(
                                                                    "restaurant"
                                                                )
                                                                    ? "🍽️"
                                                                    : displayChat.google_place_types[0]?.includes(
                                                                          "cafe"
                                                                      )
                                                                    ? "☕"
                                                                    : displayChat.google_place_types[0]?.includes(
                                                                          "bar"
                                                                      )
                                                                    ? "🍺"
                                                                    : displayChat.google_place_types[0]?.includes(
                                                                          "hotel"
                                                                      )
                                                                    ? "🏨"
                                                                    : displayChat.google_place_types[0]?.includes(
                                                                          "park"
                                                                      )
                                                                    ? "🌳"
                                                                    : displayChat.google_place_types[0]?.includes(
                                                                          "museum"
                                                                      )
                                                                    ? "🏛️"
                                                                    : displayChat.google_place_types[0]?.includes(
                                                                          "store"
                                                                      )
                                                                    ? "🛍️"
                                                                    : displayChat.google_place_types[0]?.includes(
                                                                          "gym"
                                                                      )
                                                                    ? "💪"
                                                                    : displayChat.google_place_types[0]?.includes(
                                                                          "airport"
                                                                      )
                                                                    ? "✈️"
                                                                    : displayChat.google_place_types[0]?.includes(
                                                                          "hospital"
                                                                      )
                                                                    ? "🏥"
                                                                    : "📍"}
                                                            </p>
                                                            <p className="text-xs text-zinc-500 capitalize truncate">
                                                                {displayChat.google_place_types[0]?.replace(
                                                                    /_/g,
                                                                    " "
                                                                )}
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
                                                            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                                                        />
                                                    </svg>
                                                    Directions
                                                </a>
                                                <button
                                                    onClick={handleShareInvite}
                                                    className="py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-xl transition-all border border-zinc-700"
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
                                                            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                                                        />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        leaveChat().then(() =>
                                                            onClose()
                                                        )
                                                    }
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
                                    const isOwn =
                                        msg.sender_address.toLowerCase() ===
                                        userAddress.toLowerCase();
                                    const showAvatar =
                                        idx === 0 ||
                                        messages[idx - 1].sender_address !==
                                            msg.sender_address;

                                    // Check message types
                                    const isLocation = isLocationMessage(
                                        msg.content
                                    );
                                    const locationData = isLocation
                                        ? parseLocationMessage(msg.content)
                                        : null;
                                    const isGif = isGifMessage(msg.content);
                                    const isPixelArt = isPixelArtMessage(
                                        msg.content
                                    );
                                    const pixelArtUrl = isPixelArt
                                        ? extractPixelArtUrl(msg.content)
                                        : null;
                                    const urls =
                                        !isGif && !isPixelArt && !isLocation
                                            ? detectUrls(msg.content)
                                            : [];

                                    const isAgent = isAgentMessage(msg.sender_address);
                                    const agentEmoji = getAgentEmoji(msg.sender_address);

                                    return (
                                        <div
                                            key={msg.id}
                                            className={`flex gap-2 ${
                                                isOwn ? "flex-row-reverse" : ""
                                            }`}
                                        >
                                            {/* Avatar */}
                                            {showAvatar && !isOwn ? (
                                                isAgent ? (
                                                    // Agent avatar - not clickable, with purple ring
                                                    <div className="flex-shrink-0 relative">
                                                        {getAvatar(msg.sender_address) ? (
                                                            <img
                                                                src={getAvatar(msg.sender_address)!}
                                                                alt=""
                                                                className="w-8 h-8 rounded-full object-cover ring-2 ring-purple-500/50"
                                                            />
                                                        ) : agentEmoji ? (
                                                            <div className="w-8 h-8 rounded-full bg-purple-900/50 flex items-center justify-center ring-2 ring-purple-500/50 text-sm">
                                                                {agentEmoji}
                                                            </div>
                                                        ) : (
                                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center ring-2 ring-purple-500/50 text-white text-xs font-bold">
                                                                AI
                                                            </div>
                                                        )}
                                                        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-purple-600 rounded-full flex items-center justify-center border-2 border-zinc-900">
                                                            <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() =>
                                                            onOpenUserCard?.(
                                                                msg.sender_address
                                                            )
                                                        }
                                                        className="flex-shrink-0"
                                                    >
                                                        <AvatarWithStatus
                                                            name={getDisplayName(
                                                                msg.sender_address
                                                            )}
                                                            src={getAvatar(
                                                                msg.sender_address
                                                            )}
                                                            size="sm"
                                                        />
                                                    </button>
                                                )
                                            ) : !isOwn ? (
                                                <div className="w-8" />
                                            ) : null}

                                            <div
                                                className={`flex flex-col ${
                                                    isOwn
                                                        ? "items-end"
                                                        : "items-start"
                                                } max-w-[75%]`}
                                            >
                                                {/* Sender name */}
                                                {showAvatar && !isOwn && (
                                                    isAgent ? (
                                                        <div className="flex items-center gap-1.5 mb-1 ml-1">
                                                            <span className="text-xs text-purple-300 font-medium">
                                                                {getDisplayName(msg.sender_address)}
                                                            </span>
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-medium border border-purple-500/30">
                                                                AI
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-zinc-500 mb-1 ml-1">
                                                            {getDisplayName(
                                                                msg.sender_address
                                                            )}
                                                        </span>
                                                    )
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
                                                            <svg
                                                                className="w-3 h-3 flex-shrink-0"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                stroke="currentColor"
                                                            >
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={
                                                                        2
                                                                    }
                                                                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                                                                />
                                                            </svg>
                                                            <span
                                                                className={
                                                                    isOwn
                                                                        ? "text-white/80"
                                                                        : "text-orange-400"
                                                                }
                                                            >
                                                                {getDisplayName(
                                                                    msg
                                                                        .reply_to_message
                                                                        .sender_address
                                                                )}
                                                            </span>
                                                        </div>
                                                        <p
                                                            className={`mt-1 line-clamp-2 ${
                                                                isOwn
                                                                    ? "text-white/70"
                                                                    : "text-zinc-400"
                                                            }`}
                                                        >
                                                            {
                                                                msg
                                                                    .reply_to_message
                                                                    .content
                                                            }
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Message content - tap for actions */}
                                                <button
                                                    onClick={() =>
                                                        handleMessageTap(msg)
                                                    }
                                                    className="text-left focus:outline-none active:opacity-80 transition-opacity"
                                                >
                                                    {/* Location message */}
                                                    {isLocation &&
                                                    locationData ? (
                                                        <LocationMessage
                                                            location={
                                                                locationData
                                                            }
                                                            isOwn={isOwn}
                                                        />
                                                    ) : isGif ? (
                                                        /* GIF message */
                                                        <div
                                                            className={`rounded-2xl overflow-hidden ${
                                                                isOwn
                                                                    ? "rounded-br-md"
                                                                    : "rounded-bl-md"
                                                            }`}
                                                        >
                                                            <img
                                                                src={
                                                                    msg.content
                                                                }
                                                                alt="GIF"
                                                                className="max-w-[250px] max-h-[200px] object-contain rounded-lg"
                                                                loading="lazy"
                                                            />
                                                        </div>
                                                    ) : isPixelArt &&
                                                      pixelArtUrl ? (
                                                        /* Pixel Art message */
                                                        <div
                                                            className={`rounded-2xl overflow-hidden ${
                                                                isOwn
                                                                    ? "rounded-br-md"
                                                                    : "rounded-bl-md"
                                                            }`}
                                                        >
                                                            <PixelArtImage
                                                                src={
                                                                    pixelArtUrl
                                                                }
                                                                alt="Pixel Art"
                                                                className="max-w-[200px]"
                                                            />
                                                        </div>
                                                    ) : isAgent ? (
                                                        /* Agent message - rich markdown */
                                                        <div className="px-4 py-2.5 rounded-2xl rounded-bl-md min-w-0 overflow-hidden bg-gradient-to-br from-purple-950/60 to-zinc-800 border border-purple-500/20">
                                                            <AgentMessageWrapper content={msg.content} theme="channel">
                                                                <AgentMarkdown content={msg.content} theme="channel" />
                                                            </AgentMessageWrapper>
                                                        </div>
                                                    ) : (
                                                        /* Text message */
                                                        <div
                                                            className={`px-4 py-2.5 rounded-2xl ${
                                                                isOwn
                                                                    ? "bg-[#FF5500] text-white rounded-br-md"
                                                                    : "bg-zinc-800 text-white rounded-bl-md"
                                                            }`}
                                                        >
                                                            {hasMarkdown(msg.content) ? (
                                                                <ChatMarkdown content={msg.content} isOwnMessage={isOwn} />
                                                            ) : (
                                                                <div className="text-sm whitespace-pre-wrap break-words">
                                                                    <MentionText
                                                                        text={msg.content}
                                                                        currentUserAddress={userAddress}
                                                                        onMentionClick={onOpenUserCard}
                                                                    />
                                                                </div>
                                                            )}
                                                            {/* Link previews */}
                                                            {urls.length >
                                                                0 && (
                                                                <div className="mt-2">
                                                                    {urls
                                                                        .slice(
                                                                            0,
                                                                            1
                                                                        )
                                                                        .map(
                                                                            (
                                                                                url
                                                                            ) => (
                                                                                <LinkPreview
                                                                                    key={
                                                                                        url
                                                                                    }
                                                                                    url={
                                                                                        url
                                                                                    }
                                                                                />
                                                                            )
                                                                        )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </button>

                                                {/* Reactions Display */}
                                                <ReactionDisplay
                                                    reactions={
                                                        msgReactions[msg.id] ||
                                                        []
                                                    }
                                                    onReaction={(emoji) => {
                                                        toggleMsgReaction(
                                                            msg.id,
                                                            emoji
                                                        );
                                                    }}
                                                    isOwnMessage={isOwn}
                                                />

                                                {/* Time */}
                                                <span className="text-[10px] text-zinc-600 mt-1 mx-1">
                                                    {formatMessageTime(
                                                        msg.created_at
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Agent Thinking Indicators */}
                        {thinkingAgents.length > 0 && (
                            <div className="px-4 py-2 space-y-1 border-t border-purple-500/10">
                                {thinkingAgents.map((agent) => (
                                    <AgentThinkingIndicator
                                        key={agent.id}
                                        agentName={agent.name}
                                        agentEmoji={agent.emoji}
                                        agentAvatarUrl={agent.avatarUrl}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Input Area */}
                        <div className="border-t border-zinc-800 bg-zinc-900">
                            {/* Reply indicator */}
                            {replyingTo && (
                                <div className="px-4 pt-3 pb-0">
                                    <div className="flex items-center gap-2 p-2 bg-zinc-800/50 rounded-lg border-l-2 border-[#FF5500]">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs text-[#FF5500] font-medium">
                                                Replying to{" "}
                                                {getDisplayName(
                                                    replyingTo.sender_address
                                                )}
                                            </p>
                                            <p className="text-xs text-zinc-400 truncate">
                                                {isGifMessage(
                                                    replyingTo.content
                                                )
                                                    ? "GIF"
                                                    : isPixelArtMessage(
                                                          replyingTo.content
                                                      )
                                                    ? "Pixel Art"
                                                    : isLocationMessage(
                                                          replyingTo.content
                                                      )
                                                    ? "Location"
                                                    : replyingTo.content}
                                            </p>
                                        </div>
                                        <button
                                            onClick={cancelReply}
                                            className="p-1 text-zinc-400 hover:text-white transition-colors"
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
                                                    d="M6 18L18 6M6 6l12 12"
                                                />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="p-4">
                                {!isMember ? (
                                    <button
                                        onClick={joinChat}
                                        className="w-full py-3 bg-[#FF5500] hover:bg-[#E64D00] text-white font-medium rounded-xl transition-colors"
                                    >
                                        Join Chat to Send Messages
                                    </button>
                                ) : (
                                    <div className="flex items-end gap-2">
                                        {/* Attachment menu */}
                                        <ChatAttachmentMenu
                                            onPixelArt={() =>
                                                setShowPixelArt(true)
                                            }
                                            onGif={handleSendGif}
                                            onLocation={handleShareLocation}
                                            showLocation={true}
                                            isUploading={isUploading}
                                            disabled={isSending}
                                        />

                                        <MentionInput
                                            inputRef={inputRef}
                                            value={newMessage}
                                            onChange={(val) => {
                                                if (val.length > 10000) return;
                                                setNewMessage(val);
                                            }}
                                            onSubmit={handleSend}
                                            placeholder={
                                                replyingTo
                                                    ? "Type your reply..."
                                                    : `Message ${displayChat.name}...`
                                            }
                                            users={mentionableUsers}
                                            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF5500]/50 focus:border-[#FF5500]"
                                        />
                                        <button
                                            onClick={handleSend}
                                            disabled={
                                                !newMessage.trim() || isSending
                                            }
                                            className="p-3 bg-[#FF5500] hover:bg-[#E64D00] disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-xl transition-colors"
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
                                )}
                            </div>
                        </div>

                        {/* Decentralized indicator */}
                        <div className="px-4 py-2 bg-zinc-950 border-t border-zinc-800 flex items-center justify-center gap-2 text-xs text-zinc-500">
                            <svg
                                className="w-3.5 h-3.5 text-[#FF5500]"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                />
                            </svg>
                            <span>Decentralized chat via Logos</span>
                        </div>
                    </motion.div>
                </motion.div>
            )}

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

            {/* Members List Panel - same as global/channel chat */}
            <ChatMembersList
                channelId={displayChat.id}
                locationChatId={displayChat.id}
                isOpen={showMembersList}
                onClose={() => setShowMembersList(false)}
                onUserClick={onOpenUserCard}
                getUserInfo={getUserInfo}
                currentUserAddress={userAddress}
            />
        </AnimatePresence>,
        document.body
    );
}
