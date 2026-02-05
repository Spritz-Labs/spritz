"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";

type ImageViewerModalProps = {
    isOpen: boolean;
    onClose: () => void;
    imageUrl: string;
    alt?: string;
};

export function ImageViewerModal({
    isOpen,
    onClose,
    imageUrl,
    alt = "Image",
}: ImageViewerModalProps) {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const lastTouchDistance = useRef<number | null>(null);
    const lastTouchCenter = useRef<{ x: number; y: number } | null>(null);
    const dragStart = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);

    // Reset state when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setScale(1);
            setPosition({ x: 0, y: 0 });
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleEscape);
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", handleEscape);
            document.body.style.overflow = "";
        };
    }, [isOpen, onClose]);

    // Get distance between two touch points
    const getTouchDistance = (touches: React.TouchList) => {
        if (touches.length < 2) return null;
        const t0 = touches[0];
        const t1 = touches[1];
        const dx = t0.clientX - t1.clientX;
        const dy = t0.clientY - t1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    };

    // Get center point between two touches
    const getTouchCenter = (touches: React.TouchList) => {
        if (touches.length < 2) return null;
        const t0 = touches[0];
        const t1 = touches[1];
        return {
            x: (t0.clientX + t1.clientX) / 2,
            y: (t0.clientY + t1.clientY) / 2,
        };
    };

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            // Pinch start
            e.preventDefault();
            lastTouchDistance.current = getTouchDistance(e.touches);
            lastTouchCenter.current = getTouchCenter(e.touches);
        } else if (e.touches.length === 1 && scale > 1) {
            // Pan start (only when zoomed)
            dragStart.current = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
                posX: position.x,
                posY: position.y,
            };
            setIsDragging(true);
        }
    }, [scale, position]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (e.touches.length === 2 && lastTouchDistance.current !== null) {
            // Pinch to zoom
            e.preventDefault();
            const newDistance = getTouchDistance(e.touches);
            if (newDistance) {
                const delta = newDistance / lastTouchDistance.current;
                const newScale = Math.min(Math.max(scale * delta, 1), 5);
                setScale(newScale);
                lastTouchDistance.current = newDistance;

                // Reset position if zooming back to 1
                if (newScale <= 1) {
                    setPosition({ x: 0, y: 0 });
                }
            }
        } else if (e.touches.length === 1 && isDragging && dragStart.current && scale > 1) {
            // Pan
            const dx = e.touches[0].clientX - dragStart.current.x;
            const dy = e.touches[0].clientY - dragStart.current.y;
            setPosition({
                x: dragStart.current.posX + dx,
                y: dragStart.current.posY + dy,
            });
        }
    }, [scale, isDragging]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        if (e.touches.length < 2) {
            lastTouchDistance.current = null;
            lastTouchCenter.current = null;
        }
        if (e.touches.length === 0) {
            setIsDragging(false);
            dragStart.current = null;
        }
    }, []);

    // Double tap to zoom
    const lastTap = useRef<number>(0);
    const handleDoubleTap = useCallback((e: React.TouchEvent) => {
        const now = Date.now();
        if (now - lastTap.current < 300) {
            // Double tap detected
            e.preventDefault();
            if (scale > 1) {
                setScale(1);
                setPosition({ x: 0, y: 0 });
            } else {
                setScale(2.5);
            }
        }
        lastTap.current = now;
    }, [scale]);

    // Mouse wheel zoom for desktop
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.min(Math.max(scale * delta, 1), 5);
        setScale(newScale);
        if (newScale <= 1) {
            setPosition({ x: 0, y: 0 });
        }
    }, [scale]);

    // Mouse drag for desktop
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (scale > 1) {
            e.preventDefault();
            dragStart.current = {
                x: e.clientX,
                y: e.clientY,
                posX: position.x,
                posY: position.y,
            };
            setIsDragging(true);
        }
    }, [scale, position]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isDragging && dragStart.current && scale > 1) {
            const dx = e.clientX - dragStart.current.x;
            const dy = e.clientY - dragStart.current.y;
            setPosition({
                x: dragStart.current.posX + dx,
                y: dragStart.current.posY + dy,
            });
        }
    }, [isDragging, scale]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        dragStart.current = null;
    }, []);

    // Handle backdrop click (close only if not zoomed/dragging)
    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (e.target === containerRef.current && scale === 1 && !isDragging) {
            onClose();
        }
    }, [scale, isDragging, onClose]);

    if (!isOpen || typeof document === "undefined") return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    ref={containerRef}
                    className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
                    style={{
                        paddingTop: "env(safe-area-inset-top, 0px)",
                        paddingBottom: "env(safe-area-inset-bottom, 0px)",
                        paddingLeft: "env(safe-area-inset-left, 0px)",
                        paddingRight: "env(safe-area-inset-right, 0px)",
                    }}
                    onClick={handleBackdropClick}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    role="dialog"
                    aria-modal="true"
                    aria-label="View image"
                >
                    {/* Header with close and download buttons */}
                    <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-3 sm:p-4 z-10 bg-gradient-to-b from-black/50 to-transparent"
                        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
                    >
                        <div className="text-white/70 text-sm">
                            {scale > 1 && (
                                <span className="bg-black/50 px-2 py-1 rounded">
                                    {Math.round(scale * 100)}%
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <a
                                href={imageUrl}
                                download="image.png"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                                aria-label="Download"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                            </a>
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                                aria-label="Close"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Zoom hint for mobile */}
                    {scale === 1 && (
                        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 text-white/50 text-xs bg-black/50 px-3 py-1.5 rounded-full pointer-events-none sm:hidden">
                            Pinch to zoom • Double-tap to zoom
                        </div>
                    )}

                    {/* Image container */}
                    <div
                        className="w-full h-full flex items-center justify-center overflow-hidden"
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onTouchCancel={handleTouchEnd}
                        onClick={handleDoubleTap as unknown as React.MouseEventHandler}
                        onWheel={handleWheel}
                        style={{ touchAction: "none" }}
                    >
                        <motion.img
                            ref={imageRef}
                            src={imageUrl}
                            alt={alt}
                            className="max-w-full max-h-full object-contain select-none"
                            style={{
                                transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                                cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "default",
                                transition: isDragging ? "none" : "transform 0.1s ease-out",
                            }}
                            onMouseDown={handleMouseDown}
                            draggable={false}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                        />
                    </div>

                    {/* Reset zoom button (shown when zoomed) */}
                    {scale > 1 && (
                        <button
                            type="button"
                            onClick={() => {
                                setScale(1);
                                setPosition({ x: 0, y: 0 });
                            }}
                            className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
                            style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
                        >
                            Reset zoom
                        </button>
                    )}
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
