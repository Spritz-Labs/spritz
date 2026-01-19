"use client";

import { motion, AnimatePresence } from "framer-motion";
import { formatCallDuration, getRelativeTime } from "@/hooks/useCallHistory";
import type { CallHistoryEntry } from "@/app/api/calls/route";
import type { Address } from "viem";

type Friend = {
    id: string;
    address: Address;
    ensName: string | null;
    avatar: string | null;
    nickname: string | null;
    reachUsername: string | null;
    addedAt: string;
};

type CallHistoryProps = {
    userAddress: string;
    friends: Friend[];
    calls: CallHistoryEntry[];
    isLoading: boolean;
    error: string | null;
    onRefresh: () => void;
    onCall: (friend: Friend, withVideo: boolean) => void;
    isCallActive: boolean;
};

export function CallHistory({
    userAddress,
    friends,
    calls,
    isLoading,
    error,
    onRefresh,
    onCall,
    isCallActive,
}: CallHistoryProps) {

    // Helper to find friend by address
    const getFriendByAddress = (address: string): Friend | undefined => {
        return friends.find(
            (f) => f.address.toLowerCase() === address.toLowerCase()
        );
    };

    // Helper to get display name for an address
    const getDisplayName = (address: string): string => {
        const friend = getFriendByAddress(address);
        if (friend) {
            return (
                friend.nickname ||
                friend.reachUsername ||
                friend.ensName ||
                `${address.slice(0, 6)}...${address.slice(-4)}`
            );
        }
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    // Helper to get avatar for an address
    const getAvatar = (address: string): string | null => {
        const friend = getFriendByAddress(address);
        return friend?.avatar || null;
    };

    // Determine if the current user was the caller or callee
    const isOutgoing = (call: CallHistoryEntry): boolean => {
        return call.caller_address.toLowerCase() === userAddress.toLowerCase();
    };

    // Get the other party's address
    const getOtherParty = (call: CallHistoryEntry): string => {
        return isOutgoing(call) ? call.callee_address : call.caller_address;
    };

    // Get status icon and color
    const getStatusInfo = (call: CallHistoryEntry) => {
        const outgoing = isOutgoing(call);
        
        switch (call.status) {
            case "completed":
                return {
                    icon: outgoing ? "↗️" : "↙️",
                    color: "text-green-400",
                    label: outgoing ? "Outgoing" : "Incoming",
                };
            case "missed":
                return {
                    icon: "📵",
                    color: "text-red-400",
                    label: "Missed",
                };
            case "declined":
                return {
                    icon: "🚫",
                    color: "text-orange-400",
                    label: "Declined",
                };
            case "failed":
                return {
                    icon: "❌",
                    color: "text-red-400",
                    label: "Failed",
                };
            default:
                return {
                    icon: "📞",
                    color: "text-zinc-400",
                    label: "Unknown",
                };
        }
    };

    if (isLoading && calls.length === 0) {
        return (
            <div className="flex items-center justify-center py-8 sm:py-12">
                <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-2 border-zinc-600 border-t-green-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-8 sm:py-12 px-2">
                <p className="text-red-400 text-sm mb-3 sm:mb-4">{error}</p>
                <button
                    onClick={onRefresh}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white text-sm transition-colors"
                >
                    Try Again
                </button>
            </div>
        );
    }

    if (calls.length === 0) {
        return (
            <div className="text-center py-8 sm:py-12 px-2">
                <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full bg-zinc-800/50 flex items-center justify-center">
                    <span className="text-2xl sm:text-3xl">📞</span>
                </div>
                <h3 className="text-base sm:text-lg font-medium text-white mb-1.5 sm:mb-2">No Call History</h3>
                <p className="text-zinc-500 text-xs sm:text-sm max-w-xs mx-auto">
                    Your voice and video calls with friends will appear here.
                </p>
                {friends.length > 0 && (
                    <div className="mt-4 sm:mt-6">
                        <p className="text-zinc-400 text-xs sm:text-sm mb-2 sm:mb-3">Quick call a friend:</p>
                        <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2">
                            {friends.slice(0, 4).map((friend) => (
                                <button
                                    key={friend.id}
                                    onClick={() => onCall(friend, false)}
                                    disabled={isCallActive}
                                    className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    {friend.avatar ? (
                                        <img
                                            src={friend.avatar}
                                            alt=""
                                            className="w-5 h-5 sm:w-6 sm:h-6 rounded-full"
                                        />
                                    ) : (
                                        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-[10px] sm:text-xs text-white">
                                            {(friend.nickname || friend.reachUsername || friend.ensName || friend.address)?.[0]?.toUpperCase() || "?"}
                                        </div>
                                    )}
                                    <span className="text-xs sm:text-sm text-white">
                                        {friend.nickname || friend.reachUsername || friend.ensName || `${friend.address.slice(0, 6)}...`}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Group calls by date
    const groupedCalls = calls.reduce((acc, call) => {
        const date = new Date(call.created_at).toDateString();
        if (!acc[date]) {
            acc[date] = [];
        }
        acc[date].push(call);
        return acc;
    }, {} as Record<string, CallHistoryEntry[]>);

    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    const getDateLabel = (dateString: string): string => {
        if (dateString === today) return "Today";
        if (dateString === yesterday) return "Yesterday";
        return new Date(dateString).toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
        });
    };

    return (
        <div className="space-y-4 sm:space-y-6">
            {Object.entries(groupedCalls).map(([date, dayCalls]) => (
                <div key={date}>
                    <h3 className="text-[10px] sm:text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 sm:mb-3 px-1">
                        {getDateLabel(date)}
                    </h3>
                    <div className="space-y-1.5 sm:space-y-2">
                        <AnimatePresence>
                            {dayCalls.map((call, index) => {
                                const otherParty = getOtherParty(call);
                                const friend = getFriendByAddress(otherParty);
                                const statusInfo = getStatusInfo(call);
                                const avatar = getAvatar(otherParty);

                                return (
                                    <motion.div
                                        key={call.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                        className={`flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl transition-colors group ${
                                            call.status === "missed" || call.status === "declined"
                                                ? "bg-red-500/5 hover:bg-red-500/10 border border-red-500/10"
                                                : "bg-zinc-800/30 sm:bg-zinc-800/30 hover:bg-zinc-800/50"
                                        }`}
                                    >
                                        {/* Avatar */}
                                        <div className="relative flex-shrink-0">
                                            {avatar ? (
                                                <img
                                                    src={avatar}
                                                    alt=""
                                                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                                                    <span className="text-sm sm:text-lg text-white font-medium">
                                                        {getDisplayName(otherParty)[0]?.toUpperCase() || "?"}
                                                    </span>
                                                </div>
                                            )}
                                            {/* Call type badge */}
                                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-zinc-900 flex items-center justify-center">
                                                <span className="text-[10px] sm:text-xs">
                                                    {call.call_type === "video" ? "🎥" : "📞"}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Call info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 sm:gap-2">
                                                <p className="text-sm sm:text-base text-white font-medium truncate">
                                                    {getDisplayName(otherParty)}
                                                </p>
                                                <span className={`text-[10px] sm:text-xs ${statusInfo.color}`}>
                                                    {statusInfo.icon}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-zinc-500">
                                                <span className={statusInfo.color}>
                                                    {statusInfo.label}
                                                </span>
                                                {call.status === "completed" && call.duration_seconds > 0 && (
                                                    <>
                                                        <span>•</span>
                                                        <span>{formatCallDuration(call.duration_seconds)}</span>
                                                    </>
                                                )}
                                                <span className="hidden sm:inline">•</span>
                                                <span className="hidden sm:inline">{getRelativeTime(call.created_at)}</span>
                                            </div>
                                        </div>

                                        {/* Action buttons - always visible on mobile */}
                                        {friend && (
                                            <div className="flex items-center gap-1.5 sm:gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => onCall(friend, false)}
                                                    disabled={isCallActive}
                                                    className="p-1.5 sm:p-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-400 transition-colors disabled:opacity-50"
                                                    title="Voice call"
                                                >
                                                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => onCall(friend, true)}
                                                    disabled={isCallActive}
                                                    className="p-1.5 sm:p-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 transition-colors disabled:opacity-50"
                                                    title="Video call"
                                                >
                                                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                    </svg>
                                                </button>
                                            </div>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                </div>
            ))}
        </div>
    );
}

