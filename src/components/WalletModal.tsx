"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { type Address } from "viem";
import { useWalletBalances, formatUsd, formatTokenBalance } from "@/hooks/useWalletBalances";
import { useSmartWallet } from "@/hooks/useSmartWallet";
import { useTransactionHistory, formatRelativeTime, truncateAddress as truncateTxAddress, formatTxUsd, type Transaction } from "@/hooks/useTransactionHistory";
import { useSendTransaction, isValidAddress } from "@/hooks/useSendTransaction";
import { useSafeWallet } from "@/hooks/useSafeWallet";
import type { ChainBalance, TokenBalance } from "@/app/api/wallet/balances/route";
import { CHAIN_LIST } from "@/config/chains";

type WalletModalProps = {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string; // Spritz ID (identity)
    emailVerified?: boolean;
};

// Copy to clipboard helper
function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
}

// Truncate address for display
function truncateAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Chain balance row component
function ChainBalanceRow({ chainBalance }: { chainBalance: ChainBalance }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const { chain, nativeBalance, tokens, totalUsd, error } = chainBalance;
    
    const hasTokens = tokens.length > 0;

    return (
        <div className="border-b border-zinc-800/50 last:border-b-0">
            <button
                onClick={() => hasTokens && setIsExpanded(!isExpanded)}
                className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/30 transition-colors ${
                    hasTokens ? "cursor-pointer" : "cursor-default"
                }`}
            >
                {/* Chain icon */}
                <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                    style={{ backgroundColor: `${chain.color}20` }}
                >
                    {chain.icon}
                </div>

                {/* Chain name and native balance */}
                <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{chain.name}</span>
                        {hasTokens && (
                            <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                                +{tokens.length}
                            </span>
                        )}
                    </div>
                    {error ? (
                        <span className="text-xs text-red-400">{error}</span>
                    ) : nativeBalance ? (
                        <span className="text-sm text-zinc-400">
                            {formatTokenBalance(nativeBalance.balance, nativeBalance.decimals, nativeBalance.balanceFormatted)} {chain.symbol}
                        </span>
                    ) : (
                        <span className="text-sm text-zinc-500">0 {chain.symbol}</span>
                    )}
                </div>

                {/* USD value */}
                <div className="text-right">
                    <span className={`font-medium ${totalUsd > 0 ? "text-white" : "text-zinc-500"}`}>
                        {formatUsd(totalUsd)}
                    </span>
                </div>

                {/* Expand indicator */}
                {hasTokens && (
                    <svg
                        className={`w-4 h-4 text-zinc-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                )}
            </button>

            {/* Expanded token list */}
            <AnimatePresence>
                {isExpanded && hasTokens && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden bg-zinc-900/50"
                    >
                        {tokens.map((token, idx) => (
                            <TokenRow key={`${token.contractAddress}-${idx}`} token={token} />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Token row component
function TokenRow({ token }: { token: TokenBalance }) {
    return (
        <div className="px-4 py-2.5 pl-16 flex items-center gap-3 border-t border-zinc-800/30">
            {/* Token logo or fallback */}
            {token.logoUrl ? (
                <img src={token.logoUrl} alt={token.symbol} className="w-7 h-7 rounded-full" />
            ) : (
                <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300">
                    {token.symbol.slice(0, 2)}
                </div>
            )}

            {/* Token name and balance */}
            <div className="flex-1 min-w-0">
                <span className="text-sm text-white font-medium">{token.symbol}</span>
                <p className="text-xs text-zinc-500 truncate">
                    {formatTokenBalance(token.balance, token.decimals, token.balanceFormatted)} {token.name}
                </p>
            </div>

            {/* USD value */}
            <span className={`text-sm font-medium ${token.balanceUsd ? "text-zinc-300" : "text-zinc-600"}`}>
                {token.balanceUsd ? formatUsd(token.balanceUsd) : "-"}
            </span>
        </div>
    );
}

// Transaction row component
function TransactionRow({ tx, userAddress }: { tx: Transaction; userAddress: string }) {
    const isOutgoing = tx.type === "send" || tx.from.toLowerCase() === userAddress.toLowerCase();
    
    return (
        <a
            href={tx.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/30 transition-colors"
        >
            {/* Token logo with direction indicator */}
            <div className="relative">
                {tx.tokenLogo ? (
                    <img src={tx.tokenLogo} alt={tx.tokenSymbol} className="w-9 h-9 rounded-full" />
                ) : (
                    <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300">
                        {tx.tokenSymbol.slice(0, 2)}
                    </div>
                )}
                {/* Direction badge */}
                <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                    isOutgoing 
                        ? "bg-orange-500 text-white" 
                        : "bg-emerald-500 text-white"
                }`}>
                    {isOutgoing ? "↗" : "↙"}
                </div>
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-medium">
                        {isOutgoing ? "Sent" : "Received"} {tx.tokenSymbol}
                    </span>
                    <span className="text-xs text-zinc-600">{tx.chainIcon}</span>
                </div>
                <p className="text-xs text-zinc-500 truncate">
                    {isOutgoing ? "To: " : "From: "}
                    {truncateTxAddress(isOutgoing ? tx.to : tx.from)}
                </p>
            </div>

            {/* Amount and time */}
            <div className="text-right">
                <p className={`text-sm font-medium ${
                    isOutgoing ? "text-orange-400" : "text-emerald-400"
                }`}>
                    {isOutgoing ? "-" : "+"}{tx.valueFormatted} {tx.tokenSymbol}
                </p>
                <div className="flex items-center justify-end gap-1.5">
                    {tx.valueUsd !== null && (
                        <span className="text-xs text-zinc-500">{formatTxUsd(tx.valueUsd)}</span>
                    )}
                    <span className="text-xs text-zinc-600">
                        {formatRelativeTime(tx.timestamp)}
                    </span>
                </div>
            </div>
        </a>
    );
}

type TabType = "balances" | "send" | "history" | "receive";

export function WalletModal({ isOpen, onClose, userAddress, emailVerified }: WalletModalProps) {
    // Get Smart Wallet (Safe) address
    const { smartWallet, isLoading: isSmartWalletLoading } = useSmartWallet(
        isOpen ? userAddress : null
    );
    
    // Always use Smart Wallet address for balances - this is the user's Spritz wallet
    // Don't fall back to userAddress (EOA) as that's a different wallet
    const smartWalletAddress = smartWallet?.smartWalletAddress;
    const isSmartWalletReady = !!smartWalletAddress && !isSmartWalletLoading;
    
    const { balances, totalUsd, isLoading, error, lastUpdated, refresh } = useWalletBalances(
        isSmartWalletReady ? smartWalletAddress : null,
        isSmartWalletReady
    );

    // Transaction history - also uses Smart Wallet address
    const { 
        transactions, 
        isLoading: isLoadingTx, 
        refresh: refreshTx 
    } = useTransactionHistory(
        isSmartWalletReady ? smartWalletAddress : null
    );

    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>("balances");
    const [selectedChain, setSelectedChain] = useState<string>("all");

    // Send form state
    const [sendToken, setSendToken] = useState<TokenBalance | null>(null);
    const [sendRecipient, setSendRecipient] = useState("");
    const [sendAmount, setSendAmount] = useState("");
    const [showTokenSelector, setShowTokenSelector] = useState(false);
    const [showSendConfirm, setShowSendConfirm] = useState(false);

    // Send transaction hook
    const {
        status: sendStatus,
        error: sendError,
        txHash,
        gasEstimate,
        isEstimating,
        isSending,
        estimateGas,
        send,
        reset: resetSend,
    } = useSendTransaction();

    // Safe wallet hook (for sending from Spritz wallet)
    const {
        safeAddress,
        isDeployed: isSafeDeployed,
        isSending: isSafeSending,
        status: safeStatus,
        error: safeError,
        txHash: safeTxHash,
        estimatedGas: safeEstimatedGas,
        sendTransaction: sendSafeTransaction,
        estimateGas: estimateSafeGas,
        reset: resetSafe,
    } = useSafeWallet();

    // Use Safe for sending (preferred) or fallback to EOA
    const [useSafeForSend, setUseSafeForSend] = useState(true);
    const effectiveTxHash = useSafeForSend ? safeTxHash : txHash;
    const effectiveError = useSafeForSend ? safeError : sendError;
    const effectiveIsSending = useSafeForSend ? isSafeSending : isSending;

    // Estimate gas when recipient and amount are valid
    const handleEstimateGas = useCallback(async () => {
        if (!sendToken || !sendRecipient || !sendAmount) return;
        if (!isValidAddress(sendRecipient)) return;
        
        if (useSafeForSend && safeAddress) {
            await estimateSafeGas(sendRecipient as Address, sendAmount);
        } else {
            await estimateGas({
                to: sendRecipient as Address,
                value: sendAmount,
            });
        }
    }, [sendToken, sendRecipient, sendAmount, estimateGas, estimateSafeGas, useSafeForSend, safeAddress]);

    // Handle send confirmation
    const handleSend = useCallback(async () => {
        if (!sendToken || !sendRecipient || !sendAmount) return;
        if (!isValidAddress(sendRecipient)) return;

        let hash: string | null = null;

        if (useSafeForSend && safeAddress) {
            // Send via Safe smart wallet
            hash = await sendSafeTransaction(sendRecipient as Address, sendAmount);
        } else {
            // Send via connected EOA
            hash = await send({
                to: sendRecipient as Address,
                value: sendAmount,
            });
        }

        if (hash) {
            // Success - refresh balances after a delay
            setTimeout(() => {
                refresh();
                refreshTx();
            }, 2000);
        }
    }, [sendToken, sendRecipient, sendAmount, send, sendSafeTransaction, useSafeForSend, safeAddress, refresh, refreshTx]);

    // Reset send form
    const resetSendForm = useCallback(() => {
        setSendToken(null);
        setSendRecipient("");
        setSendAmount("");
        setShowSendConfirm(false);
        resetSend();
        resetSafe();
    }, [resetSend, resetSafe]);

    // Get all tokens flat for send selector
    const allTokens = useMemo(() => {
        const tokens: (TokenBalance & { chainIcon: string; chainName: string })[] = [];
        for (const chainBalance of balances) {
            if (chainBalance.nativeBalance) {
                tokens.push({
                    ...chainBalance.nativeBalance,
                    chainIcon: chainBalance.chain.icon,
                    chainName: chainBalance.chain.name,
                });
            }
            for (const token of chainBalance.tokens) {
                tokens.push({
                    ...token,
                    chainIcon: chainBalance.chain.icon,
                    chainName: chainBalance.chain.name,
                });
            }
        }
        // Sort by USD value
        return tokens.sort((a, b) => (b.balanceUsd || 0) - (a.balanceUsd || 0));
    }, [balances]);

    // Filter balances by selected chain
    const filteredBalances = selectedChain === "all" 
        ? balances 
        : balances.filter(b => b.chain.network === selectedChain);

    // Reset to balances tab when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setActiveTab("balances");
            setCopied(false);
            setSelectedChain("all");
        } else {
            // Reset send form when modal closes
            resetSendForm();
        }
    }, [isOpen, resetSendForm]);

    // Auto-estimate gas when send form is complete
    useEffect(() => {
        if (sendToken && sendRecipient && isValidAddress(sendRecipient) && sendAmount && parseFloat(sendAmount) > 0) {
            handleEstimateGas();
        }
    }, [sendToken, sendRecipient, sendAmount, handleEstimateGas]);

    // Copy wallet address
    const handleCopy = () => {
        if (!smartWalletAddress) return;
        copyToClipboard(smartWalletAddress);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Alias for clarity
    const handleCopySmartWallet = handleCopy;

    // Close on escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (isOpen) {
            document.addEventListener("keydown", handleEscape);
        }
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

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
                        onClick={(e) => e.stopPropagation()}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                    <span className="text-xl">💳</span>
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-white">Spritz Wallet</h2>
                                    <span className="text-xs text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                                        Beta
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Wallet Address Card */}
                        <div className="px-4 pt-4">
                            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3">
                                {isSmartWalletLoading ? (
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-zinc-700 animate-pulse" />
                                        <div className="flex-1">
                                            <div className="h-4 w-32 bg-zinc-700 rounded animate-pulse mb-1" />
                                            <div className="h-3 w-24 bg-zinc-800 rounded animate-pulse" />
                                        </div>
                                    </div>
                                ) : smartWalletAddress ? (
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 flex items-center justify-center text-xs font-bold text-black">
                                            {smartWalletAddress.slice(2, 4).toUpperCase()}
                                </div>
                                        <div className="flex-1 min-w-0">
                                            <code className="text-sm text-zinc-300 font-mono truncate block">
                                                {truncateAddress(smartWalletAddress)}
                                </code>
                                        </div>
                                <button
                                            onClick={handleCopySmartWallet}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                        copied 
                                            ? "bg-emerald-500/20 text-emerald-400" 
                                            : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                                    }`}
                                >
                                    {copied ? "✓ Copied" : "Copy"}
                                </button>
                                    </div>
                                ) : (
                                    <div className="text-center py-2 text-sm text-zinc-500">
                                        Unable to load wallet address
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Total Balance */}
                        <div className="px-4 py-4">
                            <div className="text-center">
                                <p className="text-sm text-zinc-500 mb-1">Spritz Wallet Balance</p>
                                {!isSmartWalletReady ? (
                                    <div className="h-9 w-32 mx-auto bg-zinc-800 rounded-lg animate-pulse" />
                                ) : isLoading && balances.length === 0 ? (
                                    <div className="h-9 w-32 mx-auto bg-zinc-800 rounded-lg animate-pulse" />
                                ) : (
                                    <p className="text-3xl font-bold text-white">{formatUsd(totalUsd)}</p>
                                )}
                                <p className="text-xs text-zinc-600 mt-1">
                                    Across {CHAIN_LIST.length} chains
                                </p>
                            </div>
                        </div>

                        {/* Tab Navigation */}
                        <div className="px-4 pb-3">
                            <div className="flex gap-1 p-1 bg-zinc-800/50 rounded-xl">
                                <button
                                    onClick={() => setActiveTab("balances")}
                                    className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                                        activeTab === "balances"
                                            ? "bg-zinc-700 text-white shadow-sm"
                                            : "text-zinc-400 hover:text-zinc-200"
                                    }`}
                                >
                                    💰 Assets
                                </button>
                                <button
                                    onClick={() => setActiveTab("send")}
                                    className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                                        activeTab === "send"
                                            ? "bg-zinc-700 text-white shadow-sm"
                                            : "text-zinc-400 hover:text-zinc-200"
                                    }`}
                                >
                                    📤 Send
                                </button>
                                <button
                                    onClick={() => setActiveTab("receive")}
                                    className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                                        activeTab === "receive"
                                            ? "bg-zinc-700 text-white shadow-sm"
                                            : "text-zinc-400 hover:text-zinc-200"
                                    }`}
                                >
                                    📥 Receive
                                </button>
                                <button
                                    onClick={() => setActiveTab("history")}
                                    className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                                        activeTab === "history"
                                            ? "bg-zinc-700 text-white shadow-sm"
                                            : "text-zinc-400 hover:text-zinc-200"
                                    }`}
                                >
                                    📜 History
                                </button>
                            </div>
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto border-t border-zinc-800/50">
                            {activeTab === "balances" && (
                                <>
                                    {/* Filter and Refresh bar */}
                                    <div className="px-4 py-2 flex items-center justify-between border-b border-zinc-800/50">
                                        {/* Chain filter */}
                                        <select
                                            value={selectedChain}
                                            onChange={(e) => setSelectedChain(e.target.value)}
                                            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600"
                                        >
                                            <option value="all">All Chains</option>
                                            {CHAIN_LIST.map((chain) => (
                                                <option key={chain.network} value={chain.network}>
                                                    {chain.icon} {chain.name}
                                                </option>
                                            ))}
                                        </select>
                                        
                                        <div className="flex items-center gap-2">
                                        <span className="text-xs text-zinc-500">
                                            {lastUpdated 
                                                    ? new Date(lastUpdated).toLocaleTimeString()
                                                    : "..."
                                            }
                                        </span>
                                        <button
                                            onClick={refresh}
                                            disabled={isLoading}
                                            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            {isLoading ? (
                                                <div className="w-4 h-4 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                            )}
                                        </button>
                                        </div>
                                    </div>

                                    {/* Chain balances */}
                                    <div>
                                        {error ? (
                                            <div className="p-8 text-center">
                                                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
                                                    <span className="text-2xl">⚠️</span>
                                                </div>
                                                <p className="text-red-400 mb-2">{error}</p>
                                                <button
                                                    onClick={refresh}
                                                    className="text-sm text-emerald-400 hover:underline"
                                                >
                                                    Try again
                                                </button>
                                            </div>
                                        ) : isLoading && balances.length === 0 ? (
                                            <div className="p-8 flex flex-col items-center gap-3">
                                                <div className="w-8 h-8 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
                                                <p className="text-sm text-zinc-500">Fetching balances...</p>
                                            </div>
                                        ) : filteredBalances.length === 0 ? (
                                            <div className="p-8 text-center">
                                                <p className="text-zinc-500 text-sm">No balances on this chain</p>
                                            </div>
                                        ) : (
                                            filteredBalances.map((chainBalance) => (
                                                <ChainBalanceRow
                                                    key={chainBalance.chain.id}
                                                    chainBalance={chainBalance}
                                                />
                                            ))
                                        )}
                                    </div>
                                </>
                            )}

                            {activeTab === "receive" && (
                                <div className="p-6">
                                    <div className="text-center mb-6">
                                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                                            <span className="text-3xl">📥</span>
                                        </div>
                                        <h3 className="text-lg font-semibold text-white mb-1">Receive Tokens</h3>
                                        <p className="text-sm text-zinc-500">
                                            Send tokens to your wallet on any supported chain
                                        </p>
                                    </div>

                                    {/* Loading state for smart wallet */}
                                    {isSmartWalletLoading && (
                                        <div className="flex items-center justify-center gap-2 mb-4">
                                            <div className="w-4 h-4 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin" />
                                            <span className="text-xs text-zinc-500">Loading wallet address...</span>
                                        </div>
                                    )}

                                    {/* QR Code - uses Smart Wallet address */}
                                    {smartWalletAddress && (
                                    <div className="bg-white p-4 rounded-2xl mb-4 mx-auto w-fit">
                                            <QRCodeSVG
                                                value={smartWalletAddress}
                                                size={176}
                                                level="M"
                                                includeMargin={false}
                                                bgColor="#ffffff"
                                                fgColor="#000000"
                                            />
                                        </div>
                                    )}

                                    {/* Wallet Address */}
                                    {smartWalletAddress && (
                                        <>
                                            <div className="mb-3">
                                                <div className="flex items-center justify-center mb-1.5">
                                                    <span className="text-xs font-medium text-zinc-400">Your Wallet Address</span>
                                    </div>
                                                <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3">
                                        <code className="text-xs text-zinc-300 font-mono break-all block text-center">
                                                        {smartWalletAddress}
                                        </code>
                                                </div>
                                    </div>

                                    <button
                                                onClick={handleCopySmartWallet}
                                                className={`w-full py-3 rounded-xl font-medium transition-all mb-4 ${
                                            copied 
                                                ? "bg-emerald-500 text-white" 
                                                : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                        }`}
                                    >
                                                {copied ? "✓ Address Copied!" : "Copy Address"}
                                    </button>
                                        </>
                                    )}

                                    {/* Supported chains */}
                                    <div className="mt-6">
                                        <p className="text-xs text-zinc-500 text-center mb-3">Supported Chains</p>
                                        <div className="flex flex-wrap justify-center gap-2">
                                            {CHAIN_LIST.map((chain) => (
                                                <div
                                                    key={chain.id}
                                                    className="px-2 py-1 bg-zinc-800 rounded-lg text-xs text-zinc-400 flex items-center gap-1"
                                                >
                                                    <span>{chain.icon}</span>
                                                    {chain.name}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === "send" && (
                                <div className="flex flex-col h-full relative">
                                    {/* Token Selector Modal */}
                                    <AnimatePresence>
                                        {showTokenSelector && (
                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                className="absolute inset-0 bg-zinc-900/95 z-10 flex flex-col"
                                            >
                                                <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                                                    <h4 className="text-sm font-medium text-white">Select Token</h4>
                                                    <button
                                                        onClick={() => setShowTokenSelector(false)}
                                                        className="p-1 text-zinc-400 hover:text-white"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                <div className="flex-1 overflow-y-auto">
                                                    {allTokens.length === 0 ? (
                                                        <div className="p-8 text-center text-zinc-500 text-sm">
                                                            No tokens with balance
                                                        </div>
                                                    ) : (
                                                        allTokens.map((token, idx) => (
                                                            <button
                                                                key={`${token.contractAddress}-${idx}`}
                                                                onClick={() => {
                                                                    setSendToken(token);
                                                                    setShowTokenSelector(false);
                                                                }}
                                                                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/50 transition-colors text-left"
                                                            >
                                                                {token.logoUrl ? (
                                                                    <img src={token.logoUrl} alt={token.symbol} className="w-8 h-8 rounded-full" />
                                                                ) : (
                                                                    <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium">
                                                                        {token.symbol.slice(0, 2)}
                                                                    </div>
                                                                )}
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm text-white font-medium">{token.symbol}</span>
                                                                        <span className="text-xs text-zinc-600">{(token as TokenBalance & { chainIcon?: string }).chainIcon}</span>
                                                                    </div>
                                                                    <p className="text-xs text-zinc-500">
                                                                        {formatTokenBalance(token.balance, token.decimals, token.balanceFormatted)}
                                                                    </p>
                                                                </div>
                                                                <span className="text-sm text-zinc-400">
                                                                    {token.balanceUsd ? formatUsd(token.balanceUsd) : "-"}
                                                                </span>
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <div className="p-4 space-y-4">
                                        {/* Token Selector */}
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-400 mb-2">
                                                Token
                                            </label>
                                            <button
                                                onClick={() => setShowTokenSelector(true)}
                                                className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3 hover:border-zinc-600 transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    {sendToken ? (
                                                        <>
                                                            {sendToken.logoUrl ? (
                                                                <img src={sendToken.logoUrl} alt={sendToken.symbol} className="w-8 h-8 rounded-full" />
                                                            ) : (
                                                                <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium text-zinc-300">
                                                                    {sendToken.symbol.slice(0, 2)}
                                                                </div>
                                                            )}
                                                            <div className="flex-1 text-left">
                                                                <p className="text-sm text-white font-medium">{sendToken.symbol}</p>
                                                                <p className="text-xs text-zinc-500">
                                                                    Balance: {formatTokenBalance(sendToken.balance, sendToken.decimals, sendToken.balanceFormatted)}
                                                                </p>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center">
                                                                <span>💰</span>
                                                            </div>
                                                            <div className="flex-1 text-left">
                                                                <p className="text-sm text-white font-medium">Select a token</p>
                                                                <p className="text-xs text-zinc-500">Choose from your balances</p>
                                                            </div>
                                                        </>
                                                    )}
                                                    <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </div>
                                            </button>
                                        </div>

                                        {/* Recipient Address */}
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-400 mb-2">
                                                Recipient
                                            </label>
                                            <input
                                                type="text"
                                                value={sendRecipient}
                                                onChange={(e) => setSendRecipient(e.target.value)}
                                                placeholder="0x..."
                                                className={`w-full bg-zinc-800/50 border rounded-xl p-3 text-white text-sm placeholder-zinc-500 focus:outline-none ${
                                                    sendRecipient && !isValidAddress(sendRecipient)
                                                        ? "border-red-500/50 focus:border-red-500"
                                                        : "border-zinc-700/50 focus:border-purple-500/50"
                                                }`}
                                            />
                                            {sendRecipient && !isValidAddress(sendRecipient) && (
                                                <p className="text-xs text-red-400 mt-1">Invalid address format</p>
                                            )}
                                        </div>

                                        {/* Amount */}
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-xs font-medium text-zinc-400">
                                                    Amount
                                                </label>
                                                {sendToken && (
                                                    <button
                                                        onClick={() => setSendAmount(sendToken.balanceFormatted)}
                                                        className="text-xs text-purple-400 hover:text-purple-300"
                                                    >
                                                        MAX
                                                    </button>
                                                )}
                                            </div>
                                            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        value={sendAmount}
                                                        onChange={(e) => setSendAmount(e.target.value)}
                                                        placeholder="0.00"
                                                        className="flex-1 bg-transparent text-white text-xl font-medium placeholder-zinc-500 focus:outline-none"
                                                    />
                                                    <span className="text-zinc-400 font-medium">
                                                        {sendToken?.symbol || "---"}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-zinc-500 mt-1">
                                                    ≈ {sendToken?.balanceUsd && sendAmount 
                                                        ? formatUsd((parseFloat(sendAmount) / parseFloat(sendToken.balanceFormatted)) * sendToken.balanceUsd)
                                                        : "$0.00"}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Gas Estimation & Summary */}
                                        {sendToken && sendRecipient && isValidAddress(sendRecipient) && sendAmount && parseFloat(sendAmount) > 0 && (
                                            <div className="bg-zinc-800/30 rounded-xl p-3 space-y-2">
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-zinc-500">Network Fee</span>
                                                    <span className="text-zinc-400">
                                                        {gasEstimate 
                                                            ? `~${gasEstimate.estimatedFeeUsd ? formatUsd(gasEstimate.estimatedFeeUsd) : gasEstimate.estimatedFeeFormatted + " ETH"}`
                                                            : "Estimating..."}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-zinc-500">Total</span>
                                                    <span className="text-zinc-300 font-medium">
                                                        {sendAmount} {sendToken.symbol}
                                                        {gasEstimate?.estimatedFeeUsd && sendToken.balanceUsd && sendAmount && (
                                                            <> + {formatUsd(gasEstimate.estimatedFeeUsd)} fee</>
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Safe wallet indicator */}
                                        {safeAddress && (
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-zinc-500">Send via</span>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setUseSafeForSend(!useSafeForSend)}
                                                        className={`px-2 py-1 rounded-lg transition-colors ${
                                                            useSafeForSend 
                                                                ? "bg-emerald-500/20 text-emerald-400" 
                                                                : "bg-zinc-700 text-zinc-400"
                                                        }`}
                                                    >
                                                        Safe Wallet
                                                    </button>
                                                    <button
                                                        onClick={() => setUseSafeForSend(!useSafeForSend)}
                                                        className={`px-2 py-1 rounded-lg transition-colors ${
                                                            !useSafeForSend 
                                                                ? "bg-purple-500/20 text-purple-400" 
                                                                : "bg-zinc-700 text-zinc-400"
                                                        }`}
                                                    >
                                                        EOA
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Error Message */}
                                        {effectiveError && (
                                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                                                <p className="text-xs text-red-400">{effectiveError}</p>
                                            </div>
                                        )}

                                        {/* Success Message */}
                                        {effectiveTxHash && (
                                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                                                <p className="text-xs text-emerald-400 mb-2">
                                                    Transaction sent{useSafeForSend ? " via Safe" : ""}!
                                                </p>
                                                <a
                                                    href={`https://etherscan.io/tx/${effectiveTxHash}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-emerald-300 hover:underline break-all"
                                                >
                                                    {effectiveTxHash.slice(0, 20)}...{effectiveTxHash.slice(-8)}
                                                </a>
                                            </div>
                                        )}
                                    </div>

                                    {/* Send Button - Fixed at bottom */}
                                    <div className="mt-auto p-4 border-t border-zinc-800/50">
                                        {effectiveTxHash ? (
                                            <button
                                                onClick={resetSendForm}
                                                className="w-full py-3 rounded-xl font-medium bg-zinc-700 text-white hover:bg-zinc-600 transition-colors"
                                            >
                                                Send Another
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleSend}
                                                disabled={
                                                    !sendToken ||
                                                    !sendRecipient ||
                                                    !isValidAddress(sendRecipient) ||
                                                    !sendAmount ||
                                                    parseFloat(sendAmount) <= 0 ||
                                                    effectiveIsSending
                                                }
                                                className={`w-full py-3 rounded-xl font-medium transition-colors ${
                                                    sendToken && sendRecipient && isValidAddress(sendRecipient) && sendAmount && parseFloat(sendAmount) > 0 && !effectiveIsSending
                                                        ? useSafeForSend ? "bg-emerald-500 text-white hover:bg-emerald-600" : "bg-purple-500 text-white hover:bg-purple-600"
                                                        : "bg-purple-500/20 text-purple-400 opacity-50 cursor-not-allowed"
                                                }`}
                                            >
                                                {effectiveIsSending ? (
                                                    <span className="flex items-center justify-center gap-2">
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        {useSafeForSend 
                                                            ? (safeStatus === "deploying" ? "Deploying Safe..." : "Signing...")
                                                            : (sendStatus === "confirming" ? "Confirm in Wallet..." : "Sending...")}
                                                    </span>
                                                ) : !sendToken ? (
                                                    "Select Token"
                                                ) : !sendRecipient ? (
                                                    "Enter Recipient"
                                                ) : !isValidAddress(sendRecipient) ? (
                                                    "Invalid Address"
                                                ) : !sendAmount || parseFloat(sendAmount) <= 0 ? (
                                                    "Enter Amount"
                                                ) : (
                                                    `Send ${sendAmount} ${sendToken.symbol}`
                                                )}
                                            </button>
                                        )}

                                        {/* Note about send method */}
                                        <p className="text-xs text-zinc-600 text-center mt-2">
                                            {useSafeForSend 
                                                ? "Sends via Safe Smart Wallet (gasless)" 
                                                : "Sends from your connected wallet"}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {activeTab === "history" && (
                                <div className="flex flex-col h-full">
                                    {/* Header with refresh */}
                                    <div className="px-4 py-2 flex items-center justify-between border-b border-zinc-800/50">
                                        <span className="text-xs text-zinc-500">
                                            {transactions.length} transactions
                                        </span>
                                        <button
                                            onClick={refreshTx}
                                            disabled={isLoadingTx}
                                            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            {isLoadingTx ? (
                                                <div className="w-4 h-4 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>

                                    {/* Transaction list */}
                                    <div className="flex-1 overflow-y-auto">
                                        {isLoadingTx && transactions.length === 0 ? (
                                            <div className="p-8 flex flex-col items-center gap-3">
                                                <div className="w-8 h-8 border-2 border-zinc-700 border-t-cyan-500 rounded-full animate-spin" />
                                                <p className="text-sm text-zinc-500">Loading transactions...</p>
                                            </div>
                                        ) : transactions.length === 0 ? (
                                            <div className="p-8 text-center">
                                                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-zinc-800 flex items-center justify-center">
                                                    <span className="text-xl">📭</span>
                                                </div>
                                                <p className="text-zinc-400 text-sm">No transactions yet</p>
                                                <p className="text-zinc-600 text-xs mt-1">
                                                    Transactions will appear here once you send or receive tokens
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-zinc-800/50">
                                                {transactions.map((tx) => (
                                                    <TransactionRow key={tx.hash} tx={tx} userAddress={smartWalletAddress || userAddress} />
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* View on Explorer button */}
                                    <div className="p-4 border-t border-zinc-800/50">
                                        <button
                                            onClick={() => {
                                                const address = smartWallet?.smartWalletAddress || userAddress;
                                                window.open(`https://basescan.org/address/${address}`, "_blank");
                                            }}
                                            className="w-full py-2.5 rounded-xl font-medium text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                                        >
                                            View All on Explorer ↗
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Settings/Backup moved to menu - keeping backup tab hidden for now */}
                            {false && activeTab === "backup" as never && (
                                <div className="p-6">
                                    <div className="text-center mb-6">
                                        <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${
                                            emailVerified ? "bg-emerald-500/10" : "bg-orange-500/10"
                                        }`}>
                                            <span className="text-3xl">{emailVerified ? "✅" : "🔐"}</span>
                                        </div>
                                        <h3 className="text-lg font-semibold text-white mb-1">
                                            {emailVerified ? "Account Protected" : "Backup Wallet"}
                                        </h3>
                                        <p className="text-sm text-zinc-500">
                                            {emailVerified 
                                                ? "Your account can be recovered via email"
                                                : "Secure your funds by backing up your wallet"
                                            }
                                        </p>
                                    </div>

                                    {/* Status message based on email verification */}
                                    {emailVerified ? (
                                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mb-6">
                                            <div className="flex gap-3">
                                                <span className="text-xl">📧</span>
                                                <div>
                                                    <p className="text-emerald-400 font-medium text-sm mb-1">
                                                        Email Recovery Enabled
                                                    </p>
                                                    <p className="text-xs text-zinc-400">
                                                        You can recover your wallet using your verified email address. 
                                                        Even if you lose access to this device or clear browser data, 
                                                        you can sign in again using email recovery.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mb-6">
                                        <div className="flex gap-3">
                                            <span className="text-xl">⚠️</span>
                                            <div>
                                                <p className="text-orange-400 font-medium text-sm mb-1">
                                                        No Recovery Method
                                                </p>
                                                <p className="text-xs text-zinc-400">
                                                        Your wallet is stored locally on this device. Verify your email 
                                                        in settings to enable account recovery, or export your private key 
                                                        as a backup.
                                                </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Backup options */}
                                    <div className="space-y-3">
                                        <button
                                            className="w-full py-3 px-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-medium text-white transition-colors flex items-center gap-3"
                                            onClick={() => {
                                                alert("Private key export coming soon!");
                                            }}
                                        >
                                            <span className="text-lg">🔑</span>
                                            <div className="text-left flex-1">
                                                <p className="text-sm font-medium">Export Private Key</p>
                                                <p className="text-xs text-zinc-500">View and copy your private key</p>
                                            </div>
                                            <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </button>

                                        <button
                                            className="w-full py-3 px-4 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-medium text-white transition-colors flex items-center gap-3"
                                            onClick={() => {
                                                alert("Seed phrase export coming soon!");
                                            }}
                                        >
                                            <span className="text-lg">📝</span>
                                            <div className="text-left flex-1">
                                                <p className="text-sm font-medium">Export Recovery Phrase</p>
                                                <p className="text-xs text-zinc-500">12 or 24 word seed phrase</p>
                                            </div>
                                            <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Security note */}
                                    <p className="text-xs text-zinc-600 text-center mt-6">
                                        🔒 Never share your private key or seed phrase with anyone
                                    </p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
