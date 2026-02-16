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
import { ChatRulesPanel, ChatRulesBanner } from "./ChatRulesPanel";
import { useChatRules, useRoomBans } from "@/hooks/useChatRules";
import { validateMessageClientSide } from "@/lib/clientChatRules";
import { toast } from "sonner";
import { useModeration } from "@/hooks/useModeration";
import { useRoleBadges, RoleBadgeTag } from "@/hooks/useRoleBadges";
import { QuickMuteDialog } from "./ModerationPanel";
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
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { useBlockedUsers } from "@/hooks/useMuteBlockReport";

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
    onLeave?: () => void;
    /** Called after room settings are saved so parent can update list/selection */
    onSettingsUpdated?: (updatedChat: TokenChat) => void;
}

export function TokenChatModal({
    isOpen,
    onClose,
    userAddress,
    chat,
    getUserInfo,
    onOpenUserCard,
    onLeave,
    onSettingsUpdated,
}: TokenChatModalProps) {
    // Messages state
    const [messages, setMessages] = useState<TokenChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [messageInput, setMessageInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [memberCount, setMemberCount] = useState(0);

    // Chat data (mutable copy for live updates)
    const [chatData, setChatData] = useState<TokenChat | null>(chat);

    // UI state
    const [showInfo, setShowInfo] = useState(false);
    const [showMembersList, setShowMembersList] = useState(false);
    const [showPixelArt, setShowPixelArt] = useState(false);
    const [showRulesPanel, setShowRulesPanel] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showHeaderMenu, setShowHeaderMenu] = useState(false);
    const [replyingTo, setReplyingTo] = useState<TokenChatMessage | null>(null);
    const [selectedMessage, setSelectedMessage] = useState<MessageActionConfig | null>(null);
    const [showMessageActions, setShowMessageActions] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isUploading, setIsUploading] = useState(false);

    // Settings edit state
    const [editName, setEditName] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editEmoji, setEditEmoji] = useState("");
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    // Icon upload state
    const [chatIcon, setChatIcon] = useState<string | null>(null);
    const [isUploadingIcon, setIsUploadingIcon] = useState(false);
    const [isUploadingPixelArt, setIsUploadingPixelArt] = useState(false);
    const iconInputRef = useRef<HTMLInputElement>(null);

    // User popup state for moderation
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [userPopupPosition, setUserPopupPosition] = useState<{ x: number; y: number } | null>(null);
    const [muteTarget, setMuteTarget] = useState<{ address: string; name: string } | null>(null);

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const pollRef = useRef<NodeJS.Timeout | null>(null);
    const lastMessageIdRef = useRef<string | null>(null);
    const userScrolledUpRef = useRef(false);
    const justSentMessageRef = useRef(false);

    const timezone = useUserTimezone();
    const chain = chatData ? getChainById(chatData.token_chain_id) : null;

    // Moderation hooks
    const { rules: chatRules } = useChatRules("token", chatData?.id || null);
    const roomBans = useRoomBans("token", chatData?.id || null);
    const moderation = useModeration(userAddress, chatData?.id || null);
    const { getRoleBadge } = useRoleBadges();
    const { isAdmin: isGlobalAdmin } = useAdminCheck(userAddress);
    const { isBlocked: isUserBlocked } = useBlockedUsers(userAddress);

    // Permission checks
    const isChatCreator = chatData?.created_by?.toLowerCase() === userAddress?.toLowerCase();
    const canModerateChat = isGlobalAdmin || isChatCreator || moderation.permissions.isModerator;
    const canEditSettings = isGlobalAdmin || isChatCreator || moderation.permissions.canManageMods;

    // Message reactions
    const {
        reactions: msgReactions,
        fetchReactions: fetchMsgReactions,
        toggleReaction: toggleMsgReaction,
    } = useMessageReactions(userAddress, isOpen && chatData ? chatData.id : null);

    // Sync chat prop changes
    useEffect(() => {
        if (chat) {
            setChatData(chat);
            setChatIcon(chat.icon_url || null);
        }
    }, [chat]);

    // Filter out messages from blocked users
    const filteredMessages = useMemo(
        () => messages.filter((msg) => !isUserBlocked(msg.sender_address)),
        [messages, isUserBlocked],
    );

    // Fetch reactions when messages change
    useEffect(() => {
        const messageIds = filteredMessages.map((msg) => msg.id);
        if (messageIds.length > 0) {
            fetchMsgReactions(messageIds);
        }
    }, [filteredMessages, fetchMsgReactions]);

    // Mentionable users from message senders
    const mentionableUsers: MentionUser[] = useMemo(() => {
        const userMap = new Map<string, MentionUser>();
        filteredMessages.forEach((msg) => {
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
    }, [filteredMessages, userAddress, getUserInfo]);

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
            if (!chatData) return;
            setIsLoading(true);
            try {
                const params = new URLSearchParams({
                    userAddress: userAddress.toLowerCase(),
                });
                if (before) params.set("before", before);

                const res = await fetch(
                    `/api/token-chats/${chatData.id}/messages?${params}`,
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
        [chatData, userAddress],
    );

    // Initial load + polling
    useEffect(() => {
        if (!isOpen || !chatData) return;

        fetchMessages();
        setMemberCount(chatData.member_count || 0);

        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(
                    `/api/token-chats/${chatData.id}/messages?userAddress=${userAddress.toLowerCase()}&limit=50`,
                );
                const data = await res.json();
                if (res.ok && data.messages?.length > 0) {
                    const latest = data.messages[data.messages.length - 1];
                    if (latest.id !== lastMessageIdRef.current) {
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
    }, [isOpen, chatData, fetchMessages, userAddress, messages]);

    // Track last message ID
    useEffect(() => {
        if (filteredMessages.length > 0) {
            lastMessageIdRef.current = filteredMessages[filteredMessages.length - 1].id;
        }
    }, [filteredMessages]);

    // Auto-scroll on new messages
    useEffect(() => {
        if (!userScrolledUpRef.current || justSentMessageRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            justSentMessageRef.current = false;
        }
    }, [filteredMessages]);

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
        if (!messageInput.trim() || !chatData || isSending) return;

        // Validate against chat rules
        const ruleError = validateMessageClientSide(chatRules, messageInput.trim(), "text", canModerateChat);
        if (ruleError) {
            toast.error(ruleError);
            return;
        }

        const content = messageInput.trim();
        setMessageInput("");
        setIsSending(true);
        justSentMessageRef.current = true;

        try {
            const res = await fetch(`/api/token-chats/${chatData.id}/messages`, {
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
    }, [messageInput, chatData, isSending, userAddress, replyingTo, chatRules]);

    // Send pixel art (upload to IPFS first, then send URL as message)
    const handleSendPixelArt = useCallback(
        async (imageData: string) => {
            if (!chatData) return;

            // Validate against chat rules
            const ruleViolation = validateMessageClientSide(chatRules, "", "pixel_art", canModerateChat);
            if (ruleViolation) {
                toast.error(ruleViolation);
                return;
            }

            setIsUploadingPixelArt(true);
            justSentMessageRef.current = true;
            try {
                // Upload pixel art to IPFS via the pixel-art endpoint
                const uploadRes = await fetch("/api/pixel-art/upload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        imageData,
                        senderAddress: userAddress,
                    }),
                });

                const uploadResult = await uploadRes.json();
                if (!uploadResult.success) {
                    throw new Error(uploadResult.error || "Failed to upload pixel art");
                }

                const pixelArtUrl = uploadResult.ipfsUrl;

                // Send the IPFS URL as a pixel art message
                const res = await fetch(`/api/token-chats/${chatData.id}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userAddress: userAddress.toLowerCase(),
                        content: `[PIXEL_ART]${pixelArtUrl}`,
                    }),
                });
                const data = await res.json();
                if (res.ok && data.message) {
                    setMessages((prev) => [...prev, data.message]);
                }

                // Close the pixel art editor on success
                setShowPixelArt(false);
            } catch (err) {
                console.error("[TokenChat] Send pixel art error:", err);
                toast.error("Failed to send pixel art. Please try again.");
            } finally {
                setIsUploadingPixelArt(false);
            }
        },
        [chatData, userAddress, chatRules, canModerateChat],
    );

    // Send GIF
    const handleSendGif = useCallback(
        async (gifUrl: string) => {
            if (!chatData) return;

            // Validate against chat rules
            const ruleViolation = validateMessageClientSide(chatRules, gifUrl, "gif", canModerateChat);
            if (ruleViolation) {
                toast.error(ruleViolation);
                return;
            }

            setIsSending(true);
            justSentMessageRef.current = true;
            try {
                const res = await fetch(`/api/token-chats/${chatData.id}/messages`, {
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
        [chatData, userAddress, chatRules, canModerateChat],
    );

    // Cancel reply
    const cancelReply = useCallback(() => {
        setReplyingTo(null);
        inputRef.current?.focus();
    }, []);

    // Delete message
    const handleDeleteMessage = useCallback(
        async (messageId: string) => {
            if (!chatData) return;
            try {
                const res = await fetch(
                    `/api/token-chats/${chatData.id}/messages?messageId=${messageId}&userAddress=${userAddress.toLowerCase()}`,
                    { method: "DELETE" },
                );
                if (res.ok) {
                    setMessages((prev) => prev.filter((m) => m.id !== messageId));
                    toast.success("Message deleted");
                } else {
                    const data = await res.json();
                    toast.error(data.error || "Failed to delete message");
                }
            } catch (err) {
                console.error("[TokenChat] Delete error:", err);
            }
        },
        [chatData, userAddress],
    );

    // Icon upload
    const handleIconUpload = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file || !chatData) return;

            setIsUploadingIcon(true);
            try {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("userAddress", userAddress);

                const res = await fetch(`/api/token-chats/${chatData.id}/icon`, {
                    method: "POST",
                    body: formData,
                });
                const data = await res.json();

                if (!res.ok) throw new Error(data.error || "Failed to upload icon");

                setChatIcon(data.icon_url);
                if (chatData) chatData.icon_url = data.icon_url;
                toast.success("Chat icon updated!");
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to upload icon");
            } finally {
                setIsUploadingIcon(false);
                e.target.value = "";
            }
        },
        [chatData, userAddress],
    );

    // Remove icon
    const handleRemoveIcon = useCallback(async () => {
        if (!chatData) return;
        try {
            const res = await fetch(
                `/api/token-chats/${chatData.id}/icon?userAddress=${userAddress.toLowerCase()}`,
                { method: "DELETE" },
            );
            if (res.ok) {
                setChatIcon(null);
                if (chatData) chatData.icon_url = null;
                toast.success("Chat icon removed");
            }
        } catch {
            toast.error("Failed to remove icon");
        }
    }, [chatData, userAddress]);

    // Save settings
    const handleSaveSettings = useCallback(async () => {
        if (!chatData) return;
        const trimmedName = editName.trim();
        if (!trimmedName) {
            toast.error("Chat name is required");
            return;
        }
        setIsSavingSettings(true);
        try {
            const res = await fetch(`/api/token-chats/${chatData.id}/settings`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAddress: userAddress.toLowerCase(),
                    name: trimmedName,
                    description: editDescription?.trim() || null,
                    emoji: (editEmoji?.trim() || "🪙").slice(0, 4),
                }),
            });
            const data = await res.json();
            if (res.ok && data.chat) {
                setChatData(data.chat);
                setShowSettings(false);
                toast.success("Room settings updated!");
                onSettingsUpdated?.(data.chat);
            } else {
                toast.error(data.error || "Failed to update settings");
            }
        } catch {
            toast.error("Failed to update settings");
        } finally {
            setIsSavingSettings(false);
        }
    }, [chatData, userAddress, editName, editDescription, editEmoji, onSettingsUpdated]);

    // Leave chat
    const handleLeaveChat = useCallback(async () => {
        if (!chatData) return;
        if (!confirm("Are you sure you want to leave this token chat?")) return;

        try {
            const res = await fetch(`/api/token-chats/${chatData.id}/leave`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userAddress: userAddress.toLowerCase() }),
            });
            const data = await res.json();

            if (res.ok) {
                toast.success("Left token chat");
                onLeave?.();
                onClose();
            } else {
                toast.error(data.error || "Failed to leave chat");
            }
        } catch {
            toast.error("Failed to leave chat");
        }
    }, [chatData, userAddress, onLeave, onClose]);

    // Promote/demote member
    const handleChangeRole = useCallback(
        async (targetAddress: string, role: string) => {
            if (!chatData) return;
            try {
                const res = await fetch(`/api/token-chats/${chatData.id}/members`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userAddress: userAddress.toLowerCase(),
                        targetAddress,
                        role,
                    }),
                });
                const data = await res.json();
                if (res.ok) {
                    toast.success(`User ${role === "moderator" ? "promoted to moderator" : role === "admin" ? "promoted to admin" : "demoted to member"}`);
                    setSelectedUser(null);
                    setUserPopupPosition(null);
                } else {
                    toast.error(data.error || "Failed to update role");
                }
            } catch {
                toast.error("Failed to update role");
            }
        },
        [chatData, userAddress],
    );

    // Kick member
    const handleKickMember = useCallback(
        async (targetAddress: string) => {
            if (!chatData) return;
            if (!confirm("Remove this member from the chat?")) return;
            try {
                const res = await fetch(
                    `/api/token-chats/${chatData.id}/members?userAddress=${userAddress.toLowerCase()}&targetAddress=${targetAddress.toLowerCase()}`,
                    { method: "DELETE" },
                );
                const data = await res.json();
                if (res.ok) {
                    toast.success("Member removed");
                    setSelectedUser(null);
                    setUserPopupPosition(null);
                } else {
                    toast.error(data.error || "Failed to remove member");
                }
            } catch {
                toast.error("Failed to remove member");
            }
        },
        [chatData, userAddress],
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
                    toast.success("Copied to clipboard");
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
            onView: () => {
                const msg = actionMessageRef.current;
                if (msg) {
                    const isPixelArt = isPixelArtMessage(msg.content);
                    const url = isPixelArt ? extractPixelArtUrl(msg.content) : msg.content;
                    if (url) setPreviewImage(url);
                }
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
            const isPixelArt = isPixelArtMessage(msg.content);
            const pixelArtUrl = isPixelArt ? extractPixelArtUrl(msg.content) : null;
            const isGif = isGifMessage(msg.content);
            const isMedia = isPixelArt || isGif;
            const mediaUrl = isPixelArt ? pixelArtUrl : isGif ? msg.content : null;

            const config: MessageActionConfig = {
                messageId: msg.id,
                messageContent: msg.content,
                isOwn,
                canEdit: false,
                canDelete: isOwn || canModerateChat,
                hasMedia: isMedia,
                isPixelArt,
                mediaUrl: mediaUrl || undefined,
            };
            setSelectedMessage(config);
            setShowMessageActions(true);
        },
        [canModerateChat],
    );

    // User avatar click (with moderation popup for admins/mods)
    const handleUserClick = useCallback(
        (address: string, event?: React.MouseEvent) => {
            if (canModerateChat && address.toLowerCase() !== userAddress.toLowerCase()) {
                if (event) {
                    setUserPopupPosition({ x: event.clientX, y: event.clientY });
                }
                setSelectedUser(address);
            } else {
                onOpenUserCard?.(address);
            }
        },
        [canModerateChat, userAddress, onOpenUserCard],
    );

    // Copy address helper
    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copied!");
    };

    // Open settings with current values
    const openSettings = useCallback(() => {
        if (!chatData) return;
        setEditName(chatData.name);
        setEditDescription(chatData.description || "");
        setEditEmoji(chatData.emoji || "🪙");
        setShowSettings(true);
        setShowInfo(false);
    }, [chatData]);

    if (!chatData) return null;

    const explorerUrl = chain?.explorerUrl
        ? `${chain.explorerUrl}/token/${chatData.token_address}`
        : `https://etherscan.io/token/${chatData.token_address}`;

    // Determine chat avatar display
    const chatAvatarContent = chatIcon ? (
        <img src={chatIcon} alt={chatData.name} className="w-10 h-10 rounded-xl object-cover" />
    ) : (
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center text-xl shrink-0">
            {chatData.emoji || "🪙"}
        </div>
    );

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
                                    {chatAvatarContent}
                                    <div className="flex-1 min-w-0 pr-1">
                                        <div className="flex items-center gap-1.5">
                                            <h2 className="font-semibold text-white text-[15px] truncate leading-tight">
                                                {chatData.name}
                                            </h2>
                                            {chatData.is_official && (
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
                                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                            </svg>
                                            {memberCount} {memberCount === 1 ? "member" : "members"}
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                    {/* Token badge */}
                                    <span className="text-xs text-zinc-500 flex items-center gap-1 px-1.5">
                                        {chain?.icon} {chatData.token_symbol}
                                    </span>
                                    {/* Messaging type badge */}
                                    {chatData.messaging_type === "waku" && (
                                        <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-[9px] font-bold rounded-full border border-purple-500/30">
                                            🌐 P2P
                                        </span>
                                    )}
                                    {/* Room menu (...): Room Settings, Room Rules, Leave */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowHeaderMenu(!showHeaderMenu)}
                                            className="p-2.5 rounded-xl transition-colors text-zinc-400 hover:text-white hover:bg-zinc-800"
                                            aria-label="Room options"
                                            title="Room options"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                            </svg>
                                        </button>
                                        <AnimatePresence>
                                            {showHeaderMenu && (
                                                <>
                                                    <motion.div
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        className="fixed inset-0 z-40"
                                                        onClick={() => setShowHeaderMenu(false)}
                                                    />
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                                        exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                                        className="absolute right-0 top-full mt-1 w-52 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50"
                                                    >
                                                        {canEditSettings && (
                                                            <button
                                                                onClick={() => {
                                                                    setShowHeaderMenu(false);
                                                                    openSettings();
                                                                }}
                                                                className="w-full px-4 py-3 text-left text-sm text-white hover:bg-zinc-700 transition-colors flex items-center gap-3"
                                                            >
                                                                <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                                Room Settings
                                                            </button>
                                                        )}
                                                        {canModerateChat && (
                                                            <button
                                                                onClick={() => {
                                                                    setShowHeaderMenu(false);
                                                                    setShowRulesPanel(true);
                                                                }}
                                                                className="w-full px-4 py-3 text-left text-sm text-white hover:bg-zinc-700 transition-colors flex items-center gap-3"
                                                            >
                                                                <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                                                                </svg>
                                                                Room Rules
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                setShowHeaderMenu(false);
                                                                handleLeaveChat();
                                                            }}
                                                            className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-zinc-700 transition-colors flex items-center gap-3"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                                            </svg>
                                                            Leave Chat
                                                        </button>
                                                    </motion.div>
                                                </>
                                            )}
                                        </AnimatePresence>
                                    </div>
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
                                    {/* Open in new tab */}
                                    <button
                                        onClick={() => chatData && window.open(`/token-chat/${chatData.id}`, "_blank", "noopener,noreferrer")}
                                        className="p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                                        aria-label="Open chat in new tab"
                                        title="Open in new tab"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
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
                                                <div className="absolute inset-0 opacity-10">
                                                    <div className="w-full h-full" style={{
                                                        backgroundImage: "radial-gradient(circle, rgba(255,85,0,0.3) 1px, transparent 1px)",
                                                        backgroundSize: "20px 20px",
                                                    }} />
                                                </div>
                                                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-zinc-900/90 to-transparent" />

                                                <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                                                    <div className="flex items-center gap-3">
                                                        {/* Chat icon with upload overlay */}
                                                        <div className="relative group">
                                                            {chatIcon ? (
                                                                <img src={chatIcon} alt={chatData.name} className="w-14 h-14 rounded-2xl border-2 border-zinc-900 object-cover shadow-lg shadow-orange-500/20" />
                                                            ) : (
                                                                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-orange-500/20 flex items-center justify-center text-2xl border-2 border-zinc-900">
                                                                    {chatData.emoji || "🪙"}
                                                                </div>
                                                            )}
                                                            {canEditSettings && (
                                                                <button
                                                                    onClick={() => iconInputRef.current?.click()}
                                                                    className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                                                >
                                                                    {isUploadingIcon ? (
                                                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                                    ) : (
                                                                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                        </svg>
                                                                    )}
                                                                </button>
                                                            )}
                                                            <input
                                                                ref={iconInputRef}
                                                                type="file"
                                                                accept="image/jpeg,image/png,image/gif,image/webp"
                                                                className="hidden"
                                                                onChange={handleIconUpload}
                                                            />
                                                        </div>
                                                        <div>
                                                            <h3 className="font-bold text-white text-lg drop-shadow-lg">
                                                                {chatData.token_name} ({chatData.token_symbol})
                                                            </h3>
                                                            <span className="text-xs text-zinc-300 flex items-center gap-1">
                                                                {chain?.icon} {chain?.name}
                                                                {chatData.is_official && (
                                                                    <span className="ml-1 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] font-bold rounded-full border border-emerald-500/30">
                                                                        OFFICIAL
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {chatData.min_balance_display &&
                                                        parseFloat(chatData.min_balance_display) > 0 && (
                                                            <div className="bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                                                                <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                                </svg>
                                                                <span className="text-white text-xs font-semibold">
                                                                    {Number(chatData.min_balance_display).toLocaleString()} {chatData.token_symbol}
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
                                                                {chatData.token_address}
                                                            </p>
                                                            <button
                                                                onClick={() => copyToClipboard(chatData.token_address)}
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
                                                        onClick={async () => {
                                                            const inviteUrl = `${window.location.origin}/token-chat/${chatData.id}`;
                                                            const inviteText = `Join the ${chatData.name} token chat on Spritz!\n\n${inviteUrl}`;
                                                            if (navigator.share) {
                                                                try {
                                                                    await navigator.share({
                                                                        title: chatData.name,
                                                                        text: `Join the ${chatData.name} token chat on Spritz!`,
                                                                        url: inviteUrl,
                                                                    });
                                                                } catch {
                                                                    navigator.clipboard.writeText(inviteText);
                                                                    toast.success("Invite link copied!");
                                                                }
                                                            } else {
                                                                navigator.clipboard.writeText(inviteText);
                                                                toast.success("Invite link copied!");
                                                            }
                                                        }}
                                                        className="py-3 px-4 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-white text-sm font-medium rounded-xl transition-all"
                                                        title="Share invite link"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                                        </svg>
                                                    </button>
                                                </div>

                                                {/* Description */}
                                                {chatData.description && (
                                                    <div className="p-3 bg-zinc-800/30 rounded-xl border border-zinc-700/50">
                                                        <p className="text-sm text-zinc-300 leading-relaxed">
                                                            {chatData.description}
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Stats */}
                                                <div className="grid grid-cols-4 gap-2">
                                                    <div className="p-3 bg-zinc-800/30 rounded-xl text-center">
                                                        <p className="text-xl font-bold text-white">{memberCount}</p>
                                                        <p className="text-xs text-zinc-500">Members</p>
                                                    </div>
                                                    <div className="p-3 bg-zinc-800/30 rounded-xl text-center">
                                                        <p className="text-xl font-bold text-white">{filteredMessages.length}</p>
                                                        <p className="text-xs text-zinc-500">Messages</p>
                                                    </div>
                                                    <div className="p-3 bg-zinc-800/30 rounded-xl text-center">
                                                        <p className="text-xl">{chain?.icon || "🪙"}</p>
                                                        <p className="text-xs text-zinc-500">{chain?.name || "Chain"}</p>
                                                    </div>
                                                    <div className="p-3 bg-zinc-800/30 rounded-xl text-center">
                                                        <p className="text-xl">{chatData.messaging_type === "waku" ? "🌐" : "☁️"}</p>
                                                        <p className="text-xs text-zinc-500">{chatData.messaging_type === "waku" ? "P2P" : "Standard"}</p>
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
                                                        {chatData.min_balance_display && parseFloat(chatData.min_balance_display) > 0
                                                            ? `Members must hold at least ${Number(chatData.min_balance_display).toLocaleString()} ${chatData.token_symbol} to join. Balance is checked across all connected wallets including EOA, Spritz Wallet, and Vaults.`
                                                            : `Open to all ${chatData.token_symbol} holders. No minimum balance required.`}
                                                    </p>
                                                </div>

                                                {/* Share Invite Link */}
                                                <button
                                                    onClick={async () => {
                                                        const inviteUrl = `${window.location.origin}/token-chat/${chatData.id}`;
                                                        const inviteText = `Join the ${chatData.name} token chat on Spritz!\n\n${inviteUrl}`;
                                                        if (navigator.share) {
                                                            try {
                                                                await navigator.share({
                                                                    title: chatData.name,
                                                                    text: `Join the ${chatData.name} token chat on Spritz!`,
                                                                    url: inviteUrl,
                                                                });
                                                            } catch {
                                                                navigator.clipboard.writeText(inviteText);
                                                                toast.success("Invite link copied!");
                                                            }
                                                        } else {
                                                            navigator.clipboard.writeText(inviteText);
                                                            toast.success("Invite link copied!");
                                                        }
                                                    }}
                                                    className="w-full flex items-center gap-3 p-3 bg-[#FF5500]/10 hover:bg-[#FF5500]/20 border border-[#FF5500]/30 rounded-xl transition-colors text-left group"
                                                >
                                                    <div className="w-9 h-9 rounded-xl bg-[#FF5500]/20 flex items-center justify-center">
                                                        <svg className="w-4 h-4 text-[#FF5500]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm text-[#FF5500] font-medium group-hover:text-orange-400">Share Invite Link</p>
                                                        <p className="text-xs text-zinc-500">Share on social media or copy link</p>
                                                    </div>
                                                </button>

                                                {/* Admin Actions */}
                                                <div className="flex flex-col gap-2">
                                                    {canEditSettings && (
                                                        <>
                                                            <button
                                                                onClick={openSettings}
                                                                className="w-full flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors text-left"
                                                            >
                                                                <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                                                    <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                    </svg>
                                                                </div>
                                                                <div>
                                                                    <p className="text-sm text-white font-medium">Edit Chat Settings</p>
                                                                    <p className="text-xs text-zinc-500">Name, description, emoji</p>
                                                                </div>
                                                            </button>
                                                            {chatIcon && (
                                                                <button
                                                                    onClick={handleRemoveIcon}
                                                                    className="w-full flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors text-left"
                                                                >
                                                                    <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
                                                                        <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                        </svg>
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-sm text-red-400 font-medium">Remove Custom Icon</p>
                                                                        <p className="text-xs text-zinc-500">Revert to emoji</p>
                                                                    </div>
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                    {/* Leave chat */}
                                                    <button
                                                        onClick={handleLeaveChat}
                                                        className="w-full flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-red-500/10 rounded-xl transition-colors text-left group"
                                                    >
                                                        <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
                                                            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                                            </svg>
                                                        </div>
                                                        <div>
                                                            <p className="text-sm text-red-400 font-medium group-hover:text-red-300">Leave Chat</p>
                                                            <p className="text-xs text-zinc-500">You can rejoin if you still meet requirements</p>
                                                        </div>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Chat Rules Banner */}
                            <ChatRulesBanner chatType="token" chatId={chatData.id} />

                            {/* Messages */}
                            <div
                                ref={messagesContainerRef}
                                onScroll={handleMessagesScroll}
                                className="flex-1 overflow-y-auto p-4 space-y-4"
                            >
                                {isLoading && filteredMessages.length === 0 ? (
                                    <ChatSkeleton />
                                ) : filteredMessages.length === 0 ? (
                                    <ChatEmptyState
                                        title="Start the conversation"
                                        subtitle={`Be the first to say something in ${chatData.name}!`}
                                        icon={chatData.emoji || "🪙"}
                                    />
                                ) : (
                                    <>
                                        {/* Load more */}
                                        {hasMore && (
                                            <button
                                                onClick={() => {
                                                    if (filteredMessages.length > 0) {
                                                        fetchMessages(filteredMessages[0].created_at);
                                                    }
                                                }}
                                                disabled={isLoading}
                                                className="w-full py-2 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
                                            >
                                                {isLoading ? "Loading..." : "Load earlier messages"}
                                            </button>
                                        )}

                                        {filteredMessages.map((msg, idx) => {
                                            const isOwn =
                                                msg.sender_address.toLowerCase() ===
                                                userAddress.toLowerCase();
                                            const showAvatar =
                                                idx === 0 ||
                                                filteredMessages[idx - 1].sender_address !== msg.sender_address;
                                            const isGif = isGifMessage(msg.content);
                                            const isPixelArt = isPixelArtMessage(msg.content);
                                            const pixelArtUrl = isPixelArt ? extractPixelArtUrl(msg.content) : null;
                                            const urls = !isGif && !isPixelArt ? detectUrls(msg.content) : [];
                                            const messageReactions = msgReactions[msg.id] || [];
                                            const hasReactions = messageReactions.some((r) => r.count > 0);
                                            const roleBadge = getRoleBadge(msg.sender_address);
                                            const isMuted = moderation.isUserMuted?.(msg.sender_address);

                                            return (
                                                <div
                                                    key={msg.id}
                                                    className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""} ${isMuted ? "opacity-50" : ""}`}
                                                >
                                                    {/* Avatar */}
                                                    {showAvatar && !isOwn ? (
                                                        <button
                                                            onClick={(e) => handleUserClick(msg.sender_address, e)}
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
                                                        {/* Sender name + role badge */}
                                                        {showAvatar && !isOwn && (
                                                            <span className="text-xs text-zinc-500 mb-1 ml-1 flex items-center gap-1">
                                                                {getDisplayName(msg.sender_address)}
                                                                {roleBadge && <RoleBadgeTag role={roleBadge} />}
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
                                                                <div className="rounded-2xl overflow-hidden">
                                                                    <PixelArtImage
                                                                        src={pixelArtUrl}
                                                                        alt="Pixel art"
                                                                        className="w-[200px] h-[200px] rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
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
                                            isUploading={isUploading || isUploadingPixelArt}
                                            disabled={isSending}
                                            chatRules={chatRules}
                                            isModerator={canModerateChat}
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
                                                    : `Message ${chatData.name}...`
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

            {/* Edit Settings Modal */}
            <AnimatePresence>
                {showSettings && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
                        onClick={() => setShowSettings(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                                <h3 className="font-semibold text-white">Edit Chat Settings</h3>
                                <button
                                    onClick={() => setShowSettings(false)}
                                    className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <div className="p-4 space-y-4">
                                <div>
                                    <label className="block text-xs text-zinc-400 mb-1.5">Chat Name</label>
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        maxLength={50}
                                        className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF5500]/50 focus:border-[#FF5500]"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-zinc-400 mb-1.5">Description</label>
                                    <textarea
                                        value={editDescription}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                        maxLength={500}
                                        rows={3}
                                        className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF5500]/50 focus:border-[#FF5500] resize-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-zinc-400 mb-1.5">Emoji</label>
                                    <input
                                        type="text"
                                        value={editEmoji}
                                        onChange={(e) => setEditEmoji(e.target.value)}
                                        maxLength={4}
                                        className="w-20 px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-2xl text-center focus:outline-none focus:ring-2 focus:ring-[#FF5500]/50 focus:border-[#FF5500]"
                                    />
                                </div>
                                <button
                                    onClick={handleSaveSettings}
                                    disabled={!editName.trim() || isSavingSettings}
                                    className="w-full py-3 bg-[#FF5500] hover:bg-[#E64D00] disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold rounded-xl transition-colors"
                                >
                                    {isSavingSettings ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* User Moderation Popup */}
            <AnimatePresence>
                {selectedUser && userPopupPosition && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60]"
                        onClick={() => {
                            setSelectedUser(null);
                            setUserPopupPosition(null);
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="absolute bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden w-56"
                            style={{
                                left: Math.min(userPopupPosition.x, window.innerWidth - 240),
                                top: Math.min(userPopupPosition.y, window.innerHeight - 350),
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* User Info */}
                            <div className="p-3 border-b border-zinc-800">
                                <div className="flex items-center gap-2">
                                    <AvatarWithStatus
                                        name={getDisplayName(selectedUser)}
                                        src={getAvatar(selectedUser)}
                                        size="sm"
                                    />
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-white truncate">
                                            {getDisplayName(selectedUser)}
                                        </p>
                                        <p className="text-[10px] text-zinc-500 font-mono truncate">
                                            {selectedUser.slice(0, 10)}...
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="p-1.5">
                                <button
                                    onClick={() => {
                                        onOpenUserCard?.(selectedUser);
                                        setSelectedUser(null);
                                        setUserPopupPosition(null);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    View Profile
                                </button>

                                {canModerateChat && (
                                    <>
                                        <div className="h-px bg-zinc-800 my-1" />

                                        {/* Promote to Moderator */}
                                        <button
                                            onClick={() => handleChangeRole(selectedUser, "moderator")}
                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                            </svg>
                                            Make Moderator
                                        </button>

                                        {/* Demote to Member */}
                                        <button
                                            onClick={() => handleChangeRole(selectedUser, "member")}
                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                            </svg>
                                            Set as Member
                                        </button>

                                        <div className="h-px bg-zinc-800 my-1" />

                                        {/* Mute */}
                                        {moderation.permissions.canMute && !moderation.isUserMuted?.(selectedUser) && (
                                            <button
                                                onClick={() => {
                                                    setMuteTarget({
                                                        address: selectedUser,
                                                        name: getDisplayName(selectedUser),
                                                    });
                                                    setSelectedUser(null);
                                                    setUserPopupPosition(null);
                                                }}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                                </svg>
                                                Mute User
                                            </button>
                                        )}

                                        {moderation.permissions.canMute && moderation.isUserMuted?.(selectedUser) && (
                                            <button
                                                onClick={async () => {
                                                    await moderation.unmuteUser(selectedUser);
                                                    setSelectedUser(null);
                                                    setUserPopupPosition(null);
                                                    toast.success("User unmuted");
                                                }}
                                                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                                </svg>
                                                Unmute User
                                            </button>
                                        )}

                                        {/* Kick */}
                                        <button
                                            onClick={() => handleKickMember(selectedUser)}
                                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                                            </svg>
                                            Remove from Chat
                                        </button>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Quick Mute Dialog */}
            {muteTarget && (
                <QuickMuteDialog
                    isOpen={!!muteTarget}
                    onClose={() => setMuteTarget(null)}
                    targetAddress={muteTarget.address}
                    targetName={muteTarget.name}
                    onMute={async (duration, reason) => {
                        const success = await moderation.muteUser(muteTarget.address, {
                            duration,
                            reason: reason || "Muted by moderator",
                        });
                        if (success) {
                            toast.success(`${muteTarget.name} has been muted`);
                            setMuteTarget(null);
                        }
                        return !!success;
                    }}
                />
            )}

            {/* Chat Rules Panel */}
            <ChatRulesPanel
                isOpen={showRulesPanel}
                onClose={() => setShowRulesPanel(false)}
                chatType="token"
                chatId={chatData.id}
                chatName={chatData.name}
            />

            {/* Pixel Art Editor */}
            {showPixelArt && (
                <PixelArtEditor
                    isOpen={showPixelArt}
                    onClose={() => setShowPixelArt(false)}
                    onSend={handleSendPixelArt}
                    isSending={isUploadingPixelArt}
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
                channelId={chatData.id}
                tokenChatId={chatData.id}
                isOpen={showMembersList}
                onClose={() => setShowMembersList(false)}
                onUserClick={onOpenUserCard}
                getUserInfo={getUserInfo}
                currentUserAddress={userAddress}
            />
        </>
    );
}
