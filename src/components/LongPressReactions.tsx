"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type LongPressReactionsProps = {
    children: React.ReactNode;
    reactions?: string[];
    onReaction: (emoji: string) => void;
    onReply?: () => void;
    onCopy?: () => void;
    onDelete?: () => void;
    isOwn?: boolean;
    disabled?: boolean;
    longPressDuration?: number;
};

const DEFAULT_REACTIONS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];

export function LongPressReactions({
    children,
    reactions = DEFAULT_REACTIONS,
    onReaction,
    onReply,
    onCopy,
    onDelete,
    isOwn = false,
    disabled = false,
    longPressDuration = 500,
}: LongPressReactionsProps) {
    const [showReactions, setShowReactions] = useState(false);
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isLongPressRef = useRef(false);

    const handleStart = useCallback(
        (clientX: number, clientY: number) => {
            if (disabled) return;

            isLongPressRef.current = false;
            longPressTimerRef.current = setTimeout(() => {
                isLongPressRef.current = true;
                
                // Calculate position relative to viewport
                const rect = containerRef.current?.getBoundingClientRect();
                if (rect) {
                    // Position the reaction bar above the touch point
                    let x = clientX;
                    let y = rect.top - 60; // 60px above the message
                    
                    // Keep within viewport bounds
                    const barWidth = 280; // Approximate width of reaction bar
                    if (x - barWidth / 2 < 10) x = barWidth / 2 + 10;
                    if (x + barWidth / 2 > window.innerWidth - 10) x = window.innerWidth - barWidth / 2 - 10;
                    if (y < 10) y = rect.bottom + 10; // Show below if not enough space above
                    
                    setPosition({ x, y });
                    setShowReactions(true);
                    
                    // Haptic feedback
                    if (navigator.vibrate) {
                        navigator.vibrate(50);
                    }
                }
            }, longPressDuration);
        },
        [disabled, longPressDuration]
    );

    const handleEnd = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    const handleTouchStart = useCallback(
        (e: React.TouchEvent) => {
            const touch = e.touches[0];
            handleStart(touch.clientX, touch.clientY);
        },
        [handleStart]
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
            
            // Haptic feedback
            if (navigator.vibrate) {
                navigator.vibrate(30);
            }
        },
        [onReaction]
    );

    const handleAction = useCallback(
        (action: (() => void) | undefined) => {
            if (action) {
                action();
                setShowReactions(false);
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

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("touchstart", handleClickOutside);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("touchstart", handleClickOutside);
        };
    }, [showReactions]);

    // Cleanup timer on unmount
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
                onTouchEnd={handleEnd}
                onTouchCancel={handleEnd}
                onMouseDown={handleMouseDown}
                onMouseUp={handleEnd}
                onMouseLeave={handleEnd}
                className="select-none"
            >
                {children}
            </div>

            {/* Reaction Bar Overlay */}
            <AnimatePresence>
                {showReactions && position && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/40 z-[200]"
                            onClick={() => setShowReactions(false)}
                        />

                        {/* Reaction Bar */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.8, y: 10 }}
                            transition={{ type: "spring", damping: 25, stiffness: 400 }}
                            className="fixed z-[201] flex flex-col items-center gap-2"
                            style={{
                                left: position.x,
                                top: position.y,
                                transform: "translateX(-50%)",
                            }}
                        >
                            {/* Emoji Reactions */}
                            <div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-full px-2 py-1.5 shadow-xl">
                                {reactions.map((emoji, index) => (
                                    <motion.button
                                        key={emoji}
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ delay: index * 0.03 }}
                                        onClick={() => handleReactionSelect(emoji)}
                                        className="w-10 h-10 flex items-center justify-center text-2xl hover:bg-zinc-700 rounded-full transition-colors active:scale-125"
                                        whileHover={{ scale: 1.2 }}
                                        whileTap={{ scale: 1.3 }}
                                    >
                                        {emoji}
                                    </motion.button>
                                ))}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-xl px-2 py-1 shadow-xl">
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
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
