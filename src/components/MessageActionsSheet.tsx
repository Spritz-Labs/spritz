"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";

export type MessageAction = {
    id: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    variant?: "default" | "danger";
    disabled?: boolean;
    loading?: boolean;
};

type MessageActionsSheetProps = {
    isOpen: boolean;
    onClose: () => void;
    actions: MessageAction[];
    /** Quick reactions to show at top */
    reactions?: string[];
    onReaction?: (emoji: string) => void;
    /** Message preview (optional) */
    messagePreview?: string;
};

export function MessageActionsSheet({
    isOpen,
    onClose,
    actions,
    reactions = ["👍", "❤️", "🔥", "😂", "🤙", "🤯", "🙏", "💯"],
    onReaction,
    messagePreview,
}: MessageActionsSheetProps) {
    const [isMobile, setIsMobile] = useState(false);
    const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);

    // Detect mobile
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640 || 'ontouchstart' in window);
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // Handle reaction selection
    const handleReaction = useCallback((emoji: string) => {
        setSelectedEmoji(emoji);
        if (navigator.vibrate) {
            navigator.vibrate(15);
        }
        setTimeout(() => {
            onReaction?.(emoji);
            onClose();
            setSelectedEmoji(null);
        }, 100);
    }, [onReaction, onClose]);

    // Handle action click
    const handleAction = useCallback((action: MessageAction) => {
        if (action.disabled || action.loading) return;
        if (navigator.vibrate) {
            navigator.vibrate(10);
        }
        action.onClick();
        onClose();
    }, [onClose]);

    // Prevent body scroll when open
    useEffect(() => {
        if (isOpen && isMobile) {
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = '';
            };
        }
    }, [isOpen, isMobile]);

    // Mobile: Full bottom sheet
    if (isMobile) {
        return (
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="fixed inset-0 bg-black/60 z-[200]"
                            onClick={onClose}
                        />
                        
                        {/* Bottom Sheet */}
                        <motion.div
                            initial={{ opacity: 0, y: 100 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 100 }}
                            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                            className="fixed bottom-0 left-0 right-0 z-[201]"
                            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
                        >
                            <div className="mx-2 bg-zinc-900 border border-zinc-700 rounded-3xl shadow-2xl overflow-hidden">
                                {/* Drag handle */}
                                <div className="flex justify-center pt-3 pb-1">
                                    <div className="w-10 h-1 bg-zinc-600 rounded-full" />
                                </div>

                                {/* Message Preview (optional) */}
                                {messagePreview && (
                                    <div className="px-4 py-2 border-b border-zinc-800">
                                        <p className="text-xs text-zinc-500 truncate">{messagePreview}</p>
                                    </div>
                                )}

                                {/* Quick Reactions */}
                                {onReaction && reactions.length > 0 && (
                                    <div className="px-3 py-3 border-b border-zinc-800">
                                        <div className="flex justify-center gap-1.5 flex-wrap">
                                            {reactions.map((emoji) => (
                                                <button
                                                    key={emoji}
                                                    onClick={() => handleReaction(emoji)}
                                                    className={`w-12 h-12 flex items-center justify-center text-2xl rounded-2xl transition-all duration-100 touch-manipulation ${
                                                        selectedEmoji === emoji 
                                                            ? "bg-[#FF5500]/30 scale-110" 
                                                            : "bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 active:scale-105"
                                                    }`}
                                                >
                                                    <span className={selectedEmoji === emoji ? "animate-bounce" : ""}>
                                                        {emoji}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="py-2">
                                    {actions.map((action) => (
                                        <button
                                            key={action.id}
                                            onClick={() => handleAction(action)}
                                            disabled={action.disabled || action.loading}
                                            className={`w-full flex items-center gap-4 px-5 py-3.5 transition-colors touch-manipulation ${
                                                action.variant === "danger"
                                                    ? "text-red-400 hover:bg-red-500/10 active:bg-red-500/20"
                                                    : "text-zinc-200 hover:bg-zinc-800 active:bg-zinc-700"
                                            } ${action.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                                        >
                                            <span className={`w-6 h-6 flex items-center justify-center ${
                                                action.variant === "danger" ? "text-red-400" : "text-zinc-400"
                                            }`}>
                                                {action.loading ? (
                                                    <div className="w-5 h-5 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    action.icon
                                                )}
                                            </span>
                                            <span className="text-base font-medium">{action.label}</span>
                                        </button>
                                    ))}
                                </div>

                                {/* Cancel Button */}
                                <div className="px-3 pb-3">
                                    <button
                                        onClick={onClose}
                                        className="w-full py-3.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 font-medium rounded-2xl transition-colors touch-manipulation"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        );
    }

    // Desktop: Compact floating menu (positioned by parent)
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.12 }}
                    className="flex items-center gap-1 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-full px-1.5 py-1 shadow-2xl z-50"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Quick reactions first */}
                    {onReaction && (
                        <button
                            onClick={() => handleReaction("👍")}
                            className="w-8 h-8 flex items-center justify-center text-base hover:bg-zinc-700 rounded-full transition-colors"
                            title="React"
                        >
                            😊
                        </button>
                    )}
                    
                    {/* Action buttons */}
                    {actions.slice(0, 4).map((action) => (
                        <button
                            key={action.id}
                            onClick={() => handleAction(action)}
                            disabled={action.disabled || action.loading}
                            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                                action.variant === "danger"
                                    ? "text-zinc-400 hover:bg-red-500/20 hover:text-red-400"
                                    : "text-zinc-400 hover:bg-zinc-700 hover:text-white"
                            } ${action.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                            title={action.label}
                        >
                            {action.loading ? (
                                <div className="w-4 h-4 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
                            ) : (
                                <span className="w-4 h-4">{action.icon}</span>
                            )}
                        </button>
                    ))}
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// Common action icons
export const ActionIcons = {
    reply: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
    ),
    copy: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
    ),
    forward: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4-4m0 0l-4-4m4 4H7a4 4 0 100 8h2" />
        </svg>
    ),
    delete: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
    ),
    pin: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
        </svg>
    ),
    pinFilled: (
        <svg fill="currentColor" viewBox="0 0 24 24">
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
        </svg>
    ),
    star: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
    ),
    edit: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
    ),
    react: (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
};
