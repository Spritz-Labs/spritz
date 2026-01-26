"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

type ScrollToBottomProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    unreadCount?: number;
    className?: string;
    onScrollToBottom?: () => void;
};

export function ScrollToBottom({
    containerRef,
    unreadCount = 0,
    className = "",
    onScrollToBottom,
}: ScrollToBottomProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [isAtBottom, setIsAtBottom] = useState(true);

    // Check if user is near bottom of scroll
    const checkScrollPosition = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        const threshold = 150; // Show button when more than 150px from bottom

        setIsAtBottom(distanceFromBottom < threshold);
        setIsVisible(distanceFromBottom > threshold);
    }, [containerRef]);

    // Add scroll listener
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.addEventListener("scroll", checkScrollPosition, { passive: true });
        checkScrollPosition(); // Initial check

        return () => {
            container.removeEventListener("scroll", checkScrollPosition);
        };
    }, [containerRef, checkScrollPosition]);

    // Scroll to bottom with smooth animation
    const scrollToBottom = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        container.scrollTo({
            top: container.scrollHeight,
            behavior: "smooth",
        });

        onScrollToBottom?.();
    }, [containerRef, onScrollToBottom]);

    // Trigger haptic feedback on mobile
    const handleClick = () => {
        if (navigator.vibrate) {
            navigator.vibrate(10);
        }
        scrollToBottom();
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.button
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: 20 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    onClick={handleClick}
                    className={`
                        fixed bottom-24 right-6 z-40
                        w-12 h-12 rounded-full
                        bg-zinc-800/90 backdrop-blur-sm
                        border border-zinc-700
                        shadow-lg shadow-black/20
                        flex items-center justify-center
                        hover:bg-zinc-700 active:scale-95
                        transition-colors touch-manipulation
                        ${className}
                    `}
                    aria-label={unreadCount > 0 ? `${unreadCount} new messages, scroll to bottom` : "Scroll to bottom"}
                >
                    {/* Unread badge */}
                    <AnimatePresence>
                        {unreadCount > 0 && (
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0 }}
                                className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#FF5500] text-white text-xs font-bold flex items-center justify-center shadow-lg"
                            >
                                {unreadCount > 99 ? "99+" : unreadCount}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Arrow icon */}
                    <motion.svg
                        animate={{ y: [0, 3, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        className="w-5 h-5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </motion.svg>
                </motion.button>
            )}
        </AnimatePresence>
    );
}

// Hook to manage scroll state and unread count
export function useScrollToBottom(containerRef: React.RefObject<HTMLDivElement | null>) {
    const [newMessageCount, setNewMessageCount] = useState(0);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const lastScrollTopRef = useRef(0);

    // Track if user is at bottom
    const checkIfAtBottom = useCallback(() => {
        const container = containerRef.current;
        if (!container) return true;

        const { scrollTop, scrollHeight, clientHeight } = container;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        return distanceFromBottom < 150;
    }, [containerRef]);

    // Update bottom state on scroll
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleScroll = () => {
            const atBottom = checkIfAtBottom();
            setIsAtBottom(atBottom);
            
            // Clear unread count when scrolled to bottom
            if (atBottom) {
                setNewMessageCount(0);
            }
            
            lastScrollTopRef.current = container.scrollTop;
        };

        container.addEventListener("scroll", handleScroll, { passive: true });
        return () => container.removeEventListener("scroll", handleScroll);
    }, [containerRef, checkIfAtBottom]);

    // Increment unread count when new message arrives while not at bottom
    const onNewMessage = useCallback(() => {
        if (!isAtBottom) {
            setNewMessageCount((prev) => prev + 1);
        }
    }, [isAtBottom]);

    // Reset unread count
    const resetUnreadCount = useCallback(() => {
        setNewMessageCount(0);
    }, []);

    // Auto-scroll to bottom (for initial load or when sending)
    const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
        const container = containerRef.current;
        if (!container) return;

        container.scrollTo({
            top: container.scrollHeight,
            behavior,
        });
        setNewMessageCount(0);
    }, [containerRef]);

    return {
        newMessageCount,
        isAtBottom,
        onNewMessage,
        resetUnreadCount,
        scrollToBottom,
    };
}
