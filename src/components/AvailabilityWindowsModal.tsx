"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useCalendar } from "@/hooks/useCalendar";
import { getUserTimezone, COMMON_TIMEZONES } from "@/lib/timezone";

type AvailabilityWindowsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string | null;
};

const DAYS_OF_WEEK = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

export function AvailabilityWindowsModal({
    isOpen,
    onClose,
    userAddress,
}: AvailabilityWindowsModalProps) {
    const {
        availabilityWindows,
        saveAvailabilityWindow,
        deleteAvailabilityWindow,
        refresh: refreshAvailability,
    } = useCalendar(userAddress);

    const [editingWindow, setEditingWindow] = useState<{
        id?: string;
        name: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        timezone: string;
    } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            refreshAvailability();
        }
    }, [isOpen, refreshAvailability]);

    const handleSave = async () => {
        if (!editingWindow) return;

        setIsSaving(true);
        setError(null);

        try {
            await saveAvailabilityWindow({
                id: editingWindow.id,
                name: editingWindow.name,
                dayOfWeek: editingWindow.dayOfWeek,
                startTime: editingWindow.startTime,
                endTime: editingWindow.endTime,
                timezone: editingWindow.timezone,
            });
            setEditingWindow(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save availability window");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this availability window?")) return;

        try {
            await deleteAvailabilityWindow(id);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete availability window");
        }
    };

    const handleAddNew = () => {
        setEditingWindow({
            name: "",
            dayOfWeek: 1, // Monday
            startTime: "09:00",
            endTime: "17:00",
            timezone: getUserTimezone(),
        });
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
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto z-50"
                    >
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center">
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
                                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                            />
                                        </svg>
                                    </div>
                                    <h2 className="text-xl font-bold text-white">
                                        Availability Windows
                                    </h2>
                                </div>
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

                            {error && (
                                <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            {/* Edit Form */}
                            {editingWindow && (
                                <div className="mb-6 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                                    <h3 className="text-white font-medium mb-4">
                                        {editingWindow.id ? "Edit" : "Add"} Availability Window
                                    </h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">
                                                Name
                                            </label>
                                            <input
                                                type="text"
                                                value={editingWindow.name}
                                                onChange={(e) =>
                                                    setEditingWindow({
                                                        ...editingWindow,
                                                        name: e.target.value,
                                                    })
                                                }
                                                placeholder="e.g., Weekday Mornings"
                                                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">
                                                Day of Week
                                            </label>
                                            <select
                                                value={editingWindow.dayOfWeek}
                                                onChange={(e) =>
                                                    setEditingWindow({
                                                        ...editingWindow,
                                                        dayOfWeek: parseInt(e.target.value),
                                                    })
                                                }
                                                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-orange-500"
                                            >
                                                {DAYS_OF_WEEK.map((day, index) => (
                                                    <option key={index} value={index}>
                                                        {day}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm text-zinc-400 mb-1">
                                                    Start Time
                                                </label>
                                                <input
                                                    type="time"
                                                    value={editingWindow.startTime}
                                                    onChange={(e) =>
                                                        setEditingWindow({
                                                            ...editingWindow,
                                                            startTime: e.target.value,
                                                        })
                                                    }
                                                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-orange-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm text-zinc-400 mb-1">
                                                    End Time
                                                </label>
                                                <input
                                                    type="time"
                                                    value={editingWindow.endTime}
                                                    onChange={(e) =>
                                                        setEditingWindow({
                                                            ...editingWindow,
                                                            endTime: e.target.value,
                                                        })
                                                    }
                                                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-orange-500"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">
                                                Timezone
                                            </label>
                                            <select
                                                value={editingWindow.timezone}
                                                onChange={(e) =>
                                                    setEditingWindow({
                                                        ...editingWindow,
                                                        timezone: e.target.value,
                                                    })
                                                }
                                                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white focus:outline-none focus:border-orange-500"
                                            >
                                                {COMMON_TIMEZONES.map((tz) => (
                                                    <option key={tz.value} value={tz.value}>
                                                        {tz.label}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-zinc-500 text-xs mt-1">
                                                Start and end times above are in this timezone.
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleSave}
                                                disabled={isSaving || !editingWindow.name}
                                                className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium hover:from-orange-400 hover:to-red-400 transition-all disabled:opacity-50"
                                            >
                                                {isSaving ? "Saving..." : "Save"}
                                            </button>
                                            <button
                                                onClick={() => setEditingWindow(null)}
                                                className="px-4 py-2 rounded-lg bg-zinc-700 text-white hover:bg-zinc-600 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Windows List */}
                            <div className="space-y-2 mb-4">
                                {availabilityWindows.length === 0 && !editingWindow && (
                                    <div className="text-center py-8 text-zinc-500">
                                        <p className="mb-2">No availability windows set</p>
                                        <p className="text-sm">Add windows to define when you're available</p>
                                    </div>
                                )}
                                {availabilityWindows.map((window) => (
                                    <div
                                        key={window.id}
                                        className="flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                                    >
                                        <div>
                                            <p className="text-white font-medium">
                                                {window.name || DAYS_OF_WEEK[window.day_of_week]}
                                            </p>
                                            <p className="text-zinc-500 text-sm">
                                                {DAYS_OF_WEEK[window.day_of_week]} • {window.start_time} - {window.end_time}
                                                {window.timezone && (
                                                    <span className="text-zinc-600 ml-1">
                                                        ({COMMON_TIMEZONES.find((tz) => tz.value === window.timezone)?.label ?? window.timezone})
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() =>
                                                    setEditingWindow({
                                                        id: window.id,
                                                        name: window.name,
                                                        dayOfWeek: window.day_of_week,
                                                        startTime: window.start_time,
                                                        endTime: window.end_time,
                                                        timezone: window.timezone || getUserTimezone(),
                                                    })
                                                }
                                                className="px-3 py-1.5 rounded-lg bg-zinc-700 text-white text-sm hover:bg-zinc-600 transition-colors"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDelete(window.id)}
                                                className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-sm hover:bg-red-500/30 transition-colors"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Add Button */}
                            {!editingWindow && (
                                <button
                                    onClick={handleAddNew}
                                    className="w-full px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 text-white font-medium transition-colors border border-zinc-700 border-dashed"
                                >
                                    + Add Availability Window
                                </button>
                            )}

                            {/* Done Button */}
                            <div className="mt-6">
                                <button
                                    onClick={onClose}
                                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF5500] text-white font-medium transition-all hover:shadow-lg hover:shadow-[#FB8D22]/25"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

