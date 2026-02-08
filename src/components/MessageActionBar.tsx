"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { upscalePixelArt, downloadPixelArt } from "./PixelArtImage";

// ============= Types =============

export type MessageActionConfig = {
    messageId: string;
    messageContent: string;
    isOwn: boolean;
    isPinned?: boolean;
    isStarred?: boolean;
    canEdit?: boolean;
    /** Whether this user can delete this message (own message OR admin/moderator) */
    canDelete?: boolean;
    hasMedia?: boolean;
    isPixelArt?: boolean;
    mediaUrl?: string;
};

export type MessageActionCallbacks = {
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
    onShare?: () => void;
};

type MessageActionBarProps = {
    isOpen: boolean;
    onClose: () => void;
    config: MessageActionConfig | null;
    callbacks: MessageActionCallbacks;
    reactions?: string[];
};

// ============= Constants =============

const DEFAULT_REACTIONS = ["👍", "❤️", "🔥", "😂", "😢", "😮", "🙏", "💯"];

// Toast helper
function showToast(message: string, type: "success" | "error" = "success") {
    const existing = document.querySelector('[data-toast]');
    if (existing) existing.remove();
    
    const toast = document.createElement("div");
    toast.setAttribute('data-toast', 'true');
    toast.className = `fixed bottom-32 left-1/2 -translate-x-1/2 px-4 py-3 ${
        type === "success" ? "bg-zinc-800" : "bg-red-600"
    } text-white text-sm font-medium rounded-2xl shadow-xl z-[9999] flex items-center gap-2`;
    toast.innerHTML = `
        ${type === "success" 
            ? '<svg class="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>'
            : '<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>'
        }
        <span>${message}</span>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s";
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ============= Main Component =============

export function MessageActionBar({
    isOpen,
    onClose,
    config,
    callbacks,
    reactions = DEFAULT_REACTIONS,
}: MessageActionBarProps) {
    const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);
    const [isSharing, setIsSharing] = useState(false);
    const [isDownloadingHD, setIsDownloadingHD] = useState(false);
    const [showMoreActions, setShowMoreActions] = useState(false);

    // Reset state when closed
    useEffect(() => {
        if (!isOpen) {
            setSelectedEmoji(null);
            setShowMoreActions(false);
        }
    }, [isOpen]);

    // Handle reaction
    const handleReaction = useCallback(async (emoji: string) => {
        setSelectedEmoji(emoji);
        if (navigator.vibrate) navigator.vibrate(15);
        // Wait for reaction callback to complete before closing
        try {
            await callbacks.onReaction?.(emoji);
        } catch (error) {
            console.error("[MessageActionBar] Reaction error:", error);
        }
        // Small delay for visual feedback
        setTimeout(() => {
            onClose();
            setSelectedEmoji(null);
        }, 100);
    }, [callbacks, onClose]);

    // Copy to clipboard
    const handleCopy = useCallback(() => {
        if (config?.messageContent) {
            navigator.clipboard.writeText(config.messageContent);
            showToast("Copied to clipboard");
        }
        callbacks.onCopy?.();
        onClose();
    }, [config, callbacks, onClose]);

    // Native share
    const handleShare = useCallback(async () => {
        if (!config) return;
        
        setIsSharing(true);
        try {
            if (navigator.share) {
                if (config.mediaUrl) {
                    try {
                        const response = await fetch(config.mediaUrl);
                        const blob = await response.blob();
                        const file = new File([blob], "image.png", { type: blob.type || "image/png" });
                        
                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                            await navigator.share({
                                title: "Shared from Spritz",
                                text: "Check this out! 🍊",
                                files: [file],
                            });
                        } else {
                            await navigator.share({
                                title: "Shared from Spritz",
                                url: config.mediaUrl,
                            });
                        }
                    } catch {
                        await navigator.share({ url: config.mediaUrl });
                    }
                } else if (config.messageContent) {
                    await navigator.share({ text: config.messageContent });
                }
                showToast("Shared successfully");
            } else {
                // Fallback
                const text = config.mediaUrl || config.messageContent;
                if (text) {
                    navigator.clipboard.writeText(text);
                    showToast("Link copied to clipboard");
                }
            }
        } catch (err) {
            if ((err as Error).name !== "AbortError") {
                showToast("Failed to share", "error");
            }
        } finally {
            setIsSharing(false);
            onClose();
        }
    }, [config, onClose]);

    // Download
    const handleDownload = useCallback(async () => {
        if (!config?.mediaUrl) return;
        
        try {
            const response = await fetch(config.mediaUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `spritz-${Date.now()}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            showToast("Downloaded");
        } catch {
            showToast("Download failed", "error");
        }
        onClose();
    }, [config, onClose]);

    // Download HD
    const handleDownloadHD = useCallback(async () => {
        if (!config?.mediaUrl) return;
        
        setIsDownloadingHD(true);
        try {
            const img = new Image();
            img.crossOrigin = "anonymous";
            
            await new Promise<void>((resolve, reject) => {
                img.onload = () => resolve();
                img.onerror = () => reject(new Error("Failed to load"));
                img.src = config.mediaUrl!;
            });

            const upscaledDataUrl = upscalePixelArt(img, 16);
            downloadPixelArt(upscaledDataUrl, `pixel-art-hd-${Date.now()}.png`);
            showToast("HD downloaded! ✨");
        } catch {
            showToast("HD download failed", "error");
        } finally {
            setIsDownloadingHD(false);
            onClose();
        }
    }, [config, onClose]);

    // Action handler
    const handleAction = useCallback((action: string) => {
        if (navigator.vibrate) navigator.vibrate(10);
        
        switch (action) {
            case "reply":
                callbacks.onReply?.();
                onClose();
                break;
            case "copy":
                handleCopy();
                break;
            case "share":
                handleShare();
                break;
            case "download":
                handleDownload();
                break;
            case "downloadHD":
                handleDownloadHD();
                break;
            case "forward":
                callbacks.onForward?.();
                onClose();
                break;
            case "pin":
                callbacks.onPin?.();
                onClose();
                break;
            case "unpin":
                callbacks.onUnpin?.();
                onClose();
                break;
            case "star":
                callbacks.onStar?.();
                onClose();
                break;
            case "unstar":
                callbacks.onUnstar?.();
                onClose();
                break;
            case "edit":
                callbacks.onEdit?.();
                onClose();
                break;
            case "delete":
                callbacks.onDelete?.();
                onClose();
                break;
            case "report":
                callbacks.onReport?.();
                onClose();
                break;
        }
    }, [callbacks, onClose, handleCopy, handleShare, handleDownload, handleDownloadHD]);

    if (!config) return null;

    // Build action list
    const primaryActions: { id: string; icon: React.ReactNode; label: string; show: boolean; danger?: boolean; highlight?: boolean }[] = [
        { 
            id: "reply", 
            icon: <ReplyIcon />, 
            label: "Reply",
            show: !!callbacks.onReply 
        },
        { 
            id: "copy", 
            icon: <CopyIcon />, 
            label: "Copy",
            show: !!config.messageContent && !config.hasMedia 
        },
        { 
            id: "share", 
            icon: isSharing ? <Spinner /> : <ShareIcon />, 
            label: "Share",
            show: true 
        },
        { 
            id: "download", 
            icon: <DownloadIcon />, 
            label: "Save",
            show: !!config.hasMedia 
        },
        { 
            id: "downloadHD", 
            icon: isDownloadingHD ? <Spinner /> : <DownloadIcon />, 
            label: "HD",
            show: !!config.isPixelArt,
            highlight: true
        },
    ].filter(a => a.show);

    const moreActions: { id: string; icon: React.ReactNode; label: string; show: boolean; danger?: boolean }[] = [
        { id: "forward", icon: <ForwardIcon />, label: "Forward", show: !!callbacks.onForward },
        { id: config.isPinned ? "unpin" : "pin", icon: <PinIcon />, label: config.isPinned ? "Unpin" : "Pin", show: !!callbacks.onPin || !!callbacks.onUnpin },
        { id: config.isStarred ? "unstar" : "star", icon: <StarIcon filled={config.isStarred} />, label: config.isStarred ? "Unstar" : "Star", show: !!callbacks.onStar || !!callbacks.onUnstar },
        { id: "edit", icon: <EditIcon />, label: "Edit", show: config.isOwn && !!config.canEdit && !!callbacks.onEdit },
        { id: "delete", icon: <DeleteIcon />, label: "Delete", show: (config.canDelete ?? config.isOwn) && !!callbacks.onDelete, danger: true },
        { id: "report", icon: <ReportIcon />, label: "Report", show: !config.isOwn && !!callbacks.onReport, danger: true },
    ].filter(a => a.show);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop - tap to close */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9998]"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                    />

                    {/* Action Bar */}
                    <motion.div
                        initial={{ y: 200, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 200, opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 400 }}
                        className="fixed bottom-0 left-0 right-0 z-[9999] bg-zinc-900 border-t border-zinc-700/50 shadow-2xl"
                        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
                    >
                        {/* Message Preview */}
                        {config.messageContent && !config.hasMedia && (
                            <div className="px-4 py-2 border-b border-zinc-800/50">
                                <p className="text-xs text-zinc-500 line-clamp-1">{config.messageContent}</p>
                            </div>
                        )}

                        {/* Quick Reactions */}
                        <div className="px-4 py-3 border-b border-zinc-800/50">
                            <div className="flex justify-between items-center max-w-md mx-auto">
                                {reactions.map((emoji) => (
                                    <button
                                        key={emoji}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleReaction(emoji);
                                        }}
                                        className={`w-12 h-12 flex items-center justify-center text-2xl rounded-full transition-all touch-manipulation active:scale-90 ${
                                            selectedEmoji === emoji
                                                ? "bg-[#FF5500]/30 scale-110"
                                                : "hover:bg-zinc-800 active:bg-zinc-700"
                                        }`}
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Primary Actions */}
                        <div className="px-4 py-3 flex justify-around items-center">
                            {primaryActions.map((action) => (
                                <button
                                    key={action.id}
                                    onClick={() => handleAction(action.id)}
                                    disabled={action.id === "share" && isSharing || action.id === "downloadHD" && isDownloadingHD}
                                    className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all touch-manipulation active:scale-95 min-w-[60px] ${
                                        action.highlight
                                            ? "text-emerald-400"
                                            : action.danger
                                                ? "text-red-400"
                                                : "text-zinc-300"
                                    }`}
                                >
                                    <span className="w-6 h-6">{action.icon}</span>
                                    <span className="text-xs font-medium">{action.label}</span>
                                </button>
                            ))}
                            
                            {/* More button */}
                            {moreActions.length > 0 && (
                                <button
                                    onClick={() => setShowMoreActions(!showMoreActions)}
                                    className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all touch-manipulation active:scale-95 min-w-[60px] ${
                                        showMoreActions ? "text-[#FF5500]" : "text-zinc-300"
                                    }`}
                                >
                                    <span className="w-6 h-6"><MoreIcon /></span>
                                    <span className="text-xs font-medium">More</span>
                                </button>
                            )}
                        </div>

                        {/* More Actions (expandable) */}
                        <AnimatePresence>
                            {showMoreActions && moreActions.length > 0 && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden border-t border-zinc-800/50"
                                >
                                    <div className="px-4 py-3 flex justify-around items-center">
                                        {moreActions.map((action) => (
                                            <button
                                                key={action.id}
                                                onClick={() => handleAction(action.id)}
                                                className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all touch-manipulation active:scale-95 min-w-[60px] ${
                                                    action.danger ? "text-red-400" : "text-zinc-300"
                                                }`}
                                            >
                                                <span className="w-6 h-6">{action.icon}</span>
                                                <span className="text-xs font-medium">{action.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}

// ============= Icons =============

function ReplyIcon() {
    return (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
    );
}

function CopyIcon() {
    return (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
    );
}

function ShareIcon() {
    return (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
    );
}

function DownloadIcon() {
    return (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
    );
}

function ForwardIcon() {
    return (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4-4m0 0l-4-4m4 4H7a4 4 0 100 8h2" />
        </svg>
    );
}

function PinIcon() {
    return (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-full h-full">
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
        </svg>
    );
}

function StarIcon({ filled }: { filled?: boolean }) {
    return (
        <svg fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
    );
}

function EditIcon() {
    return (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
    );
}

function DeleteIcon() {
    return (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
    );
}

function ReportIcon() {
    return (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    );
}

function MoreIcon() {
    return (
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="w-full h-full">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
        </svg>
    );
}

function Spinner() {
    return (
        <div className="w-full h-full border-2 border-zinc-600 border-t-current rounded-full animate-spin" />
    );
}
