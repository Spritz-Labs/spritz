"use client";

import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type Address } from "viem";
import { supabase, isSupabaseConfigured } from "@/config/supabase";
import { type SocialLinks } from "@/hooks/useSocials";
import { SocialLinksDisplay } from "./SocialsModal";
import { FriendTagModal, getTagColorConfig } from "./FriendTagModal";
import { useFriendTags, type FriendTag } from "@/hooks/useFriendTags";
import {
    formatAddress,
    getDisplayName as getBaseDisplayName,
    getSecondaryDisplayText,
} from "@/utils/address";

export type Friend = {
    id: string;
    address: Address;
    ensName: string | null;
    avatar: string | null;
    nickname: string | null;
    reachUsername: string | null;
    addedAt: string;
    isOnline?: boolean;
};

type FriendStatus = {
    emoji: string;
    text: string;
    isDnd: boolean;
};

type FilterType = "all" | "online" | "favorites";
type SortType = "name" | "recent" | "online" | "tag";

type FriendsListProps = {
    friends: Friend[];
    userAddress?: string;
    onCall: (friend: Friend) => void;
    onVideoCall?: (friend: Friend) => void;
    onChat?: (friend: Friend) => void;
    onRemove: (friendId: string) => void;
    onUpdateNote?: (friendId: string, note: string) => Promise<boolean>;
    isCallActive: boolean;
    unreadCounts?: Record<string, number>;
    hideChat?: boolean;
    friendsWakuStatus?: Record<string, boolean>;
    /** When no friends, show "Add your first friend" and call this on click */
    onAddFriendClick?: () => void;
    /** When no friends and > 0, show "View friend requests (X)" and call this on click */
    pendingRequestsCount?: number;
    onViewRequestsClick?: () => void;
};

const FAVORITES_STORAGE_KEY = "spritz_favorite_friends";
const SEARCH_DEBOUNCE_MS = 250;

// Helper functions (moved outside component)
const formatPhoneNumber = (phone: string) => {
    if (phone.length >= 4) {
        const last4 = phone.slice(-4);
        return `(***) ***-${last4}`;
    }
    return "Verified";
};

// Get display name with local nickname support
// Priority: nickname > ENS > username > address
const getDisplayName = (friend: Friend) => {
    return getBaseDisplayName(
        {
            address: friend.address,
            ensName: friend.ensName,
            username: friend.reachUsername,
            nickname: friend.nickname,
        },
        true
    ); // includeNickname = true for friends list
};

const getSecondaryText = (friend: Friend) => {
    return getSecondaryDisplayText(
        {
            address: friend.address,
            ensName: friend.ensName,
            username: friend.reachUsername,
            nickname: friend.nickname,
        },
        getDisplayName(friend)
    );
};

// Get effective avatar - custom avatar if enabled, otherwise ENS avatar
const getEffectiveAvatar = (
    friend: Friend,
    customAvatars: Record<string, string | null>
) => {
    const customAvatar = customAvatars[friend.address.toLowerCase()];
    if (customAvatar) {
        return customAvatar;
    }
    return friend.avatar;
};

// Memoized Friend Card Component
type FriendCardProps = {
    friend: Friend;
    effectiveAvatar: string | null;
    index: number;
    isExpanded: boolean;
    isFavorite: boolean;
    isOnline: boolean;
    friendStatus: FriendStatus | undefined;
    friendSocials: SocialLinks | undefined;
    friendPhone: string | undefined;
    friendTag: FriendTag | null;
    schedulingEnabled: boolean;
    publicProfileEnabled: boolean;
    wakuStatus: boolean | undefined;
    unreadCount: number;
    isCallActive: boolean;
    hideChat: boolean;
    onToggleExpand: (id: string) => void;
    onToggleFavorite: () => void;
    onEditTag: () => void;
    onEditNote: () => void;
    onCall: (friend: Friend) => void;
    onVideoCall?: (friend: Friend) => void;
    onChat?: (friend: Friend) => void;
    onRemoveClick: (friend: Friend) => void;
    style?: React.CSSProperties;
};

