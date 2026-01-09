"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { type Address } from "viem";
import { useXMTPContext, type XMTPGroup } from "@/context/WakuProvider";
import { PixelArtEditor } from "./PixelArtEditor";
import { PixelArtImage } from "./PixelArtImage";
import {
    useMessageReactions,
    MESSAGE_REACTION_EMOJIS,
} from "@/hooks/useChatFeatures";
import { QuickReactionPicker } from "./EmojiPicker";

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
        isVideo: boolean
    ) => void;
    hasActiveCall?: boolean;
    // For displaying usernames/avatars
    getUserInfo?: (address: string) => {
        name: string | null;
        avatar: string | null;
    } | null;
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
    hasActiveCall = false,
    getUserInfo,
}: GroupChatModalProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showMembers, setShowMembers] = useState(false);
    const [showPixelArt, setShowPixelArt] = useState(false);
    const [isUploadingPixelArt, setIsUploadingPixelArt] = useState(false);
    const [showAddMember, setShowAddMember] = useState(false);
    const [isAddingMember, setIsAddingMember] = useState(false);
    const [isLeavingGroup, setIsLeavingGroup] = useState(false);
    const [showManageMenu, setShowManageMenu] = useState(false);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [showReactionPicker, setShowReactionPicker] = useState<string | null>(
        null
    );
    const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const streamRef = useRef<any>(null);

    // Message reactions hook (using group.id as conversation_id)
    const {
        reactions: msgReactions,
        fetchReactions: fetchMsgReactions,
        toggleReaction: toggleMsgReaction,
    } = useMessageReactions(userAddress, group?.id || null);

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

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Scroll to bottom immediately when modal opens
    useEffect(() => {
        if (isOpen && messages.length > 0) {
            // Use setTimeout to ensure DOM is rendered
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
            }, 100);
        }
    }, [isOpen, messages.length]);

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
            if (
                !target.closest("[data-message-actions]") &&
                !target.closest("[data-message-bubble]")
            ) {
                setSelectedMessage(null);
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
                            msg.content.trim() !== ""
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

                // Mark as read
                markGroupAsRead(group.id);

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
                            return [...prev, newMsg];
                        });
                        markGroupAsRead(group.id);
                    }
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
    ]);

    // Send message
    const handleSend = useCallback(async () => {
        if (!newMessage.trim() || isSending || !group) return;

        setIsSending(true);
        setError(null);

        try {
            // Include reply context if replying
            let messageContent = newMessage.trim();
            if (replyingTo) {
                const replySender = members.find(
                    (m) => m.inboxId === replyingTo.senderInboxId
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
                              -4
                          )}`
                        : "Unknown");
                messageContent = `↩️ ${senderDisplay}: "${replyPreview}"\n\n${messageContent}`;
            }

            const result = await sendGroupMessage(group.id, messageContent);
            if (result.success) {
                setNewMessage("");
                setReplyingTo(null);
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
                    pixelArtMessage
                );

                if (!result.success) {
                    throw new Error(result.error || "Failed to send");
                }

                setShowPixelArt(false);
            } catch (err) {
                setError(
                    `Failed to send pixel art: ${
                        err instanceof Error ? err.message : "Unknown error"
                    }`
                );
            } finally {
                setIsUploadingPixelArt(false);
            }
        },
        [group, userAddress, sendGroupMessage]
    );

    // Check if message is pixel art
    const isPixelArtMessage = (content: string) =>
        content.startsWith("[PIXEL_ART]");
    const getPixelArtUrl = (content: string) =>
        content.replace("[PIXEL_ART]", "");

    // Format member address - show username if available
    const formatAddress = (address: string) => {
        const info = getUserInfo?.(address);
        if (info?.name) return info.name;
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    // Get member avatar
    const getMemberAvatar = (address: string) => {
        return getUserInfo?.(address)?.avatar || null;
    };

    // Get friends not already in the group
    const availableFriends = friends.filter((friend) => {
        const friendAddressLower = friend.address.toLowerCase();
        return !members.some((m) =>
            m.addresses.some(
                (addr) => addr.toLowerCase() === friendAddressLower
            )
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
            "Are you sure you want to leave this group? You won't be able to see messages anymore."
        );
        if (!confirmed) return;

        setIsLeavingGroup(true);
        setError(null);

        try {
            console.log("[GroupChat] Attempting to leave group:", group.id);
            const result = await leaveGroup(group.id);
            console.log("[GroupChat] Leave result:", result);

            if (result.success) {
                onGroupDeleted?.();
                onClose();
            } else {
                setError(result.error || "Failed to leave group");
            }
        } catch (err) {
            console.error("[GroupChat] Leave error:", err);
            setError(
                err instanceof Error ? err.message : "Failed to leave group"
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
                        className="fixed inset-4 bottom-32 sm:inset-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg sm:max-h-[65vh] sm:h-[550px] z-50"
                    >
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl h-full flex flex-col overflow-hidden">
                            {/* Header */}
                            <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
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
                                            d="M15 19l-7-7 7-7"
                                        />
                                    </svg>
                                </button>

                                <div className="flex-1 min-w-0">
                                    <h2 className="text-white font-semibold truncate flex items-center gap-2">
                                        {group.emoji && (
                                            <span>{group.emoji}</span>
                                        )}
                                        {group.name}
                                    </h2>
                                    <button
                                        onClick={() =>
                                            setShowMembers(!showMembers)
                                        }
                                        className="text-zinc-500 text-sm hover:text-zinc-400 transition-colors"
                                    >
                                        {members.length} members •{" "}
                                        {showMembers ? "Hide" : "Show"}
                                    </button>
                                </div>

                                {/* Call Buttons */}
                                {onStartCall && (
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() =>
                                                onStartCall(
                                                    group.id,
                                                    group.name,
                                                    false
                                                )
                                            }
                                            disabled={hasActiveCall}
                                            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-emerald-400 hover:text-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Start Voice Call"
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
                                                    true
                                                )
                                            }
                                            disabled={hasActiveCall}
                                            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-[#FFBBA7] hover:text-[#FFF0E0] disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Start Video Call"
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
                                    </div>
                                )}

                                {/* Manage Menu */}
                                <div className="relative">
                                    <button
                                        onClick={() =>
                                            setShowManageMenu(!showManageMenu)
                                        }
                                        className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
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
                                                            false
                                                        );
                                                        setShowAddMember(true);
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
                                                <button
                                                    onClick={() => {
                                                        setShowManageMenu(
                                                            false
                                                        );
                                                        handleLeaveGroup();
                                                    }}
                                                    disabled={isLeavingGroup}
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

                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FB8D22] to-[#FF5500] flex items-center justify-center">
                                    <svg
                                        className="w-5 h-5 text-white"
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
                                </div>
                            </div>

                            {/* Members Panel */}
                            <AnimatePresence>
                                {showMembers && (
                                    <motion.div
                                        initial={{ height: 0 }}
                                        animate={{ height: "auto" }}
                                        exit={{ height: 0 }}
                                        className="overflow-hidden border-b border-zinc-800"
                                    >
                                        <div className="p-3 bg-zinc-800/50 max-h-40 overflow-y-auto">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-zinc-500 text-xs">
                                                    Group Members (
                                                    {members.length})
                                                </p>
                                                <button
                                                    onClick={() =>
                                                        setShowAddMember(true)
                                                    }
                                                    disabled={
                                                        availableFriends.length ===
                                                        0
                                                    }
                                                    className="text-xs text-[#FFBBA7] hover:text-[#FFF0E0] disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    + Add
                                                </button>
                                            </div>
                                            <div className="space-y-1">
                                                {members.map((member) => {
                                                    const isMe =
                                                        member.inboxId ===
                                                        userInboxId;
                                                    const memberAddress =
                                                        member.addresses[0] ||
                                                        "";

                                                    return (
                                                        <div
                                                            key={member.inboxId}
                                                            className={`flex items-center justify-between px-2 py-1.5 rounded-lg ${
                                                                isMe
                                                                    ? "bg-[#FB8D22]/20"
                                                                    : "bg-zinc-700/50"
                                                            }`}
                                                        >
                                                            <span
                                                                className={`text-xs ${
                                                                    isMe
                                                                        ? "text-[#FFF0E0]"
                                                                        : "text-zinc-300"
                                                                }`}
                                                            >
                                                                {isMe
                                                                    ? "You"
                                                                    : formatAddress(
                                                                          memberAddress
                                                                      )}
                                                            </span>
                                                            {!isMe && (
                                                                <button
                                                                    onClick={() =>
                                                                        handleRemoveMember(
                                                                            memberAddress
                                                                        )
                                                                    }
                                                                    className="text-zinc-500 hover:text-red-400 transition-colors p-1"
                                                                    title="Remove from group"
                                                                >
                                                                    <svg
                                                                        className="w-3 h-3"
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
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {isLoading ? (
                                    <div className="flex items-center justify-center h-full">
                                        <div className="w-8 h-8 border-2 border-[#FB8D22] border-t-transparent rounded-full animate-spin" />
                                    </div>
                                ) : error ? (
                                    <div className="flex items-center justify-center h-full">
                                        <p className="text-red-400">{error}</p>
                                    </div>
                                ) : messages.length === 0 ? (
                                    <div className="flex items-center justify-center h-full">
                                        <div className="text-center">
                                            <div className="w-16 h-16 rounded-full bg-[#FB8D22]/10 flex items-center justify-center mx-auto mb-4">
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
                                            </div>
                                            <p className="text-zinc-400">
                                                No messages yet
                                            </p>
                                            <p className="text-zinc-500 text-sm mt-1">
                                                Start the conversation!
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    messages.map((msg) => {
                                        // Compare addresses case-insensitively
                                        const isOwn = userAddress
                                            ? msg.senderInboxId?.toLowerCase() ===
                                              userAddress.toLowerCase()
                                            : false;
                                        const isPixelArt = isPixelArtMessage(
                                            msg.content
                                        );
                                        const senderAddress = members.find(
                                            (m) =>
                                                m.inboxId === msg.senderInboxId
                                        )?.addresses[0];

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
                                                    data-message-bubble
                                                    onClick={() =>
                                                        handleMessageTap(msg.id)
                                                    }
                                                    className={`max-w-[75%] rounded-2xl px-4 py-2 relative cursor-pointer ${
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
                                                        <p className="text-xs text-zinc-400 mb-1">
                                                            {senderAddress
                                                                ? formatAddress(
                                                                      senderAddress
                                                                  )
                                                                : "Unknown"}
                                                        </p>
                                                    )}

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
                                                                        ) || ""}
                                                                </p>
                                                            </div>
                                                        )}

                                                    {isPixelArt ? (
                                                        <PixelArtImage
                                                            src={getPixelArtUrl(
                                                                msg.content
                                                            )}
                                                            size="md"
                                                        />
                                                    ) : (
                                                        <p className="break-words">
                                                            {msg.content.startsWith(
                                                                "↩️ "
                                                            ) &&
                                                            msg.content.includes(
                                                                "\n\n"
                                                            )
                                                                ? msg.content
                                                                      .split(
                                                                          "\n\n"
                                                                      )
                                                                      .slice(1)
                                                                      .join(
                                                                          "\n\n"
                                                                      )
                                                                : msg.content}
                                                        </p>
                                                    )}

                                                    {/* Reactions Display */}
                                                    {msgReactions[msg.id]?.some(
                                                        (r) => r.count > 0
                                                    ) && (
                                                        <div
                                                            className="flex flex-wrap gap-1 mt-2"
                                                            onClick={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                        >
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
                                                                                setSelectedMessage(
                                                                                    null
                                                                                );
                                                                            }}
                                                                            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition-colors ${
                                                                                reaction.hasReacted
                                                                                    ? isOwn
                                                                                        ? "bg-white/30"
                                                                                        : "bg-orange-500/30 text-orange-300"
                                                                                    : isOwn
                                                                                    ? "bg-white/10 hover:bg-white/20"
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

                                                    <p
                                                        className={`text-xs mt-1 ${
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
                                                                onClick={(e) =>
                                                                    e.stopPropagation()
                                                                }
                                                                className={`absolute ${
                                                                    isOwn
                                                                        ? "left-0 -translate-x-full pr-2"
                                                                        : "right-0 translate-x-full pl-2"
                                                                } top-0 flex items-center gap-1 z-10`}
                                                            >
                                                                <button
                                                                    onClick={() =>
                                                                        setShowReactionPicker(
                                                                            showReactionPicker ===
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

                                                    {/* Reaction Picker */}
                                                    {showReactionPicker ===
                                                        msg.id && (
                                                        <div
                                                            className={`absolute ${
                                                                isOwn
                                                                    ? "right-0"
                                                                    : "left-0"
                                                            } -top-12 z-20`}
                                                            onClick={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                        >
                                                            <QuickReactionPicker
                                                                isOpen={true}
                                                                onClose={() =>
                                                                    setShowReactionPicker(
                                                                        null
                                                                    )
                                                                }
                                                                onSelect={async (
                                                                    emoji
                                                                ) => {
                                                                    await toggleMsgReaction(
                                                                        msg.id,
                                                                        emoji
                                                                    );
                                                                    setShowReactionPicker(
                                                                        null
                                                                    );
                                                                    setSelectedMessage(
                                                                        null
                                                                    );
                                                                }}
                                                                emojis={
                                                                    MESSAGE_REACTION_EMOJIS
                                                                }
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
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
                                                              replyingTo.senderInboxId
                                                      )?.addresses[0] ||
                                                          "Unknown"
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

                            {/* Input */}
                            <div className="p-4 border-t border-zinc-800">
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setShowPixelArt(true)}
                                        disabled={!isInitialized}
                                        className="p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-orange-400 transition-colors disabled:opacity-50"
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
                                    <input
                                        type="text"
                                        inputMode="text"
                                        enterKeyHint="send"
                                        autoComplete="off"
                                        autoCorrect="on"
                                        autoCapitalize="sentences"
                                        value={newMessage}
                                        onChange={(e) =>
                                            setNewMessage(e.target.value)
                                        }
                                        onKeyDown={handleKeyPress}
                                        placeholder={
                                            replyingTo
                                                ? "Type your reply..."
                                                : "Type a message..."
                                        }
                                        disabled={!isInitialized}
                                        className="flex-1 py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FB8D22]/50 focus:ring-2 focus:ring-[#FB8D22]/20 transition-all disabled:opacity-50"
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
                                                            friend.address
                                                        )
                                                    }
                                                    disabled={isAddingMember}
                                                    className="w-full flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-50"
                                                >
                                                    {friend.avatar ? (
                                                        <img
                                                            src={friend.avatar}
                                                            alt={getDisplayName(
                                                                friend
                                                            )}
                                                            className="w-8 h-8 rounded-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FB8D22] to-[#FF5500] flex items-center justify-center text-white text-xs font-bold">
                                                            {getDisplayName(
                                                                friend
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
                </>
            )}
        </AnimatePresence>
    );
}
