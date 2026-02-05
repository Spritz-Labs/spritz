"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";

type EncryptedImageProps = {
    encryptedUrl: string;
    mimeType: string;
    isOwn: boolean;
    encryptionKey: Uint8Array | null;
    onDecryptError?: (error: Error) => void;
    onClick?: () => void; // For opening in a lightbox
};

export function EncryptedImage({
    encryptedUrl,
    mimeType,
    isOwn,
    encryptionKey,
    onDecryptError,
    onClick,
}: EncryptedImageProps) {
    const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [decryptError, setDecryptError] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const hasAttemptedDecrypt = useRef(false);

    // Cleanup blob URL on unmount
    useEffect(() => {
        return () => {
            if (decryptedUrl) {
                URL.revokeObjectURL(decryptedUrl);
            }
        };
    }, [decryptedUrl]);

    // Auto-decrypt when key becomes available
    const decryptImage = useCallback(async () => {
        if (!encryptionKey || hasAttemptedDecrypt.current) return;
        
        hasAttemptedDecrypt.current = true;
        setIsDecrypting(true);
        setDecryptError(false);

        try {
            // Dynamic import to avoid bundling crypto code unnecessarily
            const { fetchAndDecryptImage } = await import("@/lib/audioEncryption");
            const blobUrl = await fetchAndDecryptImage(encryptedUrl, encryptionKey, mimeType);
            setDecryptedUrl(blobUrl);
        } catch (error) {
            console.error("[EncryptedImage] Decryption failed:", error);
            setDecryptError(true);
            onDecryptError?.(error as Error);
        } finally {
            setIsDecrypting(false);
        }
    }, [encryptionKey, encryptedUrl, mimeType, onDecryptError]);

    // Start decryption when key is available
    useEffect(() => {
        if (encryptionKey && !decryptedUrl && !hasAttemptedDecrypt.current) {
            decryptImage();
        }
    }, [encryptionKey, decryptedUrl, decryptImage]);

    const handleImageLoad = () => {
        setIsLoading(false);
    };

    const handleImageError = () => {
        setIsLoading(false);
        setDecryptError(true);
    };

    // Show placeholder while waiting for key or decrypting
    if (!encryptionKey || isDecrypting) {
        return (
            <div 
                className={`relative rounded-lg overflow-hidden ${
                    isOwn ? "bg-white/10" : "bg-zinc-700/50"
                }`}
                style={{ width: 200, height: 150 }}
            >
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <div className="w-8 h-8 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <span>Decrypting...</span>
                    </div>
                </div>
            </div>
        );
    }

    // Show error state
    if (decryptError) {
        return (
            <div 
                className={`relative rounded-lg overflow-hidden ${
                    isOwn ? "bg-red-500/20" : "bg-red-500/10"
                }`}
                style={{ width: 200, height: 100 }}
            >
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-red-400">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="text-xs">Failed to decrypt</span>
                    <button
                        onClick={() => {
                            hasAttemptedDecrypt.current = false;
                            setDecryptError(false);
                            decryptImage();
                        }}
                        className="text-xs px-2 py-1 bg-red-500/30 hover:bg-red-500/50 rounded transition-colors"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    // Show decrypted image
    return (
        <div 
            className="relative rounded-lg overflow-hidden cursor-pointer group"
            onClick={onClick}
        >
            {/* Loading shimmer while image loads */}
            <AnimatePresence>
                {isLoading && (
                    <motion.div
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className={`absolute inset-0 ${
                            isOwn ? "bg-white/10" : "bg-zinc-700/50"
                        }`}
                        style={{ width: 200, height: 150 }}
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
                    </motion.div>
                )}
            </AnimatePresence>
            
            {decryptedUrl && (
                <img
                    src={decryptedUrl}
                    alt="Encrypted image"
                    className="max-w-[200px] sm:max-w-[280px] max-h-[300px] object-contain rounded-lg"
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                />
            )}
            
            {/* Encrypted badge */}
            <div className="absolute bottom-1 right-1 flex items-center gap-1 px-1.5 py-0.5 bg-black/50 rounded text-[10px] text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Encrypted</span>
            </div>
        </div>
    );
}

// Wrapper component that fetches the encryption key from context
type EncryptedImageWrapperProps = {
    encryptedUrl: string;
    mimeType: string;
    isOwn: boolean;
    peerAddress: string;
    onClick?: () => void;
};

export function EncryptedImageWrapper({
    encryptedUrl,
    mimeType,
    isOwn,
    peerAddress,
    onClick,
}: EncryptedImageWrapperProps) {
    // Note: This component should be used inside a component that has access to useXMTPContext
    // The actual key fetching happens in the parent (ChatModal)
    // This is just exported for potential standalone use
    return (
        <div className="text-zinc-400 text-sm">
            Loading encrypted image...
        </div>
    );
}
