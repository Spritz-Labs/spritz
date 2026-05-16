"use client";

import { memo, useMemo } from "react";
import { motion } from "motion/react";
import type { UnifiedChatItem } from "./UnifiedChatList";

interface ReEntrySummaryProps {
    daysSinceLastLogin: number;
    unifiedChats: UnifiedChatItem[];
    onOpenChat: (address: string) => void;
    onDismiss: () => void;
}

export const ReEntrySummary = memo(function ReEntrySummary({
    daysSinceLastLogin,
    unifiedChats,
    onOpenChat,
    onDismiss,
}: ReEntrySummaryProps) {
    const unreadChats = useMemo(
        () =>
            unifiedChats
                .filter((c) => c.unreadCount > 0)
                .sort((a, b) => b.unreadCount - a.unreadCount),
        [unifiedChats]
    );

    const totalUnread = useMemo(
        () => unreadChats.reduce((sum, c) => sum + c.unreadCount, 0),
        [unreadChats]
    );

    const topChats = unreadChats.slice(0, 3);

    if (totalUnread === 0 && daysSinceLastLogin < 7) return null;

    const timeLabel =
        daysSinceLastLogin === 1
            ? "1 day"
            : daysSinceLastLogin < 7
              ? `${daysSinceLastLogin} days`
              : daysSinceLastLogin < 30
                ? `${Math.floor(daysSinceLastLogin / 7)} week${Math.floor(daysSinceLastLogin / 7) > 1 ? "s" : ""}`
                : `${Math.floor(daysSinceLastLogin / 30)} month${Math.floor(daysSinceLastLogin / 30) > 1 ? "s" : ""}`;

    return (
        <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="mx-3 mb-3 rounded-2xl bg-gradient-to-br from-zinc-800/80 to-zinc-900/90 border border-zinc-700/50 overflow-hidden"
        >
            <div className="px-4 pt-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-white font-semibold text-base">Welcome back</h3>
                    <button
                        onClick={onDismiss}
                        className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 -mr-1"
                        aria-label="Dismiss"
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path
                                d="M4 4l8 8M12 4l-8 8"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                            />
                        </svg>
                    </button>
                </div>

                <p className="text-zinc-400 text-sm mb-3">
                    {totalUnread > 0
                        ? `You've been away ${timeLabel}. You have ${totalUnread} unread message${totalUnread > 1 ? "s" : ""} in ${unreadChats.length} conversation${unreadChats.length > 1 ? "s" : ""}.`
                        : `You've been away ${timeLabel}. Your friends are here — say hi!`}
                </p>

                {topChats.length > 0 && (
                    <div className="space-y-2">
                        {topChats.map((chat) => (
                            <button
                                key={chat.id}
                                onClick={() => {
                                    onOpenChat(chat.id);
                                    onDismiss();
                                }}
                                className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-zinc-800/60 hover:bg-zinc-700/60 transition-colors text-left"
                            >
                                {chat.avatar ? (
                                    <img
                                        src={chat.avatar}
                                        alt=""
                                        loading="lazy"
                                        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                                    />
                                ) : (
                                    <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0">
                                        <span className="text-zinc-400 text-sm font-medium">
                                            {(chat.displayName || chat.id)[0]?.toUpperCase()}
                                        </span>
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-white text-sm font-medium truncate">
                                        {chat.displayName || chat.id.slice(0, 8)}
                                    </p>
                                    {chat.lastMessage && (
                                        <p className="text-zinc-500 text-xs truncate">
                                            {chat.lastMessage}
                                        </p>
                                    )}
                                </div>
                                <div className="flex-shrink-0">
                                    <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-orange-500 text-white text-xs font-bold">
                                        {chat.unreadCount}
                                    </span>
                                </div>
                            </button>
                        ))}

                        {unreadChats.length > 3 && (
                            <p className="text-zinc-500 text-xs text-center pt-1">
                                +{unreadChats.length - 3} more conversation
                                {unreadChats.length - 3 > 1 ? "s" : ""}
                            </p>
                        )}
                    </div>
                )}

                {topChats.length === 0 && (
                    <button
                        onClick={onDismiss}
                        className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-medium text-sm transition-colors"
                    >
                        Start chatting
                    </button>
                )}
            </div>
        </motion.div>
    );
});
