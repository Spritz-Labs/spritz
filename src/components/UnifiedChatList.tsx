"use client";

import {
    useState,
    useMemo,
    useCallback,
    useRef,
    useEffect,
    useLayoutEffect,
    memo,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    useChatFolders,
    DEFAULT_FOLDER_EMOJIS,
    FOLDER_CATEGORIES,
    ARCHIVED_FOLDER_EMOJI,
    ARCHIVED_FOLDER_LABEL,
    type ChatFolder,
} from "@/hooks/useChatFolders";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatTimestamp, formatDateInTimezone } from "@/lib/timezone";
import { ChatListItemSkeleton } from "./ChatSkeleton";
import { PullToRefresh } from "./PullToRefresh";

// Create Folder Modal Component
function CreateFolderModal({
    activeFolders,
    onClose,
    onCreateFolder,
}: {
    activeFolders: ChatFolder[];
    onClose: () => void;
    onCreateFolder: (emoji: string, label: string) => void;
}) {
    const [customEmoji, setCustomEmoji] = useState("");
    const [customLabel, setCustomLabel] = useState("");
    const [activeCategory, setActiveCategory] = useState("popular");

    const filteredEmojis = DEFAULT_FOLDER_EMOJIS.filter(
        (f) => f.category === activeCategory
    );
    const isCustomValid = customEmoji.trim().length > 0;

    const handleCreateCustom = () => {
        if (isCustomValid) {
            onCreateFolder(customEmoji.trim(), customLabel.trim() || "Custom");
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 cursor-pointer"
            onClick={onClose}
            onPointerDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto"
            >
                <h3 className="text-lg font-bold text-white mb-2">
                    Create Folder
                </h3>
                <p className="text-zinc-400 text-sm mb-4">
                    Choose an emoji or create your own. Long-press chats to
                    organize them.
                </p>

                {/* Custom Folder Input */}
                <div className="mb-6 p-4 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
                    <p className="text-xs text-zinc-500 mb-2 font-medium">
                        Create Custom Folder
                    </p>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={customEmoji}
                            onChange={(e) => setCustomEmoji(e.target.value)}
                            placeholder="😀"
                            className="w-14 h-12 text-center text-2xl bg-zinc-800 border border-zinc-700 rounded-xl focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20"
                            maxLength={4}
                        />
                        <input
                            type="text"
                            value={customLabel}
                            onChange={(e) => setCustomLabel(e.target.value)}
                            placeholder="Folder name (optional)"
                            className="flex-1 h-12 px-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20"
                            maxLength={20}
                        />
                        <button
                            onClick={handleCreateCustom}
                            disabled={!isCustomValid}
                            className="px-4 h-12 rounded-xl bg-[#FF5500] hover:bg-[#E04D00] text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Add
                        </button>
                    </div>
                </div>

                {/* Category Tabs */}
                <div className="flex gap-1 overflow-x-auto scrollbar-none mb-4 -mx-2 px-2">
                    {FOLDER_CATEGORIES.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                                activeCategory === cat.id
                                    ? "bg-[#FF5500] text-white"
                                    : "bg-zinc-800/50 text-zinc-400 hover:text-white"
                            }`}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>

                {/* Emoji Grid */}
                <div className="grid grid-cols-5 gap-2 mb-4">
                    {filteredEmojis.map((folder) => {
                        const isActive = activeFolders.some(
                            (f) => f.emoji === folder.emoji
                        );
                        return (
                            <button
                                key={folder.emoji}
                                onClick={() =>
                                    onCreateFolder(folder.emoji, folder.label)
                                }
                                disabled={isActive}
                                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
                                    isActive
                                        ? "bg-zinc-800 opacity-50 cursor-not-allowed"
                                        : "bg-zinc-800/50 hover:bg-zinc-700 hover:scale-105"
                                }`}
                                title={folder.label}
                            >
                                <span className="text-2xl">{folder.emoji}</span>
                                <span className="text-[10px] text-zinc-500 truncate w-full text-center">
                                    {folder.label}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* More Emoji Suggestions */}
                <div className="border-t border-zinc-800 pt-4 mb-4">
                    <p className="text-xs text-zinc-500 mb-2">
                        More suggestions
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {[
                            "🚀",
                            "💡",
                            "🎯",
                            "🔒",
                            "📱",
                            "🌟",
                            "💪",
                            "🎁",
                            "☕",
                            "🏆",
                            "🌈",
                            "🔮",
                            "🎪",
                            "🎲",
                            "🃏",
                        ].map((emoji) => (
                            <button
                                key={emoji}
                                onClick={() => setCustomEmoji(emoji)}
                                className="w-10 h-10 rounded-lg bg-zinc-800/30 hover:bg-zinc-700 text-xl transition-all hover:scale-110"
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="w-full py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors"
                >
                    Cancel
                </button>
            </motion.div>
        </motion.div>
    );
}

// Unified chat item that can represent any chat type
export type UnifiedChatItem = {
    id: string;
    type: "dm" | "group" | "channel" | "global" | "location";
    name: string;
    avatar: string | null;
    lastMessage: string | null;
    lastMessageAt: Date | null;
    unreadCount: number;
    isOnline?: boolean;
    isPinned?: boolean;
    metadata: {
        // For DMs
        address?: string;
        ensName?: string | null;
        reachUsername?: string | null;
        // For groups/channels
        memberCount?: number;
        isPublic?: boolean;
        // For global chat
        isAlpha?: boolean;
        // For location chats
        googlePlaceName?: string;
        googlePlaceAddress?: string;
        latitude?: number;
        longitude?: number;
        emoji?: string;
    };
};

type UnifiedChatListProps = {
    chats: UnifiedChatItem[];
    userAddress: string;
    onChatClick: (chat: UnifiedChatItem) => void;
    onCallClick?: (chat: UnifiedChatItem) => void;
    onVideoClick?: (chat: UnifiedChatItem) => void;
    showCreateFolderModal?: boolean;
    onCreateFolderModalClose?: () => void;
    /** When "No chats yet", show CTAs to add friend, browse channels, create group */
    onOpenAddFriend?: () => void;
    onOpenBrowseChannels?: () => void;
    onOpenCreateGroup?: () => void;
    canCreateGroup?: boolean;
    /** Mark all chats in the current folder as read (called with activeFolder and chats in that folder) */
    onMarkFolderAsRead?: (
        folderEmoji: string | null,
        chatsInFolder: UnifiedChatItem[]
    ) => void;
    /** Pin or unpin a chat to the top of the list */
    onPinChat?: (chat: UnifiedChatItem, pinned: boolean) => void;
    /** When true, show loading skeleton instead of chat list */
    isChatsLoading?: boolean;
    /** When set, show error message and retry button (e.g. failed to load friends/chats) */
    chatsError?: string | null;
    /** Callback to retry loading chats */
    onRetry?: () => void;
    /** Callback to refresh chat list (for pull-to-refresh) */
    onRefresh?: () => Promise<void>;
};

const formatTime = (date: Date | null, timezone: string) => {
    if (!date) return "";
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
        return formatTimestamp(date, timezone, "h:mm a");
    } else if (days === 1) {
        return "Yesterday";
    } else if (days < 7) {
        return formatDateInTimezone(date, timezone, "weekday");
    } else {
        return formatDateInTimezone(date, timezone, "monthDay");
    }
};

const getChatTypeIcon = (type: UnifiedChatItem["type"]) => {
    switch (type) {
        case "dm":
            return null; // DMs show avatar instead
        case "group":
            return (
                <svg
                    className="w-3 h-3"
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
            );
        case "channel":
            return (
                <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                    />
                </svg>
            );
        case "global":
            return (
                <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
            );
        case "location":
            return (
                <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                </svg>
            );
    }
};

function chatItemEqual(a: UnifiedChatItem, b: UnifiedChatItem): boolean {
    return (
        a.id === b.id &&
        a.name === b.name &&
        a.avatar === b.avatar &&
        a.lastMessage === b.lastMessage &&
        a.unreadCount === b.unreadCount &&
        (a.isPinned ?? false) === (b.isPinned ?? false) &&
        (a.lastMessageAt?.getTime() ?? 0) === (b.lastMessageAt?.getTime() ?? 0)
    );
}

type ChatRowProps = {
    chat: UnifiedChatItem;
    chatFolder: string | null;
    isFolderPickerOpen: boolean;
    folderPickerPosition: {
        top: number;
        left: number;
        openUpward: boolean;
    } | null;
    onChatClick: (chat: UnifiedChatItem) => void;
    onFolderButtonClick: (chatId: string) => void;
    onAssignFolder: (
        chatId: string,
        emoji: string | null,
        chatType: "dm" | "group" | "channel" | "global" | "location"
    ) => void;
    onCloseFolderPicker: () => void;
    allAvailableFolders: ChatFolder[];
    setFolderButtonRef: (id: string, el: HTMLButtonElement | null) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    onCallClick?: (chat: UnifiedChatItem) => void;
    onVideoClick?: (chat: UnifiedChatItem) => void;
    onPinChat?: (chat: UnifiedChatItem, pinned: boolean) => void;
    userTimezone: string;
};

const ChatRow = memo(
    function ChatRow({
        chat,
        chatFolder,
        isFolderPickerOpen,
        folderPickerPosition,
        onChatClick,
        onFolderButtonClick,
        onAssignFolder,
        onCloseFolderPicker,
        allAvailableFolders,
        setFolderButtonRef,
        onContextMenu,
        onCallClick,
        onVideoClick,
        onPinChat,
        userTimezone,
    }: ChatRowProps) {
        return (
            <div className="relative select-none" onContextMenu={onContextMenu}>
                <div
                    onClick={() => onChatClick(chat)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onChatClick(chat);
                        }
                    }}
                    className={`w-full rounded-lg sm:rounded-xl px-2.5 py-2.5 sm:p-3 text-left group cursor-pointer transition-all ${
                        chat.unreadCount > 0
                            ? "bg-[#FF5500]/10 hover:bg-[#FF5500]/15 border border-[#FF5500]/30"
                            : "bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50"
                    }`}
                >
                    <div className="flex items-center gap-2.5 sm:gap-3">
                        <div className="relative shrink-0">
                            {chat.avatar && (
                                <img
                                    src={chat.avatar}
                                    alt={chat.name}
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full object-cover avatar-img ${
                                        chat.unreadCount > 0
                                            ? "ring-2 ring-[#FF5500]"
                                            : ""
                                    }`}
                                    onError={(e) => {
                                        e.currentTarget.style.display = "none";
                                        const wrap =
                                            e.currentTarget.closest(
                                                ".relative"
                                            );
                                        const fallback = wrap?.querySelector(
                                            ".avatar-fallback"
                                        ) as HTMLElement | null;
                                        if (fallback)
                                            fallback.classList.remove(
                                                "!hidden"
                                            );
                                    }}
                                />
                            )}
                            <div
                                className={`avatar-fallback w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center ${
                                    chat.avatar
                                        ? "absolute inset-0 !hidden"
                                        : ""
                                } ${
                                    chat.type === "global"
                                        ? "bg-gradient-to-br from-orange-500 to-amber-500"
                                        : chat.type === "channel"
                                        ? "bg-gradient-to-br from-blue-500 to-cyan-500"
                                        : chat.type === "group"
                                        ? "bg-gradient-to-br from-purple-500 to-pink-500"
                                        : chat.type === "location"
                                        ? "bg-gradient-to-br from-red-500 to-orange-500"
                                        : "bg-gradient-to-br from-[#FB8D22] to-[#FF5500]"
                                } ${
                                    chat.unreadCount > 0
                                        ? "ring-2 ring-[#FF5500]"
                                        : ""
                                }`}
                            >
                                <span className="text-white font-bold text-base sm:text-lg">
                                    {chat.type === "location" && chat.metadata.emoji
                                        ? chat.metadata.emoji
                                        : chat.name[0]?.toUpperCase() ?? "?"}
                                </span>
                            </div>
                            {chat.type === "dm" && chat.isOnline && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 sm:w-4 sm:h-4 bg-emerald-500 rounded-full border-2 border-zinc-900" />
                            )}
                            {chat.unreadCount > 0 && (
                                <div className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 min-w-[18px] h-[18px] sm:min-w-[20px] sm:h-[20px] px-1 bg-[#FF5500] rounded-full flex items-center justify-center border-2 border-zinc-900">
                                    <span className="text-white text-[9px] sm:text-[10px] font-bold">
                                        {chat.unreadCount > 99
                                            ? "99+"
                                            : chat.unreadCount}
                                    </span>
                                </div>
                            )}
                            {chat.type !== "dm" && (
                                <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 sm:w-5 sm:h-5 bg-zinc-700 rounded-full flex items-center justify-center border-2 border-zinc-900 text-zinc-300">
                                    {getChatTypeIcon(chat.type)}
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                                <p
                                    className={`font-medium truncate text-sm sm:text-base ${
                                        chat.unreadCount > 0
                                            ? "text-white"
                                            : "text-zinc-200"
                                    }`}
                                >
                                    {chat.name}
                                </p>
                                {chat.isPinned && (
                                    <span
                                        className="shrink-0 text-zinc-500"
                                        title="Pinned"
                                    >
                                        <svg
                                            className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M5 10l7-7m0 0l7 7m-7-7v18"
                                            />
                                        </svg>
                                    </span>
                                )}
                                {chatFolder && (
                                    <span className="text-xs sm:text-sm shrink-0">
                                        {chatFolder}
                                    </span>
                                )}
                            </div>
                            <p
                                className={`text-xs sm:text-sm truncate ${
                                    chat.unreadCount > 0
                                        ? "text-zinc-300"
                                        : "text-zinc-500"
                                }`}
                            >
                                {chat.lastMessage ||
                                    (chat.type === "dm"
                                        ? "Say hello!"
                                        : chat.type === "global"
                                        ? "Join the global conversation"
                                        : `${
                                              chat.metadata.memberCount || 0
                                          } members`)}
                            </p>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">
                            {chat.type === "dm" && (
                                <div className="hidden sm:flex items-center gap-1">
                                    {onCallClick && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onCallClick(chat);
                                            }}
                                            className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center hover:bg-emerald-500/30 transition-colors"
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
                                                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                                />
                                            </svg>
                                        </button>
                                    )}
                                    {onVideoClick && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onVideoClick(chat);
                                            }}
                                            className="w-7 h-7 rounded-full bg-[#FB8D22]/20 text-[#FFBBA7] flex items-center justify-center hover:bg-[#FB8D22]/30 transition-colors"
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
                                                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                                />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            )}
                            {chat.lastMessageAt && (
                                <span
                                    className={`text-[10px] sm:text-xs ${
                                        chat.unreadCount > 0
                                            ? "text-[#FF5500]"
                                            : "text-zinc-500"
                                    }`}
                                >
                                    {formatTime(
                                        chat.lastMessageAt,
                                        userTimezone
                                    )}
                                </span>
                            )}
                            <button
                                type="button"
                                ref={(el) => setFolderButtonRef(chat.id, el)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onFolderButtonClick(chat.id);
                                }}
                                className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center ${
                                    chatFolder
                                        ? "bg-zinc-700/50 text-white"
                                        : "bg-zinc-800/50 text-zinc-500"
                                }`}
                                title={
                                    chatFolder
                                        ? `In folder ${chatFolder}`
                                        : "Add to folder"
                                }
                            >
                                {chatFolder ? (
                                    <span className="text-xs sm:text-sm">
                                        {chatFolder}
                                    </span>
                                ) : (
                                    <svg
                                        className="w-3 h-3 sm:w-3.5 sm:h-3.5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                        />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
                <AnimatePresence>
                    {isFolderPickerOpen && folderPickerPosition && (
                        <>
                            <div
                                className="fixed inset-0 z-[60] cursor-pointer"
                                onClick={onCloseFolderPicker}
                                onPointerDown={(e) => {
                                    if (
                                        e.button === 0 ||
                                        e.pointerType === "touch"
                                    ) {
                                        e.preventDefault();
                                        onCloseFolderPicker();
                                    }
                                }}
                                role="button"
                                tabIndex={-1}
                                aria-label="Close folder picker"
                            />
                            <motion.div
                                initial={{
                                    opacity: 0,
                                    scale: 0.95,
                                    y: folderPickerPosition.openUpward
                                        ? 10
                                        : -10,
                                }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{
                                    opacity: 0,
                                    scale: 0.95,
                                    y: folderPickerPosition.openUpward
                                        ? 10
                                        : -10,
                                }}
                                className="fixed z-[70] bg-zinc-900 border border-zinc-700 rounded-lg sm:rounded-xl shadow-2xl p-1.5 sm:p-2 min-w-[180px] sm:min-w-[200px] max-h-[280px] overflow-y-auto"
                                style={{
                                    top: folderPickerPosition.openUpward
                                        ? "auto"
                                        : folderPickerPosition.top,
                                    bottom: folderPickerPosition.openUpward
                                        ? `${
                                              window.innerHeight -
                                              folderPickerPosition.top +
                                              4
                                          }px`
                                        : "auto",
                                    left: folderPickerPosition.left,
                                }}
                            >
                                <p className="text-[10px] sm:text-xs text-zinc-500 px-1.5 sm:px-2 py-0.5 sm:py-1 mb-0.5 sm:mb-1">
                                    Move to folder
                                </p>
                                {onPinChat && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onPinChat(chat, !chat.isPinned);
                                        }}
                                        className="w-full flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md sm:rounded-lg text-zinc-300 hover:bg-zinc-700/50 transition-colors text-xs sm:text-sm mb-1"
                                    >
                                        {chat.isPinned ? (
                                            <>
                                                <svg
                                                    className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M5 15l7-7 7 7"
                                                    />
                                                </svg>
                                                Unpin from top
                                            </>
                                        ) : (
                                            <>
                                                <svg
                                                    className="w-3.5 h-3.5 sm:w-4 sm:h-4"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M5 10l7-7m0 0l7 7m-7-7v18"
                                                    />
                                                </svg>
                                                Pin to top
                                            </>
                                        )}
                                    </button>
                                )}
                                {chatFolder && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onAssignFolder(
                                                chat.id,
                                                null,
                                                chat.type
                                            )
                                        }
                                        className="w-full flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md sm:rounded-lg text-red-400 hover:bg-red-500/10 transition-colors text-xs sm:text-sm"
                                    >
                                        <svg
                                            className="w-3.5 h-3.5 sm:w-4 sm:h-4"
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
                                        {chatFolder === ARCHIVED_FOLDER_EMOJI
                                            ? "Unarchive"
                                            : `Remove from ${chatFolder}`}
                                    </button>
                                )}
                                <div className="grid grid-cols-5 gap-0.5 sm:gap-1 p-0.5 sm:p-1">
                                    {allAvailableFolders.map((folder) => (
                                        <button
                                            key={folder.emoji}
                                            type="button"
                                            onClick={() =>
                                                onAssignFolder(
                                                    chat.id,
                                                    folder.emoji,
                                                    chat.type
                                                )
                                            }
                                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-md sm:rounded-lg flex items-center justify-center text-base sm:text-lg transition-all ${
                                                chatFolder === folder.emoji
                                                    ? "bg-[#FF5500]/20 ring-2 ring-[#FF5500]"
                                                    : "hover:bg-zinc-800"
                                            }`}
                                            title={folder.label}
                                        >
                                            {folder.emoji}
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>
            </div>
        );
    },
    (prev, next) => {
        return (
            chatItemEqual(prev.chat, next.chat) &&
            prev.chatFolder === next.chatFolder &&
            prev.isFolderPickerOpen === next.isFolderPickerOpen &&
            (prev.folderPickerPosition === next.folderPickerPosition ||
                !next.isFolderPickerOpen) &&
            prev.onPinChat === next.onPinChat
        );
    }
);

const CHAT_SEARCH_DEBOUNCE_MS = 250;

function UnifiedChatListInner({
    chats,
    userAddress,
    onChatClick,
    onCallClick,
    onVideoClick,
    showCreateFolderModal,
    onCreateFolderModalClose,
    showSearch = false,
    onSearchToggle,
    onOpenAddFriend,
    onOpenBrowseChannels,
    onOpenCreateGroup,
    canCreateGroup = false,
    onMarkFolderAsRead,
    onPinChat,
    isChatsLoading = false,
    chatsError = null,
    onRetry,
    onRefresh,
}: UnifiedChatListProps & {
    showSearch?: boolean;
    onSearchToggle?: () => void;
}) {
    const userTimezone = useUserTimezone();
    const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = "All"
    const [showFolderPicker, setShowFolderPicker] = useState<string | null>(
        null
    );
    const [folderPickerPosition, setFolderPickerPosition] = useState<{
        top: number;
        left: number;
        openUpward: boolean;
    } | null>(null);
    const tabsRef = useRef<HTMLDivElement>(null);
    const folderButtonRefs = useRef<Record<string, HTMLButtonElement | null>>(
        {}
    );
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState<
        "all" | "dms" | "groups" | "channels"
    >("all");
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const t = setTimeout(
            () => setDebouncedSearchQuery(searchQuery),
            CHAT_SEARCH_DEBOUNCE_MS
        );
        return () => clearTimeout(t);
    }, [searchQuery]);

    // Focus search input when shown
    useEffect(() => {
        if (showSearch && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [showSearch]);

    // Sync external modal state with internal state
    useEffect(() => {
        if (showCreateFolderModal) {
            setShowFolderPicker("_new");
        }
    }, [showCreateFolderModal]);

    const {
        activeFolders,
        allAvailableFolders,
        assignments,
        addFolder,
        removeFolder,
        assignChat,
        getChatFolder,
    } = useChatFolders(userAddress);

    // Folder picker options: user folders + default folders + Archived (virtual)
    const folderPickerOptions = useMemo(
        () => [
            ...allAvailableFolders,
            {
                emoji: ARCHIVED_FOLDER_EMOJI,
                label: ARCHIVED_FOLDER_LABEL,
                chatIds: [] as string[],
            },
        ],
        [allAvailableFolders]
    );

    // State for folder management
    const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
    const [folderLongPressTimer, setFolderLongPressTimer] =
        useState<NodeJS.Timeout | null>(null);

    // Sort mode: recent (default), unread first, or A-Z
    const [sortMode, setSortMode] = useState<"recent" | "unread" | "az">(
        "recent"
    );

    // Get sortable timestamp (0 for null/invalid so those sort to bottom)
    const getSortTime = useCallback((chat: UnifiedChatItem): number => {
        if (!chat.lastMessageAt) return 0;
        const t = chat.lastMessageAt.getTime();
        return Number.isFinite(t) ? t : 0;
    }, []);

    // Sort chats by selected mode; pinned always first
    const sortedChats = useMemo(() => {
        return [...chats].sort((a, b) => {
            // Pinned chats come first
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;

            if (sortMode === "unread") {
                // Unread first, then by recent
                if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
                if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
                const aTime = getSortTime(a);
                const bTime = getSortTime(b);
                if (aTime !== bTime) return bTime - aTime;
                return a.id.localeCompare(b.id, "en");
            }

            if (sortMode === "az") {
                // A-Z by name, then by id for stability
                const cmp = (a.name || "").localeCompare(b.name || "", "en");
                if (cmp !== 0) return cmp;
                return a.id.localeCompare(b.id, "en");
            }

            // recent: unread first, then by last message time
            if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
            if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
            const aTime = getSortTime(a);
            const bTime = getSortTime(b);
            if (aTime !== bTime) return bTime - aTime;
            return a.id.localeCompare(b.id, "en");
        });
    }, [chats, getSortTime, sortMode]);

    // Filter chats by active folder, search query, and type filter
    const filteredChats = useMemo(() => {
        let result = sortedChats;

        // Apply folder filter (when "All", hide archived; when "Archived", show only archived)
        if (activeFolder === null) {
            result = result.filter(
                (chat) => getChatFolder(chat.id) !== ARCHIVED_FOLDER_EMOJI
            );
        } else {
            result = result.filter(
                (chat) => getChatFolder(chat.id) === activeFolder
            );
        }

        // Apply type filter
        if (typeFilter !== "all") {
            result = result.filter((chat) => {
                if (typeFilter === "dms") return chat.type === "dm";
                if (typeFilter === "groups") return chat.type === "group";
                if (typeFilter === "channels")
                    return chat.type === "channel" || chat.type === "global";
                return true;
            });
        }

        // Apply search filter (debounced)
        if (debouncedSearchQuery.trim()) {
            const query = debouncedSearchQuery.toLowerCase();
            result = result.filter((chat) => {
                const name = chat.name.toLowerCase();
                const lastMessage = chat.lastMessage?.toLowerCase() || "";
                const address = chat.metadata?.address?.toLowerCase() || "";
                const username =
                    chat.metadata?.reachUsername?.toLowerCase() || "";
                return (
                    name.includes(query) ||
                    lastMessage.includes(query) ||
                    address.includes(query) ||
                    username.includes(query)
                );
            });
        }

        return result;
    }, [
        sortedChats,
        activeFolder,
        getChatFolder,
        debouncedSearchQuery,
        typeFilter,
    ]);

    // Get unread count per folder
    const folderUnreadCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        sortedChats.forEach((chat) => {
            const folder = getChatFolder(chat.id);
            if (folder && chat.unreadCount > 0) {
                counts[folder] = (counts[folder] || 0) + chat.unreadCount;
            }
        });
        return counts;
    }, [sortedChats, getChatFolder]);

    // Total unread for "All" tab
    const totalUnread = useMemo(() => {
        return sortedChats.reduce((sum, chat) => sum + chat.unreadCount, 0);
    }, [sortedChats]);

    // Handle folder assignment (folder picker opens only via folder icon tap/click)
    const handleAssignFolder = useCallback(
        (
            chatId: string,
            emoji: string | null,
            chatType: "dm" | "group" | "channel" | "global" | "location" = "dm"
        ) => {
            if (emoji && emoji !== ARCHIVED_FOLDER_EMOJI) {
                const folder = allAvailableFolders.find(
                    (f) => f.emoji === emoji
                );
                if (folder) {
                    addFolder(folder.emoji, folder.label);
                }
            }
            assignChat(chatId, emoji, chatType);
            setShowFolderPicker(null);
        },
        [allAvailableFolders, addFolder, assignChat]
    );

    // Scroll tabs to show active folder
    useEffect(() => {
        if (tabsRef.current && activeFolder) {
            const activeTab = tabsRef.current.querySelector(
                `[data-folder="${activeFolder}"]`
            );
            activeTab?.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
                inline: "center",
            });
        }
    }, [activeFolder]);

    // Calculate folder picker position when it opens
    useLayoutEffect(() => {
        if (showFolderPicker && showFolderPicker !== "_new") {
            const buttonEl = folderButtonRefs.current[showFolderPicker];
            if (buttonEl) {
                const rect = buttonEl.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                const pickerHeight = 200; // Approximate height of picker

                // Check if picker would be cut off at bottom
                const spaceBelow = viewportHeight - rect.bottom;
                const openUpward =
                    spaceBelow < pickerHeight && rect.top > pickerHeight;

                setFolderPickerPosition({
                    top: openUpward ? rect.top : rect.bottom + 4,
                    left: Math.max(
                        8,
                        Math.min(rect.right - 200, window.innerWidth - 208)
                    ), // Keep within viewport
                    openUpward,
                });
            }
        } else {
            setFolderPickerPosition(null);
        }
    }, [showFolderPicker]);

    // Handle folder tab long press for delete
    const handleFolderTouchStart = useCallback((emoji: string) => {
        const timer = setTimeout(() => {
            setFolderToDelete(emoji);
        }, 500);
        setFolderLongPressTimer(timer);
    }, []);

    const handleFolderTouchEnd = useCallback(() => {
        if (folderLongPressTimer) {
            clearTimeout(folderLongPressTimer);
            setFolderLongPressTimer(null);
        }
    }, [folderLongPressTimer]);

    // Handle folder deletion
    const handleDeleteFolder = useCallback(
        (emoji: string) => {
            removeFolder(emoji);
            setFolderToDelete(null);
            // If the deleted folder was active, switch to All
            if (activeFolder === emoji) {
                setActiveFolder(null);
            }
        },
        [removeFolder, activeFolder]
    );

    const setFolderButtonRef = useCallback(
        (id: string, el: HTMLButtonElement | null) => {
            folderButtonRefs.current[id] = el;
        },
        []
    );

    // Create async refresh handler
    const handleRefresh = useCallback(async () => {
        if (onRefresh) {
            await onRefresh();
        } else if (onRetry) {
            // Fall back to onRetry if no onRefresh provided
            await Promise.resolve(onRetry());
        }
    }, [onRefresh, onRetry]);

    const content = (
        <div className="space-y-1.5 sm:space-y-3 select-none">
            {/* Search Section */}
            <AnimatePresence>
                {showSearch && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden px-1 sm:px-0"
                    >
                        <div className="space-y-2 pb-2">
                            {/* Search Input */}
                            <div className="relative">
                                <svg
                                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
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
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) =>
                                        setSearchQuery(e.target.value)
                                    }
                                    placeholder="Search chats, groups, channels..."
                                    className="w-full pl-10 pr-10 py-2.5 bg-zinc-800/80 border border-zinc-700/50 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20 text-sm"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
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
                                                strokeWidth={2}
                                                d="M6 18L18 6M6 6l12 12"
                                            />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            {/* Type Filter Pills */}
                            <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                                {[
                                    { value: "all", label: "All", icon: "✨" },
                                    { value: "dms", label: "DMs", icon: "💬" },
                                    {
                                        value: "groups",
                                        label: "Groups",
                                        icon: "👥",
                                    },
                                    {
                                        value: "channels",
                                        label: "Channels",
                                        icon: "#",
                                    },
                                ].map((filter) => (
                                    <button
                                        key={filter.value}
                                        onClick={() =>
                                            setTypeFilter(
                                                filter.value as typeof typeFilter
                                            )
                                        }
                                        className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                            typeFilter === filter.value
                                                ? "bg-[#FF5500] text-white"
                                                : "bg-zinc-800/50 text-zinc-400 hover:text-white"
                                        }`}
                                    >
                                        <span>{filter.icon}</span>
                                        <span>{filter.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Mark folder as read - when a folder is selected and has unread */}
            {activeFolder !== null &&
                folderUnreadCounts[activeFolder] > 0 &&
                onMarkFolderAsRead && (
                    <div className="flex items-center justify-end px-1 sm:px-0 pb-1">
                        <button
                            type="button"
                            onClick={() =>
                                onMarkFolderAsRead(activeFolder, filteredChats)
                            }
                            className="text-xs text-zinc-500 hover:text-orange-400 transition-colors"
                        >
                            Mark folder read
                        </button>
                    </div>
                )}

            {/* Sort options */}
            <div className="flex items-center gap-1 px-1 sm:px-0 pb-1">
                <span className="text-[10px] sm:text-xs text-zinc-500 mr-0.5">
                    Sort:
                </span>
                {(
                    [
                        {
                            value: "recent" as const,
                            label: "Recent",
                        },
                        {
                            value: "unread" as const,
                            label: "Unread",
                        },
                        {
                            value: "az" as const,
                            label: "A–Z",
                        },
                    ] as const
                ).map((opt) => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSortMode(opt.value)}
                        className={`px-1.5 py-0.5 sm:px-2 sm:py-1 text-[10px] sm:text-xs font-medium rounded transition-all ${
                            sortMode === opt.value
                                ? "bg-[#FF5500]/20 text-[#FF5500]"
                                : "text-zinc-500 hover:text-zinc-300"
                        }`}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* Folder Tabs - Horizontal scrollable */}
            <div
                ref={tabsRef}
                className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-1.5 sm:pb-2 px-1 sm:-mx-2 sm:px-2"
            >
                {/* All Tab */}
                <button
                    onClick={() => setActiveFolder(null)}
                    className={`flex-shrink-0 flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl transition-all ${
                        activeFolder === null
                            ? "bg-[#FF5500] text-white shadow-lg shadow-orange-500/25"
                            : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                    }`}
                >
                    <span className="text-sm sm:text-base">📥</span>
                    <span className="text-xs sm:text-sm font-medium">All</span>
                    {totalUnread > 0 && (
                        <span
                            className={`min-w-[16px] h-[16px] sm:min-w-[18px] sm:h-[18px] px-1 rounded-full text-[9px] sm:text-[10px] font-bold flex items-center justify-center ${
                                activeFolder === null
                                    ? "bg-white text-[#FF5500]"
                                    : "bg-[#FF5500] text-white"
                            }`}
                        >
                            {totalUnread > 99 ? "99+" : totalUnread}
                        </span>
                    )}
                </button>

                {/* Active Folders */}
                {activeFolders.map((folder) => (
                    <button
                        key={folder.emoji}
                        data-folder={folder.emoji}
                        onClick={() => setActiveFolder(folder.emoji)}
                        onTouchStart={() =>
                            handleFolderTouchStart(folder.emoji)
                        }
                        onTouchEnd={handleFolderTouchEnd}
                        onTouchCancel={handleFolderTouchEnd}
                        onContextMenu={(e) => {
                            e.preventDefault();
                            if (folder.emoji !== ARCHIVED_FOLDER_EMOJI) {
                                setFolderToDelete(folder.emoji);
                            }
                        }}
                        className={`flex-shrink-0 flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl transition-all ${
                            activeFolder === folder.emoji
                                ? "bg-[#FF5500] text-white shadow-lg shadow-orange-500/25"
                                : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                        }`}
                    >
                        <span className="text-sm sm:text-base">
                            {folder.emoji}
                        </span>
                        <span className="text-xs sm:text-sm font-medium hidden sm:inline">
                            {folder.label}
                        </span>
                        {folderUnreadCounts[folder.emoji] > 0 && (
                            <span
                                className={`min-w-[16px] h-[16px] sm:min-w-[18px] sm:h-[18px] px-1 rounded-full text-[9px] sm:text-[10px] font-bold flex items-center justify-center ${
                                    activeFolder === folder.emoji
                                        ? "bg-white text-[#FF5500]"
                                        : "bg-[#FF5500] text-white"
                                }`}
                            >
                                {folderUnreadCounts[folder.emoji] > 99
                                    ? "99+"
                                    : folderUnreadCounts[folder.emoji]}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Chat List */}
            <div className="space-y-1 sm:space-y-2">
                {chatsError && !isChatsLoading ? (
                    <div className="text-center py-6 px-3 rounded-xl bg-red-500/10 border border-red-500/30">
                        <p className="text-red-400 text-sm font-medium">
                            Couldn&apos;t load chats
                        </p>
                        <p className="text-zinc-500 text-xs mt-1">
                            {chatsError}
                        </p>
                        {onRetry && (
                            <button
                                type="button"
                                onClick={onRetry}
                                className="mt-3 px-4 py-2 rounded-lg bg-[#FF5500] hover:bg-[#FF5500]/90 text-white text-sm font-medium transition-colors"
                            >
                                Retry
                            </button>
                        )}
                    </div>
                ) : isChatsLoading ? (
                    <ChatListItemSkeleton count={5} />
                ) : filteredChats.length === 0 ? (
                    <div className="text-center py-8 sm:py-12 px-2">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-zinc-800/50 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                            <span className="text-2xl sm:text-3xl">
                                {searchQuery.trim()
                                    ? "🔍"
                                    : activeFolder || "📭"}
                            </span>
                        </div>
                        <p className="text-zinc-400 font-medium text-sm sm:text-base">
                            {searchQuery.trim()
                                ? `No chats match "${searchQuery.trim()}"`
                                : activeFolder
                                ? `No chats in ${
                                      activeFolders.find(
                                          (f) => f.emoji === activeFolder
                                      )?.label || "this folder"
                                  }`
                                : "No chats yet"}
                        </p>
                        <p className="text-zinc-500 text-xs sm:text-sm mt-1 mb-4">
                            {searchQuery.trim()
                                ? "Try a different search or clear to see all chats"
                                : activeFolder
                                ? "Tap folder icon on a chat to move it here"
                                : "Add a friend, join a channel, or create a group"}
                        </p>
                        {searchQuery.trim() ? (
                            <button
                                type="button"
                                onClick={() => setSearchQuery("")}
                                className="px-4 py-2.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors"
                            >
                                Clear search
                            </button>
                        ) : (
                            !activeFolder &&
                            (onOpenAddFriend ||
                                onOpenBrowseChannels ||
                                onOpenCreateGroup) && (
                                <div className="flex flex-col sm:flex-row gap-2 justify-center items-center">
                                    {onOpenAddFriend && (
                                        <button
                                            type="button"
                                            onClick={onOpenAddFriend}
                                            className="px-4 py-2.5 rounded-xl bg-[#FF5500] hover:bg-[#E04D00] text-white text-sm font-medium transition-colors flex items-center gap-2"
                                        >
                                            <span>👋</span>
                                            Add friend
                                        </button>
                                    )}
                                    {onOpenBrowseChannels && (
                                        <button
                                            type="button"
                                            onClick={onOpenBrowseChannels}
                                            className="px-4 py-2.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors flex items-center gap-2"
                                        >
                                            <span>#</span>
                                            Browse channels
                                        </button>
                                    )}
                                    {onOpenCreateGroup && (
                                        <button
                                            type="button"
                                            onClick={onOpenCreateGroup}
                                            disabled={!canCreateGroup}
                                            className="px-4 py-2.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <span>👥</span>
                                            Create group
                                        </button>
                                    )}
                                </div>
                            )
                        )}
                    </div>
                ) : (
                    filteredChats.map((chat) => {
                        const chatFolder = getChatFolder(chat.id);
                        return (
                            <ChatRow
                                key={chat.id}
                                chat={chat}
                                chatFolder={chatFolder}
                                isFolderPickerOpen={
                                    showFolderPicker === chat.id
                                }
                                folderPickerPosition={folderPickerPosition}
                                onChatClick={onChatClick}
                                onFolderButtonClick={setShowFolderPicker}
                                onAssignFolder={handleAssignFolder}
                                onCloseFolderPicker={() =>
                                    setShowFolderPicker(null)
                                }
                                allAvailableFolders={folderPickerOptions}
                                setFolderButtonRef={setFolderButtonRef}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    setShowFolderPicker(chat.id);
                                }}
                                onCallClick={onCallClick}
                                onVideoClick={onVideoClick}
                                onPinChat={onPinChat}
                                userTimezone={userTimezone}
                            />
                        );
                    })
                )}
            </div>

            {/* New Folder Picker Modal */}
            <AnimatePresence>
                {showFolderPicker === "_new" && (
                    <CreateFolderModal
                        activeFolders={activeFolders}
                        onClose={() => {
                            setShowFolderPicker(null);
                            onCreateFolderModalClose?.();
                        }}
                        onCreateFolder={(emoji, label) => {
                            addFolder(emoji, label);
                            setShowFolderPicker(null);
                            onCreateFolderModalClose?.();
                        }}
                    />
                )}
            </AnimatePresence>

            {/* Delete Folder Confirmation Modal */}
            <AnimatePresence>
                {folderToDelete && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 cursor-pointer"
                        onClick={() => setFolderToDelete(null)}
                        onPointerDown={(e) => {
                            if (e.target === e.currentTarget)
                                setFolderToDelete(null);
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full"
                        >
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                                    <span className="text-4xl">
                                        {folderToDelete}
                                    </span>
                                </div>
                                <h3 className="text-lg font-bold text-white mb-2">
                                    Delete Folder?
                                </h3>
                                <p className="text-zinc-400 text-sm">
                                    Delete the{" "}
                                    <strong>
                                        {activeFolders.find(
                                            (f) => f.emoji === folderToDelete
                                        )?.label || folderToDelete}
                                    </strong>{" "}
                                    folder? Chats in this folder will be moved
                                    back to All.
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setFolderToDelete(null)}
                                    className="flex-1 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() =>
                                        handleDeleteFolder(folderToDelete)
                                    }
                                    className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
                                >
                                    Delete
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );

    // Wrap content with PullToRefresh if onRefresh is provided
    if (onRefresh || onRetry) {
        return (
            <PullToRefresh
                onRefresh={handleRefresh}
                disabled={isChatsLoading}
                className="h-full"
            >
                {content}
            </PullToRefresh>
        );
    }

    return content;
}

export const UnifiedChatList = memo(UnifiedChatListInner);
