"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { type Address } from "viem";
import { getDisplayName as getBaseDisplayName } from "@/utils/address";

// Suggested emojis for group icons
const GROUP_EMOJIS = [
    "👥",
    "💬",
    "🎯",
    "🚀",
    "⚡",
    "🔥",
    "💎",
    "🌟",
    "🎮",
    "🎵",
    "📚",
    "💼",
    "🏠",
    "🌍",
    "🎨",
    "🏆",
    "❤️",
    "💜",
    "💙",
    "💚",
    "🧡",
    "💛",
    "🖤",
    "🤍",
    "🐱",
    "🐶",
    "🦊",
    "🐻",
    "🐼",
    "🦁",
    "🐸",
    "🦄",
    "☕",
    "🍕",
    "🍔",
    "🍺",
    "🍷",
    "🎂",
    "🍩",
    "🌮",
];

type Friend = {
    id: string;
    address: Address;
    ensName: string | null;
    avatar: string | null;
    nickname: string | null;
    reachUsername: string | null;
};

interface CreateGroupModalProps {
    isOpen: boolean;
    onClose: () => void;
    friends: Friend[];
    onCreate: (
        memberAddresses: string[],
        groupName: string,
        emoji?: string,
        password?: string
    ) => Promise<boolean>;
    isCreating?: boolean;
}

