"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    motion,
    AnimatePresence,
    PanInfo,
    useMotionValue,
    useTransform,
} from "framer-motion";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatTimestamp, formatDateInTimezone } from "@/lib/timezone";

type GalleryImage = {
    id: string;
    url: string;
    thumbnail?: string;
    caption?: string;
    sender?: string;
    timestamp?: Date;
};

type ImageGalleryProps = {
    images: GalleryImage[];
    initialIndex?: number;
    isOpen: boolean;
    onClose: () => void;
    onDownload?: (image: GalleryImage) => void;
    onShare?: (image: GalleryImage) => void;
};

export function ImageGallery({
    images,
    initialIndex = 0,
    isOpen,
    onClose,
    onDownload,
    onShare,
}: ImageGalleryProps) {
    const userTimezone = useUserTimezone();
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [isZoomed, setIsZoomed] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const x = useMotionValue(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // Scale transform based on vertical drag (for dismiss)
    const scale = useTransform(x, [-200, 0, 200], [0.8, 1, 0.8]);
    const opacity = useTransform(x, [-200, 0, 200], [0.5, 1, 0.5]);

    // Reset to initial index when opening
    useEffect(() => {
        if (isOpen) {
            setCurrentIndex(initialIndex);
            setIsZoomed(false);
            setShowControls(true);
        }
    }, [isOpen, initialIndex]);

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case "ArrowLeft":
                    goToPrevious();
                    break;
                case "ArrowRight":
                    goToNext();
                    break;
                case "Escape":
                    onClose();
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, currentIndex, images.length]);

    // Auto-hide controls
    const resetControlsTimeout = useCallback(() => {
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }
        setShowControls(true);
        controlsTimeoutRef.current = setTimeout(() => {
            setShowControls(false);
        }, 3000);
    }, []);

    const goToPrevious = useCallback(() => {
        if (currentIndex > 0) {
            setCurrentIndex((prev) => prev - 1);
            resetControlsTimeout();
        }
    }, [currentIndex, resetControlsTimeout]);

    const goToNext = useCallback(() => {
        if (currentIndex < images.length - 1) {
            setCurrentIndex((prev) => prev + 1);
            resetControlsTimeout();
        }
    }, [currentIndex, images.length, resetControlsTimeout]);

    // Handle swipe gesture
    const handleDragEnd = useCallback(
        (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
            const { offset, velocity } = info;
            const swipeThreshold = 50;
            const velocityThreshold = 500;

            // Horizontal swipe for navigation
            if (Math.abs(offset.x) > Math.abs(offset.y)) {
                if (
                    offset.x > swipeThreshold ||
                    velocity.x > velocityThreshold
                ) {
                    goToPrevious();
                } else if (
                    offset.x < -swipeThreshold ||
                    velocity.x < -velocityThreshold
                ) {
                    goToNext();
                }
            }
            // Vertical swipe for dismiss
            else if (Math.abs(offset.y) > 100) {
                onClose();
            }
        },
        [goToPrevious, goToNext, onClose]
    );

    const handleTap = useCallback(() => {
        setShowControls((prev) => !prev);
        if (!showControls) {
            resetControlsTimeout();
        }
    }, [showControls, resetControlsTimeout]);

    const handleDownload = useCallback(() => {
        const image = images[currentIndex];
        if (onDownload) {
            onDownload(image);
        } else {
            // Default download behavior
            const link = document.createElement("a");
            link.href = image.url;
            link.download = `image-${image.id}.jpg`;
            link.click();
        }
    }, [currentIndex, images, onDownload]);

    const handleShare = useCallback(async () => {
        const image = images[currentIndex];
        if (onShare) {
            onShare(image);
        } else if (navigator.share) {
            try {
                await navigator.share({
                    title: "Shared Image",
                    url: image.url,
                });
            } catch {
                // User cancelled or share failed
            }
        }
    }, [currentIndex, images, onShare]);

    if (!images.length) return null;

    const currentImage = images[currentIndex];

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] bg-black"
                    onClick={handleTap}
                >
                    {/* Header controls */}
                    <AnimatePresence>
                        {showControls && (
                            <motion.div
                                initial={{ opacity: 0, y: -20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/70 to-transparent p-4 safe-area-inset-top"
                            >
                                <div className="flex items-center justify-between">
                                    {/* Close button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onClose();
                                        }}
                                        className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                                    >
                                        <svg
                                            className="w-6 h-6 text-white"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M6 18L18 6M6 6l12 12"
                                            />
                                        </svg>
                                    </button>

                                    {/* Counter */}
                                    <div className="text-white/90 text-sm font-medium">
                                        {currentIndex + 1} / {images.length}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDownload();
                                            }}
                                            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                                        >
                                            <svg
                                                className="w-5 h-5 text-white"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                strokeWidth={2}
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                                />
                                            </svg>
                                        </button>
                                        {"share" in navigator && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleShare();
                                                }}
                                                className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                                            >
                                                <svg
                                                    className="w-5 h-5 text-white"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                    strokeWidth={2}
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                                                    />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Main image area */}
                    <motion.div
                        ref={containerRef}
                        className="absolute inset-0 flex items-center justify-center"
                        drag={!isZoomed ? "x" : false}
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.2}
                        onDragEnd={handleDragEnd}
                        style={{ x, scale, opacity }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <AnimatePresence mode="wait">
                            <motion.img
                                key={currentImage.id}
                                src={currentImage.url}
                                alt={currentImage.caption || "Image"}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.2 }}
                                className="max-w-full max-h-full object-contain select-none"
                                draggable={false}
                                onDoubleClick={() => setIsZoomed(!isZoomed)}
                            />
                        </AnimatePresence>
                    </motion.div>

                    {/* Navigation arrows (desktop) */}
                    <AnimatePresence>
                        {showControls && images.length > 1 && (
                            <>
                                {currentIndex > 0 && (
                                    <motion.button
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            goToPrevious();
                                        }}
                                        className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                                    >
                                        <svg
                                            className="w-6 h-6 text-white"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M15 19l-7-7 7-7"
                                            />
                                        </svg>
                                    </motion.button>
                                )}
                                {currentIndex < images.length - 1 && (
                                    <motion.button
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            goToNext();
                                        }}
                                        className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                                    >
                                        <svg
                                            className="w-6 h-6 text-white"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M9 5l7 7-7 7"
                                            />
                                        </svg>
                                    </motion.button>
                                )}
                            </>
                        )}
                    </AnimatePresence>

                    {/* Bottom info & dots */}
                    <AnimatePresence>
                        {showControls && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 20 }}
                                className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/70 to-transparent p-4 pb-8 safe-area-inset-bottom"
                            >
                                {/* Caption */}
                                {currentImage.caption && (
                                    <p className="text-white/90 text-sm text-center mb-3 max-w-md mx-auto">
                                        {currentImage.caption}
                                    </p>
                                )}

                                {/* Sender & time */}
                                {(currentImage.sender ||
                                    currentImage.timestamp) && (
                                    <div className="text-white/60 text-xs text-center mb-3">
                                        {currentImage.sender && (
                                            <span>{currentImage.sender}</span>
                                        )}
                                        {currentImage.sender &&
                                            currentImage.timestamp && (
                                                <span> · </span>
                                            )}
                                        {currentImage.timestamp && (
                                            <span>
                                                {formatDateInTimezone(
                                                    currentImage.timestamp,
                                                    userTimezone,
                                                    "short"
                                                )}{" "}
                                                {formatTimestamp(
                                                    currentImage.timestamp,
                                                    userTimezone
                                                )}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Dot indicators */}
                                {images.length > 1 && images.length <= 10 && (
                                    <div className="flex justify-center gap-1.5">
                                        {images.map((_, index) => (
                                            <button
                                                key={index}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setCurrentIndex(index);
                                                }}
                                                className={`w-2 h-2 rounded-full transition-all ${
                                                    index === currentIndex
                                                        ? "bg-white scale-125"
                                                        : "bg-white/40 hover:bg-white/60"
                                                }`}
                                            />
                                        ))}
                                    </div>
                                )}

                                {/* Swipe hint (mobile) */}
                                <p className="md:hidden text-white/40 text-xs text-center mt-3">
                                    Swipe to navigate · Swipe down to close
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// Hook to extract images from messages and manage gallery state
export function useImageGallery() {
    const [galleryState, setGalleryState] = useState<{
        isOpen: boolean;
        images: GalleryImage[];
        initialIndex: number;
    }>({
        isOpen: false,
        images: [],
        initialIndex: 0,
    });

    const openGallery = useCallback(
        (images: GalleryImage[], initialIndex = 0) => {
            setGalleryState({
                isOpen: true,
                images,
                initialIndex,
            });
        },
        []
    );

    const closeGallery = useCallback(() => {
        setGalleryState((prev) => ({ ...prev, isOpen: false }));
    }, []);

    return {
        ...galleryState,
        openGallery,
        closeGallery,
    };
}

// Helper to extract image URLs from messages
export function extractImagesFromMessages(
    messages: Array<{
        id: string;
        content: string;
        senderAddress: string;
        sentAt: Date;
    }>,
    getSenderName?: (address: string) => string
): GalleryImage[] {
    const imageRegex = /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp)/gi;
    const ipfsImageRegex = /ipfs:\/\/[^\s]+/gi;

    const images: GalleryImage[] = [];

    messages.forEach((msg) => {
        // Check for regular image URLs
        const urls = msg.content.match(imageRegex) || [];
        // Check for IPFS URLs
        const ipfsUrls = (msg.content.match(ipfsImageRegex) || []).map((url) =>
            url.replace("ipfs://", "https://ipfs.io/ipfs/")
        );

        [...urls, ...ipfsUrls].forEach((url) => {
            images.push({
                id: `${msg.id}-${url}`,
                url,
                sender: getSenderName
                    ? getSenderName(msg.senderAddress)
                    : msg.senderAddress.slice(0, 8),
                timestamp: msg.sentAt,
            });
        });
    });

    return images;
}
