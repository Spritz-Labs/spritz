"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChatRules, useRoomBans } from "@/hooks/useChatRules";
import { MUTE_DURATION_OPTIONS } from "@/hooks/useModeration";
import { createPortal } from "react-dom";

type ChatRulesPanelProps = {
    isOpen: boolean;
    onClose: () => void;
    chatType: string;
    chatId?: string | null;
    chatName?: string;
};

const RULE_TOGGLES: {
    key: string;
    label: string;
    description: string;
    icon: string;
}[] = [
    { key: "links_allowed", label: "Links", description: "Allow sharing URLs and links", icon: "🔗" },
    { key: "photos_allowed", label: "Photos", description: "Allow uploading photos", icon: "📷" },
    { key: "pixel_art_allowed", label: "Pixel Art", description: "Allow sending pixel art", icon: "🎨" },
    { key: "gifs_allowed", label: "GIFs", description: "Allow sending GIFs", icon: "🎬" },
    { key: "polls_allowed", label: "Polls", description: "Allow creating polls", icon: "🗳️" },
    { key: "location_sharing_allowed", label: "Location", description: "Allow sharing location", icon: "📍" },
    { key: "voice_allowed", label: "Voice", description: "Allow voice messages", icon: "🎤" },
];

const SLOW_MODE_OPTIONS = [
    { value: 0, label: "Off" },
    { value: 5, label: "5s" },
    { value: 10, label: "10s" },
    { value: 30, label: "30s" },
    { value: 60, label: "1m" },
    { value: 300, label: "5m" },
    { value: 600, label: "10m" },
];

const BAN_DURATION_OPTIONS = [
    { value: "1h", label: "1 hour" },
    { value: "24h", label: "24 hours" },
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    { value: "permanent", label: "Permanent" },
];

