"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";

type PullToRefreshProps = {
    children: React.ReactNode;
    onRefresh: () => Promise<void>;
    pullThreshold?: number;
    disabled?: boolean;
    className?: string;
};

export function PullToRefresh({
    children,
    onRefresh,
    pullThreshold = 80,
    disabled = false,
    className = "",
}: PullToRefreshProps) {
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isPulling, setIsPulling] = useState(false);
    const pullDistance = useMotionValue(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const startY = useRef(0);
    const currentY = useRef(0);

    // Transform for the indicator
    const indicatorOpacity = useTransform(pullDistance, [0, pullThreshold / 2, pullThreshold], [0, 0.5, 1]);
    const indicatorRotation = useTransform(pullDistance, [0, pullThreshold], [0, 180]);
    const indicatorScale = useTransform(pullDistance, [0, pullThreshold / 2, pullThreshold], [0.5, 0.8, 1]);

    const handleTouchStart = useCallback((e: TouchEvent) => {
        if (disabled || isRefreshing) return;
        
        const container = containerRef.current;
        if (!container) return;
        
        // Only trigger if scrolled to top
        if (container.scrollTop <= 0) {
            startY.current = e.touches[0].clientY;
            setIsPulling(true);
        }
    }, [disabled, isRefreshing]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        if (!isPulling || disabled || isRefreshing) return;
        
        currentY.current = e.touches[0].clientY;
        const distance = Math.max(0, (currentY.current - startY.current) * 0.5); // Resistance factor
        pullDistance.set(Math.min(distance, pullThreshold * 1.5));
        
        // Prevent default scrolling when pulling
        if (distance > 10) {
            e.preventDefault();
        }
    }, [isPulling, disabled, isRefreshing, pullDistance, pullThreshold]);

    const handleTouchEnd = useCallback(async () => {
        if (!isPulling) return;
        
        setIsPulling(false);
        const distance = pullDistance.get();
        
        if (distance >= pullThreshold && !isRefreshing) {
            setIsRefreshing(true);
            
            // Haptic feedback
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
            
            try {
                await onRefresh();
            } catch (error) {
                console.error("Refresh failed:", error);
            } finally {
                setIsRefreshing(false);
                pullDistance.set(0);
            }
        } else {
            pullDistance.set(0);
        }
    }, [isPulling, pullDistance, pullThreshold, isRefreshing, onRefresh]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        container.addEventListener("touchstart", handleTouchStart, { passive: true });
        container.addEventListener("touchmove", handleTouchMove, { passive: false });
        container.addEventListener("touchend", handleTouchEnd);

        return () => {
            container.removeEventListener("touchstart", handleTouchStart);
            container.removeEventListener("touchmove", handleTouchMove);
            container.removeEventListener("touchend", handleTouchEnd);
        };
    }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

    return (
        <div className={`relative ${className}`}>
            {/* Pull indicator */}
            <motion.div
                className="absolute left-0 right-0 top-0 flex justify-center items-center pointer-events-none z-10"
                style={{
                    height: pullDistance,
                    opacity: indicatorOpacity,
                }}
            >
                {isRefreshing ? (
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-6 h-6 border-2 border-[#FF5500] border-t-transparent rounded-full"
                    />
                ) : (
                    <motion.svg
                        style={{ rotate: indicatorRotation, scale: indicatorScale }}
                        className="w-6 h-6 text-[#FF5500]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 14l-7 7m0 0l-7-7m7 7V3"
                        />
                    </motion.svg>
                )}
            </motion.div>

            {/* Content container */}
            <motion.div
                ref={containerRef}
                style={{ y: isRefreshing ? 40 : pullDistance }}
                className="h-full overflow-auto"
            >
                {children}
            </motion.div>
        </div>
    );
}
