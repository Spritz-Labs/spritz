"use client";

import { motion, AnimatePresence } from "motion/react";
import { type UserSettings } from "@/hooks/useUserSettings";

type SettingsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    settings: UserSettings;
    onToggleSound: () => void;
    // Push notification props
    pushSupported: boolean;
    pushPermission: NotificationPermission;
    pushSubscribed: boolean;
    pushLoading: boolean;
    pushError: string | null;
    onEnablePush: () => Promise<boolean>;
    onDisablePush: () => Promise<boolean>;
};

export function SettingsModal({
    isOpen,
    onClose,
    settings,
    onToggleSound,
    pushSupported,
    pushPermission,
    pushSubscribed,
    pushLoading,
    pushError,
    onEnablePush,
    onDisablePush,
}: SettingsModalProps) {
    const handlePushToggle = async () => {
        if (pushSubscribed) {
            await onDisablePush();
        } else {
            await onEnablePush();
        }
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
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md z-50"
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
                                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                            />
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                            />
                                        </svg>
                                    </div>
                                    <h2 className="text-xl font-bold text-white">
                                        Settings
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

                            {/* Settings List */}
                            <div className="space-y-2">
                                {/* Sound & Notifications Section */}
                                <div className="mb-4">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
                                        Sound & Notifications
                                    </h3>

                                    {/* Sound Effects Toggle */}
                                    <button
                                        onClick={onToggleSound}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl">
                                                {settings.soundEnabled
                                                    ? "🔊"
                                                    : "🔇"}
                                            </span>
                                            <div className="text-left">
                                                <p className="text-white font-medium">
                                                    Sound Effects
                                                </p>
                                                <p className="text-zinc-500 text-xs">
                                                    Message and call sounds
                                                </p>
                                            </div>
                                        </div>
                                        <div
                                            className={`w-11 h-6 rounded-full transition-colors relative ${
                                                settings.soundEnabled
                                                    ? "bg-emerald-500"
                                                    : "bg-zinc-700"
                                            }`}
                                        >
                                            <div
                                                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                                    settings.soundEnabled
                                                        ? "translate-x-5"
                                                        : "translate-x-0.5"
                                                }`}
                                            />
                                        </div>
                                    </button>

                                    {/* Push Notifications Toggle */}
                                    {pushSupported && (
                                        <div className="mt-2">
                                            <button
                                                onClick={handlePushToggle}
                                                disabled={
                                                    pushLoading ||
                                                    pushPermission === "denied"
                                                }
                                                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xl">
                                                        {pushSubscribed
                                                            ? "🔔"
                                                            : "🔕"}
                                                    </span>
                                                    <div className="text-left">
                                                        <p className="text-white font-medium">
                                                            Push Notifications
                                                        </p>
                                                        <p className="text-zinc-500 text-xs">
                                                            {pushPermission ===
                                                            "denied"
                                                                ? "Blocked in browser settings"
                                                                : "Get notified of incoming calls"}
                                                        </p>
                                                    </div>
                                                </div>
                                                {pushLoading ? (
                                                    <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <div
                                                        className={`w-11 h-6 rounded-full transition-colors relative ${
                                                            pushSubscribed
                                                                ? "bg-violet-500"
                                                                : "bg-zinc-700"
                                                        }`}
                                                    >
                                                        <div
                                                            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                                                pushSubscribed
                                                                    ? "translate-x-5"
                                                                    : "translate-x-0.5"
                                                            }`}
                                                        />
                                                    </div>
                                                )}
                                            </button>
                                            {pushError && (
                                                <p className="text-red-400 text-xs mt-2 px-4">
                                                    {pushError}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* App Info */}
                                <div className="pt-4 border-t border-zinc-800">
                                    <p className="text-zinc-600 text-xs text-center">
                                        Reach v1.0 • PWA App
                                    </p>
                                </div>
                            </div>

                            {/* Done Button */}
                            <div className="mt-6">
                                <button
                                    onClick={onClose}
                                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-medium transition-all hover:shadow-lg hover:shadow-violet-500/25"
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