const FriendCard = memo(function FriendCard({
    friend,
    effectiveAvatar,
    index,
    isExpanded,
    isFavorite,
    isOnline,
    friendStatus,
    friendSocials,
    friendPhone,
    friendTag,
    schedulingEnabled,
    publicProfileEnabled,
    wakuStatus,
    unreadCount,
    isCallActive,
    hideChat,
    onToggleExpand,
    onToggleFavorite,
    onEditTag,
    onEditNote,
    onCall,
    onVideoCall,
    onChat,
    onRemoveClick,
    style,
}: FriendCardProps) {
    const hasUnread = unreadCount > 0;

    // Detect mobile/touch device for click behavior
    const isMobile =
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 640px)").matches;

    return (
        <div className="group select-none" style={style}>
            <div
                className={`rounded-lg sm:rounded-xl px-2.5 py-2.5 sm:p-3 transition-all ${
                    hasUnread
                        ? "bg-[#FF5500]/10 hover:bg-[#FF5500]/15 border border-[#FF5500]/30"
                        : "bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50"
                }`}
            >
                <div className="flex items-center gap-2.5 sm:gap-3">
                    {/* Favorite Star - hidden on mobile, visible on tablet+ */}
                    <button
                        onClick={onToggleFavorite}
                        className={`hidden sm:flex flex-shrink-0 w-6 h-6 items-center justify-center transition-colors ${
                            isFavorite
                                ? "text-amber-400"
                                : "text-zinc-600 hover:text-zinc-400"
                        }`}
                        title={
                            isFavorite
                                ? "Remove from favorites"
                                : "Add to favorites"
                        }
                    >
                        <svg
                            className="w-4 h-4"
                            fill={isFavorite ? "currentColor" : "none"}
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                            />
                        </svg>
                    </button>

                    {/* Avatar & Info - Clickable: mobile opens options, desktop opens chat */}
                    <button
                        onClick={() => {
                            // On mobile, always expand to show options
                            // On desktop, open chat if available
                            if (isMobile) {
                                onToggleExpand(friend.id);
                            } else if (
                                onChat &&
                                !hideChat &&
                                wakuStatus !== false
                            ) {
                                onChat(friend);
                            } else {
                                onToggleExpand(friend.id);
                            }
                        }}
                        className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0 text-left cursor-pointer"
                    >
                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                            {effectiveAvatar ? (
                                <img
                                    src={effectiveAvatar}
                                    alt={getDisplayName(friend)}
                                    className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full object-cover ${
                                        unreadCount > 0
                                            ? "ring-2 ring-[#FF5500]"
                                            : ""
                                    }`}
                                />
                            ) : (
                                <div
                                    className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-[#FB8D22] to-[#FF5500] flex items-center justify-center ${
                                        unreadCount > 0
                                            ? "ring-2 ring-[#FF5500]"
                                            : ""
                                    }`}
                                >
                                    <span className="text-white font-bold text-base sm:text-lg">
                                        {getDisplayName(
                                            friend
                                        )[0].toUpperCase()}
                                    </span>
                                </div>
                            )}
                            {/* Online indicator */}
                            {isOnline && !unreadCount && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 sm:w-4 sm:h-4 bg-emerald-500 rounded-full border-2 border-zinc-900" />
                            )}
                            {/* Unread message badge on avatar */}
                            {unreadCount > 0 && (
                                <div className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 min-w-[18px] h-[18px] sm:min-w-[20px] sm:h-[20px] px-1 bg-[#FF5500] rounded-full flex items-center justify-center border-2 border-zinc-900">
                                    <span className="text-white text-[9px] sm:text-[10px] font-bold">
                                        {unreadCount > 9 ? "9+" : unreadCount}
                                    </span>
                                </div>
                            )}
                            {/* Favorite indicator on mobile */}
                            {isFavorite && (
                                <div className="sm:hidden absolute -bottom-0.5 -left-0.5 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center border-2 border-zinc-900">
                                    <svg
                                        className="w-2.5 h-2.5 text-white"
                                        fill="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                    </svg>
                                </div>
                            )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0 mr-1">
                            <div className="flex items-center gap-1.5">
                                {/* Status emoji */}
                                {friendStatus && (
                                    <span
                                        className="text-sm flex-shrink-0"
                                        title={friendStatus.text || "Status"}
                                    >
                                        {friendStatus.emoji}
                                    </span>
                                )}
                                <p className="text-white font-medium truncate text-sm sm:text-base">
                                    {getDisplayName(friend)}
                                </p>
                                {/* Phone verified badge */}
                                {friendPhone && (
                                    <span
                                        className="flex-shrink-0 text-emerald-400"
                                        title={`Phone verified: ${formatPhoneNumber(
                                            friendPhone
                                        )}`}
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
                                    </span>
                                )}
                                {/* DND badge */}
                                {friendStatus?.isDnd && (
                                    <span className="flex-shrink-0 text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                                        DND
                                    </span>
                                )}
                                {/* Friend tag */}
                                {friendTag &&
                                    (friendTag.emoji || friendTag.tag) &&
                                    (() => {
                                        const tagColor = getTagColorConfig(
                                            friendTag.color
                                        );
                                        return (
                                            <span
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onEditTag();
                                                }}
                                                className={`flex-shrink-0 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full transition-colors cursor-pointer ${tagColor.bg} ${tagColor.text}`}
                                                style={{
                                                    backgroundColor: `${tagColor.accent}20`,
                                                    color: `${tagColor.accent}`,
                                                }}
                                                title="Edit tag"
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                    if (
                                                        e.key === "Enter" ||
                                                        e.key === " "
                                                    ) {
                                                        e.stopPropagation();
                                                        onEditTag();
                                                    }
                                                }}
                                            >
                                                {friendTag.emoji && (
                                                    <span>
                                                        {friendTag.emoji}
                                                    </span>
                                                )}
                                                {friendTag.tag && (
                                                    <span>{friendTag.tag}</span>
                                                )}
                                            </span>
                                        );
                                    })()}
                            </div>
                            {/* Unread message indicator - takes priority */}
                            {hasUnread ? (
                                <p className="text-[#FF5500] text-xs sm:text-sm font-medium flex items-center gap-1">
                                    <span className="inline-block w-1.5 h-1.5 bg-[#FF5500] rounded-full animate-pulse" />
                                    {unreadCount === 1
                                        ? "New message"
                                        : `${unreadCount} new messages`}
                                </p>
                            ) : friendStatus?.text ? (
                                <p className="text-zinc-400 text-xs sm:text-sm truncate">
                                    {friendStatus.text}
                                </p>
                            ) : getSecondaryText(friend) ? (
                                <p className="text-zinc-500 text-xs sm:text-sm truncate">
                                    {getSecondaryText(friend)}
                                </p>
                            ) : null}
                        </div>
                    </button>

                    {/* Actions - Compact on mobile */}
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        {/* Chat Button - hidden on small mobile, shown on sm+ */}
                        {!hideChat && onChat && wakuStatus !== false && (
                            <div className="relative hidden sm:block">
                                <button
                                    onClick={() => onChat(friend)}
                                    disabled={wakuStatus === undefined}
                                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors ${
                                        wakuStatus === undefined
                                            ? "bg-zinc-700/50 text-zinc-500 cursor-not-allowed"
                                            : unreadCount > 0
                                            ? "bg-[#FF5500] hover:bg-[#E04D00] text-white"
                                            : "bg-[#FF5500]/10 hover:bg-[#FF5500]/20 text-[#FF5500]"
                                    }`}
                                    title="Chat"
                                >
                                    <svg
                                        className="w-4 h-4 sm:w-5 sm:h-5"
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
                                </button>
                                {unreadCount > 0 && (
                                    <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                                        {unreadCount > 9 ? "9+" : unreadCount}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Voice Call Button */}
                        <button
                            onClick={() => onCall(friend)}
                            disabled={isCallActive}
                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Call"
                        >
                            <svg
                                className="w-4 h-4 sm:w-5 sm:h-5"
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

                        {/* Video Call Button - hidden on small mobile */}
                        {onVideoCall && (
                            <button
                                onClick={() => onVideoCall(friend)}
                                disabled={isCallActive}
                                className="hidden sm:flex w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#FB8D22]/10 hover:bg-[#FB8D22]/20 text-[#FFBBA7] items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Video"
                            >
                                <svg
                                    className="w-4 h-4 sm:w-5 sm:h-5"
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

                        {/* More Options */}
                        <button
                            onClick={() => onToggleExpand(friend.id)}
                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-zinc-700/50 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
                        >
                            <svg
                                className="w-4 h-4 sm:w-5 sm:h-5"
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
                    </div>
                </div>

                {/* Expanded Options */}
                {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-zinc-700/50">
                        {/* Nickname display */}
                        {friend.nickname && (
                            <div className="mb-3 p-3 bg-zinc-800/50 rounded-lg">
                                <div className="flex items-start gap-2">
                                    <svg
                                        className="w-4 h-4 text-zinc-500 mt-0.5 flex-shrink-0"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                        />
                                    </svg>
                                    <p className="text-zinc-300 text-sm flex-1">
                                        {friend.nickname}
                                    </p>
                                    <button
                                        onClick={onEditNote}
                                        className="text-zinc-500 hover:text-zinc-300 transition-colors"
                                        title="Edit nickname"
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
                                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Mobile-only action buttons */}
                        <div className="flex items-center gap-2 mb-3 sm:hidden">
                            {/* Video Call - Mobile */}
                            {onVideoCall && (
                                <button
                                    onClick={() => {
                                        onVideoCall(friend);
                                        onToggleExpand(friend.id);
                                    }}
                                    disabled={isCallActive}
                                    className="flex-1 py-2.5 px-3 rounded-lg bg-[#FB8D22]/10 hover:bg-[#FB8D22]/20 text-[#FFBBA7] text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
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
                                            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                        />
                                    </svg>
                                    Video
                                </button>
                            )}
                            {/* Chat - Mobile */}
                            {!hideChat && onChat && wakuStatus !== false && (
                                <button
                                    onClick={() => {
                                        onChat(friend);
                                        onToggleExpand(friend.id);
                                    }}
                                    disabled={wakuStatus === undefined}
                                    className={`flex-1 py-2.5 px-3 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 ${
                                        wakuStatus === undefined
                                            ? "bg-zinc-700/50 text-zinc-500 cursor-not-allowed"
                                            : unreadCount > 0
                                            ? "bg-[#FF5500] hover:bg-[#E04D00] text-white"
                                            : "bg-[#FF5500]/10 hover:bg-[#FF5500]/20 text-[#FF5500]"
                                    }`}
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
                                    Chat
                                    {unreadCount > 0 && (
                                        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                                            {unreadCount > 9
                                                ? "9+"
                                                : unreadCount}
                                        </span>
                                    )}
                                </button>
                            )}
                        </div>

                        {/* Friend's Phone Number */}
                        {friendPhone && (
                            <div className="mb-3 flex items-center gap-2">
                                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 rounded-lg">
                                    <svg
                                        className="w-4 h-4 text-emerald-400"
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
                                    <span className="text-emerald-300 text-sm font-medium">
                                        {formatPhoneNumber(friendPhone)}
                                    </span>
                                    <svg
                                        className="w-3.5 h-3.5 text-emerald-400"
                                        fill="currentColor"
                                        viewBox="0 0 20 20"
                                    >
                                        <path
                                            fillRule="evenodd"
                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                            clipRule="evenodd"
                                        />
                                    </svg>
                                </div>
                            </div>
                        )}

                        {/* Friend's Socials */}
                        {friendSocials &&
                            Object.values(friendSocials).some(Boolean) && (
                                <div className="mb-3">
                                    <p className="text-zinc-500 text-xs mb-2">
                                        Socials
                                    </p>
                                    <SocialLinksDisplay
                                        socials={friendSocials}
                                        compact
                                    />
                                </div>
                            )}

                        {/* Profile & Schedule links */}
                        {(publicProfileEnabled || schedulingEnabled) && (
                            <div className="flex gap-2 mb-3">
                                {/* View Profile button (if friend has public profile) */}
                                {publicProfileEnabled && (
                                    <a
                                        href={`/user/${friend.address}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 py-2.5 px-3 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-sm transition-colors flex items-center justify-center gap-2"
                                    >
                                        <svg
                                            className="w-4 h-4 shrink-0"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                            />
                                        </svg>
                                        <span>View Profile</span>
                                    </a>
                                )}
                                {/* Schedule button (if friend has scheduling enabled) */}
                                {schedulingEnabled && (
                                    <a
                                        href={`/schedule/${friend.address}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 py-2.5 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-sm transition-colors flex items-center justify-center gap-2"
                                    >
                                        <svg
                                            className="w-4 h-4 shrink-0"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                            />
                                        </svg>
                                        <span>Schedule a Call</span>
                                    </a>
                                )}
                            </div>
                        )}

                        {/* Nickname, Tag, Favorite, Copy & Remove buttons */}
                        <div className="grid grid-cols-5 sm:grid-cols-4 gap-1.5 sm:gap-2">
                            {/* Favorite toggle - only on mobile */}
                            <button
                                onClick={onToggleFavorite}
                                className={`sm:hidden py-2.5 px-2 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 ${
                                    isFavorite
                                        ? "bg-amber-500/20 text-amber-400"
                                        : "bg-zinc-700/50 hover:bg-zinc-700 text-zinc-400"
                                }`}
                                title={
                                    isFavorite
                                        ? "Remove from favorites"
                                        : "Add to favorites"
                                }
                            >
                                <svg
                                    className="w-4 h-4 shrink-0"
                                    fill={isFavorite ? "currentColor" : "none"}
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                                    />
                                </svg>
                            </button>
                            <button
                                onClick={onEditNote}
                                className="py-2.5 px-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs sm:text-sm transition-colors flex items-center justify-center gap-1.5"
                            >
                                <svg
                                    className="w-4 h-4 shrink-0"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                    />
                                </svg>
                                <span className="truncate hidden sm:inline">
                                    {friend.nickname ? "Edit" : "Nickname"}
                                </span>
                            </button>
                            <button
                                onClick={onEditTag}
                                className="py-2.5 px-2 rounded-lg bg-[#FF5500]/10 hover:bg-[#FF5500]/20 text-[#FFBBA7] text-xs sm:text-sm transition-colors flex items-center justify-center gap-1.5"
                            >
                                <svg
                                    className="w-4 h-4 shrink-0"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                                    />
                                </svg>
                                <span className="truncate hidden sm:inline">
                                    {friendTag?.tag || friendTag?.emoji
                                        ? "Edit"
                                        : "Tag"}
                                </span>
                            </button>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(
                                        friend.address
                                    );
                                }}
                                className="py-2.5 px-2 rounded-lg bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300 text-xs sm:text-sm transition-colors flex items-center justify-center gap-1.5"
                            >
                                <svg
                                    className="w-4 h-4 shrink-0"
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
                                <span className="truncate hidden sm:inline">
                                    Copy
                                </span>
                            </button>
                            <button
                                onClick={() => onRemoveClick(friend)}
                                className="py-2.5 px-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs sm:text-sm transition-colors flex items-center justify-center gap-1.5"
                            >
                                <svg
                                    className="w-4 h-4 shrink-0"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                </svg>
                                <span className="hidden sm:inline truncate">
                                    Remove
                                </span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

export function FriendsList({
    friends,
    userAddress,
    onCall,
    onVideoCall,
    onChat,
    onRemove,
    onUpdateNote,
    isCallActive,
    unreadCounts = {},
    hideChat = false,
    friendsWakuStatus = {},
    onAddFriendClick,
    pendingRequestsCount = 0,
    onViewRequestsClick,
}: FriendsListProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [friendToRemove, setFriendToRemove] = useState<Friend | null>(null);
    const [noteModalFriend, setNoteModalFriend] = useState<Friend | null>(null);
    const [noteText, setNoteText] = useState("");
    const [isSavingNote, setIsSavingNote] = useState(false);
    const [friendStatuses, setFriendStatuses] = useState<
        Record<string, FriendStatus>
    >({});
    const [friendSocials, setFriendSocials] = useState<
        Record<string, SocialLinks>
    >({});
    const [friendPhones, setFriendPhones] = useState<Record<string, string>>(
        {}
    );
    const [friendScheduling, setFriendScheduling] = useState<
        Record<string, boolean>
    >({});
    const [friendPublicProfiles, setFriendPublicProfiles] = useState<
        Record<string, boolean>
    >({});
    const [friendCustomAvatars, setFriendCustomAvatars] = useState<
        Record<string, string | null>
    >({});

    // Friend tags hook
    const { getTag, setTag, getAllTags } = useFriendTags(userAddress || null);
    const [tagModalFriend, setTagModalFriend] = useState<Friend | null>(null);
    const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(
        null
    );

    // New state for search, filter, sort, and favorites
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
    const [showSearch, setShowSearch] = useState(false);

    useEffect(() => {
        const t = setTimeout(
            () => setDebouncedSearchQuery(searchQuery),
            SEARCH_DEBOUNCE_MS
        );
        return () => clearTimeout(t);
    }, [searchQuery]);
    const [filter, setFilter] = useState<FilterType>("all");
    const [sortBy, setSortBy] = useState<SortType>("name");
    const [favorites, setFavorites] = useState<Set<string>>(new Set());
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [onlineStatuses, setOnlineStatuses] = useState<
        Record<string, boolean>
    >({});

    // Virtual scroll container ref
    const parentRef = useRef<HTMLDivElement>(null);

    // Load favorites from localStorage immediately (fast)
    useEffect(() => {
        const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
        if (stored) {
            try {
                setFavorites(new Set(JSON.parse(stored)));
            } catch {
                // Invalid stored data
            }
        }
    }, []);

    // Fetch all friend data in parallel (fast!)
    useEffect(() => {
        if (friends.length === 0) return;
        if (!isSupabaseConfigured || !supabase) return;

        const client = supabase; // Capture for closure
        const addresses = friends.map((f) => f.address.toLowerCase());

        const fetchAllData = async () => {
            // Run ALL queries in parallel - much faster than sequential
            const [
                userSettingsResult,
                socialsResult,
                phonesResult,
                favoritesResult,
            ] = await Promise.all([
                // Combined query for statuses + online + scheduling + avatar preferences + public profile
                client
                    .from("shout_user_settings")
                    .select(
                        "wallet_address, status_emoji, status_text, is_dnd, last_seen, scheduling_enabled, scheduling_slug, custom_avatar_url, use_custom_avatar, public_landing_enabled"
                    )
                    .in("wallet_address", addresses),
                // Socials
                client
                    .from("shout_socials")
                    .select("*")
                    .in("wallet_address", addresses),
                // Phone numbers
                client
                    .from("shout_phone_numbers")
                    .select("wallet_address, phone_number")
                    .in("wallet_address", addresses)
                    .eq("verified", true),
                // Favorites (if user is logged in)
                userAddress
                    ? client
                          .from("shout_favorites")
                          .select("friend_address")
                          .eq("user_address", userAddress.toLowerCase())
                    : Promise.resolve({ data: null, error: null }),
            ]);

            // Process user settings (statuses + online + scheduling + avatars + public profiles)
            if (userSettingsResult.data) {
                const statuses: Record<string, FriendStatus> = {};
                const online: Record<string, boolean> = {};
                const scheduling: Record<string, boolean> = {};
                const publicProfiles: Record<string, boolean> = {};
                const customAvatars: Record<string, string | null> = {};
                const now = Date.now();
                const ONLINE_THRESHOLD = 120000; // 2 minutes

                userSettingsResult.data.forEach((row: any) => {
                    statuses[row.wallet_address] = {
                        emoji: row.status_emoji || "💬",
                        text: row.status_text || "",
                        isDnd: row.is_dnd || false,
                    };
                    // Check if online
                    if (row.last_seen) {
                        const lastSeenTime = new Date(row.last_seen).getTime();
                        online[row.wallet_address] =
                            now - lastSeenTime < ONLINE_THRESHOLD;
                    }
                    // Check if scheduling enabled
                    if (row.scheduling_enabled) {
                        scheduling[row.wallet_address] = true;
                    }
                    // Check if public profile enabled
                    if (row.public_landing_enabled) {
                        publicProfiles[row.wallet_address] = true;
                    }
                    // Store custom avatar if friend has one enabled
                    if (row.use_custom_avatar && row.custom_avatar_url) {
                        customAvatars[row.wallet_address] =
                            row.custom_avatar_url;
                    }
                });
                setFriendStatuses(statuses);
                setOnlineStatuses(online);
                setFriendScheduling(scheduling);
                setFriendPublicProfiles(publicProfiles);
                setFriendCustomAvatars(customAvatars);
            }

            // Process socials
            if (socialsResult.data) {
                const socials: Record<string, SocialLinks> = {};
                socialsResult.data.forEach((row) => {
                    socials[row.wallet_address] = {
                        x: row.x_username || undefined,
                        farcaster: row.farcaster_username || undefined,
                        instagram: row.instagram_username || undefined,
                        tiktok: row.tiktok_username || undefined,
                        youtube: row.youtube_handle || undefined,
                        linkedin: row.linkedin_username || undefined,
                        github: row.github_username || undefined,
                    };
                });
                setFriendSocials(socials);
            }

            // Process phones
            if (phonesResult.data) {
                const phones: Record<string, string> = {};
                phonesResult.data.forEach((row) => {
                    phones[row.wallet_address] = row.phone_number;
                });
                setFriendPhones(phones);
            }

            // Process favorites (sync with Supabase, update localStorage)
            if (favoritesResult.data) {
                const favSet = new Set(
                    favoritesResult.data.map((row) => row.friend_address)
                );
                setFavorites(favSet);
                localStorage.setItem(
                    FAVORITES_STORAGE_KEY,
                    JSON.stringify([...favSet])
                );
            }
        };

        fetchAllData();

        // Refresh online statuses every 30 seconds (just online, not everything)
        const refreshOnline = async () => {
            const { data } = await client
                .from("shout_user_settings")
                .select("wallet_address, last_seen")
                .in("wallet_address", addresses);

            if (data) {
                const online: Record<string, boolean> = {};
                const now = Date.now();
                const ONLINE_THRESHOLD = 120000;
                data.forEach((row) => {
                    if (row.last_seen) {
                        const lastSeenTime = new Date(row.last_seen).getTime();
                        online[row.wallet_address] =
                            now - lastSeenTime < ONLINE_THRESHOLD;
                    }
                });
                setOnlineStatuses(online);
            }
        };

        const interval = setInterval(refreshOnline, 30000);
        return () => clearInterval(interval);
    }, [friends, userAddress]);

    // Toggle favorite with Supabase persistence
    const toggleFavorite = useCallback(
        async (friendAddress: string) => {
            const addressLower = friendAddress.toLowerCase();
            const isFavorite = favorites.has(addressLower);

            // Optimistic update
            setFavorites((prev) => {
                const newFavorites = new Set(prev);
                if (isFavorite) {
                    newFavorites.delete(addressLower);
                } else {
                    newFavorites.add(addressLower);
                }
                return newFavorites;
            });

            // Persist to Supabase
            if (isSupabaseConfigured && supabase && userAddress) {
                try {
                    if (isFavorite) {
                        // Remove from favorites
                        await supabase
                            .from("shout_favorites")
                            .delete()
                            .eq("user_address", userAddress.toLowerCase())
                            .eq("friend_address", addressLower);
                    } else {
                        // Add to favorites
                        await supabase.from("shout_favorites").insert({
                            user_address: userAddress.toLowerCase(),
                            friend_address: addressLower,
                        });
                    }
                } catch (err) {
                    console.warn(
                        "[FriendsList] Failed to save favorite to Supabase"
                    );
                    // Revert optimistic update on error
                    setFavorites((prev) => {
                        const reverted = new Set(prev);
                        if (isFavorite) {
                            reverted.add(addressLower);
                        } else {
                            reverted.delete(addressLower);
                        }
                        return reverted;
                    });
                }
            } else {
                // Fallback to localStorage
                setFavorites((prev) => {
                    localStorage.setItem(
                        FAVORITES_STORAGE_KEY,
                        JSON.stringify([...prev])
                    );
                    return prev;
                });
            }
        },
        [favorites, userAddress]
    );

    const toggleExpand = useCallback((id: string) => {
        setExpandedId((prev) => (prev === id ? null : id));
    }, []);

    const handleRemoveClick = useCallback((friend: Friend) => {
        setFriendToRemove(friend);
        setExpandedId(null);
    }, []);

    // Subscribe to realtime status updates
    useEffect(() => {
        if (!isSupabaseConfigured || !supabase || friends.length === 0) return;

        const client = supabase; // Capture for closure
        const channel = client
            .channel("friend-statuses")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "shout_user_settings",
                },
                (payload) => {
                    const newData = payload.new as any;
                    if (
                        newData &&
                        friends.some(
                            (f) =>
                                f.address.toLowerCase() ===
                                newData.wallet_address
                        )
                    ) {
                        setFriendStatuses((prev) => ({
                            ...prev,
                            [newData.wallet_address]: {
                                emoji: newData.status_emoji || "💬",
                                text: newData.status_text || "",
                                isDnd: newData.is_dnd || false,
                            },
                        }));
                        // Also update online status
                        if (newData.last_seen) {
                            const now = Date.now();
                            const lastSeenTime = new Date(
                                newData.last_seen
                            ).getTime();
                            setOnlineStatuses((prev) => ({
                                ...prev,
                                [newData.wallet_address]:
                                    now - lastSeenTime < 120000,
                            }));
                        }
                    }
                }
            )
            .subscribe();

        return () => {
            client.removeChannel(channel);
        };
    }, [friends]);

    // Get all available tags
    const availableTags = useMemo(() => getAllTags(), [getAllTags]);

    // Filter and sort friends
    const processedFriends = useMemo(() => {
        let result = [...friends];

        // Apply search filter (debounced; also searches tags)
        if (debouncedSearchQuery.trim()) {
            const query = debouncedSearchQuery.toLowerCase();
            result = result.filter((friend) => {
                const displayName = getDisplayName(friend).toLowerCase();
                const address = friend.address.toLowerCase();
                const ensName = friend.ensName?.toLowerCase() || "";
                const username = friend.reachUsername?.toLowerCase() || "";
                const tag = getTag(friend.address.toLowerCase());
                const tagText = tag?.tag?.toLowerCase() || "";
                return (
                    displayName.includes(query) ||
                    address.includes(query) ||
                    ensName.includes(query) ||
                    username.includes(query) ||
                    tagText.includes(query)
                );
            });
        }

        // Apply tag filter
        if (selectedTagFilter) {
            result = result.filter((f) => {
                const tag = getTag(f.address.toLowerCase());
                return tag?.tag === selectedTagFilter;
            });
        }

        // Apply filter type
        if (filter === "online") {
            result = result.filter(
                (f) => onlineStatuses[f.address.toLowerCase()]
            );
        } else if (filter === "favorites") {
            result = result.filter((f) =>
                favorites.has(f.address.toLowerCase())
            );
        }

        // Sort - favorites always first, then by selected sort
        result.sort((a, b) => {
            // Favorites always come first
            const aFav = favorites.has(a.address.toLowerCase());
            const bFav = favorites.has(b.address.toLowerCase());
            if (aFav && !bFav) return -1;
            if (!aFav && bFav) return 1;

            // Then apply selected sort
            switch (sortBy) {
                case "online":
                    const aOnline = onlineStatuses[a.address.toLowerCase()];
                    const bOnline = onlineStatuses[b.address.toLowerCase()];
                    if (aOnline && !bOnline) return -1;
                    if (!aOnline && bOnline) return 1;
                    return getDisplayName(a).localeCompare(getDisplayName(b));
                case "recent":
                    return (
                        new Date(b.addedAt).getTime() -
                        new Date(a.addedAt).getTime()
                    );
                case "tag":
                    // Group by tag - friends with tags come first, then by tag name
                    const aTag = getTag(a.address.toLowerCase());
                    const bTag = getTag(b.address.toLowerCase());
                    const aTagName = aTag?.tag || "";
                    const bTagName = bTag?.tag || "";
                    // Friends with tags come before those without
                    if (aTagName && !bTagName) return -1;
                    if (!aTagName && bTagName) return 1;
                    // Then sort by tag name
                    if (aTagName !== bTagName) {
                        return aTagName.localeCompare(bTagName);
                    }
                    // Within same tag, sort by name
                    return getDisplayName(a).localeCompare(getDisplayName(b));
                case "name":
                default:
                    return getDisplayName(a).localeCompare(getDisplayName(b));
            }
        });

        return result;
    }, [
        friends,
        debouncedSearchQuery,
        filter,
        sortBy,
        favorites,
        onlineStatuses,
        selectedTagFilter,
        getTag,
    ]);

    // Virtual scrolling - only enabled for large lists
    const useVirtual = processedFriends.length > 20;
    const virtualizer = useVirtualizer({
        count: processedFriends.length,
        getScrollElement: () => parentRef.current,
        estimateSize: useCallback(
            (index: number) => {
                // Expanded items are much taller (~400px); collapsed are ~76px
                const friend = processedFriends[index];
                return expandedId === friend?.id ? 400 : 76;
            },
            [processedFriends, expandedId]
        ),
        overscan: 5,
        enabled: useVirtual,
    });

    // Re-measure all items when expandedId changes so heights update
    useEffect(() => {
        if (useVirtual) {
            virtualizer.measure();
        }
    }, [expandedId, useVirtual, virtualizer]);

    const onlineCount = friends.filter(
        (f) => onlineStatuses[f.address.toLowerCase()]
    ).length;
    const favoritesCount = friends.filter((f) =>
        favorites.has(f.address.toLowerCase())
    ).length;

    if (friends.length === 0) {
        return (
            <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                    <svg
                        className="w-8 h-8 text-zinc-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                    </svg>
                </div>
                <p className="text-zinc-400 font-medium">No friends yet</p>
                <p className="text-zinc-600 text-sm mt-1 mb-4">
                    Add friends to start calling them
                </p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center items-center">
                    {onAddFriendClick && (
                        <button
                            type="button"
                            onClick={onAddFriendClick}
                            className="px-4 py-2.5 rounded-xl bg-[#FF5500] hover:bg-[#E04D00] text-white text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            <span>👋</span>
                            Add your first friend
                        </button>
                    )}
                    {pendingRequestsCount > 0 && onViewRequestsClick && (
                        <button
                            type="button"
                            onClick={onViewRequestsClick}
                            className="px-4 py-2.5 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            <span>📩</span>
                            View friend requests ({pendingRequestsCount})
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-1.5 sm:space-y-3">
            {/* Filter Tabs, Search Toggle & Sort */}
            <div className="flex items-center justify-between gap-2">
                {/* Filter Tabs - Compact */}
                <div className="flex gap-1 p-1 bg-zinc-800/50 rounded-lg">
                    <button
                        onClick={() => setFilter("all")}
                        className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                            filter === "all"
                                ? "bg-[#FF5500] text-white"
                                : "text-zinc-400 hover:text-white"
                        }`}
                    >
                        All
                        <span className="ml-1 text-[10px] sm:text-xs opacity-70">
                            {friends.length}
                        </span>
                    </button>
                    <button
                        onClick={() => setFilter("online")}
                        className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1 ${
                            filter === "online"
                                ? "bg-emerald-500 text-white"
                                : "text-zinc-400 hover:text-white"
                        }`}
                    >
                        <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-400" />
                        <span className="hidden sm:inline">Online</span>
                        <span className="text-[10px] sm:text-xs opacity-70">
                            {onlineCount}
                        </span>
                    </button>
                    <button
                        onClick={() => setFilter("favorites")}
                        className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all flex items-center gap-1 ${
                            filter === "favorites"
                                ? "bg-amber-500 text-white"
                                : "text-zinc-400 hover:text-white"
                        }`}
                    >
                        <svg
                            className="w-3 h-3 sm:w-3.5 sm:h-3.5"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                        <span className="text-[10px] sm:text-xs opacity-70">
                            {favoritesCount}
                        </span>
                    </button>
                </div>

                {/* Search Toggle & Sort */}
                <div className="flex items-center gap-1">
                    {/* Search Toggle Button */}
                    <button
                        onClick={() => setShowSearch(!showSearch)}
                        className={`p-1.5 sm:p-2 rounded-lg transition-all ${
                            showSearch || searchQuery
                                ? "bg-[#FF5500] text-white"
                                : "bg-zinc-800/50 text-zinc-400 hover:text-white"
                        }`}
                        title="Search friends"
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

                    {/* Sort Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowSortMenu(!showSortMenu)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-zinc-400 hover:text-white transition-colors"
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
                                    d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"
                                />
                            </svg>
                            <span className="text-sm hidden sm:inline">
                                {sortBy === "name"
                                    ? "Name"
                                    : sortBy === "online"
                                    ? "Online"
                                    : sortBy === "tag"
                                    ? "By Tag"
                                    : "Recent"}
                            </span>
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
                                    d="M19 9l-7 7-7-7"
                                />
                            </svg>
                        </button>

                        <AnimatePresence>
                            {showSortMenu && (
                                <>
                                    <div
                                        className="fixed inset-0 z-10"
                                        onClick={() => setShowSortMenu(false)}
                                    />
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="absolute right-0 top-full mt-1 z-20 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden min-w-[140px]"
                                    >
                                        {[
                                            { value: "name", label: "Name" },
                                            {
                                                value: "online",
                                                label: "Online First",
                                            },
                                            {
                                                value: "recent",
                                                label: "Recently Added",
                                            },
                                            {
                                                value: "tag",
                                                label: "Group By Tag",
                                            },
                                        ].map((option) => (
                                            <button
                                                key={option.value}
                                                onClick={() => {
                                                    setSortBy(
                                                        option.value as SortType
                                                    );
                                                    setShowSortMenu(false);
                                                }}
                                                className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                                                    sortBy === option.value
                                                        ? "bg-[#FF5500]/20 text-[#FF5500]"
                                                        : "text-zinc-300 hover:bg-zinc-700"
                                                }`}
                                            >
                                                {option.label}
                                            </button>
                                        ))}
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Expandable Search Bar */}
            <AnimatePresence>
                {showSearch && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
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
                                type="text"
                                placeholder="Search friends..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                spellCheck={false}
                                autoCorrect="off"
                                autoCapitalize="off"
                                autoComplete="off"
                                autoFocus
                                className="w-full pl-9 pr-8 py-2 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-[#FF5500]/50 transition-all"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500 hover:text-zinc-300 transition-colors"
                                >
                                    <svg
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
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Tag Filter Pills */}
            {availableTags.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-1">
                    {selectedTagFilter && (
                        <button
                            onClick={() => setSelectedTagFilter(null)}
                            className="px-2 py-1 rounded-md text-xs text-zinc-400 hover:text-white transition-colors whitespace-nowrap"
                            title="Clear tag filter"
                        >
                            ✕
                        </button>
                    )}
                    {availableTags.slice(0, 5).map((tag) => (
                        <button
                            key={tag}
                            onClick={() =>
                                setSelectedTagFilter(
                                    selectedTagFilter === tag ? null : tag
                                )
                            }
                            className={`px-2 py-0.5 rounded text-xs font-medium transition-all whitespace-nowrap ${
                                selectedTagFilter === tag
                                    ? "bg-[#FF5500] text-white"
                                    : "bg-zinc-800/50 text-zinc-400 hover:bg-zinc-700"
                            }`}
                        >
                            {tag}
                        </button>
                    ))}
                    {availableTags.length > 5 && (
                        <span className="text-xs text-zinc-500 whitespace-nowrap">
                            +{availableTags.length - 5}
                        </span>
                    )}
                </div>
            )}

            {/* Results count when searching/filtering */}
            {(searchQuery || filter !== "all" || selectedTagFilter) && (
                <div className="text-sm text-zinc-500">
                    {processedFriends.length === 0 ? (
                        <span>No friends found</span>
                    ) : (
                        <span>
                            Showing {processedFriends.length} of{" "}
                            {friends.length} friends
                            {selectedTagFilter &&
                                ` (tagged "${selectedTagFilter}")`}
                        </span>
                    )}
                </div>
            )}

            {/* Friends List */}
            {processedFriends.length === 0 ? (
                <div className="text-center py-8">
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                        <svg
                            className="w-6 h-6 text-zinc-600"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                        </svg>
                    </div>
                    <p className="text-zinc-400">
                        {filter === "online"
                            ? "No friends online"
                            : filter === "favorites"
                            ? "No favorite friends"
                            : selectedTagFilter
                            ? `No friends tagged "${selectedTagFilter}"`
                            : "No friends match your search"}
                    </p>
                    {(filter !== "all" || selectedTagFilter) && (
                        <button
                            onClick={() => {
                                setFilter("all");
                                setSearchQuery("");
                                setSelectedTagFilter(null);
                            }}
                            className="mt-2 text-sm text-[#FF5500] hover:underline"
                        >
                            Show all friends
                        </button>
                    )}
                </div>
            ) : useVirtual ? (
                // Virtual scrolling for large lists
                <div
                    ref={parentRef}
                    className="max-h-[500px] overflow-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
                >
                    <div
                        style={{
                            height: `${virtualizer.getTotalSize()}px`,
                            width: "100%",
                            position: "relative",
                        }}
                    >
                        {virtualizer.getVirtualItems().map((virtualItem) => {
                            const friend = processedFriends[virtualItem.index];
                            const addressLower = friend.address.toLowerCase();
                            return (
                                <div
                                    key={friend.id}
                                    data-index={virtualItem.index}
                                    ref={virtualizer.measureElement}
                                    style={{
                                        position: "absolute",
                                        top: 0,
                                        left: 0,
                                        width: "100%",
                                        transform: `translateY(${virtualItem.start}px)`,
                                    }}
                                    className="pb-2"
                                >
                                    <FriendCard
                                        friend={friend}
                                        effectiveAvatar={getEffectiveAvatar(
                                            friend,
                                            friendCustomAvatars
                                        )}
                                        index={virtualItem.index}
                                        isExpanded={expandedId === friend.id}
                                        isFavorite={favorites.has(addressLower)}
                                        isOnline={
                                            onlineStatuses[addressLower] ||
                                            false
                                        }
                                        friendStatus={
                                            friendStatuses[addressLower]
                                        }
                                        friendSocials={
                                            friendSocials[addressLower]
                                        }
                                        friendPhone={friendPhones[addressLower]}
                                        friendTag={getTag(addressLower)}
                                        schedulingEnabled={
                                            friendScheduling[addressLower] ||
                                            false
                                        }
                                        publicProfileEnabled={
                                            friendPublicProfiles[
                                                addressLower
                                            ] || false
                                        }
                                        wakuStatus={
                                            friendsWakuStatus[addressLower]
                                        }
                                        unreadCount={
                                            unreadCounts[addressLower] || 0
                                        }
                                        isCallActive={isCallActive}
                                        hideChat={hideChat}
                                        onToggleExpand={toggleExpand}
                                        onToggleFavorite={() =>
                                            toggleFavorite(friend.address)
                                        }
                                        onEditTag={() =>
                                            setTagModalFriend(friend)
                                        }
                                        onEditNote={() => {
                                            setNoteText(friend.nickname || "");
                                            setNoteModalFriend(friend);
                                        }}
                                        onCall={onCall}
                                        onVideoCall={onVideoCall}
                                        onChat={onChat}
                                        onRemoveClick={handleRemoveClick}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                // Regular rendering for small lists
                <div className="space-y-1 sm:space-y-2">
                    {processedFriends.map((friend, index) => {
                        const addressLower = friend.address.toLowerCase();
                        return (
                            <FriendCard
                                key={friend.id}
                                friend={friend}
                                effectiveAvatar={getEffectiveAvatar(
                                    friend,
                                    friendCustomAvatars
                                )}
                                index={index}
                                isExpanded={expandedId === friend.id}
                                isFavorite={favorites.has(addressLower)}
                                isOnline={onlineStatuses[addressLower] || false}
                                friendStatus={friendStatuses[addressLower]}
                                friendSocials={friendSocials[addressLower]}
                                friendPhone={friendPhones[addressLower]}
                                friendTag={getTag(addressLower)}
                                schedulingEnabled={
                                    friendScheduling[addressLower] || false
                                }
                                publicProfileEnabled={
                                    friendPublicProfiles[addressLower] || false
                                }
                                wakuStatus={friendsWakuStatus[addressLower]}
                                unreadCount={unreadCounts[addressLower] || 0}
                                isCallActive={isCallActive}
                                hideChat={hideChat}
                                onToggleExpand={toggleExpand}
                                onToggleFavorite={() =>
                                    toggleFavorite(friend.address)
                                }
                                onEditTag={() => setTagModalFriend(friend)}
                                onEditNote={() => {
                                    setNoteText(friend.nickname || "");
                                    setNoteModalFriend(friend);
                                }}
                                onCall={onCall}
                                onVideoCall={onVideoCall}
                                onChat={onChat}
                                onRemoveClick={handleRemoveClick}
                            />
                        );
                    })}
                </div>
            )}

            {/* Remove Friend Confirmation Modal */}
            <AnimatePresence>
                {friendToRemove && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setFriendToRemove(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full"
                        >
                            <div className="text-center">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
                                    <svg
                                        className="w-8 h-8 text-red-400"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                        />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">
                                    Remove Friend
                                </h3>
                                <p className="text-zinc-400 mb-6">
                                    Are you sure you want to remove{" "}
                                    <span className="text-white font-medium">
                                        {friendToRemove.nickname ||
                                            friendToRemove.reachUsername ||
                                            friendToRemove.ensName ||
                                            `${friendToRemove.address.slice(
                                                0,
                                                6
                                            )}...${friendToRemove.address.slice(
                                                -4
                                            )}`}
                                    </span>
                                    ? This action cannot be undone.
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setFriendToRemove(null)}
                                        className="flex-1 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            onRemove(friendToRemove.id);
                                            setFriendToRemove(null);
                                        }}
                                        className="flex-1 py-3 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium transition-colors"
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Friend Tag Modal */}
            {tagModalFriend && (
                <FriendTagModal
                    isOpen={!!tagModalFriend}
                    onClose={() => setTagModalFriend(null)}
                    friendAddress={tagModalFriend.address}
                    friendName={
                        tagModalFriend.nickname ||
                        tagModalFriend.reachUsername ||
                        tagModalFriend.ensName
                    }
                    currentTag={
                        getTag(tagModalFriend.address.toLowerCase())?.tag
                    }
                    currentEmoji={
                        getTag(tagModalFriend.address.toLowerCase())?.emoji
                    }
                    currentColor={
                        getTag(tagModalFriend.address.toLowerCase())?.color
                    }
                    onSave={async (tag, emoji, color) => {
                        const success = await setTag(
                            tagModalFriend.address,
                            tag,
                            emoji,
                            color
                        );
                        return success;
                    }}
                />
            )}

            {/* Nickname Edit Modal */}
            <AnimatePresence>
                {noteModalFriend && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={() => setNoteModalFriend(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-white">
                                    {noteModalFriend.nickname
                                        ? "Edit Nickname"
                                        : "Add Nickname"}
                                </h3>
                                <button
                                    onClick={() => setNoteModalFriend(null)}
                                    className="text-zinc-500 hover:text-white transition-colors"
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

                            <p className="text-zinc-400 text-sm mb-4">
                                Set a nickname for{" "}
                                <span className="text-white font-medium">
                                    {noteModalFriend.reachUsername
                                        ? `@${noteModalFriend.reachUsername}`
                                        : noteModalFriend.ensName ||
                                          formatAddress(
                                              noteModalFriend.address
                                          )}
                                </span>
                            </p>

                            <textarea
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                placeholder="e.g. Kevin, ETH Denver Friend"
                                className="w-full py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all resize-none"
                                rows={3}
                                maxLength={200}
                            />
                            <p className="text-zinc-500 text-xs mt-1 text-right">
                                {noteText.length}/200
                            </p>

                            <div className="flex gap-3 mt-4">
                                <button
                                    onClick={() => setNoteModalFriend(null)}
                                    className="flex-1 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        if (!onUpdateNote || !noteModalFriend)
                                            return;
                                        setIsSavingNote(true);
                                        const success = await onUpdateNote(
                                            noteModalFriend.id,
                                            noteText.trim()
                                        );
                                        setIsSavingNote(false);
                                        if (success) {
                                            setNoteModalFriend(null);
                                        }
                                    }}
                                    disabled={isSavingNote}
                                    className="flex-1 py-3 px-4 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isSavingNote ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        "Save Nickname"
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
