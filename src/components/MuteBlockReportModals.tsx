"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
    MuteDuration, 
    MUTE_DURATIONS, 
    ReportType, 
    REPORT_TYPES 
} from "@/hooks/useMuteBlockReport";

// =============================================================================
// MUTE OPTIONS MODAL
// =============================================================================

type MuteOptionsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onMute: (duration: MuteDuration) => Promise<boolean>;
    onUnmute?: () => Promise<boolean>;
    isMuted?: boolean;
    conversationName?: string;
    muteUntil?: string | null;
};

export function MuteOptionsModal({
    isOpen,
    onClose,
    onMute,
    onUnmute,
    isMuted = false,
    conversationName = "this conversation",
    muteUntil,
}: MuteOptionsModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [selectedDuration, setSelectedDuration] = useState<MuteDuration | null>(null);

    const handleMute = async (duration: MuteDuration) => {
        setIsLoading(true);
        setSelectedDuration(duration);
        const success = await onMute(duration);
        setIsLoading(false);
        if (success) {
            onClose();
        }
    };

    const handleUnmute = async () => {
        if (!onUnmute) return;
        setIsLoading(true);
        const success = await onUnmute();
        setIsLoading(false);
        if (success) {
            onClose();
        }
    };

    // Format remaining mute time
    const formatMuteRemaining = () => {
        if (!muteUntil) return "Forever";
        const remaining = new Date(muteUntil).getTime() - Date.now();
        if (remaining <= 0) return "Expired";
        
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days} day${days > 1 ? "s" : ""} remaining`;
        if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} remaining`;
        return "Less than an hour";
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
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300]"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto bg-zinc-900 rounded-2xl shadow-2xl z-[301] overflow-hidden"
                    >
                        {/* Header */}
                        <div className="px-5 py-4 border-b border-zinc-800">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                                    <span className="text-xl">🔔</span>
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-white">
                                        {isMuted ? "Muted" : "Mute Notifications"}
                                    </h2>
                                    <p className="text-sm text-zinc-400 truncate max-w-[200px]">
                                        {conversationName}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-4">
                            {isMuted ? (
                                /* Currently muted - show unmute option */
                                <div className="space-y-4">
                                    <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                                        <span className="text-3xl">🔇</span>
                                        <p className="text-white font-medium mt-2">Currently muted</p>
                                        <p className="text-sm text-zinc-400">{formatMuteRemaining()}</p>
                                    </div>

                                    <button
                                        onClick={handleUnmute}
                                        disabled={isLoading}
                                        className="w-full py-3 bg-[#FF5500] hover:bg-[#FF6600] active:bg-[#E64D00] text-white font-medium rounded-xl transition-colors disabled:opacity-50"
                                    >
                                        {isLoading ? "Unmuting..." : "Unmute Notifications"}
                                    </button>

                                    <p className="text-xs text-zinc-500 text-center">
                                        Or change mute duration:
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm text-zinc-400 mb-4">
                                    You won't receive notifications from this conversation. Select how long to mute:
                                </p>
                            )}

                            {/* Duration Options */}
                            <div className="space-y-2 mt-4">
                                {MUTE_DURATIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        onClick={() => handleMute(option.value)}
                                        disabled={isLoading}
                                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${
                                            selectedDuration === option.value && isLoading
                                                ? "bg-zinc-700 text-white"
                                                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white"
                                        }`}
                                    >
                                        <span className="flex items-center gap-3">
                                            <span className="text-lg">
                                                {option.value === "1h" && "⏱️"}
                                                {option.value === "8h" && "🌙"}
                                                {option.value === "1d" && "📅"}
                                                {option.value === "1w" && "📆"}
                                                {option.value === "forever" && "🔇"}
                                            </span>
                                            {option.label}
                                        </span>
                                        {selectedDuration === option.value && isLoading && (
                                            <div className="w-4 h-4 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Cancel Button */}
                        <div className="px-4 pb-4">
                            <button
                                onClick={onClose}
                                className="w-full py-3 text-zinc-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

// =============================================================================
// BLOCK USER MODAL
// =============================================================================

type BlockUserModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onBlock: () => Promise<boolean>;
    onUnblock?: () => Promise<boolean>;
    isBlocked?: boolean;
    userName?: string;
    userAddress?: string;
};

export function BlockUserModal({
    isOpen,
    onClose,
    onBlock,
    onUnblock,
    isBlocked = false,
    userName = "this user",
    userAddress,
}: BlockUserModalProps) {
    const [isLoading, setIsLoading] = useState(false);

    const handleBlock = async () => {
        setIsLoading(true);
        const success = await onBlock();
        setIsLoading(false);
        if (success) {
            onClose();
        }
    };

    const handleUnblock = async () => {
        if (!onUnblock) return;
        setIsLoading(true);
        const success = await onUnblock();
        setIsLoading(false);
        if (success) {
            onClose();
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
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300]"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-sm mx-auto bg-zinc-900 rounded-2xl shadow-2xl z-[301] overflow-hidden"
                    >
                        {/* Header with warning icon */}
                        <div className="pt-6 pb-4 text-center">
                            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                                <span className="text-3xl">{isBlocked ? "🚫" : "⛔"}</span>
                            </div>
                            <h2 className="text-xl font-bold text-white">
                                {isBlocked ? "Unblock User?" : "Block User?"}
                            </h2>
                            <p className="text-zinc-400 mt-1">{userName}</p>
                            {userAddress && (
                                <p className="text-xs text-zinc-600 mt-1 font-mono">
                                    {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
                                </p>
                            )}
                        </div>

                        {/* Warning Content */}
                        <div className="px-5 pb-4">
                            {isBlocked ? (
                                <div className="bg-zinc-800/50 rounded-xl p-4 text-sm text-zinc-300 space-y-2">
                                    <p>Unblocking will allow this user to:</p>
                                    <ul className="list-disc list-inside text-zinc-400 space-y-1">
                                        <li>Send you direct messages</li>
                                        <li>See your messages in groups/channels</li>
                                        <li>Add you as a friend</li>
                                    </ul>
                                </div>
                            ) : (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-zinc-300 space-y-2">
                                    <p>Blocking will prevent this user from:</p>
                                    <ul className="list-disc list-inside text-zinc-400 space-y-1">
                                        <li>Sending you direct messages</li>
                                        <li>They won't be notified</li>
                                        <li>You can unblock anytime</li>
                                    </ul>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="px-5 pb-5 space-y-3">
                            {isBlocked ? (
                                <button
                                    onClick={handleUnblock}
                                    disabled={isLoading}
                                    className="w-full py-3 bg-zinc-700 hover:bg-zinc-600 text-white font-medium rounded-xl transition-colors disabled:opacity-50"
                                >
                                    {isLoading ? "Unblocking..." : "Unblock User"}
                                </button>
                            ) : (
                                <button
                                    onClick={handleBlock}
                                    disabled={isLoading}
                                    className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50"
                                >
                                    {isLoading ? "Blocking..." : "Block User"}
                                </button>
                            )}

                            <button
                                onClick={onClose}
                                className="w-full py-3 text-zinc-400 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

// =============================================================================
// REPORT USER MODAL
// =============================================================================

type ReportUserModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onReport: (params: {
        reportType: ReportType;
        description?: string;
        alsoBlock?: boolean;
    }) => Promise<{ success: boolean; error?: string }>;
    userName?: string;
    userAddress?: string;
    messageContent?: string;
};

export function ReportUserModal({
    isOpen,
    onClose,
    onReport,
    userName = "this user",
    userAddress,
    messageContent,
}: ReportUserModalProps) {
    const [step, setStep] = useState<"type" | "details">("type");
    const [selectedType, setSelectedType] = useState<ReportType | null>(null);
    const [description, setDescription] = useState("");
    const [alsoBlock, setAlsoBlock] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSelectType = (type: ReportType) => {
        setSelectedType(type);
        setStep("details");
    };

    const handleSubmit = async () => {
        if (!selectedType) return;

        setIsSubmitting(true);
        setError(null);

        const result = await onReport({
            reportType: selectedType,
            description: description.trim() || undefined,
            alsoBlock,
        });

        setIsSubmitting(false);

        if (result.success) {
            setSuccess(true);
            setTimeout(() => {
                onClose();
                // Reset state
                setStep("type");
                setSelectedType(null);
                setDescription("");
                setAlsoBlock(true);
                setSuccess(false);
            }, 2000);
        } else {
            setError(result.error || "Failed to submit report");
        }
    };

    const handleClose = () => {
        onClose();
        // Reset state after animation
        setTimeout(() => {
            setStep("type");
            setSelectedType(null);
            setDescription("");
            setAlsoBlock(true);
            setError(null);
            setSuccess(false);
        }, 300);
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
                        onClick={handleClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300]"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-zinc-900 rounded-2xl shadow-2xl z-[301] overflow-hidden max-h-[80vh] flex flex-col"
                    >
                        {success ? (
                            /* Success State */
                            <div className="p-8 text-center">
                                <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4"
                                >
                                    <span className="text-4xl">✅</span>
                                </motion.div>
                                <h2 className="text-xl font-bold text-white">Report Submitted</h2>
                                <p className="text-zinc-400 mt-2">
                                    Thank you for helping keep our community safe.
                                </p>
                            </div>
                        ) : step === "type" ? (
                            /* Step 1: Select Report Type */
                            <>
                                <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
                                    <div>
                                        <h2 className="text-lg font-semibold text-white">Report User</h2>
                                        <p className="text-sm text-zinc-400">{userName}</p>
                                    </div>
                                    <button
                                        onClick={handleClose}
                                        className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="p-4 overflow-y-auto">
                                    <p className="text-sm text-zinc-400 mb-4">
                                        Why are you reporting this user?
                                    </p>

                                    <div className="space-y-2">
                                        {REPORT_TYPES.map((type) => (
                                            <button
                                                key={type.value}
                                                onClick={() => handleSelectType(type.value)}
                                                className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors text-left"
                                            >
                                                <span className="text-xl">{type.emoji}</span>
                                                <div>
                                                    <p className="font-medium text-white">{type.label}</p>
                                                    <p className="text-xs text-zinc-500">{type.description}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : (
                            /* Step 2: Add Details */
                            <>
                                <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-3">
                                    <button
                                        onClick={() => setStep("type")}
                                        className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                        </svg>
                                    </button>
                                    <div>
                                        <h2 className="text-lg font-semibold text-white">
                                            {REPORT_TYPES.find((t) => t.value === selectedType)?.label}
                                        </h2>
                                        <p className="text-sm text-zinc-400">Add details (optional)</p>
                                    </div>
                                </div>

                                <div className="p-4 space-y-4 overflow-y-auto">
                                    {/* Show message being reported if available */}
                                    {messageContent && (
                                        <div className="bg-zinc-800/50 rounded-xl p-3">
                                            <p className="text-xs text-zinc-500 mb-1">Reported message:</p>
                                            <p className="text-sm text-zinc-300 line-clamp-3">
                                                {messageContent}
                                            </p>
                                        </div>
                                    )}

                                    {/* Description */}
                                    <div>
                                        <label className="text-sm text-zinc-400 mb-2 block">
                                            Additional details
                                        </label>
                                        <textarea
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="Describe what happened..."
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 resize-none focus:outline-none focus:border-[#FF5500]"
                                            rows={3}
                                            maxLength={500}
                                        />
                                        <p className="text-xs text-zinc-600 mt-1 text-right">
                                            {description.length}/500
                                        </p>
                                    </div>

                                    {/* Also block option */}
                                    <label className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-xl cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={alsoBlock}
                                            onChange={(e) => setAlsoBlock(e.target.checked)}
                                            className="w-5 h-5 rounded border-zinc-600 bg-zinc-700 text-[#FF5500] focus:ring-[#FF5500] focus:ring-offset-zinc-900"
                                        />
                                        <div>
                                            <p className="text-white font-medium">Also block this user</p>
                                            <p className="text-xs text-zinc-500">
                                                They won't be able to message you
                                            </p>
                                        </div>
                                    </label>

                                    {/* Error */}
                                    {error && (
                                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                                            <p className="text-sm text-red-400">{error}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Submit */}
                                <div className="p-4 border-t border-zinc-800">
                                    <button
                                        onClick={handleSubmit}
                                        disabled={isSubmitting}
                                        className="w-full py-3 bg-red-600 hover:bg-red-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Submitting...
                                            </>
                                        ) : (
                                            <>
                                                <span>🚨</span>
                                                Submit Report
                                            </>
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

// =============================================================================
// CONVERSATION ACTIONS MENU (combines all three)
// =============================================================================

type ConversationActionsMenuProps = {
    isOpen: boolean;
    onClose: () => void;
    onMute: () => void;
    onBlock: () => void;
    onReport: () => void;
    isMuted?: boolean;
    isBlocked?: boolean;
    isOwnMessage?: boolean;
    showMute?: boolean;
    showBlock?: boolean;
    showReport?: boolean;
};

export function ConversationActionsMenu({
    isOpen,
    onClose,
    onMute,
    onBlock,
    onReport,
    isMuted = false,
    isBlocked = false,
    isOwnMessage = false,
    showMute = true,
    showBlock = true,
    showReport = true,
}: ConversationActionsMenuProps) {
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
                        className="fixed inset-0 bg-black/40 z-[200]"
                    />

                    {/* Menu */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-0 inset-x-0 bg-zinc-900 rounded-t-2xl z-[201] pb-safe"
                    >
                        {/* Handle */}
                        <div className="flex justify-center py-2">
                            <div className="w-10 h-1 rounded-full bg-zinc-700" />
                        </div>

                        {/* Options */}
                        <div className="px-4 pb-4 space-y-2">
                            {showMute && (
                                <button
                                    onClick={() => {
                                        onMute();
                                        onClose();
                                    }}
                                    className="w-full flex items-center gap-4 px-4 py-3.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
                                >
                                    <span className="text-xl">{isMuted ? "🔔" : "🔇"}</span>
                                    <div className="text-left">
                                        <p className="font-medium text-white">
                                            {isMuted ? "Unmute Notifications" : "Mute Notifications"}
                                        </p>
                                        <p className="text-xs text-zinc-500">
                                            {isMuted ? "Turn notifications back on" : "Stop receiving notifications"}
                                        </p>
                                    </div>
                                </button>
                            )}

                            {showBlock && !isOwnMessage && (
                                <button
                                    onClick={() => {
                                        onBlock();
                                        onClose();
                                    }}
                                    className="w-full flex items-center gap-4 px-4 py-3.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
                                >
                                    <span className="text-xl">{isBlocked ? "✅" : "🚫"}</span>
                                    <div className="text-left">
                                        <p className="font-medium text-white">
                                            {isBlocked ? "Unblock User" : "Block User"}
                                        </p>
                                        <p className="text-xs text-zinc-500">
                                            {isBlocked ? "Allow messages from this user" : "Prevent all contact"}
                                        </p>
                                    </div>
                                </button>
                            )}

                            {showReport && !isOwnMessage && (
                                <button
                                    onClick={() => {
                                        onReport();
                                        onClose();
                                    }}
                                    className="w-full flex items-center gap-4 px-4 py-3.5 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-colors"
                                >
                                    <span className="text-xl">🚨</span>
                                    <div className="text-left">
                                        <p className="font-medium text-red-400">Report User</p>
                                        <p className="text-xs text-zinc-500">
                                            Report for spam, abuse, or violations
                                        </p>
                                    </div>
                                </button>
                            )}

                            {/* Cancel */}
                            <button
                                onClick={onClose}
                                className="w-full py-3 text-zinc-400 hover:text-white transition-colors mt-2"
                            >
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
