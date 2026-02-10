"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { type Address } from "viem";
import {
    useXMTPContext,
    type XMTPGroup,
    DECRYPTION_FAILED_MARKER,
} from "@/context/WakuProvider";
import { PixelArtEditor } from "./PixelArtEditor";
import { PixelArtImage } from "./PixelArtImage";
import { PixelArtShare } from "./PixelArtShare";
import {
    useMessageReactions,
    MESSAGE_REACTION_EMOJIS,
} from "@/hooks/useChatFeatures";
import { QuickReactionPicker, ReactionDisplay } from "./EmojiPicker";
import { MessageActionsSheet, ActionIcons } from "./MessageActionsSheet";
import { useENS, type ENSResolution } from "@/hooks/useENS";
import { MentionInput, type MentionUser } from "./MentionInput";
import { MentionText } from "./MentionText";
import { ChatMarkdown, hasMarkdown } from "./ChatMarkdown";
import { LinkPreview, detectUrls } from "./LinkPreview";
import { ChatAttachmentMenu } from "./ChatAttachmentMenu";
import { ChatRulesPanel, ChatRulesBanner } from "./ChatRulesPanel";
import { useChatRules, useRoomBans } from "@/hooks/useChatRules";
import { validateMessageClientSide } from "@/lib/clientChatRules";
import { toast } from "sonner";
import { useRoleBadges, RoleBadgeTag } from "@/hooks/useRoleBadges";
import {
    LocationMessage,
    isLocationMessage,
    parseLocationMessage,
    formatLocationMessage,
    type LocationData,
} from "./LocationMessage";
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
import { MessageSearch } from "./MessageSearch";
import { PollCreator } from "./PollCreator";
import { PollDisplay, type DisplayPoll } from "./PollDisplay";
import { PollEditModal } from "./PollEditModal";
import { useGroupPolls } from "@/hooks/useGroupPolls";
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

type Friend = {
    id: string;
    address: Address;
    ensName: string | null;
    avatar: string | null;
    nickname: string | null;
    reachUsername: string | null;
};

interface GroupChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string; // Can be EVM or Solana address
    group: XMTPGroup | null;
    friends?: Friend[];
    onGroupDeleted?: () => void;
    onStartCall?: (
        groupId: string,
        groupName: string,
        isVideo: boolean,
    ) => void;
    hasActiveCall?: boolean;
    // For displaying usernames/avatars
    getUserInfo?: (address: string) => {
        name: string | null;
        avatar: string | null;
    } | null;
    // Check if already a friend (Message button only shown for friends)
    isFriend?: (address: string) => boolean;
    // Open DM with a user (e.g. when "Message" is clicked on a member; only shown when isFriend)
    onOpenDM?: (address: string) => void;
    // Callback when message is sent (for updating chat order)
    onMessageSent?: () => void;
    // Callback when message is received (for updating chat order)
    onMessageReceived?: () => void;
    /** Admin/moderator can manage polls (edit, delete) */
    isAdmin?: boolean;
}

type Message = {
    id: string;
    content: string;
    senderInboxId: string;
    sentAt: Date;
};

type Member = {
    inboxId: string;
    addresses: string[];
};

