"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ============= Types =============

export type MessageMenuAction = 
    | "react"
    | "reply"
    | "copy"
    | "forward"
    | "pin"
    | "unpin"
    | "edit"
    | "delete"
    | "star"
    | "unstar"
    | "report"
    | "download";

export type MessageMenuConfig = {
    /** Message content for preview */
    messageContent?: string;
    /** Is this the user's own message */
    isOwn: boolean;
    /** Is this message pinned */
    isPinned?: boolean;
    /** Is this message starred/bookmarked */
    isStarred?: boolean;
    /** Can this message be edited (within time limit) */
    canEdit?: boolean;
    /** Has media that can be downloaded */
    hasMedia?: boolean;
    /** Available actions - if not provided, shows all applicable */
    availableActions?: MessageMenuAction[];
};

export type MessageMenuCallbacks = {
    onReaction?: (emoji: string) => void;
    onReply?: () => void;
    onCopy?: () => void;
    onForward?: () => void;
    onPin?: () => void;
    onUnpin?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    onStar?: () => void;
    onUnstar?: () => void;
    onReport?: () => void;
    onDownload?: () => void;
};

type UnifiedMessageMenuProps = {
    isOpen: boolean;
    onClose: () => void;
    config: MessageMenuConfig;
    callbacks: MessageMenuCallbacks;
    /** Custom reactions - defaults to standard set */
    reactions?: string[];
    /** Position for desktop (optional - centers on mobile) */
    position?: { x: number; y: number };
};

// ============= Constants =============

const DEFAULT_REACTIONS = ["👍", "❤️", "🔥", "😂", "😢", "😮", "🙏", "💯"];

const ACTION_ICONS: Record<MessageMenuAction, React.ReactNode> = {
    react: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
    reply: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
    ),
    copy: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
    ),
    forward: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4-4m0 0l-4-4m4 4H7a4 4 0 100 8h2" />
        </svg>
    ),
    pin: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
        </svg>
    ),
    unpin: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
        </svg>
    ),
    edit: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
    ),
    delete: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
    ),
    star: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
    ),
    unstar: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
    ),
    report: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    ),
    download: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
    ),
};

const ACTION_LABELS: Record<MessageMenuAction, string> = {
    react: "React",
    reply: "Reply",
    copy: "Copy",
    forward: "Forward",
    pin: "Pin",
    unpin: "Unpin",
    edit: "Edit",
    delete: "Delete",
    star: "Star",
    unstar: "Unstar",
    report: "Report",
    download: "Save",
};

// ============= Main Component =============

