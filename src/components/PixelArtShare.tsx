"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

interface PixelArtShareProps {
    imageUrl: string;
    className?: string;
    compact?: boolean; // For inline share button on pixel art
}

export function PixelArtShare({ imageUrl, className = "", compact = false }: PixelArtShareProps) {
    const [showMenu, setShowMenu] = useState(false);
    const [copiedType, setCopiedType] = useState<"link" | "image" | null>(null);
    const [isSharing, setIsSharing] = useState(false);

    const spritzUrl = "https://spritz.chat";
    const callToAction = "🎨 Create your own pixel art on Spritz!";
    
    // Build share text with image URL and call to action
    const buildShareText = (includeImage: boolean = true) => {
        if (includeImage) {
            return `Check out my pixel art! 🎨✨\n\n${imageUrl}\n\n${callToAction}\n${spritzUrl}`;
        }
        return `Check out my pixel art! 🎨✨\n\n${callToAction}\n${spritzUrl}`;
    };

    // Use native Web Share API with file attachment (works on mobile!)
    const shareNative = async () => {
        if (typeof navigator === "undefined" || !("share" in navigator)) {
            setShowMenu(true);
            return;
        }
        
        setIsSharing(true);
        try {
            // Fetch the image and convert to blob
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const file = new File([blob], "pixel-art.png", { type: "image/png" });
            
            // Check if we can share files
            if ("canShare" in navigator && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: "My Pixel Art",
                    text: `Check out my pixel art! 🎨✨\n\n${callToAction}\n${spritzUrl}`,
                    files: [file],
                });
                setShowMenu(false);
            } else {
                // Fallback to sharing without file
                await navigator.share({
                    title: "My Pixel Art",
                    text: buildShareText(true),
                    url: imageUrl,
                });
                setShowMenu(false);
            }
        } catch (err) {
            // User cancelled or error - show menu as fallback
            if ((err as Error).name !== "AbortError") {
                setShowMenu(true);
            }
        } finally {
            setIsSharing(false);
        }
    };

    const shareToTwitter = () => {
        // Twitter shows image previews from URLs in tweets
        const text = `Check out my pixel art! 🎨✨\n\n${callToAction}`;
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(imageUrl)}`;
        window.open(url, "_blank", "noopener,noreferrer");
        setShowMenu(false);
    };

    const shareToFacebook = () => {
        // Facebook will try to scrape the image URL for preview
        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(imageUrl)}&quote=${encodeURIComponent(`${callToAction} ${spritzUrl}`)}`;
        window.open(url, "_blank", "noopener,noreferrer");
        setShowMenu(false);
    };

    const shareToLinkedIn = () => {
        const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(imageUrl)}`;
        window.open(url, "_blank", "noopener,noreferrer");
        setShowMenu(false);
    };

    const shareToReddit = () => {
        // Reddit image post
        const title = `My pixel art created on Spritz! 🎨 Create your own at spritz.chat`;
        const url = `https://reddit.com/submit?url=${encodeURIComponent(imageUrl)}&title=${encodeURIComponent(title)}`;
        window.open(url, "_blank", "noopener,noreferrer");
        setShowMenu(false);
    };

    const shareToTelegram = () => {
        const text = buildShareText(false);
        const url = `https://t.me/share/url?url=${encodeURIComponent(imageUrl)}&text=${encodeURIComponent(text)}`;
        window.open(url, "_blank", "noopener,noreferrer");
        setShowMenu(false);
    };

    const shareToWhatsApp = () => {
        const text = buildShareText(true);
        const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, "_blank", "noopener,noreferrer");
        setShowMenu(false);
    };

    const copyImageUrl = async () => {
        try {
            await navigator.clipboard.writeText(imageUrl);
            setCopiedType("image");
            setTimeout(() => setCopiedType(null), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    const copySpritzLink = async () => {
        try {
            await navigator.clipboard.writeText(spritzUrl);
            setCopiedType("link");
            setTimeout(() => setCopiedType(null), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    const copyFullShare = async () => {
        try {
            const fullText = buildShareText(true);
            await navigator.clipboard.writeText(fullText);
            setCopiedType("link");
            setTimeout(() => setCopiedType(null), 2000);
        } catch (err) {
            console.error("Failed to copy:", err);
        }
        setShowMenu(false);
    };

    const downloadImage = () => {
        // Create a link to download the image
        const link = document.createElement("a");
        link.href = imageUrl;
        link.download = "pixel-art.png";
        link.target = "_blank";
        link.click();
        setShowMenu(false);
    };

    // Check if native sharing is available
    const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

    // Handle main button click - try native share first on mobile
    const handleMainClick = async () => {
        // On mobile/PWA, try native sharing with file attachment
        if (canNativeShare) {
            await shareNative();
        } else {
            setShowMenu(!showMenu);
        }
    };

    return (
        <div className={`relative ${className}`}>
            <button
                onClick={handleMainClick}
                disabled={isSharing}
                className={compact 
                    ? "p-1.5 bg-black/60 hover:bg-black/80 rounded-lg transition-colors flex items-center justify-center text-white"
                    : "px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
                }
                title="Share"
            >
                {isSharing ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                    <>
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                        {!compact && <span className="text-white">Share</span>}
                    </>
                )}
            </button>

            <AnimatePresence>
                {showMenu && (
                    <>
                        {/* Backdrop to close menu */}
                        <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setShowMenu(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 5 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 5 }}
                            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-20"
                        >
                            <div className="p-2 space-y-1">
                                {/* Native share with image attachment - show if available */}
                                {canNativeShare && (
                                    <button
                                        onClick={shareNative}
                                        className="w-full px-3 py-2 text-left text-sm text-emerald-400 hover:bg-emerald-500/20 rounded-lg transition-colors flex items-center gap-3 font-medium"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        Share with Image ✨
                                    </button>
                                )}
                                <button
                                    onClick={shareToTwitter}
                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                                    </svg>
                                    Share on X
                                </button>
                                <button
                                    onClick={shareToFacebook}
                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                    </svg>
                                    Share on Facebook
                                </button>
                                <button
                                    onClick={shareToLinkedIn}
                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                                    </svg>
                                    Share on LinkedIn
                                </button>
                                <button
                                    onClick={shareToReddit}
                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
                                    </svg>
                                    Share on Reddit
                                </button>
                                <button
                                    onClick={shareToTelegram}
                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                                    </svg>
                                    Share on Telegram
                                </button>
                                <button
                                    onClick={shareToWhatsApp}
                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                >
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                    </svg>
                                    Share on WhatsApp
                                </button>

                                <div className="border-t border-zinc-700 my-2" />

                                <button
                                    onClick={downloadImage}
                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Download Image
                                </button>
                                <button
                                    onClick={copyImageUrl}
                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                    </svg>
                                    {copiedType === "image" ? "Copied!" : "Copy Image URL"}
                                </button>
                                <button
                                    onClick={copyFullShare}
                                    className="w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-700 rounded-lg transition-colors flex items-center gap-3"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                    </svg>
                                    {copiedType === "link" ? "Copied!" : "Copy All (Image + Spritz)"}
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
