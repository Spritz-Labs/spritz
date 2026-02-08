"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    useChannelMessages,
    CHANNEL_REACTION_EMOJIS,
    type ChannelMessageReaction,
} from "@/hooks/useChannels";
import type { PublicChannel } from "@/app/api/channels/route";
import type {
    ChannelMessage,
    ChannelReaction,
} from "@/app/api/channels/[id]/messages/route";
import { QuickReactionPicker, ReactionDisplay } from "./EmojiPicker";
import { MessageActionsSheet, ActionIcons } from "./MessageActionsSheet";
import { MentionInput, type MentionUser } from "./MentionInput";
import { MentionText } from "./MentionText";
import { PixelArtEditor } from "./PixelArtEditor";
import { PixelArtImage } from "./PixelArtImage";
import { ChatAttachmentMenu } from "./ChatAttachmentMenu";
import { PollCreator } from "./PollCreator";
import { PollDisplay, type DisplayPoll } from "./PollDisplay";
import { PollEditModal } from "./PollEditModal";
import { usePolls } from "@/hooks/usePolls";
import { ChatMarkdown, hasMarkdown } from "./ChatMarkdown";
import { AgentMarkdown, AgentMessageWrapper, AgentThinkingIndicator } from "./AgentMarkdown";
import { ChannelIcon } from "./ChannelIcon";
import { ImageViewerModal } from "./ImageViewerModal";
import {
    useWakuChannel,
    type WakuChannelMessage,
} from "@/hooks/useWakuChannel";
import { TypingIndicator } from "./TypingIndicator";
import { AvatarWithStatus } from "./OnlineStatus";
import { UnreadDivider, DateDivider } from "./UnreadDivider";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { fetchOnlineStatuses, isUserOnline } from "@/hooks/usePresence";
import {
    LocationMessage,
    isLocationMessage,
    parseLocationMessage,
    formatLocationMessage,
    type LocationData,
} from "./LocationMessage";
import { useStarredMessages } from "@/hooks/useStarredMessages";
import { ForwardMessageModal } from "./ForwardMessageModal";
import { ScrollToBottom, useScrollToBottom } from "./ScrollToBottom";
import { ChatSkeleton } from "./ChatSkeleton";
import { ChatEmptyState } from "./ChatEmptyState";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatTimeInTimezone } from "@/lib/timezone";
import { useDraftMessages } from "@/hooks/useDraftMessages";
import { SwipeableMessage } from "./SwipeableMessage";
import { MessageActionBar, type MessageActionConfig } from "./MessageActionBar";
import { ChatMembersList } from "./ChatMembersList";
import { LinkPreview, detectUrls } from "./LinkPreview";
import { MessageSearch } from "./MessageSearch";

// Helper to detect if a message is emoji-only (for larger display)
const EMOJI_REGEX =
    /^[\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Modifier_Base}\p{Emoji_Presentation}\u200d\ufe0f\s]+$/u;
const isEmojiOnly = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (!EMOJI_REGEX.test(trimmed)) return false;
    const emojiCount = [...trimmed].filter(
        (char) => /\p{Emoji}/u.test(char) && !/\d/u.test(char)
    ).length;
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
    /** When set, clicking a user avatar opens the full user card instead of the popover */
    onOpenUserCard?: (address: string) => void;
    // For adding friends
    onAddFriend?: (address: string) => Promise<boolean>;
    // Check if already a friend
    isFriend?: (address: string) => boolean;
    // Open DM with this user (e.g. when "Message" is clicked for an already-friend)
    onOpenDM?: (address: string) => void;
    // Notification controls
    notificationsEnabled?: boolean;
    onToggleNotifications?: () => void;
    onSetActiveChannel?: (channelId: string | null) => void;
    // Admin controls
    isAdmin?: boolean;
    // Callback when message is sent (for updating chat order)
    onMessageSent?: () => void;
    // Forward message to global chat (when user is alpha member)
    onForwardToGlobal?: (content: string) => Promise<boolean>;
    // Global chat icon URL for forward target list
    globalChatIconUrl?: string | null;
};