export function UnifiedMessageMenu({
    isOpen,
    onClose,
    config,
    callbacks,
    reactions = DEFAULT_REACTIONS,
    position,
}: UnifiedMessageMenuProps) {
    const [isMobile, setIsMobile] = useState(false);
    const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Detect mobile
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640 || 'ontouchstart' in window);
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // Prevent body scroll when open on mobile
    useEffect(() => {
        if (isOpen && isMobile) {
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = ''; };
        }
    }, [isOpen, isMobile]);

    // Build actions list based on config
    const actions = buildActionsList(config, callbacks);

    // Handle reaction
    const handleReaction = useCallback((emoji: string) => {
        setSelectedEmoji(emoji);
        if (navigator.vibrate) navigator.vibrate(15);
        setTimeout(() => {
            callbacks.onReaction?.(emoji);
            onClose();
            setSelectedEmoji(null);
        }, 100);
    }, [callbacks, onClose]);

    // Handle action click
    const handleAction = useCallback((action: MessageMenuAction, callback?: () => void) => {
        if (!callback) return;
        if (navigator.vibrate) navigator.vibrate(10);
        callback();
        onClose();
    }, [onClose]);

    // Copy message content
    const handleCopy = useCallback(() => {
        if (config.messageContent) {
            navigator.clipboard.writeText(config.messageContent);
            // Show toast feedback
            const toast = document.createElement("div");
            toast.className = "fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-zinc-800 text-white text-sm font-medium rounded-xl shadow-lg z-[300] animate-in fade-in slide-in-from-bottom-2";
            toast.textContent = "✓ Copied to clipboard";
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
        }
        callbacks.onCopy?.();
        onClose();
    }, [config.messageContent, callbacks, onClose]);

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
                        className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-[200]"
                        onClick={onClose}
                    />

                    {isMobile ? (
                        // ============= MOBILE: Bottom Sheet =============
                        <motion.div
                            ref={menuRef}
                            initial={{ opacity: 0, y: "100%" }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: "100%" }}
                            transition={{ type: "spring", damping: 30, stiffness: 400 }}
                            className="fixed bottom-0 left-0 right-0 z-[201]"
                            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
                        >
                            <div className="mx-2 bg-zinc-900 border border-zinc-700/50 rounded-3xl shadow-2xl overflow-hidden">
                                {/* Drag handle */}
                                <div className="flex justify-center pt-3 pb-1">
                                    <div className="w-10 h-1 bg-zinc-600 rounded-full" />
                                </div>

                                {/* Message Preview */}
                                {config.messageContent && (
                                    <div className="px-4 py-2 mx-3 mb-2 bg-zinc-800/50 rounded-xl">
                                        <p className="text-sm text-zinc-400 line-clamp-2">{config.messageContent}</p>
                                    </div>
                                )}

                                {/* Quick Reactions */}
                                {callbacks.onReaction && (
                                    <div className="px-3 py-3 border-b border-zinc-800/50">
                                        <div className="flex justify-center gap-1.5">
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

                                {/* Actions Grid */}
                                <div className="px-3 py-3">
                                    <div className="grid grid-cols-4 gap-2">
                                        {actions.map(({ action, callback, isDanger }) => (
                                            <button
                                                key={action}
                                                onClick={() => action === "copy" ? handleCopy() : handleAction(action, callback)}
                                                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl transition-colors touch-manipulation ${
                                                    isDanger
                                                        ? "text-red-400 hover:bg-red-500/10 active:bg-red-500/20"
                                                        : "text-zinc-300 hover:bg-zinc-800 active:bg-zinc-700"
                                                }`}
                                            >
                                                {ACTION_ICONS[action]}
                                                <span className="text-xs font-medium">{ACTION_LABELS[action]}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Cancel Button */}
                                <div className="px-3 pb-3 pt-1">
                                    <button
                                        onClick={onClose}
                                        className="w-full py-3.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 font-medium rounded-2xl transition-colors touch-manipulation"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ) : (
                        // ============= DESKTOP: Floating Menu =============
                        <motion.div
                            ref={menuRef}
                            initial={{ opacity: 0, scale: 0.9, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: -10 }}
                            transition={{ duration: 0.15 }}
                            className="fixed z-[201] flex flex-col gap-2"
                            style={{
                                left: position?.x ?? '50%',
                                top: position?.y ?? '50%',
                                transform: position ? 'translate(-50%, -100%)' : 'translate(-50%, -50%)',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Quick Reactions Bar */}
                            {callbacks.onReaction && (
                                <div className="flex items-center gap-1 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-full px-2 py-1.5 shadow-2xl">
                                    {reactions.map((emoji) => (
                                        <button
                                            key={emoji}
                                            onClick={() => handleReaction(emoji)}
                                            className={`w-9 h-9 flex items-center justify-center text-xl rounded-full transition-all ${
                                                selectedEmoji === emoji
                                                    ? "bg-[#FF5500]/30 scale-110"
                                                    : "hover:bg-zinc-700 hover:scale-110"
                                            }`}
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Actions Menu */}
                            <div className="bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-xl shadow-2xl overflow-hidden min-w-[180px]">
                                {actions.map(({ action, callback, isDanger }, index) => (
                                    <button
                                        key={action}
                                        onClick={() => action === "copy" ? handleCopy() : handleAction(action, callback)}
                                        className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors ${
                                            isDanger
                                                ? "text-red-400 hover:bg-red-500/10"
                                                : "text-zinc-300 hover:bg-zinc-800"
                                        } ${index > 0 ? "border-t border-zinc-800/50" : ""}`}
                                    >
                                        <span className={isDanger ? "text-red-400" : "text-zinc-500"}>
                                            {ACTION_ICONS[action]}
                                        </span>
                                        <span className="text-sm">{ACTION_LABELS[action]}</span>
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </>
            )}
        </AnimatePresence>
    );
}

// ============= Helper Functions =============

function buildActionsList(
    config: MessageMenuConfig,
    callbacks: MessageMenuCallbacks
): { action: MessageMenuAction; callback?: () => void; isDanger: boolean }[] {
    const actions: { action: MessageMenuAction; callback?: () => void; isDanger: boolean }[] = [];
    const available = config.availableActions;

    // Reply - always available
    if (callbacks.onReply && (!available || available.includes("reply"))) {
        actions.push({ action: "reply", callback: callbacks.onReply, isDanger: false });
    }

    // Copy - always available for text messages
    if (callbacks.onCopy && (!available || available.includes("copy"))) {
        actions.push({ action: "copy", callback: callbacks.onCopy, isDanger: false });
    }

    // Forward
    if (callbacks.onForward && (!available || available.includes("forward"))) {
        actions.push({ action: "forward", callback: callbacks.onForward, isDanger: false });
    }

    // Pin/Unpin
    if (config.isPinned && callbacks.onUnpin && (!available || available.includes("unpin"))) {
        actions.push({ action: "unpin", callback: callbacks.onUnpin, isDanger: false });
    } else if (!config.isPinned && callbacks.onPin && (!available || available.includes("pin"))) {
        actions.push({ action: "pin", callback: callbacks.onPin, isDanger: false });
    }

    // Star/Unstar
    if (config.isStarred && callbacks.onUnstar && (!available || available.includes("unstar"))) {
        actions.push({ action: "unstar", callback: callbacks.onUnstar, isDanger: false });
    } else if (!config.isStarred && callbacks.onStar && (!available || available.includes("star"))) {
        actions.push({ action: "star", callback: callbacks.onStar, isDanger: false });
    }

    // Download (for media)
    if (config.hasMedia && callbacks.onDownload && (!available || available.includes("download"))) {
        actions.push({ action: "download", callback: callbacks.onDownload, isDanger: false });
    }

    // Edit (own messages within time limit)
    if (config.isOwn && config.canEdit && callbacks.onEdit && (!available || available.includes("edit"))) {
        actions.push({ action: "edit", callback: callbacks.onEdit, isDanger: false });
    }

    // Delete (own messages)
    if (config.isOwn && callbacks.onDelete && (!available || available.includes("delete"))) {
        actions.push({ action: "delete", callback: callbacks.onDelete, isDanger: true });
    }

    // Report (not own messages)
    if (!config.isOwn && callbacks.onReport && (!available || available.includes("report"))) {
        actions.push({ action: "report", callback: callbacks.onReport, isDanger: true });
    }

    return actions;
}

// ============= Wrapper Component for Easy Integration =============

type MessageMenuTriggerProps = {
    children: React.ReactNode;
    config: MessageMenuConfig;
    callbacks: MessageMenuCallbacks;
    reactions?: string[];
    /** Disable the menu trigger */
    disabled?: boolean;
};

/**
 * Wrap any message component with this to add unified menu on tap/click
 */
export function MessageMenuTrigger({
    children,
    config,
    callbacks,
    reactions,
    disabled = false,
}: MessageMenuTriggerProps) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | undefined>();
    const containerRef = useRef<HTMLDivElement>(null);
    const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isLongPressRef = useRef(false);

    // Handle tap/click to open menu
    const handleOpenMenu = useCallback((clientX: number, clientY: number) => {
        if (disabled) return;
        
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
            // Position above the message
            setMenuPosition({
                x: clientX,
                y: rect.top - 10,
            });
        }
        setIsMenuOpen(true);
        
        // Haptic feedback
        if (navigator.vibrate) {
            navigator.vibrate([20, 10, 30]);
        }
    }, [disabled]);

    // Long press detection for mobile
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (disabled) return;
        const touch = e.touches[0];
        isLongPressRef.current = false;
        
        longPressTimerRef.current = setTimeout(() => {
            isLongPressRef.current = true;
            handleOpenMenu(touch.clientX, touch.clientY);
        }, 400);
    }, [disabled, handleOpenMenu]);

    const handleTouchEnd = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    const handleTouchMove = useCallback(() => {
        // Cancel long press on move
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    // Context menu for desktop
    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        if (disabled) return;
        e.preventDefault();
        handleOpenMenu(e.clientX, e.clientY);
    }, [disabled, handleOpenMenu]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
            }
        };
    }, []);

    return (
        <>
            <div
                ref={containerRef}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchMove}
                onContextMenu={handleContextMenu}
                className="select-none"
            >
                {children}
            </div>

            <UnifiedMessageMenu
                isOpen={isMenuOpen}
                onClose={() => setIsMenuOpen(false)}
                config={config}
                callbacks={callbacks}
                reactions={reactions}
                position={menuPosition}
            />
        </>
    );
}

// Re-export action icons for use elsewhere
export { ACTION_ICONS, ACTION_LABELS };
