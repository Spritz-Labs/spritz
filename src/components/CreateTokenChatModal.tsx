"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { isAddress } from "viem";
import { CHAIN_LIST, type SupportedChain, getChainById } from "@/config/chains";
import type { SuggestedToken, WalletSource } from "@/app/api/token-chats/suggest-tokens/route";

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
    smartWalletAddress?: string | null;
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
        messagingType: "standard" | "waku";
    }) => Promise<boolean>;
    isCreating?: boolean;
}

// Group tokens by symbol+chain for aggregated view
type GroupedToken = {
    address: string;
    chainId: number;
    chainName: string;
    chainIcon: string;
    name: string;
    symbol: string;
    decimals: number;
    logoUrl?: string;
    sources: {
        source: WalletSource;
        balance: string;
        balanceFormatted: string;
        balanceUsd: number | null;
    }[];
    totalBalance: number; // sum of raw balances (for sorting)
    totalUsd: number; // sum of USD values
};

export function CreateTokenChatModal({
    isOpen,
    onClose,
    userAddress,
    smartWalletAddress,
    onCreate,
    isCreating,
}: CreateTokenChatModalProps) {
    const [step, setStep] = useState<"select" | "configure">("select");
    const [mode, setMode] = useState<"suggest" | "manual">("suggest");

    // Token suggestion state
    const [suggestedTokens, setSuggestedTokens] = useState<SuggestedToken[]>([]);
    const [walletSources, setWalletSources] = useState<WalletSource[]>([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [suggestError, setSuggestError] = useState<string | null>(null);
    const [tokenSearch, setTokenSearch] = useState("");
    const [selectedChainFilter, setSelectedChainFilter] = useState<number | null>(null);

    // Manual token entry state
    const [tokenAddress, setTokenAddress] = useState("");
    const [selectedChain, setSelectedChain] = useState<SupportedChain>(
        CHAIN_LIST.find((c) => c.id === 8453) || CHAIN_LIST[0],
    );
    const [showChainPicker, setShowChainPicker] = useState(false);
    const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
    const [isFetchingToken, setIsFetchingToken] = useState(false);
    const [tokenError, setTokenError] = useState<string | null>(null);

    // Selected token (from either path)
    const [selectedToken, setSelectedToken] = useState<{
        address: string;
        chainId: number;
        name: string;
        symbol: string;
        decimals: number;
        logoUrl?: string;
        isOwner: boolean;
        isDeployer: boolean;
    } | null>(null);

    // Configure step
    const [messagingType, setMessagingType] = useState<"standard" | "waku">("standard");
    const [chatName, setChatName] = useState("");
    const [description, setDescription] = useState("");
    const [minBalanceDisplay, setMinBalanceDisplay] = useState("");
    const [emoji, setEmoji] = useState("🪙");
    const [error, setError] = useState<string | null>(null);

    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Reset on open
    useEffect(() => {
        if (isOpen) {
            setStep("select");
            setMode("suggest");
            setSuggestedTokens([]);
            setWalletSources([]);
            setIsLoadingSuggestions(false);
            setSuggestError(null);
            setTokenSearch("");
            setSelectedChainFilter(null);
            setTokenAddress("");
            setTokenInfo(null);
            setIsFetchingToken(false);
            setTokenError(null);
            setSelectedToken(null);
            setChatName("");
            setDescription("");
            setMinBalanceDisplay("");
            setEmoji("🪙");
            setError(null);
        }
    }, [isOpen]);

    // Fetch token suggestions on open
    useEffect(() => {
        if (!isOpen || !userAddress) return;

        const fetchSuggestions = async () => {
            setIsLoadingSuggestions(true);
            setSuggestError(null);
            try {
                const res = await fetch(
                    `/api/token-chats/suggest-tokens?userAddress=${userAddress.toLowerCase()}`,
                );
                const data = await res.json();
                if (res.ok) {
                    setSuggestedTokens(data.tokens || []);
                    setWalletSources(data.walletSources || []);
                } else {
                    setSuggestError(data.error || "Failed to load tokens");
                }
            } catch {
                setSuggestError("Network error loading tokens");
            } finally {
                setIsLoadingSuggestions(false);
            }
        };

        fetchSuggestions();
    }, [isOpen, userAddress]);

    // Group and filter tokens
    const groupedTokens = useMemo(() => {
        // Filter tokens
        let filtered = suggestedTokens;

        if (tokenSearch) {
            const q = tokenSearch.toLowerCase();
            filtered = filtered.filter(
                (t) =>
                    t.symbol.toLowerCase().includes(q) ||
                    t.name.toLowerCase().includes(q) ||
                    t.address.toLowerCase().includes(q),
            );
        }

        if (selectedChainFilter) {
            filtered = filtered.filter((t) => t.chainId === selectedChainFilter);
        }

        // Group by address+chainId
        const groups = new Map<string, GroupedToken>();
        for (const t of filtered) {
            const key = `${t.address.toLowerCase()}-${t.chainId}`;
            const existing = groups.get(key);
            if (existing) {
                existing.sources.push({
                    source: t.source,
                    balance: t.balance,
                    balanceFormatted: t.balanceFormatted,
                    balanceUsd: t.balanceUsd,
                });
                existing.totalBalance += parseFloat(t.balanceFormatted) || 0;
                existing.totalUsd += t.balanceUsd || 0;
            } else {
                groups.set(key, {
                    address: t.address,
                    chainId: t.chainId,
                    chainName: t.chainName,
                    chainIcon: t.chainIcon,
                    name: t.name,
                    symbol: t.symbol,
                    decimals: t.decimals,
                    logoUrl: t.logoUrl,
                    sources: [
                        {
                            source: t.source,
                            balance: t.balance,
                            balanceFormatted: t.balanceFormatted,
                            balanceUsd: t.balanceUsd,
                        },
                    ],
                    totalBalance: parseFloat(t.balanceFormatted) || 0,
                    totalUsd: t.balanceUsd || 0,
                });
            }
        }

        return Array.from(groups.values()).sort(
            (a, b) => b.totalUsd - a.totalUsd,
        );
    }, [suggestedTokens, tokenSearch, selectedChainFilter]);

    // Chains that have tokens
    const availableChains = useMemo(() => {
        const chainIds = new Set(suggestedTokens.map((t) => t.chainId));
        return CHAIN_LIST.filter((c) => chainIds.has(c.id));
    }, [suggestedTokens]);

    // Auto-fetch token info for manual mode
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

    // Debounced token fetch for manual mode
    useEffect(() => {
        if (mode !== "manual") return;
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
    }, [tokenAddress, selectedChain.id, fetchTokenInfo, mode]);

    // Handle selecting a suggested token
    const handleSelectSuggested = async (group: GroupedToken) => {
        // Check ownership
        setIsFetchingToken(true);
        try {
            const res = await fetch(
                `/api/token-chats/token-info?address=${group.address}&chainId=${group.chainId}&userAddress=${userAddress}`,
            );
            const data = await res.json();

            setSelectedToken({
                address: group.address,
                chainId: group.chainId,
                name: group.name,
                symbol: group.symbol,
                decimals: group.decimals,
                logoUrl: group.logoUrl,
                isOwner: data?.isOwner || false,
                isDeployer: data?.isDeployer || false,
            });

            // Auto-name
            if (data?.isOwner || data?.isDeployer) {
                setChatName(`Official ${group.symbol} Chat`);
            } else {
                setChatName(`${group.symbol} Chat`);
            }

            setStep("configure");
        } catch {
            // Even if ownership check fails, allow selection
            setSelectedToken({
                address: group.address,
                chainId: group.chainId,
                name: group.name,
                symbol: group.symbol,
                decimals: group.decimals,
                logoUrl: group.logoUrl,
                isOwner: false,
                isDeployer: false,
            });
            setChatName(`${group.symbol} Chat`);
            setStep("configure");
        } finally {
            setIsFetchingToken(false);
        }
    };

    // Handle selecting manual token
    const handleSelectManual = () => {
        if (!tokenInfo) return;

        setSelectedToken({
            address: tokenInfo.address,
            chainId: tokenInfo.chainId,
            name: tokenInfo.name,
            symbol: tokenInfo.symbol,
            decimals: tokenInfo.decimals,
            isOwner: tokenInfo.isOwner,
            isDeployer: tokenInfo.isDeployer,
        });

        if (tokenInfo.isOwner || tokenInfo.isDeployer) {
            setChatName(`Official ${tokenInfo.symbol} Chat`);
        } else {
            setChatName(`${tokenInfo.symbol} Chat`);
        }

        setStep("configure");
    };

    const handleCreate = async () => {
        if (!selectedToken || !chatName.trim()) {
            setError("Please fill in all required fields");
            return;
        }

        setError(null);

        let rawBalance = "0";
        if (minBalanceDisplay && parseFloat(minBalanceDisplay) > 0) {
            const amount = parseFloat(minBalanceDisplay);
            rawBalance = BigInt(
                Math.floor(amount * Math.pow(10, selectedToken.decimals)),
            ).toString();
        }

        const success = await onCreate({
            tokenAddress: selectedToken.address,
            tokenChainId: selectedToken.chainId,
            tokenName: selectedToken.name,
            tokenSymbol: selectedToken.symbol,
            tokenDecimals: selectedToken.decimals,
            tokenImage: selectedToken.logoUrl || null,
            minBalance: rawBalance,
            minBalanceDisplay: minBalanceDisplay || "0",
            isOfficial: selectedToken.isOwner || selectedToken.isDeployer,
            name: chatName.trim(),
            description: description.trim(),
            emoji,
            messagingType,
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

    const getSourceIcon = (type: WalletSource["type"]) => {
        switch (type) {
            case "eoa":
                return (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                );
            case "smart_wallet":
                return (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                );
            case "vault":
                return (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                );
        }
    };

    const getSourceLabel = (source: WalletSource) => {
        switch (source.type) {
            case "eoa":
                return "Wallet";
            case "smart_wallet":
                return "Spritz Wallet";
            case "vault":
                return source.vaultName || "Vault";
        }
    };

    const getSourceColor = (type: WalletSource["type"]) => {
        switch (type) {
            case "eoa":
                return "text-blue-400 bg-blue-500/10 border-blue-500/20";
            case "smart_wallet":
                return "text-[#FF5500] bg-[#FF5500]/10 border-[#FF5500]/20";
            case "vault":
                return "text-purple-400 bg-purple-500/10 border-purple-500/20";
        }
    };

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
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-4 pb-0">
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-3">
                                    {step === "configure" && (
                                        <button
                                            onClick={() => {
                                                setStep("select");
                                                setSelectedToken(null);
                                            }}
                                            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                            </svg>
                                        </button>
                                    )}
                                    <div>
                                        <h2 className="text-lg font-semibold text-white">
                                            {step === "select" ? "Create Token Chat" : "Configure Chat"}
                                        </h2>
                                        <p className="text-zinc-500 text-xs mt-0.5">
                                            {step === "select"
                                                ? "Pick a token from your wallets or enter an address"
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
                        </div>

                        {/* Step 1: Token Selection */}
                        {step === "select" && (
                            <div className="flex-1 overflow-hidden flex flex-col">
                                {/* Wallet Sources Banner */}
                                {walletSources.length > 1 && (
                                    <div className="mx-4 mt-3 mb-1 flex items-center gap-1.5 flex-wrap">
                                        <span className="text-zinc-500 text-xs">Scanning:</span>
                                        {walletSources.map((ws, i) => (
                                            <span
                                                key={i}
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${getSourceColor(ws.type)}`}
                                            >
                                                {getSourceIcon(ws.type)}
                                                {getSourceLabel(ws)}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Mode Toggle */}
                                <div className="px-4 pt-3 pb-2">
                                    <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
                                        <button
                                            onClick={() => setMode("suggest")}
                                            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                                                mode === "suggest"
                                                    ? "bg-zinc-700 text-white"
                                                    : "text-zinc-400 hover:text-white"
                                            }`}
                                        >
                                            Your Tokens
                                        </button>
                                        <button
                                            onClick={() => setMode("manual")}
                                            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                                                mode === "manual"
                                                    ? "bg-zinc-700 text-white"
                                                    : "text-zinc-400 hover:text-white"
                                            }`}
                                        >
                                            Enter Address
                                        </button>
                                    </div>
                                </div>

                                {/* Suggest Mode */}
                                {mode === "suggest" && (
                                    <div className="flex-1 overflow-hidden flex flex-col px-4">
                                        {/* Search */}
                                        <div className="relative mb-2">
                                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                            <input
                                                type="text"
                                                value={tokenSearch}
                                                onChange={(e) => setTokenSearch(e.target.value)}
                                                placeholder="Search your tokens..."
                                                className="w-full py-2 pl-9 pr-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 text-sm"
                                            />
                                        </div>

                                        {/* Chain Filters */}
                                        {availableChains.length > 1 && (
                                            <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1 scrollbar-none shrink-0">
                                                <button
                                                    onClick={() => setSelectedChainFilter(null)}
                                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap transition-colors ${
                                                        !selectedChainFilter
                                                            ? "bg-[#FF5500]/20 text-[#FF5500] border border-[#FF5500]/30"
                                                            : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white"
                                                    }`}
                                                >
                                                    All
                                                </button>
                                                {availableChains.map((chain) => (
                                                    <button
                                                        key={chain.id}
                                                        onClick={() =>
                                                            setSelectedChainFilter(
                                                                selectedChainFilter === chain.id ? null : chain.id,
                                                            )
                                                        }
                                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                                                            selectedChainFilter === chain.id
                                                                ? "bg-[#FF5500]/20 text-[#FF5500] border border-[#FF5500]/30"
                                                                : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white"
                                                        }`}
                                                    >
                                                        <span>{chain.icon}</span>
                                                        {chain.name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Token List */}
                                        <div className="flex-1 overflow-y-auto pb-4 space-y-1.5">
                                            {isLoadingSuggestions && (
                                                <div className="flex flex-col items-center justify-center py-12 gap-3">
                                                    <div className="w-8 h-8 border-2 border-zinc-600 border-t-[#FF5500] rounded-full animate-spin" />
                                                    <div className="text-center">
                                                        <p className="text-zinc-400 text-sm font-medium">Loading your tokens</p>
                                                        <p className="text-zinc-600 text-xs mt-1">Checking across all wallets...</p>
                                                    </div>
                                                </div>
                                            )}

                                            {suggestError && (
                                                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                                                    <p className="text-red-400 text-sm">{suggestError}</p>
                                                </div>
                                            )}

                                            {!isLoadingSuggestions && groupedTokens.length === 0 && !suggestError && (
                                                <div className="text-center py-10">
                                                    <div className="text-3xl mb-2">🔍</div>
                                                    <p className="text-zinc-400 text-sm font-medium">
                                                        {tokenSearch ? "No matching tokens" : "No tokens found"}
                                                    </p>
                                                    <p className="text-zinc-600 text-xs mt-1">
                                                        {tokenSearch
                                                            ? "Try a different search"
                                                            : "Try entering a contract address manually"}
                                                    </p>
                                                    {!tokenSearch && (
                                                        <button
                                                            onClick={() => setMode("manual")}
                                                            className="mt-3 px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium rounded-lg transition-colors"
                                                        >
                                                            Enter Address
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            {groupedTokens.map((group) => {
                                                const chain = getChainById(group.chainId);
                                                return (
                                                    <motion.button
                                                        key={`${group.address}-${group.chainId}`}
                                                        initial={{ opacity: 0, y: 5 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        onClick={() => handleSelectSuggested(group)}
                                                        disabled={isFetchingToken}
                                                        className="w-full bg-zinc-800/40 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-xl p-3 transition-all text-left group disabled:opacity-60"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            {/* Token Logo */}
                                                            <div className="w-10 h-10 rounded-full bg-zinc-700 shrink-0 overflow-hidden flex items-center justify-center">
                                                                {group.logoUrl ? (
                                                                    // eslint-disable-next-line @next/next/no-img-element
                                                                    <img
                                                                        src={group.logoUrl}
                                                                        alt={group.symbol}
                                                                        className="w-full h-full object-cover"
                                                                        onError={(e) => {
                                                                            (e.target as HTMLImageElement).style.display = "none";
                                                                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                                                                        }}
                                                                    />
                                                                ) : null}
                                                                <span className={`text-sm font-bold text-zinc-300 ${group.logoUrl ? "hidden" : ""}`}>
                                                                    {group.symbol.slice(0, 2)}
                                                                </span>
                                                            </div>

                                                            {/* Token Info */}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-white font-semibold text-sm truncate">{group.symbol}</span>
                                                                    <span className="text-zinc-600 text-xs truncate">{group.name}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                                    <span className="text-zinc-500 text-xs">
                                                                        {chain?.icon} {chain?.name}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Balance */}
                                                            <div className="text-right shrink-0">
                                                                <p className="text-white text-sm font-medium">
                                                                    {group.totalBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                                                </p>
                                                                {group.totalUsd > 0 && (
                                                                    <p className="text-zinc-500 text-xs">
                                                                        ${group.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                                    </p>
                                                                )}
                                                            </div>

                                                            {/* Arrow */}
                                                            <svg className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                            </svg>
                                                        </div>

                                                        {/* Wallet Source Badges */}
                                                        {group.sources.length > 0 && (
                                                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                                                {group.sources.map((s, i) => (
                                                                    <span
                                                                        key={i}
                                                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${getSourceColor(s.source.type)}`}
                                                                    >
                                                                        {getSourceIcon(s.source.type)}
                                                                        {getSourceLabel(s.source)}
                                                                        <span className="opacity-70">
                                                                            {parseFloat(s.balanceFormatted).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                                        </span>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Manual Mode */}
                                {mode === "manual" && (
                                    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
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
                                                        <span className="font-medium text-sm">{selectedChain.name}</span>
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
                                                            className="absolute top-full mt-1 left-0 right-0 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl z-10 overflow-hidden max-h-48 overflow-y-auto"
                                                        >
                                                            {CHAIN_LIST.map((chain) => (
                                                                <button
                                                                    key={chain.id}
                                                                    onClick={() => {
                                                                        setSelectedChain(chain);
                                                                        setShowChainPicker(false);
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
                                            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
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
                                                        <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                                            onClick={handleSelectManual}
                                            disabled={!tokenInfo}
                                            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF7700] text-white font-medium transition-all hover:shadow-lg hover:shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 2: Configure */}
                        {step === "configure" && selectedToken && (
                            <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 space-y-4">
                                {/* Token Summary */}
                                <div className="flex items-center gap-3 p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-xl">
                                    <div className="w-9 h-9 rounded-full bg-zinc-700 shrink-0 overflow-hidden flex items-center justify-center">
                                        {selectedToken.logoUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={selectedToken.logoUrl}
                                                alt={selectedToken.symbol}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = "none";
                                                }}
                                            />
                                        ) : (
                                            <span className="text-xs font-bold text-zinc-300">
                                                {selectedToken.symbol.slice(0, 2)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-white text-sm font-medium">
                                            {selectedToken.symbol} on {getChainById(selectedToken.chainId)?.name}
                                        </p>
                                        <p className="text-zinc-500 text-xs truncate">{selectedToken.name}</p>
                                    </div>
                                    {(selectedToken.isOwner || selectedToken.isDeployer) && (
                                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-500/30 shrink-0">
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
                                            className="flex-1 py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20 transition-all text-sm"
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
                                        className="w-full py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20 transition-all resize-none text-sm"
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
                                            className="w-full py-3 px-4 pr-20 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20 transition-all text-sm"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 text-sm font-medium">
                                            {selectedToken.symbol}
                                        </span>
                                    </div>
                                    <p className="text-xs text-zinc-600 mt-1.5">
                                        Balance checked across all connected wallets (EOA, Spritz Wallet, Vaults).
                                    </p>
                                </div>

                                {/* Messaging Type */}
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                                        Messaging Type
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setMessagingType("standard")}
                                            className={`p-3 rounded-xl border-2 transition-all text-left ${
                                                messagingType === "standard"
                                                    ? "border-[#FF5500] bg-[#FF5500]/10"
                                                    : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-lg">☁️</span>
                                                <span className="text-white font-medium text-sm">Standard</span>
                                            </div>
                                            <p className="text-zinc-500 text-xs">
                                                Fast & reliable cloud storage
                                            </p>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMessagingType("waku")}
                                            className={`p-3 rounded-xl border-2 transition-all text-left ${
                                                messagingType === "waku"
                                                    ? "border-purple-500 bg-purple-500/10"
                                                    : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-lg">🌐</span>
                                                <span className="text-white font-medium text-sm">Decentralized</span>
                                            </div>
                                            <p className="text-zinc-500 text-xs">
                                                Censorship-resistant messaging
                                            </p>
                                        </button>
                                    </div>
                                    {messagingType === "waku" && (
                                        <p className="text-purple-400 text-xs mt-2 flex items-center gap-1">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                            </svg>
                                            Messages use Waku protocol for peer-to-peer delivery
                                        </p>
                                    )}
                                </div>

                                {/* Error */}
                                {error && (
                                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                                        <p className="text-red-400 text-sm">{error}</p>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-3 pt-1">
                                    <button
                                        onClick={onClose}
                                        className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCreate}
                                        disabled={isCreating || !chatName.trim()}
                                        className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF7700] text-white font-medium transition-all hover:shadow-lg hover:shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
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