export function ChannelChatModal({
    isOpen,
    onClose,
    channel,
    userAddress,
    onLeave,
    onMessageSent,
    getUserInfo,
    onOpenUserCard,
    onAddFriend,
    isFriend,
    onOpenDM,
    notificationsEnabled = false,
    onToggleNotifications,
    onSetActiveChannel,
    isAdmin = false,
    onForwardToGlobal,
    globalChatIconUrl,
}: ChannelChatModalProps) {
    // Determine if this is a Waku channel
    const isWakuChannel = channel.messaging_type === "waku";

    // Standard channel messaging (Supabase)
    const standardMessages = useChannelMessages(channel.id, userAddress);

    // Waku channel messaging (decentralized)
    const wakuMessages = useWakuChannel({
        channelId: channel.id,
        contentTopic: channel.waku_content_topic || "",
        symmetricKey: channel.waku_symmetric_key || "",
        userAddress,
        onNewMessage: onMessageSent,
    });

    // Normalize message interface based on channel type (memoize for Waku to avoid re-render flash)
    const messages = isWakuChannel
        ? useMemo(
              () =>
                  wakuMessages.messages.map((m) => ({
                      id: m.id,
                      channel_id: channel.id,
                      content: m.content,
                      sender_address: m.senderAddress,
                      created_at: m.timestamp.toISOString(),
                      message_type: m.messageType,
                      is_edited: false,
                      edited_at: null,
                      is_deleted: false,
                      is_pinned: false,
                      pinned_by: null,
                      pinned_at: null,
                      reply_to_id: null,
                      reply_to: null,
                  })),
              [wakuMessages.messages, channel.id]
          )
        : standardMessages.messages;

    const pinnedMessages = isWakuChannel ? [] : standardMessages.pinnedMessages;

    // Waku channels: fetch and hold reactions by message id (same API, different message source)
    const [wakuReactions, setWakuReactions] = useState<
        Record<string, ChannelMessageReaction[]>
    >({});
    const processWakuReactions = useCallback(
        (raw: ChannelReaction[]) => {
            const map: Record<string, ChannelMessageReaction[]> = {};
            raw.forEach((r) => {
                if (!map[r.message_id]) {
                    map[r.message_id] = CHANNEL_REACTION_EMOJIS.map(
                        (emoji) => ({
                            emoji,
                            count: 0,
                            hasReacted: false,
                            users: [],
                        })
                    );
                }
                const idx = map[r.message_id].findIndex(
                    (x) => x.emoji === r.emoji
                );
                if (idx >= 0) {
                    map[r.message_id][idx].count++;
                    map[r.message_id][idx].users.push(r.user_address);
                    if (
                        userAddress &&
                        r.user_address.toLowerCase() ===
                            userAddress.toLowerCase()
                    ) {
                        map[r.message_id][idx].hasReacted = true;
                    }
                }
            });
            return map;
        },
        [userAddress]
    );
    useEffect(() => {
        if (
            !isWakuChannel ||
            !channel.id ||
            wakuMessages.messages.length === 0
        ) {
            if (isWakuChannel && wakuMessages.messages.length === 0) {
                setWakuReactions({});
            }
            return;
        }
        const messageIds = wakuMessages.messages.map((m) => m.id);
        const idsParam = messageIds.join(",");
        fetch(
            `/api/channels/${
                channel.id
            }/reactions?messageIds=${encodeURIComponent(idsParam)}`
        )
            .then((res) => res.json())
            .then((data) => {
                if (data.reactions) {
                    setWakuReactions(processWakuReactions(data.reactions));
                }
            })
            .catch((e) => {
                console.error(
                    "[ChannelChatModal] Waku reactions fetch error:",
                    e
                );
            });
    }, [
        isWakuChannel,
        channel.id,
        wakuMessages.messages,
        processWakuReactions,
    ]);

    const reactions = isWakuChannel
        ? wakuReactions
        : standardMessages.reactions;
    const isLoading = isWakuChannel
        ? wakuMessages.isLoading
        : standardMessages.isLoading;
    const isLoadingMore = isWakuChannel
        ? false
        : standardMessages.isLoadingMore;
    const hasMore = isWakuChannel ? false : standardMessages.hasMore;

    const sendMessage = isWakuChannel
        ? async (
              content: string,
              messageType:
                  | "text"
                  | "image"
                  | "pixel_art"
                  | "gif"
                  | "location" = "text"
          ) => {
              const success = await wakuMessages.sendMessage(
                  content,
                  messageType
              );
              return success ? { id: crypto.randomUUID() } : null;
          }
        : standardMessages.sendMessage;

    const editMessage = isWakuChannel
        ? async () => false // Not supported yet for Waku
        : standardMessages.editMessage;

    const deleteMessage = isWakuChannel
        ? async () => false // Not supported yet for Waku
        : standardMessages.deleteMessage;

    const toggleReactionWaku = useCallback(
        async (messageId: string, emoji: string) => {
            if (!channel.id || !userAddress) return false;
            try {
                const res = await fetch(
                    `/api/channels/${channel.id}/messages`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            messageId,
                            userAddress,
                            emoji,
                        }),
                    }
                );
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || "Failed to toggle reaction");
                }
                setWakuReactions((prev) => {
                    const updated = { ...prev };
                    if (!updated[messageId]) {
                        updated[messageId] = CHANNEL_REACTION_EMOJIS.map(
                            (e) => ({
                                emoji: e,
                                count: 0,
                                hasReacted: false,
                                users: [],
                            })
                        );
                    }
                    const idx = updated[messageId].findIndex(
                        (r) => r.emoji === emoji
                    );
                    if (idx >= 0) {
                        const wasReacted = updated[messageId][idx].hasReacted;
                        updated[messageId][idx] = {
                            ...updated[messageId][idx],
                            count: wasReacted
                                ? Math.max(0, updated[messageId][idx].count - 1)
                                : updated[messageId][idx].count + 1,
                            hasReacted: !wasReacted,
                            users: wasReacted
                                ? updated[messageId][idx].users.filter(
                                      (u) =>
                                          u.toLowerCase() !==
                                          userAddress.toLowerCase()
                                  )
                                : [
                                      ...updated[messageId][idx].users,
                                      userAddress.toLowerCase(),
                                  ],
                        };
                    }
                    return updated;
                });
                return true;
            } catch (e) {
                console.error("[ChannelChatModal] Waku reaction error:", e);
                return false;
            }
        },
        [channel.id, userAddress]
    );

    const toggleReaction = isWakuChannel
        ? toggleReactionWaku
        : standardMessages.toggleReaction;

    const togglePinMessage = isWakuChannel
        ? async () => {} // Not supported yet for Waku
        : standardMessages.togglePinMessage;

    const loadMoreMessages = isWakuChannel
        ? async () => {} // Not supported yet for Waku
        : standardMessages.loadMoreMessages;

    const replyingTo = isWakuChannel ? null : standardMessages.replyingTo;
    const setReplyingTo = isWakuChannel
        ? () => {}
        : standardMessages.setReplyingTo;
    const thinkingAgents = isWakuChannel ? [] : standardMessages.thinkingAgents;

    // Polls
    const {
        polls,
        canCreatePoll,
        fetchPolls,
        createPoll,
        vote,
        updatePoll,
        deletePoll,
    } = usePolls(channel.id, userAddress);
    const channelHiddenPollsKey = `spritz_hidden_polls_channel_${channel.id}`;
    const [hiddenPollIds, setHiddenPollIds] = useState<string[]>([]);
    useEffect(() => {
        if (!channel?.id || typeof window === "undefined") {
            setHiddenPollIds([]);
            return;
        }
        try {
            const stored = JSON.parse(
                window.localStorage.getItem(channelHiddenPollsKey) ?? "[]"
            );
            setHiddenPollIds(Array.isArray(stored) ? stored : []);
        } catch {
            setHiddenPollIds([]);
        }
    }, [channel.id, channelHiddenPollsKey]);
    const [editingPoll, setEditingPoll] = useState<DisplayPoll | null>(null);
    const visiblePolls = polls.filter((p) => !hiddenPollIds.includes(p.id));

    const [inputValue, setInputValue] = useState("");
    const [isSending, setIsSending] = useState(false);
    const draftAppliedRef = useRef(false);
    const [isUploading, setIsUploading] = useState(false);

    // Typing indicator
    const { typingUsers, setTyping, stopTyping } = useTypingIndicator(
        channel.id,
        "channel",
        userAddress,
        getUserInfo?.(userAddress)?.name || undefined
    );

    // Online statuses for channel members
    const [onlineStatuses, setOnlineStatuses] = useState<
        Record<string, boolean>
    >({});

    // Members list panel
    const [showMembersList, setShowMembersList] = useState(false);

    // Channel icon management
    const [canEditIcon, setCanEditIcon] = useState(false);
    const [channelIcon, setChannelIcon] = useState<string | null>(
        channel.poap_image_url ?? channel.icon_url ?? null
    );
    const [isUploadingIcon, setIsUploadingIcon] = useState(false);
    const iconFileInputRef = useRef<HTMLInputElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);

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

    // Check if user can edit channel icon (admin, owner, or moderator); POAP/Collection channels cannot change icon
    const isPoapOrCollectionChannel =
        channel.poap_event_id != null || channel.poap_collection_id != null;

    useEffect(() => {
        if (!userAddress || isPoapOrCollectionChannel) {
            if (isPoapOrCollectionChannel) setCanEditIcon(false);
            return;
        }

        // Admins can always edit (except POAP/Collection, handled above)
        if (isAdmin) {
            setCanEditIcon(true);
            return;
        }

        // Check if channel owner
        if (
            channel.creator_address?.toLowerCase() === userAddress.toLowerCase()
        ) {
            setCanEditIcon(true);
            return;
        }

        // Check if moderator (would need API call, simplify by using canCreatePoll which has same permissions)
        setCanEditIcon(canCreatePoll);
    }, [
        userAddress,
        isAdmin,
        channel.creator_address,
        canCreatePoll,
        isPoapOrCollectionChannel,
    ]);

    const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploadingIcon(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("userAddress", userAddress);

            const res = await fetch(`/api/channels/${channel.id}/icon`, {
                method: "POST",
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to upload icon");
            }

            setChannelIcon(data.icon_url);
            // Update channel object if possible
            if (channel) {
                channel.icon_url = data.icon_url;
            }

            // Show success toast
            const toast = document.createElement("div");
            toast.className =
                "fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-xl shadow-lg z-[100] animate-in fade-in slide-in-from-bottom-2";
            toast.textContent = "✓ Channel icon updated!";
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        } catch (err) {
            console.error("Failed to upload icon:", err);
            // Show error toast
            const toast = document.createElement("div");
            toast.className =
                "fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-xl shadow-lg z-[100] animate-in fade-in slide-in-from-bottom-2";
            toast.textContent =
                err instanceof Error ? err.message : "Failed to upload icon";
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        } finally {
            setIsUploadingIcon(false);
            // Reset input
            e.target.value = "";
        }
    };

    const handleRemoveIcon = async () => {
        setIsUploadingIcon(true);
        try {
            const res = await fetch(
                `/api/channels/${channel.id}/icon?userAddress=${userAddress}`,
                {
                    method: "DELETE",
                }
            );

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to remove icon");
            }

            setChannelIcon(null);
            if (channel) {
                channel.icon_url = null;
            }

            // Show success toast
            const toast = document.createElement("div");
            toast.className =
                "fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-xl shadow-lg z-[100] animate-in fade-in slide-in-from-bottom-2";
            toast.textContent = "✓ Channel icon removed!";
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        } catch (err) {
            console.error("Failed to remove icon:", err);
        } finally {
            setIsUploadingIcon(false);
        }
    };
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [showPixelArt, setShowPixelArt] = useState(false);
    const [showPollCreator, setShowPollCreator] = useState(false);
    const [isUploadingPixelArt, setIsUploadingPixelArt] = useState(false);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [userPopupPosition, setUserPopupPosition] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [addingFriend, setAddingFriend] = useState<string | null>(null);
    const [showReactionPicker, setShowReactionPicker] = useState<string | null>(
        null
    );
    const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
    const [selectedMessageConfig, setSelectedMessageConfig] =
        useState<MessageActionConfig | null>(null);
    const [editingMessage, setEditingMessage] = useState<string | null>(null);
    const [editContent, setEditContent] = useState("");
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(true);
    const [showPinnedMessages, setShowPinnedMessages] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [viewerImage, setViewerImage] = useState<string | null>(null);
    const [threadRootMessage, setThreadRootMessage] =
        useState<ChannelMessage | null>(null);
    const [threadInputValue, setThreadInputValue] = useState("");
    const threadInputRef = useRef<HTMLInputElement>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [pinningMessage, setPinningMessage] = useState<string | null>(null);
    const [forwardingMessage, setForwardingMessage] =
        useState<ChannelMessage | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Starred messages hook
    const { isStarred, toggleStar } = useStarredMessages(userAddress);
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    // Draft messages persistence
    const { draft, saveDraft, clearDraft } = useDraftMessages(
        "channel",
        channel.id,
        userAddress
    );

    // Apply draft when modal opens
    useEffect(() => {
        if (!isOpen) {
            draftAppliedRef.current = false;
            return;
        }
        if (draft?.text && !draftAppliedRef.current) {
            setInputValue(draft.text);
            draftAppliedRef.current = true;
        }
    }, [isOpen, draft?.text]);

    // Escape to close modal (or cancel reply/edit first)
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (threadRootMessage) {
                setThreadRootMessage(null);
                setThreadInputValue("");
                return;
            }
            if (replyingTo) {
                setReplyingTo(null);
                return;
            }
            if (editingMessage) {
                setEditingMessage(null);
                setEditContent("");
                return;
            }
            if (showSettings || showPinnedMessages || showMembersList) {
                setShowSettings(false);
                setShowPinnedMessages(false);
                setShowMembersList(false);
                return;
            }
            onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [
        isOpen,
        onClose,
        threadRootMessage,
        replyingTo,
        editingMessage,
        showSettings,
        showPinnedMessages,
        showMembersList,
    ]);

    // Scroll to bottom with unread badge
    const {
        newMessageCount,
        isAtBottom,
        onNewMessage,
        resetUnreadCount,
        scrollToBottom: scrollToBottomFn,
    } = useScrollToBottom(messagesContainerRef);

    // Focus thread reply input when thread drawer opens
    useEffect(() => {
        if (threadRootMessage && threadInputRef.current) {
            const t = setTimeout(() => threadInputRef.current?.focus(), 150);
            return () => clearTimeout(t);
        }
    }, [threadRootMessage]);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const previousScrollHeightRef = useRef<number>(0);
    const userScrolledUpRef = useRef(false);
    const justSentMessageRef = useRef(false);

    // Local cache for user info fetched from API
    const [localUserInfoCache, setLocalUserInfoCache] = useState<
        Map<string, { name: string | null; avatar: string | null }>
    >(new Map());

    // Combined getUserInfo that checks local cache first, then falls back to prop
    const getEffectiveUserInfo = useCallback(
        (address: string) => {
            // Check prop first
            const propInfo = getUserInfo?.(address);
            if (propInfo) return propInfo;
            // Check local cache
            return localUserInfoCache.get(address.toLowerCase()) || null;
        },
        [getUserInfo, localUserInfoCache]
    );

    // Fetch AI agents in this channel
    const [channelAgents, setChannelAgents] = useState<MentionUser[]>([]);
    useEffect(() => {
        async function fetchAgents() {
            try {
                const res = await fetch(`/api/channels/${channel.id}/agents`);
                if (res.ok) {
                    const data = await res.json();
                    const agents: MentionUser[] = (data.agents || []).map(
                        (agent: any) => ({
                            address: agent.id, // Use agent ID as "address" for mentions
                            name: agent.name,
                            avatar: agent.avatar_url || null,
                            avatarEmoji: agent.avatar_emoji,
                            isAgent: true,
                        })
                    );
                    setChannelAgents(agents);
                }
            } catch (err) {
                console.error(
                    "[ChannelChat] Error fetching channel agents:",
                    err
                );
            }
        }
        if (isOpen && channel.id) {
            fetchAgents();
        }
    }, [isOpen, channel.id]);

    // Fetch polls when channel opens
    useEffect(() => {
        if (isOpen && channel.id) {
            fetchPolls();
        }
    }, [isOpen, channel.id, fetchPolls]);

    // Build list of mentionable users from message senders + channel agents
    const mentionableUsers: MentionUser[] = useMemo(() => {
        const userMap = new Map<string, MentionUser>();

        // Add channel agents first (so they appear at the top)
        channelAgents.forEach((agent) => {
            userMap.set(agent.address, agent);
        });

        messages.forEach((msg) => {
            const address = msg.sender_address.toLowerCase();
            if (
                !userMap.has(address) &&
                address !== userAddress.toLowerCase()
            ) {
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
    const handleMentionClick = useCallback(
        (address: string, event?: React.MouseEvent) => {
            if (event) {
                const rect = (
                    event.target as HTMLElement
                ).getBoundingClientRect();
                setUserPopupPosition({ x: rect.left, y: rect.bottom + 8 });
            }
            setSelectedUser(address);
        },
        []
    );

    // Handle user click: open full user card if handler provided, else show popover
    const handleUserClick = useCallback(
        (address: string, event: React.MouseEvent) => {
            if (onOpenUserCard) {
                onOpenUserCard(address);
                return;
            }
            const rect = (
                event.currentTarget as HTMLElement
            ).getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const popupHeight = 250;
            const y = rect.bottom + 8;
            const adjustedY =
                y + popupHeight > viewportHeight
                    ? rect.top - popupHeight - 8
                    : y;
            setUserPopupPosition({
                x: Math.max(8, rect.left),
                y: Math.max(8, adjustedY),
            });
            setSelectedUser(address);
        },
        [onOpenUserCard]
    );

    // Fetch online statuses for message senders
    useEffect(() => {
        const uniqueSenders = [
            ...new Set(messages.map((m) => m.sender_address.toLowerCase())),
        ];
        if (uniqueSenders.length === 0) return;

        fetchOnlineStatuses(uniqueSenders).then((statuses) => {
            setOnlineStatuses(statuses);
        });
    }, [messages]);

    // Auto-scroll on new messages (with column-reverse: scrollTop=0 is bottom)
    const lastMessageIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            // Only scroll if there's a new message at the end
            if (lastMessage.id !== lastMessageIdRef.current) {
                lastMessageIdRef.current = lastMessage.id;
                const container = messagesContainerRef.current;

                // Always scroll if user just sent a message
                if (justSentMessageRef.current) {
                    justSentMessageRef.current = false;
                    userScrolledUpRef.current = false;
                    if (container) container.scrollTop = 0; // Bottom with column-reverse
                    return;
                }

                // Auto-scroll if user hasn't scrolled up to read history
                // With column-reverse, "near bottom" = scrollTop near 0
                if (
                    container &&
                    !userScrolledUpRef.current &&
                    container.scrollTop < 300
                ) {
                    container.scrollTop = 0;
                }
            }
        }
    }, [messages]);

    // Preserve scroll position when loading older messages
    // With column-reverse, older messages are added at the "end" (visually top)
    // The scroll position needs to be maintained so user doesn't jump
    useEffect(() => {
        const container = messagesContainerRef.current;
        if (container && previousScrollHeightRef.current > 0) {
            // With column-reverse, new content adds at top, so we need to add the diff to scrollTop
            const newScrollHeight = container.scrollHeight;
            const scrollDiff =
                newScrollHeight - previousScrollHeightRef.current;
            if (scrollDiff > 0) {
                container.scrollTop += scrollDiff;
            }
            previousScrollHeightRef.current = 0;
        }
    }, [messages]);

    // Handle scroll to load more messages and track user scroll position
    // With flex-col-reverse: scrollTop=0 is at BOTTOM (newest), scrolling UP increases scrollTop
    const handleScroll = useCallback(() => {
        const container = messagesContainerRef.current;
        if (!container) return;

        // With column-reverse, scrollTop > 0 means user scrolled up to see older messages
        userScrolledUpRef.current = container.scrollTop > 300;

        // Load more when scrolled near the TOP (older messages) - scrollTop approaches max
        const scrollMax = container.scrollHeight - container.clientHeight;
        if (
            !isLoadingMore &&
            hasMore &&
            scrollMax - container.scrollTop < 100
        ) {
            previousScrollHeightRef.current = container.scrollHeight;
            loadMoreMessages();
        }
    }, [isLoadingMore, hasMore, loadMoreMessages]);

    // With flex-col-reverse, we start at bottom automatically (scrollTop=0)
    // Just reset scroll tracking when modal opens
    useEffect(() => {
        if (isOpen) {
            userScrolledUpRef.current = false;
            // Reset scroll position to bottom (scrollTop=0 with column-reverse)
            if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = 0;
            }
        }
    }, [isOpen]);

    // Lock body scroll when modal is open to prevent scroll bleed
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
            return () => {
                document.body.style.overflow = "";
            };
        }
    }, [isOpen]);

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
            (address) =>
                !getUserInfo?.(address) && !localUserInfoCache.has(address)
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
                            return new Map(prev).set(
                                address.toLowerCase(),
                                userInfo
                            );
                        });
                    }
                })
                .catch((err) => {
                    console.error(
                        "[ChannelChat] Error fetching user info for",
                        address,
                        err
                    );
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
            return () =>
                document.removeEventListener("click", handleClickOutside);
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
        stopTyping(); // Stop typing indicator when message is sent
        const content = inputValue.trim();
        setInputValue("");

        // Mark that user just sent a message (for auto-scroll)
        justSentMessageRef.current = true;

        const result = await sendMessage(content, "text", replyingTo?.id);
        setIsSending(false);

        // On any send failure, keep content so user can retry
        if (!result) setInputValue(content);

        if (result) {
            clearDraft();
            onMessageSent?.();
        }
    };

    // Handle sending GIF
    const handleSendGif = async (gifUrl: string) => {
        if (!gifUrl || isSending) return;
        setIsSending(true);
        try {
            await sendMessage(`[GIF]${gifUrl}`, "text");
            onMessageSent?.();
        } catch (error) {
            console.error("Failed to send GIF:", error);
        } finally {
            setIsSending(false);
        }
    };

    // Handle sending pixel art
    const handleSendPixelArt = async (imageData: string) => {
        setIsUploadingPixelArt(true);
        try {
            // Convert base64 to blob
            const response = await fetch(imageData);
            const blob = await response.blob();
            const file = new File([blob], "pixel-art.png", {
                type: "image/png",
            });

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
        try {
            await toggleReaction(messageId, emoji);
        } catch (error) {
            console.error("[ChannelChatModal] Reaction error:", error);
        } finally {
            setShowReactionPicker(null);
            setSelectedMessage(null);
            setSelectedMessageConfig(null);
        }
    };

    const handlePinMessage = async (
        messageId: string,
        currentlyPinned: boolean
    ) => {
        if (!isAdmin || pinningMessage) return;

        setPinningMessage(messageId);
        try {
            await togglePinMessage(messageId, !currentlyPinned);
        } finally {
            setPinningMessage(null);
            setSelectedMessage(null);
            setSelectedMessageConfig(null);
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
            // Don't deselect when clicking on input areas to prevent focus/cursor issues
            if (
                !target.closest("[data-message-actions]") &&
                !target.closest("[data-message-bubble]") &&
                !target.closest("textarea") &&
                !target.closest("input")
            ) {
                setSelectedMessage(null);
                setSelectedMessageConfig(null);
                setShowReactionPicker(null);
            }
        };
        if (selectedMessage) {
            document.addEventListener("click", handleClickOutside);
            return () =>
                document.removeEventListener("click", handleClickOutside);
        }
    }, [selectedMessage]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Handle edit message
    const handleStartEdit = (msg: ChannelMessage) => {
        // Check if within 15 minute edit window
        const createdAt = new Date(msg.created_at);
        const now = new Date();
        const diffMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);

        if (diffMinutes > 15) {
            alert("Messages can only be edited within 15 minutes");
            return;
        }

        setEditingMessage(msg.id);
        setEditContent(msg.content);
        setSelectedMessage(null);
        setSelectedMessageConfig(null);
    };

    const handleSaveEdit = async () => {
        if (!editingMessage || !editContent.trim()) return;

        const success = await editMessage(editingMessage, editContent.trim());
        if (success) {
            setEditingMessage(null);
            setEditContent("");
        }
    };

    const handleCancelEdit = () => {
        setEditingMessage(null);
        setEditContent("");
    };

    // Handle delete message
    const handleDeleteMessage = async (messageId: string) => {
        if (!confirm("Delete this message? This cannot be undone.")) return;

        setIsDeleting(messageId);
        await deleteMessage(messageId);
        setIsDeleting(null);
        setSelectedMessage(null);
        setSelectedMessageConfig(null);
    };

    // Check if message is within edit window (15 minutes)
    const isWithinEditWindow = (createdAt: string) => {
        const created = new Date(createdAt);
        const now = new Date();
        return (now.getTime() - created.getTime()) / (1000 * 60) <= 15;
    };

    const handleImageSelect = async (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (
            !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
                file.type
            )
        ) {
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

    const userTimezone = useUserTimezone();
    const formatTime = (dateString: string) => {
        return formatTimeInTimezone(new Date(dateString), userTimezone);
    };

    const formatAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    // Agent info cache for displaying agent messages
    const [agentInfoCache, setAgentInfoCache] = useState<
        Map<string, { name: string; avatar_url?: string; avatar_emoji: string }>
    >(new Map());

    // Fetch agent info when we see agent messages
    useEffect(() => {
        const agentIds = messages
            .filter((m) => m.sender_address.startsWith("agent:"))
            .map((m) => m.sender_address.replace("agent:", ""))
            .filter((id) => !agentInfoCache.has(id));

        if (agentIds.length === 0) return;

        const uniqueIds = [...new Set(agentIds)];
        uniqueIds.forEach(async (agentId) => {
            try {
                const res = await fetch(`/api/public/agents/${agentId}`);
                if (res.ok) {
                    const agent = await res.json();
                    setAgentInfoCache((prev) =>
                        new Map(prev).set(agentId, {
                            name: agent.name,
                            avatar_url: agent.avatar_url,
                            avatar_emoji: agent.avatar_emoji || "🤖",
                        })
                    );
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
        return (
            content.match(/\.(jpeg|jpg|gif|png|webp)$/i) ||
            content.includes("/storage/v1/object/public/chat-images/")
        );
    };

    const channelSearchMessages = useMemo(
        () =>
            messages.map((m) => ({
                id: m.id,
                content: m.content,
                senderAddress: m.sender_address,
                sentAt: new Date(m.created_at),
            })),
        [messages]
    );

    const handleSelectSearchMessage = useCallback((messageId: string) => {
        setShowSearch(false);
        setTimeout(() => {
            document
                .querySelector(`[data-message-id="${messageId}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
    }, []);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center ${
                    isFullscreen ? "" : "p-4"
                }`}
                style={
                    isFullscreen
                        ? {}
                        : {
                              paddingBottom:
                                  "max(env(safe-area-inset-bottom, 0px) + 100px, 120px)",
                          }
                }
                onClick={(e) => {
                    // Only close if clicking directly on the backdrop, not on child elements
                    if (e.target === e.currentTarget) {
                        onClose();
                    }
                }}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className={`bg-zinc-900 flex flex-col min-h-0 overflow-hidden ${
                        isFullscreen
                            ? "w-full h-full max-w-none max-h-none"
                            : "w-full max-w-2xl max-h-[70vh] h-[600px] border border-zinc-800 rounded-2xl"
                    }`}
                    style={
                        isFullscreen
                            ? {
                                  paddingTop: "env(safe-area-inset-top)",
                                  paddingLeft: "env(safe-area-inset-left)",
                                  paddingRight: "env(safe-area-inset-right)",
                              }
                            : undefined
                    }
                    ref={modalRef}
                    onClick={(e) => e.stopPropagation()}
                    role="dialog"
                    aria-modal="true"
                >
                    <MessageSearch
                        isOpen={showSearch}
                        onClose={() => setShowSearch(false)}
                        onSelectMessage={handleSelectSearchMessage}
                        messages={channelSearchMessages}
                        userAddress={userAddress}
                        peerName={`#${channel.name}`}
                    />
                    {/* Thread drawer - standard channels only */}
                    {!isWakuChannel && (
                        <AnimatePresence>
                            {threadRootMessage && (
                                <motion.div
                                    initial={{ x: "100%" }}
                                    animate={{ x: 0 }}
                                    exit={{ x: "100%" }}
                                    transition={{
                                        type: "tween",
                                        duration: 0.2,
                                    }}
                                    className="absolute inset-0 z-10 bg-zinc-900 flex flex-col border-l border-zinc-800"
                                >
                                    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800 shrink-0">
                                        <button
                                            onClick={() => {
                                                setThreadRootMessage(null);
                                                setThreadInputValue("");
                                            }}
                                            className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white"
                                            aria-label="Close thread"
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
                                        <span className="text-white font-medium text-sm">
                                            Thread
                                        </span>
                                    </div>
                                    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
                                        {/* Root message */}
                                        <div className="p-3 bg-zinc-800/50 rounded-xl border-l-2 border-orange-500">
                                            <p className="text-xs text-zinc-500 mb-1">
                                                {formatSender(
                                                    threadRootMessage.sender_address
                                                )}
                                            </p>
                                            <p className="text-sm text-white break-words whitespace-pre-wrap">
                                                {threadRootMessage.content}
                                            </p>
                                        </div>
                                        {/* Replies */}
                                        {messages
                                            .filter(
                                                (m) =>
                                                    m.reply_to_id ===
                                                    threadRootMessage.id
                                            )
                                            .map((reply) => {
                                                const isOwnReply =
                                                    reply.sender_address.toLowerCase() ===
                                                    userAddress.toLowerCase();
                                                return (
                                                    <div
                                                        key={reply.id}
                                                        className={`p-3 rounded-xl ${
                                                            isOwnReply
                                                                ? "bg-[#FF5500]/20 ml-4"
                                                                : "bg-zinc-800/50 ml-4"
                                                        }`}
                                                    >
                                                        <p className="text-xs text-zinc-500 mb-1">
                                                            {formatSender(
                                                                reply.sender_address
                                                            )}
                                                        </p>
                                                        <p className="text-sm text-white break-words whitespace-pre-wrap">
                                                            {reply.content}
                                                        </p>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                    <div className="p-3 border-t border-zinc-800 shrink-0 flex gap-2">
                                        <input
                                            ref={threadInputRef}
                                            type="text"
                                            value={threadInputValue}
                                            onChange={(e) =>
                                                setThreadInputValue(
                                                    e.target.value
                                                )
                                            }
                                            onKeyDown={(e) => {
                                                if (
                                                    e.key === "Enter" &&
                                                    !e.shiftKey
                                                ) {
                                                    e.preventDefault();
                                                    if (
                                                        threadInputValue.trim() &&
                                                        !isSending
                                                    ) {
                                                        sendMessage(
                                                            threadInputValue.trim(),
                                                            "text",
                                                            threadRootMessage.id
                                                        );
                                                        setThreadInputValue("");
                                                        onMessageSent?.();
                                                    }
                                                }
                                            }}
                                            placeholder="Reply in thread..."
                                            className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20 transition-all"
                                        />
                                        <button
                                            onClick={async () => {
                                                if (
                                                    !threadInputValue.trim() ||
                                                    isSending
                                                )
                                                    return;
                                                await sendMessage(
                                                    threadInputValue.trim(),
                                                    "text",
                                                    threadRootMessage.id
                                                );
                                                setThreadInputValue("");
                                                onMessageSent?.();
                                            }}
                                            disabled={
                                                !threadInputValue.trim() ||
                                                isSending
                                            }
                                            className="p-3 bg-[#FF5500] text-white rounded-xl hover:bg-[#E04D00] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            aria-label="Send"
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
                                                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                                                />
                                            </svg>
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    )}
                    {/* Header - unified mobile-first design */}
                    <div className="flex items-center gap-2 px-2 sm:px-3 py-2.5 border-b border-zinc-800">
                        {/* Avatar - shows custom icon if available, otherwise emoji; click to view full size */}
                        <ChannelIcon
                            emoji={channel.emoji}
                            iconUrl={channelIcon}
                            name={channel.name}
                            size="sm"
                            className="shrink-0 ml-1"
                            onImageClick={
                                channelIcon
                                    ? () => setViewerImage(channelIcon)
                                    : undefined
                            }
                        />

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
                                {isWakuChannel && (
                                    <span className="shrink-0 px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] rounded font-medium flex items-center gap-0.5">
                                        🌐
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => setShowMembersList(true)}
                                className="text-zinc-500 text-xs truncate hover:text-zinc-300 transition-colors flex items-center gap-1"
                            >
                                <svg
                                    className="w-3.5 h-3.5"
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
                                Community
                                {typeof channel.member_count === "number" && (
                                    <>
                                        {" "}
                                        · {channel.member_count}{" "}
                                        {channel.member_count === 1
                                            ? "member"
                                            : "members"}
                                    </>
                                )}
                                {isWakuChannel && " · Decentralized"}
                            </button>
                        </div>

                        {/* Action buttons */}
                        <div className="shrink-0 flex items-center">
                            {/* Search */}
                            <button
                                onClick={() => setShowSearch(true)}
                                className="p-2.5 rounded-xl text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
                                aria-label="Search messages"
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
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                    />
                                </svg>
                            </button>
                            {/* Pinned Messages - icon only */}
                            {pinnedMessages.length > 0 && (
                                <button
                                    onClick={() =>
                                        setShowPinnedMessages(
                                            !showPinnedMessages
                                        )
                                    }
                                    className={`p-2.5 rounded-xl flex items-center gap-1 transition-colors ${
                                        showPinnedMessages
                                            ? "bg-amber-500/20 text-amber-400"
                                            : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                                    }`}
                                    aria-label="View pinned messages"
                                >
                                    <svg
                                        className="w-5 h-5"
                                        fill="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                                    </svg>
                                    <span className="hidden sm:inline text-xs font-medium">
                                        {pinnedMessages.length}
                                    </span>
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
                                    aria-label={
                                        notificationsEnabled
                                            ? "Mute notifications"
                                            : "Enable notifications"
                                    }
                                >
                                    <svg
                                        className="w-5 h-5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        {notificationsEnabled ? (
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                                            />
                                        ) : (
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                                            />
                                        )}
                                    </svg>
                                </button>
                            )}

                            {/* Settings Menu (... icon) */}
                            <div className="relative">
                                <button
                                    onClick={() =>
                                        setShowSettings(!showSettings)
                                    }
                                    className="p-2.5 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white"
                                    aria-label="More options"
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
                                            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                                        />
                                    </svg>
                                </button>
                                <AnimatePresence>
                                    {showSettings && (
                                        <motion.div
                                            initial={{
                                                opacity: 0,
                                                scale: 0.95,
                                                y: -5,
                                            }}
                                            animate={{
                                                opacity: 1,
                                                scale: 1,
                                                y: 0,
                                            }}
                                            exit={{
                                                opacity: 0,
                                                scale: 0.95,
                                                y: -5,
                                            }}
                                            className="absolute right-0 top-full mt-1 w-52 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50"
                                        >
                                            {/* Copy Invite Link */}
                                            <button
                                                onClick={() => {
                                                    const inviteUrl = `${window.location.origin}/channel/${channel.id}`;
                                                    navigator.clipboard.writeText(
                                                        inviteUrl
                                                    );
                                                    setShowSettings(false);
                                                    // Show toast notification
                                                    const toast =
                                                        document.createElement(
                                                            "div"
                                                        );
                                                    toast.className =
                                                        "fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-xl shadow-lg z-[100] animate-in fade-in slide-in-from-bottom-2";
                                                    toast.textContent =
                                                        "✓ Invite link copied!";
                                                    document.body.appendChild(
                                                        toast
                                                    );
                                                    setTimeout(
                                                        () => toast.remove(),
                                                        2000
                                                    );
                                                }}
                                                className="w-full px-4 py-3 text-left text-sm text-white hover:bg-zinc-700 transition-colors flex items-center gap-3"
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
                                                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                                                    />
                                                </svg>
                                                Copy Invite Link
                                            </button>
                                            {/* Change Channel Icon - for admins, owners, moderators; not for POAP/Collection channels */}
                                            {canEditIcon &&
                                                !isPoapOrCollectionChannel && (
                                                    <>
                                                        <button
                                                            onClick={() =>
                                                                iconFileInputRef.current?.click()
                                                            }
                                                            disabled={
                                                                isUploadingIcon
                                                            }
                                                            className="w-full px-4 py-3 text-left text-sm text-white hover:bg-zinc-700 transition-colors flex items-center gap-3 disabled:opacity-50"
                                                        >
                                                            {isUploadingIcon ? (
                                                                <div className="w-5 h-5 border-2 border-zinc-400 border-t-white rounded-full animate-spin" />
                                                            ) : (
                                                                <svg
                                                                    className="w-5 h-5 text-zinc-400"
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
                                                                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                                                    />
                                                                </svg>
                                                            )}
                                                            {channelIcon
                                                                ? "Change Channel Icon"
                                                                : "Upload Channel Icon"}
                                                        </button>
                                                        {channelIcon && (
                                                            <button
                                                                onClick={() => {
                                                                    handleRemoveIcon();
                                                                    setShowSettings(
                                                                        false
                                                                    );
                                                                }}
                                                                disabled={
                                                                    isUploadingIcon
                                                                }
                                                                className="w-full px-4 py-3 text-left text-sm text-zinc-400 hover:bg-zinc-700 transition-colors flex items-center gap-3 disabled:opacity-50"
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
                                                                        strokeWidth={
                                                                            2
                                                                        }
                                                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                                    />
                                                                </svg>
                                                                Remove Custom
                                                                Icon
                                                            </button>
                                                        )}
                                                        <input
                                                            ref={
                                                                iconFileInputRef
                                                            }
                                                            type="file"
                                                            accept="image/jpeg,image/png,image/gif,image/webp"
                                                            onChange={
                                                                handleIconUpload
                                                            }
                                                            className="hidden"
                                                        />
                                                    </>
                                                )}
                                            {/* Notification toggle - visible on mobile */}
                                            {onToggleNotifications && (
                                                <button
                                                    onClick={() => {
                                                        onToggleNotifications();
                                                        setShowSettings(false);
                                                    }}
                                                    className="sm:hidden w-full px-4 py-3 text-left text-sm text-white hover:bg-zinc-700 transition-colors flex items-center gap-3"
                                                >
                                                    <svg
                                                        className="w-5 h-5 text-zinc-400"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        {notificationsEnabled ? (
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                                                            />
                                                        ) : (
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                                                            />
                                                        )}
                                                    </svg>
                                                    {notificationsEnabled
                                                        ? "Mute Notifications"
                                                        : "Enable Notifications"}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    setShowSettings(false);
                                                    onLeave();
                                                }}
                                                className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-zinc-700 transition-colors flex items-center gap-3"
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
                                                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                                    />
                                                </svg>
                                                Leave Channel
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Close button (X) */}
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
                                        <svg
                                            className="w-4 h-4"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                                        </svg>
                                        <span className="text-sm font-medium">
                                            Pinned Messages
                                        </span>
                                    </div>
                                    <div className="space-y-2">
                                        {pinnedMessages.map((msg) => (
                                            <div
                                                key={msg.id}
                                                className="flex items-start gap-2 p-2 bg-zinc-800/50 rounded-lg group"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-zinc-400 mb-0.5">
                                                        {formatSender(
                                                            msg.sender_address
                                                        )}
                                                    </p>
                                                    <p className="text-sm text-white truncate">
                                                        {msg.content}
                                                    </p>
                                                </div>
                                                {isAdmin && (
                                                    <button
                                                        onClick={() =>
                                                            handlePinMessage(
                                                                msg.id,
                                                                true
                                                            )
                                                        }
                                                        disabled={
                                                            pinningMessage ===
                                                            msg.id
                                                        }
                                                        className="p-1 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                                        title="Unpin message"
                                                    >
                                                        {pinningMessage ===
                                                        msg.id ? (
                                                            <div className="w-4 h-4 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                                                        ) : (
                                                            <svg
                                                                className="w-4 h-4"
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
                                                                    d="M6 18L18 6M6 6l12 12"
                                                                />
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

                    {/* Active Polls - shown at top when polls exist */}
                    {visiblePolls.length > 0 && (
                        <div className="border-b border-zinc-800 p-3 space-y-2 max-h-[200px] overflow-y-auto overscroll-contain">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                                    Active Polls
                                </span>
                                <span className="text-xs text-zinc-600">
                                    {visiblePolls.length} poll
                                    {visiblePolls.length !== 1 ? "s" : ""}
                                </span>
                            </div>
                            {visiblePolls.slice(0, 2).map((poll) => (
                                <PollDisplay
                                    key={poll.id}
                                    poll={poll}
                                    onVote={(optionIndex) =>
                                        vote(poll.id, optionIndex)
                                    }
                                    compact
                                    canManage={canCreatePoll}
                                    onEdit={(p) => setEditingPoll(p)}
                                    onDelete={async (p) => {
                                        await deletePoll(p.id);
                                        setEditingPoll(null);
                                    }}
                                    onHide={(pollId) => {
                                        setHiddenPollIds((prev) => {
                                            const next = [...prev, pollId];
                                            try {
                                                window.localStorage.setItem(
                                                    channelHiddenPollsKey,
                                                    JSON.stringify(next)
                                                );
                                            } catch {}
                                            return next;
                                        });
                                    }}
                                />
                            ))}
                            {visiblePolls.length > 2 && (
                                <button className="w-full text-center text-xs text-purple-400 hover:text-purple-300 py-2">
                                    View all {visiblePolls.length} polls
                                </button>
                            )}
                        </div>
                    )}
                    <PollEditModal
                        isOpen={!!editingPoll}
                        onClose={() => setEditingPoll(null)}
                        poll={editingPoll}
                        onSave={async (updates) => {
                            if (editingPoll) {
                                await updatePoll(editingPoll.id, updates);
                                setEditingPoll(null);
                            }
                        }}
                    />

                    {/* Messages - flex-1 min-h-0 so area shrinks and scrolls on mobile */}
                    <div
                        ref={messagesContainerRef}
                        onScroll={handleScroll}
                        role="log"
                        aria-label="Chat messages"
                        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-4 flex flex-col-reverse"
                    >
                        {isLoading && messages.length === 0 ? (
                            <ChatSkeleton messageCount={6} className="p-4" />
                        ) : messages.length === 0 ? (
                            <ChatEmptyState
                                icon={channel.emoji}
                                title="No messages yet"
                                subtitle="Be the first to say something!"
                            />
                        ) : (
                            <>
                                {/* Messages container - content flows bottom to top with column-reverse */}
                                <div className="space-y-3">
                                    {messages.map((msg, index) => {
                                        const isOwn =
                                            msg.sender_address.toLowerCase() ===
                                            userAddress.toLowerCase();
                                        const isAgent = isAgentMessage(
                                            msg.sender_address
                                        );
                                        const showSender =
                                            index === 0 ||
                                            messages[index - 1]
                                                .sender_address !==
                                                msg.sender_address;
                                        const isPixelArt =
                                            msg.message_type === "pixel_art";
                                        const isGif =
                                            msg.content.startsWith("[GIF]");
                                        const isImage =
                                            !isPixelArt &&
                                            !isGif &&
                                            (msg.message_type === "image" ||
                                                isImageUrl(msg.content));
                                        const isLocation =
                                            msg.message_type === "location" ||
                                            isLocationMessage(msg.content);
                                        const locationData = isLocation
                                            ? parseLocationMessage(msg.content)
                                            : null;
                                        const senderAvatar = getSenderAvatar(
                                            msg.sender_address
                                        );
                                        const senderAvatarEmoji =
                                            getSenderAvatarEmoji(
                                                msg.sender_address
                                            );
                                        const isAlreadyFriend =
                                            !isAgent &&
                                            (isFriend?.(msg.sender_address) ??
                                                false);
                                        // Only show user popup on the FIRST message from this sender to avoid duplicates
                                        const isFirstMessageFromSender =
                                            messages.findIndex(
                                                (m) =>
                                                    m.sender_address.toLowerCase() ===
                                                    msg.sender_address.toLowerCase()
                                            ) === index;

                                        // Check if we need a date divider (comparing to previous message)
                                        const msgDate = new Date(
                                            msg.created_at
                                        );
                                        const prevMsg =
                                            index > 0
                                                ? messages[index - 1]
                                                : null;
                                        const prevMsgDate = prevMsg
                                            ? new Date(prevMsg.created_at)
                                            : null;
                                        const showDateDivider =
                                            !prevMsgDate ||
                                            msgDate.toDateString() !==
                                                prevMsgDate.toDateString();

                                        return (
                                            <div
                                                key={msg.id}
                                                data-message-id={msg.id}
                                            >
                                                {/* Date divider when day changes */}
                                                {showDateDivider && (
                                                    <DateDivider
                                                        date={msgDate}
                                                        className="mb-2"
                                                    />
                                                )}
                                                <motion.div
                                                    initial={{
                                                        opacity: 0,
                                                        y: 10,
                                                    }}
                                                    animate={{
                                                        opacity: 1,
                                                        y: 0,
                                                    }}
                                                    className={`flex gap-2 ${
                                                        isOwn
                                                            ? "flex-row-reverse"
                                                            : ""
                                                    }`}
                                                >
                                                    {/* Avatar - clickable for non-own, non-agent messages */}
                                                    {!isOwn && (
                                                        <div className="flex-shrink-0 relative">
                                                            {isAgent ? (
                                                                // Agent avatar (not clickable)
                                                                <div className="relative">
                                                                    {senderAvatar ? (
                                                                        <img
                                                                            src={
                                                                                senderAvatar
                                                                            }
                                                                            alt=""
                                                                            className="w-8 h-8 rounded-lg object-cover ring-1 ring-purple-500/50"
                                                                        />
                                                                    ) : senderAvatarEmoji ? (
                                                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-lg ring-1 ring-purple-500/50">
                                                                            {
                                                                                senderAvatarEmoji
                                                                            }
                                                                        </div>
                                                                    ) : (
                                                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white text-xs ring-1 ring-purple-500/50">
                                                                            🤖
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                // User avatar (clickable) with online status
                                                                <div className="relative">
                                                                    <button
                                                                        onClick={(
                                                                            e
                                                                        ) => {
                                                                            e.stopPropagation();
                                                                            if (
                                                                                selectedUser ===
                                                                                msg.sender_address
                                                                            ) {
                                                                                setSelectedUser(
                                                                                    null
                                                                                );
                                                                            } else {
                                                                                handleUserClick(
                                                                                    msg.sender_address,
                                                                                    e
                                                                                );
                                                                            }
                                                                        }}
                                                                        className="focus:outline-none focus:ring-2 focus:ring-orange-500/50 rounded-full"
                                                                    >
                                                                        {senderAvatar ? (
                                                                            <img
                                                                                src={
                                                                                    senderAvatar
                                                                                }
                                                                                alt=""
                                                                                className="w-8 h-8 rounded-full object-cover hover:ring-2 hover:ring-orange-500/50 transition-all"
                                                                            />
                                                                        ) : (
                                                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white text-xs font-bold hover:ring-2 hover:ring-orange-500/50 transition-all">
                                                                                {formatAddress(
                                                                                    msg.sender_address
                                                                                )
                                                                                    .slice(
                                                                                        0,
                                                                                        2
                                                                                    )
                                                                                    .toUpperCase()}
                                                                            </div>
                                                                        )}
                                                                    </button>
                                                                    {/* Online status dot */}
                                                                    {onlineStatuses[
                                                                        msg.sender_address.toLowerCase()
                                                                    ] && (
                                                                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-zinc-900 rounded-full" />
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* User popup rendered as fixed position element below */}
                                                        </div>
                                                    )}

                                                    {/* Message content */}
                                                    <div
                                                        className={`flex flex-col ${
                                                            isOwn
                                                                ? "items-end"
                                                                : "items-start"
                                                        } max-w-[80%]`}
                                                    >
                                                        {showSender &&
                                                            !isOwn && (
                                                                <p
                                                                    className={`text-xs mb-1 ml-1 font-medium flex items-center gap-1 ${
                                                                        isAgent
                                                                            ? "text-purple-400"
                                                                            : "text-zinc-500"
                                                                    }`}
                                                                >
                                                                    {formatSender(
                                                                        msg.sender_address
                                                                    )}
                                                                    {isAgent && (
                                                                        <span className="text-[9px] px-1 py-0.5 bg-purple-500/30 text-purple-300 rounded font-medium">
                                                                            AI
                                                                        </span>
                                                                    )}
                                                                    {msg.is_pinned && (
                                                                        <span
                                                                            className="text-amber-400"
                                                                            title="Pinned message"
                                                                        >
                                                                            <svg
                                                                                className="w-3 h-3"
                                                                                fill="currentColor"
                                                                                viewBox="0 0 20 20"
                                                                            >
                                                                                <path d="M5 5a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 19V5z" />
                                                                            </svg>
                                                                        </span>
                                                                    )}
                                                                </p>
                                                            )}
                                                        {/* Pinned indicator for own messages or when sender not shown */}
                                                        {msg.is_pinned &&
                                                            (showSender ||
                                                                isOwn) &&
                                                            isOwn && (
                                                                <p className="text-xs text-amber-400 mb-1 mr-1 font-medium flex items-center gap-1 justify-end">
                                                                    <svg
                                                                        className="w-3 h-3"
                                                                        fill="currentColor"
                                                                        viewBox="0 0 20 20"
                                                                    >
                                                                        <path d="M5 5a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 19V5z" />
                                                                    </svg>
                                                                    Pinned
                                                                </p>
                                                            )}
                                                        {isPixelArt ? (
                                                            <div
                                                                onClick={() => {
                                                                    setSelectedMessage(
                                                                        selectedMessage ===
                                                                            msg.id
                                                                            ? null
                                                                            : msg.id
                                                                    );
                                                                    setSelectedMessageConfig(
                                                                        selectedMessage ===
                                                                            msg.id
                                                                            ? null
                                                                            : {
                                                                                  messageId:
                                                                                      msg.id,
                                                                                  messageContent:
                                                                                      msg.content,
                                                                                  isOwn,
                                                                                  isPinned:
                                                                                      msg.is_pinned,
                                                                                  isStarred:
                                                                                      isStarred(
                                                                                          msg.id
                                                                                      ),
                                                                                  canEdit:
                                                                                      false,
                                                                                  hasMedia:
                                                                                      true,
                                                                                  isPixelArt:
                                                                                      true,
                                                                                  mediaUrl:
                                                                                      msg.content,
                                                                              }
                                                                    );
                                                                }}
                                                                className={`rounded-2xl overflow-hidden relative group cursor-pointer ${
                                                                    isOwn
                                                                        ? "rounded-br-md"
                                                                        : "rounded-bl-md"
                                                                } ${
                                                                    selectedMessage ===
                                                                    msg.id
                                                                        ? "ring-2 ring-orange-400/50"
                                                                        : ""
                                                                }`}
                                                            >
                                                                <div
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setPreviewImage(
                                                                            msg.content
                                                                        );
                                                                    }}
                                                                >
                                                                    <PixelArtImage
                                                                        src={
                                                                            msg.content
                                                                        }
                                                                        size="lg"
                                                                        className="cursor-pointer hover:opacity-90 transition-opacity"
                                                                    />
                                                                </div>
                                                            </div>
                                                        ) : isImage ? (
                                                            <div
                                                                onClick={() => {
                                                                    setSelectedMessage(
                                                                        selectedMessage ===
                                                                            msg.id
                                                                            ? null
                                                                            : msg.id
                                                                    );
                                                                    setSelectedMessageConfig(
                                                                        selectedMessage ===
                                                                            msg.id
                                                                            ? null
                                                                            : {
                                                                                  messageId:
                                                                                      msg.id,
                                                                                  messageContent:
                                                                                      msg.content,
                                                                                  isOwn,
                                                                                  isPinned:
                                                                                      msg.is_pinned,
                                                                                  isStarred:
                                                                                      isStarred(
                                                                                          msg.id
                                                                                      ),
                                                                                  canEdit:
                                                                                      false,
                                                                                  hasMedia:
                                                                                      true,
                                                                                  isPixelArt:
                                                                                      false,
                                                                                  mediaUrl:
                                                                                      msg.content,
                                                                              }
                                                                    );
                                                                }}
                                                                className={`rounded-2xl overflow-hidden relative group cursor-pointer ${
                                                                    isOwn
                                                                        ? "rounded-br-md"
                                                                        : "rounded-bl-md"
                                                                } ${
                                                                    selectedMessage ===
                                                                    msg.id
                                                                        ? "ring-2 ring-orange-400/50"
                                                                        : ""
                                                                }`}
                                                            >
                                                                <img
                                                                    src={
                                                                        msg.content
                                                                    }
                                                                    alt="Shared image"
                                                                    loading="lazy"
                                                                    className="max-w-full max-h-64 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setPreviewImage(
                                                                            msg.content
                                                                        );
                                                                    }}
                                                                    onError={(
                                                                        e
                                                                    ) => {
                                                                        const el =
                                                                            e.target as HTMLImageElement;
                                                                        el.style.display =
                                                                            "none";
                                                                        const fallback =
                                                                            document.createElement(
                                                                                "div"
                                                                            );
                                                                        fallback.className =
                                                                            "py-8 px-4 text-center text-zinc-500 text-sm";
                                                                        fallback.textContent =
                                                                            "Image failed to load";
                                                                        el.parentNode?.appendChild(
                                                                            fallback
                                                                        );
                                                                    }}
                                                                />
                                                                {/* Download Button */}
                                                                <a
                                                                    href={
                                                                        msg.content
                                                                    }
                                                                    download="image.png"
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="absolute top-1 right-1 p-1.5 bg-black/60 hover:bg-black/80 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                                                    title="Download"
                                                                    onClick={(
                                                                        e
                                                                    ) =>
                                                                        e.stopPropagation()
                                                                    }
                                                                >
                                                                    <svg
                                                                        className="w-4 h-4 text-white"
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
                                                                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                                                        />
                                                                    </svg>
                                                                </a>
                                                            </div>
                                                        ) : isGif ? (
                                                            <div
                                                                onClick={() => {
                                                                    setSelectedMessage(
                                                                        selectedMessage ===
                                                                            msg.id
                                                                            ? null
                                                                            : msg.id
                                                                    );
                                                                    setSelectedMessageConfig(
                                                                        selectedMessage ===
                                                                            msg.id
                                                                            ? null
                                                                            : {
                                                                                  messageId:
                                                                                      msg.id,
                                                                                  messageContent:
                                                                                      msg.content,
                                                                                  isOwn,
                                                                                  isPinned:
                                                                                      msg.is_pinned,
                                                                                  isStarred:
                                                                                      isStarred(
                                                                                          msg.id
                                                                                      ),
                                                                                  canEdit:
                                                                                      false,
                                                                                  hasMedia:
                                                                                      true,
                                                                                  isPixelArt:
                                                                                      false,
                                                                                  mediaUrl:
                                                                                      msg.content.replace(
                                                                                          "[GIF]",
                                                                                          ""
                                                                                      ),
                                                                              }
                                                                    );
                                                                }}
                                                                className={`rounded-2xl overflow-hidden relative cursor-pointer ${
                                                                    isOwn
                                                                        ? "rounded-br-md"
                                                                        : "rounded-bl-md"
                                                                } ${
                                                                    selectedMessage ===
                                                                    msg.id
                                                                        ? "ring-2 ring-orange-400/50"
                                                                        : ""
                                                                }`}
                                                            >
                                                                <img
                                                                    src={msg.content.replace(
                                                                        "[GIF]",
                                                                        ""
                                                                    )}
                                                                    alt="GIF"
                                                                    className="max-w-[280px] h-auto rounded-xl"
                                                                    loading="lazy"
                                                                />
                                                            </div>
                                                        ) : isLocation &&
                                                          locationData ? (
                                                            <div
                                                                onClick={() => {
                                                                    setSelectedMessage(
                                                                        selectedMessage ===
                                                                            msg.id
                                                                            ? null
                                                                            : msg.id
                                                                    );
                                                                    setSelectedMessageConfig(
                                                                        selectedMessage ===
                                                                            msg.id
                                                                            ? null
                                                                            : {
                                                                                  messageId:
                                                                                      msg.id,
                                                                                  messageContent:
                                                                                      msg.content,
                                                                                  isOwn,
                                                                                  isPinned:
                                                                                      msg.is_pinned,
                                                                                  isStarred:
                                                                                      isStarred(
                                                                                          msg.id
                                                                                      ),
                                                                                  canEdit:
                                                                                      false,
                                                                                  hasMedia:
                                                                                      false,
                                                                                  isPixelArt:
                                                                                      false,
                                                                              }
                                                                    );
                                                                }}
                                                                className={`cursor-pointer ${
                                                                    selectedMessage ===
                                                                    msg.id
                                                                        ? "ring-2 ring-orange-400/50 rounded-2xl"
                                                                        : ""
                                                                }`}
                                                            >
                                                                <LocationMessage
                                                                    location={
                                                                        locationData
                                                                    }
                                                                    isOwn={isOwn}
                                                                    className="max-w-[280px]"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div
                                                                onClick={() => {
                                                                    setSelectedMessage(
                                                                        selectedMessage ===
                                                                            msg.id
                                                                            ? null
                                                                            : msg.id
                                                                    );
                                                                    setSelectedMessageConfig(
                                                                        selectedMessage ===
                                                                            msg.id
                                                                            ? null
                                                                            : {
                                                                                  messageId:
                                                                                      msg.id,
                                                                                  messageContent:
                                                                                      msg.content,
                                                                                  isOwn,
                                                                                  isPinned:
                                                                                      msg.is_pinned,
                                                                                  isStarred:
                                                                                      isStarred(
                                                                                          msg.id
                                                                                      ),
                                                                                  canEdit:
                                                                                      isOwn &&
                                                                                      !msg.is_deleted &&
                                                                                      isWithinEditWindow(
                                                                                          msg.created_at
                                                                                      ) &&
                                                                                      msg.message_type ===
                                                                                          "text",
                                                                                  hasMedia:
                                                                                      msg.message_type ===
                                                                                          "pixel_art" ||
                                                                                      msg.message_type ===
                                                                                          "image",
                                                                                  isPixelArt:
                                                                                      msg.message_type ===
                                                                                      "pixel_art",
                                                                                  mediaUrl:
                                                                                      msg.message_type ===
                                                                                          "pixel_art" ||
                                                                                      msg.message_type ===
                                                                                          "image"
                                                                                          ? msg.content
                                                                                          : isGif
                                                                                          ? msg.content.replace(
                                                                                                "[GIF]",
                                                                                                ""
                                                                                            )
                                                                                          : undefined,
                                                                              }
                                                                    );
                                                                }}
                                                            >
                                                                <div
                                                                    data-message-bubble
                                                                    className={`px-4 py-2.5 rounded-2xl relative cursor-pointer ${
                                                                        isOwn
                                                                            ? "bg-[#FF5500] text-white rounded-br-md"
                                                                            : isAgent
                                                                            ? "bg-gradient-to-br from-purple-900/80 to-indigo-900/80 border border-purple-500/30 text-white rounded-bl-md"
                                                                            : "bg-zinc-800 text-white rounded-bl-md"
                                                                    } ${
                                                                        selectedMessage ===
                                                                        msg.id
                                                                            ? "ring-2 ring-orange-400/50"
                                                                            : ""
                                                                    }`}
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
                                                                                    {formatSender(
                                                                                        msg
                                                                                            .reply_to
                                                                                            .sender_address
                                                                                    )}
                                                                                </span>
                                                                            </div>
                                                                            <p
                                                                                className={`text-xs mt-1 line-clamp-2 ${
                                                                                    isOwn
                                                                                        ? "text-white/70"
                                                                                        : "text-zinc-400"
                                                                                }`}
                                                                            >
                                                                                {
                                                                                    msg
                                                                                        .reply_to
                                                                                        .content
                                                                                }
                                                                            </p>
                                                                        </div>
                                                                    )}

                                                                    {/* Inline Edit Form */}
                                                                    {editingMessage ===
                                                                    msg.id ? (
                                                                        <div className="flex flex-col gap-2">
                                                                            <textarea
                                                                                value={
                                                                                    editContent
                                                                                }
                                                                                onChange={(
                                                                                    e
                                                                                ) =>
                                                                                    setEditContent(
                                                                                        e
                                                                                            .target
                                                                                            .value
                                                                                    )
                                                                                }
                                                                                className="w-full min-w-[200px] px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
                                                                                rows={
                                                                                    3
                                                                                }
                                                                                autoFocus
                                                                                onKeyDown={(
                                                                                    e
                                                                                ) => {
                                                                                    if (
                                                                                        e.key ===
                                                                                            "Enter" &&
                                                                                        !e.shiftKey
                                                                                    ) {
                                                                                        e.preventDefault();
                                                                                        handleSaveEdit();
                                                                                    }
                                                                                    if (
                                                                                        e.key ===
                                                                                        "Escape"
                                                                                    ) {
                                                                                        handleCancelEdit();
                                                                                    }
                                                                                }}
                                                                            />
                                                                            <div className="flex items-center gap-2 text-xs">
                                                                                <button
                                                                                    onClick={
                                                                                        handleSaveEdit
                                                                                    }
                                                                                    disabled={
                                                                                        !editContent.trim()
                                                                                    }
                                                                                    className="px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                                                >
                                                                                    Save
                                                                                </button>
                                                                                <button
                                                                                    onClick={
                                                                                        handleCancelEdit
                                                                                    }
                                                                                    className="px-3 py-1 bg-zinc-600 hover:bg-zinc-500 text-white rounded-lg transition-colors"
                                                                                >
                                                                                    Cancel
                                                                                </button>
                                                                                <span className="text-zinc-500">
                                                                                    Enter
                                                                                    to
                                                                                    save,
                                                                                    Esc
                                                                                    to
                                                                                    cancel
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    ) : isAgent ? (
                                                                        // Agent messages - rich markdown with copy button
                                                                        <AgentMessageWrapper content={msg.content} theme="channel">
                                                                            <AgentMarkdown content={msg.content} theme="channel" />
                                                                        </AgentMessageWrapper>
                                                                    ) : hasMarkdown(
                                                                          msg.content
                                                                      ) ? (
                                                                        <ChatMarkdown
                                                                            content={
                                                                                msg.content
                                                                            }
                                                                            isOwnMessage={
                                                                                isOwn
                                                                            }
                                                                        />
                                                                    ) : (
                                                                        <>
                                                                            <p
                                                                                className={`break-words whitespace-pre-wrap ${
                                                                                    isEmojiOnly(
                                                                                        msg.content
                                                                                    )
                                                                                        ? "text-4xl leading-tight"
                                                                                        : ""
                                                                                }`}
                                                                            >
                                                                                <MentionText
                                                                                    text={
                                                                                        msg.content
                                                                                    }
                                                                                    currentUserAddress={
                                                                                        userAddress
                                                                                    }
                                                                                    onMentionClick={
                                                                                        handleMentionClick
                                                                                    }
                                                                                />
                                                                            </p>
                                                                            {detectUrls(
                                                                                msg.content
                                                                            )
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
                                                                        </>
                                                                    )}

                                                                    {/* Reactions Display - Mobile Friendly */}
                                                                    <ReactionDisplay
                                                                        reactions={
                                                                            reactions[
                                                                                msg
                                                                                    .id
                                                                            ] ||
                                                                            []
                                                                        }
                                                                        onReaction={(
                                                                            emoji
                                                                        ) => {
                                                                            handleReaction(
                                                                                msg.id,
                                                                                emoji
                                                                            );
                                                                        }}
                                                                        isOwnMessage={
                                                                            isOwn
                                                                        }
                                                                    />
                                                                    {!isWakuChannel &&
                                                                        (() => {
                                                                            const replyCount =
                                                                                messages.filter(
                                                                                    (
                                                                                        m
                                                                                    ) =>
                                                                                        m.reply_to_id ===
                                                                                        msg.id
                                                                                ).length;
                                                                            return replyCount >
                                                                                0 ? (
                                                                                <div className="mt-1.5 flex items-center gap-2">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() =>
                                                                                            setThreadRootMessage(
                                                                                                msg
                                                                                            )
                                                                                        }
                                                                                        className="text-xs text-zinc-500 hover:text-orange-400 transition-colors flex items-center gap-1"
                                                                                    >
                                                                                        <svg
                                                                                            className="w-3.5 h-3.5"
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
                                                                                        View
                                                                                        thread
                                                                                        (
                                                                                        {
                                                                                            replyCount
                                                                                        }{" "}
                                                                                        {replyCount ===
                                                                                        1
                                                                                            ? "reply"
                                                                                            : "replies"}

                                                                                        )
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() =>
                                                                                            setThreadRootMessage(
                                                                                                msg
                                                                                            )
                                                                                        }
                                                                                        className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
                                                                                    >
                                                                                        Reply
                                                                                        in
                                                                                        thread
                                                                                    </button>
                                                                                </div>
                                                                            ) : null;
                                                                        })()}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <p className="text-[10px] text-zinc-600 mt-1 px-1">
                                                            {formatTime(
                                                                msg.created_at
                                                            )}
                                                            {msg.is_edited && (
                                                                <span className="ml-1 italic">
                                                                    (edited)
                                                                </span>
                                                            )}
                                                        </p>
                                                    </div>

                                                    {/* Spacer for own messages (to match avatar space) */}
                                                    {isOwn && (
                                                        <div className="w-8 flex-shrink-0" />
                                                    )}
                                                </motion.div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Loading indicators at visual TOP (end of DOM with column-reverse) */}
                                {isLoadingMore && (
                                    <div className="flex justify-center py-4">
                                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-zinc-600 border-t-orange-500" />
                                    </div>
                                )}
                                {!isLoadingMore &&
                                    hasMore &&
                                    messages.length > 0 && (
                                        <div className="flex justify-center py-2">
                                            <span className="text-xs text-zinc-500">
                                                Scroll up to load more
                                            </span>
                                        </div>
                                    )}
                            </>
                        )}
                    </div>

                    {/* Reply Preview */}
                    {replyingTo && (
                        <div className="px-4 py-2 bg-zinc-800/50 border-t border-zinc-700 flex items-center gap-2">
                            <div className="w-1 h-8 bg-orange-500 rounded-full" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-orange-400 font-medium">
                                    Replying to{" "}
                                    {replyingTo.sender_address.toLowerCase() ===
                                    userAddress.toLowerCase()
                                        ? "yourself"
                                        : formatSender(
                                              replyingTo.sender_address
                                          )}
                                </p>
                                <p className="text-xs text-zinc-400 truncate">
                                    {replyingTo.content}
                                </p>
                            </div>
                            <button
                                onClick={() => setReplyingTo(null)}
                                className="w-6 h-6 flex items-center justify-center text-zinc-500 hover:text-white transition-colors"
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
                    )}

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

                    {/* Typing Indicator */}
                    <AnimatePresence>
                        {typingUsers.length > 0 && (
                            <TypingIndicator
                                users={typingUsers.map(
                                    (u) =>
                                        u.name || `${u.address.slice(0, 6)}...`
                                )}
                                className="border-t border-zinc-800/50"
                            />
                        )}
                    </AnimatePresence>

                    {/* Input - with safe area padding for bottom */}
                    <div
                        className={`border-t border-zinc-800 ${
                            isFullscreen ? "px-4 pt-4" : "p-4"
                        }`}
                        style={
                            isFullscreen
                                ? {
                                      paddingBottom:
                                          "max(env(safe-area-inset-bottom), 16px)",
                                  }
                                : undefined
                        }
                    >
                        {/* Waku channel send error (e.g. "You must be a member to send messages") */}
                        {isWakuChannel && wakuMessages.error && (
                            <div className="mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2">
                                <span className="shrink-0">⚠️</span>
                                <span>{wakuMessages.error}</span>
                                <button
                                    type="button"
                                    onClick={() => wakuMessages.clearError?.()}
                                    className="ml-auto shrink-0 text-red-400/80 hover:text-red-400"
                                    aria-label="Dismiss"
                                >
                                    ×
                                </button>
                            </div>
                        )}
                        {/* Hidden file input */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            onChange={handleImageSelect}
                            className="hidden"
                        />
                        <div className="flex items-center gap-2">
                            {/* Consolidated attachment menu */}
                            <ChatAttachmentMenu
                                onImageUpload={() =>
                                    fileInputRef.current?.click()
                                }
                                onPixelArt={() => setShowPixelArt(true)}
                                onGif={handleSendGif}
                                onPoll={
                                    canCreatePoll
                                        ? () => setShowPollCreator(true)
                                        : undefined
                                }
                                showPoll={canCreatePoll}
                                isUploading={isUploading || isUploadingPixelArt}
                            />
                            <MentionInput
                                inputRef={inputRef}
                                value={inputValue}
                                onChange={(val) => {
                                    if (val.length > 10000) return;
                                    setInputValue(val);
                                    saveDraft(
                                        val,
                                        replyingTo?.id,
                                        replyingTo
                                            ? replyingTo.content?.slice(
                                                  0,
                                                  80
                                              ) ?? ""
                                            : undefined
                                    );
                                    if (
                                        isWakuChannel &&
                                        wakuMessages.clearError
                                    )
                                        wakuMessages.clearError();
                                    if (val.trim()) setTyping();
                                }}
                                onSubmit={handleSend}
                                placeholder={`Message #${channel.name}`}
                                users={mentionableUsers}
                                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20 transition-all"
                            />
                            <button
                                onClick={handleSend}
                                disabled={!inputValue.trim() || isSending}
                                className="p-3 bg-[#FF5500] text-white rounded-xl hover:bg-[#E04D00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Send message"
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
                        {inputValue.length > 500 && (
                            <p className="mt-1.5 text-right text-xs text-zinc-500">
                                {inputValue.length.toLocaleString()} / 10,000
                            </p>
                        )}
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
                                left: Math.min(
                                    userPopupPosition.x,
                                    typeof window !== "undefined"
                                        ? window.innerWidth - 290
                                        : 0
                                ),
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
                                                <img
                                                    src={userInfo.avatar}
                                                    alt=""
                                                    className="w-10 h-10 rounded-full"
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold">
                                                    {(
                                                        userInfo?.name ||
                                                        selectedUser
                                                    )
                                                        .slice(0, 2)
                                                        .toUpperCase()}
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white font-medium text-sm truncate">
                                                    {userInfo?.name ||
                                                        `${selectedUser.slice(
                                                            0,
                                                            6
                                                        )}...${selectedUser.slice(
                                                            -4
                                                        )}`}
                                                </p>
                                                <p className="text-zinc-500 text-xs truncate font-mono">
                                                    {selectedUser.slice(0, 10)}
                                                    ...{selectedUser.slice(-6)}
                                                </p>
                                            </div>
                                        </div>

                                        {alreadyFriend ? (
                                            <>
                                                {onOpenDM && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            onOpenDM(
                                                                selectedUser
                                                            );
                                                            setSelectedUser(
                                                                null
                                                            );
                                                        }}
                                                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg font-medium transition-colors mb-2"
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
                                                                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                                            />
                                                        </svg>
                                                        Send private message
                                                    </button>
                                                )}
                                                <p className="text-emerald-400/90 text-xs flex items-center gap-1.5">
                                                    <svg
                                                        className="w-3.5 h-3.5"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M5 13l4 4L19 7"
                                                        />
                                                    </svg>
                                                    Already friends
                                                </p>
                                            </>
                                        ) : (
                                            onAddFriend && (
                                                <button
                                                    onClick={() =>
                                                        handleAddFriend(
                                                            selectedUser
                                                        )
                                                    }
                                                    disabled={
                                                        addingFriend ===
                                                        selectedUser
                                                    }
                                                    className="w-full px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                                >
                                                    {addingFriend ===
                                                    selectedUser ? (
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : (
                                                        <>
                                                            <svg
                                                                className="w-4 h-4"
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
                                                                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                                                                />
                                                            </svg>
                                                            Add Friend
                                                        </>
                                                    )}
                                                </button>
                                            )
                                        )}

                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(
                                                    selectedUser
                                                );
                                                setSelectedUser(null);
                                            }}
                                            className="w-full flex items-center gap-2 px-3 py-2 mt-1 hover:bg-zinc-700 text-zinc-400 rounded-lg text-sm transition-colors"
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
                                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                                />
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

                {/* Image Preview Modal with zoom support */}
                <ImageViewerModal
                    isOpen={!!previewImage}
                    onClose={() => setPreviewImage(null)}
                    imageUrl={previewImage ?? ""}
                    alt="Shared image"
                />

                {/* Poll Creator Modal */}
                <PollCreator
                    isOpen={showPollCreator}
                    onClose={() => setShowPollCreator(false)}
                    onCreatePoll={async (
                        question,
                        options,
                        allowsMultiple,
                        endsAt,
                        isAnonymous
                    ) => {
                        await createPoll(
                            question,
                            options,
                            allowsMultiple,
                            endsAt,
                            isAnonymous
                        );
                    }}
                />

                {/* Forward Message Modal */}
                <ForwardMessageModal
                    isOpen={!!forwardingMessage}
                    onClose={() => setForwardingMessage(null)}
                    message={
                        forwardingMessage
                            ? {
                                  id: forwardingMessage.id,
                                  content: forwardingMessage.content,
                                  senderName: formatSender(
                                      forwardingMessage.sender_address
                                  ),
                                  senderAddress:
                                      forwardingMessage.sender_address,
                              }
                            : null
                    }
                    onForward={async (targetId, targetType) => {
                        if (!forwardingMessage) return false;
                        const forwardedContent = `↩️ Forwarded from ${formatSender(
                            forwardingMessage.sender_address
                        )}:\n\n"${forwardingMessage.content}"`;
                        if (targetType === "global" && onForwardToGlobal) {
                            return onForwardToGlobal(forwardedContent);
                        }
                        if (
                            targetType === "channel" &&
                            targetId === channel.id
                        ) {
                            await sendMessage(forwardedContent, "text");
                            return true;
                        }
                        return false;
                    }}
                    chats={[
                        {
                            id: channel.id,
                            type: "channel",
                            name: `#${channel.name}`,
                            icon: channel.emoji,
                        },
                        ...(onForwardToGlobal
                            ? [
                                  {
                                      id: "global",
                                      type: "global" as const,
                                      name: "Global Chat",
                                      avatar: globalChatIconUrl ?? undefined,
                                  },
                              ]
                            : []),
                    ]}
                />

                {/* Scroll to bottom FAB */}
                <ScrollToBottom
                    containerRef={messagesContainerRef}
                    unreadCount={newMessageCount}
                    onScrollToBottom={resetUnreadCount}
                />

                {/* Message Action Bar */}
                <MessageActionBar
                    isOpen={!!selectedMessage && !!selectedMessageConfig}
                    onClose={() => {
                        setSelectedMessage(null);
                        setSelectedMessageConfig(null);
                    }}
                    config={selectedMessageConfig}
                    callbacks={{
                        onReaction: selectedMessageConfig
                            ? (emoji) =>
                                  handleReaction(
                                      selectedMessageConfig.messageId,
                                      emoji
                                  )
                            : undefined,
                        onReply: selectedMessageConfig
                            ? () => {
                                  const msg = messages.find(
                                      (m) =>
                                          m.id ===
                                          selectedMessageConfig.messageId
                                  );
                                  if (msg) setReplyingTo(msg);
                              }
                            : undefined,
                        onCopy: () => {},
                        onForward: selectedMessageConfig
                            ? () => {
                                  const msg = messages.find(
                                      (m) =>
                                          m.id ===
                                          selectedMessageConfig.messageId
                                  );
                                  if (msg) setForwardingMessage(msg);
                              }
                            : undefined,
                        onPin:
                            selectedMessageConfig?.isPinned === false && isAdmin
                                ? () =>
                                      handlePinMessage(
                                          selectedMessageConfig?.messageId ||
                                              "",
                                          false
                                      )
                                : undefined,
                        onUnpin:
                            selectedMessageConfig?.isPinned && isAdmin
                                ? () =>
                                      handlePinMessage(
                                          selectedMessageConfig?.messageId ||
                                              "",
                                          true
                                      )
                                : undefined,
                        onEdit: selectedMessageConfig?.canEdit
                            ? () =>
                                  setEditingMessage(
                                      selectedMessageConfig?.messageId || null
                                  )
                            : undefined,
                        onDelete: selectedMessageConfig?.isOwn
                            ? () =>
                                  deleteMessage(
                                      selectedMessageConfig?.messageId || ""
                                  )
                            : undefined,
                    }}
                />

                {/* Members List Panel */}
                <ChatMembersList
                    channelId={channel.id}
                    isOpen={showMembersList}
                    onClose={() => setShowMembersList(false)}
                    onUserClick={(address) => {
                        if (onOpenUserCard) {
                            onOpenUserCard(address);
                            setShowMembersList(false);
                        } else {
                            setSelectedUser(address);
                            setShowMembersList(false);
                        }
                    }}
                    getUserInfo={getUserInfo}
                    currentUserAddress={userAddress}
                />

                <ImageViewerModal
                    isOpen={!!viewerImage}
                    onClose={() => setViewerImage(null)}
                    imageUrl={viewerImage ?? ""}
                    alt={channel.name}
                />
            </motion.div>
        </AnimatePresence>
    );
}
