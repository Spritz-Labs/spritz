"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { type Address } from "viem";

interface QRCodeModalProps {
    isOpen: boolean;
    onClose: () => void;
    address: Address;
    ensName: string | null;
    reachUsername: string | null;
    avatar: string | null;
}

export function QRCodeModal({
    isOpen,
    onClose,
    address,
    ensName,
    reachUsername,
    avatar,
}: QRCodeModalProps) {
    const qrContainerRef = useRef<HTMLDivElement>(null);
    const [copied, setCopied] = useState(false);

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (isOpen) {
            document.addEventListener("keydown", handleEscape);
        }
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isOpen, onClose]);

    const displayName =
        reachUsername ||
        ensName ||
        `${address.slice(0, 6)}...${address.slice(-4)}`;

    // The QR code contains the wallet address - simple and reliable
    const qrValue = address;

    // Share text
    const shareText = `Add me on Spritz! My wallet address: ${address}`;
    const shareUrl = `https://app.spritz.chat?add=${address}`;

    // Generate QR code as image blob
    const getQRImageBlob = useCallback(async (): Promise<Blob | null> => {
        if (!qrContainerRef.current) return null;

        const svg = qrContainerRef.current.querySelector("svg");
        if (!svg) return null;

        // Create canvas
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;

        // Set canvas size with padding
        const padding = 40;
        const size = 200 + padding * 2;
        canvas.width = size;
        canvas.height = size + 60; // Extra space for text

        // White background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw QR code
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], {
            type: "image/svg+xml;charset=utf-8",
        });
        const url = URL.createObjectURL(svgBlob);

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, padding, padding, 200, 200);
                URL.revokeObjectURL(url);

                // Add text below QR code
                ctx.fillStyle = "#000000";
                ctx.font = "bold 14px system-ui, sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(displayName, canvas.width / 2, size + 20);

                ctx.font = "12px monospace";
                ctx.fillStyle = "#666666";
                ctx.fillText(
                    `${address.slice(0, 12)}...${address.slice(-10)}`,
                    canvas.width / 2,
                    size + 40
                );

                canvas.toBlob((blob) => resolve(blob), "image/png", 1.0);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(null);
            };
            img.src = url;
        });
    }, [address, displayName]);

    // Download QR code
    const handleDownload = useCallback(async () => {
        const blob = await getQRImageBlob();
        if (!blob) return;

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `reach-qr-${displayName.replace(
            /[^a-zA-Z0-9]/g,
            "-"
        )}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [getQRImageBlob, displayName]);

    // Native share (mobile)
    const handleNativeShare = useCallback(async () => {
        const blob = await getQRImageBlob();

        if (navigator.share) {
            try {
                const shareData: ShareData = {
                    title: "Add me on Spritz",
                    text: shareText,
                };

                // Try to share with image if supported
                if (blob && navigator.canShare) {
                    const file = new File([blob], "reach-qr.png", {
                        type: "image/png",
                    });
                    const dataWithFile = { ...shareData, files: [file] };
                    if (navigator.canShare(dataWithFile)) {
                        await navigator.share(dataWithFile);
                        return;
                    }
                }

                // Fall back to text-only share
                await navigator.share(shareData);
            } catch {
                // User cancelled or share failed
            }
        }
    }, [getQRImageBlob, shareText]);

    // Copy address
    const handleCopyAddress = useCallback(async () => {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [address]);

    // Social share URLs
    const socialLinks = {
        twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(
            shareText
        )}`,
        telegram: `https://t.me/share/url?url=${encodeURIComponent(
            shareUrl
        )}&text=${encodeURIComponent(shareText)}`,
        whatsapp: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(
            shareText
        )}`,
    };

    const canNativeShare =
        typeof navigator !== "undefined" && !!navigator.share;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-semibold text-white">
                                My QR Code
                            </h2>
                            <button
                                onClick={onClose}
                                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}
                                    stroke="currentColor"
                                    className="w-5 h-5"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>

                        {/* QR Code */}
                        <div className="flex flex-col items-center">
                            <div
                                ref={qrContainerRef}
                                className="bg-white p-4 rounded-2xl mb-4"
                            >
                                <QRCodeSVG
                                    value={qrValue}
                                    size={200}
                                    level="H"
                                    includeMargin={false}
                                    bgColor="#ffffff"
                                    fgColor="#000000"
                                />
                            </div>

                            {/* User info */}
                            <div className="flex items-center gap-3 mb-4">
                                {avatar ? (
                                    <img
                                        src={avatar}
                                        alt={displayName}
                                        className="w-10 h-10 rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FB8D22] to-[#FF5500] flex items-center justify-center text-white font-bold text-sm">
                                        {displayName.slice(0, 2).toUpperCase()}
                                    </div>
                                )}
                                <div>
                                    <p className="text-white font-medium">
                                        {displayName}
                                    </p>
                                    <p className="text-zinc-500 text-xs font-mono">
                                        {address.slice(0, 10)}...
                                        {address.slice(-8)}
                                    </p>
                                </div>
                            </div>

                            <p className="text-zinc-500 text-sm text-center mb-6">
                                Have a friend scan this code to add you
                            </p>

                            {/* Action Buttons */}
                            <div className="w-full space-y-3">
                                {/* Download & Copy Row */}
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleDownload}
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-[#FF5500] hover:bg-[#E04D00] text-white rounded-xl font-medium transition-colors"
                                    >
                                        <svg
                                            className="w-5 h-5"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                            />
                                        </svg>
                                        Save Image
                                    </button>
                                    <button
                                        onClick={handleCopyAddress}
                                        className="flex items-center justify-center gap-2 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
                                    >
                                        {copied ? (
                                            <svg
                                                className="w-5 h-5 text-emerald-400"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M5 13l4 4L19 7"
                                                />
                                            </svg>
                                        ) : (
                                            <svg
                                                className="w-5 h-5"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                                />
                                            </svg>
                                        )}
                                    </button>
                                </div>

                                {/* Native Share (Mobile) */}
                                {canNativeShare && (
                                    <button
                                        onClick={handleNativeShare}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
                                    >
                                        <svg
                                            className="w-5 h-5"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                                            />
                                        </svg>
                                        Share
                                    </button>
                                )}

                                {/* Social Share Buttons */}
                                <div className="pt-2">
                                    <p className="text-zinc-500 text-xs text-center mb-3">
                                        Share on social
                                    </p>
                                    <div className="flex justify-center gap-3">
                                        {/* Twitter/X */}
                                        <a
                                            href={socialLinks.twitter}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-full transition-colors"
                                            title="Share on X"
                                        >
                                            <svg
                                                className="w-5 h-5 text-white"
                                                viewBox="0 0 24 24"
                                                fill="currentColor"
                                            >
                                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                            </svg>
                                        </a>

                                        {/* Telegram */}
                                        <a
                                            href={socialLinks.telegram}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-[#0088cc] rounded-full transition-colors"
                                            title="Share on Telegram"
                                        >
                                            <svg
                                                className="w-5 h-5 text-white"
                                                viewBox="0 0 24 24"
                                                fill="currentColor"
                                            >
                                                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                                            </svg>
                                        </a>

                                        {/* WhatsApp */}
                                        <a
                                            href={socialLinks.whatsapp}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-[#25D366] rounded-full transition-colors"
                                            title="Share on WhatsApp"
                                        >
                                            <svg
                                                className="w-5 h-5 text-white"
                                                viewBox="0 0 24 24"
                                                fill="currentColor"
                                            >
                                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                            </svg>
                                        </a>

                                        {/* Facebook */}
                                        <a
                                            href={socialLinks.facebook}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-10 h-10 flex items-center justify-center bg-zinc-800 hover:bg-[#1877F2] rounded-full transition-colors"
                                            title="Share on Facebook"
                                        >
                                            <svg
                                                className="w-5 h-5 text-white"
                                                viewBox="0 0 24 24"
                                                fill="currentColor"
                                            >
                                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                            </svg>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
