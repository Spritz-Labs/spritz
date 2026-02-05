"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Optimized animation variants for better performance
const backdropVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
};

const mobileSheetVariants = {
    initial: { opacity: 0, y: 50 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 50 },
};

const desktopBarVariants = {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
};

type LongPressReactionsProps = {
    children: React.ReactNode;
    reactions?: string[];
    onReaction: (emoji: string) => void;
    onReply?: () => void;
    onCopy?: () => void;
    onDelete?: () => void;
    onForward?: () => void;
    isOwn?: boolean;
    disabled?: boolean;
    longPressDuration?: number;
};

const DEFAULT_REACTIONS = ["👍", "❤️", "🔥", "😂", "🤙", "🤯", "🙏", "💯"];

export function LongPressReactions({
    children,
    reactions = DEFAULT_REACTIONS,
    onReaction,
    onReply,
    onCopy,
    onDelete,
    onForward,
    isOwn = false,
    disabled = false,
    longPressDuration = 400, // Faster for mobile
}: LongPressReactionsProps) {
    const [showReactions, setShowReactions] = useState(false);
    const [isLongPressing, setIsLongPressing] = useState(false);
    const [position, setPosition] = useState<{ x: number; y: number; showAbove: boolean } | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
    const progressTimerRef = useRef<NodeJS.Timeout | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isLongPressRef = useRef(false);
    const startPosRef = useRef<{ x: number; y: number } | null>(null);

    // Detect mobile
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640 || 'ontouchstart' in window);
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    const handleStart = useCallback(
        (clientX: number, clientY: number) => {
            if (disabled) return;

            startPosRef.current = { x: clientX, y: clientY };
            isLongPressRef.current = false;
            
            // Show visual feedback immediately
            progressTimerRef.current = setTimeout(() => {
                setIsLongPressing(true);
            }, 100);

            longPressTimerRef.current = setTimeout(() => {
                isLongPressRef.current = true;
                setIsLongPressing(false);
                
                // Calculate position relative to viewport
                const rect = containerRef.current?.getBoundingClientRect();
                if (rect) {
                    const viewportHeight = window.innerHeight;
                    const spaceAbove = rect.top;
                    const spaceBelow = viewportHeight - rect.bottom;
                    const showAbove = spaceAbove > 150 || spaceBelow < 150;
                    
                    // On mobile, center horizontally and show as bottom sheet if not enough space
                    let x = isMobile ? window.innerWidth / 2 : clientX;
                    let y = showAbove ? rect.top - 20 : rect.bottom + 20;
                    
                    // Keep within viewport bounds
                    const barWidth = isMobile ? window.innerWidth - 32 : 320;
                    if (!isMobile) {
                        if (x - barWidth / 2 < 16) x = barWidth / 2 + 16;
                        if (x + barWidth / 2 > window.innerWidth - 16) x = window.innerWidth - barWidth / 2 - 16;
                    }
                    
                    setPosition({ x, y, showAbove });
                    setShowReactions(true);
                    
                    // Haptic feedback - stronger for better UX
                    if (navigator.vibrate) {
                        navigator.vibrate([30, 20, 50]);
                    }
                }
            }, longPressDuration);
        },
        [disabled, longPressDuration, isMobile]
    );

    const handleMove = useCallback((clientX: number, clientY: number) => {
        // Cancel if moved too far (scrolling)
        if (startPosRef.current) {
            const dx = Math.abs(clientX - startPosRef.current.x);
            const dy = Math.abs(clientY - startPosRef.current.y);
            if (dx > 10 || dy > 10) {
                handleEnd();
            }
        }
    }, []);

    const handleEnd = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        if (progressTimerRef.current) {
            clearTimeout(progressTimerRef.current);
            progressTimerRef.current = null;
        }
        setIsLongPressing(false);
        startPosRef.current = null;
    }, []);

    const handleTouchStart = useCallback(
        (e: React.TouchEvent) => {
            const touch = e.touches[0];
            handleStart(touch.clientX, touch.clientY);
        },
        [handleStart]
    );

    const handleTouchMove = useCallback(
        (e: React.TouchEvent) => {
            const touch = e.touches[0];
            handleMove(touch.clientX, touch.clientY);
        },
        [handleMove]
    );

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            handleStart(e.clientX, e.clientY);
        },
        [handleStart]
    );

    const handleReactionSelect = useCallback(
        (emoji: string) => {
            onReaction(emoji);
            setShowReactions(false);
            
            // Success haptic
            if (navigator.vibrate) {
                navigator.vibrate(20);
            }
        },
        [onReaction]
    );

    const handleAction = useCallback(
        (action: (() => void) | undefined) => {
            if (action) {
                action();
                setShowReactions(false);
                if (navigator.vibrate) {
                    navigator.vibrate(15);
                }
            }
        },
        []
    );

    // Close on outside click
    useEffect(() => {
        if (!showReactions) return;

        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setShowReactions(false);
            }
        };

        // Small delay to prevent immediate close
        const timeout = setTimeout(() => {
            document.addEventListener("mousedown", handleClickOutside);
            document.addEventListener("touchstart", handleClickOutside);
        }, 50);

        return () => {
            clearTimeout(timeout);
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("touchstart", handleClickOutside);
        };
    }, [showReactions]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
            if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
        };
    }, []);

    // Prevent context menu on long press
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const preventContextMenu = (e: Event) => {
            if (isLongPressRef.current || showReactions) {
                e.preventDefault();
            }
        };

        container.addEventListener("contextmenu", preventContextMenu);
        return () => container.removeEventListener("contextmenu", preventContextMenu);
    }, [showReactions]);

    return (
        <>
            <div
                ref={containerRef}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleEnd}
                onTouchCancel={handleEnd}
                onMouseDown={handleMouseDown}
                onMouseUp={handleEnd}
                onMouseLeave={handleEnd}
                className={`select-none transition-transform duration-150 ${isLongPressing ? "scale-[0.98] opacity-80" : ""}`}
            >
                {children}
            </div>

            {/* Reaction Bar Overlay */}
            <AnimatePresence>
                {showReactions && position && (
                    <>
                        {/* Backdrop with blur */}
                        <motion.div
                            variants={backdropVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            transition={{ duration: 0.12 }}
                            className="fixed inset-0 bg-black/50 z-[200]"
                            onClick={() => setShowReactions(false)}
                            style={{ willChange: "opacity" }}
                        />

                        {/* Reaction Bar - Different styles for mobile vs desktop */}
                        {isMobile ? (
                            // Mobile: Bottom sheet style
                            <motion.div
                                variants={mobileSheetVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                                className="fixed bottom-0 left-0 right-0 z-[201] px-4 pb-safe"
                                style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', willChange: "transform, opacity" }}
                            >
                                <div className="bg-zinc-900 border border-zinc-700 rounded-t-3xl shadow-2xl overflow-hidden">
                                    {/* Drag handle */}
                                    <div className="flex justify-center pt-3 pb-2">
                                        <div className="w-10 h-1 bg-zinc-600 rounded-full" />
                                    </div>
                                    
                                {/* Emoji Reactions - Large touch targets */}
                                <div className="px-3 pb-4">
                                    <div className="flex justify-center gap-2 flex-wrap">
                                        {reactions.map((emoji) => (
                                            <button
                                                key={emoji}
                                                onClick={() => handleReactionSelect(emoji)}
                                                className="w-[52px] h-[52px] flex items-center justify-center text-[28px] bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 active:scale-110 rounded-2xl transition-all duration-100 touch-manipulation"
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                    {/* Action Buttons */}
                                    <div className="border-t border-zinc-800 px-4 py-3 grid grid-cols-4 gap-2">
                                        {onReply && (
                                            <button
                                                onClick={() => handleAction(onReply)}
                                                className="flex flex-col items-center gap-1 py-3 text-zinc-300 hover:bg-zinc-800 active:bg-zinc-700 rounded-xl transition-colors"
                                            >
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                </svg>
                                                <span className="text-xs">Reply</span>
                                            </button>
                                        )}
                                        {onCopy && (
                                            <button
                                                onClick={() => handleAction(onCopy)}
                                                className="flex flex-col items-center gap-1 py-3 text-zinc-300 hover:bg-zinc-800 active:bg-zinc-700 rounded-xl transition-colors"
                                            >
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                </svg>
                                                <span className="text-xs">Copy</span>
                                            </button>
                                        )}
                                        {onForward && (
                                            <button
                                                onClick={() => handleAction(onForward)}
                                                className="flex flex-col items-center gap-1 py-3 text-zinc-300 hover:bg-zinc-800 active:bg-zinc-700 rounded-xl transition-colors"
                                            >
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4-4m0 0l-4-4m4 4H7a4 4 0 100 8h2" />
                                                </svg>
                                                <span className="text-xs">Forward</span>
                                            </button>
                                        )}
                                        {isOwn && onDelete && (
                                            <button
                                                onClick={() => handleAction(onDelete)}
                                                className="flex flex-col items-center gap-1 py-3 text-red-400 hover:bg-red-500/10 active:bg-red-500/20 rounded-xl transition-colors"
                                            >
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                                <span className="text-xs">Delete</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            // Desktop: Floating bar
                            <motion.div
                                variants={desktopBarVariants}
                                initial="initial"
                                animate="animate"
                                exit="exit"
                                transition={{ duration: 0.15, ease: "easeOut" }}
                                className="fixed z-[201] flex flex-col items-center gap-2"
                                style={{
                                    left: position.x,
                                    [position.showAbove ? 'bottom' : 'top']: position.showAbove 
                                        ? `calc(100vh - ${position.y}px)` 
                                        : position.y,
                                    transform: "translateX(-50%)",
                                    willChange: "transform, opacity",
                                }}
                            >
                            {/* Emoji Reactions */}
                            <div className="flex items-center gap-1 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-full px-2 py-1.5 shadow-2xl">
                                {reactions.map((emoji) => (
                                    <button
                                        key={emoji}
                                        onClick={() => handleReactionSelect(emoji)}
                                        className="w-12 h-12 flex items-center justify-center text-2xl hover:bg-zinc-700 hover:scale-110 active:scale-115 active:bg-zinc-600 rounded-full transition-all duration-100"
                                    >
                                        {emoji}
                                    </button>
                                ))}
                            </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-0.5 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-xl px-1 py-1 shadow-2xl">
                                    {onReply && (
                                        <button
                                            onClick={() => handleAction(onReply)}
                                            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                            </svg>
                                            Reply
                                        </button>
                                    )}
                                    {onCopy && (
                                        <button
                                            onClick={() => handleAction(onCopy)}
                                            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                            Copy
                                        </button>
                                    )}
                                    {onForward && (
                                        <button
                                            onClick={() => handleAction(onForward)}
                                            className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4-4m0 0l-4-4m4 4H7a4 4 0 100 8h2" />
                                            </svg>
                                            Forward
                                        </button>
                                    )}
                                    {isOwn && onDelete && (
                                        <button
                                            onClick={() => handleAction(onDelete)}
                                            className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                            Delete
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
