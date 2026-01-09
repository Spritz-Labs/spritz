"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { type Address } from "viem";
import { useXMTPContext } from "@/context/WakuProvider";
import { PixelArtEditor } from "./PixelArtEditor";
import { PixelArtImage } from "./PixelArtImage";
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
// VoiceRecorder removed - not fully implemented yet
// import { VoiceRecorder, VoiceMessage } from "./VoiceRecorder";
import { MessageSearch } from "./MessageSearch";
import { useAnalytics } from "@/hooks/useAnalytics";

type ChatModalProps = {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string; // Can be EVM or Solana address
    peerAddress: string; // Can be EVM or Solana address
    peerName?: string | null;
    peerAvatar?: string | null;
};

type Message = {
    id: string;
    content: string;
    senderAddress: string;
    sentAt: Date;
    status?: "pending" | "sent" | "failed"; // For optimistic updates
};

type ChatState = "checking" | "ready" | "error" | "loading";

export function ChatModal({
    isOpen,
    onClose,
    userAddress,
    peerAddress,
    peerName,
    peerAvatar,
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
    const [showSearch, setShowSearch] = useState(false);
    const [selectedMessage, setSelectedMessage] = useState<string | null>(null);

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
    const { markMessagesRead, getMessageStatus, fetchReadReceipts } = useReadReceipts(
        userAddress,
        conversationId
    );
    const {
        reactions: msgReactions,
        fetchReactions: fetchMsgReactions,
        toggleReaction: toggleMsgReaction,
    } = useMessageReactions(userAddress, conversationId);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamRef = useRef<any>(null);

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
    } = useXMTPContext();

    // Analytics tracking
    const { trackMessageSent } = useAnalytics(userAddress);

    const formatAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    const displayName = peerName || formatAddress(peerAddress);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Initialize Waku when modal opens
    useEffect(() => {
        if (isOpen && !isInitialized && !isInitializing) {
            initialize();
        }
    }, [isOpen, isInitialized, isInitializing, initialize]);

    // Reset state when modal closes
    useEffect(() => {
        if (isOpen) {
            // Set this chat as active to prevent unread count increments
            // This also calls markAsRead internally
            setActiveChatPeer(peerAddress);
            // Also explicitly mark as read to clear any existing unread count
            markAsRead(peerAddress);
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
                    canMessage(peerAddress).then(canChat => {
                        if (!canChat) {
                            setChatState("error");
                            setChatError(
                                `${displayName} hasn't enabled chat yet. They need to click "Enable Chat" in Spritz first.`
                            );
                        }
                    });
                }

                // Load messages immediately (may be from cache)
                console.log("[Chat] Loading messages for", peerAddress);
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
                            .filter((m: Message) => m.senderAddress.toLowerCase() === userAddress.toLowerCase())
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
                console.log("[Chat] Setting up message stream...");
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
                    console.log("[Chat] Stream setup complete:", stream);
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
                console.log(
                    "[Chat] Polling returned",
                    newMessages.length,
                    "messages"
                );

                if (newMessages.length > 0) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const formattedMessages: Message[] = newMessages
                        .filter((msg: any) => {
                            const valid =
                                typeof msg.content === "string" &&
                                msg.content.trim() !== "";
                            if (!valid && msg.id) {
                                console.log(
                                    "[Chat] Filtered out message with invalid content:",
                                    msg.id,
                                    "content type:",
                                    typeof msg.content
                                );
                            }
                            return valid;
                        })
                        .map((msg: any) => ({
                            id: msg.id,
                            content: msg.content,
                            senderAddress: msg.senderInboxId,
                            sentAt: new Date(Number(msg.sentAtNs) / 1000000),
                        }));

                    console.log(
                        "[Chat] After content filter:",
                        formattedMessages.length,
                        "messages"
                    );

                    setMessages((prev) => {
                        // Merge new messages, avoiding duplicates
                        const existingIds = new Set(prev.map((m) => m.id));
                        const newOnes = formattedMessages.filter(
                            (m) => !existingIds.has(m.id)
                        );

                        console.log(
                            "[Chat] Polling: existing IDs count:",
                            existingIds.size,
                            "formatted:",
                            formattedMessages.length,
                            "new messages:",
                            newOnes.length
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
                            return [...prev, ...newOnes].sort(
                                (a, b) =>
                                    a.sentAt.getTime() - b.sentAt.getTime()
                            );
                        }
                        return prev;
                    });
                    
                    // Also refresh read receipts for our sent messages
                    const myMsgIds = formattedMessages
                        .filter((m) => m.senderAddress.toLowerCase() === userAddress.toLowerCase())
                        .map((m) => m.id);
                    if (myMsgIds.length > 0) {
                        fetchReadReceipts(myMsgIds);
                    }
                }
            } catch (err) {
                console.log("[Chat] Polling error:", err);
            }
        }, 3000); // Poll every 3 seconds

        return () => clearInterval(pollInterval);
    }, [isOpen, isInitialized, chatState, peerAddress, getMessages, userAddress, fetchReadReceipts]);

    // Reference to track sent message IDs for read receipt checking
    const sentMessageIdsRef = useRef<string[]>([]);
    
    // Update sent message IDs ref when messages change
    useEffect(() => {
        const myMsgIds = messages
            .filter((m) => m.senderAddress.toLowerCase() === userAddress.toLowerCase())
            .filter((m) => m.status !== "pending" && m.status !== "failed")
            .map((m) => m.id);
        sentMessageIdsRef.current = myMsgIds;
    }, [messages, userAddress]);

    // Periodically check read receipts for all sent messages while chat is open
    useEffect(() => {
        if (!isOpen) return;

        const checkReadReceipts = () => {
            const myMsgIds = sentMessageIdsRef.current;
            if (myMsgIds.length > 0) {
                console.log("[Chat] Checking read receipts for", myMsgIds.length, "sent messages");
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

    // Toggle message selection for mobile tap actions
    const handleMessageTap = useCallback((messageId: string) => {
        setSelectedMessage(prev => prev === messageId ? null : messageId);
        setShowMsgReactions(null);
    }, []);

    // Close selected message when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('[data-message-actions]') && !target.closest('[data-message-bubble]')) {
                setSelectedMessage(null);
                setShowMsgReactions(null);
            }
        };
        if (selectedMessage) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [selectedMessage]);

    const handleSend = useCallback(async () => {
        if (!newMessage.trim()) return;

        const messageContent = newMessage.trim();
        const tempId = `pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Immediately add message to UI with pending status (optimistic update)
        const pendingMessage: Message = {
            id: tempId,
            content: messageContent,
            senderAddress: userAddress.toLowerCase(),
            sentAt: new Date(),
            status: "pending",
        };
        setMessages((prev) => [...prev, pendingMessage]);
        
        // Clear input immediately so user can type next message
        setNewMessage("");
        setChatError(null);
        
        // Stop typing indicator
        stopTyping();
        
        // Send in background (non-blocking)
        try {
            const result = await sendMessage(peerAddress, messageContent);
            if (result.success) {
                // Track message sent for analytics
                trackMessageSent();
                // Update message status to sent
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
                // Mark as failed
                setMessages((prev) =>
                    prev.map((m) =>
                        m.id === tempId ? { ...m, status: "failed" } : m
                    )
                );
                setChatError(
                    `Failed to send: ${result.error || "Unknown error"}`
                );
            }
        } catch (error) {
            console.error("[Chat] Send error:", error);
            // Mark as failed
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
        }
    }, [
        newMessage,
        sendMessage,
        peerAddress,
        userAddress,
        trackMessageSent,
        stopTyping,
    ]);

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

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

    // Check if a message is pixel art
    const isPixelArtMessage = (content: string) =>
        content.startsWith("[PIXEL_ART]");
    const getPixelArtUrl = (content: string) =>
        content.replace("[PIXEL_ART]", "");

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
                const showAbove = spaceAbove >= pickerRect.height + padding || spaceBelow < spaceAbove;

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
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-lg max-h-[65vh] h-[500px] z-50"
                        style={{ marginBottom: '60px' }}
                    >
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col h-full overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center gap-3 p-4 border-b border-zinc-800">
                                {peerAvatar ? (
                                    <img
                                        src={peerAvatar}
                                        alt={displayName}
                                        className="w-10 h-10 rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FB8D22] to-[#FF5500] flex items-center justify-center">
                                        <span className="text-white font-bold">
                                            {displayName[0].toUpperCase()}
                                        </span>
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-white font-semibold truncate">
                                        {displayName}
                                    </h2>
                                    <p className="text-zinc-500 text-xs font-mono truncate">
                                        {formatAddress(peerAddress)}
                                    </p>
                                </div>
                                {/* Search Button */}
                                <button
                                    onClick={() => setShowSearch(true)}
                                    className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                                    title="Search messages"
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
                                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                        />
                                    </svg>
                                </button>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
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

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {isInitializing && (
                                    <div className="flex items-center justify-center h-full">
                                        <div className="text-center">
                                            <svg
                                                className="animate-spin h-8 w-8 text-[#FF5500] mx-auto mb-3"
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
                                            <p className="text-zinc-400">
                                                Initializing Waku...
                                            </p>
                                            <p className="text-zinc-500 text-sm mt-1">
                                                Please sign the message in your
                                                wallet
                                            </p>
                                        </div>
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
                                        <div className="flex items-center justify-center h-full">
                                            <div className="text-center">
                                                <div className="w-16 h-16 rounded-full bg-[#FF5500]/10 flex items-center justify-center mx-auto mb-4">
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
                                                </div>
                                                <p className="text-zinc-400">
                                                    No messages yet
                                                </p>
                                                <p className="text-zinc-500 text-sm mt-1">
                                                    Say hello to start the
                                                    conversation!
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                {/* Deduplicate messages by ID before rendering */}
                                {Array.from(
                                    new Map(
                                        messages.map((m) => [m.id, m])
                                    ).values()
                                ).map((msg) => {
                                    // Compare addresses case-insensitively
                                    const isOwn = userAddress
                                        ? msg.senderAddress?.toLowerCase() ===
                                          userAddress.toLowerCase()
                                        : false;
                                    const isPixelArt = isPixelArtMessage(
                                        msg.content
                                    );

                                    return (
                                        <motion.div
                                            key={msg.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`flex ${
                                                isOwn
                                                    ? "justify-end"
                                                    : "justify-start"
                                            }`}
                                        >
                                            <div
                                                className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                                                    isOwn
                                                        ? msg.status === "failed"
                                                            ? "bg-red-500/80 text-white rounded-br-md"
                                                            : msg.status === "pending"
                                                            ? "bg-[#FF5500]/70 text-white rounded-br-md"
                                                            : "bg-[#FF5500] text-white rounded-br-md"
                                                        : "bg-zinc-800 text-white rounded-bl-md"
                                                }`}
                                            >
                                                {isPixelArt ? (
                                                    <div className="pixel-art-message relative">
                                                        <PixelArtImage
                                                            src={getPixelArtUrl(
                                                                msg.content
                                                            )}
                                                            onClick={() =>
                                                                setViewingImage(
                                                                    getPixelArtUrl(
                                                                        msg.content
                                                                    )
                                                                )
                                                            }
                                                            size="md"
                                                        />

                                                        {/* Reactions Display */}
                                                        {reactions[
                                                            getPixelArtUrl(
                                                                msg.content
                                                            )
                                                        ]?.some(
                                                            (r) => r.count > 0
                                                        ) && (
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {reactions[
                                                                    getPixelArtUrl(
                                                                        msg.content
                                                                    )
                                                                ]
                                                                    ?.filter(
                                                                        (r) =>
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
                                                                                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-colors ${
                                                                                    reaction.hasReacted
                                                                                        ? "bg-[#FB8D22]/30 text-[#FFF0E0]"
                                                                                        : "bg-zinc-700/50 text-zinc-300 hover:bg-zinc-600/50"
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

                                                        {/* Add Reaction Button */}
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
                                                                className={`text-xs px-2 py-1 rounded-full transition-colors ${
                                                                    isOwn
                                                                        ? "text-[#FFF0E0] hover:bg-[#FF5500]/30"
                                                                        : "text-zinc-400 hover:bg-zinc-700"
                                                                }`}
                                                            >
                                                                + React
                                                            </button>

                                                            {/* Reaction Picker */}
                                                            <AnimatePresence>
                                                                {showReactionPicker ===
                                                                    getPixelArtUrl(
                                                                        msg.content
                                                                    ) && (
                                                                    <PixelArtReactionPickerWrapper
                                                                        isOwn={isOwn}
                                                                        onReaction={(emoji) =>
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
                                                                        reactionEmojis={REACTION_EMOJIS}
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
                                                            🎨 Pixel Art •{" "}
                                                            {msg.sentAt.toLocaleTimeString(
                                                                [],
                                                                {
                                                                    hour: "2-digit",
                                                                    minute: "2-digit",
                                                                }
                                                            )}
                                                        </p>
                                                    </div>
                                                ) : (
                                                    <div 
                                                        data-message-bubble
                                                        onClick={() => handleMessageTap(msg.id)}
                                                        className={`relative cursor-pointer ${selectedMessage === msg.id ? "ring-2 ring-[#FB8D22]/30 rounded-lg -m-1 p-1" : ""}`}
                                                    >
                                                        {/* Reply Preview - Check for reply pattern in message content */}
                                                        {msg.content.startsWith("↩️ ") && msg.content.includes("\n\n") && (
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
                                                                        {msg.content.split(":")[0].replace("↩️ ", "")}
                                                                    </span>
                                                                </div>
                                                                <p className={`text-xs mt-1 line-clamp-2 ${isOwn ? "text-white/70" : "text-zinc-400"}`}>
                                                                    {msg.content.split("\n\n")[0].split(": \"")[1]?.replace(/\"$/, "") || ""}
                                                                </p>
                                                            </div>
                                                        )}
                                                        
                                                        {/* Message Text */}
                                                        <p className="break-words whitespace-pre-wrap">
                                                            {msg.content.startsWith("↩️ ") && msg.content.includes("\n\n") 
                                                                ? msg.content.split("\n\n").slice(1).join("\n\n")
                                                                : msg.content}
                                                        </p>

                                                        {/* Link Previews */}
                                                        {detectUrls(msg.content)
                                                            .slice(0, 1)
                                                            .map((url) => (
                                                                <LinkPreview
                                                                    key={url}
                                                                    url={url}
                                                                    compact
                                                                />
                                                            ))}

                                                        {/* Message Reactions */}
                                                        {msgReactions[
                                                            msg.id
                                                        ]?.some(
                                                            (r) => r.count > 0
                                                        ) && (
                                                            <div className="flex flex-wrap gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                                                                {msgReactions[
                                                                    msg.id
                                                                ]
                                                                    ?.filter(
                                                                        (r) =>
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
                                                                                    setSelectedMessage(null);
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
                                                                {msg.sentAt.toLocaleTimeString(
                                                                    [],
                                                                    {
                                                                        hour: "2-digit",
                                                                        minute: "2-digit",
                                                                    }
                                                                )}
                                                            </p>
                                                            {isOwn && (
                                                                <MessageStatusIndicator
                                                                    status={
                                                                        msg.status === "pending" || msg.status === "failed"
                                                                            ? msg.status
                                                                            : getMessageStatus(
                                                                                  msg.id,
                                                                                  true,
                                                                                  peerAddress
                                                                              )
                                                                    }
                                                                />
                                                            )}
                                                            {/* Retry button for failed messages */}
                                                            {isOwn && msg.status === "failed" && (
                                                                <button
                                                                    onClick={() => {
                                                                        // Remove failed message and resend
                                                                        setMessages((prev) =>
                                                                            prev.filter((m) => m.id !== msg.id)
                                                                        );
                                                                        setNewMessage(msg.content);
                                                                    }}
                                                                    className="ml-2 text-xs text-red-400 hover:text-red-300 underline"
                                                                >
                                                                    Retry
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Message Actions - Show on tap (mobile) or click */}
                                                        <AnimatePresence>
                                                            {selectedMessage === msg.id && (
                                                                <motion.div
                                                                    data-message-actions
                                                                    initial={{ opacity: 0, scale: 0.9 }}
                                                                    animate={{ opacity: 1, scale: 1 }}
                                                                    exit={{ opacity: 0, scale: 0.9 }}
                                                                    onClick={(e) => e.stopPropagation()}
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
                                                                            setReplyingTo(msg);
                                                                            setSelectedMessage(null);
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
                                                                                strokeWidth={2}
                                                                                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                                                                            />
                                                                        </svg>
                                                                    </button>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>

                                                        {/* Quick Reaction Picker */}
                                                        {showMsgReactions === msg.id && (
                                                            <div
                                                                className={`absolute ${
                                                                    isOwn
                                                                        ? "right-0"
                                                                        : "left-0"
                                                                } -top-12 z-20`}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <QuickReactionPicker
                                                                    isOpen={true}
                                                                    onClose={() => setShowMsgReactions(null)}
                                                                    onSelect={async (emoji) => {
                                                                        const success = await toggleMsgReaction(
                                                                            msg.id,
                                                                            emoji
                                                                        );
                                                                        if (success) {
                                                                            setShowMsgReactions(null);
                                                                            setSelectedMessage(null);
                                                                        } else {
                                                                            console.error("[ChatModal] Failed to save reaction");
                                                                        }
                                                                    }}
                                                                    emojis={MESSAGE_REACTION_EMOJIS}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                                <div ref={messagesEndRef} />

                                {/* Typing Indicator */}
                                {peerTyping && (
                                    <TypingIndicator name={displayName} />
                                )}
                            </div>

                            {/* E2E Encryption Notice */}
                            <EncryptionIndicator />

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

                            {/* Input */}
                            <div className="p-4 border-t border-zinc-800">
                                <div className="flex items-center gap-2">
                                    {/* Pixel Art Button */}
                                    <button
                                        onClick={() => setShowPixelArt(true)}
                                        disabled={!isInitialized || !!chatError}
                                        className="p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-[#FFBBA7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Send Pixel Art"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            strokeWidth={2}
                                            stroke="currentColor"
                                            className="w-5 h-5"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42"
                                            />
                                        </svg>
                                    </button>
                                    <div className="flex-1 relative">
                                        <input
                                            type="text"
                                            inputMode="text"
                                            enterKeyHint="send"
                                            autoComplete="off"
                                            autoCorrect="on"
                                            autoCapitalize="sentences"
                                            value={newMessage}
                                            onChange={(e) => {
                                                setNewMessage(e.target.value);
                                                handleTyping();
                                            }}
                                            onKeyDown={handleKeyPress}
                                            onBlur={stopTyping}
                                            placeholder={
                                                isInitialized
                                                    ? "Type a message..."
                                                    : "Initializing..."
                                            }
                                            disabled={
                                                !isInitialized || !!chatError
                                            }
                                            className="w-full py-3 px-4 pr-10 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20 transition-all disabled:opacity-50"
                                        />
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
                                        onClick={handleSend}
                                        disabled={
                                            !newMessage.trim() ||
                                            isSending ||
                                            !isInitialized ||
                                            !!chatError
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

                    {/* Image Lightbox */}
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

                                    {/* Full-size pixel art image */}
                                    <PixelArtImage
                                        src={viewingImage}
                                        size="lg"
                                        className="!w-auto !h-auto max-w-[90vw] max-h-[80vh] min-w-[256px] min-h-[256px] shadow-2xl"
                                    />

                                    {/* Download link */}
                                    <div className="mt-4 flex justify-center">
                                        <a
                                            href={viewingImage}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
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
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

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
                </>
            )}
        </AnimatePresence>
    );
}
