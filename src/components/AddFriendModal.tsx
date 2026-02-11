"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useENS, type ENSResolution } from "@/hooks/useENS";
import { useUsername } from "@/hooks/useUsername";
import { usePhoneVerification } from "@/hooks/usePhoneVerification";
import { QRCodeScanner } from "./QRCodeScanner";

type AddFriendModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (addressOrENS: string, memo?: string) => Promise<boolean>;
    isLoading: boolean;
    error: string | null;
    initialValue?: string;
};

// Check if input looks like a phone number
function looksLikePhone(input: string): boolean {
    const digits = input.replace(/\D/g, "");
    return digits.length >= 10 && /^[\d\s\-\(\)\+]+$/.test(input);
}

export function AddFriendModal({
    isOpen,
    onClose,
    onAdd,
    isLoading,
    error,
    initialValue,
}: AddFriendModalProps) {
    const [input, setInput] = useState("");
    const [memo, setMemo] = useState("");
    const [resolved, setResolved] = useState<ENSResolution | null>(null);
    const [resolvedFromUsername, setResolvedFromUsername] = useState(false);
    const [resolvedFromPhone, setResolvedFromPhone] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const { resolveAddressOrENS, isResolving, error: resolveError } = useENS();
    const { lookupUsername } = useUsername(null);
    const { lookupByPhone } = usePhoneVerification(null);

    // Set initial value when modal opens
    useEffect(() => {
        if (isOpen && initialValue) {
            setInput(initialValue);
        }
    }, [isOpen, initialValue]);

    // Handle QR scan result - parse URL to extract address if needed
    const handleQRScan = (scannedValue: string) => {
        let addressOrInput = scannedValue;
        
        // Try to parse as URL and extract the 'add' parameter
        try {
            // Check if it's a URL (contains :// or starts with known domains)
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

    // Debounced resolution as user types - check phone, username, then ENS/address
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
                            // Found a verified phone - resolve the address for ENS/avatar
                            const ensResult = await resolveAddressOrENS(
                                phoneResult.wallet_address
                            );
                            setResolved({
                                address:
                                    phoneResult.wallet_address as `0x${string}`,
                                ensName: ensResult?.ensName || null,
                                avatar: ensResult?.avatar || null,
                            });
                            setResolvedFromPhone(true);
                            setResolvedFromUsername(false);
                            return;
                        }
                    } catch (err) {
                        console.error("[AddFriend] Phone lookup failed:", err);
                        // Continue to other lookups
                    }
                }

                // Try to lookup as a Spritz username (if it doesn't look like an address or ENS)
                const lowerInput = trimmedInput.toLowerCase();
                if (!lowerInput.startsWith("0x") && !lowerInput.includes(".")) {
                    try {
                        const usernameResult = await lookupUsername(lowerInput);
                        if (usernameResult) {
                            // Found a username - now resolve the address for ENS/avatar
                            const ensResult = await resolveAddressOrENS(
                                usernameResult.wallet_address
                            );
                            setResolved({
                                address:
                                    usernameResult.wallet_address as `0x${string}`,
                                ensName: ensResult?.ensName || null,
                                avatar: ensResult?.avatar || null,
                            });
                            setResolvedFromUsername(true);
                            setResolvedFromPhone(false);
                            return;
                        }
                    } catch (err) {
                        console.error(
                            "[AddFriend] Username lookup failed:",
                            err
                        );
                        // Continue to ENS resolution
                    }
                }

                // Fall back to ENS/address resolution
                const result = await resolveAddressOrENS(lowerInput);
                setResolved(result);
                setResolvedFromUsername(false);
                setResolvedFromPhone(false);
            } catch (err) {
                console.error("[AddFriend] Resolution failed:", err);
                setResolved(null);
                setResolvedFromUsername(false);
                setResolvedFromPhone(false);
            }
        }, 500); // 500ms debounce

        return () => clearTimeout(timer);
    }, [input, resolveAddressOrENS, lookupUsername, lookupByPhone]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setInput("");
            setMemo("");
            setResolved(null);
            setResolvedFromUsername(false);
            setResolvedFromPhone(false);
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resolved?.address) return;

        // Use the resolved address for the request
        const success = await onAdd(
            resolved.address,
            memo.trim() || undefined
        );
        if (success) {
            setInput("");
            setMemo("");
            setResolved(null);
            onClose();
        }
    };

    const formatAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md z-50"
                    >
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-white">
                                    Send Friend Request
                                </h2>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                                >
                                    <svg
                                        className="w-4 h-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M6 18L18 6M6 6l12 12"
                                        />
                                    </svg>
                                </button>
                            </div>

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
                                                onChange={(e) =>
                                                    setInput(e.target.value)
                                                }
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
                                            animate={{
                                                opacity: 1,
                                                height: "auto",
                                            }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                                                <div className="flex items-center gap-3">
                                                    {/* Avatar */}
                                                    {resolved.avatar ? (
                                                        <img
                                                            src={
                                                                resolved.avatar
                                                            }
                                                            alt="Avatar"
                                                            className="w-12 h-12 rounded-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                                                            <span className="text-white font-bold text-lg">
                                                                {(resolved.ensName ||
                                                                    resolved.address)[0].toUpperCase()}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {/* Info */}
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
                                                                    strokeWidth={
                                                                        2
                                                                    }
                                                                    d="M5 13l4 4L19 7"
                                                                />
                                                            </svg>
                                                            <span className="text-emerald-400 text-sm font-medium">
                                                                {resolvedFromPhone
                                                                    ? "Found by phone"
                                                                    : resolvedFromUsername
                                                                    ? "Found @" +
                                                                      input
                                                                          .trim()
                                                                          .toLowerCase()
                                                                    : "Resolved"}
                                                            </span>
                                                        </div>
                                                        {resolved.ensName && (
                                                            <p className="text-white font-medium truncate">
                                                                {
                                                                    resolved.ensName
                                                                }
                                                            </p>
                                                        )}
                                                        <p className="text-zinc-400 text-sm font-mono truncate">
                                                            {formatAddress(
                                                                resolved.address
                                                            )}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Resolution Error */}
                                <AnimatePresence>
                                    {resolveError &&
                                        input.trim().length >= 3 &&
                                        !isResolving && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3"
                                            >
                                                <p className="text-amber-400 text-sm">
                                                    {resolveError}
                                                </p>
                                            </motion.div>
                                        )}
                                </AnimatePresence>

                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                                        Memo (optional)
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={memo}
                                            onChange={(e) => {
                                                if (e.target.value.length <= 100) {
                                                    setMemo(e.target.value);
                                                }
                                            }}
                                            maxLength={100}
                                            placeholder="e.g. Kevin from ETH Denver"
                                            className="w-full py-3 px-4 pr-12 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FB8D22]/50 focus:ring-2 focus:ring-[#FB8D22]/20 transition-all text-sm"
                                        />
                                        {memo.length > 0 && (
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
                                                {memo.length}/100
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-zinc-600 text-xs mt-1">
                                        Help them know who you are
                                    </p>
                                </div>

                                <AnimatePresence>
                                    {error && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="bg-red-500/10 border border-red-500/30 rounded-xl p-3"
                                        >
                                            <p className="text-red-400 text-sm">
                                                {error}
                                            </p>
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
                                            isLoading ||
                                            !input.trim() ||
                                            (!resolved?.address && !isResolving)
                                        }
                                        className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF5500] text-white font-medium transition-all hover:shadow-lg hover:shadow-[#FB8D22]/25 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isLoading ? (
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

                            <p className="text-zinc-500 text-xs text-center mt-4">
                                They&apos;ll need to accept your request before
                                you can call
                            </p>
                        </div>
                    </motion.div>

                    {/* QR Scanner Modal */}
                    <QRCodeScanner
                        isOpen={showScanner}
                        onClose={() => setShowScanner(false)}
                        onScan={handleQRScan}
                    />
                </>
            )}
        </AnimatePresence>
    );
}
