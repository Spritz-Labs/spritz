"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import type {
    AlphaMessage,
    AlphaMembership,
    AlphaMessageReaction,
} from "@/hooks/useAlphaChat";
import { ALPHA_REACTION_EMOJIS } from "@/hooks/useAlphaChat";
import { PixelArtEditor } from "./PixelArtEditor";
import { PixelArtImage } from "./PixelArtImage";
import { PixelArtShare } from "./PixelArtShare";
import { QuickReactionPicker, ReactionDisplay } from "./EmojiPicker";
import {
    MessageActionsSheet,
    ActionIcons,
    type MessageAction,
} from "./MessageActionsSheet";
import { MentionInput, type MentionUser } from "./MentionInput";
import { MentionText } from "./MentionText";
import { ChatAttachmentMenu } from "./ChatAttachmentMenu";
import { ChatRulesPanel, ChatRulesBanner } from "./ChatRulesPanel";
import { ModerationPanel, QuickMuteDialog } from "./ModerationPanel";
import { useModeration } from "@/hooks/useModeration";
import { useChatRules, useRoomBans } from "@/hooks/useChatRules";
import { validateMessageClientSide } from "@/lib/clientChatRules";
import { toast } from "sonner";
import { ChatMarkdown, hasMarkdown } from "./ChatMarkdown";
import {
    AgentMarkdown,
    AgentMessageWrapper,
    AgentThinkingIndicator,
} from "./AgentMarkdown";
import { LinkPreview, detectUrls } from "./LinkPreview";
import {
    LocationMessage,
    isLocationMessage,
    parseLocationMessage,
    formatLocationMessage,
    type LocationData,
} from "./LocationMessage";
import { ChannelIcon } from "./ChannelIcon";
import { TypingIndicator } from "./TypingIndicator";
import { AvatarWithStatus } from "./OnlineStatus";
import { DateDivider } from "./UnreadDivider";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { fetchOnlineStatuses } from "@/hooks/usePresence";
import { ScrollToBottom, useScrollToBottom } from "./ScrollToBottom";
import { ChatSkeleton } from "./ChatSkeleton";
import { ChatEmptyState } from "./ChatEmptyState";
import { useDraftMessages } from "@/hooks/useDraftMessages";
import { SwipeableMessage } from "./SwipeableMessage";
import { MessageActionBar, type MessageActionConfig } from "./MessageActionBar";
import { ChatMembersList } from "./ChatMembersList";
import { PollCreator } from "./PollCreator";
import { PollDisplay, type DisplayPoll } from "./PollDisplay";
import { PollEditModal } from "./PollEditModal";
import { useAlphaPolls } from "@/hooks/useAlphaPolls";
import { MessageSearch } from "./MessageSearch";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatTimeInTimezone } from "@/lib/timezone";
import { useBlockedUsers } from "@/hooks/useMuteBlockReport";

// Helper to detect if a message is emoji-only (for larger display)
const EMOJI_REGEX =
    /^[\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Modifier_Base}\p{Emoji_Presentation}\u200d\ufe0f\s]+$/u;
const isEmojiOnly = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (!EMOJI_REGEX.test(trimmed)) return false;
    const emojiCount = [...trimmed].filter(
        (char) => /\p{Emoji}/u.test(char) && !/\d/u.test(char),
    ).length;
    return emojiCount >= 1 && emojiCount <= 3;
};

interface AlphaChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string;
    // Shared hook state from parent
    alphaChat: {
        messages: AlphaMessage[];
        pinnedMessages: AlphaMessage[];
        reactions: Record<string, AlphaMessageReaction[]>;
        membership: AlphaMembership | null;
        isMember: boolean;
        isLoading: boolean;
        isLoadingMore: boolean;
        hasMore: boolean;
        isSending: boolean;
        replyingTo: AlphaMessage | null;
        sendMessage: (
            content: string,
            messageType?: "text" | "pixel_art" | "image",
            replyToId?: string,
        ) => Promise<boolean>;
        markAsRead: () => Promise<void>;
        toggleNotifications: () => Promise<boolean>;
        leaveChannel: () => Promise<boolean>;
        joinChannel: () => Promise<boolean>;
        setReplyingTo: (message: AlphaMessage | null) => void;
        toggleReaction: (messageId: string, emoji: string) => Promise<boolean>;
        togglePinMessage: (
            messageId: string,
            shouldPin: boolean,
        ) => Promise<boolean>;
        refreshMessages?: () => Promise<void>;
        loadMoreMessages: () => Promise<void>;
        thinkingAgents?: {
            id: string;
            name: string;
            emoji?: string;
            avatarUrl?: string;
        }[];
    };
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
    // Admin controls
    isAdmin?: boolean;
    // Callback when a message is sent (for updating last message time)
    onMessageSent?: () => void;
}