export function ChatRulesPanel({ isOpen, onClose, chatType, chatId, chatName }: ChatRulesPanelProps) {
    const { rules, isLoading, updateRule } = useChatRules(chatType, chatId);
    const { bans, banUser, unbanUser, isLoading: bansLoading } = useRoomBans(chatType, chatId);
    const [activeTab, setActiveTab] = useState<"rules" | "bans">("rules");
    const [banAddress, setBanAddress] = useState("");
    const [banReason, setBanReason] = useState("");
    const [banDuration, setBanDuration] = useState("permanent");
    const [isBanning, setIsBanning] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Client-side only mount
    useState(() => { setMounted(true); });

    if (!mounted) return null;

    const handleToggle = async (field: string, currentValue: boolean) => {
        await updateRule(field as keyof typeof rules, !currentValue);
    };

    const handleSlowMode = async (seconds: number) => {
        await updateRule("slow_mode_seconds" as keyof typeof rules, seconds);
    };

    const handleReadOnly = async (value: boolean) => {
        await updateRule("read_only" as keyof typeof rules, value);
    };

    const handleBanUser = async () => {
        if (!banAddress.trim()) return;
        setIsBanning(true);
        const success = await banUser(banAddress.trim(), {
            reason: banReason || undefined,
            duration: banDuration,
        });
        if (success) {
            setBanAddress("");
            setBanReason("");
        }
        setIsBanning(false);
    };

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 z-[9998]"
                        onClick={onClose}
                    />

                    {/* Panel */}
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-zinc-900 z-[9999] overflow-hidden flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                            <div>
                                <h2 className="text-lg font-semibold text-white">Room Settings</h2>
                                {chatName && (
                                    <p className="text-xs text-zinc-400 mt-0.5">{chatName}</p>
                                )}
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-zinc-400 hover:text-white rounded-lg transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-zinc-800">
                            <button
                                onClick={() => setActiveTab("rules")}
                                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                                    activeTab === "rules"
                                        ? "text-[#FF5500] border-b-2 border-[#FF5500]"
                                        : "text-zinc-400 hover:text-zinc-200"
                                }`}
                            >
                                Content Rules
                            </button>
                            <button
                                onClick={() => setActiveTab("bans")}
                                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                                    activeTab === "bans"
                                        ? "text-[#FF5500] border-b-2 border-[#FF5500]"
                                        : "text-zinc-400 hover:text-zinc-200"
                                }`}
                            >
                                Bans ({bans.length})
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="w-6 h-6 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
                                </div>
                            ) : activeTab === "rules" ? (
                                <div className="p-4 space-y-6">
                                    {/* Content Type Toggles */}
                                    <div>
                                        <h3 className="text-sm font-medium text-zinc-300 mb-3">Allowed Content</h3>
                                        <div className="space-y-1">
                                            {RULE_TOGGLES.map((toggle) => {
                                                const value = rules?.[toggle.key as keyof typeof rules];
                                                const isEnabled = typeof value === "boolean" ? value : true;

                                                return (
                                                    <div
                                                        key={toggle.key}
                                                        className="flex items-center justify-between px-3 py-3 rounded-lg hover:bg-zinc-800/50 transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-lg">{toggle.icon}</span>
                                                            <div>
                                                                <p className="text-sm font-medium text-white">{toggle.label}</p>
                                                                <p className="text-xs text-zinc-500">{toggle.description}</p>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleToggle(toggle.key, isEnabled)}
                                                            className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                                                                isEnabled ? "bg-[#FF5500]" : "bg-zinc-700"
                                                            }`}
                                                        >
                                                            <span
                                                                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                                                                    isEnabled ? "translate-x-5" : "translate-x-0"
                                                                }`}
                                                            />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Read-Only Mode */}
                                    <div>
                                        <h3 className="text-sm font-medium text-zinc-300 mb-3">Access Control</h3>
                                        <div className="flex items-center justify-between px-3 py-3 rounded-lg hover:bg-zinc-800/50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg">🔒</span>
                                                <div>
                                                    <p className="text-sm font-medium text-white">Read-Only Mode</p>
                                                    <p className="text-xs text-zinc-500">Only admins & mods can post</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleReadOnly(!rules?.read_only)}
                                                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                                                    rules?.read_only ? "bg-[#FF5500]" : "bg-zinc-700"
                                                }`}
                                            >
                                                <span
                                                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                                                        rules?.read_only ? "translate-x-5" : "translate-x-0"
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Slow Mode */}
                                    <div>
                                        <h3 className="text-sm font-medium text-zinc-300 mb-3">Slow Mode</h3>
                                        <p className="text-xs text-zinc-500 mb-3 px-3">
                                            Limit how often users can send messages
                                        </p>
                                        <div className="flex flex-wrap gap-2 px-3">
                                            {SLOW_MODE_OPTIONS.map((option) => (
                                                <button
                                                    key={option.value}
                                                    onClick={() => handleSlowMode(option.value)}
                                                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                                                        (rules?.slow_mode_seconds || 0) === option.value
                                                            ? "bg-[#FF5500] text-white"
                                                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                                    }`}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* Bans Tab */
                                <div className="p-4 space-y-4">
                                    {/* Ban a user */}
                                    <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
                                        <h3 className="text-sm font-medium text-zinc-300">Ban a User</h3>
                                        <input
                                            type="text"
                                            placeholder="User address (0x...)"
                                            value={banAddress}
                                            onChange={(e) => setBanAddress(e.target.value)}
                                            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF5500]"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Reason (optional)"
                                            value={banReason}
                                            onChange={(e) => setBanReason(e.target.value)}
                                            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF5500]"
                                        />
                                        <div className="flex gap-2">
                                            <select
                                                value={banDuration}
                                                onChange={(e) => setBanDuration(e.target.value)}
                                                className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-[#FF5500]"
                                            >
                                                {BAN_DURATION_OPTIONS.map((opt) => (
                                                    <option key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={handleBanUser}
                                                disabled={!banAddress.trim() || isBanning}
                                                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors"
                                            >
                                                {isBanning ? "..." : "Ban"}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Active Bans List */}
                                    <div>
                                        <h3 className="text-sm font-medium text-zinc-300 mb-3">
                                            Active Bans ({bans.length})
                                        </h3>
                                        {bansLoading ? (
                                            <div className="flex justify-center py-4">
                                                <div className="w-5 h-5 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
                                            </div>
                                        ) : bans.length === 0 ? (
                                            <p className="text-sm text-zinc-500 text-center py-4">No active bans</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {bans.map((ban) => (
                                                    <div
                                                        key={ban.id}
                                                        className="flex items-center justify-between px-3 py-2.5 bg-zinc-800/50 rounded-lg"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm text-white font-mono truncate">
                                                                {ban.user_address.slice(0, 6)}...{ban.user_address.slice(-4)}
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                {ban.reason && (
                                                                    <p className="text-xs text-zinc-500 truncate">{ban.reason}</p>
                                                                )}
                                                                <p className="text-xs text-zinc-600">
                                                                    {ban.banned_until
                                                                        ? `Until ${new Date(ban.banned_until).toLocaleDateString()}`
                                                                        : "Permanent"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => unbanUser(ban.user_address)}
                                                            className="ml-2 px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors shrink-0"
                                                        >
                                                            Unban
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    );
}
