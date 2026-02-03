"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { format, addDays } from "date-fns";
import { useAnalytics } from "@/hooks/useAnalytics";

type NewScheduledCallModalProps = {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string;
};

export function NewScheduledCallModal({
    isOpen,
    onClose,
    userAddress,
}: NewScheduledCallModalProps) {
    const { trackScheduleCreated } = useAnalytics(userAddress);
    const [title, setTitle] = useState("");
    // Initialize date/time to defaults so "Create & Get Link" is enabled once title is filled (state was "" before, so button stayed disabled)
    const [scheduledDate, setScheduledDate] = useState(() =>
        format(addDays(new Date(), 1), "yyyy-MM-dd")
    );
    const [scheduledTime, setScheduledTime] = useState("09:00");
    const [duration, setDuration] = useState(30);
    const [isCreating, setIsCreating] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const tomorrow = addDays(new Date(), 1);
    const defaultDate = format(tomorrow, "yyyy-MM-dd");
    const defaultTime = "09:00";

    const handleCreate = async () => {
        if (!title.trim() || !scheduledDate || !scheduledTime) {
            setError("Please fill in all required fields");
            return;
        }

        setError(null);
        setIsCreating(true);
        try {
            // Combine date and time into ISO string
            const scheduledAt = new Date(
                `${scheduledDate}T${scheduledTime}:00`
            );

            // Create a scheduled call with a custom invite token
            const res = await fetch("/api/scheduling/create-shareable", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    schedulerAddress: userAddress,
                    scheduledAt: scheduledAt.toISOString(),
                    durationMinutes: duration,
                    title: title.trim(),
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(
                    data.error || "Failed to create scheduled call"
                );
            }

            // Track schedule creation
            trackScheduleCreated();

            // Generate shareable URL
            const baseUrl = window.location.origin;
            const url = `${baseUrl}/join/${data.inviteToken}`;
            setShareUrl(url);
        } catch (err) {
            console.error("[NewScheduledCall] Error:", err);
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to create scheduled call"
            );
        } finally {
            setIsCreating(false);
        }
    };

    const handleCopyUrl = async () => {
        if (shareUrl) {
            try {
                await navigator.clipboard.writeText(shareUrl);
                // Show brief success feedback
                const button = document.activeElement as HTMLElement;
                const originalText = button?.textContent;
                if (button) {
                    button.textContent = "Copied!";
                    setTimeout(() => {
                        if (button) button.textContent = originalText || "Copy";
                    }, 2000);
                }
            } catch (err) {
                console.error("Failed to copy:", err);
                setError("Failed to copy link. Please copy manually.");
            }
        }
    };

    const handleReset = () => {
        setTitle("");
        setScheduledDate(format(addDays(new Date(), 1), "yyyy-MM-dd"));
        setScheduledTime("09:00");
        setDuration(30);
        setShareUrl(null);
        setError(null);
    };

    const handleClose = () => {
        handleReset();
        onClose();
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {/* Top padding for PWA safe area so X is below notch/battery/wifi */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))]">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={handleClose}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                />

                {/* Modal */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="p-6 border-b border-zinc-800">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    📅 New Scheduled Call
                                </h2>
                                <p className="text-zinc-400 text-sm mt-1">
                                    Create a shareable link for calendar invites
                                </p>
                            </div>
                            <button
                                onClick={handleClose}
                                className="p-2 hover:bg-zinc-800 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                                aria-label="Close"
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
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-4">
                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                                <p className="text-red-400 text-sm">{error}</p>
                            </div>
                        )}

                        {shareUrl ? (
                            // Success state - show shareable URL
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-4"
                            >
                                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                    <p className="text-emerald-400 text-sm font-medium mb-2">
                                        ✅ Scheduled call created!
                                    </p>
                                    <p className="text-zinc-300 text-sm mb-3">
                                        Copy this link to share in your calendar
                                        invites:
                                    </p>
                                    <div className="flex items-center gap-2 p-3 bg-zinc-800 rounded-lg">
                                        <input
                                            type="text"
                                            value={shareUrl}
                                            readOnly
                                            className="flex-1 bg-transparent text-white text-sm font-mono truncate"
                                        />
                                        <button
                                            onClick={handleCopyUrl}
                                            className="p-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
                                            title="Copy link"
                                        >
                                            <svg
                                                className="w-4 h-4 text-white"
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
                                        </button>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleReset}
                                        className="flex-1 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors"
                                    >
                                        Create Another
                                    </button>
                                    <button
                                        onClick={handleClose}
                                        className="flex-1 py-2.5 px-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all"
                                    >
                                        Done
                                    </button>
                                </div>
                            </motion.div>
                        ) : (
                            // Form state
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                                        Title{" "}
                                        <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) =>
                                            setTitle(e.target.value)
                                        }
                                        placeholder="e.g. Team Meeting, Client Call"
                                        className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                                            Date{" "}
                                            <span className="text-red-400">
                                                *
                                            </span>
                                        </label>
                                        <input
                                            type="date"
                                            value={scheduledDate || defaultDate}
                                            onChange={(e) =>
                                                setScheduledDate(e.target.value)
                                            }
                                            min={format(
                                                new Date(),
                                                "yyyy-MM-dd"
                                            )}
                                            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                                            Time{" "}
                                            <span className="text-red-400">
                                                *
                                            </span>
                                        </label>
                                        <input
                                            type="time"
                                            value={scheduledTime || defaultTime}
                                            onChange={(e) =>
                                                setScheduledTime(e.target.value)
                                            }
                                            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                                        Duration (minutes)
                                    </label>
                                    <select
                                        value={duration}
                                        onChange={(e) =>
                                            setDuration(Number(e.target.value))
                                        }
                                        className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                                    >
                                        <option value={15}>15 minutes</option>
                                        <option value={30}>30 minutes</option>
                                        <option value={45}>45 minutes</option>
                                        <option value={60}>60 minutes</option>
                                        <option value={90}>90 minutes</option>
                                        <option value={120}>2 hours</option>
                                    </select>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={handleClose}
                                        className="flex-1 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCreate}
                                        disabled={
                                            isCreating ||
                                            !title.trim() ||
                                            !scheduledDate ||
                                            !scheduledTime
                                        }
                                        className="flex-1 py-2.5 px-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isCreating ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                Creating...
                                            </>
                                        ) : (
                                            "Create & Get Link"
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