export function GroupChatModal({
    isOpen,
    onClose,
    userAddress,
    group,
    friends = [],
    onGroupDeleted,
    onStartCall,
    onMessageSent,
    onMessageReceived,
    hasActiveCall = false,
    getUserInfo,
    isFriend,
    onOpenDM,
    isAdmin = false,
}: GroupChatModalProps) {
    const userTimezone = useUserTimezone();
    const [allMessages, setMessages] = useState<Message[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const { isBlocked: isUserBlocked } = useBlockedUsers(userAddress);
    const [newMessage, setNewMessage] = useState("");
    const draftAppliedRef = useRef(false);
    const [isSending, setIsSending] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showMembers, setShowMembers] = useState(false);
    const [showPixelArt, setShowPixelArt] = useState(false);
    const [showRulesPanel, setShowRulesPanel] = useState(false);
    const { rules: chatRules } = useChatRules("group", group?.id);
    const roomBans = useRoomBans("group", group?.id);
    const { getRoleBadge } = useRoleBadges();
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [userPopupPosition, setUserPopupPosition] = useState<{
        x: number;
        y: number;
    } | null>(null);
    const [banningUser, setBanningUser] = useState<string | null>(null);
    const [isUploadingPixelArt, setIsUploadingPixelArt] = useState(false);
    const [showAddMember, setShowAddMember] = useState(false);
    const [isAddingMember, setIsAddingMember] = useState(false);
    const [isLeavingGroup, setIsLeavingGroup] = useState(false);
    const [showManageMenu, setShowManageMenu] = useState(false);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [memberENSData, setMemberENSData] = useState<
        Map<string, ENSResolution>
    >(new Map());

    // Typing indicator for group chat
    const { typingUsers, setTyping, stopTyping } = useTypingIndicator(
        group?.id || null,
        "group",
        userAddress,
        getUserInfo?.(userAddress)?.name || undefined,
    );

    const { resolveAddresses } = useENS();
    const [showReactionPicker, setShowReactionPicker] = useState<string | null>(
        null,
    );
    const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
    const [selectedMessageConfig, setSelectedMessageConfig] =
        useState<MessageActionConfig | null>(null);
    const [showSearch, setShowSearch] = useState(false);
    const [showPollCreator, setShowPollCreator] = useState(false);
    const [showPinnedMessages, setShowPinnedMessages] = useState(false);
    const [pinnedList, setPinnedList] = useState<
        { messageId: string; pinnedBy: string; pinnedAt: string }[]
    >([]);
    const [pinningMessageId, setPinningMessageId] = useState<string | null>(
        null,
    );
    const [readReceipts, setReadReceipts] = useState<
        { userAddress: string; lastReadMessageId: string }[]
    >([]);
    const [isFullscreen, setIsFullscreen] = useState(true);
    const [onlineStatuses, setOnlineStatuses] = useState<
        Record<string, boolean>
    >({});
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Fetch online statuses for group members
    useEffect(() => {
        const memberAddresses = members
            .flatMap((m) => m.addresses)
            .map((a) => a.toLowerCase());
        if (memberAddresses.length === 0) return;

        fetchOnlineStatuses(memberAddresses).then((statuses) => {
            setOnlineStatuses(statuses);
        });
    }, [members]);
    const isInitialLoadRef = useRef(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamRef = useRef<any>(null);

    // Message reactions hook (using group.id as conversation_id)
    const {
        reactions: msgReactions,
        fetchReactions: fetchMsgReactions,
        toggleReaction: toggleMsgReaction,
    } = useMessageReactions(userAddress, group?.id || null);

    const {
        polls,
        canCreatePoll,
        fetchPolls,
        createPoll,
        vote,
        updatePoll,
        deletePoll,
    } = useGroupPolls(group?.id ?? null, userAddress);

    const groupHiddenPollsKey = group?.id
        ? `spritz_hidden_polls_group_${group.id}`
        : "";
    const [hiddenPollIds, setHiddenPollIds] = useState<string[]>([]);
    useEffect(() => {
        if (!group?.id || typeof window === "undefined") {
            setHiddenPollIds([]);
            return;
        }
        try {
            const stored = JSON.parse(
                window.localStorage.getItem(
                    `spritz_hidden_polls_group_${group.id}`,
                ) ?? "[]",
            );
            setHiddenPollIds(Array.isArray(stored) ? stored : []);
        } catch {
            setHiddenPollIds([]);
        }
    }, [group?.id]);
    const [editingPoll, setEditingPoll] = useState<DisplayPoll | null>(null);
    const visiblePolls = polls.filter((p) => !hiddenPollIds.includes(p.id));

    const {
        isInitialized,
        userInboxId,
        sendGroupMessage,
        getGroupMessages,
        streamGroupMessages,
        getGroupMembers,
        markGroupAsRead,
        addGroupMembers,
        removeGroupMember,
        leaveGroup,
    } = useXMTPContext();

    // Build list of mentionable users from group members
    const mentionableUsers: MentionUser[] = useMemo(() => {
        return members
            .filter((m) => m.inboxId !== userInboxId) // Exclude self
            .map((member) => {
                const address = member.addresses[0] || "";
                const info = getUserInfo?.(address);
                const ensData = memberENSData.get(address.toLowerCase());

                return {
                    address,
                    name: info?.name || ensData?.ensName || null,
                    avatar: info?.avatar || ensData?.avatar || null,
                };
            })
            .filter((u) => u.address); // Only include members with addresses
    }, [members, userInboxId, getUserInfo, memberENSData]);

    // Filter out messages from blocked users
    const messages = useMemo(() => {
        return allMessages.filter((msg) => {
            const senderAddress = members.find(
                (mem) => mem.inboxId === msg.senderInboxId,
            )?.addresses?.[0];
            return !senderAddress || !isUserBlocked(senderAddress);
        });
    }, [allMessages, members, isUserBlocked]);

    const groupSearchMessages = useMemo(
        () =>
            messages.map((m) => ({
                id: m.id,
                content: m.content,
                senderAddress:
                    members.find((mem) => mem.inboxId === m.senderInboxId)
                        ?.addresses?.[0] || m.senderInboxId,
                sentAt: m.sentAt,
            })),
        [messages, members],
    );

    const handleSelectSearchMessage = useCallback((messageId: string) => {
        setShowSearch(false);
        setTimeout(() => {
            document
                .querySelector(`[data-message-id="${messageId}"]`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
    }, []);

    const messageOrderMap = useMemo(() => {
        const sorted = [...messages].sort(
            (a, b) =>
                new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
        );
        const map: Record<string, number> = {};
        sorted.forEach((m, i) => {
            map[m.id] = i;
        });
        return map;
    }, [messages]);

    const fetchPinned = useCallback(async () => {
        if (!group?.id) return;
        try {
            const res = await fetch(
                `/api/groups/${encodeURIComponent(group.id)}/pin`,
            );
            const data = await res.json();
            if (res.ok && data.pinned) setPinnedList(data.pinned);
        } catch (e) {
            console.error("[GroupChat] Fetch pinned error:", e);
        }
    }, [group?.id]);

    const togglePin = useCallback(
        async (messageId: string, pin: boolean) => {
            if (!group?.id) return;
            setPinningMessageId(messageId);
            try {
                const res = await fetch(
                    `/api/groups/${encodeURIComponent(group.id)}/pin`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ messageId, pin }),
                    },
                );
                const data = await res.json();
                if (res.ok) {
                    if (pin) {
                        setPinnedList((prev) => [
                            {
                                messageId,
                                pinnedBy: data.pinnedBy ?? "",
                                pinnedAt: new Date().toISOString(),
                            },
                            ...prev,
                        ]);
                    } else {
                        setPinnedList((prev) =>
                            prev.filter((p) => p.messageId !== messageId),
                        );
                    }
                }
            } catch (e) {
                console.error("[GroupChat] Toggle pin error:", e);
            } finally {
                setPinningMessageId(null);
            }
        },
        [group?.id],
    );

    // Handle mention click
    const handleMentionClick = useCallback((address: string) => {
        // Could open a user profile or similar
        // Could open a user profile or similar
    }, []);

    // Auto-scroll on new messages (with column-reverse: scrollTop=0 is bottom)
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    // Draft messages persistence
    const { draft, saveDraft, clearDraft } = useDraftMessages(
        "group",
        group?.id || "",
        userAddress,
    );

    // Apply draft when modal opens
    useEffect(() => {
        if (!isOpen) {
            draftAppliedRef.current = false;
            return;
        }
        if (draft?.text && !draftAppliedRef.current && group?.id) {
            setNewMessage(draft.text);
            draftAppliedRef.current = true;
        }
    }, [isOpen, draft?.text, group?.id]);

    // Escape to close modal (or cancel reply first)
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (replyingTo) {
                setReplyingTo(null);
                return;
            }
            if (showManageMenu || showMembers || showAddMember) {
                setShowManageMenu(false);
                setShowMembers(false);
                setShowAddMember(false);
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
        showManageMenu,
        showMembers,
        showAddMember,
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

    // Scroll to bottom with unread badge
    const {
        newMessageCount,
        isAtBottom,
        onNewMessage,
        resetUnreadCount,
        scrollToBottom: scrollToBottomFn,
    } = useScrollToBottom(messagesContainerRef);

    useEffect(() => {
        if (messages.length > 0) {
            const container = messagesContainerRef.current;
            if (container) {
                if (isInitialLoadRef.current) {
                    container.scrollTop = 0; // Bottom with column-reverse
                    isInitialLoadRef.current = false;
                } else if (container.scrollTop < 300) {
                    // Smooth scroll for new messages if near bottom
                    container.scrollTop = 0;
                }
            }
        }
    }, [messages]);

    // Reset scroll state when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            isInitialLoadRef.current = true;
            // With column-reverse, scrollTop=0 is bottom (no scroll needed)
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

    // Fetch reactions for all messages
    useEffect(() => {
        const messageIds = messages.map((msg) => msg.id);
        if (messageIds.length > 0) {
            fetchMsgReactions(messageIds);
        }
    }, [messages, fetchMsgReactions]);

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

    // Load messages and members when modal opens
    useEffect(() => {
        if (!isOpen || !isInitialized || !group) return;

        const loadData = async () => {
            setIsLoading(true);
            setError(null);

            try {
                // Load messages
                const existingMessages = await getGroupMessages(group.id);
                const formattedMessages: Message[] = existingMessages
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .filter(
                        (msg: any) =>
                            typeof msg.content === "string" &&
                            msg.content.trim() !== "",
                    )
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map((msg: any) => ({
                        id: msg.id,
                        content: msg.content,
                        senderInboxId: msg.senderInboxId,
                        sentAt: new Date(Number(msg.sentAtNs) / 1000000),
                    }));
                setMessages(formattedMessages);

                // Load members
                const groupMembers = await getGroupMembers(group.id);
                setMembers(groupMembers);

                // Fetch pinned messages
                try {
                    const pinRes = await fetch(
                        `/api/groups/${encodeURIComponent(group.id)}/pin`,
                    );
                    const pinData = await pinRes.json();
                    if (pinRes.ok && pinData.pinned)
                        setPinnedList(pinData.pinned);
                } catch {
                    // ignore
                }

                // Fetch read receipts
                try {
                    const readRes = await fetch(
                        `/api/groups/${encodeURIComponent(group.id)}/read`,
                    );
                    const readData = await readRes.json();
                    if (readRes.ok && readData.receipts)
                        setReadReceipts(readData.receipts);
                } catch {
                    // ignore
                }

                fetchPolls();

                // Mark as read (post my last read message id = latest)
                markGroupAsRead(group.id);
                if (formattedMessages.length > 0) {
                    const sortedByTime = [...formattedMessages].sort(
                        (a, b) =>
                            new Date(a.sentAt).getTime() -
                            new Date(b.sentAt).getTime(),
                    );
                    const latestId = sortedByTime[sortedByTime.length - 1]?.id;
                    if (latestId) {
                        fetch(
                            `/api/groups/${encodeURIComponent(group.id)}/read`,
                            {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ messageId: latestId }),
                            },
                        ).catch(() => {});
                    }
                }

                // Start streaming
                const stream = await streamGroupMessages(
                    group.id,
                    (message: unknown) => {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const msg = message as any;
                        if (
                            typeof msg.content !== "string" ||
                            msg.content.trim() === ""
                        )
                            return;

                        const newMsg: Message = {
                            id: msg.id,
                            content: msg.content,
                            senderInboxId: msg.senderInboxId,
                            sentAt: new Date(Number(msg.sentAtNs) / 1000000),
                        };
                        setMessages((prev) => {
                            if (prev.some((m) => m.id === newMsg.id))
                                return prev;
                            // Notify parent of new message (for sort order)
                            onMessageReceived?.();
                            // Post my last read (new message id)
                            fetch(
                                `/api/groups/${encodeURIComponent(
                                    group.id,
                                )}/read`,
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                        messageId: newMsg.id,
                                    }),
                                },
                            )
                                .then(() => {
                                    fetch(
                                        `/api/groups/${encodeURIComponent(
                                            group.id,
                                        )}/read`,
                                    )
                                        .then((r) => r.json())
                                        .then(
                                            (d) =>
                                                d.receipts &&
                                                setReadReceipts(d.receipts),
                                        )
                                        .catch(() => {});
                                })
                                .catch(() => {});
                            return [...prev, newMsg];
                        });
                        markGroupAsRead(group.id);
                    },
                );
                streamRef.current = stream;
            } catch (err) {
                console.error("[GroupChat] Error:", err);
                setError("Failed to load group chat");
            } finally {
                setIsLoading(false);
            }
        };

        loadData();

        return () => {
            if (streamRef.current) {
                streamRef.current = null;
            }
        };
    }, [
        isOpen,
        isInitialized,
        group,
        getGroupMessages,
        getGroupMembers,
        streamGroupMessages,
        markGroupAsRead,
        fetchPolls,
    ]);

    // Resolve ENS data for group members
    useEffect(() => {
        if (members.length === 0) return;

        // Get all unique member addresses
        const memberAddresses = members
            .flatMap((m) => m.addresses)
            .filter((addr) => addr && addr !== userAddress.toLowerCase());

        if (memberAddresses.length === 0) return;

        // Only resolve addresses not already in our ENS data or getUserInfo cache
        const addressesToResolve = memberAddresses.filter((addr) => {
            const normalized = addr.toLowerCase();
            // Skip if we already have ENS data
            if (memberENSData.has(normalized)) return false;
            // Skip if getUserInfo already has data (from friends/cache)
            const existingInfo = getUserInfo?.(addr);
            if (existingInfo?.avatar) return false;
            return true;
        });

        if (addressesToResolve.length === 0) return;

        resolveAddresses(addressesToResolve).then((results) => {
            if (results.size > 0) {
                setMemberENSData((prev) => {
                    const newMap = new Map(prev);
                    results.forEach((value, key) => {
                        newMap.set(key.toLowerCase(), value);
                    });
                    return newMap;
                });
            }
        });
    }, [members, userAddress, getUserInfo, resolveAddresses, memberENSData]);

    // Send message
    const handleSend = useCallback(async () => {
        if (!newMessage.trim() || isSending || !group) return;

        // Validate against chat rules before sending
        const ruleViolation = validateMessageClientSide(chatRules, newMessage.trim(), "text", isAdmin);
        if (ruleViolation) {
            toast.error(ruleViolation);
            return;
        }

        setIsSending(true);
        setError(null);
        stopTyping(); // Stop typing indicator when message is sent

        try {
            // Include reply context if replying
            let messageContent = newMessage.trim();
            if (replyingTo) {
                const replySender = members.find(
                    (m) => m.inboxId === replyingTo.senderInboxId,
                )?.addresses[0];
                const replyPreview =
                    replyingTo.content.slice(0, 50) +
                    (replyingTo.content.length > 50 ? "..." : "");
                // Format sender inline - check getUserInfo first, then fallback to address truncation
                const senderInfo = replySender
                    ? getUserInfo?.(replySender)
                    : null;
                const senderDisplay =
                    senderInfo?.name ||
                    (replySender
                        ? `${replySender.slice(0, 6)}...${replySender.slice(
                              -4,
                          )}`
                        : "Unknown");
                messageContent = `↩️ ${senderDisplay}: "${replyPreview}"\n\n${messageContent}`;
            }

            const result = await sendGroupMessage(group.id, messageContent);
            if (result.success) {
                setNewMessage("");
                setReplyingTo(null);
                clearDraft();
                onMessageSent?.();
            } else {
                setError(result.error || "Failed to send");
            }
        } catch (err) {
            setError("Failed to send message");
        } finally {
            setIsSending(false);
        }
    }, [
        newMessage,
        isSending,
        group,
        sendGroupMessage,
        replyingTo,
        members,
        getUserInfo,
        onMessageSent,
        clearDraft,
        chatRules,
        isAdmin,
    ]);

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Handle pixel art send
    const handleSendPixelArt = useCallback(
        async (imageData: string) => {
            if (!group) return;

            // Validate pixel art against chat rules
            const ruleViolation = validateMessageClientSide(chatRules, "", "pixel_art", isAdmin);
            if (ruleViolation) {
                toast.error(ruleViolation);
                return;
            }

            setIsUploadingPixelArt(true);
            setError(null);

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
                const result = await sendGroupMessage(
                    group.id,
                    pixelArtMessage,
                );

                if (!result.success) {
                    throw new Error(result.error || "Failed to send");
                }

                setShowPixelArt(false);
                // Notify parent that message was sent (for updating chat order)
                onMessageSent?.();
            } catch (err) {
                setError(
                    `Failed to send pixel art: ${
                        err instanceof Error ? err.message : "Unknown error"
                    }`,
                );
            } finally {
                setIsUploadingPixelArt(false);
            }
        },
        [group, userAddress, sendGroupMessage, onMessageSent, chatRules, isAdmin],
    );

    // Handle GIF send
    const handleSendGif = useCallback(
        async (gifUrl: string) => {
            if (!gifUrl || isSending || !group) return;

            // Validate GIF against chat rules
            const ruleViolation = validateMessageClientSide(chatRules, gifUrl, "gif", isAdmin);
            if (ruleViolation) {
                toast.error(ruleViolation);
                return;
            }

            setIsSending(true);
            try {
                const result = await sendGroupMessage(
                    group.id,
                    `[GIF]${gifUrl}`,
                );
                if (result.success) {
                    onMessageSent?.();
                }
            } catch (err) {
                console.error("Failed to send GIF:", err);
            } finally {
                setIsSending(false);
            }
        },
        [group, isSending, sendGroupMessage, onMessageSent, chatRules, isAdmin],
    );

    // Check if message is a GIF
    const isGifMessage = (content: string) => content.startsWith("[GIF]");
    const getGifUrl = (content: string) => content.replace("[GIF]", "");

    // Check if message is pixel art
    const isPixelArtMessage = (content: string) =>
        content.startsWith("[PIXEL_ART]");
    const getPixelArtUrl = (content: string) =>
        content.replace("[PIXEL_ART]", "");

    // Format member address - show username/ENS name if available
    const formatAddress = (address: string) => {
        // First check getUserInfo (friends list, cached data)
        const info = getUserInfo?.(address);
        if (info?.name) return info.name;

        // Then check our locally resolved ENS data
        const ensData = memberENSData.get(address.toLowerCase());
        if (ensData?.ensName) return ensData.ensName;

        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    // Get member avatar - checks getUserInfo first, then ENS data
    const getMemberAvatar = (address: string) => {
        // First check getUserInfo (friends list, cached data)
        const userInfoAvatar = getUserInfo?.(address)?.avatar;
        if (userInfoAvatar) return userInfoAvatar;

        // Then check our locally resolved ENS data
        const ensData = memberENSData.get(address.toLowerCase());
        if (ensData?.avatar) return ensData.avatar;

        return null;
    };

    // Get friends not already in the group
    const availableFriends = friends.filter((friend) => {
        const friendAddressLower = friend.address.toLowerCase();
        return !members.some((m) =>
            m.addresses.some(
                (addr) => addr.toLowerCase() === friendAddressLower,
            ),
        );
    });

    // Handle adding a member
    const handleAddMember = async (friendAddress: string) => {
        if (!group) return;

        setIsAddingMember(true);
        setError(null);

        try {
            const result = await addGroupMembers(group.id, [friendAddress]);
            if (result.success) {
                // Refresh members
                const updatedMembers = await getGroupMembers(group.id);
                setMembers(updatedMembers);
                setShowAddMember(false);
            } else {
                setError(result.error || "Failed to add member");
            }
        } catch (err) {
            setError("Failed to add member");
        } finally {
            setIsAddingMember(false);
        }
    };

    // Handle leaving the group
    const handleLeaveGroup = async () => {
        if (!group) return;

        const confirmed = window.confirm(
            "Are you sure you want to leave this group? You won't be able to see messages anymore.",
        );
        if (!confirmed) return;

        setIsLeavingGroup(true);
        setError(null);

        try {
            const result = await leaveGroup(group.id);

            if (result.success) {
                onGroupDeleted?.();
                onClose();
            } else {
                setError(result.error || "Failed to leave group");
            }
        } catch (err) {
            console.error("[GroupChat] Leave error:", err);
            setError(
                err instanceof Error ? err.message : "Failed to leave group",
            );
        } finally {
            setIsLeavingGroup(false);
        }
    };

    // Handle removing a member
    const handleRemoveMember = async (memberAddress: string) => {
        if (!group) return;

        const confirmed = window.confirm("Remove this member from the group?");
        if (!confirmed) return;

        setError(null);

        try {
            const result = await removeGroupMember(group.id, memberAddress);
            if (result.success) {
                // Refresh members
                const updatedMembers = await getGroupMembers(group.id);
                setMembers(updatedMembers);
            } else {
                setError(result.error || "Failed to remove member");
            }
        } catch (err) {
            setError("Failed to remove member");
        }
    };

    // Get display name for a friend
    const getDisplayName = (friend: Friend) => {
        return (
            friend.nickname ||
            friend.reachUsername ||
            friend.ensName ||
            `${friend.address.slice(0, 6)}...${friend.address.slice(-4)}`
        );
    };

    if (!group) return null;

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
                            className={`bg-zinc-900 h-full min-h-0 flex flex-col overflow-hidden ${
                                isFullscreen
                                    ? ""
                                    : "border border-zinc-800 rounded-2xl shadow-2xl"
                            }`}
                            role="dialog"
                            aria-modal="true"
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
                            <MessageSearch
                                isOpen={showSearch}
                                onClose={() => setShowSearch(false)}
                                onSelectMessage={handleSelectSearchMessage}
                                messages={groupSearchMessages}
                                userAddress={userAddress}
                                peerName={group?.name ?? "Group"}
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
                            {/* Header - unified mobile-first design */}
                            <div className="flex items-center gap-2 px-2 sm:px-3 py-2.5 border-b border-zinc-800">
                                {/* Avatar */}
                                <div className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center ml-1">
                                    {group.emoji ? (
                                        <span className="text-lg">
                                            {group.emoji}
                                        </span>
                                    ) : (
                                        <span className="text-white font-bold text-sm">
                                            {group.name[0].toUpperCase()}
                                        </span>
                                    )}
                                </div>

                                {/* Title area - takes remaining space */}
                                <div className="flex-1 min-w-0 pr-1">
                                    <h2 className="text-white font-semibold text-[15px] truncate leading-tight">
                                        {group.name}
                                    </h2>
                                    <button
                                        onClick={() => setShowMembers(true)}
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
                                        {members.length > 0 && (
                                            <>
                                                {" "}
                                                · {members.length}{" "}
                                                {members.length === 1
                                                    ? "member"
                                                    : "members"}
                                            </>
                                        )}
                                    </button>
                                </div>

                                {/* Action buttons */}
                                <div className="shrink-0 flex items-center">
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
                                    {pinnedList.length > 0 && (
                                        <button
                                            onClick={() =>
                                                setShowPinnedMessages(
                                                    !showPinnedMessages,
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
                                                {pinnedList.length}
                                            </span>
                                        </button>
                                    )}
                                    {/* Call Buttons - voice only on mobile, both on desktop */}
                                    {onStartCall && (
                                        <>
                                            <button
                                                onClick={() =>
                                                    onStartCall(
                                                        group.id,
                                                        group.name,
                                                        false,
                                                    )
                                                }
                                                disabled={hasActiveCall}
                                                className="p-2.5 hover:bg-zinc-800 rounded-xl transition-colors text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                                                aria-label="Start voice call"
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
                                                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                                    />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() =>
                                                    onStartCall(
                                                        group.id,
                                                        group.name,
                                                        true,
                                                    )
                                                }
                                                disabled={hasActiveCall}
                                                className="hidden sm:flex p-2.5 hover:bg-zinc-800 rounded-xl transition-colors text-[#FFBBA7] hover:text-[#FFF0E0] disabled:opacity-50"
                                                aria-label="Start video call"
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
                                                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                                    />
                                                </svg>
                                            </button>
                                        </>
                                    )}

                                    {/* Manage Menu */}
                                    <div className="relative">
                                        <button
                                            onClick={() =>
                                                setShowManageMenu(
                                                    !showManageMenu,
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
                                            {showManageMenu && (
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
                                                    className="absolute right-0 top-full mt-1 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-10"
                                                >
                                                    <button
                                                        onClick={() => {
                                                            setShowManageMenu(
                                                                false,
                                                            );
                                                            setShowAddMember(
                                                                true,
                                                            );
                                                        }}
                                                        disabled={
                                                            availableFriends.length ===
                                                            0
                                                        }
                                                        className="w-full px-4 py-3 text-left text-sm text-white hover:bg-zinc-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                                                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                                                            />
                                                        </svg>
                                                        Add Member
                                                    </button>
                                                    {isAdmin && (
                                                        <button
                                                            onClick={() => {
                                                                setShowManageMenu(
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
                                                            setShowManageMenu(
                                                                false,
                                                            );
                                                            handleLeaveGroup();
                                                        }}
                                                        disabled={
                                                            isLeavingGroup
                                                        }
                                                        className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-zinc-700 transition-colors flex items-center gap-2 border-t border-zinc-700"
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
                                                        {isLeavingGroup
                                                            ? "Leaving..."
                                                            : "Leave Group"}
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
                                {showPinnedMessages &&
                                    pinnedList.length > 0 && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{
                                                height: "auto",
                                                opacity: 1,
                                            }}
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
                                                    {pinnedList.map((p) => {
                                                        const msg =
                                                            messages.find(
                                                                (m) =>
                                                                    m.id ===
                                                                    p.messageId,
                                                            );
                                                        const senderAddr =
                                                            members.find(
                                                                (m) =>
                                                                    m.inboxId ===
                                                                    msg?.senderInboxId,
                                                            )?.addresses[0];
                                                        return (
                                                            <div
                                                                key={
                                                                    p.messageId
                                                                }
                                                                className="flex items-start gap-2 p-2 bg-zinc-800/50 rounded-lg group"
                                                            >
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-xs text-zinc-400 mb-0.5">
                                                                        {senderAddr
                                                                            ? senderAddr.slice(
                                                                                  0,
                                                                                  6,
                                                                              ) +
                                                                              "…" +
                                                                              senderAddr.slice(
                                                                                  -4,
                                                                              )
                                                                            : "Unknown"}
                                                                    </p>
                                                                    <p className="text-sm text-white truncate">
                                                                        {msg?.content
                                                                            ?.replace(
                                                                                /^\[GIF\]/,
                                                                                "🎬 GIF",
                                                                            )
                                                                            .replace(
                                                                                /^\[PIXEL_ART\]/,
                                                                                "🎨 Pixel Art",
                                                                            )
                                                                            .slice(
                                                                                0,
                                                                                80,
                                                                            ) ??
                                                                            "—"}
                                                                        {(msg
                                                                            ?.content
                                                                            ?.length ??
                                                                            0) >
                                                                        80
                                                                            ? "…"
                                                                            : ""}
                                                                    </p>
                                                                </div>
                                                                <button
                                                                    onClick={() =>
                                                                        togglePin(
                                                                            p.messageId,
                                                                            false,
                                                                        )
                                                                    }
                                                                    disabled={
                                                                        pinningMessageId ===
                                                                        p.messageId
                                                                    }
                                                                    className="p-1 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                                                    title="Unpin"
                                                                >
                                                                    {pinningMessageId ===
                                                                    p.messageId ? (
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
                                                            </div>
                                                        );
                                                    })}
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
                                            {visiblePolls.length !== 1
                                                ? "s"
                                                : ""}
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
                                            canManage={isAdmin}
                                            onEdit={(p) => setEditingPoll(p)}
                                            onDelete={async (p) => {
                                                await deletePoll(p.id);
                                                setEditingPoll(null);
                                            }}
                                            onHide={(pollId) => {
                                                if (!group?.id) return;
                                                setHiddenPollIds((prev) => {
                                                    const next = [
                                                        ...prev,
                                                        pollId,
                                                    ];
                                                    try {
                                                        window.localStorage.setItem(
                                                            `spritz_hidden_polls_group_${group.id}`,
                                                            JSON.stringify(
                                                                next,
                                                            ),
                                                        );
                                                    } catch {}
                                                    return next;
                                                });
                                            }}
                                        />
                                    ))}
                                    {visiblePolls.length > 2 && (
                                        <button
                                            type="button"
                                            className="w-full text-center text-xs text-purple-400 hover:text-purple-300 py-2"
                                        >
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
                                        await updatePoll(
                                            editingPoll.id,
                                            updates,
                                        );
                                        setEditingPoll(null);
                                    }
                                }}
                            />

                            {/* Room Rules Banner */}
                            <ChatRulesBanner
                                chatType="group"
                                chatId={group?.id}
                            />

                            {/* Messages - flex-col-reverse so newest at bottom */}
                            <div
                                ref={messagesContainerRef}
                                role="log"
                                aria-label="Chat messages"
                                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-4 flex flex-col-reverse"
                            >
                                {isLoading ? (
                                    <ChatSkeleton
                                        messageCount={5}
                                        className="p-4"
                                    />
                                ) : error ? (
                                    <div className="flex items-center justify-center h-full">
                                        <p className="text-red-400">{error}</p>
                                    </div>
                                ) : messages.length === 0 ? (
                                    <ChatEmptyState
                                        icon={
                                            <svg
                                                className="w-8 h-8 text-[#FFBBA7]"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={1.5}
                                                    d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"
                                                />
                                            </svg>
                                        }
                                        title="No messages yet"
                                        subtitle="Start the conversation!"
                                    />
                                ) : (
                                    <div className="space-y-3">
                                        {messages
                                            .filter(
                                                (msg) =>
                                                    msg.content !==
                                                    DECRYPTION_FAILED_MARKER,
                                            )
                                            .map(
                                                (
                                                    msg,
                                                    msgIndex,
                                                    filteredMsgs,
                                                ) => {
                                                    // Compare addresses case-insensitively
                                                    const isOwn = userAddress
                                                        ? msg.senderInboxId?.toLowerCase() ===
                                                          userAddress.toLowerCase()
                                                        : false;
                                                    const isPixelArt =
                                                        isPixelArtMessage(
                                                            msg.content,
                                                        );
                                                    const isGif = isGifMessage(
                                                        msg.content,
                                                    );
                                                    const isLocation =
                                                        isLocationMessage(
                                                            msg.content,
                                                        );
                                                    const locationData =
                                                        isLocation
                                                            ? parseLocationMessage(
                                                                  msg.content,
                                                              )
                                                            : null;
                                                    const senderAddress =
                                                        members.find(
                                                            (m) =>
                                                                m.inboxId ===
                                                                msg.senderInboxId,
                                                        )?.addresses[0];

                                                    const senderAvatar =
                                                        senderAddress
                                                            ? getMemberAvatar(
                                                                  senderAddress,
                                                              )
                                                            : null;

                                                    // Check if we need a date divider
                                                    const msgDate = new Date(
                                                        msg.sentAt,
                                                    );
                                                    const prevMsg =
                                                        msgIndex > 0
                                                            ? filteredMsgs[
                                                                  msgIndex - 1
                                                              ]
                                                            : null;
                                                    const prevMsgDate = prevMsg
                                                        ? new Date(
                                                              prevMsg.sentAt,
                                                          )
                                                        : null;
                                                    const showDateDivider =
                                                        !prevMsgDate ||
                                                        msgDate.toDateString() !==
                                                            prevMsgDate.toDateString();

                                                    return (
                                                        <div
                                                            key={msg.id}
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
                                                                        ? "justify-end"
                                                                        : "justify-start"
                                                                }`}
                                                            >
                                                                {/* Avatar for other users with online status */}
                                                                {!isOwn && (
                                                                    <button
                                                                        className="flex-shrink-0 relative"
                                                                        onClick={(
                                                                            e,
                                                                        ) => {
                                                                            if (
                                                                                senderAddress &&
                                                                                isAdmin
                                                                            ) {
                                                                                e.stopPropagation();
                                                                                const rect =
                                                                                    (
                                                                                        e.currentTarget as HTMLElement
                                                                                    ).getBoundingClientRect();
                                                                                setUserPopupPosition(
                                                                                    {
                                                                                        x:
                                                                                            rect.right +
                                                                                            8,
                                                                                        y: rect.top,
                                                                                    },
                                                                                );
                                                                                setSelectedUser(
                                                                                    senderAddress,
                                                                                );
                                                                            }
                                                                        }}
                                                                    >
                                                                        {senderAvatar ? (
                                                                            <img
                                                                                src={
                                                                                    senderAvatar
                                                                                }
                                                                                alt=""
                                                                                className="w-8 h-8 rounded-full object-cover"
                                                                            />
                                                                        ) : (
                                                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white text-xs font-bold">
                                                                                {senderAddress
                                                                                    ? formatAddress(
                                                                                          senderAddress,
                                                                                      )
                                                                                          .slice(
                                                                                              0,
                                                                                              2,
                                                                                          )
                                                                                          .toUpperCase()
                                                                                    : "?"}
                                                                            </div>
                                                                        )}
                                                                        {/* Online status dot */}
                                                                        {senderAddress &&
                                                                            onlineStatuses[
                                                                                senderAddress.toLowerCase()
                                                                            ] && (
                                                                                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-zinc-900 rounded-full" />
                                                                            )}
                                                                    </button>
                                                                )}
                                                                <div
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
                                                                                          isAdmin,
                                                                                      isPinned:
                                                                                          pinnedList.some(
                                                                                              (
                                                                                                  p,
                                                                                              ) =>
                                                                                                  p.messageId ===
                                                                                                  msg.id,
                                                                                          ),
                                                                                      hasMedia:
                                                                                          isPixelArt ||
                                                                                          isGif,
                                                                                      isPixelArt,
                                                                                      mediaUrl:
                                                                                          isPixelArt
                                                                                              ? getPixelArtUrl(
                                                                                                    msg.content,
                                                                                                )
                                                                                              : isGif
                                                                                                ? getGifUrl(
                                                                                                      msg.content,
                                                                                                  )
                                                                                                : undefined,
                                                                                  },
                                                                        );
                                                                    }}
                                                                >
                                                                    <div
                                                                        data-message-bubble
                                                                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 relative cursor-pointer ${
                                                                            isOwn
                                                                                ? "bg-[#FF5500] text-white rounded-br-md"
                                                                                : "bg-zinc-800 text-white rounded-bl-md"
                                                                        } ${
                                                                            selectedMessage ===
                                                                            msg.id
                                                                                ? "ring-2 ring-[#FB8D22]/50"
                                                                                : ""
                                                                        }`}
                                                                    >
                                                                        {!isOwn && (
                                                                            <p className="text-xs text-zinc-400 mb-1 flex items-center gap-1">
                                                                                {senderAddress
                                                                                    ? formatAddress(
                                                                                          senderAddress,
                                                                                      )
                                                                                    : "Unknown"}
                                                                                {senderAddress && (
                                                                                    <RoleBadgeTag role={getRoleBadge(senderAddress)} />
                                                                                )}
                                                                            </p>
                                                                        )}

                                                                        {/* Reply Preview - Check for reply pattern in message content */}
                                                                        {msg.content.startsWith(
                                                                            "↩️ ",
                                                                        ) &&
                                                                            msg.content.includes(
                                                                                "\n\n",
                                                                            ) && (
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
                                                                                            {msg.content
                                                                                                .split(
                                                                                                    ":",
                                                                                                )[0]
                                                                                                .replace(
                                                                                                    "↩️ ",
                                                                                                    "",
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
                                                                                        {msg.content
                                                                                            .split(
                                                                                                "\n\n",
                                                                                            )[0]
                                                                                            .split(
                                                                                                ': "',
                                                                                            )[1]
                                                                                            ?.replace(
                                                                                                /\"$/,
                                                                                                "",
                                                                                            ) ||
                                                                                            ""}
                                                                                    </p>
                                                                                </div>
                                                                            )}

                                                                        {isPixelArt ? (
                                                                            <div className="relative group">
                                                                                <PixelArtImage
                                                                                    src={getPixelArtUrl(
                                                                                        msg.content,
                                                                                    )}
                                                                                    size="md"
                                                                                />
                                                                                {/* Quick Share Actions */}
                                                                                <div
                                                                                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
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
                                                                        ) : isGif ? (
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
                                                                        ) : isLocation &&
                                                                          locationData ? (
                                                                            <LocationMessage
                                                                                location={
                                                                                    locationData
                                                                                }
                                                                                isOwn={
                                                                                    isOwn
                                                                                }
                                                                            />
                                                                        ) : (
                                                                            (() => {
                                                                                const displayContent =
                                                                                    msg.content.startsWith(
                                                                                        "↩️ ",
                                                                                    ) &&
                                                                                    msg.content.includes(
                                                                                        "\n\n",
                                                                                    )
                                                                                        ? msg.content
                                                                                              .split(
                                                                                                  "\n\n",
                                                                                              )
                                                                                              .slice(
                                                                                                  1,
                                                                                              )
                                                                                              .join(
                                                                                                  "\n\n",
                                                                                              )
                                                                                        : msg.content;

                                                                                // Use ChatMarkdown for code blocks and other markdown
                                                                                if (
                                                                                    hasMarkdown(
                                                                                        displayContent,
                                                                                    )
                                                                                ) {
                                                                                    return (
                                                                                        <ChatMarkdown
                                                                                            content={
                                                                                                displayContent
                                                                                            }
                                                                                            isOwnMessage={
                                                                                                isOwn
                                                                                            }
                                                                                        />
                                                                                    );
                                                                                }

                                                                                return (
                                                                                    <>
                                                                                        <p
                                                                                            className={`break-words ${
                                                                                                isEmojiOnly(
                                                                                                    displayContent,
                                                                                                )
                                                                                                    ? "text-4xl leading-tight"
                                                                                                    : ""
                                                                                            }`}
                                                                                        >
                                                                                            <MentionText
                                                                                                text={
                                                                                                    displayContent
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
                                                                                            displayContent,
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
                                                                                );
                                                                            })()
                                                                        )}

                                                                        {/* Reactions Display - Mobile Friendly */}
                                                                        <ReactionDisplay
                                                                            reactions={
                                                                                msgReactions[
                                                                                    msg
                                                                                        .id
                                                                                ] ||
                                                                                []
                                                                            }
                                                                            onReaction={(
                                                                                emoji,
                                                                            ) => {
                                                                                toggleMsgReaction(
                                                                                    msg.id,
                                                                                    emoji,
                                                                                );
                                                                                setSelectedMessage(
                                                                                    null,
                                                                                );
                                                                            }}
                                                                            isOwnMessage={
                                                                                isOwn
                                                                            }
                                                                        />

                                                                        <p
                                                                            className={`text-xs mt-1 flex items-center gap-1.5 ${
                                                                                isOwn
                                                                                    ? "text-[#FFF0E0]"
                                                                                    : "text-zinc-500"
                                                                            }`}
                                                                        >
                                                                            {formatTimeInTimezone(
                                                                                msg.sentAt,
                                                                                userTimezone,
                                                                            )}
                                                                            {isOwn &&
                                                                                (() => {
                                                                                    const readByCount =
                                                                                        readReceipts.filter(
                                                                                            (
                                                                                                r,
                                                                                            ) =>
                                                                                                r.userAddress.toLowerCase() !==
                                                                                                    userAddress.toLowerCase() &&
                                                                                                (messageOrderMap[
                                                                                                    r
                                                                                                        .lastReadMessageId
                                                                                                ] ??
                                                                                                    -1) >=
                                                                                                    (messageOrderMap[
                                                                                                        msg
                                                                                                            .id
                                                                                                    ] ??
                                                                                                        -1),
                                                                                        ).length;
                                                                                    return readByCount >
                                                                                        0 ? (
                                                                                        <span className="text-[10px] text-white/70">
                                                                                            Read
                                                                                            by{" "}
                                                                                            {
                                                                                                readByCount
                                                                                            }
                                                                                        </span>
                                                                                    ) : null;
                                                                                })()}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </motion.div>
                                                        </div>
                                                    );
                                                },
                                            )}
                                    </div>
                                )}
                            </div>

                            {/* Reply Preview */}
                            {replyingTo && (
                                <div className="px-4 py-2 bg-zinc-800/50 border-t border-zinc-700 flex items-center gap-2">
                                    <div className="w-1 h-8 bg-orange-500 rounded-full" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-orange-400 font-medium">
                                            Replying to{" "}
                                            {replyingTo.senderInboxId?.toLowerCase() ===
                                            userAddress?.toLowerCase()
                                                ? "yourself"
                                                : formatAddress(
                                                      members.find(
                                                          (m) =>
                                                              m.inboxId ===
                                                              replyingTo.senderInboxId,
                                                      )?.addresses[0] ||
                                                          "Unknown",
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

                            {/* Typing Indicator */}
                            <AnimatePresence>
                                {typingUsers.length > 0 && (
                                    <TypingIndicator
                                        users={typingUsers.map(
                                            (u) =>
                                                u.name ||
                                                `${u.address.slice(0, 6)}...`,
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
                                <div className="flex items-center gap-2">
                                    {/* Consolidated attachment menu */}
                                    <ChatAttachmentMenu
                                        onPixelArt={() => setShowPixelArt(true)}
                                        onGif={handleSendGif}
                                        onPoll={
                                            canCreatePoll
                                                ? () => setShowPollCreator(true)
                                                : undefined
                                        }
                                        showPoll={canCreatePoll}
                                        onLocation={async (location) => {
                                            if (!group) return;
                                            const ruleViolation = validateMessageClientSide(chatRules, "", "location", isAdmin);
                                            if (ruleViolation) {
                                                toast.error(ruleViolation);
                                                return;
                                            }
                                            const locationMsg =
                                                formatLocationMessage(location);
                                            await sendGroupMessage(
                                                group.id,
                                                locationMsg,
                                            );
                                            onMessageSent?.();
                                        }}
                                        showLocation={true}
                                        isUploading={isUploadingPixelArt}
                                        disabled={!isInitialized}
                                        chatRules={chatRules}
                                        isModerator={isAdmin}
                                    />
                                    <MentionInput
                                        value={newMessage}
                                        onChange={(val) => {
                                            setNewMessage(val);
                                            if (val.trim()) setTyping();
                                        }}
                                        onSubmit={handleSend}
                                        placeholder={
                                            replyingTo
                                                ? "Type your reply..."
                                                : "Type a message..."
                                        }
                                        disabled={!isInitialized}
                                        users={mentionableUsers}
                                        className="flex-1 py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20 transition-all disabled:opacity-50"
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={
                                            !newMessage.trim() ||
                                            isSending ||
                                            !isInitialized
                                        }
                                        className="p-3 rounded-xl bg-[#FF5500] hover:bg-[#E04D00] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                        </div>
                    </motion.div>

                    {/* Pixel Art Editor */}
                    <PixelArtEditor
                        isOpen={showPixelArt}
                        onClose={() => setShowPixelArt(false)}
                        onSend={handleSendPixelArt}
                        isSending={isUploadingPixelArt}
                    />

                    {/* Community (Members) slide-out panel - same behaviour as Global Chat Active Users */}
                    <AnimatePresence>
                        {showMembers && (
                            <>
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="fixed inset-0 bg-black/50 z-[100]"
                                    onClick={() => setShowMembers(false)}
                                />
                                <motion.div
                                    initial={{ x: "100%" }}
                                    animate={{ x: 0 }}
                                    exit={{ x: "100%" }}
                                    transition={{
                                        type: "spring",
                                        damping: 25,
                                        stiffness: 300,
                                    }}
                                    className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-zinc-900 border-l border-zinc-800 z-[101] flex flex-col"
                                    style={{
                                        paddingTop: "env(safe-area-inset-top)",
                                    }}
                                >
                                    <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                                        <div>
                                            <h3 className="font-semibold text-white">
                                                Community
                                            </h3>
                                            <p className="text-xs text-zinc-500">
                                                {members.length} members
                                            </p>
                                        </div>
                                        <button
                                            onClick={() =>
                                                setShowMembers(false)
                                            }
                                            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
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
                                    <div className="flex items-center justify-between p-3 border-b border-zinc-800">
                                        <span className="text-xs text-zinc-500">
                                            Group members
                                        </span>
                                        <button
                                            onClick={() => {
                                                setShowMembers(false);
                                                setShowAddMember(true);
                                            }}
                                            disabled={
                                                availableFriends.length === 0
                                            }
                                            className="text-xs text-[#FFBBA7] hover:text-[#FFF0E0] disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            + Add
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                        {members.map((member) => {
                                            const isMe =
                                                member.inboxId === userInboxId;
                                            const memberAddress =
                                                member.addresses[0] || "";
                                            return (
                                                <div
                                                    key={member.inboxId}
                                                    className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl ${
                                                        isMe
                                                            ? "bg-[#FB8D22]/20"
                                                            : "bg-zinc-800/50"
                                                    }`}
                                                >
                                                    <span
                                                        className={`text-sm flex-1 min-w-0 truncate ${
                                                            isMe
                                                                ? "text-[#FFF0E0]"
                                                                : "text-zinc-300"
                                                        }`}
                                                    >
                                                        {isMe
                                                            ? "You"
                                                            : formatAddress(
                                                                  memberAddress,
                                                              )}
                                                    </span>
                                                    {!isMe && (
                                                        <div className="flex items-center gap-0.5 shrink-0">
                                                            {onOpenDM &&
                                                                isFriend?.(
                                                                    memberAddress,
                                                                ) && (
                                                                    <button
                                                                        onClick={() => {
                                                                            onOpenDM(
                                                                                memberAddress,
                                                                            );
                                                                            setShowMembers(
                                                                                false,
                                                                            );
                                                                        }}
                                                                        className="p-1.5 text-zinc-400 hover:text-[#FF5500] transition-colors rounded"
                                                                        title="Send private message"
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
                                                                    </button>
                                                                )}
                                                            <button
                                                                onClick={() =>
                                                                    handleRemoveMember(
                                                                        memberAddress,
                                                                    )
                                                                }
                                                                className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors rounded"
                                                                title="Remove from group"
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
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>

                    {/* Add Member Modal */}
                    <AnimatePresence>
                        {showAddMember && (
                            <>
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    onClick={() => setShowAddMember(false)}
                                    className="fixed inset-0 bg-black/60 z-[60]"
                                />
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-4 z-[61]"
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-white font-semibold">
                                            Add Member
                                        </h3>
                                        <button
                                            onClick={() =>
                                                setShowAddMember(false)
                                            }
                                            className="p-1 hover:bg-zinc-800 rounded-lg"
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
                                                    strokeWidth={2}
                                                    d="M6 18L18 6M6 6l12 12"
                                                />
                                            </svg>
                                        </button>
                                    </div>

                                    {availableFriends.length === 0 ? (
                                        <p className="text-zinc-500 text-sm text-center py-4">
                                            All your friends are already in this
                                            group
                                        </p>
                                    ) : (
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                            {availableFriends.map((friend) => (
                                                <button
                                                    key={friend.id}
                                                    onClick={() =>
                                                        handleAddMember(
                                                            friend.address,
                                                        )
                                                    }
                                                    disabled={isAddingMember}
                                                    className="w-full flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-50"
                                                >
                                                    {friend.avatar ? (
                                                        <img
                                                            src={friend.avatar}
                                                            alt={getDisplayName(
                                                                friend,
                                                            )}
                                                            className="w-8 h-8 rounded-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FB8D22] to-[#FF5500] flex items-center justify-center text-white text-xs font-bold">
                                                            {getDisplayName(
                                                                friend,
                                                            )
                                                                .slice(0, 2)
                                                                .toUpperCase()}
                                                        </div>
                                                    )}
                                                    <span className="text-white text-sm flex-1 text-left truncate">
                                                        {getDisplayName(friend)}
                                                    </span>
                                                    <svg
                                                        className="w-4 h-4 text-[#FFBBA7]"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M12 4v16m8-8H4"
                                                        />
                                                    </svg>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {isAddingMember && (
                                        <div className="flex items-center justify-center gap-2 mt-4 text-zinc-400 text-sm">
                                            <svg
                                                className="w-4 h-4 animate-spin"
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
                                            Adding member...
                                        </div>
                                    )}
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>
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
                                      toggleMsgReaction(
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
                                      if (msg) setReplyingTo(msg);
                                  }
                                : undefined,
                            onCopy: selectedMessageConfig
                                ? () => {
                                      if (selectedMessageConfig.messageContent) {
                                          navigator.clipboard.writeText(
                                              selectedMessageConfig.messageContent,
                                          );
                                      }
                                  }
                                : undefined,
                            onPin:
                                selectedMessageConfig &&
                                !selectedMessageConfig.isPinned
                                    ? () =>
                                          togglePin(
                                              selectedMessageConfig.messageId,
                                              true,
                                          )
                                    : undefined,
                            onUnpin: selectedMessageConfig?.isPinned
                                ? () =>
                                      togglePin(
                                          selectedMessageConfig.messageId,
                                          false,
                                      )
                                : undefined,
                            onDelete:
                                selectedMessageConfig?.isOwn ||
                                selectedMessageConfig?.canDelete
                                    ? () => {
                                          setMessages((prev) =>
                                              prev.filter(
                                                  (m) =>
                                                      m.id !==
                                                      selectedMessageConfig?.messageId,
                                              ),
                                          );
                                      }
                                    : undefined,
                        }}
                        reactions={MESSAGE_REACTION_EMOJIS}
                    />
                </>
            )}

            {/* Room Rules Panel */}
            {group && (
                <ChatRulesPanel
                    isOpen={showRulesPanel}
                    onClose={() => setShowRulesPanel(false)}
                    chatType="group"
                    chatId={group.id}
                    chatName={group.name}
                />
            )}

            {/* User Popup with Ban for Group Admins */}
            {selectedUser && userPopupPosition && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.5 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[99]"
                        onClick={() => setSelectedUser(null)}
                    />
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
                                    : 0,
                            ),
                            top: userPopupPosition.y,
                        }}
                    >
                        {(() => {
                            const userInfo = getUserInfo?.(selectedUser);
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
                                                    `${selectedUser.slice(0, 6)}...${selectedUser.slice(-4)}`}
                                            </p>
                                            <p className="text-zinc-500 text-xs truncate font-mono">
                                                {selectedUser.slice(0, 10)}...
                                                {selectedUser.slice(-6)}
                                            </p>
                                        </div>
                                    </div>

                                    {isAdmin &&
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
                                                            reason: "Banned by group admin",
                                                        },
                                                    );
                                                    setBanningUser(null);
                                                    setSelectedUser(null);
                                                }}
                                                disabled={
                                                    banningUser === selectedUser
                                                }
                                                className="w-full flex items-center gap-2 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm transition-colors disabled:opacity-50"
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
                                                Ban from Group
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
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