export function AlphaChatModal({
    isOpen,
    onClose,
    userAddress,
    alphaChat,
    getUserInfo,
    onOpenUserCard,
    onAddFriend,
    isFriend,
    onOpenDM,
    isAdmin = false,
    onMessageSent,
}: AlphaChatModalProps) {
    const {
        messages: rawMessages,
        pinnedMessages,
        reactions,
        membership,
        isMember,
        isLoading,
        isLoadingMore,
        hasMore,
        isSending,
        replyingTo,
        sendMessage,
        markAsRead,
        toggleNotifications,
        leaveChannel,
        joinChannel,
        setReplyingTo,
        toggleReaction,
        togglePinMessage,
        refreshMessages,
        loadMoreMessages,
        thinkingAgents = [],
    } = alphaChat;

    // Filter out messages from blocked users
    const { isBlocked: isUserBlocked } = useBlockedUsers(userAddress);
    const messages = useMemo(
        () => rawMessages.filter((msg) => !isUserBlocked(msg.sender_address)),
        [rawMessages, isUserBlocked],
    );

    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showPollCreator, setShowPollCreator] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [showPinnedMessages, setShowPinnedMessages] = useState(false);
    const [pinningMessage, setPinningMessage] = useState<string | null>(null);
    const [showModerationPanel, setShowModerationPanel] = useState(false);
    const [muteTarget, setMuteTarget] = useState<{
        address: string;
        name: string;
    } | null>(null);
    const [deletingMessage, setDeletingMessage] = useState<string | null>(null);

    // Moderation hook (null channelId = global/alpha chat)
    const moderation = useModeration(userAddress, null);

    const {
        polls,
        canCreatePoll,
        fetchPolls,
        createPoll,
        vote,
        updatePoll,
        deletePoll,
    } = useAlphaPolls(userAddress);

    const HIDDEN_POLLS_KEY = "spritz_hidden_polls_alpha";
    const [hiddenPollIds, setHiddenPollIds] = useState<string[]>(() => {
        if (typeof window === "undefined") return [];
        try {
            return JSON.parse(
                window.localStorage.getItem(HIDDEN_POLLS_KEY) ?? "[]",
            );
        } catch {
            return [];
        }
    });
    const [editingPoll, setEditingPoll] = useState<DisplayPoll | null>(null);

    const visiblePolls = polls.filter((p) => !hiddenPollIds.includes(p.id));

    // Message search: map alpha messages to MessageSearch shape (exclude system/pixel/gif markers for search)
    const alphaSearchMessages = useMemo(
        () =>
            messages
                .filter(
                    (m) =>
                        m.message_type === "text" &&
                        !m.content.startsWith("[PIXEL_ART]") &&
                        !m.content.startsWith("[GIF]") &&
                        !m.content.startsWith("[IMAGE]"),
                )
                .map((m) => ({
                    id: m.id,
                    content: m.content,
                    senderAddress: m.sender_address,
                    sentAt: new Date(m.created_at),
                })),
        [messages],
    );

    const handleSelectSearchMessage = useCallback((messageId: string) => {
        setShowSearch(false);
        setTimeout(() => {
            document
                .querySelector(`[data-message-id="${messageId}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
    }, []);

    // Typing indicator for global chat
    const { typingUsers, setTyping, stopTyping } = useTypingIndicator(
        "global",
        "global",
        userAddress,
        getUserInfo?.(userAddress)?.name || undefined,
    );

    const [newMessage, setNewMessage] = useState("");
    const draftAppliedRef = useRef(false);
    const [showPixelArt, setShowPixelArt] = useState(false);
    const [isUploadingPixelArt, setIsUploadingPixelArt] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const imageFileInputRef = useRef<HTMLInputElement>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [showRulesPanel, setShowRulesPanel] = useState(false);
    const { rules: chatRules } = useChatRules("alpha", null);
    const roomBans = useRoomBans("alpha", null);
    const [banningUser, setBanningUser] = useState<string | null>(null);
    const [isLeaving, setIsLeaving] = useState(false);
    const [isJoining, setIsJoining] = useState(false);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [userPopupPosition, setUserPopupPosition] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [isAddingFriend, setIsAddingFriend] = useState(false);
    const [showReactionPicker, setShowReactionPicker] = useState<string | null>(
        null,
    );
    const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
    const [selectedMessageConfig, setSelectedMessageConfig] =
        useState<MessageActionConfig | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(true);
    const [onlineStatuses, setOnlineStatuses] = useState<
        Record<string, boolean>
    >({});
    const [showMembersList, setShowMembersList] = useState(false);
    const [globalMemberCount, setGlobalMemberCount] = useState<number | null>(
        null,
    );
    const userTimezone = useUserTimezone();

    // Fetch global chat member count when modal opens (for "X members" in header)
    useEffect(() => {
        if (!isOpen) return;
        fetch("/api/channels/global/members?limit=1&offset=0")
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data && typeof data.total === "number") {
                    setGlobalMemberCount(data.total);
                }
            })
            .catch(() => {});
    }, [isOpen]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

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

    // Global chat icon management (for admins)
    const [globalChatIcon, setGlobalChatIcon] = useState<string | null>(null);
    const [isUploadingIcon, setIsUploadingIcon] = useState(false);
    const iconFileInputRef = useRef<HTMLInputElement>(null);

    // Fetch global chat icon
    useEffect(() => {
        async function fetchGlobalChatIcon() {
            try {
                const res = await fetch(
                    "/api/admin/settings?key=global_chat_icon",
                );
                if (res.ok) {
                    const data = await res.json();
                    if (data.settings?.value?.icon_url) {
                        setGlobalChatIcon(data.settings.value.icon_url);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch global chat icon:", err);
            }
        }
        fetchGlobalChatIcon();
    }, []);

    const handleGlobalIconUpload = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = e.target.files?.[0];
        if (!file || !isAdmin) return;

        setIsUploadingIcon(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("userAddress", userAddress);

            const res = await fetch("/api/admin/settings/global-chat-icon", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to upload icon");
            }

            setGlobalChatIcon(data.icon_url);

            // Show success toast
            const toast = document.createElement("div");
            toast.className =
                "fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-xl shadow-lg z-[100] animate-in fade-in slide-in-from-bottom-2";
            toast.textContent = "✓ Global chat icon updated!";
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        } catch (err) {
            console.error("Failed to upload icon:", err);
            const toast = document.createElement("div");
            toast.className =
                "fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-xl shadow-lg z-[100] animate-in fade-in slide-in-from-bottom-2";
            toast.textContent =
                err instanceof Error ? err.message : "Failed to upload icon";
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        } finally {
            setIsUploadingIcon(false);
            e.target.value = "";
        }
    };

    const handleRemoveGlobalIcon = async () => {
        if (!isAdmin) return;

        setIsUploadingIcon(true);
        try {
            const res = await fetch(
                `/api/admin/settings/global-chat-icon?userAddress=${userAddress}`,
                {
                    method: "DELETE",
                },
            );

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to remove icon");
            }

            setGlobalChatIcon(null);

            const toast = document.createElement("div");
            toast.className =
                "fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-xl shadow-lg z-[100] animate-in fade-in slide-in-from-bottom-2";
            toast.textContent = "✓ Global chat icon removed!";
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        } catch (err) {
            console.error("Failed to remove icon:", err);
        } finally {
            setIsUploadingIcon(false);
        }
    };
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    // Draft messages persistence
    const { draft, saveDraft, clearDraft } = useDraftMessages(
        "alpha",
        "global",
        userAddress,
    );

    // Apply draft when modal opens
    useEffect(() => {
        if (!isOpen) {
            draftAppliedRef.current = false;
            return;
        }
        if (draft?.text && !draftAppliedRef.current) {
            setNewMessage(draft.text);
            draftAppliedRef.current = true;
        }
    }, [isOpen, draft?.text]);

    // Escape to close modal (or cancel reply first)
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (replyingTo) {
                setReplyingTo(null);
                return;
            }
            if (showSettings || showModerationPanel || showMembersList) {
                setShowSettings(false);
                setShowModerationPanel(false);
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
        replyingTo,
        showSettings,
        showModerationPanel,
        showMembersList,
    ]);

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

    // Fetch polls when alpha chat opens
    useEffect(() => {
        if (isOpen) fetchPolls();
    }, [isOpen, fetchPolls]);

    // Scroll to bottom with unread badge
    const {
        newMessageCount,
        isAtBottom,
        onNewMessage,
        resetUnreadCount,
        scrollToBottom: scrollToBottomFn,
    } = useScrollToBottom(messagesContainerRef);

    const userPopupRef = useRef<HTMLDivElement>(null);
    const previousScrollHeightRef = useRef<number>(0);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const userScrolledUpRef = useRef(false);
    const justSentMessageRef = useRef(false);

    // Fetch AI agents in this channel
    const [channelAgents, setChannelAgents] = useState<MentionUser[]>([]);
    useEffect(() => {
        async function fetchAgents() {
            try {
                const res = await fetch("/api/channels/global/agents");
                if (res.ok) {
                    const data = await res.json();
                    const agents: MentionUser[] = (data.agents || []).map(
                        (agent: any) => ({
                            address: agent.id, // Use agent ID as "address" for mentions
                            name: agent.name,
                            avatar: agent.avatar_url || null,
                            avatarEmoji: agent.avatar_emoji,
                            isAgent: true,
                        }),
                    );
                    setChannelAgents(agents);
                }
            } catch (err) {
                console.error(
                    "[AlphaChat] Error fetching channel agents:",
                    err,
                );
            }
        }
        if (isOpen) {
            fetchAgents();
        }
    }, [isOpen]);

    // Build list of mentionable users from message senders + channel agents
    const mentionableUsers: MentionUser[] = useMemo(() => {
        const userMap = new Map<string, MentionUser>();

        // Add channel agents first (so they appear at the top)
        channelAgents.forEach((agent) => {
            userMap.set(agent.address, agent);
        });

        // Add all message senders
        messages.forEach((msg) => {
            const address = msg.sender_address.toLowerCase();
            if (
                !userMap.has(address) &&
                address !== userAddress.toLowerCase()
            ) {
                const info = getUserInfo?.(msg.sender_address);
                userMap.set(address, {
                    address: msg.sender_address,
                    name: info?.name || null,
                    avatar: info?.avatar || null,
                });
            }
        });

        return Array.from(userMap.values());
    }, [messages, userAddress, getUserInfo, channelAgents]);

    // Handle mention click - show user popup
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
        [],
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
            const popupHeight = 280;
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
        [onOpenUserCard],
    );

    // Auto-scroll on new messages (with column-reverse: scrollTop=0 is bottom)
    const lastMessageIdRef = useRef<string | null>(null);
    useEffect(() => {
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
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
    useEffect(() => {
        const container = messagesContainerRef.current;
        if (container && previousScrollHeightRef.current > 0) {
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
            if (
                userPopupRef.current &&
                !userPopupRef.current.contains(e.target as Node)
            ) {
                setSelectedUser(null);
            }
        };
        if (selectedUser) {
            document.addEventListener("mousedown", handleClickOutside);
            return () =>
                document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [selectedUser]);

    // Auto-focus input when replying to a message
    useEffect(() => {
        if (replyingTo) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [replyingTo]);

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

    // Handle pin message (admin or moderator with pin permission)
    const handlePinMessage = async (
        messageId: string,
        currentlyPinned: boolean,
    ) => {
        if ((!isAdmin && !moderation.permissions.canPin) || pinningMessage)
            return;

        setPinningMessage(messageId);
        try {
            await togglePinMessage(messageId, !currentlyPinned);
        } finally {
            setPinningMessage(null);
        }
    };

    // Handle delete message (own messages or moderator with delete permission)
    const handleDeleteMessage = async (messageId: string) => {
        if (deletingMessage) return;

        // Find the message to check ownership
        const targetMsg = messages.find((m) => m.id === messageId);
        const isOwnMessage =
            targetMsg?.sender_address?.toLowerCase() ===
            userAddress?.toLowerCase();

        // Must be own message or have moderation delete permission
        if (!isOwnMessage && !moderation.permissions.canDelete) return;

        const confirmed = window.confirm(
            "Delete this message? This action will be logged.",
        );
        if (!confirmed) return;

        setDeletingMessage(messageId);
        try {
            if (moderation.permissions.canDelete) {
                // Use moderation delete (works for both own and others' messages)
                const success = await moderation.deleteMessage(
                    messageId,
                    "alpha",
                );
                if (success) {
                    refreshMessages?.();
                }
            } else {
                // Own message delete via direct API call
                const res = await fetch("/api/moderation", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "delete-message",
                        moderatorAddress: userAddress,
                        messageId,
                        messageType: "alpha",
                        reason: "Self-deleted by author",
                    }),
                });
                if (res.ok) {
                    refreshMessages?.();
                }
            }
        } finally {
            setDeletingMessage(null);
        }
    };

    // Handle mute user
    const handleMuteUser = async (
        duration: string,
        reason?: string,
    ): Promise<boolean> => {
        if (!muteTarget) return false;
        const success = await moderation.muteUser(muteTarget.address, {
            duration,
            reason,
        });
        if (success) {
            setMuteTarget(null);
        }
        return success;
    };

    // Check if current user is muted
    const isCurrentUserMuted = moderation.isUserMuted(userAddress);

    // Check if current user is a moderator (for rule validation)
    const isModeratorForRules = isAdmin || moderation.permissions.isModerator;

    // Send message
    const handleSend = useCallback(async () => {
        if (!newMessage.trim() || isSending) return;

        // Validate against chat rules before sending
        const ruleViolation = validateMessageClientSide(chatRules, newMessage.trim(), "text", isModeratorForRules);
        if (ruleViolation) {
            toast.error(ruleViolation);
            return;
        }

        // Mark that user just sent a message (for auto-scroll)
        justSentMessageRef.current = true;
        stopTyping(); // Stop typing indicator when message is sent

        const success = await sendMessage(
            newMessage.trim(),
            "text",
            replyingTo?.id,
        );
        if (success) {
            setNewMessage("");
            clearDraft();
            onMessageSent?.();
        } else {
            setNewMessage(newMessage.trim());
        }
    }, [
        newMessage,
        isSending,
        sendMessage,
        replyingTo,
        stopTyping,
        onMessageSent,
        clearDraft,
        chatRules,
        isModeratorForRules,
    ]);

    // Handle reaction
    const handleReaction = async (messageId: string, emoji: string) => {
        await toggleReaction(messageId, emoji);
        setShowReactionPicker(null);
        setSelectedMessage(null);
        setSelectedMessageConfig(null);
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

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Handle GIF send
    const handleSendGif = useCallback(
        async (gifUrl: string) => {
            if (!gifUrl || isSending) return;

            // Validate GIF against chat rules
            const ruleViolation = validateMessageClientSide(chatRules, gifUrl, "gif", isModeratorForRules);
            if (ruleViolation) {
                toast.error(ruleViolation);
                return;
            }

            try {
                // Send GIF as an image message
                await sendMessage(`[GIF]${gifUrl}`, "text");
            } catch (err) {
                console.error("Failed to send GIF:", err);
            }
        },
        [sendMessage, isSending, chatRules, isModeratorForRules],
    );

    // Handle pixel art send
    const handleSendPixelArt = useCallback(
        async (imageData: string) => {
            // Validate pixel art against chat rules
            const ruleViolation = validateMessageClientSide(chatRules, "", "pixel_art", isModeratorForRules);
            if (ruleViolation) {
                toast.error(ruleViolation);
                return;
            }

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
        [userAddress, sendMessage, chatRules, isModeratorForRules],
    );

    // Handle image upload (admin only)
    const handleImageSelect = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file || !isAdmin) return;

            // Validate image against chat rules
            const ruleViolation = validateMessageClientSide(chatRules, "", "image", isModeratorForRules);
            if (ruleViolation) {
                toast.error(ruleViolation);
                return;
            }

            // Validate file type
            if (
                ![
                    "image/jpeg",
                    "image/png",
                    "image/gif",
                    "image/webp",
                ].includes(file.type)
            ) {
                alert("Only JPEG, PNG, GIF, and WebP images are allowed");
                return;
            }

            // Validate file size (5MB)
            if (file.size > 5 * 1024 * 1024) {
                alert("Image must be less than 5MB");
                return;
            }

            setIsUploadingImage(true);

            try {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("userAddress", userAddress);
                formData.append("context", "global");

                const res = await fetch("/api/upload", {
                    method: "POST",
                    body: formData,
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || "Failed to upload image");
                }

                // Send the image URL as an image message
                await sendMessage(`[IMAGE]${data.url}`, "image");
                onMessageSent?.();
            } catch (error) {
                console.error("Failed to upload image:", error);
                alert("Failed to upload image. Please try again.");
            } finally {
                setIsUploadingImage(false);
                // Reset file input
                if (imageFileInputRef.current) {
                    imageFileInputRef.current.value = "";
                }
            }
        },
        [userAddress, isAdmin, sendMessage, onMessageSent, chatRules, isModeratorForRules],
    );

    // Handle leave
    const handleLeave = async () => {
        const confirmed = window.confirm(
            "Are you sure you want to leave the Alpha channel? You can rejoin anytime from the menu.",
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

    // Check if message is a GIF
    const isGifMessage = (content: string) => content.startsWith("[GIF]");
    const getGifUrl = (content: string) => content.replace("[GIF]", "");

    // Check if message is an uploaded image
    const isImageMessage = (content: string) =>
        content.startsWith("[IMAGE]") ||
        content.includes("/storage/v1/object/public/chat-images/");
    const getImageUrl = (content: string) => content.replace("[IMAGE]", "");

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

        // Fetch agent info for new agent IDs
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
                        }),
                    );
                }
            } catch (err) {
                console.error("[AlphaChat] Error fetching agent info:", err);
            }
        });
    }, [messages, agentInfoCache]);

    // Check if sender is an agent
    const isAgentMessage = (address: string) => address.startsWith("agent:");
    const getAgentId = (address: string) => address.replace("agent:", "");

    // Format sender address
    const formatSender = (address: string) => {
        // Check for agent messages
        if (address.startsWith("agent:")) {
            const agentId = address.replace("agent:", "");
            const agentInfo = agentInfoCache.get(agentId);
            return agentInfo?.name || "AI Agent";
        }
        const info = getUserInfo?.(address);
        if (info?.name) return info.name;
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    const getSenderAvatar = (address: string) => {
        // Check for agent messages
        if (address.startsWith("agent:")) {
            const agentId = address.replace("agent:", "");
            const agentInfo = agentInfoCache.get(agentId);
            return agentInfo?.avatar_url || null;
        }
        return getUserInfo?.(address)?.avatar || null;
    };

    const getSenderAvatarEmoji = (address: string) => {
        if (address.startsWith("agent:")) {
            const agentId = address.replace("agent:", "");
            const agentInfo = agentInfoCache.get(agentId);
            return agentInfo?.avatar_emoji || "🤖";
        }
        return null;
    };

    const memberCountDisplay =
        globalMemberCount != null
            ? `${globalMemberCount} ${globalMemberCount === 1 ? "member" : "members"}`
            : "Community";

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
                                ? "inset-0"
                                : "inset-4 bottom-32 sm:inset-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:max-h-[65vh] sm:h-[550px]"
                        }`}
                    >
                        <div
                            ref={modalRef}
                            role="dialog"
                            aria-modal="true"
                            className={`bg-zinc-900 h-full min-h-0 flex flex-col overflow-hidden ${
                                isFullscreen
                                    ? ""
                                    : "border border-zinc-800 rounded-2xl shadow-2xl"
                            }`}
                            style={
                                isFullscreen
                                    ? {
                                          paddingTop:
                                              "env(safe-area-inset-top)",
                                          paddingLeft:
                                              "env(safe-area-inset-left)",
                                          paddingRight:
                                              "env(safe-area-inset-right)",
                                      }
                                    : undefined
                            }
                        >
                            {/* Header - unified mobile-first design */}
                            <div className="flex items-center gap-2 px-2 sm:px-3 py-2.5 border-b border-zinc-800">
                                {/* Avatar - shows custom icon if available */}
                                {globalChatIcon ? (
                                    <ChannelIcon
                                        emoji="🍊"
                                        iconUrl={globalChatIcon}
                                        name="Global Chat"
                                        size="sm"
                                        className="shrink-0 ml-1"
                                    />
                                ) : (
                                    <div className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center ml-1">
                                        <span className="text-lg">🍊</span>
                                    </div>
                                )}

                                {/* Title area - takes remaining space */}
                                <div className="flex-1 min-w-0 pr-1">
                                    <h2 className="text-white font-semibold text-[15px] truncate leading-tight">
                                        Global Chat
                                    </h2>
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
                                        {memberCountDisplay}
                                    </button>
                                </div>

                                {/* Action buttons - essential only visible, rest in menu */}
                                <div className="shrink-0 flex items-center">
                                    {/* Pinned Messages - icon only on mobile */}
                                    {pinnedMessages.length > 0 && (
                                        <button
                                            onClick={() =>
                                                setShowPinnedMessages(
                                                    !showPinnedMessages,
                                                )
                                            }
                                            className={`p-2.5 rounded-xl flex items-center gap-1 transition-colors ${
                                                showPinnedMessages
                                                    ? "bg-amber-500/20 text-amber-400"
                                                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
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

                                    {/* Moderation - admin only, hidden on small mobile */}
                                    {isAdmin && (
                                        <button
                                            onClick={() =>
                                                setShowModerationPanel(true)
                                            }
                                            className="hidden sm:flex p-2.5 rounded-xl text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 transition-colors"
                                            aria-label="Moderation panel"
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
                                                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                                                />
                                            </svg>
                                        </button>
                                    )}

                                    {/* Notification Toggle - hidden on small mobile */}
                                    {isMember && membership && (
                                        <button
                                            onClick={toggleNotifications}
                                            className={`hidden sm:flex p-2.5 rounded-xl transition-colors ${
                                                membership.notifications_muted
                                                    ? "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                                                    : "text-[#FF5500] bg-[#FF5500]/10"
                                            }`}
                                            aria-label={
                                                membership.notifications_muted
                                                    ? "Enable notifications"
                                                    : "Mute notifications"
                                            }
                                        >
                                            <svg
                                                className="w-5 h-5"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                {membership.notifications_muted ? (
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                                                    />
                                                ) : (
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                                    />
                                                )}
                                            </svg>
                                        </button>
                                    )}

                                    {/* Settings Menu - contains all actions on mobile */}
                                    {isMember && (
                                        <div className="relative">
                                            <button
                                                onClick={() =>
                                                    setShowSettings(
                                                        !showSettings,
                                                    )
                                                }
                                                className="p-2.5 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white -mr-1"
                                                aria-label="More options"
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
                                                        className="absolute right-0 top-full mt-1 w-56 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-10"
                                                    >
                                                        {/* Change Global Chat Icon - for admins only */}
                                                        {isAdmin && (
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
                                                                        <div className="w-4 h-4 border-2 border-zinc-400 border-t-white rounded-full animate-spin" />
                                                                    ) : (
                                                                        <svg
                                                                            className="w-4 h-4 text-zinc-400"
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
                                                                    {globalChatIcon
                                                                        ? "Change Chat Icon"
                                                                        : "Upload Chat Icon"}
                                                                </button>
                                                                {globalChatIcon && (
                                                                    <button
                                                                        onClick={() => {
                                                                            handleRemoveGlobalIcon();
                                                                            setShowSettings(
                                                                                false,
                                                                            );
                                                                        }}
                                                                        disabled={
                                                                            isUploadingIcon
                                                                        }
                                                                        className="w-full px-4 py-3 text-left text-sm text-zinc-400 hover:bg-zinc-700 transition-colors flex items-center gap-3 disabled:opacity-50"
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
                                                                                strokeWidth={
                                                                                    2
                                                                                }
                                                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                                            />
                                                                        </svg>
                                                                        Remove
                                                                        Custom
                                                                        Icon
                                                                    </button>
                                                                )}
                                                                <div className="border-t border-zinc-700" />
                                                                <input
                                                                    ref={
                                                                        iconFileInputRef
                                                                    }
                                                                    type="file"
                                                                    accept="image/jpeg,image/png,image/gif,image/webp"
                                                                    onChange={
                                                                        handleGlobalIconUpload
                                                                    }
                                                                    className="hidden"
                                                                />
                                                            </>
                                                        )}
                                                        {/* Room Rules - admin/moderator only */}
                                                        {(isAdmin ||
                                                            moderation
                                                                .permissions
                                                                .isModerator ||
                                                            moderation
                                                                .permissions
                                                                .isAdmin) && (
                                                            <button
                                                                onClick={() => {
                                                                    setShowSettings(
                                                                        false,
                                                                    );
                                                                    setShowRulesPanel(
                                                                        true,
                                                                    );
                                                                }}
                                                                className="w-full px-4 py-3 text-left text-sm text-white hover:bg-zinc-700 transition-colors flex items-center gap-2"
                                                            >
                                                                <svg
                                                                    className="w-4 h-4 text-zinc-400"
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
                                                                        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                                                                    />
                                                                </svg>
                                                                Room Rules
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                setShowSettings(
                                                                    false,
                                                                );
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
                                                                    strokeWidth={
                                                                        2
                                                                    }
                                                                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                                                />
                                                            </svg>
                                                            {isLeaving
                                                                ? "Leaving..."
                                                                : "Leave Channel"}
                                                        </button>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    )}

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

                            <MessageSearch
                                isOpen={showSearch}
                                onClose={() => setShowSearch(false)}
                                onSelectMessage={handleSelectSearchMessage}
                                messages={alphaSearchMessages}
                                userAddress={userAddress}
                                peerName="Global Chat"
                            />

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
                                            Connect with the Spritz community!
                                            Get updates, share ideas, and meet
                                            other users.
                                        </p>
                                        <button
                                            onClick={handleJoin}
                                            disabled={isJoining}
                                            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                                        >
                                            {isJoining
                                                ? "Joining..."
                                                : "Join Channel"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Messages */}
                            {isMember && (
                                <>
                                    {/* Active Polls - shown at top when polls exist */}
                                    {visiblePolls.length > 0 && (
                                        <div className="border-b border-zinc-800 p-3 space-y-2 max-h-[200px] overflow-y-auto overscroll-contain">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                                                    Active Polls
                                                </span>
                                                <span className="text-xs text-zinc-600">
                                                    {visiblePolls.length} poll
                                                    {visiblePolls.length !== 1
                                                        ? "s"
                                                        : ""}
                                                </span>
                                            </div>
                                            {visiblePolls
                                                .slice(0, 2)
                                                .map((poll) => (
                                                    <PollDisplay
                                                        key={poll.id}
                                                        poll={poll}
                                                        onVote={(optionIndex) =>
                                                            vote(
                                                                poll.id,
                                                                optionIndex,
                                                            )
                                                        }
                                                        compact
                                                        canManage={isAdmin}
                                                        onEdit={(p) =>
                                                            setEditingPoll(p)
                                                        }
                                                        onDelete={async (p) => {
                                                            await deletePoll(
                                                                p.id,
                                                            );
                                                            setEditingPoll(
                                                                null,
                                                            );
                                                        }}
                                                        onHide={(pollId) => {
                                                            setHiddenPollIds(
                                                                (prev) => {
                                                                    const next =
                                                                        [
                                                                            ...prev,
                                                                            pollId,
                                                                        ];
                                                                    try {
                                                                        window.localStorage.setItem(
                                                                            HIDDEN_POLLS_KEY,
                                                                            JSON.stringify(
                                                                                next,
                                                                            ),
                                                                        );
                                                                    } catch {}
                                                                    return next;
                                                                },
                                                            );
                                                        }}
                                                    />
                                                ))}
                                            {visiblePolls.length > 2 && (
                                                <button
                                                    type="button"
                                                    className="w-full text-center text-xs text-purple-400 hover:text-purple-300 py-2"
                                                >
                                                    View all{" "}
                                                    {visiblePolls.length} polls
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
                                                await updatePoll(
                                                    editingPoll.id,
                                                    updates,
                                                );
                                                setEditingPoll(null);
                                            }
                                        }}
                                    />
                                    {/* Pinned Messages Panel */}
                                    <AnimatePresence>
                                        {showPinnedMessages &&
                                            pinnedMessages.length > 0 && (
                                                <motion.div
                                                    initial={{
                                                        height: 0,
                                                        opacity: 0,
                                                    }}
                                                    animate={{
                                                        height: "auto",
                                                        opacity: 1,
                                                    }}
                                                    exit={{
                                                        height: 0,
                                                        opacity: 0,
                                                    }}
                                                    className="border-b border-zinc-800 overflow-hidden"
                                                >
                                                    <div className="p-4 bg-zinc-900/50 max-h-60 overflow-y-auto">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <span className="text-sm font-medium text-amber-400 flex items-center gap-2">
                                                                <svg
                                                                    className="w-4 h-4"
                                                                    fill="currentColor"
                                                                    viewBox="0 0 24 24"
                                                                >
                                                                    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                                                                </svg>
                                                                Pinned Messages
                                                            </span>
                                                            <button
                                                                onClick={() =>
                                                                    setShowPinnedMessages(
                                                                        false,
                                                                    )
                                                                }
                                                                className="text-zinc-500 hover:text-white"
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
                                                                        strokeWidth={
                                                                            2
                                                                        }
                                                                        d="M6 18L18 6M6 6l12 12"
                                                                    />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {pinnedMessages.map(
                                                                (msg) => (
                                                                    <div
                                                                        key={
                                                                            msg.id
                                                                        }
                                                                        className="bg-zinc-800/50 rounded-lg p-3 flex items-start gap-3"
                                                                    >
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className="text-xs text-orange-400 font-medium mb-1">
                                                                                {formatSender(
                                                                                    msg.sender_address,
                                                                                )}
                                                                            </p>
                                                                            <p className="text-sm text-white break-words line-clamp-2">
                                                                                {msg.content.startsWith(
                                                                                    "[PIXEL_ART]",
                                                                                )
                                                                                    ? "🎨 Pixel Art"
                                                                                    : msg.content.startsWith(
                                                                                            "[GIF]",
                                                                                        )
                                                                                      ? "🎬 GIF"
                                                                                      : msg.content.startsWith(
                                                                                              "[IMAGE]",
                                                                                          )
                                                                                        ? "📷 Photo"
                                                                                        : msg.content.startsWith(
                                                                                                "[LOCATION]",
                                                                                            )
                                                                                          ? "📍 Location"
                                                                                          : msg.content}
                                                                            </p>
                                                                        </div>
                                                                        {isAdmin && (
                                                                            <button
                                                                                onClick={() =>
                                                                                    handlePinMessage(
                                                                                        msg.id,
                                                                                        true,
                                                                                    )
                                                                                }
                                                                                disabled={
                                                                                    pinningMessage ===
                                                                                    msg.id
                                                                                }
                                                                                className="text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0"
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
                                                                ),
                                                            )}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                    </AnimatePresence>

                                    {/* Room Rules Banner */}
                                    <ChatRulesBanner
                                        chatType="alpha"
                                        chatId={null}
                                    />

                                    <div
                                        ref={messagesContainerRef}
                                        onScroll={handleScroll}
                                        role="log"
                                        aria-label="Chat messages"
                                        className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-4 flex flex-col-reverse ${
                                            isFullscreen ? "px-8" : ""
                                        }`}
                                    >
                                        {isLoading ? (
                                            <ChatSkeleton
                                                messageCount={6}
                                                className="p-4"
                                            />
                                        ) : messages.length === 0 ? (
                                            <ChatEmptyState
                                                icon="💬"
                                                title="No messages yet"
                                                subtitle="Be the first to say hello!"
                                            />
                                        ) : (
                                            <>
                                                {/* Messages container - content flows bottom to top with column-reverse */}
                                                <div className="space-y-3">
                                                    {messages
                                                        .filter(
                                                            (msg) =>
                                                                !msg.is_deleted,
                                                        ) // Hide deleted messages
                                                        .map(
                                                            (
                                                                msg,
                                                                msgIndex,
                                                                filteredMsgs,
                                                            ) => {
                                                                const isOwn =
                                                                    msg.sender_address.toLowerCase() ===
                                                                    userAddress.toLowerCase();
                                                                const isAgent =
                                                                    isAgentMessage(
                                                                        msg.sender_address,
                                                                    );
                                                                const isPixelArt =
                                                                    isPixelArtMessage(
                                                                        msg.content,
                                                                    );
                                                                const senderAvatar =
                                                                    getSenderAvatar(
                                                                        msg.sender_address,
                                                                    );
                                                                const senderAvatarEmoji =
                                                                    getSenderAvatarEmoji(
                                                                        msg.sender_address,
                                                                    );
                                                                const isSenderMuted =
                                                                    !isAgent &&
                                                                    moderation.isUserMuted(
                                                                        msg.sender_address,
                                                                    );
                                                                // Only show user popup on the FIRST message from this sender to avoid duplicates
                                                                const isFirstMessageFromSender =
                                                                    messages.findIndex(
                                                                        (m) =>
                                                                            m.sender_address.toLowerCase() ===
                                                                            msg.sender_address.toLowerCase(),
                                                                    ) ===
                                                                    msgIndex;

                                                                // Check if we need a date divider
                                                                const msgDate =
                                                                    new Date(
                                                                        msg.created_at,
                                                                    );
                                                                const prevMsg =
                                                                    msgIndex > 0
                                                                        ? filteredMsgs[
                                                                              msgIndex -
                                                                                  1
                                                                          ]
                                                                        : null;
                                                                const prevMsgDate =
                                                                    prevMsg
                                                                        ? new Date(
                                                                              prevMsg.created_at,
                                                                          )
                                                                        : null;
                                                                const showDateDivider =
                                                                    !prevMsgDate ||
                                                                    msgDate.toDateString() !==
                                                                        prevMsgDate.toDateString();

                                                                return (
                                                                    <div
                                                                        key={
                                                                            msg.id
                                                                        }
                                                                        data-message-id={
                                                                            msg.id
                                                                        }
                                                                    >
                                                                        {showDateDivider && (
                                                                            <DateDivider
                                                                                date={
                                                                                    msgDate
                                                                                }
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
                                                                                                    e,
                                                                                                ) =>
                                                                                                    handleUserClick(
                                                                                                        msg.sender_address,
                                                                                                        e,
                                                                                                    )
                                                                                                }
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
                                                                                                        {formatSender(
                                                                                                            msg.sender_address,
                                                                                                        )
                                                                                                            .slice(
                                                                                                                0,
                                                                                                                2,
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
                                                                                </div>
                                                                            )}

                                                                            <div
                                                                                data-message-bubble
                                                                                onClick={() => {
                                                                                    setSelectedMessage(
                                                                                        selectedMessage ===
                                                                                            msg.id
                                                                                            ? null
                                                                                            : msg.id,
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
                                                                                                  canDelete:
                                                                                                      isOwn ||
                                                                                                      moderation
                                                                                                          .permissions
                                                                                                          .canDelete,
                                                                                                  isPinned:
                                                                                                      msg.is_pinned,
                                                                                                  hasMedia:
                                                                                                      isPixelArt,
                                                                                                  isPixelArt,
                                                                                                  mediaUrl:
                                                                                                      isPixelArt
                                                                                                          ? getPixelArtUrl(
                                                                                                                msg.content,
                                                                                                            )
                                                                                                          : undefined,
                                                                                              },
                                                                                    );
                                                                                }}
                                                                                className={`${
                                                                                    isFullscreen
                                                                                        ? "max-w-[90%]"
                                                                                        : "max-w-[75%]"
                                                                                } rounded-2xl px-4 py-2.5 relative cursor-pointer min-w-0 overflow-hidden ${
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
                                                                                                        .sender_address,
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
                                                                                            {msg.reply_to.content.startsWith(
                                                                                                "[PIXEL_ART]",
                                                                                            )
                                                                                                ? "🎨 Pixel Art"
                                                                                                : msg.reply_to.content.startsWith(
                                                                                                        "[GIF]",
                                                                                                    )
                                                                                                  ? "🎬 GIF"
                                                                                                  : msg.reply_to.content.startsWith(
                                                                                                          "[IMAGE]",
                                                                                                      )
                                                                                                    ? "📷 Photo"
                                                                                                    : msg.reply_to.content.startsWith(
                                                                                                            "[LOCATION]",
                                                                                                        )
                                                                                                      ? "📍 Location"
                                                                                                      : msg
                                                                                                            .reply_to
                                                                                                            .content}
                                                                                        </p>
                                                                                    </div>
                                                                                )}

                                                                                {!isOwn &&
                                                                                    (isAgent ? (
                                                                                        // Agent sender - not clickable, with AI badge
                                                                                        <div className="flex items-center gap-1.5 mb-1">
                                                                                            <span className="text-xs text-purple-300 font-medium">
                                                                                                {formatSender(
                                                                                                    msg.sender_address,
                                                                                                )}
                                                                                            </span>
                                                                                            <span className="text-[9px] px-1 py-0.5 bg-purple-500/30 text-purple-300 rounded font-medium">
                                                                                                AI
                                                                                            </span>
                                                                                        </div>
                                                                                    ) : (
                                                                                        // User sender - clickable
                                                                                        <button
                                                                                            onClick={(
                                                                                                e,
                                                                                            ) => {
                                                                                                e.stopPropagation();
                                                                                                handleUserClick(
                                                                                                    msg.sender_address,
                                                                                                    e,
                                                                                                );
                                                                                            }}
                                                                                            className="text-xs text-orange-300 mb-1 font-medium hover:text-orange-200 transition-colors"
                                                                                        >
                                                                                            {formatSender(
                                                                                                msg.sender_address,
                                                                                            )}
                                                                                        </button>
                                                                                    ))}
                                                                                {isPixelArt ? (
                                                                                    <div className="relative group">
                                                                                        <PixelArtImage
                                                                                            src={getPixelArtUrl(
                                                                                                msg.content,
                                                                                            )}
                                                                                            size="md"
                                                                                        />
                                                                                        {/* Quick Share Actions - visible on hover (desktop) or tap (mobile) */}
                                                                                        <div
                                                                                            className={`absolute top-1 right-1 transition-opacity ${
                                                                                                selectedMessage ===
                                                                                                msg.id
                                                                                                    ? "opacity-100"
                                                                                                    : "opacity-0 group-hover:opacity-100"
                                                                                            }`}
                                                                                            onClick={(
                                                                                                e,
                                                                                            ) =>
                                                                                                e.stopPropagation()
                                                                                            }
                                                                                        >
                                                                                            <PixelArtShare
                                                                                                imageUrl={getPixelArtUrl(
                                                                                                    msg.content,
                                                                                                )}
                                                                                                showQuickActions
                                                                                            />
                                                                                        </div>
                                                                                    </div>
                                                                                ) : isAgent ? (
                                                                                    // Agent messages - rich markdown with copy button
                                                                                    <AgentMessageWrapper
                                                                                        content={
                                                                                            msg.content
                                                                                        }
                                                                                        theme="channel"
                                                                                    >
                                                                                        <AgentMarkdown
                                                                                            content={
                                                                                                msg.content
                                                                                            }
                                                                                            theme="channel"
                                                                                        />
                                                                                    </AgentMessageWrapper>
                                                                                ) : isGifMessage(
                                                                                      msg.content,
                                                                                  ) ? (
                                                                                    <div className="relative max-w-[280px] rounded-xl overflow-hidden">
                                                                                        <img
                                                                                            src={getGifUrl(
                                                                                                msg.content,
                                                                                            )}
                                                                                            alt="GIF"
                                                                                            className="w-full h-auto rounded-xl"
                                                                                            loading="lazy"
                                                                                        />
                                                                                    </div>
                                                                                ) : isImageMessage(
                                                                                      msg.content,
                                                                                  ) ? (
                                                                                    <div className="relative max-w-[320px] rounded-xl overflow-hidden">
                                                                                        <a
                                                                                            href={getImageUrl(
                                                                                                msg.content,
                                                                                            )}
                                                                                            target="_blank"
                                                                                            rel="noopener noreferrer"
                                                                                            onClick={(
                                                                                                e,
                                                                                            ) =>
                                                                                                e.stopPropagation()
                                                                                            }
                                                                                        >
                                                                                            <img
                                                                                                src={getImageUrl(
                                                                                                    msg.content,
                                                                                                )}
                                                                                                alt="Shared image"
                                                                                                className="w-full h-auto rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                                                                                                loading="lazy"
                                                                                            />
                                                                                        </a>
                                                                                    </div>
                                                                                ) : isLocationMessage(
                                                                                      msg.content,
                                                                                  ) ? (
                                                                                    <LocationMessage
                                                                                        location={
                                                                                            parseLocationMessage(
                                                                                                msg.content,
                                                                                            )!
                                                                                        }
                                                                                        isOwn={
                                                                                            isOwn
                                                                                        }
                                                                                    />
                                                                                ) : hasMarkdown(
                                                                                      msg.content,
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
                                                                                            className={`break-words ${
                                                                                                isEmojiOnly(
                                                                                                    msg.content,
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
                                                                                            msg.content,
                                                                                        )
                                                                                            .slice(
                                                                                                0,
                                                                                                1,
                                                                                            )
                                                                                            .map(
                                                                                                (
                                                                                                    url,
                                                                                                ) => (
                                                                                                    <LinkPreview
                                                                                                        key={
                                                                                                            url
                                                                                                        }
                                                                                                        url={
                                                                                                            url
                                                                                                        }
                                                                                                    />
                                                                                                ),
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
                                                                                        emoji,
                                                                                    ) =>
                                                                                        handleReaction(
                                                                                            msg.id,
                                                                                            emoji,
                                                                                        )
                                                                                    }
                                                                                    isOwnMessage={
                                                                                        isOwn
                                                                                    }
                                                                                />

                                                                                <div
                                                                                    className={`flex items-center gap-1.5 text-xs mt-1 ${
                                                                                        isOwn
                                                                                            ? "text-white/70"
                                                                                            : "text-zinc-500"
                                                                                    }`}
                                                                                >
                                                                                    {msg.is_pinned && (
                                                                                        <span
                                                                                            className="text-amber-400 flex items-center gap-0.5"
                                                                                            title="Pinned"
                                                                                        >
                                                                                            <svg
                                                                                                className="w-3 h-3"
                                                                                                fill="currentColor"
                                                                                                viewBox="0 0 24 24"
                                                                                            >
                                                                                                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                                                                                            </svg>
                                                                                        </span>
                                                                                    )}
                                                                                    <span>
                                                                                        {formatTimeInTimezone(
                                                                                            new Date(
                                                                                                msg.created_at,
                                                                                            ),
                                                                                            userTimezone,
                                                                                        )}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </motion.div>
                                                                    </div>
                                                                );
                                                            },
                                                        )}
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
                                                                Scroll up to
                                                                load more
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
                                                              replyingTo.sender_address,
                                                          )}
                                                </p>
                                                <p className="text-xs text-zinc-400 truncate">
                                                    {replyingTo.content.startsWith(
                                                        "[PIXEL_ART]",
                                                    )
                                                        ? "🎨 Pixel Art"
                                                        : replyingTo.content.startsWith(
                                                                "[GIF]",
                                                            )
                                                          ? "🎬 GIF"
                                                          : replyingTo.content.startsWith(
                                                                  "[IMAGE]",
                                                              )
                                                            ? "📷 Photo"
                                                            : replyingTo.content.startsWith(
                                                                    "[LOCATION]",
                                                                )
                                                              ? "📍 Location"
                                                              : replyingTo.content}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() =>
                                                    setReplyingTo(null)
                                                }
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
                                                    agentAvatarUrl={
                                                        agent.avatarUrl
                                                    }
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
                                                        u.name ||
                                                        `${u.address.slice(
                                                            0,
                                                            6,
                                                        )}...`,
                                                )}
                                                className="border-t border-zinc-800/50"
                                            />
                                        )}
                                    </AnimatePresence>

                                    {/* Input */}
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
                                        <div
                                            className={`flex items-center ${
                                                isFullscreen ? "gap-3" : "gap-2"
                                            }`}
                                        >
                                            {/* Hidden file input for admin image uploads */}
                                            <input
                                                ref={imageFileInputRef}
                                                type="file"
                                                accept="image/jpeg,image/png,image/gif,image/webp"
                                                onChange={handleImageSelect}
                                                className="hidden"
                                            />
                                            {/* Consolidated attachment menu */}
                                            <ChatAttachmentMenu
                                                onImageUpload={
                                                    isAdmin
                                                        ? () =>
                                                              imageFileInputRef.current?.click()
                                                        : undefined
                                                }
                                                onPixelArt={() =>
                                                    setShowPixelArt(true)
                                                }
                                                onGif={handleSendGif}
                                                onLocation={async (
                                                    location: LocationData,
                                                ) => {
                                                    const ruleViolation = validateMessageClientSide(chatRules, "", "location", isModeratorForRules);
                                                    if (ruleViolation) {
                                                        toast.error(ruleViolation);
                                                        return;
                                                    }
                                                    const locationMsg =
                                                        formatLocationMessage(
                                                            location,
                                                        );
                                                    await alphaChat.sendMessage(
                                                        locationMsg,
                                                        "text",
                                                    );
                                                }}
                                                onPoll={
                                                    canCreatePoll
                                                        ? () =>
                                                              setShowPollCreator(
                                                                  true,
                                                              )
                                                        : undefined
                                                }
                                                showPoll={canCreatePoll}
                                                showLocation={true}
                                                isUploading={
                                                    isUploadingPixelArt ||
                                                    isUploadingImage
                                                }
                                                disabled={isCurrentUserMuted}
                                                chatRules={chatRules}
                                                isModerator={isAdmin || moderation.permissions.isModerator}
                                            />
                                            {isCurrentUserMuted ? (
                                                <div
                                                    className={`flex-1 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 flex items-center justify-center gap-2 ${
                                                        isFullscreen
                                                            ? "py-4 px-5"
                                                            : "py-3 px-4"
                                                    }`}
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
                                                            d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                                        />
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                                                        />
                                                    </svg>
                                                    <span className="text-sm">
                                                        You are muted from this
                                                        chat
                                                    </span>
                                                </div>
                                            ) : (
                                                <MentionInput
                                                    inputRef={inputRef}
                                                    value={newMessage}
                                                    onChange={(val) => {
                                                        if (val.length > 10000)
                                                            return;
                                                        setNewMessage(val);
                                                        saveDraft(
                                                            val,
                                                            replyingTo?.id,
                                                            replyingTo
                                                                ? replyingTo.content?.slice(
                                                                      0,
                                                                      80,
                                                                  )
                                                                : undefined,
                                                        );
                                                        if (val.trim())
                                                            setTyping();
                                                    }}
                                                    onSubmit={handleSend}
                                                    placeholder={
                                                        replyingTo
                                                            ? "Type your reply..."
                                                            : "Message the community..."
                                                    }
                                                    users={mentionableUsers}
                                                    className={`w-full bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20 transition-all ${
                                                        isFullscreen
                                                            ? "py-4 px-5 text-lg"
                                                            : "py-3 px-4"
                                                    }`}
                                                />
                                            )}
                                            <button
                                                onClick={handleSend}
                                                disabled={
                                                    !newMessage.trim() ||
                                                    isSending ||
                                                    isCurrentUserMuted
                                                }
                                                className={`rounded-xl bg-[#FF5500] hover:bg-[#E04D00] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                                    isFullscreen ? "p-4" : "p-3"
                                                }`}
                                            >
                                                {isSending ? (
                                                    <svg
                                                        className={`${
                                                            isFullscreen
                                                                ? "w-6 h-6"
                                                                : "w-5 h-5"
                                                        } animate-spin`}
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
                                                        className={
                                                            isFullscreen
                                                                ? "w-6 h-6"
                                                                : "w-5 h-5"
                                                        }
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
                                        {newMessage.length > 500 && (
                                            <p className="mt-1.5 text-right text-xs text-zinc-500">
                                                {newMessage.length.toLocaleString()}{" "}
                                                / 10,000
                                            </p>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>

                    {/* Scroll to bottom FAB */}
                    <ScrollToBottom
                        containerRef={messagesContainerRef}
                        unreadCount={newMessageCount}
                        onScrollToBottom={resetUnreadCount}
                    />

                    {/* Pixel Art Editor */}
                    <PixelArtEditor
                        isOpen={showPixelArt}
                        onClose={() => setShowPixelArt(false)}
                        onSend={handleSendPixelArt}
                        isSending={isUploadingPixelArt}
                    />

                    {/* Moderation Panel */}
                    <ModerationPanel
                        isOpen={showModerationPanel}
                        onClose={() => setShowModerationPanel(false)}
                        userAddress={userAddress}
                        channelId={null}
                        channelName="Spritz Global Chat"
                        getUserInfo={getUserInfo}
                    />

                    <PollCreator
                        isOpen={showPollCreator}
                        onClose={() => setShowPollCreator(false)}
                        onCreatePoll={async (
                            question,
                            options,
                            allowsMultiple,
                            endsAt,
                            isAnonymous,
                        ) => {
                            await createPoll(
                                question,
                                options,
                                allowsMultiple,
                                endsAt,
                                isAnonymous,
                            );
                        }}
                    />

                    {/* User Popup - Fixed position near click */}
                    {selectedUser && userPopupPosition && (
                        <div
                            ref={userPopupRef}
                            className="fixed z-[100] bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl p-3 min-w-[220px] max-w-[280px]"
                            style={{
                                left: Math.min(
                                    userPopupPosition.x,
                                    window.innerWidth - 290,
                                ),
                                top: userPopupPosition.y,
                            }}
                        >
                            {(() => {
                                const userInfo = getUserInfo?.(selectedUser);
                                const isAlreadyFriend =
                                    isFriend?.(selectedUser) ?? false;
                                const isMuted =
                                    moderation.isUserMuted(selectedUser);
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
                                                            6,
                                                        )}...${selectedUser.slice(
                                                            -4,
                                                        )}`}
                                                </p>
                                                <p className="text-zinc-500 text-xs truncate font-mono">
                                                    {selectedUser.slice(0, 10)}
                                                    ...{selectedUser.slice(-6)}
                                                </p>
                                            </div>
                                        </div>

                                        {onAddFriend &&
                                            (isAlreadyFriend ? (
                                                <>
                                                    {onOpenDM && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                onOpenDM(
                                                                    selectedUser,
                                                                );
                                                                setSelectedUser(
                                                                    null,
                                                                );
                                                            }}
                                                            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors mb-2"
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
                                                                    strokeWidth={
                                                                        2
                                                                    }
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
                                                <button
                                                    onClick={() =>
                                                        handleAddFriend(
                                                            selectedUser,
                                                        )
                                                    }
                                                    disabled={isAddingFriend}
                                                    className="w-full flex items-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                                >
                                                    {isAddingFriend ? (
                                                        <div className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
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
                                                                strokeWidth={2}
                                                                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                                                            />
                                                        </svg>
                                                    )}
                                                    Add Friend
                                                </button>
                                            ))}

                                        {moderation.permissions.canMute &&
                                            (isMuted ? (
                                                <button
                                                    onClick={async () => {
                                                        await moderation.unmuteUser(
                                                            selectedUser,
                                                        );
                                                        setSelectedUser(null);
                                                    }}
                                                    className="w-full flex items-center gap-2 px-3 py-2 mt-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-sm transition-colors"
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
                                                            d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                                        />
                                                    </svg>
                                                    Unmute User
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        setMuteTarget({
                                                            address:
                                                                selectedUser,
                                                            name:
                                                                userInfo?.name ||
                                                                selectedUser.slice(
                                                                    0,
                                                                    10,
                                                                ),
                                                        });
                                                        setSelectedUser(null);
                                                    }}
                                                    className="w-full flex items-center gap-2 px-3 py-2 mt-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm transition-colors"
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
                                                            d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                                                        />
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                                                        />
                                                    </svg>
                                                    Mute User
                                                </button>
                                            ))}

                                        {/* Ban from room */}
                                        {(moderation.permissions.canMute ||
                                            moderation.permissions.isAdmin) &&
                                            selectedUser.toLowerCase() !==
                                                userAddress?.toLowerCase() && (
                                                <button
                                                    onClick={async () => {
                                                        setBanningUser(
                                                            selectedUser,
                                                        );
                                                        await roomBans.banUser(
                                                            selectedUser,
                                                            {
                                                                reason: "Banned by moderator",
                                                            },
                                                        );
                                                        setBanningUser(null);
                                                        setSelectedUser(null);
                                                    }}
                                                    disabled={
                                                        banningUser ===
                                                        selectedUser
                                                    }
                                                    className="w-full flex items-center gap-2 px-3 py-2 mt-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm transition-colors disabled:opacity-50"
                                                >
                                                    {banningUser ===
                                                    selectedUser ? (
                                                        <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
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
                                                                strokeWidth={2}
                                                                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                                                            />
                                                        </svg>
                                                    )}
                                                    Ban from Chat
                                                </button>
                                            )}

                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(
                                                    selectedUser,
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
                        </div>
                    )}

                    {/* Quick Mute Dialog */}
                    {muteTarget && (
                        <QuickMuteDialog
                            isOpen={!!muteTarget}
                            onClose={() => setMuteTarget(null)}
                            targetAddress={muteTarget.address}
                            targetName={muteTarget.name}
                            onMute={handleMuteUser}
                        />
                    )}

                    {/* Message Action Bar - keep after ScrollToBottom so FAB is above */}
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
                                      alphaChat.toggleReaction(
                                          selectedMessageConfig.messageId,
                                          emoji,
                                      )
                                : undefined,
                            onReply: selectedMessageConfig
                                ? () => {
                                      const msg = messages.find(
                                          (m) =>
                                              m.id ===
                                              selectedMessageConfig.messageId,
                                      );
                                      if (msg) alphaChat.setReplyingTo(msg);
                                  }
                                : undefined,
                            onCopy: () => {},
                            onPin:
                                selectedMessageConfig?.isPinned === false
                                    ? () =>
                                          handlePinMessage(
                                              selectedMessageConfig?.messageId ||
                                                  "",
                                              false,
                                          )
                                    : undefined,
                            onUnpin: selectedMessageConfig?.isPinned
                                ? () =>
                                      handlePinMessage(
                                          selectedMessageConfig?.messageId ||
                                              "",
                                          true,
                                      )
                                : undefined,
                            onDelete:
                                selectedMessageConfig?.isOwn ||
                                moderation.permissions.canDelete
                                    ? () =>
                                          handleDeleteMessage(
                                              selectedMessageConfig?.messageId ||
                                                  "",
                                          )
                                    : undefined,
                        }}
                        reactions={ALPHA_REACTION_EMOJIS}
                    />

                    {/* Members List Panel */}
                    <ChatMembersList
                        channelId="global"
                        isGlobal={true}
                        isOpen={showMembersList}
                        onClose={() => setShowMembersList(false)}
                        onUserClick={(address) => {
                            setSelectedUser(address);
                            setShowMembersList(false);
                        }}
                        getUserInfo={getUserInfo}
                        currentUserAddress={userAddress}
                    />
                </>
            )}

            {/* Room Rules Panel */}
            <ChatRulesPanel
                isOpen={showRulesPanel}
                onClose={() => setShowRulesPanel(false)}
                chatType="alpha"
                chatName="Spritz Global Chat"
            />
        </AnimatePresence>
    );
}
