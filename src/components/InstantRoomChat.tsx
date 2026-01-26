"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import protobuf from "protobufjs";
import { MessageActionsSheet, ActionIcons } from "./MessageActionsSheet";

// Helper to detect if a message is emoji-only (for larger display)
const EMOJI_REGEX = /^[\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Modifier_Base}\p{Emoji_Presentation}\u200d\ufe0f\s]+$/u;
const isEmojiOnly = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (!EMOJI_REGEX.test(trimmed)) return false;
    const emojiCount = [...trimmed].filter(char => /\p{Emoji}/u.test(char) && !/\d/u.test(char)).length;
    return emojiCount >= 1 && emojiCount <= 3;
};

// Message structure using Protobuf
const ChatMessage = new protobuf.Type("InstantRoomChatMessage")
    .add(new protobuf.Field("timestamp", 1, "uint64"))
    .add(new protobuf.Field("sender", 2, "string"))
    .add(new protobuf.Field("content", 3, "string"))
    .add(new protobuf.Field("messageId", 4, "string"));

type Message = {
    id: string;
    sender: string;
    content: string;
    timestamp: number;
    isMe: boolean;
    replyTo?: {
        id: string;
        sender: string;
        content: string;
    };
};

type MessageReaction = {
    emoji: string;
    users: string[];
};

const REACTION_EMOJIS = ["👍", "❤️", "🔥", "😂", "🤙", "🤯", "🙏", "💯", "🙌", "🎉"];

// Dynamic imports for Waku
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wakuSdk: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wakuEncryption: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wakuUtils: any = null;

async function loadWakuSDK(): Promise<boolean> {
    if (wakuSdk && wakuEncryption && wakuUtils) return true;

    try {
        const [sdk, encryption, utils] = await Promise.all([
            import("@waku/sdk"),
            import("@waku/message-encryption/symmetric"),
            import("@waku/utils/bytes"),
        ]);
        wakuSdk = sdk;
        wakuEncryption = encryption;
        wakuUtils = utils;
        console.log("[InstantRoomChat] Waku SDK loaded");
        return true;
    } catch (err) {
        console.error("[InstantRoomChat] Failed to load Waku SDK:", err);
        return false;
    }
}

// Derive a symmetric key from the room code
async function deriveKeyFromRoomCode(roomCode: string): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const data = encoder.encode(
        `spritz-instant-room-${roomCode.toUpperCase()}`
    );

    // Use SHA-256 to derive a 32-byte key
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return new Uint8Array(hashBuffer);
}

function generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

type InstantRoomChatProps = {
    roomCode: string;
    displayName: string;
    isOpen: boolean;
    onClose: () => void;
    onUnreadChange?: (count: number) => void;
};

