"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { isAddress } from "viem";
import { CHAIN_LIST, type SupportedChain } from "@/config/chains";

type TokenInfo = {
    address: string;
    chainId: number;
    name: string;
    symbol: string;
    decimals: number;
    ownerAddress: string | null;
    isOwner: boolean;
    isDeployer: boolean;
    userBalance: string | null;
};

interface CreateTokenChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string;
    onCreate: (chat: {
        tokenAddress: string;
        tokenChainId: number;
        tokenName: string;
        tokenSymbol: string;
        tokenDecimals: number;
        tokenImage: string | null;
        minBalance: string;
        minBalanceDisplay: string;
        isOfficial: boolean;
        name: string;
        description: string;
        emoji: string;
    }) => Promise<boolean>;
    isCreating?: boolean;
}

export function CreateTokenChatModal({
    isOpen,
    onClose,
    userAddress,
    onCreate,
    isCreating,
}: CreateTokenChatModalProps) {
    const [step, setStep] = useState<"token" | "configure">("token");
    const [tokenAddress, setTokenAddress] = useState("");
    const [selectedChain, setSelectedChain] = useState<SupportedChain>(
        CHAIN_LIST.find((c) => c.id === 8453) || CHAIN_LIST[0],
    );
    const [showChainPicker, setShowChainPicker] = useState(false);
    const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
    const [isFetchingToken, setIsFetchingToken] = useState(false);
    const [tokenError, setTokenError] = useState<string | null>(null);

    // Configure step
    const [chatName, setChatName] = useState("");
    const [description, setDescription] = useState("");
    const [minBalanceDisplay, setMinBalanceDisplay] = useState("");
    const [emoji, setEmoji] = useState("🪙");
    const [error, setError] = useState<string | null>(null);

    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Reset on open
    useEffect(() => {
        if (isOpen) {
            setStep("token");
            setTokenAddress("");
            setTokenInfo(null);
            setIsFetchingToken(false);
            setTokenError(null);
            setChatName("");
            setDescription("");
            setMinBalanceDisplay("");
            setEmoji("🪙");
            setError(null);
        }
    }, [isOpen]);

    // Auto-fetch token info when address changes
    const fetchTokenInfo = useCallback(
        async (address: string, chainId: number) => {
            if (!isAddress(address)) {
                setTokenInfo(null);
                setTokenError(null);
                return;
            }

            setIsFetchingToken(true);
            setTokenError(null);

            try {
                const res = await fetch(
                    `/api/token-chats/token-info?address=${address}&chainId=${chainId}&userAddress=${userAddress}`,
                );
                const data = await res.json();

                if (!res.ok) {
                    setTokenError(data.error || "Failed to fetch token info");
                    setTokenInfo(null);
                } else {
                    setTokenInfo(data);
                    // Auto-set chat name
                    if (data.isOwner || data.isDeployer) {
                        setChatName(`Official ${data.symbol} Chat`);
                    } else {
                        setChatName(`${data.symbol} Chat`);
                    }
                }
            } catch {
                setTokenError("Network error");
                setTokenInfo(null);
            } finally {
                setIsFetchingToken(false);
            }
        },
        [userAddress],
    );

    // Debounced token fetch
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (tokenAddress.length === 42 && isAddress(tokenAddress)) {
            debounceRef.current = setTimeout(() => {
                fetchTokenInfo(tokenAddress, selectedChain.id);
            }, 500);
        } else {
            setTokenInfo(null);
            setTokenError(null);
        }

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [tokenAddress, selectedChain.id, fetchTokenInfo]);

    const handleCreate = async () => {
        if (!tokenInfo || !chatName.trim()) {
            setError("Please fill in all required fields");
            return;
        }

        setError(null);

        // Convert display balance to raw token units
        let rawBalance = "0";
        if (minBalanceDisplay && parseFloat(minBalanceDisplay) > 0) {
            const amount = parseFloat(minBalanceDisplay);
            rawBalance = BigInt(
                Math.floor(amount * Math.pow(10, tokenInfo.decimals)),
            ).toString();
        }

        const success = await onCreate({
            tokenAddress: tokenInfo.address,
            tokenChainId: tokenInfo.chainId,
            tokenName: tokenInfo.name,
            tokenSymbol: tokenInfo.symbol,
            tokenDecimals: tokenInfo.decimals,
            tokenImage: null,
            minBalance: rawBalance,
            minBalanceDisplay: minBalanceDisplay || "0",
            isOfficial: tokenInfo.isOwner || tokenInfo.isDeployer,
            name: chatName.trim(),
            description: description.trim(),
            emoji,
        });

        if (success) {
            onClose();
        }
    };

    // Close on escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (isOpen) document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isOpen, onClose]);

    const TOKEN_EMOJIS = [
        "🪙", "💰", "🔥", "💎", "🚀", "⚡", "🐸", "🦊",
        "🐶", "🐱", "🦄", "🌟", "🎯", "🏆", "🎮", "🌍",
    ];

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
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                {step === "configure" && (
                                    <button
                                        onClick={() => setStep("token")}
                                        className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                        </svg>
                                    </button>
                                )}
                                <div>
                                    <h2 className="text-xl font-semibold text-white">
                                        {step === "token" ? "Token Chat" : "Configure Chat"}
                                    </h2>
                                    <p className="text-zinc-500 text-sm mt-0.5">
                                        {step === "token"
                                            ? "Select a token and chain"
                                            : "Set requirements and details"}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Step 1: Token Selection */}
                        {step === "token" && (
                            <div className="flex-1 overflow-y-auto space-y-4">
                                {/* Chain Selector */}
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                                        Chain
                                    </label>
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setShowChainPicker(!showChainPicker)}
                                            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-left flex items-center justify-between hover:border-zinc-600 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg">{selectedChain.icon}</span>
                                                <span className="font-medium">{selectedChain.name}</span>
                                            </div>
                                            <svg className={`w-4 h-4 text-zinc-400 transition-transform ${showChainPicker ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>

                                        <AnimatePresence>
                                            {showChainPicker && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: -5 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: -5 }}
                                                    className="absolute top-full mt-1 left-0 right-0 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl z-10 overflow-hidden max-h-60 overflow-y-auto"
                                                >
                                                    {CHAIN_LIST.map((chain) => (
                                                        <button
                                                            key={chain.id}
                                                            onClick={() => {
                                                                setSelectedChain(chain);
                                                                setShowChainPicker(false);
                                                                // Re-fetch token if address exists
                                                                if (tokenAddress && isAddress(tokenAddress)) {
                                                                    setTokenInfo(null);
                                                                    fetchTokenInfo(tokenAddress, chain.id);
                                                                }
                                                            }}
                                                            className={`w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-zinc-700 transition-colors ${
                                                                selectedChain.id === chain.id ? "bg-zinc-700/50" : ""
                                                            }`}
                                                        >
                                                            <span className="text-lg">{chain.icon}</span>
                                                            <span className="text-white text-sm font-medium">{chain.name}</span>
                                                            {selectedChain.id === chain.id && (
                                                                <svg className="w-4 h-4 text-[#FF5500] ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Token Address */}
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                                        Token Contract Address
                                    </label>
                                    <input
                                        type="text"
                                        value={tokenAddress}
                                        onChange={(e) => setTokenAddress(e.target.value.trim())}
                                        placeholder="0x..."
                                        className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20 transition-all font-mono text-sm"
                                    />
                                </div>

                                {/* Loading */}
                                {isFetchingToken && (
                                    <div className="flex items-center gap-3 p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-xl">
                                        <div className="w-5 h-5 border-2 border-zinc-500 border-t-[#FF5500] rounded-full animate-spin" />
                                        <span className="text-zinc-400 text-sm">Fetching token info...</span>
                                    </div>
                                )}

                                {/* Token Error */}
                                {tokenError && (
                                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                                        <p className="text-red-400 text-sm">{tokenError}</p>
                                    </div>
                                )}

                                {/* Token Info Card */}
                                {tokenInfo && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-xl space-y-3"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-lg font-bold text-white">
                                                {tokenInfo.symbol?.slice(0, 2)}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-white font-semibold">{tokenInfo.name}</p>
                                                    {(tokenInfo.isOwner || tokenInfo.isDeployer) && (
                                                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full border border-emerald-500/30">
                                                            OWNER
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-zinc-400 text-sm">${tokenInfo.symbol} on {selectedChain.name}</p>
                                            </div>
                                        </div>

                                        {(tokenInfo.isOwner || tokenInfo.isDeployer) && (
                                            <div className="flex items-center gap-2 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                                </svg>
                                                <p className="text-emerald-400 text-xs font-medium">
                                                    You&apos;re the contract owner. This will be marked as an Official chat.
                                                </p>
                                            </div>
                                        )}

                                        {tokenInfo.userBalance && (
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-zinc-500">Your balance</span>
                                                <span className="text-white font-medium">
                                                    {(
                                                        Number(tokenInfo.userBalance) /
                                                        Math.pow(10, tokenInfo.decimals)
                                                    ).toLocaleString()}{" "}
                                                    {tokenInfo.symbol}
                                                </span>
                                            </div>
                                        )}
                                    </motion.div>
                                )}

                                {/* Next Button */}
                                <button
                                    onClick={() => setStep("configure")}
                                    disabled={!tokenInfo}
                                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF7700] text-white font-medium transition-all hover:shadow-lg hover:shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Next
                                </button>
                            </div>
                        )}

                        {/* Step 2: Configure */}
                        {step === "configure" && tokenInfo && (
                            <div className="flex-1 overflow-y-auto space-y-4">
                                {/* Token Summary */}
                                <div className="flex items-center gap-3 p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-xl">
                                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white">
                                        {tokenInfo.symbol?.slice(0, 2)}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-white text-sm font-medium">
                                            {tokenInfo.symbol} on {selectedChain.name}
                                        </p>
                                    </div>
                                    {(tokenInfo.isOwner || tokenInfo.isDeployer) && (
                                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full">
                                            Official
                                        </span>
                                    )}
                                </div>

                                {/* Chat Name + Emoji */}
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                                        Chat Name & Icon
                                    </label>
                                    <div className="flex gap-2">
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    // Simple cycle through emojis
                                                    const idx = TOKEN_EMOJIS.indexOf(emoji);
                                                    setEmoji(TOKEN_EMOJIS[(idx + 1) % TOKEN_EMOJIS.length]);
                                                }}
                                                className="w-12 h-12 bg-zinc-800 border border-zinc-700 rounded-xl text-2xl hover:bg-zinc-700 hover:border-zinc-600 transition-all flex items-center justify-center"
                                            >
                                                {emoji}
                                            </button>
                                        </div>
                                        <input
                                            type="text"
                                            value={chatName}
                                            onChange={(e) => setChatName(e.target.value)}
                                            placeholder="Chat name..."
                                            className="flex-1 py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20 transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                                        Description <span className="text-zinc-600">(optional)</span>
                                    </label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="What's this chat about?"
                                        rows={2}
                                        className="w-full py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20 transition-all resize-none"
                                    />
                                </div>

                                {/* Minimum Balance */}
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                                        Minimum Token Balance to Join
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={minBalanceDisplay}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/[^0-9.]/g, "");
                                                setMinBalanceDisplay(val);
                                            }}
                                            placeholder="0 (no minimum)"
                                            className="w-full py-3 px-4 pr-20 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20 transition-all"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-medium">
                                            {tokenInfo.symbol}
                                        </span>
                                    </div>
                                    <p className="text-xs text-zinc-500 mt-1.5">
                                        Users must hold at least this many tokens to join. Set to 0 for no requirement.
                                    </p>
                                </div>

                                {/* Error */}
                                {error && (
                                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                                        <p className="text-red-400 text-sm">{error}</p>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={onClose}
                                        className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCreate}
                                        disabled={isCreating || !chatName.trim()}
                                        className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF7700] text-white font-medium transition-all hover:shadow-lg hover:shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isCreating ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                                Creating...
                                            </span>
                                        ) : (
                                            "Create Token Chat"
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
