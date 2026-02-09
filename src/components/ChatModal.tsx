"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { type Address } from "viem";
import {
    useXMTPContext,
    DECRYPTION_FAILED_MARKER,
} from "@/context/WakuProvider";
import { PixelArtEditor } from "./PixelArtEditor";
import { PixelArtImage } from "./PixelArtImage";
import { PixelArtShare } from "./PixelArtShare";
import { useReactions, REACTION_EMOJIS } from "@/hooks/useReactions";
import { EmojiPicker, QuickReactionPicker } from "./EmojiPicker";
import { LinkPreview, detectUrls } from "./LinkPreview";
import {
    MessageStatusIndicator,
    TypingIndicator,
    EncryptionIndicator,
} from "./MessageStatus";
import {
    useTypingIndicator,
    useReadReceipts,
    useMessageReactions,
    MESSAGE_REACTION_EMOJIS,
} from "@/hooks/useChatFeatures";
import { VoiceRecorder, EncryptedVoiceMessage } from "./VoiceRecorder";
import { EncryptedImage } from "./EncryptedImage";
import { 
    encryptAudio, 
    formatVoiceMessage, 
    isVoiceMessage, 
    parseVoiceMessage,
    encryptImage,
    formatEncryptedImageMessage,
    isEncryptedImageMessage,
    parseEncryptedImageMessage,
} from "@/lib/audioEncryption";
import { MessageSearch } from "./MessageSearch";
import { useAnalytics } from "@/hooks/useAnalytics";
import { createLogger } from "@/lib/logger";
import { ChatMarkdown, hasMarkdown } from "./ChatMarkdown";
import { MentionInput } from "./MentionInput";
import { ChatAttachmentMenu } from "./ChatAttachmentMenu";
import { fetchOnlineStatuses } from "@/hooks/usePresence";
import {
    LocationMessage,
    isLocationMessage,
    parseLocationMessage,
    formatLocationMessage,
    type LocationData,
} from "./LocationMessage";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatTimeInTimezone } from "@/lib/timezone";
import {
    useMutedConversations,
    useBlockedUsers,
    useReportUser,
} from "@/hooks/useMuteBlockReport";
import {
    MuteOptionsModal,
    BlockUserModal,
    ReportUserModal,
    ConversationActionsMenu,
} from "./MuteBlockReportModals";
import { ScrollToBottom, useScrollToBottom } from "./ScrollToBottom";
import { ChatSkeleton } from "./ChatSkeleton";
import { ChatEmptyState } from "./ChatEmptyState";
import { DateDivider } from "./UnreadDivider";
import {
    ImageGallery,
    useImageGallery,
    extractImagesFromMessages,
} from "./ImageGallery";
import { useDraftMessages } from "@/hooks/useDraftMessages";
import {
    useMessageEdit,
    EditIndicator,
    EditControls,
} from "@/hooks/useMessageEdit";
import { SwipeableMessage } from "./SwipeableMessage";
import { MessageActionBar, type MessageActionConfig } from "./MessageActionBar";
import { ImageViewerModal } from "./ImageViewerModal";
import { useAdminCheck } from "@/hooks/useAdminCheck";

const log = createLogger("Chat");

type ChatModalProps = {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string; // Can be EVM or Solana address
    peerAddress: string; // Can be EVM or Solana address
    peerName?: string | null;
    peerAvatar?: string | null;
    onMessageSent?: (messagePreview?: string) => void; // Callback when a message is sent
};

type Message = {
    id: string;
    content: string;
    senderAddress: string;
    sentAt: Date;
    status?: "pending" | "sent" | "failed"; // For optimistic updates
};

type ChatState = "checking" | "ready" | "error" | "loading";

// Helper to detect if a message is emoji-only (for larger display)
const EMOJI_REGEX =
    /^[\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Modifier_Base}\p{Emoji_Presentation}\u200d\ufe0f\s]+$/u;
const isEmojiOnly = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    // Check if the message matches emoji-only pattern
    if (!EMOJI_REGEX.test(trimmed)) return false;
    // Count actual emoji characters (excluding spaces and modifiers)
    const emojiCount = [...trimmed].filter(
        (char) => /\p{Emoji}/u.test(char) && !/\d/u.test(char)
    ).length;
    // Only enlarge if 1-3 emojis
    return emojiCount >= 1 && emojiCount <= 3;
};

// Voice message wrapper that handles encryption key fetching
function VoiceMessageWrapper({
    encryptedUrl,
    duration,
    isOwn,
    peerAddress,
}: {
    encryptedUrl: string;
    duration: number;
    isOwn: boolean;
    peerAddress: string;
}) {
    const { getDmEncryptionKey } = useXMTPContext();
    const [encryptionKey, setEncryptionKey] = useState<Uint8Array | null>(null);
    const [keyError, setKeyError] = useState(false);

    useEffect(() => {
        if (getDmEncryptionKey && peerAddress) {
            getDmEncryptionKey(peerAddress)
                .then(setEncryptionKey)
                .catch((err) => {
                    console.error("[VoiceMessageWrapper] Key fetch failed:", err);
                    setKeyError(true);
                });
        }
    }, [getDmEncryptionKey, peerAddress]);

    if (keyError) {
        return (
            <div className="flex items-center gap-2 text-red-400 text-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Voice memo unavailable</span>
            </div>
        );
    }

    return (
        <EncryptedVoiceMessage
            encryptedUrl={encryptedUrl}
            duration={duration}
            isOwn={isOwn}
            encryptionKey={encryptionKey}
        />
    );
}

// Encrypted image wrapper that handles encryption key fetching
function EncryptedImageMessageWrapper({
    encryptedUrl,
    mimeType,
    isOwn,
    peerAddress,
    onViewImage,
}: {
    encryptedUrl: string;
    mimeType: string;
    isOwn: boolean;
    peerAddress: string;
    onViewImage?: (decryptedUrl: string) => void;
}) {
    const { getDmEncryptionKey } = useXMTPContext();
    const [encryptionKey, setEncryptionKey] = useState<Uint8Array | null>(null);
    const [keyError, setKeyError] = useState(false);
    const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);

    useEffect(() => {
        if (getDmEncryptionKey && peerAddress) {
            getDmEncryptionKey(peerAddress)
                .then(setEncryptionKey)
                .catch((err) => {
                    console.error("[EncryptedImageMessageWrapper] Key fetch failed:", err);
                    setKeyError(true);
                });
        }
    }, [getDmEncryptionKey, peerAddress]);

    const handleClick = useCallback(() => {
        if (decryptedUrl && onViewImage) {
            onViewImage(decryptedUrl);
        }
    }, [decryptedUrl, onViewImage]);

    const handleDecrypted = useCallback((url: string) => {
        setDecryptedUrl(url);
    }, []);

    if (keyError) {
        return (
            <div className="flex items-center gap-2 text-red-400 text-sm p-4 bg-red-500/10 rounded-lg">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Image unavailable</span>
            </div>
        );
    }

    return (
        <EncryptedImage
            encryptedUrl={encryptedUrl}
            mimeType={mimeType}
            isOwn={isOwn}
            encryptionKey={encryptionKey}
            onDecrypted={handleDecrypted}
            onClick={handleClick}
        />
    );
}

