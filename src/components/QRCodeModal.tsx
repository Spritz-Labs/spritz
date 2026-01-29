"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { type Address } from "viem";
import { QRCodeScanner } from "./QRCodeScanner";
import { useENS, type ENSResolution } from "@/hooks/useENS";
import { useUsername } from "@/hooks/useUsername";
import { usePhoneVerification } from "@/hooks/usePhoneVerification";

interface QRCodeModalProps {
    isOpen: boolean;
    onClose: () => void;
    address: Address;
    ensName: string | null;
    reachUsername: string | null;
    avatar: string | null;
    onAddFriend?: (addressOrENS: string, nickname?: string) => Promise<boolean>;
    isAddingFriend?: boolean;
    addFriendError?: string | null;
}

export function QRCodeModal({
    isOpen,
    onClose,
    address,
    ensName,
    reachUsername,
    avatar,
    onAddFriend,
    isAddingFriend = false,
    addFriendError = null,
}: QRCodeModalProps) {
    const qrContainerRef = useRef<HTMLDivElement>(null);
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState<"qr" | "add">("qr");
    
    // Add Friend form state
    const [input, setInput] = useState("");
    const [nickname, setNickname] = useState("");
    const [resolved, setResolved] = useState<ENSResolution | null>(null);
    const [resolvedFromUsername, setResolvedFromUsername] = useState(false);
    const [resolvedFromPhone, setResolvedFromPhone] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const { resolveAddressOrENS, isResolving, error: resolveError } = useENS();
    const { lookupUsername } = useUsername(null);
    const { lookupByPhone } = usePhoneVerification(null);

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

    // Prevent body scroll when modal is open (fixes PWA scroll bleed-through)
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    const displayName =
        reachUsername ||
        ensName ||
        `${address.slice(0, 6)}...${address.slice(-4)}`;

    // Share URL - use username if available, otherwise fall back to address
    const shareUrl = reachUsername
        ? `https://app.spritz.chat?add=${reachUsername}`
        : `https://app.spritz.chat?add=${address}`;

    // The QR code contains the full app link with add parameter
    const qrValue = shareUrl;
    const shareText = `🚀 Add me on Spritz - the censorship resistant chat app for Web3!`;
    const shareTextWithAddress = reachUsername
        ? `🚀 Add me on Spritz - the censorship resistant chat app for Web3!\n\nMy username: @${reachUsername}`
        : `🚀 Add me on Spritz - the censorship resistant chat app for Web3!\n\nMy wallet: ${address}`;

    // Reset tab and form when modal closes
    useEffect(() => {
        if (!isOpen) {
            setActiveTab("qr");
            setInput("");
            setNickname("");
            setResolved(null);
            setResolvedFromUsername(false);
            setResolvedFromPhone(false);
        }
    }, [isOpen]);

    // Check if input looks like a phone number
    const looksLikePhone = (input: string): boolean => {
        const digits = input.replace(/\D/g, "");
        return digits.length >= 10 && /^[\d\s\-\(\)\+]+$/.test(input);
    };

    // Handle QR scan result
    const handleQRScan = (scannedValue: string) => {
        let addressOrInput = scannedValue;
        
        try {
            if (scannedValue.includes('://') || scannedValue.startsWith('app.spritz.chat')) {
                const url = new URL(scannedValue.startsWith('http') ? scannedValue : `https://${scannedValue}`);
                const addParam = url.searchParams.get('add');
                if (addParam) {
                    addressOrInput = addParam;
                }
            }
        } catch {
            // Not a valid URL, use as-is
        }
        
        setInput(addressOrInput);
        setShowScanner(false);
    };

    // Debounced resolution as user types
    useEffect(() => {
        if (!input.trim() || input.trim().length < 3) {
            setResolved(null);
            setResolvedFromUsername(false);
            setResolvedFromPhone(false);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const trimmedInput = input.trim();

                // First, check if it looks like a phone number
                if (looksLikePhone(trimmedInput)) {
                    try {
                        const phoneResult = await lookupByPhone(trimmedInput);
                        if (phoneResult) {
                            const ensResult = await resolveAddressOrENS(
                                phoneResult.wallet_address
                            );
                            setResolved({
                                address: phoneResult.wallet_address as `0x${string}`,
                                ensName: ensResult?.ensName || null,
                                avatar: ensResult?.avatar || null,
                            });
                            setResolvedFromPhone(true);
                            setResolvedFromUsername(false);
                            return;
                        }
                    } catch (err) {
                        console.error("[QRCodeModal] Phone lookup failed:", err);
                    }
                }

                // Try to lookup as a Spritz username
                const lowerInput = trimmedInput.toLowerCase();
                if (!lowerInput.startsWith("0x") && !lowerInput.includes(".")) {
                    try {
                        const usernameResult = await lookupUsername(lowerInput);
                        if (usernameResult) {
                            const ensResult = await resolveAddressOrENS(
                                usernameResult.wallet_address
                            );
                            setResolved({
                                address: usernameResult.wallet_address as `0x${string}`,
                                ensName: ensResult?.ensName || null,
                                avatar: ensResult?.avatar || null,
                            });
                            setResolvedFromUsername(true);
                            setResolvedFromPhone(false);
                            return;
                        }
                    } catch (err) {
                        console.error("[QRCodeModal] Username lookup failed:", err);
                    }
                }

                // Fall back to ENS/address resolution
                const result = await resolveAddressOrENS(lowerInput);
                setResolved(result);
                setResolvedFromUsername(false);
                setResolvedFromPhone(false);
            } catch (err) {
                console.error("[QRCodeModal] Resolution failed:", err);
                setResolved(null);
                setResolvedFromUsername(false);
                setResolvedFromPhone(false);
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(timer);
    }, [input, resolveAddressOrENS, lookupUsername, lookupByPhone]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resolved?.address || !onAddFriend) return;

        const success = await onAddFriend(
            resolved.address,
            nickname.trim() || undefined
        );
        if (success) {
            setInput("");
            setNickname("");
            setResolved(null);
            onClose();
        }
    };

    const formatAddress = (addr: string) => 
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;


    // Social share URLs
    const socialLinks = {
        twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(
            `${shareText}\n\n${shareUrl}`
        )}`,
        telegram: `https://t.me/share/url?url=${encodeURIComponent(
            shareUrl
        )}&text=${encodeURIComponent(shareText)}`,
        whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareTextWithAddress}\n\n${shareUrl}`)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
            shareUrl
        )}&quote=${encodeURIComponent(shareText)}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
            shareUrl
        )}`,
        reddit: `https://reddit.com/submit?url=${encodeURIComponent(
            shareUrl
        )}&title=${encodeURIComponent(shareText)}`,
        discord: shareUrl, // Discord doesn't have a share URL, just copy the link
    };

    // Copy share link
    const handleCopyLink = useCallback(async () => {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [shareUrl]);

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
                                Invite Friends
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

                        {/* Tabs */}
                        <div className="flex gap-2 mb-6 bg-zinc-800/50 p-1 rounded-xl">
                            <button
                                onClick={() => setActiveTab("qr")}
                                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                                    activeTab === "qr"
                                        ? "bg-[#FF5500] text-white"
                                        : "text-zinc-400 hover:text-white"
                                }`}
                            >
                                QR Code
                            </button>
                            <button
                                onClick={() => setActiveTab("add")}
                                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                                    activeTab === "add"
                                        ? "bg-[#FF5500] text-white"
                                        : "text-zinc-400 hover:text-white"
                                }`}
                            >
                                Send Request
                            </button>
                        </div>

                        {/* Tab Content */}
                        <AnimatePresence mode="wait">
                            {activeTab === "qr" ? (
                                <motion.div
                                    key="qr"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="flex flex-col items-center"
                                >
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
                                            {reachUsername ? (
                                                <p className="text-zinc-500 text-xs">
                                                    @{reachUsername}
                                                </p>
                                            ) : (
                                                <p className="text-zinc-500 text-xs font-mono">
                                                    {address.slice(0, 10)}...
                                                    {address.slice(-8)}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <p className="text-zinc-500 text-sm text-center mb-6">
                                        Scan to open Spritz and add me as a friend
                                    </p>

                                    {/* Action Buttons */}
                                    <div className="w-full space-y-3">
                                        {/* Copy Link Button */}
                                        <button
                                            onClick={handleCopyLink}
                                            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
                                        >
                                            {copied ? (
                                                <>
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
                                                    <span>Copied!</span>
                                                </>
                                            ) : (
                                                <>
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
                                                    <span>Copy Link</span>
                                                </>
                                            )}
                                        </button>

                                        {/* Social Share Buttons */}
                                        <div className="pt-2">
                                            <p className="text-zinc-500 text-xs text-center mb-3">
                                                Share on social
                                            </p>
                                            <div className="grid grid-cols-4 gap-2">
                                                {/* Twitter/X */}
                                                <a
                                                    href={socialLinks.twitter}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="w-12 h-12 flex items-center justify-center bg-zinc-800 hover:bg-black rounded-full transition-colors"
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
                                                    className="w-12 h-12 flex items-center justify-center bg-zinc-800 hover:bg-[#0088cc] rounded-full transition-colors"
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
                                                    className="w-12 h-12 flex items-center justify-center bg-zinc-800 hover:bg-[#25D366] rounded-full transition-colors"
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
                                                    className="w-12 h-12 flex items-center justify-center bg-zinc-800 hover:bg-[#1877F2] rounded-full transition-colors"
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

                                                {/* LinkedIn */}
                                                <a
                                                    href={socialLinks.linkedin}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="w-12 h-12 flex items-center justify-center bg-zinc-800 hover:bg-[#0077B5] rounded-full transition-colors"
                                                    title="Share on LinkedIn"
                                                >
                                                    <svg
                                                        className="w-5 h-5 text-white"
                                                        viewBox="0 0 24 24"
                                                        fill="currentColor"
                                                    >
                                                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                                                    </svg>
                                                </a>

                                                {/* Reddit */}
                                                <a
                                                    href={socialLinks.reddit}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="w-12 h-12 flex items-center justify-center bg-zinc-800 hover:bg-[#FF4500] rounded-full transition-colors"
                                                    title="Share on Reddit"
                                                >
                                                    <svg
                                                        className="w-5 h-5 text-white"
                                                        viewBox="0 0 24 24"
                                                        fill="currentColor"
                                                    >
                                                        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.962-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
                                                    </svg>
                                                </a>

                                                {/* Discord */}
                                                <button
                                                    onClick={handleCopyLink}
                                                    className="w-12 h-12 flex items-center justify-center bg-zinc-800 hover:bg-[#5865F2] rounded-full transition-colors"
                                                    title="Copy link for Discord"
                                                >
                                                    <svg
                                                        className="w-5 h-5 text-white"
                                                        viewBox="0 0 24 24"
                                                        fill="currentColor"
                                                    >
                                                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="add"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                >
                                    {onAddFriend ? (
                                        <form onSubmit={handleSubmit} className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                                    Phone, Username, Address, or ENS
                                                </label>
                                                <div className="flex gap-2">
                                                    <div className="relative flex-1">
                                                        <input
                                                            type="text"
                                                            value={input}
                                                            onChange={(e) => setInput(e.target.value)}
                                                            placeholder="kevin, 0x..., or vitalik.eth"
                                                            spellCheck={false}
                                                            autoComplete="off"
                                                            autoCorrect="off"
                                                            autoCapitalize="off"
                                                            className="w-full py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FB8D22]/50 focus:ring-2 focus:ring-[#FB8D22]/20 transition-all"
                                                        />
                                                        {isResolving && (
                                                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                                <svg
                                                                    className="animate-spin h-5 w-5 text-[#FFBBA7]"
                                                                    viewBox="0 0 24 24"
                                                                    fill="none"
                                                                >
                                                                    <circle
                                                                        className="opacity-25"
                                                                        cx="12"
                                                                        cy="12"
                                                                        r="10"
                                                                        stroke="currentColor"
                                                                        strokeWidth="4"
                                                                    />
                                                                    <path
                                                                        className="opacity-75"
                                                                        fill="currentColor"
                                                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                                    />
                                                                </svg>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {/* QR Scan Button */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowScanner(true)}
                                                        className="p-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl text-zinc-400 hover:text-white transition-colors"
                                                        title="Scan QR Code"
                                                    >
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            strokeWidth={1.5}
                                                            stroke="currentColor"
                                                            className="w-6 h-6"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z"
                                                            />
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z"
                                                            />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Resolved Preview */}
                                            <AnimatePresence>
                                                {resolved && resolved.address && (
                                                    <motion.div
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: "auto" }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                                                            <div className="flex items-center gap-3">
                                                                {resolved.avatar ? (
                                                                    <img
                                                                        src={resolved.avatar}
                                                                        alt="Avatar"
                                                                        className="w-12 h-12 rounded-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                                                                        <span className="text-white font-bold text-lg">
                                                                            {(resolved.ensName || resolved.address)[0].toUpperCase()}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <svg
                                                                            className="w-4 h-4 text-emerald-400"
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
                                                                        <span className="text-emerald-400 text-sm font-medium">
                                                                            {resolvedFromPhone
                                                                                ? "Found by phone"
                                                                                : resolvedFromUsername
                                                                                ? `Found @${input.trim().toLowerCase()}`
                                                                                : "Resolved"}
                                                                        </span>
                                                                    </div>
                                                                    {resolved.ensName && (
                                                                        <p className="text-white font-medium truncate">
                                                                            {resolved.ensName}
                                                                        </p>
                                                                    )}
                                                                    <p className="text-zinc-400 text-sm font-mono truncate">
                                                                        {formatAddress(resolved.address)}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            {/* Resolution Error */}
                                            <AnimatePresence>
                                                {resolveError && input.trim().length >= 3 && !isResolving && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -10 }}
                                                        className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3"
                                                    >
                                                        <p className="text-amber-400 text-sm">{resolveError}</p>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            <div>
                                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                                    Nickname (optional)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={nickname}
                                                    onChange={(e) => setNickname(e.target.value)}
                                                    placeholder="e.g. Kevin from ETH Denver"
                                                    className="w-full py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FB8D22]/50 focus:ring-2 focus:ring-[#FB8D22]/20 transition-all"
                                                />
                                            </div>

                                            <AnimatePresence>
                                                {addFriendError && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -10 }}
                                                        className="bg-red-500/10 border border-red-500/30 rounded-xl p-3"
                                                    >
                                                        <p className="text-red-400 text-sm">{addFriendError}</p>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            <div className="flex gap-3 pt-2">
                                                <button
                                                    type="button"
                                                    onClick={onClose}
                                                    className="flex-1 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="submit"
                                                    disabled={
                                                        isAddingFriend ||
                                                        !input.trim() ||
                                                        (!resolved?.address && !isResolving)
                                                    }
                                                    className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF5500] text-white font-medium transition-all hover:shadow-lg hover:shadow-[#FB8D22]/25 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isAddingFriend ? (
                                                        <span className="flex items-center justify-center gap-2">
                                                            <svg
                                                                className="animate-spin h-4 w-4"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                            >
                                                                <circle
                                                                    className="opacity-25"
                                                                    cx="12"
                                                                    cy="12"
                                                                    r="10"
                                                                    stroke="currentColor"
                                                                    strokeWidth="4"
                                                                />
                                                                <path
                                                                    className="opacity-75"
                                                                    fill="currentColor"
                                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                                />
                                                            </svg>
                                                            Sending...
                                                        </span>
                                                    ) : (
                                                        "Send Request"
                                                    )}
                                                </button>
                                            </div>
                                        </form>
                                    ) : (
                                        <div className="text-center py-8">
                                            <p className="text-zinc-400 text-sm">
                                                Friend request functionality not available
                                            </p>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </motion.div>
            )}

            {/* QR Scanner Modal */}
            <QRCodeScanner
                isOpen={showScanner}
                onClose={() => setShowScanner(false)}
                onScan={handleQRScan}
            />
        </AnimatePresence>
    );
}
