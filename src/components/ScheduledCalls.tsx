"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatInTimeZone } from "date-fns-tz";
import { isPast, isFuture, differenceInMinutes, addMinutes } from "date-fns";

type ScheduledCallUser = {
    wallet_address: string;
    display_name: string | null;
    username: string | null;
    avatar: string | null;
};

export type ScheduledCall = {
    id: string;
    scheduler_wallet_address: string | null;
    recipient_wallet_address: string;
    scheduled_at: string;
    duration_minutes: number;
    title: string | null;
    status: string;
    is_paid: boolean;
    payment_amount_cents: number | null;
    guest_name: string | null;
    guest_email: string | null;
    notes: string | null;
    invite_token: string | null;
    timezone: string | null;
    created_at: string;
    scheduler_user: ScheduledCallUser | null;
    recipient_user: ScheduledCallUser | null;
    is_host: boolean;
};

type ScheduledCallsProps = {
    userAddress: string;
    onJoinCall?: (token: string) => void;
};

export function ScheduledCalls({ userAddress, onJoinCall }: ScheduledCallsProps) {
    const [calls, setCalls] = useState<ScheduledCall[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");

    const fetchCalls = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            
            const response = await fetch(
                `/api/scheduling/list?wallet_address=${userAddress}&status=${activeTab}`
            );
            
            if (!response.ok) {
                throw new Error("Failed to fetch scheduled calls");
            }
            
            const data = await response.json();
            setCalls(data.calls || []);
        } catch (err) {
            console.error("Error fetching scheduled calls:", err);
            setError("Failed to load scheduled calls");
        } finally {
            setIsLoading(false);
        }
    }, [userAddress, activeTab]);

    useEffect(() => {
        fetchCalls();
    }, [fetchCalls]);

    const getDisplayName = (call: ScheduledCall): string => {
        if (call.is_host) {
            // Show who scheduled with you
            if (call.guest_name) return call.guest_name;
            if (call.scheduler_user?.display_name) return call.scheduler_user.display_name;
            if (call.scheduler_user?.username) return call.scheduler_user.username;
            if (call.scheduler_wallet_address) {
                return `${call.scheduler_wallet_address.slice(0, 6)}...${call.scheduler_wallet_address.slice(-4)}`;
            }
            return "Guest";
        } else {
            // Show who you scheduled with
            if (call.recipient_user?.display_name) return call.recipient_user.display_name;
            if (call.recipient_user?.username) return call.recipient_user.username;
            return `${call.recipient_wallet_address.slice(0, 6)}...${call.recipient_wallet_address.slice(-4)}`;
        }
    };

    const getAvatar = (call: ScheduledCall): string | null => {
        if (call.is_host) {
            return call.scheduler_user?.avatar || null;
        }
        return call.recipient_user?.avatar || null;
    };

    const getStatusBadge = (call: ScheduledCall) => {
        const scheduledTime = new Date(call.scheduled_at);
        const endTime = addMinutes(scheduledTime, call.duration_minutes);
        const now = new Date();
        
        // Check if call is happening now (within the duration window)
        if (now >= scheduledTime && now <= endTime && call.status !== "completed" && call.status !== "cancelled") {
            return {
                text: "Live Now",
                color: "bg-green-500/20 text-green-400 border-green-500/30",
                pulse: true,
            };
        }
        
        // Check if call is starting soon (within 15 minutes)
        const minutesUntil = differenceInMinutes(scheduledTime, now);
        if (minutesUntil > 0 && minutesUntil <= 15 && call.status !== "cancelled") {
            return {
                text: `In ${minutesUntil}m`,
                color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
                pulse: true,
            };
        }

        switch (call.status) {
            case "confirmed":
                return {
                    text: "Confirmed",
                    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                    pulse: false,
                };
            case "pending":
                return {
                    text: "Pending",
                    color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
                    pulse: false,
                };
            case "completed":
                return {
                    text: "Completed",
                    color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
                    pulse: false,
                };
            case "cancelled":
                return {
                    text: "Cancelled",
                    color: "bg-red-500/20 text-red-400 border-red-500/30",
                    pulse: false,
                };
            default:
                return {
                    text: call.status,
                    color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
                    pulse: false,
                };
        }
    };

    const formatCallTime = (call: ScheduledCall): { date: string; time: string } => {
        const timezone = call.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
        const scheduledTime = new Date(call.scheduled_at);
        
        return {
            date: formatInTimeZone(scheduledTime, timezone, "EEE, MMM d"),
            time: formatInTimeZone(scheduledTime, timezone, "h:mm a"),
        };
    };

    const canJoinCall = (call: ScheduledCall): boolean => {
        if (!call.invite_token) return false;
        if (call.status === "cancelled" || call.status === "completed") return false;
        
        const scheduledTime = new Date(call.scheduled_at);
        const endTime = addMinutes(scheduledTime, call.duration_minutes);
        const now = new Date();
        
        // Can join 5 minutes before scheduled time until end time
        const joinWindowStart = addMinutes(scheduledTime, -5);
        return now >= joinWindowStart && now <= endTime;
    };

    const handleJoinCall = async (token: string) => {
        if (onJoinCall) {
            onJoinCall(token);
            return;
        }

        try {
            // Create/join room for this scheduled call
            const res = await fetch(`/api/scheduling/join/${token}`, {
                method: "POST",
            });
            const data = await res.json();

            if (!res.ok) {
                alert(data.error || "Failed to join call");
                return;
            }

            // Navigate directly to the room
            window.location.href = `/room/${data.room.joinCode}`;
        } catch (err) {
            console.error("Error joining call:", err);
            alert("Failed to join call. Please try again.");
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-6 sm:py-8">
                <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-2 border-zinc-600 border-t-orange-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-6 sm:py-8 px-2">
                <p className="text-red-400 text-sm mb-3 sm:mb-4">{error}</p>
                <button
                    onClick={fetchCalls}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white text-sm transition-colors"
                >
                    Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-3 sm:space-y-4 px-1 sm:px-0">
            {/* Tabs */}
            <div className="flex gap-1.5 sm:gap-2 bg-zinc-800/50 p-0.5 sm:p-1 rounded-lg sm:rounded-xl">
                <button
                    onClick={() => setActiveTab("upcoming")}
                    className={`flex-1 py-1.5 sm:py-2 px-3 sm:px-4 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all ${
                        activeTab === "upcoming"
                            ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white"
                            : "text-zinc-400 hover:text-white hover:bg-zinc-700/50"
                    }`}
                >
                    📅 Upcoming
                </button>
                <button
                    onClick={() => setActiveTab("past")}
                    className={`flex-1 py-1.5 sm:py-2 px-3 sm:px-4 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all ${
                        activeTab === "past"
                            ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white"
                            : "text-zinc-400 hover:text-white hover:bg-zinc-700/50"
                    }`}
                >
                    🕐 Past
                </button>
            </div>

            {/* Calls List */}
            {calls.length === 0 ? (
                <div className="text-center py-8 sm:py-12 px-2">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 rounded-full bg-zinc-800/50 flex items-center justify-center">
                        <span className="text-2xl sm:text-3xl">📅</span>
                    </div>
                    <h3 className="text-base sm:text-lg font-medium text-white mb-1.5 sm:mb-2">
                        {activeTab === "upcoming" ? "No Upcoming Calls" : "No Past Calls"}
                    </h3>
                    <p className="text-zinc-500 text-xs sm:text-sm max-w-xs mx-auto">
                        {activeTab === "upcoming"
                            ? "Schedule calls with others via your booking link or agent."
                            : "Your completed and past scheduled calls will appear here."}
                    </p>
                </div>
            ) : (
                <div className="space-y-1.5 sm:space-y-3">
                    <AnimatePresence mode="popLayout">
                        {calls.map((call, index) => {
                            const avatar = getAvatar(call);
                            const status = getStatusBadge(call);
                            const { date, time } = formatCallTime(call);
                            const canJoin = canJoinCall(call);

                            return (
                                <motion.div
                                    key={call.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    transition={{ delay: index * 0.05 }}
                                    className={`flex items-center gap-2.5 sm:gap-4 p-2.5 sm:p-4 rounded-xl transition-colors ${
                                        canJoin
                                            ? "bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/20"
                                            : "bg-zinc-800/30 hover:bg-zinc-800/50"
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
                                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                                                <span className="text-sm sm:text-lg text-white font-medium">
                                                    {getDisplayName(call)[0]?.toUpperCase() || "?"}
                                                </span>
                                            </div>
                                        )}
                                        {call.is_paid && (
                                            <div className="absolute -top-0.5 -right-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-yellow-500 flex items-center justify-center">
                                                <span className="text-[10px] sm:text-xs">💰</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Call Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                            <p className="text-sm sm:text-base text-white font-medium truncate">
                                                {getDisplayName(call)}
                                            </p>
                                            <span
                                                className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full border ${status.color} ${
                                                    status.pulse ? "animate-pulse" : ""
                                                }`}
                                            >
                                                {status.text}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1 text-xs sm:text-sm text-zinc-400">
                                            <span>{date}</span>
                                            <span>•</span>
                                            <span>{time}</span>
                                            <span className="hidden sm:inline">•</span>
                                            <span className="hidden sm:inline">{call.duration_minutes}m</span>
                                        </div>
                                        {call.title && call.title !== "Scheduled Call" && (
                                            <p className="text-[10px] sm:text-xs text-zinc-500 mt-0.5 sm:mt-1 truncate">
                                                {call.title}
                                            </p>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                                        {canJoin && call.invite_token && (
                                            <button
                                                onClick={() => handleJoinCall(call.invite_token!)}
                                                className="py-1.5 sm:py-2 px-2.5 sm:px-4 rounded-lg sm:rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium text-xs sm:text-sm hover:shadow-lg hover:shadow-green-500/25 transition-all flex items-center gap-1 sm:gap-2"
                                            >
                                                <span className="hidden sm:inline">🎥</span>
                                                Join
                                            </button>
                                        )}
                                        {!canJoin && call.invite_token && activeTab === "upcoming" && (
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(
                                                        `https://app.spritz.chat/join/${call.invite_token}`
                                                    );
                                                }}
                                                className="p-1.5 sm:p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                                                title="Copy join link"
                                            >
                                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}

            {/* Refresh button */}
            <div className="text-center pt-1 sm:pt-2">
                <button
                    onClick={fetchCalls}
                    className="text-xs sm:text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                    ↻ Refresh
                </button>
            </div>
        </div>
    );
}