export function ChatModal({
    isOpen,
    onClose,
    userAddress,
    peerAddress,
    peerName,
    peerAvatar,
    onMessageSent,
}: ChatModalProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [chatError, setChatError] = useState<string | null>(null);
    const [chatState, setChatState] = useState<ChatState>("checking");
    const [bypassCheck, setBypassCheck] = useState(false);
    const [showPixelArt, setShowPixelArt] = useState(false);
    const [isUploadingPixelArt, setIsUploadingPixelArt] = useState(false);
    const [viewingImage, setViewingImage] = useState<string | null>(null);
    const [showReactionPicker, setShowReactionPicker] = useState<string | null>(
        null
    );
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [showMsgReactions, setShowMsgReactions] = useState<string | null>(
        null
    );
    const [isFullscreen, setIsFullscreen] = useState(true);
    const [showSearch, setShowSearch] = useState(false);
    const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
    const [selectedMessageConfig, setSelectedMessageConfig] =
        useState<MessageActionConfig | null>(null);
    const [securityStatus, setSecurityStatus] = useState<{
        isSecure?: boolean;
        isLoading: boolean;
    }>({ isLoading: true });
    const [peerOnline, setPeerOnline] = useState(false);

    // Mute/Block/Report state
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const [showDMMembers, setShowDMMembers] = useState(false);
    const [showMuteModal, setShowMuteModal] = useState(false);
    const [showBlockModal, setShowBlockModal] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [viewerImage, setViewerImage] = useState<string | null>(null);

    // Voice recording state
    const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
    const [isUploadingVoice, setIsUploadingVoice] = useState(false);

    // Image upload state
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // Fetch peer online status
    useEffect(() => {
        if (peerAddress) {
            fetchOnlineStatuses([peerAddress.toLowerCase()]).then(
                (statuses) => {
                    setPeerOnline(statuses[peerAddress.toLowerCase()] || false);
                }
            );
        }
    }, [peerAddress]);

    // Generate conversation ID for this chat
    const conversationId = [userAddress, peerAddress]
        .map((a) => a.toLowerCase())
        .sort()
        .join("-");

    // Reactions hook (for pixel art)
    const { reactions, fetchReactions, toggleReaction } =
        useReactions(userAddress);

    // New chat features
    const { peerTyping, handleTyping, stopTyping } = useTypingIndicator(
        userAddress,
        conversationId
    );
    const { markMessagesRead, getMessageStatus, getReadAt, fetchReadReceipts } =
        useReadReceipts(userAddress, conversationId);
    const {
        reactions: msgReactions,
        fetchReactions: fetchMsgReactions,
        toggleReaction: toggleMsgReaction,
    } = useMessageReactions(userAddress, conversationId);

    // Mute/Block/Report hooks
    const { isMuted, muteConversation, unmuteConversation, getMuteInfo } =
        useMutedConversations(userAddress);
    const { isBlockedByMe, blockUser, unblockUser } =
        useBlockedUsers(userAddress);
    const { reportUser, isSubmitting: isReportSubmitting } =
        useReportUser(userAddress);
    const { isAdmin: isGlobalAdmin } = useAdminCheck(userAddress);

    const userTimezone = useUserTimezone();
    const conversationMuted = isMuted("dm", peerAddress);
    const peerBlocked = isBlockedByMe(peerAddress);
    const muteInfo = getMuteInfo("dm", peerAddress);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const isInitialLoadRef = useRef(true);
    const draftAppliedRef = useRef(false);
    const modalRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamRef = useRef<any>(null);

    // Draft messages persistence
    const { draft, saveDraft, clearDraft } = useDraftMessages(
        "dm",
        peerAddress,
        userAddress
    );

    // Image gallery for viewing multiple images
    const {
        isOpen: galleryOpen,
        images: galleryImages,
        initialIndex: galleryIndex,
        openGallery,
        closeGallery,
    } = useImageGallery();

    // Message edit functionality
    const {
        editingMessage,
        editText,
        setEditText,
        canEditMessage,
        formatEditTimeRemaining,
        startEditing,
        cancelEditing,
        getEditedContent,
        hasChanges: hasEditChanges,
        isEditing,
    } = useMessageEdit();

    // Scroll to bottom with unread badge
    const {
        newMessageCount,
        isAtBottom,
        onNewMessage,
        resetUnreadCount,
        scrollToBottom: scrollToBottomFn,
    } = useScrollToBottom(messagesContainerRef);

    const {
        isInitialized,
        isInitializing,
        error: wakuError,
        userInboxId,
        initialize,
        sendMessage,
        getMessages,
        streamMessages,
        canMessage,
        markAsRead,
        setActiveChatPeer,
        getConversationSecurityStatus,
        getDmEncryptionKey,
    } = useXMTPContext();

    // Analytics tracking
    const { trackMessageSent } = useAnalytics(userAddress);

    // Check security status of the conversation
    useEffect(() => {
        if (!isOpen || !peerAddress || !isInitialized) {
            setSecurityStatus({ isLoading: true });
            return;
        }

        let cancelled = false;

        const checkSecurity = async () => {
            try {
                const status = await getConversationSecurityStatus(peerAddress);
                if (!cancelled) {
                    setSecurityStatus({
                        isSecure: status.isSecure,
                        isLoading: false,
                    });
                }
            } catch (err) {
                log.error("[Chat] Failed to check security status:", err);
                if (!cancelled) {
                    setSecurityStatus({
                        isSecure: undefined,
                        isLoading: false,
                    });
                }
            }
        };

        checkSecurity();

        return () => {
            cancelled = true;
        };
    }, [isOpen, peerAddress, isInitialized, getConversationSecurityStatus]);

    const formatAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    const displayName = peerName || formatAddress(peerAddress);

    // Apply draft when modal opens (once per open)
    useEffect(() => {
        if (!isOpen) {
            draftAppliedRef.current = false;
            return;
        }
        if (draft?.text && !draftAppliedRef.current) {
            setNewMessage(draft.text);
            draftAppliedRef.current = true;
            if (draft.replyToId) {
                const replyTarget = messages.find(
                    (m) => m.id === draft.replyToId
                );
                if (replyTarget) setReplyingTo(replyTarget);
            }
        }
    }, [isOpen, draft?.text, draft?.replyToId, messages]);

    // Escape to close modal (or cancel reply / close sub-modals first)
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (replyingTo) {
                setReplyingTo(null);
                return;
            }
            if (
                showDMMembers ||
                showSearch ||
                showActionsMenu ||
                showMuteModal ||
                showBlockModal ||
                showReportModal
            ) {
                setShowDMMembers(false);
                setShowSearch(false);
                setShowActionsMenu(false);
                setShowMuteModal(false);
                setShowBlockModal(false);
                setShowReportModal(false);
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
        showDMMembers,
        showSearch,
        showActionsMenu,
        showMuteModal,
        showBlockModal,
        showReportModal,
    ]);

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

    // Save draft when message changes (debounced in hook)
    useEffect(() => {
        if (isOpen) {
            saveDraft(
                newMessage,
                replyingTo?.id,
                replyingTo?.content?.slice(0, 50)
            );
        }
    }, [newMessage, replyingTo, isOpen, saveDraft]);

    // Track new messages for unread badge when not at bottom
    useEffect(() => {
        if (messages.length > 0 && !isAtBottom) {
            onNewMessage();
        }
    }, [messages.length]);

    // Auto-scroll on new messages (with column-reverse: scrollTop=0 is bottom)
    useEffect(() => {
        if (messages.length > 0) {
            const container = document.querySelector("[data-chat-messages]");
            if (container) {
                // With column-reverse, scrollTop=0 is at the bottom
                if (isInitialLoadRef.current) {
                    container.scrollTop = 0;
                    isInitialLoadRef.current = false;
                } else {
                    // Smooth scroll for new messages if near bottom
                    if (container.scrollTop < 300) {
                        container.scrollTop = 0;
                    }
                }
            }
        }
    }, [messages]);

    // Initialize Waku when modal opens
    useEffect(() => {
        if (isOpen && !isInitialized && !isInitializing) {
            initialize();
        }
    }, [isOpen, isInitialized, isInitializing, initialize]);

    // Lock body scroll when modal is open to prevent scroll bleed
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
            return () => {
                document.body.style.overflow = "";
            };
        }
    }, [isOpen]);

    // Track current peer to detect changes
    const previousPeerRef = useRef<string | null>(null);

    // Clear messages when peer changes (prevent showing wrong user's messages)
    useEffect(() => {
        if (
            peerAddress &&
            previousPeerRef.current &&
            previousPeerRef.current !== peerAddress
        ) {
            console.log(
                "[Chat] Peer changed from",
                previousPeerRef.current,
                "to",
                peerAddress,
                "- clearing messages"
            );
            setMessages([]);
            setChatError(null);
            setChatState("checking");
            isInitialLoadRef.current = true;
        }
        previousPeerRef.current = peerAddress;
    }, [peerAddress]);

    // Reset state when modal closes
    useEffect(() => {
        if (isOpen) {
            // Reset initial load flag for instant scroll
            isInitialLoadRef.current = true;
            // Set this chat as active to prevent unread count increments
            // This also calls markAsRead internally
            setActiveChatPeer(peerAddress);
            // Also explicitly mark as read to clear any existing unread count
            markAsRead(peerAddress);
            // With column-reverse, scrollTop=0 is at bottom (no scroll needed)
            console.log(
                "[Chat] Opened chat with",
                peerAddress,
                "- marking as read"
            );
        } else {
            setMessages([]);
            setChatError(null);
            setChatState("checking");
            setBypassCheck(false);
            // Clear typing indicator when modal closes
            stopTyping();
            // Clear active chat peer
            setActiveChatPeer(null);
        }
    }, [isOpen, stopTyping, setActiveChatPeer, markAsRead, peerAddress]);

    // Load messages and start streaming when initialized
    useEffect(() => {
        if (!isOpen || !isInitialized) return;

        const loadMessages = async () => {
            // Skip "checking" state - go straight to loading for faster UX
            // Waku's canMessage always returns true for valid addresses
            setChatState("loading");
            setChatError(null);

            try {
                // Quick check in background (non-blocking)
                if (!bypassCheck) {
                    canMessage(peerAddress).then((canChat) => {
                        if (!canChat) {
                            setChatState("error");
                            setChatError(
                                `${displayName} hasn't enabled chat yet. They need to click "Enable Chat" in Spritz first.`
                            );
                        }
                    });
                }

                // Load messages immediately (may be from cache)
                log.debug("[Chat] Loading messages for", peerAddress);
                try {
                    // First load from cache (fast), then refresh in background
                    const existingMessages = await getMessages(peerAddress);
                    console.log(
                        "[Chat] Got messages:",
                        existingMessages.length
                    );

                    // Filter and format messages
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const formattedMessages: Message[] = existingMessages
                        .filter((msg: any) => {
                            return (
                                typeof msg.content === "string" &&
                                msg.content.trim() !== ""
                            );
                        })
                        .map((msg: any) => ({
                            id: msg.id,
                            content: msg.content,
                            senderAddress: msg.senderInboxId,
                            sentAt: new Date(Number(msg.sentAtNs) / 1000000),
                        }));

                    setMessages(formattedMessages);

                    // Fetch read receipts for messages we sent
                    if (formattedMessages.length > 0) {
                        const myMessageIds = formattedMessages
                            .filter(
                                (m: Message) =>
                                    m.senderAddress.toLowerCase() ===
                                    userAddress.toLowerCase()
                            )
                            .map((m: Message) => m.id);
                        if (myMessageIds.length > 0) {
                            fetchReadReceipts(myMessageIds);
                        }

                        // Mark all loaded messages as read in the database
                        markMessagesRead(
                            formattedMessages.map((m: Message) => m.id)
                        );
                    }
                } catch (loadErr) {
                    console.log(
                        "[Chat] Failed to load messages, continuing anyway:",
                        loadErr
                    );
                }

                // Set to ready regardless of load success so we can send/receive
                setChatState("ready");
                markAsRead(peerAddress);

                // Start streaming new messages
                log.debug("[Chat] Setting up message stream...");
                try {
                    const stream = await streamMessages(
                        peerAddress,
                        (message: unknown) => {
                            console.log(
                                "[Chat] Received streamed message:",
                                message
                            );
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const msg = message as any;

                            if (
                                typeof msg.content !== "string" ||
                                msg.content.trim() === ""
                            ) {
                                return;
                            }

                            const newMsg: Message = {
                                id: msg.id,
                                content: msg.content,
                                senderAddress: msg.senderInboxId,
                                sentAt: new Date(
                                    Number(msg.sentAtNs) / 1000000
                                ),
                            };
                            setMessages((prev) => {
                                if (prev.some((m) => m.id === newMsg.id))
                                    return prev;
                                return [...prev, newMsg];
                            });
                            markAsRead(peerAddress);
                            // Mark the new message as read in the database
                            markMessagesRead([newMsg.id]);
                        }
                    );
                    log.debug("[Chat] Stream setup complete:", stream);
                    streamRef.current = stream;
                } catch (streamErr) {
                    console.log(
                        "[Chat] Failed to setup stream, relying on polling:",
                        streamErr
                    );
                }
            } catch (error) {
                console.error("[Chat] Error in chat setup:", error);
                // Still set to ready so user can try to send messages
                setChatState("ready");
            }
        };

        loadMessages();

        return () => {
            // Cleanup stream on unmount
            if (streamRef.current) {
                streamRef.current = null;
            }
        };
    }, [
        isOpen,
        isInitialized,
        peerAddress,
        getMessages,
        streamMessages,
        canMessage,
        displayName,
        bypassCheck,
        markAsRead,
    ]);

    // Polling fallback for messages (since Waku Filter can be unreliable)
    useEffect(() => {
        if (!isOpen || !isInitialized || chatState !== "ready") return;

        const pollInterval = setInterval(async () => {
            try {
                // Force refresh to get latest messages from the network
                const newMessages = await getMessages(peerAddress, true);

                if (newMessages.length > 0) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const formattedMessages: Message[] = newMessages
                        .filter((msg: any) => {
                            const valid =
                                typeof msg.content === "string" &&
                                msg.content.trim() !== "";
                            // Skip messages with invalid content
                            return valid;
                        })
                        .map((msg: any) => ({
                            id: msg.id,
                            content: msg.content,
                            senderAddress: msg.senderInboxId,
                            sentAt: new Date(Number(msg.sentAtNs) / 1000000),
                        }));

                    setMessages((prev) => {
                        // Merge new messages, avoiding duplicates
                        const existingIds = new Set(prev.map((m) => m.id));
                        const newOnes = formattedMessages.filter(
                            (m) => !existingIds.has(m.id)
                        );

                        if (newOnes.length > 0) {
                            console.log(
                                "[Chat] Polling found new messages:",
                                newOnes.length,
                                newOnes.map((m) => ({
                                    id: m.id,
                                    from: m.senderAddress?.slice(0, 10),
                                }))
                            );

                            // Mark new messages as read immediately since chat is open
                            markMessagesRead(newOnes.map((m) => m.id));

                            return [...prev, ...newOnes].sort(
                                (a, b) =>
                                    a.sentAt.getTime() - b.sentAt.getTime()
                            );
                        }
                        return prev;
                    });

                    // Also refresh read receipts for our sent messages
                    const myMsgIds = formattedMessages
                        .filter(
                            (m) =>
                                m.senderAddress.toLowerCase() ===
                                userAddress.toLowerCase()
                        )
                        .map((m) => m.id);
                    if (myMsgIds.length > 0) {
                        fetchReadReceipts(myMsgIds);
                    }

                    // Mark ALL messages from peer as read (in case any were missed)
                    const peerMsgIds = formattedMessages
                        .filter(
                            (m) =>
                                m.senderAddress.toLowerCase() !==
                                userAddress.toLowerCase()
                        )
                        .map((m) => m.id);
                    if (peerMsgIds.length > 0) {
                        markMessagesRead(peerMsgIds);
                        // Also clear unread count in Waku provider
                        markAsRead(peerAddress);
                    }
                }
            } catch (err) {
                log.debug("[Chat] Polling error:", err);
            }
        }, 3000); // Poll every 3 seconds

        return () => clearInterval(pollInterval);
    }, [
        isOpen,
        isInitialized,
        chatState,
        peerAddress,
        getMessages,
        userAddress,
        fetchReadReceipts,
        markMessagesRead,
        markAsRead,
    ]);

    // Reference to track sent message IDs for read receipt checking
    const sentMessageIdsRef = useRef<string[]>([]);
    // Reference to track peer message IDs for marking as read
    const peerMessageIdsRef = useRef<string[]>([]);

    // Update message ID refs when messages change
    useEffect(() => {
        const myMsgIds = messages
            .filter(
                (m) =>
                    m.senderAddress.toLowerCase() === userAddress.toLowerCase()
            )
            .filter((m) => m.status !== "pending" && m.status !== "failed")
            .map((m) => m.id);
        sentMessageIdsRef.current = myMsgIds;

        const peerMsgIds = messages
            .filter(
                (m) =>
                    m.senderAddress.toLowerCase() !== userAddress.toLowerCase()
            )
            .map((m) => m.id);
        peerMessageIdsRef.current = peerMsgIds;
    }, [messages, userAddress]);

    // Periodically check read receipts for all sent messages while chat is open
    useEffect(() => {
        if (!isOpen) return;

        const checkReadReceipts = () => {
            const myMsgIds = sentMessageIdsRef.current;
            if (myMsgIds.length > 0) {
                log.debug(
                    "[Chat] Checking read receipts for",
                    myMsgIds.length,
                    "sent messages"
                );
                fetchReadReceipts(myMsgIds);
            }
        };

        // Check after a short delay to let messages load
        const initialTimeout = setTimeout(checkReadReceipts, 500);

        // Then check every 3 seconds
        const interval = setInterval(checkReadReceipts, 3000);

        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        };
    }, [isOpen, fetchReadReceipts]);

    // Aggressively mark ALL peer messages as read while chat is open
    // This ensures messages are marked as read even if they came in via different paths
    useEffect(() => {
        if (!isOpen) return;

        const markAllAsRead = () => {
            const peerMsgIds = peerMessageIdsRef.current;
            if (peerMsgIds.length > 0) {
                log.debug(
                    "[Chat] Marking",
                    peerMsgIds.length,
                    "peer messages as read"
                );
                markMessagesRead(peerMsgIds);
                // Also clear unread count in Waku provider
                markAsRead(peerAddress);
            }
        };

        // Mark as read immediately when chat opens
        const initialTimeout = setTimeout(markAllAsRead, 100);

        // Then periodically ensure they stay marked as read
        const interval = setInterval(markAllAsRead, 5000);

        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
        };
    }, [isOpen, markMessagesRead, markAsRead, peerAddress]);

    // Toggle message selection for mobile tap actions
    const handleMessageTap = useCallback(
        (messageId: string, config: MessageActionConfig) => {
            if (selectedMessage === messageId) {
                setSelectedMessage(null);
                setSelectedMessageConfig(null);
            } else {
                setSelectedMessage(messageId);
                setSelectedMessageConfig(config);
            }
            setShowMsgReactions(null);
        },
        [selectedMessage]
    );

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
                setShowMsgReactions(null);
            }
        };
        if (selectedMessage) {
            document.addEventListener("click", handleClickOutside);
            return () =>
                document.removeEventListener("click", handleClickOutside);
        }
    }, [selectedMessage]);

    const handleSend = useCallback(
        async (overrideMessage?: string) => {
            const content = (overrideMessage ?? newMessage).trim();
            if (!content) return;

            // Include reply context if replying
            let messageContent = content;
            if (replyingTo) {
                const replySender = replyingTo.senderAddress;
                const replyPreview =
                    replyingTo.content.slice(0, 50) +
                    (replyingTo.content.length > 50 ? "..." : "");
                const senderDisplay =
                    replySender.toLowerCase() === userAddress.toLowerCase()
                        ? "yourself"
                        : peerName || formatAddress(replySender);
                messageContent = `↩️ ${senderDisplay}: "${replyPreview}"\n\n${messageContent}`;
            }

            const tempId = `pending-${Date.now()}-${Math.random()
                .toString(36)
                .substr(2, 9)}`;

            // Immediately add message to UI with pending status (optimistic update)
            const pendingMessage: Message = {
                id: tempId,
                content: messageContent,
                senderAddress: userAddress.toLowerCase(),
                sentAt: new Date(),
                status: "pending",
            };
            setMessages((prev) => [...prev, pendingMessage]);

            setChatError(null);
            const prevMessage = newMessage;
            const prevReplyingTo = replyingTo;
            if (!overrideMessage) setNewMessage("");
            setReplyingTo(null);
            clearDraft();
            stopTyping();

            try {
                const result = await sendMessage(peerAddress, messageContent);
                if (result.success) {
                    trackMessageSent();
                    const preview = messageContent.startsWith("[GIF]")
                        ? "🎬 GIF"
                        : messageContent.startsWith("[PIXEL_ART]")
                        ? "🎨 Pixel Art"
                        : messageContent.startsWith("[LOCATION]")
                        ? "📍 Location"
                        : messageContent;
                    onMessageSent?.(preview);
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === tempId
                                ? {
                                      ...m,
                                      id: result.message?.id || tempId,
                                      status: "sent",
                                  }
                                : m
                        )
                    );
                } else {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === tempId ? { ...m, status: "failed" } : m
                        )
                    );
                    setChatError(
                        `Failed to send: ${result.error || "Unknown error"}`
                    );
                    setNewMessage(prevMessage);
                    setReplyingTo(prevReplyingTo);
                }
            } catch (error) {
                console.error("[Chat] Send error:", error);
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === tempId ? { ...m, status: "failed" } : m
                    )
                );
                setChatError(
                    `Failed to send: ${
                        error instanceof Error ? error.message : "Unknown error"
                    }`
                );
                setNewMessage(prevMessage);
                setReplyingTo(prevReplyingTo);
            }
        },
        [
            newMessage,
            sendMessage,
            peerAddress,
            userAddress,
            trackMessageSent,
            stopTyping,
            replyingTo,
            peerName,
            clearDraft,
        ]
    );

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Handle sending GIF
    const handleSendGif = useCallback(
        async (gifUrl: string) => {
            if (!gifUrl) return;

            try {
                await sendMessage(peerAddress, `[GIF]${gifUrl}`);
            } catch (err) {
                console.error("Failed to send GIF:", err);
            }
        },
        [sendMessage, peerAddress]
    );

    // Handle sending pixel art
    const handleSendPixelArt = useCallback(
        async (imageData: string) => {
            setIsUploadingPixelArt(true);
            setChatError(null);

            try {
                // Upload to IPFS via Pinata
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

                // Send the IPFS URL as a message with a special prefix so we can identify it
                const pixelArtMessage = `[PIXEL_ART]${uploadResult.ipfsUrl}`;
                const result = await sendMessage(peerAddress, pixelArtMessage);

                if (!result.success) {
                    throw new Error(result.error || "Failed to send");
                }

                // Track message sent for analytics
                trackMessageSent();
                // Notify parent that a message was sent (for sorting) with preview
                onMessageSent?.("🎨 Pixel Art");

                // Add the sent pixel art message to the UI immediately
                if (result.message && userAddress) {
                    const sentMessage: Message = {
                        id: result.message.id || `sent-${Date.now()}`,
                        content: pixelArtMessage,
                        senderAddress: userAddress.toLowerCase(),
                        sentAt: new Date(),
                    };
                    setMessages((prev) => [...prev, sentMessage]);
                }

                setShowPixelArt(false);
            } catch (error) {
                console.error("[Chat] Pixel art error:", error);
                setChatError(
                    `Failed to send pixel art: ${
                        error instanceof Error ? error.message : "Unknown error"
                    }`
                );
            } finally {
                setIsUploadingPixelArt(false);
            }
        },
        [userAddress, peerAddress, sendMessage, trackMessageSent]
    );

    // Handle sending encrypted voice memo
    const handleSendVoice = useCallback(
        async (audioBlob: Blob, duration: number) => {
            if (!audioBlob || !peerAddress || !getDmEncryptionKey) {
                log.error("Missing required params for voice upload");
                return;
            }

            setIsUploadingVoice(true);
            setChatError(null);

            try {
                // Get the encryption key for this conversation
                const encryptionKey = await getDmEncryptionKey(peerAddress);
                
                // Encrypt the audio
                const { encryptedBlob } = await encryptAudio(audioBlob, encryptionKey);
                
                // Upload encrypted audio
                const formData = new FormData();
                formData.append("file", encryptedBlob, "voice.enc");
                formData.append("duration", duration.toString());
                formData.append("conversationId", conversationId);
                
                const uploadResponse = await fetch("/api/upload/voice", {
                    method: "POST",
                    body: formData,
                });
                
                if (!uploadResponse.ok) {
                    const error = await uploadResponse.json();
                    throw new Error(error.error || "Failed to upload voice memo");
                }
                
                const uploadResult = await uploadResponse.json();
                
                // Format and send the voice message
                const voiceMessage = formatVoiceMessage(duration, uploadResult.url);
                const result = await sendMessage(peerAddress, voiceMessage);
                
                if (!result.success) {
                    throw new Error(result.error || "Failed to send voice message");
                }
                
                // Track for analytics
                trackMessageSent();
                onMessageSent?.("🎤 Voice memo");
                
                // Add to UI immediately
                if (result.message && userAddress) {
                    const sentMessage: Message = {
                        id: result.message.id || `sent-${Date.now()}`,
                        content: voiceMessage,
                        senderAddress: userAddress.toLowerCase(),
                        sentAt: new Date(),
                    };
                    setMessages((prev) => [...prev, sentMessage]);
                }
                
                setShowVoiceRecorder(false);
                log.info("Voice memo sent successfully");
            } catch (error) {
                log.error("Voice memo error:", error);
                setChatError(
                    `Failed to send voice memo: ${
                        error instanceof Error ? error.message : "Unknown error"
                    }`
                );
            } finally {
                setIsUploadingVoice(false);
            }
        },
        [peerAddress, getDmEncryptionKey, conversationId, sendMessage, userAddress, trackMessageSent, onMessageSent]
    );

    // Handle encrypted image upload
    const handleImageUpload = useCallback(async () => {
        // Trigger file input click
        imageInputRef.current?.click();
    }, []);

    const handleImageSelected = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (!file || !peerAddress || !getDmEncryptionKey) {
                log.error("Missing required params for image upload");
                return;
            }

            // Validate file type
            if (!file.type.startsWith("image/")) {
                setChatError("Please select a valid image file");
                return;
            }

            // Validate file size (max 5MB before encryption)
            if (file.size > 5 * 1024 * 1024) {
                setChatError("Image must be less than 5MB");
                return;
            }

            setIsUploadingImage(true);
            setChatError(null);

            try {
                // Get the encryption key for this conversation
                const encryptionKey = await getDmEncryptionKey(peerAddress);
                
                // Convert file to blob
                const imageBlob = new Blob([await file.arrayBuffer()], { type: file.type });
                
                // Encrypt the image
                const { encryptedBlob } = await encryptImage(imageBlob, encryptionKey);
                
                // Upload encrypted image
                const formData = new FormData();
                formData.append("file", encryptedBlob, "image.enc");
                formData.append("conversationId", conversationId);
                formData.append("originalType", file.type);
                
                const uploadResponse = await fetch("/api/upload/image", {
                    method: "POST",
                    body: formData,
                });
                
                if (!uploadResponse.ok) {
                    const error = await uploadResponse.json();
                    throw new Error(error.error || "Failed to upload image");
                }
                
                const uploadResult = await uploadResponse.json();
                
                // Format and send the image message
                const imageMessage = formatEncryptedImageMessage(file.type, uploadResult.url);
                const result = await sendMessage(peerAddress, imageMessage);
                
                if (!result.success) {
                    throw new Error(result.error || "Failed to send image");
                }
                
                // Track for analytics
                trackMessageSent();
                onMessageSent?.("📷 Photo");
                
                // Add to UI immediately
                if (result.message && userAddress) {
                    const sentMessage: Message = {
                        id: result.message.id || `sent-${Date.now()}`,
                        content: imageMessage,
                        senderAddress: userAddress.toLowerCase(),
                        sentAt: new Date(),
                    };
                    setMessages((prev) => [...prev, sentMessage]);
                }
                
                log.info("Encrypted image sent successfully");
            } catch (error) {
                log.error("Image upload error:", error);
                setChatError(
                    `Failed to send image: ${
                        error instanceof Error ? error.message : "Unknown error"
                    }`
                );
            } finally {
                setIsUploadingImage(false);
                // Reset the input so the same file can be selected again
                if (imageInputRef.current) {
                    imageInputRef.current.value = "";
                }
            }
        },
        [peerAddress, getDmEncryptionKey, conversationId, sendMessage, userAddress, trackMessageSent, onMessageSent]
    );

    // Check if a message is pixel art
    const isPixelArtMessage = (content: string) =>
        content.startsWith("[PIXEL_ART]");
    const getPixelArtUrl = (content: string) =>
        content.replace("[PIXEL_ART]", "");

    // Check if a message is a GIF
    const isGifMessage = (content: string) => content.startsWith("[GIF]");
    const getGifUrl = (content: string) => content.replace("[GIF]", "");

    // Fetch reactions for pixel art messages
    useEffect(() => {
        const pixelArtUrls = messages
            .filter((msg) => isPixelArtMessage(msg.content))
            .map((msg) => getPixelArtUrl(msg.content));

        if (pixelArtUrls.length > 0) {
            fetchReactions(pixelArtUrls);
        }
    }, [messages, fetchReactions]);

    // Fetch reactions for all messages
    useEffect(() => {
        const messageIds = messages.map((msg) => msg.id);
        if (messageIds.length > 0) {
            fetchMsgReactions(messageIds);
        }
    }, [messages, fetchMsgReactions]);

    // Handle reaction click
    const handleReaction = async (ipfsUrl: string, emoji: string) => {
        await toggleReaction(ipfsUrl, emoji);
        setShowReactionPicker(null);
    };

    // Wrapper component for pixel art reaction picker with viewport-aware positioning
    const PixelArtReactionPickerWrapper = ({
        isOwn,
        onReaction,
        reactions,
        reactionEmojis,
    }: {
        isOwn: boolean;
        onReaction: (emoji: string) => void;
        reactions: any;
        reactionEmojis: string[];
    }) => {
        const pickerRef = useRef<HTMLDivElement>(null);
        const [position, setPosition] = useState<{
            top?: string;
            bottom?: string;
            left?: string;
            right?: string;
        }>({});

        useEffect(() => {
            if (!pickerRef.current) return;

            const updatePosition = () => {
                const picker = pickerRef.current;
                if (!picker) return;

                const parent = picker.parentElement;
                if (!parent) return;

                const parentRect = parent.getBoundingClientRect();
                const pickerRect = picker.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                const padding = 8;

                let newPosition: typeof position = {};

                // Check if we should show above or below
                const spaceAbove = parentRect.top;
                const spaceBelow = viewportHeight - parentRect.bottom;
                const showAbove =
                    spaceAbove >= pickerRect.height + padding ||
                    spaceBelow < spaceAbove;

                // Horizontal positioning
                if (isOwn) {
                    // For own messages, align to right but check bounds
                    const rightEdge = parentRect.right;
                    if (rightEdge - pickerRect.width < padding) {
                        newPosition.left = "0";
                        newPosition.right = "auto";
                    } else {
                        newPosition.right = "0";
                        newPosition.left = "auto";
                    }
                } else {
                    // For other messages, align to left but check bounds
                    const leftEdge = parentRect.left;
                    if (leftEdge + pickerRect.width > viewportWidth - padding) {
                        newPosition.right = "0";
                        newPosition.left = "auto";
                    } else {
                        newPosition.left = "0";
                        newPosition.right = "auto";
                    }
                }

                if (showAbove) {
                    newPosition.bottom = "calc(100% + 4px)";
                } else {
                    newPosition.top = "calc(100% + 4px)";
                }

                setPosition(newPosition);
            };

            const timeout = setTimeout(updatePosition, 10);
            window.addEventListener("resize", updatePosition);
            window.addEventListener("scroll", updatePosition, true);

            return () => {
                clearTimeout(timeout);
                window.removeEventListener("resize", updatePosition);
                window.removeEventListener("scroll", updatePosition, true);
            };
        }, []);

        return (
            <motion.div
                ref={pickerRef}
                initial={{
                    opacity: 0,
                    scale: 0.9,
                    y: -5,
                }}
                animate={{
                    opacity: 1,
                    scale: 1,
                    y: 0,
                }}
                exit={{
                    opacity: 0,
                    scale: 0.9,
                    y: -5,
                }}
                className="absolute bg-zinc-800 border border-zinc-700 rounded-xl p-2 shadow-xl z-10"
                style={position}
            >
                <div className="flex gap-1">
                    {reactionEmojis.map((emoji) => {
                        const currentReaction = reactions?.find(
                            (r: any) => r.emoji === emoji
                        );
                        return (
                            <button
                                key={emoji}
                                onClick={() => onReaction(emoji)}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-zinc-700 transition-colors ${
                                    currentReaction?.hasReacted
                                        ? "bg-[#FB8D22]/30"
                                        : ""
                                }`}
                            >
                                {emoji}
                            </button>
                        );
                    })}
                </div>
            </motion.div>
        );
    };

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
                                : "left-4 right-4 top-16 bottom-32 sm:inset-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:max-h-[65vh] sm:h-[550px]"
                        }`}
                    >
                        <div
                            ref={modalRef}
                            role="dialog"
                            aria-modal="true"
                            className={`bg-zinc-900 flex flex-col min-h-0 h-full overflow-hidden ${
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
                                {/* Avatar with online status - click to view full size */}
                                <div className="shrink-0 ml-1 relative">
                                    {peerAvatar ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setViewerImage(peerAvatar)
                                            }
                                            className="w-9 h-9 rounded-full overflow-hidden focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-zinc-900 focus:outline-none"
                                            aria-label="View avatar full size"
                                        >
                                            <img
                                                src={peerAvatar}
                                                alt={displayName}
                                                className="w-full h-full object-cover"
                                            />
                                        </button>
                                    ) : (
                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FB8D22] to-[#FF5500] flex items-center justify-center">
                                            <span className="text-white font-bold text-sm">
                                                {displayName[0].toUpperCase()}
                                            </span>
                                        </div>
                                    )}
                                    {/* Online status dot */}
                                    {peerOnline && (
                                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-zinc-900 rounded-full" />
                                    )}
                                </div>

                                {/* Title area - clickable to open profile/schedule tray (same as Friends) */}
                                <div className="flex-1 min-w-0 pr-1">
                                    <button
                                        type="button"
                                        onClick={() => setShowActionsMenu(true)}
                                        className="w-full text-left cursor-pointer rounded-lg -ml-1 pl-1 hover:bg-zinc-800/50 active:bg-zinc-800 transition-colors"
                                        aria-label={`Actions for ${displayName}`}
                                    >
                                        <h2 className="text-white font-semibold text-[15px] truncate leading-tight">
                                            {displayName}
                                        </h2>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowDMMembers(true)}
                                        className="text-zinc-500 text-xs font-mono truncate hover:text-zinc-300 transition-colors flex items-center gap-1"
                                    >
                                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                        2 members
                                    </button>
                                </div>

                                {/* Action buttons - compact on mobile */}
                                <div className="shrink-0 flex items-center">
                                    {/* Muted indicator */}
                                    {conversationMuted && (
                                        <span
                                            className="p-2 text-zinc-500"
                                            title="Muted"
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
                                        </span>
                                    )}
                                    <button
                                        onClick={() => setShowSearch(true)}
                                        className="p-2.5 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white"
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
                                    {/* More options button */}
                                    <button
                                        onClick={() => setShowActionsMenu(true)}
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
                                    <button
                                        onClick={() =>
                                            setIsFullscreen(!isFullscreen)
                                        }
                                        className="hidden sm:flex p-2.5 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white"
                                        aria-label={
                                            isFullscreen
                                                ? "Exit fullscreen"
                                                : "Fullscreen"
                                        }
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
                                                d={
                                                    isFullscreen
                                                        ? "M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"
                                                        : "M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                                                }
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

                            {/* Messages - flex-col-reverse so newest at bottom */}
                            <div
                                ref={messagesContainerRef}
                                role="log"
                                aria-label="Chat messages"
                                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-4 flex flex-col-reverse"
                                data-chat-messages
                            >
                                {isInitializing && (
                                    <div className="flex flex-col h-full">
                                        <div className="text-center py-4">
                                            <p className="text-zinc-400 text-sm">
                                                Initializing secure
                                                connection...
                                            </p>
                                            <p className="text-zinc-500 text-xs mt-1">
                                                Please sign the message in your
                                                wallet
                                            </p>
                                        </div>
                                        <ChatSkeleton messageCount={6} />
                                    </div>
                                )}

                                {(wakuError || chatError) && (
                                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
                                        <p className="text-red-400">
                                            {wakuError || chatError}
                                        </p>
                                        {chatState === "error" &&
                                            !bypassCheck && (
                                                <button
                                                    onClick={() =>
                                                        setBypassCheck(true)
                                                    }
                                                    className="mt-3 py-2 px-4 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm transition-colors"
                                                >
                                                    Try Anyway
                                                </button>
                                            )}
                                    </div>
                                )}

                                {isInitialized &&
                                    !chatError &&
                                    messages.length === 0 && (
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
                                                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                                    />
                                                </svg>
                                            }
                                            title="No messages yet"
                                            subtitle="Say hello to start the conversation!"
                                            cta={
                                                <div className="flex flex-wrap gap-2 justify-center">
                                                    {[
                                                        "Hey! 👋",
                                                        "What's up?",
                                                        "Let's chat!",
                                                    ].map((suggestion) => (
                                                        <button
                                                            key={suggestion}
                                                            type="button"
                                                            onClick={() =>
                                                                handleSend(
                                                                    suggestion
                                                                )
                                                            }
                                                            disabled={isSending}
                                                            className="px-4 py-2 rounded-xl bg-zinc-700/80 hover:bg-zinc-600 text-zinc-200 text-sm font-medium transition-colors disabled:opacity-50"
                                                        >
                                                            {suggestion}
                                                        </button>
                                                    ))}
                                                </div>
                                            }
                                        />
                                    )}

                                {/* Messages container - flows bottom to top with column-reverse */}
                                <div className="space-y-3">
                                    {/* Deduplicate messages by ID and filter out decryption failures */}
                                    {(() => {
                                        const deduped = Array.from(
                                            new Map(
                                                messages
                                                    .filter(
                                                        (m) =>
                                                            m.content !==
                                                            DECRYPTION_FAILED_MARKER
                                                    )
                                                    .map((m) => [m.id, m])
                                            ).values()
                                        );
                                        let lastDate: string | null = null;

                                        return deduped.map((msg, index) => {
                                            // Compare addresses case-insensitively
                                            const isOwn = userAddress
                                                ? msg.senderAddress?.toLowerCase() ===
                                                  userAddress.toLowerCase()
                                                : false;
                                            const isPixelArt =
                                                isPixelArtMessage(msg.content);
                                            const isGif = isGifMessage(
                                                msg.content
                                            );
                                            const isLocation =
                                                isLocationMessage(msg.content);
                                            const locationData = isLocation
                                                ? parseLocationMessage(
                                                      msg.content
                                                  )
                                                : null;
                                            const isVoice = isVoiceMessage(msg.content);
                                            const voiceData = isVoice
                                                ? parseVoiceMessage(msg.content)
                                                : null;
                                            const isEncryptedImage = isEncryptedImageMessage(msg.content);
                                            const encryptedImageData = isEncryptedImage
                                                ? parseEncryptedImageMessage(msg.content)
                                                : null;

                                            // Check if we need a date divider
                                            const msgDate =
                                                msg.sentAt.toDateString();
                                            const showDateDivider =
                                                msgDate !== lastDate;
                                            lastDate = msgDate;

                                            return (
                                                <div key={msg.id}>
                                                    {/* Date Divider */}
                                                    {showDateDivider && (
                                                        <DateDivider
                                                            date={msg.sentAt}
                                                            className="my-4"
                                                        />
                                                    )}

                                                    {/* Swipeable + Unified Menu Wrapper */}
                                                    <SwipeableMessage
                                                        onSwipeRight={() =>
                                                            setReplyingTo(msg)
                                                        }
                                                        disabled={
                                                            typeof window !==
                                                                "undefined" &&
                                                            window.innerWidth >
                                                                768
                                                        }
                                                        leftAction={
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
                                                                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                                                                />
                                                            </svg>
                                                        }
                                                    >
                                                        <motion.div
                                                            initial={{
                                                                opacity: 0,
                                                                y: 10,
                                                            }}
                                                            animate={{
                                                                opacity: 1,
                                                                y: 0,
                                                            }}
                                                            className={`flex items-end gap-2 ${
                                                                isOwn
                                                                    ? "justify-end"
                                                                    : "justify-start"
                                                            }`}
                                                        >
                                                            {/* Peer avatar for incoming messages */}
                                                            {!isOwn && (
                                                                <div className="flex-shrink-0 mb-1">
                                                                    {peerAvatar ? (
                                                                        <img
                                                                            src={
                                                                                peerAvatar
                                                                            }
                                                                            alt=""
                                                                            className="w-7 h-7 rounded-full object-cover"
                                                                        />
                                                                    ) : (
                                                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-700 flex items-center justify-center text-white text-xs font-bold">
                                                                            {peerName?.[0]?.toUpperCase() ||
                                                                                peerAddress
                                                                                    .slice(
                                                                                        2,
                                                                                        4
                                                                                    )
                                                                                    .toUpperCase()}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <div
                                                                className={`${
                                                                    isFullscreen
                                                                        ? "max-w-[85%]"
                                                                        : "max-w-[70%]"
                                                                } rounded-2xl px-4 py-2.5 ${
                                                                    isOwn
                                                                        ? msg.status ===
                                                                          "failed"
                                                                            ? "bg-red-500/80 text-white rounded-br-md"
                                                                            : msg.status ===
                                                                              "pending"
                                                                            ? "bg-[#FF5500]/70 text-white rounded-br-md"
                                                                            : "bg-[#FF5500] text-white rounded-br-md"
                                                                        : "bg-zinc-800 text-white rounded-bl-md"
                                                                }`}
                                                            >
                                                                {isPixelArt ? (
                                                                    <div
                                                                        className={`pixel-art-message relative group cursor-pointer ${
                                                                            selectedMessage ===
                                                                            msg.id
                                                                                ? "ring-2 ring-[#FB8D22]/50 rounded-2xl"
                                                                                : ""
                                                                        }`}
                                                                        onClick={() =>
                                                                            handleMessageTap(
                                                                                msg.id,
                                                                                {
                                                                                    messageId:
                                                                                        msg.id,
                                                                                    messageContent:
                                                                                        msg.content,
                                                                                    isOwn,
                                                                                    canDelete: isOwn || isGlobalAdmin,
                                                                                    hasMedia:
                                                                                        true,
                                                                                    isPixelArt:
                                                                                        true,
                                                                                    mediaUrl:
                                                                                        getPixelArtUrl(
                                                                                            msg.content
                                                                                        ),
                                                                                }
                                                                            )
                                                                        }
                                                                    >
                                                                        <PixelArtImage
                                                                            src={getPixelArtUrl(
                                                                                msg.content
                                                                            )}
                                                                            onClick={() => {
                                                                                setViewingImage(
                                                                                    getPixelArtUrl(
                                                                                        msg.content
                                                                                    )
                                                                                );
                                                                            }}
                                                                            size="md"
                                                                        />

                                                                        {/* Quick Share Actions - shows on hover/tap */}
                                                                        <div
                                                                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                            onClick={(
                                                                                e
                                                                            ) =>
                                                                                e.stopPropagation()
                                                                            }
                                                                        >
                                                                            <PixelArtShare
                                                                                imageUrl={getPixelArtUrl(
                                                                                    msg.content
                                                                                )}
                                                                                showQuickActions
                                                                            />
                                                                        </div>

                                                                        {/* Reactions Display - Mobile Friendly */}
                                                                        {reactions[
                                                                            getPixelArtUrl(
                                                                                msg.content
                                                                            )
                                                                        ]?.some(
                                                                            (
                                                                                r
                                                                            ) =>
                                                                                r.count >
                                                                                0
                                                                        ) && (
                                                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                                                {reactions[
                                                                                    getPixelArtUrl(
                                                                                        msg.content
                                                                                    )
                                                                                ]
                                                                                    ?.filter(
                                                                                        (
                                                                                            r
                                                                                        ) =>
                                                                                            r.count >
                                                                                            0
                                                                                    )
                                                                                    .map(
                                                                                        (
                                                                                            reaction
                                                                                        ) => (
                                                                                            <button
                                                                                                key={
                                                                                                    reaction.emoji
                                                                                                }
                                                                                                onClick={() =>
                                                                                                    handleReaction(
                                                                                                        getPixelArtUrl(
                                                                                                            msg.content
                                                                                                        ),
                                                                                                        reaction.emoji
                                                                                                    )
                                                                                                }
                                                                                                className={`
                                                                                    flex items-center gap-1 rounded-full transition-all duration-100
                                                                                    min-w-[44px] min-h-[32px] px-2.5 py-1
                                                                                    sm:min-w-[36px] sm:min-h-[28px] sm:px-2 sm:py-0.5
                                                                                    active:scale-95
                                                                                    ${
                                                                                        reaction.hasReacted
                                                                                            ? "bg-[#FB8D22]/30 text-[#FFF0E0]"
                                                                                            : "bg-zinc-700/60 text-zinc-300 hover:bg-zinc-600/60"
                                                                                    }
                                                                                `}
                                                                                            >
                                                                                                <span className="text-base sm:text-sm">
                                                                                                    {
                                                                                                        reaction.emoji
                                                                                                    }
                                                                                                </span>
                                                                                                <span className="text-xs font-medium">
                                                                                                    {
                                                                                                        reaction.count
                                                                                                    }
                                                                                                </span>
                                                                                            </button>
                                                                                        )
                                                                                    )}
                                                                            </div>
                                                                        )}

                                                                        {/* Add Reaction Button - Mobile Friendly */}
                                                                        <div className="relative mt-1">
                                                                            <button
                                                                                onClick={() =>
                                                                                    setShowReactionPicker(
                                                                                        showReactionPicker ===
                                                                                            getPixelArtUrl(
                                                                                                msg.content
                                                                                            )
                                                                                            ? null
                                                                                            : getPixelArtUrl(
                                                                                                  msg.content
                                                                                              )
                                                                                    )
                                                                                }
                                                                                className={`
                                                                    flex items-center gap-1 rounded-full transition-all duration-100
                                                                    min-h-[36px] px-3 py-1.5 text-sm
                                                                    sm:min-h-[28px] sm:px-2 sm:py-1 sm:text-xs
                                                                    active:scale-95
                                                                    ${
                                                                        isOwn
                                                                            ? "text-[#FFF0E0] hover:bg-[#FF5500]/30 active:bg-[#FF5500]/40"
                                                                            : "text-zinc-400 hover:bg-zinc-700 active:bg-zinc-600"
                                                                    }
                                                                `}
                                                                            >
                                                                                <span>
                                                                                    😊
                                                                                </span>
                                                                                <span className="hidden sm:inline">
                                                                                    React
                                                                                </span>
                                                                            </button>

                                                                            {/* Reaction Picker */}
                                                                            <AnimatePresence>
                                                                                {showReactionPicker ===
                                                                                    getPixelArtUrl(
                                                                                        msg.content
                                                                                    ) && (
                                                                                    <PixelArtReactionPickerWrapper
                                                                                        isOwn={
                                                                                            isOwn
                                                                                        }
                                                                                        onReaction={(
                                                                                            emoji
                                                                                        ) =>
                                                                                            handleReaction(
                                                                                                getPixelArtUrl(
                                                                                                    msg.content
                                                                                                ),
                                                                                                emoji
                                                                                            )
                                                                                        }
                                                                                        reactions={
                                                                                            reactions[
                                                                                                getPixelArtUrl(
                                                                                                    msg.content
                                                                                                )
                                                                                            ]
                                                                                        }
                                                                                        reactionEmojis={
                                                                                            REACTION_EMOJIS
                                                                                        }
                                                                                    />
                                                                                )}
                                                                            </AnimatePresence>
                                                                        </div>

                                                                        <p
                                                                            className={`text-xs mt-1 ${
                                                                                isOwn
                                                                                    ? "text-[#FFF0E0]"
                                                                                    : "text-zinc-500"
                                                                            }`}
                                                                        >
                                                                            🎨
                                                                            Pixel
                                                                            Art
                                                                            •{" "}
                                                                            {formatTimeInTimezone(
                                                                                msg.sentAt,
                                                                                userTimezone
                                                                            )}
                                                                        </p>
                                                                    </div>
                                                                ) : isGif ? (
                                                                    <div
                                                                        className={`relative cursor-pointer ${
                                                                            selectedMessage ===
                                                                            msg.id
                                                                                ? "ring-2 ring-[#FB8D22]/50 rounded-2xl p-1"
                                                                                : ""
                                                                        }`}
                                                                        onClick={() =>
                                                                            handleMessageTap(
                                                                                msg.id,
                                                                                {
                                                                                    messageId:
                                                                                        msg.id,
                                                                                    messageContent:
                                                                                        msg.content,
                                                                                    isOwn,
                                                                                    canDelete: isOwn || isGlobalAdmin,
                                                                                    hasMedia:
                                                                                        true,
                                                                                    mediaUrl:
                                                                                        getGifUrl(
                                                                                            msg.content
                                                                                        ),
                                                                                }
                                                                            )
                                                                        }
                                                                    >
                                                                        <img
                                                                            src={getGifUrl(
                                                                                msg.content
                                                                            )}
                                                                            alt="GIF"
                                                                            className="max-w-[280px] h-auto rounded-xl"
                                                                            loading="lazy"
                                                                        />
                                                                        <p
                                                                            className={`text-xs mt-1 ${
                                                                                isOwn
                                                                                    ? "text-[#FFF0E0]"
                                                                                    : "text-zinc-500"
                                                                            }`}
                                                                        >
                                                                            🎬
                                                                            GIF
                                                                            •{" "}
                                                                            {formatTimeInTimezone(
                                                                                msg.sentAt,
                                                                                userTimezone
                                                                            )}
                                                                        </p>
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
                                                                ) : isVoice &&
                                                                  voiceData ? (
                                                                    <VoiceMessageWrapper
                                                                        encryptedUrl={voiceData.url}
                                                                        duration={voiceData.duration}
                                                                        isOwn={isOwn}
                                                                        peerAddress={peerAddress}
                                                                    />
                                                                ) : isEncryptedImage &&
                                                                  encryptedImageData ? (
                                                                    <EncryptedImageMessageWrapper
                                                                        encryptedUrl={encryptedImageData.url}
                                                                        mimeType={encryptedImageData.mimeType}
                                                                        isOwn={isOwn}
                                                                        peerAddress={peerAddress}
                                                                        onViewImage={(url) => setViewerImage(url)}
                                                                    />
                                                                ) : (
                                                                    <div
                                                                        data-message-bubble
                                                                        onClick={() =>
                                                                            handleMessageTap(
                                                                                msg.id,
                                                                                {
                                                                                    messageId:
                                                                                        msg.id,
                                                                                    messageContent:
                                                                                        msg.content,
                                                                                    isOwn,
                                                                                    canDelete: isOwn || isGlobalAdmin,
                                                                                    canEdit:
                                                                                        isOwn &&
                                                                                        canEditMessage(
                                                                                            msg.sentAt
                                                                                        ),
                                                                                    hasMedia:
                                                                                        isPixelArt ||
                                                                                        isGif,
                                                                                    isPixelArt,
                                                                                    mediaUrl:
                                                                                        isPixelArt
                                                                                            ? getPixelArtUrl(
                                                                                                  msg.content
                                                                                              )
                                                                                            : isGif
                                                                                            ? getGifUrl(
                                                                                                  msg.content
                                                                                              )
                                                                                            : undefined,
                                                                                }
                                                                            )
                                                                        }
                                                                        className={`relative cursor-pointer ${
                                                                            selectedMessage ===
                                                                            msg.id
                                                                                ? "ring-2 ring-[#FB8D22]/50 rounded-2xl"
                                                                                : ""
                                                                        }`}
                                                                    >
                                                                        {/* Reply Preview - Check for reply pattern in message content */}
                                                                        {msg.content.startsWith(
                                                                            "↩️ "
                                                                        ) &&
                                                                            msg.content.includes(
                                                                                "\n\n"
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
                                                                                                    ":"
                                                                                                )[0]
                                                                                                .replace(
                                                                                                    "↩️ ",
                                                                                                    ""
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
                                                                                                "\n\n"
                                                                                            )[0]
                                                                                            .split(
                                                                                                ': "'
                                                                                            )[1]
                                                                                            ?.replace(
                                                                                                /\"$/,
                                                                                                ""
                                                                                            ) ||
                                                                                            ""}
                                                                                    </p>
                                                                                </div>
                                                                            )}

                                                                        {/* Message Text */}
                                                                        {(() => {
                                                                            const displayContent =
                                                                                msg.content.startsWith(
                                                                                    "↩️ "
                                                                                ) &&
                                                                                msg.content.includes(
                                                                                    "\n\n"
                                                                                )
                                                                                    ? msg.content
                                                                                          .split(
                                                                                              "\n\n"
                                                                                          )
                                                                                          .slice(
                                                                                              1
                                                                                          )
                                                                                          .join(
                                                                                              "\n\n"
                                                                                          )
                                                                                    : msg.content;
                                                                            const emojiOnly =
                                                                                isEmojiOnly(
                                                                                    displayContent
                                                                                );

                                                                            // Use ChatMarkdown for code blocks and other markdown
                                                                            if (
                                                                                hasMarkdown(
                                                                                    displayContent
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
                                                                                <p
                                                                                    className={`break-words whitespace-pre-wrap ${
                                                                                        emojiOnly
                                                                                            ? "text-4xl leading-tight"
                                                                                            : ""
                                                                                    }`}
                                                                                >
                                                                                    {
                                                                                        displayContent
                                                                                    }
                                                                                </p>
                                                                            );
                                                                        })()}

                                                                        {/* Link Previews */}
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

                                                                        {/* Message Reactions */}
                                                                        {msgReactions[
                                                                            msg
                                                                                .id
                                                                        ]?.some(
                                                                            (
                                                                                r
                                                                            ) =>
                                                                                r.count >
                                                                                0
                                                                        ) && (
                                                                            <div
                                                                                className="flex flex-wrap gap-1 mt-1"
                                                                                onClick={(
                                                                                    e
                                                                                ) =>
                                                                                    e.stopPropagation()
                                                                                }
                                                                            >
                                                                                {msgReactions[
                                                                                    msg
                                                                                        .id
                                                                                ]
                                                                                    ?.filter(
                                                                                        (
                                                                                            r
                                                                                        ) =>
                                                                                            r.count >
                                                                                            0
                                                                                    )
                                                                                    .map(
                                                                                        (
                                                                                            reaction
                                                                                        ) => (
                                                                                            <button
                                                                                                key={
                                                                                                    reaction.emoji
                                                                                                }
                                                                                                onClick={() => {
                                                                                                    toggleMsgReaction(
                                                                                                        msg.id,
                                                                                                        reaction.emoji
                                                                                                    );
                                                                                                    setSelectedMessage(
                                                                                                        null
                                                                                                    );
                                                                                                }}
                                                                                                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-colors ${
                                                                                                    reaction.hasReacted
                                                                                                        ? "bg-[#FB8D22]/30"
                                                                                                        : "bg-zinc-700/50 hover:bg-zinc-600/50"
                                                                                                }`}
                                                                                            >
                                                                                                <span>
                                                                                                    {
                                                                                                        reaction.emoji
                                                                                                    }
                                                                                                </span>
                                                                                                <span className="text-[10px]">
                                                                                                    {
                                                                                                        reaction.count
                                                                                                    }
                                                                                                </span>
                                                                                            </button>
                                                                                        )
                                                                                    )}
                                                                            </div>
                                                                        )}

                                                                        {/* Time + Read Receipt */}
                                                                        <div
                                                                            className={`flex items-center gap-1.5 mt-1 ${
                                                                                isOwn
                                                                                    ? "justify-end"
                                                                                    : ""
                                                                            }`}
                                                                        >
                                                                            <p
                                                                                className={`text-xs ${
                                                                                    isOwn
                                                                                        ? "text-[#FFF0E0]"
                                                                                        : "text-zinc-500"
                                                                                }`}
                                                                            >
                                                                                {formatTimeInTimezone(
                                                                                    msg.sentAt,
                                                                                    userTimezone
                                                                                )}
                                                                            </p>
                                                                            {isOwn &&
                                                                                (() => {
                                                                                    const status =
                                                                                        msg.status ===
                                                                                            "pending" ||
                                                                                        msg.status ===
                                                                                            "failed"
                                                                                            ? msg.status
                                                                                            : getMessageStatus(
                                                                                                  msg.id,
                                                                                                  true,
                                                                                                  peerAddress
                                                                                              );
                                                                                    const readAt =
                                                                                        status ===
                                                                                        "read"
                                                                                            ? getReadAt(
                                                                                                  msg.id,
                                                                                                  peerAddress
                                                                                              )
                                                                                            : null;
                                                                                    return (
                                                                                        <span
                                                                                            title={
                                                                                                readAt
                                                                                                    ? `Read at ${formatTimeInTimezone(
                                                                                                          new Date(
                                                                                                              readAt
                                                                                                          ),
                                                                                                          userTimezone
                                                                                                      )}`
                                                                                                    : undefined
                                                                                            }
                                                                                        >
                                                                                            <MessageStatusIndicator
                                                                                                status={
                                                                                                    status
                                                                                                }
                                                                                            />
                                                                                        </span>
                                                                                    );
                                                                                })()}
                                                                            {/* Retry button for failed messages */}
                                                                            {isOwn &&
                                                                                msg.status ===
                                                                                    "failed" && (
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            // Remove failed message and resend
                                                                                            setMessages(
                                                                                                (
                                                                                                    prev
                                                                                                ) =>
                                                                                                    prev.filter(
                                                                                                        (
                                                                                                            m
                                                                                                        ) =>
                                                                                                            m.id !==
                                                                                                            msg.id
                                                                                                    )
                                                                                            );
                                                                                            setNewMessage(
                                                                                                msg.content
                                                                                            );
                                                                                        }}
                                                                                        className="ml-2 text-xs text-red-400 hover:text-red-300 underline"
                                                                                    >
                                                                                        Retry
                                                                                    </button>
                                                                                )}
                                                                        </div>

                                                                        {/* Message Actions - Show on tap (mobile) or click */}
                                                                        <AnimatePresence>
                                                                            {selectedMessage ===
                                                                                msg.id && (
                                                                                <motion.div
                                                                                    data-message-actions
                                                                                    initial={{
                                                                                        opacity: 0,
                                                                                        scale: 0.9,
                                                                                    }}
                                                                                    animate={{
                                                                                        opacity: 1,
                                                                                        scale: 1,
                                                                                    }}
                                                                                    exit={{
                                                                                        opacity: 0,
                                                                                        scale: 0.9,
                                                                                    }}
                                                                                    onClick={(
                                                                                        e
                                                                                    ) =>
                                                                                        e.stopPropagation()
                                                                                    }
                                                                                    className={`absolute ${
                                                                                        isOwn
                                                                                            ? "left-0 -translate-x-full pr-2"
                                                                                            : "right-0 translate-x-full pl-2"
                                                                                    } top-0 flex items-center gap-1 z-10`}
                                                                                >
                                                                                    {/* React Button */}
                                                                                    <button
                                                                                        onClick={() =>
                                                                                            setShowMsgReactions(
                                                                                                showMsgReactions ===
                                                                                                    msg.id
                                                                                                    ? null
                                                                                                    : msg.id
                                                                                            )
                                                                                        }
                                                                                        className="w-8 h-8 rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center text-sm shadow-lg border border-zinc-600"
                                                                                        title="React"
                                                                                    >
                                                                                        😊
                                                                                    </button>
                                                                                    {/* Reply Button */}
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            setReplyingTo(
                                                                                                msg
                                                                                            );
                                                                                            setSelectedMessage(
                                                                                                null
                                                                                            );
                                                                                        }}
                                                                                        className="w-8 h-8 rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center shadow-lg border border-zinc-600"
                                                                                        title="Reply"
                                                                                    >
                                                                                        <svg
                                                                                            className="w-4 h-4 text-zinc-300"
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
                                                                                    </button>
                                                                                </motion.div>
                                                                            )}
                                                                        </AnimatePresence>

                                                                        {/* Quick Reaction Picker */}
                                                                        {showMsgReactions ===
                                                                            msg.id && (
                                                                            <div
                                                                                className={`absolute ${
                                                                                    isOwn
                                                                                        ? "right-0"
                                                                                        : "left-0"
                                                                                } -top-12 z-20`}
                                                                                onClick={(
                                                                                    e
                                                                                ) =>
                                                                                    e.stopPropagation()
                                                                                }
                                                                            >
                                                                                <QuickReactionPicker
                                                                                    isOpen={
                                                                                        true
                                                                                    }
                                                                                    onClose={() =>
                                                                                        setShowMsgReactions(
                                                                                            null
                                                                                        )
                                                                                    }
                                                                                    onSelect={async (
                                                                                        emoji
                                                                                    ) => {
                                                                                        const success =
                                                                                            await toggleMsgReaction(
                                                                                                msg.id,
                                                                                                emoji
                                                                                            );
                                                                                        if (
                                                                                            success
                                                                                        ) {
                                                                                            setShowMsgReactions(
                                                                                                null
                                                                                            );
                                                                                            setSelectedMessage(
                                                                                                null
                                                                                            );
                                                                                        } else {
                                                                                            console.error(
                                                                                                "[ChatModal] Failed to save reaction"
                                                                                            );
                                                                                        }
                                                                                    }}
                                                                                    emojis={
                                                                                        MESSAGE_REACTION_EMOJIS
                                                                                    }
                                                                                />
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </motion.div>
                                                    </SwipeableMessage>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>

                            {/* Typing Indicator - positioned above input area */}
                            {peerTyping && (
                                <div className="px-4 pb-2">
                                    <TypingIndicator name={displayName} />
                                </div>
                            )}

                            {/* E2E Encryption Notice with Security Status */}
                            <EncryptionIndicator
                                isSecure={securityStatus.isSecure}
                                isLoading={securityStatus.isLoading}
                            />

                            {/* Reply Preview */}
                            {replyingTo && (
                                <div className="px-4 py-2 bg-zinc-800/50 border-t border-zinc-700 flex items-center gap-2">
                                    <div className="w-1 h-8 bg-orange-500 rounded-full" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-orange-400 font-medium">
                                            Replying to{" "}
                                            {replyingTo.senderAddress.toLowerCase() ===
                                            userAddress.toLowerCase()
                                                ? "yourself"
                                                : displayName}
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

                            {/* Input - with safe area padding for bottom */}
                            <div
                                className={`border-t border-zinc-800 relative ${
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
                                {/* Hidden image input */}
                                <input
                                    type="file"
                                    ref={imageInputRef}
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleImageSelected}
                                />
                                
                                {/* Voice Recorder */}
                                <VoiceRecorder
                                    isOpen={showVoiceRecorder}
                                    onSend={handleSendVoice}
                                    onCancel={() => setShowVoiceRecorder(false)}
                                />
                                
                                <div
                                    className={`flex items-center ${
                                        isFullscreen ? "gap-3" : "gap-2"
                                    }`}
                                >
                                    {/* Consolidated attachment menu */}
                                    <ChatAttachmentMenu
                                        onImageUpload={handleImageUpload}
                                        onPixelArt={() => setShowPixelArt(true)}
                                        onGif={handleSendGif}
                                        onLocation={async (location) => {
                                            const locationMsg =
                                                formatLocationMessage(location);
                                            await sendMessage(
                                                peerAddress,
                                                locationMsg
                                            );
                                            onMessageSent?.("📍 Location");
                                        }}
                                        onVoice={() => setShowVoiceRecorder(true)}
                                        showLocation={true}
                                        showVoice={true}
                                        isUploading={isUploadingPixelArt || isUploadingVoice || isUploadingImage}
                                        disabled={!isInitialized || !!chatError}
                                    />
                                    <div className="flex-1 relative">
                                        <MentionInput
                                            value={newMessage}
                                            onChange={(val) => {
                                                if (val.length > 10000) return;
                                                setNewMessage(val);
                                                handleTyping();
                                            }}
                                            onSubmit={() => handleSend()}
                                            aria-label={`Message ${displayName}`}
                                            placeholder={
                                                isInitialized
                                                    ? "Type a message..."
                                                    : "Initializing..."
                                            }
                                            disabled={
                                                !isInitialized || !!chatError
                                            }
                                            users={[]} // DMs don't need mention suggestions
                                            className={`w-full pr-10 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20 transition-all disabled:opacity-50 ${
                                                isFullscreen
                                                    ? "py-4 px-5 text-lg"
                                                    : "py-3 px-4"
                                            }`}
                                        />
                                        {newMessage.length > 500 && (
                                            <p className="text-xs text-zinc-500">
                                                {newMessage.length.toLocaleString()}{" "}
                                                / 10,000
                                            </p>
                                        )}
                                        {/* Emoji Picker Button */}
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setShowEmojiPicker(
                                                    !showEmojiPicker
                                                )
                                            }
                                            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                                        >
                                            😊
                                        </button>
                                        {/* Emoji Picker Dropdown */}
                                        <EmojiPicker
                                            isOpen={showEmojiPicker}
                                            onClose={() =>
                                                setShowEmojiPicker(false)
                                            }
                                            onSelect={(emoji) => {
                                                setNewMessage(
                                                    (prev) => prev + emoji
                                                );
                                            }}
                                            position="top"
                                        />
                                    </div>
                                    <button
                                        onClick={() => handleSend()}
                                        disabled={
                                            !newMessage.trim() ||
                                            isSending ||
                                            !isInitialized ||
                                            !!chatError
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
                                <p className="text-zinc-600 text-xs text-center mt-2">
                                    Powered by{" "}
                                    <span className="text-[#FFBBA7]">Waku</span>{" "}
                                    • End-to-end encrypted
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    {/* Pixel Art Editor Modal */}
                    <PixelArtEditor
                        isOpen={showPixelArt}
                        onClose={() => setShowPixelArt(false)}
                        onSend={handleSendPixelArt}
                        isSending={isUploadingPixelArt}
                    />

                    {/* Image Lightbox with Share & Download */}
                    <AnimatePresence>
                        {viewingImage && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4"
                                onClick={() => setViewingImage(null)}
                            >
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.8, opacity: 0 }}
                                    className="relative max-w-full max-h-full"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {/* Close button */}
                                    <button
                                        onClick={() => setViewingImage(null)}
                                        className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white transition-colors"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            strokeWidth={2}
                                            stroke="currentColor"
                                            className="w-8 h-8"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M6 18L18 6M6 6l12 12"
                                            />
                                        </svg>
                                    </button>

                                    {/* Full-size image */}
                                    <PixelArtImage
                                        src={viewingImage}
                                        size="lg"
                                        className="!w-auto !h-auto max-w-[90vw] max-h-[80vh] min-w-[256px] min-h-[256px] shadow-2xl"
                                    />

                                    {/* Action buttons - Share & Download */}
                                    <div className="mt-4 flex justify-center gap-3">
                                        <a
                                            href={viewingImage}
                                            download
                                            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                strokeWidth={2}
                                                stroke="currentColor"
                                                className="w-4 h-4"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                                />
                                            </svg>
                                            Download
                                        </a>
                                        <a
                                            href={viewingImage}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                strokeWidth={2}
                                                stroke="currentColor"
                                                className="w-4 h-4"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                                                />
                                            </svg>
                                            Open Original
                                        </a>
                                        <PixelArtShare
                                            imageUrl={viewingImage}
                                        />
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Scroll to Bottom Button */}
                    <ScrollToBottom
                        containerRef={messagesContainerRef}
                        unreadCount={newMessageCount}
                        onScrollToBottom={resetUnreadCount}
                    />

                    {/* Message Search Overlay */}
                    <MessageSearch
                        messages={messages}
                        onSelectMessage={(msgId) => {
                            // Scroll to message (could implement smooth scrolling)
                            const element = document.getElementById(
                                `msg-${msgId}`
                            );
                            element?.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                            });
                        }}
                        onClose={() => setShowSearch(false)}
                        isOpen={showSearch}
                        userAddress={userAddress}
                        peerName={displayName}
                    />

                    {/* Conversation Actions Menu - includes View profile & Schedule a call when peerAddress set */}
                    <ConversationActionsMenu
                        isOpen={showActionsMenu}
                        onClose={() => setShowActionsMenu(false)}
                        onMute={() => setShowMuteModal(true)}
                        onBlock={() => setShowBlockModal(true)}
                        onReport={() => setShowReportModal(true)}
                        isMuted={conversationMuted}
                        isBlocked={peerBlocked}
                        showMute={true}
                        showBlock={true}
                        showReport={true}
                        peerAddress={peerAddress}
                    />

                    {/* Mute Options Modal */}
                    <MuteOptionsModal
                        isOpen={showMuteModal}
                        onClose={() => setShowMuteModal(false)}
                        onMute={async (duration) => {
                            const success = await muteConversation(
                                "dm",
                                peerAddress,
                                duration
                            );
                            return success;
                        }}
                        onUnmute={async () => {
                            const success = await unmuteConversation(
                                "dm",
                                peerAddress
                            );
                            return success;
                        }}
                        isMuted={conversationMuted}
                        conversationName={displayName}
                        muteUntil={muteInfo?.muted_until}
                    />

                    {/* Block User Modal */}
                    <BlockUserModal
                        isOpen={showBlockModal}
                        onClose={() => setShowBlockModal(false)}
                        onBlock={async () => {
                            const success = await blockUser(peerAddress);
                            return success;
                        }}
                        onUnblock={async () => {
                            const success = await unblockUser(peerAddress);
                            return success;
                        }}
                        isBlocked={peerBlocked}
                        userName={displayName}
                        userAddress={peerAddress}
                    />

                    {/* Report User Modal */}
                    <ReportUserModal
                        isOpen={showReportModal}
                        onClose={() => setShowReportModal(false)}
                        onReport={async (params) => {
                            return await reportUser({
                                reportedAddress: peerAddress,
                                reportType: params.reportType,
                                description: params.description,
                                conversationType: "dm",
                                conversationId: peerAddress,
                                alsoBlock: params.alsoBlock,
                            });
                        }}
                        userName={displayName}
                        userAddress={peerAddress}
                    />

                    {/* Message Action Bar - shows when a message is selected */}
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
                            onDelete: (selectedMessageConfig?.canDelete)
                                ? async () => {
                                      const msgId = selectedMessageConfig?.messageId;
                                      // Optimistic removal from UI
                                      setMessages((prev) =>
                                          prev.filter((m) => m.id !== msgId)
                                      );
                                      // Soft delete on backend
                                      try {
                                          await fetch("/api/messages/delete", {
                                              method: "POST",
                                              headers: { "Content-Type": "application/json" },
                                              body: JSON.stringify({ messageId: msgId }),
                                              credentials: "include",
                                          });
                                      } catch (err) {
                                          console.error("[Chat] Failed to delete message:", err);
                                      }
                                  }
                                : undefined,
                        }}
                        reactions={MESSAGE_REACTION_EMOJIS}
                    />
                </>
            )}
            <ImageViewerModal
                isOpen={!!viewerImage}
                onClose={() => setViewerImage(null)}
                imageUrl={viewerImage ?? ""}
                alt={displayName}
            />

            {/* DM Participants list - same pattern as ChatMembersList */}
            <AnimatePresence>
                {showDMMembers && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/50 z-[100]"
                            onClick={() => setShowDMMembers(false)}
                        />
                        <motion.div
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-zinc-900 border-l border-zinc-800 z-[101] flex flex-col"
                            style={{ paddingTop: "env(safe-area-inset-top)" }}
                        >
                            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                                <div>
                                    <h3 className="font-semibold text-white">Participants</h3>
                                    <p className="text-xs text-zinc-500">2 members</p>
                                </div>
                                <button
                                    onClick={() => setShowDMMembers(false)}
                                    className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-[#FB8D22]/20">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FB8D22] to-[#FF5500] flex items-center justify-center text-white font-bold text-sm shrink-0">
                                        Y
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-[#FFF0E0]">You</p>
                                        <p className="text-xs text-zinc-500 font-mono truncate">{formatAddress(userAddress)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-800/50">
                                    {peerAvatar ? (
                                        <img src={peerAvatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FB8D22] to-[#FF5500] flex items-center justify-center text-white font-bold text-sm shrink-0">
                                            {displayName[0].toUpperCase()}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-zinc-300 truncate">{displayName}</p>
                                        <p className="text-xs text-zinc-500 font-mono truncate">{formatAddress(peerAddress)}</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </AnimatePresence>
    );
}
