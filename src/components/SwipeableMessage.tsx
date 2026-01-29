"use client";

import { useState, useRef, useCallback } from "react";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";

type SwipeableMessageProps = {
    children: React.ReactNode;
    onSwipeLeft?: () => void;  // Delete/archive
    onSwipeRight?: () => void; // Reply
    leftAction?: React.ReactNode;
    rightAction?: React.ReactNode;
    leftColor?: string;
    rightColor?: string;
    disabled?: boolean;
    threshold?: number;
};

export function SwipeableMessage({
    children,
    onSwipeLeft,
    onSwipeRight,
    leftAction = (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
    ),
    rightAction = (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
    ),
    leftColor = "bg-blue-500",
    rightColor = "bg-red-500",
    disabled = false,
    threshold = 80,
}: SwipeableMessageProps) {
    const x = useMotionValue(0);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Transform for action icons opacity and scale
    const leftOpacity = useTransform(x, [0, threshold / 2, threshold], [0, 0.5, 1]);
    const leftScale = useTransform(x, [0, threshold / 2, threshold], [0.5, 0.8, 1]);
    const rightOpacity = useTransform(x, [-threshold, -threshold / 2, 0], [1, 0.5, 0]);
    const rightScale = useTransform(x, [-threshold, -threshold / 2, 0], [1, 0.8, 0.5]);

    const handleDragEnd = useCallback(
        (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
            const { offset } = info;
            
            if (offset.x > threshold && onSwipeRight) {
                onSwipeRight();
            } else if (offset.x < -threshold && onSwipeLeft) {
                onSwipeLeft();
            }
            
            setIsDragging(false);
        },
        [threshold, onSwipeLeft, onSwipeRight]
    );

    if (disabled) {
        return <>{children}</>;
    }

    return (
        <div ref={containerRef} className="relative overflow-hidden">
            {/* Left action (reply) - appears when swiping right */}
            <motion.div
                className={`absolute left-0 top-0 bottom-0 flex items-center justify-center w-16 ${leftColor} text-white`}
                style={{ opacity: leftOpacity }}
            >
                <motion.div style={{ scale: leftScale }}>
                    {leftAction}
                </motion.div>
            </motion.div>

            {/* Right action (delete) - appears when swiping left */}
            <motion.div
                className={`absolute right-0 top-0 bottom-0 flex items-center justify-center w-16 ${rightColor} text-white`}
                style={{ opacity: rightOpacity }}
            >
                <motion.div style={{ scale: rightScale }}>
                    {rightAction}
                </motion.div>
            </motion.div>

            {/* Draggable content */}
            <motion.div
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragStart={() => setIsDragging(true)}
                onDragEnd={handleDragEnd}
                style={{ x }}
                className={`relative z-10 ${isDragging ? "cursor-grabbing" : ""}`}
                whileTap={{ cursor: "grabbing" }}
            >
                {children}
            </motion.div>
        </div>
    );
}
