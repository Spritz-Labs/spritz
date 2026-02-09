"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChatRules, useRoomBans, useBlockedWords } from "@/hooks/useChatRules";
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
    {
        key: "links_allowed",
        label: "Links",
        description: "Allow sharing URLs and links",
        icon: "🔗",
    },
    {
        key: "photos_allowed",
        label: "Photos",
        description: "Allow uploading photos",
        icon: "📷",
    },
    {
        key: "pixel_art_allowed",
        label: "Pixel Art",
        description: "Allow sending pixel art",
        icon: "🎨",
    },
    {
        key: "gifs_allowed",
        label: "GIFs",
        description: "Allow sending GIFs",
        icon: "🎬",
    },
    {
        key: "polls_allowed",
        label: "Polls",
        description: "Allow creating polls",
        icon: "🗳️",
    },
    {
        key: "location_sharing_allowed",
        label: "Location",
        description: "Allow sharing location",
        icon: "📍",
    },
    {
        key: "voice_allowed",
        label: "Voice",
        description: "Allow voice messages",
        icon: "🎤",
    },
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

// Member-facing component: shows the room rules/guidelines as a banner or dialog
export function ChatRulesBanner({
    chatType,
    chatId,
}: {
    chatType: string;
    chatId?: string | null;
}) {
    const { rules } = useChatRules(chatType, chatId);
    const [showRules, setShowRules] = useState(false);

    if (!rules?.rules_text) return null;

    return (
        <>
            <button
                onClick={() => setShowRules(true)}
                className="flex items-center gap-2 px-3 py-1.5 mx-4 mt-2 mb-1 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/50 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
                <svg
                    className="w-3.5 h-3.5 text-[#FF5500]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                </svg>
                View Room Rules
            </button>

            <AnimatePresence>
                {showRules && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/60 z-[9998]"
                            onClick={() => setShowRules(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="fixed left-4 right-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl z-[9999] overflow-hidden"
                        >
                            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <svg
                                        className="w-5 h-5 text-[#FF5500]"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                        />
                                    </svg>
                                    <h3 className="text-base font-semibold text-white">
                                        Room Rules
                                    </h3>
                                </div>
                                <button
                                    onClick={() => setShowRules(false)}
                                    className="p-1.5 text-zinc-400 hover:text-white rounded-lg transition-colors"
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
                            <div className="px-5 py-4 max-h-80 overflow-y-auto">
                                <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                                    {rules.rules_text}
                                </p>
                            </div>
                            <div className="px-5 py-3 border-t border-zinc-800">
                                <button
                                    onClick={() => setShowRules(false)}
                                    className="w-full py-2.5 bg-[#FF5500] hover:bg-[#FF6600] text-white font-medium rounded-lg text-sm transition-colors"
                                >
                                    Got it
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}

export function ChatRulesPanel({
    isOpen,
    onClose,
    chatType,
    chatId,
    chatName,
}: ChatRulesPanelProps) {
    const { rules, isLoading, updateRule, updateRulesText } = useChatRules(
        chatType,
        chatId,
    );
    const {
        bans,
        banUser,
        unbanUser,
        isLoading: bansLoading,
    } = useRoomBans(chatType, chatId);
    const {
        words: blockedWords,
        addWord: addBlockedWord,
        removeWord: removeBlockedWord,
        isLoading: wordsLoading,
    } = useBlockedWords("room", chatType, chatId);
    const [activeTab, setActiveTab] = useState<"rules" | "guidelines" | "bans" | "words">(
        "rules",
    );
    const [banAddress, setBanAddress] = useState("");
    const [banReason, setBanReason] = useState("");
    const [banDuration, setBanDuration] = useState("permanent");
    const [isBanning, setIsBanning] = useState(false);
    const [rulesText, setRulesText] = useState("");
    const [isSavingRules, setIsSavingRules] = useState(false);
    const [rulesTextSaved, setRulesTextSaved] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [newBlockedWord, setNewBlockedWord] = useState("");
    const [blockedWordAction, setBlockedWordAction] = useState<"block" | "mute">("block");
    const [isBlockedWordRegex, setIsBlockedWordRegex] = useState(false);
    const [isAddingWord, setIsAddingWord] = useState(false);

    // Client-side only mount
    useState(() => {
        setMounted(true);
    });

    // Sync rules text from server
    useState(() => {
        if (rules?.rules_text) {
            setRulesText(rules.rules_text);
        }
    });

    // Keep rulesText in sync when rules load
    if (rules?.rules_text && rulesText === "" && !isSavingRules) {
        setRulesText(rules.rules_text);
    }

    if (!mounted) return null;

    const handleContentPermission = async (field: string, value: string) => {
        await updateRule(field as keyof typeof rules, value);
    };

    const handleSlowMode = async (seconds: number) => {
        await updateRule("slow_mode_seconds" as keyof typeof rules, seconds);
    };

    const handleReadOnly = async (value: boolean) => {
        await updateRule("read_only" as keyof typeof rules, value);
    };

    const handleAddBlockedWord = async () => {
        if (!newBlockedWord.trim()) return;
        setIsAddingWord(true);
        const success = await addBlockedWord(newBlockedWord.trim(), {
            action: blockedWordAction,
            isRegex: isBlockedWordRegex,
        });
        if (success) {
            setNewBlockedWord("");
            setIsBlockedWordRegex(false);
        }
        setIsAddingWord(false);
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
                        transition={{
                            type: "spring",
                            damping: 25,
                            stiffness: 300,
                        }}
                        className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-zinc-900 z-[9999] overflow-hidden flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                            <div>
                                <h2 className="text-lg font-semibold text-white">
                                    Room Settings
                                </h2>
                                {chatName && (
                                    <p className="text-xs text-zinc-400 mt-0.5">
                                        {chatName}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-zinc-400 hover:text-white rounded-lg transition-colors"
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
                                Content
                            </button>
                            <button
                                onClick={() => setActiveTab("guidelines")}
                                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                                    activeTab === "guidelines"
                                        ? "text-[#FF5500] border-b-2 border-[#FF5500]"
                                        : "text-zinc-400 hover:text-zinc-200"
                                }`}
                            >
                                Rules
                            </button>
                            <button
                                onClick={() => setActiveTab("words")}
                                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                                    activeTab === "words"
                                        ? "text-[#FF5500] border-b-2 border-[#FF5500]"
                                        : "text-zinc-400 hover:text-zinc-200"
                                }`}
                            >
                                Words
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
                            ) : activeTab === "guidelines" ? (
                                /* Guidelines Tab */
                                <div className="p-4 space-y-4">
                                    <div>
                                        <h3 className="text-sm font-medium text-zinc-300 mb-1">
                                            Room Rules & Guidelines
                                        </h3>
                                        <p className="text-xs text-zinc-500 mb-3">
                                            Set rules that members will see when
                                            they view this room. These
                                            guidelines help set expectations.
                                        </p>
                                    </div>

                                    <textarea
                                        value={rulesText}
                                        onChange={(e) => {
                                            setRulesText(e.target.value);
                                            setRulesTextSaved(false);
                                        }}
                                        placeholder={`Example rules:\n\n1. Be respectful to all members\n2. No spam or self-promotion\n3. Stay on topic\n4. No NSFW content\n5. English only`}
                                        className="w-full h-48 px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-[#FF5500] transition-colors"
                                    />

                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-zinc-500">
                                            {rulesText.length > 0
                                                ? `${rulesText.length} characters`
                                                : "No rules set"}
                                        </p>
                                        <div className="flex gap-2">
                                            {rulesText.length > 0 && (
                                                <button
                                                    onClick={() => {
                                                        setRulesText("");
                                                        setRulesTextSaved(
                                                            false,
                                                        );
                                                    }}
                                                    className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                            <button
                                                onClick={async () => {
                                                    setIsSavingRules(true);
                                                    const success =
                                                        await updateRulesText(
                                                            rulesText.trim() ||
                                                                null,
                                                        );
                                                    setIsSavingRules(false);
                                                    if (success) {
                                                        setRulesTextSaved(true);
                                                        setTimeout(
                                                            () =>
                                                                setRulesTextSaved(
                                                                    false,
                                                                ),
                                                            2000,
                                                        );
                                                    }
                                                }}
                                                disabled={isSavingRules}
                                                className="px-4 py-1.5 bg-[#FF5500] hover:bg-[#FF6600] disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                                            >
                                                {isSavingRules ? (
                                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : rulesTextSaved ? (
                                                    <>
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
                                                                d="M5 13l4 4L19 7"
                                                            />
                                                        </svg>
                                                        Saved
                                                    </>
                                                ) : (
                                                    "Save Rules"
                                                )}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Preview */}
                                    {rulesText.trim() && (
                                        <div className="mt-4 border-t border-zinc-800 pt-4">
                                            <h4 className="text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">
                                                Preview (what members see)
                                            </h4>
                                            <div className="bg-zinc-800/30 rounded-xl p-4 border border-zinc-700/50">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <svg
                                                        className="w-4 h-4 text-[#FF5500]"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                                        />
                                                    </svg>
                                                    <span className="text-xs font-medium text-white">
                                                        Room Rules
                                                    </span>
                                                </div>
                                                <p className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">
                                                    {rulesText}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : activeTab === "rules" ? (
                                <div className="p-4 space-y-6">
                                    {/* Role-Based Content Permissions */}
                                    <div>
                                        <h3 className="text-sm font-medium text-zinc-300 mb-1">
                                            Content Permissions
                                        </h3>
                                        <p className="text-xs text-zinc-500 mb-3">
                                            Control who can use each content type
                                        </p>
                                        <div className="space-y-1">
                                            {RULE_TOGGLES.map((toggle) => {
                                                const rawValue =
                                                    rules?.[
                                                        toggle.key as keyof typeof rules
                                                    ];
                                                // Normalize: handle legacy booleans
                                                const currentValue =
                                                    rawValue === "everyone" || rawValue === "mods_only" || rawValue === "disabled"
                                                        ? rawValue
                                                        : rawValue === true || rawValue === undefined
                                                        ? "everyone"
                                                        : "disabled";

                                                return (
                                                    <div
                                                        key={toggle.key}
                                                        className="flex items-center justify-between px-3 py-3 rounded-lg hover:bg-zinc-800/50 transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <span className="text-lg shrink-0">
                                                                {toggle.icon}
                                                            </span>
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-medium text-white">
                                                                    {toggle.label}
                                                                </p>
                                                                <p className="text-xs text-zinc-500 truncate">
                                                                    {toggle.description}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex bg-zinc-800 rounded-lg p-0.5 shrink-0 ml-2">
                                                            <button
                                                                onClick={() => handleContentPermission(toggle.key, "everyone")}
                                                                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-all ${
                                                                    currentValue === "everyone"
                                                                        ? "bg-green-500/20 text-green-400"
                                                                        : "text-zinc-500 hover:text-zinc-300"
                                                                }`}
                                                                title="Everyone can use this"
                                                            >
                                                                All
                                                            </button>
                                                            <button
                                                                onClick={() => handleContentPermission(toggle.key, "mods_only")}
                                                                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-all ${
                                                                    currentValue === "mods_only"
                                                                        ? "bg-[#FF5500]/20 text-[#FF5500]"
                                                                        : "text-zinc-500 hover:text-zinc-300"
                                                                }`}
                                                                title="Only moderators and admins"
                                                            >
                                                                Mods
                                                            </button>
                                                            <button
                                                                onClick={() => handleContentPermission(toggle.key, "disabled")}
                                                                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-all ${
                                                                    currentValue === "disabled"
                                                                        ? "bg-red-500/20 text-red-400"
                                                                        : "text-zinc-500 hover:text-zinc-300"
                                                                }`}
                                                                title="Disabled for everyone"
                                                            >
                                                                Off
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Read-Only Mode */}
                                    <div>
                                        <h3 className="text-sm font-medium text-zinc-300 mb-3">
                                            Access Control
                                        </h3>
                                        <div className="flex items-center justify-between px-3 py-3 rounded-lg hover:bg-zinc-800/50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg">
                                                    🔒
                                                </span>
                                                <div>
                                                    <p className="text-sm font-medium text-white">
                                                        Read-Only Mode
                                                    </p>
                                                    <p className="text-xs text-zinc-500">
                                                        Only admins & mods can
                                                        post
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() =>
                                                    handleReadOnly(
                                                        !rules?.read_only,
                                                    )
                                                }
                                                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                                                    rules?.read_only
                                                        ? "bg-[#FF5500]"
                                                        : "bg-zinc-700"
                                                }`}
                                            >
                                                <span
                                                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                                                        rules?.read_only
                                                            ? "translate-x-5"
                                                            : "translate-x-0"
                                                    }`}
                                                />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Slow Mode */}
                                    <div>
                                        <h3 className="text-sm font-medium text-zinc-300 mb-3">
                                            Slow Mode
                                        </h3>
                                        <p className="text-xs text-zinc-500 mb-3 px-3">
                                            Limit how often users can send
                                            messages
                                        </p>
                                        <div className="flex flex-wrap gap-2 px-3">
                                            {SLOW_MODE_OPTIONS.map((option) => (
                                                <button
                                                    key={option.value}
                                                    onClick={() =>
                                                        handleSlowMode(
                                                            option.value,
                                                        )
                                                    }
                                                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                                                        (rules?.slow_mode_seconds ||
                                                            0) === option.value
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
                            ) : activeTab === "words" ? (
                                /* Blocked Words Tab */
                                <div className="p-4 space-y-4">
                                    {/* Add blocked word */}
                                    <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
                                        <h3 className="text-sm font-medium text-zinc-300">
                                            Block a Word or Phrase
                                        </h3>
                                        <p className="text-xs text-zinc-500">
                                            Messages containing blocked words will be prevented from sending. Global blocked words set by admins also apply.
                                        </p>
                                        <input
                                            type="text"
                                            placeholder="Word or phrase to block..."
                                            value={newBlockedWord}
                                            onChange={(e) => setNewBlockedWord(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && newBlockedWord.trim()) {
                                                    handleAddBlockedWord();
                                                }
                                            }}
                                            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF5500]"
                                        />
                                        <div className="flex items-center gap-3">
                                            <select
                                                value={blockedWordAction}
                                                onChange={(e) => setBlockedWordAction(e.target.value as "block" | "mute")}
                                                className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-[#FF5500]"
                                            >
                                                <option value="block">Block message</option>
                                                <option value="mute">Mute sender</option>
                                            </select>
                                            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer shrink-0">
                                                <input
                                                    type="checkbox"
                                                    checked={isBlockedWordRegex}
                                                    onChange={(e) => setIsBlockedWordRegex(e.target.checked)}
                                                    className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-800 text-[#FF5500] focus:ring-[#FF5500]"
                                                />
                                                Regex
                                            </label>
                                            <button
                                                onClick={handleAddBlockedWord}
                                                disabled={!newBlockedWord.trim() || isAddingWord}
                                                className="px-4 py-2 bg-[#FF5500] hover:bg-[#FF6600] disabled:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
                                            >
                                                {isAddingWord ? "..." : "Add"}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Blocked Words List */}
                                    <div>
                                        <h3 className="text-sm font-medium text-zinc-300 mb-3">
                                            Room Blocked Words ({blockedWords.length})
                                        </h3>
                                        {wordsLoading ? (
                                            <div className="flex justify-center py-4">
                                                <div className="w-5 h-5 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
                                            </div>
                                        ) : blockedWords.length === 0 ? (
                                            <p className="text-sm text-zinc-500 text-center py-4">
                                                No blocked words for this room
                                            </p>
                                        ) : (
                                            <div className="space-y-2">
                                                {blockedWords.map((entry) => (
                                                    <div
                                                        key={entry.id}
                                                        className="flex items-center justify-between px-3 py-2.5 bg-zinc-800/50 rounded-lg"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-sm text-white font-mono truncate">
                                                                    {entry.word}
                                                                </p>
                                                                {entry.is_regex && (
                                                                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                                                                        regex
                                                                    </span>
                                                                )}
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                                                    entry.action === "block"
                                                                        ? "bg-red-500/20 text-red-400"
                                                                        : "bg-amber-500/20 text-amber-400"
                                                                }`}>
                                                                    {entry.action}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => removeBlockedWord(entry.id)}
                                                            className="ml-2 px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors shrink-0"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                /* Bans Tab */
                                <div className="p-4 space-y-4">
                                    {/* Ban a user */}
                                    <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
                                        <h3 className="text-sm font-medium text-zinc-300">
                                            Ban a User
                                        </h3>
                                        <input
                                            type="text"
                                            placeholder="User address (0x...)"
                                            value={banAddress}
                                            onChange={(e) =>
                                                setBanAddress(e.target.value)
                                            }
                                            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF5500]"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Reason (optional)"
                                            value={banReason}
                                            onChange={(e) =>
                                                setBanReason(e.target.value)
                                            }
                                            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF5500]"
                                        />
                                        <div className="flex gap-2">
                                            <select
                                                value={banDuration}
                                                onChange={(e) =>
                                                    setBanDuration(
                                                        e.target.value,
                                                    )
                                                }
                                                className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-[#FF5500]"
                                            >
                                                {BAN_DURATION_OPTIONS.map(
                                                    (opt) => (
                                                        <option
                                                            key={opt.value}
                                                            value={opt.value}
                                                        >
                                                            {opt.label}
                                                        </option>
                                                    ),
                                                )}
                                            </select>
                                            <button
                                                onClick={handleBanUser}
                                                disabled={
                                                    !banAddress.trim() ||
                                                    isBanning
                                                }
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
                                            <p className="text-sm text-zinc-500 text-center py-4">
                                                No active bans
                                            </p>
                                        ) : (
                                            <div className="space-y-2">
                                                {bans.map((ban) => (
                                                    <div
                                                        key={ban.id}
                                                        className="flex items-center justify-between px-3 py-2.5 bg-zinc-800/50 rounded-lg"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm text-white font-mono truncate">
                                                                {ban.user_address.slice(
                                                                    0,
                                                                    6,
                                                                )}
                                                                ...
                                                                {ban.user_address.slice(
                                                                    -4,
                                                                )}
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                {ban.reason && (
                                                                    <p className="text-xs text-zinc-500 truncate">
                                                                        {
                                                                            ban.reason
                                                                        }
                                                                    </p>
                                                                )}
                                                                <p className="text-xs text-zinc-600">
                                                                    {ban.banned_until
                                                                        ? `Until ${new Date(ban.banned_until).toLocaleDateString()}`
                                                                        : "Permanent"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() =>
                                                                unbanUser(
                                                                    ban.user_address,
                                                                )
                                                            }
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
        document.body,
    );
}