export function InstantRoomChat({
    roomCode,
    displayName,
    isOpen,
    onClose,
    onUnreadChange,
}: InstantRoomChatProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({});
    const [inputValue, setInputValue] = useState("");
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
    const [selectedMessage, setSelectedMessage] = useState<string | null>(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const encoderRef = useRef<any>(null);
    const symmetricKeyRef = useRef<Uint8Array | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const seenMessageIds = useRef<Set<string>>(new Set());
    const wasOpenRef = useRef(isOpen);

    const contentTopic = `/spritz/1/instant-room/${roomCode.toUpperCase()}/proto`;

    // Scroll to bottom when new messages arrive
    useEffect(() => {
        if (isOpen && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isOpen]);

    // Track unread messages when chat is closed
    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            // Chat was just opened, clear unread
            setUnreadCount(0);
            onUnreadChange?.(0);
        }
        wasOpenRef.current = isOpen;
    }, [isOpen, onUnreadChange]);

    // Initialize Waku connection
    const initializeWaku = useCallback(async () => {
        if (nodeRef.current || isConnecting) return;

        setIsConnecting(true);
        setError(null);

        try {
            const loaded = await loadWakuSDK();
            if (!loaded) {
                throw new Error("Failed to load Waku SDK");
            }

            console.log("[InstantRoomChat] Creating Waku node...");

            // Derive symmetric key from room code
            symmetricKeyRef.current = await deriveKeyFromRoomCode(roomCode);

            // Create a light node
            const node = await wakuSdk.createLightNode({
                defaultBootstrap: true,
                networkConfig: {
                    clusterId: 1,
                    shards: [0],
                },
            });

            console.log("[InstantRoomChat] Starting Waku node...");
            await node.start();

            // Wait for peer connections
            console.log("[InstantRoomChat] Waiting for peers...");
            await node.waitForPeers([
                wakuSdk.Protocols.LightPush,
                wakuSdk.Protocols.Filter,
            ]);

            nodeRef.current = node;

            // Create encoder with symmetric encryption
            const routingInfo =
                wakuSdk.utils.StaticShardingRoutingInfo.fromShard(0, {
                    clusterId: 1,
                });

            encoderRef.current = wakuEncryption.createEncoder({
                contentTopic,
                routingInfo,
                symKey: symmetricKeyRef.current,
            });

            // Create decoder and subscribe to messages (must include routingInfo like encoder)
            const decoder = wakuEncryption.createDecoder(
                contentTopic,
                routingInfo,
                symmetricKeyRef.current
            );

            await node.filter.subscribe(
                [decoder],
                (wakuMessage: { payload?: Uint8Array }) => {
                    try {
                        if (!wakuMessage.payload) return;

                        const decoded = ChatMessage.decode(
                            wakuMessage.payload
                        ) as unknown as {
                            timestamp: number | { low: number; high: number };
                            sender: string;
                            content: string;
                            messageId: string;
                        };

                        // Skip duplicates
                        if (seenMessageIds.current.has(decoded.messageId)) {
                            return;
                        }
                        seenMessageIds.current.add(decoded.messageId);

                        const timestamp =
                            typeof decoded.timestamp === "object"
                                ? decoded.timestamp.low
                                : Number(decoded.timestamp);

                        const newMessage: Message = {
                            id: decoded.messageId,
                            sender: decoded.sender,
                            content: decoded.content,
                            timestamp,
                            isMe: decoded.sender === displayName,
                        };

                        setMessages((prev) => {
                            // Check if we already have this message
                            if (prev.some((m) => m.id === newMessage.id)) {
                                return prev;
                            }
                            return [...prev, newMessage].sort(
                                (a, b) => a.timestamp - b.timestamp
                            );
                        });

                        // Increment unread if chat is closed and message is from someone else
                        if (!wasOpenRef.current && !newMessage.isMe) {
                            setUnreadCount((prev) => {
                                const newCount = prev + 1;
                                onUnreadChange?.(newCount);
                                return newCount;
                            });
                        }
                    } catch (err) {
                        console.error(
                            "[InstantRoomChat] Error decoding message:",
                            err
                        );
                    }
                }
            );

            console.log("[InstantRoomChat] Connected and subscribed!");
            setIsConnected(true);
        } catch (err) {
            console.error("[InstantRoomChat] Connection error:", err);
            setError("Failed to connect to chat. Try refreshing.");
        } finally {
            setIsConnecting(false);
        }
    }, [roomCode, displayName, contentTopic, onUnreadChange]);

    // Initialize on mount
    useEffect(() => {
        initializeWaku();

        return () => {
            if (nodeRef.current) {
                console.log("[InstantRoomChat] Stopping Waku node...");
                nodeRef.current.stop().catch(() => {});
                nodeRef.current = null;
            }
        };
    }, [initializeWaku]);

    // Toggle reaction
    const toggleReaction = useCallback((messageId: string, emoji: string) => {
        setReactions(prev => {
            const updated = { ...prev };
            if (!updated[messageId]) {
                updated[messageId] = REACTION_EMOJIS.map(e => ({
                    emoji: e,
                    users: [],
                }));
            }
            
            const idx = updated[messageId].findIndex(r => r.emoji === emoji);
            if (idx >= 0) {
                const hasReacted = updated[messageId][idx].users.includes(displayName);
                if (hasReacted) {
                    updated[messageId][idx].users = updated[messageId][idx].users.filter(u => u !== displayName);
                } else {
                    updated[messageId][idx].users = [...updated[messageId][idx].users, displayName];
                }
            }
            
            return updated;
        });
        setShowReactionPicker(null);
        setSelectedMessage(null);
    }, [displayName]);

    // Toggle message selection for mobile tap actions
    const handleMessageTap = useCallback((messageId: string) => {
        setSelectedMessage(prev => prev === messageId ? null : messageId);
        setShowReactionPicker(null);
    }, []);

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

    // Send a message
    const sendMessage = useCallback(async () => {
        if (!inputValue.trim() || !nodeRef.current || !encoderRef.current)
            return;

        const messageId = generateMessageId();
        const timestamp = Date.now();
        
        // Include reply context if replying
        let content = inputValue.trim();
        const replyData = replyingTo ? {
            id: replyingTo.id,
            sender: replyingTo.sender,
            content: replyingTo.content.slice(0, 50) + (replyingTo.content.length > 50 ? "..." : ""),
        } : undefined;

        // Add to seen BEFORE sending to prevent duplicate when message comes back
        seenMessageIds.current.add(messageId);

        // Add to local state immediately (optimistic update)
        const newMessage: Message = {
            id: messageId,
            sender: displayName,
            content,
            timestamp,
            isMe: true,
            replyTo: replyData,
        };
        setMessages((prev) => [...prev, newMessage]);
        setInputValue("");
        setReplyingTo(null);

        try {
            // Include reply in message content for others to see
            const sendContent = replyData 
                ? `↩️ ${replyData.sender}: "${replyData.content}"\n\n${content}`
                : content;
            
            const messageObj = ChatMessage.create({
                timestamp,
                sender: displayName,
                content: sendContent,
                messageId,
            });

            const payload = ChatMessage.encode(messageObj).finish();

            await nodeRef.current.lightPush.send(encoderRef.current, {
                payload,
            });
        } catch (err) {
            console.error("[InstantRoomChat] Send error:", err);
        }
    }, [inputValue, displayName, replyingTo]);

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="w-full sm:w-80 flex-shrink-0 bg-zinc-900/95 backdrop-blur-sm border-l border-zinc-800 flex flex-col z-10"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-3 border-b border-zinc-800">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">💬</span>
                            <span className="font-medium text-white">Chat</span>
                            {isConnected && (
                                <span
                                    className="w-2 h-2 bg-green-500 rounded-full"
                                    title="Connected"
                                />
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 hover:bg-zinc-800 rounded-lg transition-colors"
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
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>

                    {/* E2E Badge */}
                    <div className="px-3 py-2 bg-emerald-500/10 border-b border-emerald-500/20">
                        <div className="flex items-center gap-2 text-xs text-emerald-400">
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
                                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                />
                            </svg>
                            <span>End-to-end encrypted via Waku</span>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3">
                        {isConnecting && (
                            <div className="flex items-center justify-center py-8">
                                <div className="flex items-center gap-2 text-zinc-400 text-sm">
                                    <div className="w-4 h-4 border-2 border-zinc-600 border-t-orange-500 rounded-full animate-spin" />
                                    <span>Connecting...</span>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                <p className="text-red-400 text-sm">{error}</p>
                                <button
                                    onClick={initializeWaku}
                                    className="mt-2 text-xs text-red-300 hover:text-red-200"
                                >
                                    Try again
                                </button>
                            </div>
                        )}

                        {isConnected && messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                                <span className="text-3xl mb-2">👋</span>
                                <p className="text-zinc-400 text-sm">
                                    No messages yet
                                </p>
                                <p className="text-zinc-500 text-xs">
                                    Be the first to say hello!
                                </p>
                            </div>
                        )}

                        {messages.map((msg) => {
                            // Parse reply from message content for incoming messages
                            const hasInlineReply = msg.content.startsWith("↩️ ") && msg.content.includes("\n\n");
                            const displayContent = hasInlineReply 
                                ? msg.content.split("\n\n").slice(1).join("\n\n")
                                : msg.content;
                            const inlineReplyText = hasInlineReply 
                                ? msg.content.split("\n\n")[0].replace("↩️ ", "")
                                : null;
                            
                            return (
                                <div
                                    key={msg.id}
                                    className={`flex flex-col ${
                                        msg.isMe ? "items-end" : "items-start"
                                    }`}
                                >
                                    <div
                                        data-message-bubble
                                        onClick={() => handleMessageTap(msg.id)}
                                        className={`max-w-[85%] rounded-2xl px-3 py-2 relative cursor-pointer ${
                                            msg.isMe
                                                ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white"
                                                : "bg-zinc-800 text-white"
                                        } ${selectedMessage === msg.id ? "ring-2 ring-orange-400/50" : ""}`}
                                    >
                                        {!msg.isMe && (
                                            <p className="text-xs font-medium text-zinc-400 mb-1">
                                                {msg.sender}
                                            </p>
                                        )}
                                        
                                        {/* Reply Preview - For messages with replyTo data or inline reply */}
                                        {(msg.replyTo || inlineReplyText) && (
                                            <div 
                                                className={`mb-2 p-2 rounded-lg ${
                                                    msg.isMe 
                                                        ? "bg-white/10 border-l-2 border-white/40" 
                                                        : "bg-zinc-700/50 border-l-2 border-orange-500"
                                                }`}
                                            >
                                                <div className="flex items-center gap-1.5 text-xs font-medium">
                                                    <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                    </svg>
                                                    <span className={msg.isMe ? "text-white/80" : "text-orange-400"}>
                                                        {msg.replyTo?.sender || inlineReplyText?.split(":")[0] || ""}
                                                    </span>
                                                </div>
                                                <p className={`text-xs mt-1 line-clamp-2 ${msg.isMe ? "text-white/70" : "text-zinc-400"}`}>
                                                    {msg.replyTo?.content || inlineReplyText?.split(": \"")[1]?.replace(/\"$/, "") || ""}
                                                </p>
                                            </div>
                                        )}
                                        
                                        <p className={`break-words whitespace-pre-wrap ${isEmojiOnly(displayContent) ? "text-4xl leading-tight" : "text-sm"}`}>
                                            {displayContent}
                                        </p>

                                        {/* Reactions Display - Mobile Friendly */}
                                        {reactions[msg.id]?.some(r => r.users.length > 0) && (
                                            <div className="flex flex-wrap gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                                                {reactions[msg.id]
                                                    ?.filter(r => r.users.length > 0)
                                                    .map(reaction => {
                                                        const hasReacted = reaction.users.includes(displayName);
                                                        return (
                                                            <button
                                                                key={reaction.emoji}
                                                                onClick={() => toggleReaction(msg.id, reaction.emoji)}
                                                                className={`
                                                                    flex items-center gap-1 rounded-full transition-all duration-100
                                                                    min-w-[44px] min-h-[32px] px-2.5 py-1
                                                                    sm:min-w-[36px] sm:min-h-[28px] sm:px-2 sm:py-0.5
                                                                    active:scale-95
                                                                    ${hasReacted
                                                                        ? msg.isMe 
                                                                            ? "bg-white/25 text-white" 
                                                                            : "bg-[#FF5500]/25 text-[#FF5500]"
                                                                        : msg.isMe 
                                                                            ? "bg-white/10 hover:bg-white/20 text-white/80" 
                                                                            : "bg-zinc-700/60 hover:bg-zinc-600/60 text-zinc-300"
                                                                    }
                                                                `}
                                                            >
                                                                <span className="text-base sm:text-sm">{reaction.emoji}</span>
                                                                <span className="text-xs font-medium">{reaction.users.length}</span>
                                                            </button>
                                                        );
                                                    })}
                                            </div>
                                        )}

                                        {/* Message Actions Sheet - Mobile Friendly */}
                                        <MessageActionsSheet
                                            isOpen={selectedMessage === msg.id}
                                            onClose={() => setSelectedMessage(null)}
                                            reactions={REACTION_EMOJIS}
                                            onReaction={(emoji) => {
                                                toggleReaction(msg.id, emoji);
                                                setSelectedMessage(null);
                                            }}
                                            messagePreview={msg.content.slice(0, 50) + (msg.content.length > 50 ? "..." : "")}
                                            actions={[
                                                {
                                                    id: "reply",
                                                    label: "Reply",
                                                    icon: ActionIcons.reply,
                                                    onClick: () => {
                                                        setReplyingTo(msg);
                                                        setSelectedMessage(null);
                                                    },
                                                },
                                                {
                                                    id: "copy",
                                                    label: "Copy Text",
                                                    icon: ActionIcons.copy,
                                                    onClick: () => {
                                                        navigator.clipboard.writeText(msg.content);
                                                        setSelectedMessage(null);
                                                    },
                                                },
                                            ]}
                                        />
                                    </div>
                                    <span className="text-xs text-zinc-500 mt-1 px-1">
                                        {formatTime(msg.timestamp)}
                                    </span>
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Reply Preview */}
                    {replyingTo && (
                        <div className="px-4 py-2 bg-zinc-800/50 border-t border-zinc-700 flex items-center gap-2">
                            <div className="w-1 h-8 bg-orange-500 rounded-full" />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-orange-400 font-medium">
                                    Replying to {replyingTo.isMe ? "yourself" : replyingTo.sender}
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

                    {/* Input */}
                    <div className="p-3 border-t border-zinc-800">
                        <div className="flex items-center gap-2">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyPress}
                                placeholder={
                                    isConnected
                                        ? replyingTo ? "Type your reply..." : "Type a message..."
                                        : "Connecting..."
                                }
                                disabled={!isConnected}
                                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-50"
                            />
                            <button
                                onClick={sendMessage}
                                disabled={!inputValue.trim() || !isConnected}
                                className="p-2 bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl text-white disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-orange-500/25 transition-all"
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
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