export function CreateGroupModal({
    isOpen,
    onClose,
    friends,
    onCreate,
    isCreating,
}: CreateGroupModalProps) {
    const [groupName, setGroupName] = useState("");
    const [selectedFriends, setSelectedFriends] = useState<Set<string>>(
        new Set()
    );
    const [selectedEmoji, setSelectedEmoji] = useState<string>("👥");
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [passwordProtect, setPasswordProtect] = useState(false);
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setGroupName("");
            setSelectedFriends(new Set());
            setSelectedEmoji("👥");
            setShowEmojiPicker(false);
            setError(null);
            setPasswordProtect(false);
            setPassword("");
            setPasswordConfirm("");
        }
    }, [isOpen]);

    const toggleFriend = (address: string) => {
        setSelectedFriends((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(address)) {
                newSet.delete(address);
            } else {
                newSet.add(address);
            }
            return newSet;
        });
    };

    const handleCreate = async () => {
        if (!groupName.trim()) {
            setError("Please enter a group name");
            return;
        }
        if (selectedFriends.size < 1) {
            setError("Please select at least one friend");
            return;
        }
        if (passwordProtect) {
            if (password.length < 8) {
                setError("Password must be at least 8 characters");
                return;
            }
            if (password !== passwordConfirm) {
                setError("Passwords do not match");
                return;
            }
        }

        setError(null);
        const success = await onCreate(
            Array.from(selectedFriends),
            groupName.trim(),
            selectedEmoji,
            passwordProtect ? password : undefined
        );
        if (success) {
            onClose();
        }
    };

    // Get display name with priority: nickname > ENS > username > address
    const getDisplayName = (friend: Friend) => {
        return getBaseDisplayName(
            {
                address: friend.address,
                ensName: friend.ensName,
                username: friend.reachUsername,
                nickname: friend.nickname,
            },
            true
        ); // includeNickname = true for friends
    };

    // Close on escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (isOpen) {
            document.addEventListener("keydown", handleEscape);
        }
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isOpen, onClose]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="text-xl font-semibold text-white">
                                    Create Group Chat
                                </h2>
                                <p className="text-zinc-500 text-sm mt-1">
                                    Start a group chat with friends
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
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
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>

                        {/* Group Name with Emoji */}
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-zinc-400 mb-2">
                                Group Name & Icon
                            </label>
                            <div className="flex gap-2">
                                {/* Emoji Picker Button */}
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setShowEmojiPicker(!showEmojiPicker)
                                        }
                                        className="w-12 h-12 bg-zinc-800 border border-zinc-700 rounded-xl text-2xl hover:bg-zinc-700 hover:border-zinc-600 transition-all flex items-center justify-center"
                                    >
                                        {selectedEmoji}
                                    </button>

                                    {/* Emoji Picker Dropdown */}
                                    <AnimatePresence>
                                        {showEmojiPicker && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="absolute top-14 left-0 z-50 bg-zinc-800 border border-zinc-700 rounded-xl p-3 shadow-xl"
                                            >
                                                <p className="text-xs text-zinc-500 mb-2">
                                                    Choose an icon
                                                </p>
                                                <div className="grid grid-cols-8 gap-1 w-[280px]">
                                                    {GROUP_EMOJIS.map(
                                                        (emoji) => (
                                                            <button
                                                                key={emoji}
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedEmoji(
                                                                        emoji
                                                                    );
                                                                    setShowEmojiPicker(
                                                                        false
                                                                    );
                                                                }}
                                                                className={`w-8 h-8 text-lg rounded-lg hover:bg-zinc-700 transition-colors flex items-center justify-center ${
                                                                    selectedEmoji ===
                                                                    emoji
                                                                        ? "bg-[#FB8D22]/20 ring-1 ring-[#FB8D22]"
                                                                        : ""
                                                                }`}
                                                            >
                                                                {emoji}
                                                            </button>
                                                        )
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* Group Name Input */}
                                <input
                                    type="text"
                                    value={groupName}
                                    onChange={(e) =>
                                        setGroupName(e.target.value)
                                    }
                                    placeholder="Enter group name..."
                                    className="flex-1 py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FB8D22]/50 focus:ring-2 focus:ring-[#FB8D22]/20 transition-all"
                                />
                            </div>
                        </div>

                        {/* Password protect (optional) */}
                        <div className="mb-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={passwordProtect}
                                    onChange={(e) =>
                                        setPasswordProtect(e.target.checked)
                                    }
                                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-[#FB8D22] focus:ring-[#FB8D22]/50"
                                />
                                <span className="text-sm font-medium text-zinc-400">
                                    Password protect (encrypts messages; only
                                    members with the password can read)
                                </span>
                            </label>
                            {passwordProtect && (
                                <div className="mt-3 space-y-2 pl-6">
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) =>
                                            setPassword(e.target.value)
                                        }
                                        placeholder="Group password (min 8 characters)"
                                        className="w-full py-2.5 px-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FB8D22]/50 text-sm"
                                        autoComplete="new-password"
                                    />
                                    <input
                                        type="password"
                                        value={passwordConfirm}
                                        onChange={(e) =>
                                            setPasswordConfirm(e.target.value)
                                        }
                                        placeholder="Confirm password"
                                        className="w-full py-2.5 px-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FB8D22]/50 text-sm"
                                        autoComplete="new-password"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Friends Selection */}
                        <div className="flex-1 overflow-hidden flex flex-col">
                            <label className="block text-sm font-medium text-zinc-400 mb-2">
                                Select Friends ({selectedFriends.size} selected)
                            </label>
                            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                                {friends.length === 0 ? (
                                    <p className="text-zinc-500 text-center py-8">
                                        Add friends first to create a group
                                    </p>
                                ) : (
                                    friends.map((friend) => (
                                        <button
                                            key={friend.id}
                                            onClick={() =>
                                                toggleFriend(friend.address)
                                            }
                                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                                                selectedFriends.has(
                                                    friend.address
                                                )
                                                    ? "bg-[#FB8D22]/20 border border-[#FB8D22]/50"
                                                    : "bg-zinc-800/50 border border-zinc-700/50 hover:bg-zinc-800"
                                            }`}
                                        >
                                            {/* Avatar */}
                                            {friend.avatar ? (
                                                <img
                                                    src={friend.avatar}
                                                    alt={getDisplayName(friend)}
                                                    className="w-10 h-10 rounded-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FB8D22] to-[#FF5500] flex items-center justify-center text-white font-bold text-sm">
                                                    {getDisplayName(friend)
                                                        .slice(0, 2)
                                                        .toUpperCase()}
                                                </div>
                                            )}

                                            {/* Name */}
                                            <div className="flex-1 text-left">
                                                <p className="text-white font-medium">
                                                    {getDisplayName(friend)}
                                                </p>
                                                <p className="text-zinc-500 text-xs font-mono">
                                                    {friend.address.slice(
                                                        0,
                                                        10
                                                    )}
                                                    ...
                                                </p>
                                            </div>

                                            {/* Checkbox */}
                                            <div
                                                className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                                                    selectedFriends.has(
                                                        friend.address
                                                    )
                                                        ? "bg-[#FB8D22] text-white"
                                                        : "bg-zinc-700"
                                                }`}
                                            >
                                                {selectedFriends.has(
                                                    friend.address
                                                ) && (
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        strokeWidth={3}
                                                        stroke="currentColor"
                                                        className="w-4 h-4"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            d="M4.5 12.75l6 6 9-13.5"
                                                        />
                                                    </svg>
                                                )}
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                                <p className="text-red-400 text-sm">{error}</p>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3 mt-4 pt-4 border-t border-zinc-800">
                            <button
                                onClick={onClose}
                                className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={
                                    isCreating ||
                                    !groupName.trim() ||
                                    selectedFriends.size === 0
                                }
                                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF5500] text-white font-medium transition-all hover:shadow-lg hover:shadow-[#FB8D22]/25 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isCreating ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg
                                            className="animate-spin h-4 w-4"
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
                                        Creating...
                                    </span>
                                ) : (
                                    "Create Group Chat"
                                )}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
