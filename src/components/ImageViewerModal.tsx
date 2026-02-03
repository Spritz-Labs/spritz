"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

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

    if (!isOpen || typeof document === "undefined") return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="View image"
        >
            <button
                type="button"
                onClick={onClose}
                className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
                aria-label="Close"
            >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
            <img
                src={imageUrl}
                alt={alt}
                className="max-w-full max-h-[calc(100vh-2rem)] w-auto h-auto object-contain"
                onClick={(e) => e.stopPropagation()}
                draggable={false}
            />
        </div>,
        document.body
    );
}
