"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { type Address } from "viem";
import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { useWalletBalances, formatUsd, formatTokenBalance } from "@/hooks/useWalletBalances";
import { useSmartWallet } from "@/hooks/useSmartWallet";
import { useTransactionHistory, formatRelativeTime, truncateAddress as truncateTxAddress, formatTxUsd, type Transaction } from "@/hooks/useTransactionHistory";
import { useSendTransaction, isValidAddress } from "@/hooks/useSendTransaction";
import { useEnsResolver } from "@/hooks/useEnsResolver";
import { useSafeWallet } from "@/hooks/useSafeWallet";
import { useSafePasskeySend } from "@/hooks/useSafePasskeySend";
import { useOnramp } from "@/hooks/useOnramp";
import { PasskeyManager } from "./PasskeyManager";
import type { ChainBalance, TokenBalance } from "@/app/api/wallet/balances/route";
import { SEND_ENABLED_CHAIN_IDS, SUPPORTED_CHAINS, getChainById } from "@/config/chains";

// Chain info for display (must include ALL chains from SUPPORTED_CHAINS in chains.ts)
const CHAIN_INFO: Record<number, { name: string; icon: string; color: string; sponsorship: "free" | "usdc" | "none" }> = {
    1: { name: "Ethereum", icon: "🔷", color: "#627EEA", sponsorship: "usdc" },
    8453: { name: "Base", icon: "🔵", color: "#0052FF", sponsorship: "free" },
    42161: { name: "Arbitrum", icon: "⬡", color: "#28A0F0", sponsorship: "free" },
    10: { name: "Optimism", icon: "🔴", color: "#FF0420", sponsorship: "free" },
    137: { name: "Polygon", icon: "🟣", color: "#8247E5", sponsorship: "free" },
    56: { name: "BNB Chain", icon: "🔶", color: "#F3BA2F", sponsorship: "free" },
    130: { name: "Unichain", icon: "🦄", color: "#FF007A", sponsorship: "free" },
    43114: { name: "Avalanche", icon: "🔺", color: "#E84142", sponsorship: "none" }, // View only, send not yet enabled
};

type WalletModalProps = {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string; // Spritz ID (identity)
    emailVerified?: boolean;
    authMethod?: "wallet" | "email" | "passkey" | "world_id" | "alien_id" | "solana";
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

export function WalletModal({ isOpen, onClose, userAddress, emailVerified, authMethod }: WalletModalProps) {
    // Check if wallet is connected (for sending)
    const { isConnected } = useAccount();
    const { open: openConnectModal } = useAppKit();
    
    // Determine if user authenticated via passkey (needs Safe signing)
    const isPasskeyUser = authMethod === "passkey";
    
    // For email/digital_id/world_id/solana users, they should use passkey signing
    // This means we don't store any private keys - passkey is the only signer
    // Solana users need passkey because Solana wallets can't sign EVM transactions
    const isSolanaUser = authMethod === "solana";
    const needsPasskeyForSend = authMethod === "email" || authMethod === "alien_id" || authMethod === "world_id" || isSolanaUser;
    const canUsePasskeySigning = isPasskeyUser || needsPasskeyForSend;

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
    const [showPasskeyManager, setShowPasskeyManager] = useState(false);
    const [hasAcknowledgedChainWarning, setHasAcknowledgedChainWarning] = useState(false);
    
    // Selected chain for sending (default to Base)
    const [selectedChainId, setSelectedChainId] = useState<number>(8453);
    const [showChainSelector, setShowChainSelector] = useState(false);
    const selectedChainInfo = CHAIN_INFO[selectedChainId] || CHAIN_INFO[8453];

    // Send form state
    const [sendToken, setSendToken] = useState<TokenBalance | null>(null);
    const [sendAmount, setSendAmount] = useState("");
    
    // ENS resolver for recipient
    const {
        input: recipientInput,
        resolvedAddress: resolvedRecipient,
        ensName: recipientEnsName,
        isResolving: isResolvingEns,
        error: ensError,
        isValid: isRecipientValid,
        setInput: setRecipientInput,
        clear: clearRecipient,
    } = useEnsResolver();
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

    // Passkey Safe hook (for passkey users)
    const {
        status: passkeyStatus,
        error: passkeyError,
        txHash: passkeyTxHash,
        isSending: isPasskeySending,
        isReady: isPasskeyReady,
        initialize: initializePasskey,
        sendTransaction: sendPasskeyTransaction,
        reset: resetPasskey,
    } = useSafePasskeySend();

    // Initialize passkey Safe when modal opens for users who can use passkey signing
    // This includes: passkey users, email users, alien_id users, world_id users
    useEffect(() => {
        if (isOpen && canUsePasskeySigning && userAddress && !isPasskeyReady && passkeyStatus === "idle") {
            console.log("[WalletModal] Initializing passkey Safe for user:", userAddress.slice(0, 10), "authMethod:", authMethod);
            initializePasskey(userAddress as Address);
        }
    }, [isOpen, canUsePasskeySigning, userAddress, isPasskeyReady, passkeyStatus, initializePasskey, authMethod]);

    // Onramp (Buy crypto) hook
    const {
        status: onrampStatus,
        error: onrampError,
        initializeOnramp,
        openOnramp,
        reset: resetOnramp,
    } = useOnramp();

    // Use Safe for sending or EOA
    // Passkey users and email/digital_id users MUST use Safe (they have no EOA we control)
    // Wallet users can choose (default to EOA as it's more reliable)
    const [useSafeForSend, setUseSafeForSend] = useState(canUsePasskeySigning);
    
    // Determine effective state based on auth method
    // canUsePasskeySigning includes passkey, email, alien_id, world_id users
    const effectiveTxHash = canUsePasskeySigning ? passkeyTxHash : (useSafeForSend ? safeTxHash : txHash);
    const effectiveError = canUsePasskeySigning ? passkeyError : (useSafeForSend ? safeError : sendError);
    const effectiveIsSending = canUsePasskeySigning ? isPasskeySending : (useSafeForSend ? isSafeSending : isSending);

    // Estimate gas when recipient and amount are valid
    const handleEstimateGas = useCallback(async () => {
        if (!sendToken || !resolvedRecipient || !sendAmount) return;

        if (useSafeForSend && safeAddress) {
            await estimateSafeGas(resolvedRecipient, sendAmount);
        } else {
            await estimateGas({
                to: resolvedRecipient,
                value: sendAmount,
            });
        }
    }, [sendToken, resolvedRecipient, sendAmount, estimateGas, estimateSafeGas, useSafeForSend, safeAddress]);

    // Handle send confirmation
    const handleSend = useCallback(async () => {
        if (!sendToken || !resolvedRecipient || !sendAmount) return;

        let hash: string | null = null;
        
        // Determine if this is a native ETH transfer or ERC20 token transfer
        const isNativeTransfer = sendToken.tokenType === "native";
        const tokenAddress = isNativeTransfer ? undefined : sendToken.contractAddress as Address;
        const tokenDecimals = isNativeTransfer ? undefined : sendToken.decimals;

        if (canUsePasskeySigning) {
            // Send via passkey-signed Safe transaction
            // This works for passkey, email, alien_id, and world_id users
            console.log("[WalletModal] Sending via passkey Safe to:", resolvedRecipient, "authMethod:", authMethod);
            hash = await sendPasskeyTransaction(
                resolvedRecipient,
                sendAmount,
                tokenAddress,
                tokenDecimals,
                selectedChainId,
                smartWalletAddress as Address // Pass Safe address for USDC balance check
            );
        } else if (useSafeForSend && safeAddress) {
            // Send via Safe smart wallet (EOA signer)
            hash = await sendSafeTransaction(
                resolvedRecipient, 
                sendAmount,
                tokenAddress,
                tokenDecimals
            );
        } else {
            // Send via connected EOA (only supports native ETH for now)
            if (!isNativeTransfer) {
                console.warn("[WalletModal] EOA ERC20 transfers not yet implemented");
                // TODO: Implement EOA ERC20 transfers
            }
            hash = await send({
                to: resolvedRecipient,
                value: sendAmount,
            });
        }

        if (hash) {
            // Success - refresh balances after delays to catch blockchain indexing
            // First refresh after 3 seconds
            setTimeout(() => {
                refresh();
                refreshTx();
            }, 3000);
            // Second refresh after 8 seconds to catch any indexing lag
            setTimeout(() => {
                refresh();
                refreshTx();
            }, 8000);
        }
    }, [sendToken, resolvedRecipient, sendAmount, send, sendSafeTransaction, sendPasskeyTransaction, useSafeForSend, safeAddress, canUsePasskeySigning, authMethod, refresh, refreshTx]);

    // Reset send form
    const resetSendForm = useCallback(() => {
        setSendToken(null);
        clearRecipient();
        setSendAmount("");
        setShowSendConfirm(false);
        resetSend();
        resetSafe();
        resetPasskey();
    }, [clearRecipient, resetSend, resetSafe, resetPasskey]);

    // Get all tokens flat for send selector (only from send-enabled chains)
    const allTokens = useMemo(() => {
        const tokens: (TokenBalance & { chainIcon: string; chainName: string; chainId: number })[] = [];
        for (const chainBalance of balances) {
            // Include tokens from ALL send-enabled chains (not just selected)
            // This way users can see all their assets and select any
            if (!SEND_ENABLED_CHAIN_IDS.includes(chainBalance.chain.id)) {
                continue;
            }
            if (chainBalance.nativeBalance) {
                tokens.push({
                    ...chainBalance.nativeBalance,
                    chainIcon: chainBalance.chain.icon,
                    chainName: chainBalance.chain.name,
                    chainId: chainBalance.chain.id,
                });
            }
            for (const token of chainBalance.tokens) {
                tokens.push({
                    ...token,
                    chainIcon: chainBalance.chain.icon,
                    chainName: chainBalance.chain.name,
                    chainId: chainBalance.chain.id,
                });
            }
        }
        // Sort by USD value (highest first)
        return tokens.sort((a, b) => (b.balanceUsd || 0) - (a.balanceUsd || 0));
    }, [balances]);

    // Show ALL chains in balances view (not just send-enabled)
    // This ensures users can see their full portfolio across all supported chains
    // Send token selector is separately filtered to only send-enabled chains
    const filteredBalances = balances;
    
    // Get selected chain balance for display
    const selectedChainBalance = balances.find(b => b.chain.id === selectedChainId);

    // Reset to balances tab when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setActiveTab("balances");
            setCopied(false);
            setHasAcknowledgedChainWarning(false);
        } else {
            // Reset send form when modal closes
            resetSendForm();
            setHasAcknowledgedChainWarning(false);
        }
    }, [isOpen, resetSendForm]);

    // Auto-estimate gas when send form is complete
    useEffect(() => {
        if (sendToken && resolvedRecipient && sendAmount && parseFloat(sendAmount) > 0) {
            handleEstimateGas();
        }
    }, [sendToken, resolvedRecipient, sendAmount, handleEstimateGas]);

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
                                    {selectedChainInfo.icon} {selectedChainInfo.name}
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
                                        {/* Chain selector */}
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowChainSelector(!showChainSelector)}
                                                className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 hover:bg-zinc-700 transition-colors"
                                            >
                                                <span className="text-xs">{selectedChainInfo.icon}</span>
                                                <span className="text-xs text-zinc-300">{selectedChainInfo.name}</span>
                                                <svg className="w-3 h-3 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                            
                                            {/* Chain dropdown */}
                                            <AnimatePresence>
                                                {showChainSelector && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -5 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -5 }}
                                                        className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 min-w-[160px]"
                                                    >
                                                        {SEND_ENABLED_CHAIN_IDS.map((chainId) => {
                                                            const info = CHAIN_INFO[chainId];
                                                            if (!info) return null;
                                                            return (
                                                                <button
                                                                    key={chainId}
                                                                    onClick={() => {
                                                                        setSelectedChainId(chainId);
                                                                        setShowChainSelector(false);
                                                                    }}
                                                                    className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-700 transition-colors first:rounded-t-lg last:rounded-b-lg ${
                                                                        selectedChainId === chainId ? "bg-zinc-700" : ""
                                                                    }`}
                                                                >
                                                                    <span className="text-sm">{info.icon}</span>
                                                                    <span className="text-sm text-zinc-300 flex-1">{info.name}</span>
                                                                    {info.sponsorship === "free" ? (
                                                                        <span className="text-[10px] text-green-400 bg-green-900/30 px-1 rounded">Free</span>
                                                                    ) : (
                                                                        <span className="text-[10px] text-yellow-400 bg-yellow-900/30 px-1 rounded">USDC</span>
                                                                    )}
                                                                </button>
                                                            );
                                                        })}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>

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
                                    {/* Email/Digital ID users without passkey - must create one to unlock wallet */}
                                    {(smartWallet?.needsPasskey || (needsPasskeyForSend && passkeyStatus === "error")) ? (
                                        <div className="flex flex-col items-center justify-center text-center">
                                            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                                                <span className="text-3xl">🔐</span>
                                            </div>
                                            <h3 className="text-lg font-semibold text-white mb-2">Create Your Wallet</h3>
                                            <p className="text-sm text-zinc-400 mb-4 max-w-xs">
                                                {isSolanaUser ? (
                                                    <>Your Solana wallet works on Solana, but to use EVM chains (Ethereum, Base, etc.), you need a passkey.</>
                                                ) : (
                                                    <>Set up a passkey to create your wallet. Your passkey will be your wallet key - it&apos;s how you sign transactions.</>
                                                )}
                                            </p>
                                            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 mb-4 max-w-xs">
                                                <p className="text-xs text-purple-300 mb-2">
                                                    <strong>🔑 Your Passkey = Your Wallet Key</strong>
                                                </p>
                                                <p className="text-xs text-zinc-400">
                                                    Your passkey controls your wallet. If you delete your passkey, you&apos;ll lose access to any funds in your wallet.
                                                </p>
                                            </div>
                                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 max-w-xs">
                                                <p className="text-xs text-amber-300">
                                                    <strong>💡 Tip:</strong> Use a passkey that syncs across devices (iCloud Keychain, Google Password Manager, or a hardware key like YubiKey).
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => setShowPasskeyManager(true)}
                                                className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-xl transition-colors"
                                            >
                                                Create Passkey & Wallet
                                            </button>
                                            <p className="text-xs text-zinc-600 mt-4">
                                                🔒 Takes less than 30 seconds
                                            </p>
                                        </div>
                                    ) : (needsPasskeyForSend && passkeyStatus === "loading") || isSmartWalletLoading ? (
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4" />
                                            <p className="text-sm text-zinc-400">Loading wallet...</p>
                                        </div>
                                    ) : !hasAcknowledgedChainWarning ? (
                                        /* Chain warning - compact to fit without scrolling */
                                        <div className="flex flex-col items-center text-center px-2 py-1">
                                            <h3 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
                                                <span>⚠️</span> Supported Chains Only
                                            </h3>
                                            
                                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2.5 mb-2 w-full">
                                                <p className="text-xs text-emerald-400 font-medium mb-1.5">✓ Deposit on these chains:</p>
                                                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-zinc-300">
                                                    <span>🔷 Ethereum</span>
                                                    <span>🔵 Base</span>
                                                    <span>⬡ Arbitrum</span>
                                                    <span>🔴 Optimism</span>
                                                    <span>🟣 Polygon</span>
                                                    <span>🔶 BNB</span>
                                                    <span>🦄 Unichain</span>
                                                </div>
                                            </div>
                                            
                                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2.5 mb-3 w-full">
                                                <p className="text-xs text-red-400">
                                                    <strong>⚠️ Do NOT</strong> send from other chains (Avalanche, Solana, etc.) — funds may be <strong>permanently lost</strong>.
                                                </p>
                                            </div>
                                            
                                            <button
                                                onClick={() => setHasAcknowledgedChainWarning(true)}
                                                className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl transition-colors"
                                            >
                                                I Understand, Show My Address
                                            </button>
                                        </div>
                                    ) : (
                                        /* Normal receive flow - user has acknowledged warning */
                                        <>
                                    <div className="text-center mb-6">
                                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                                            <span className="text-3xl">📥</span>
                                        </div>
                                        <h3 className="text-lg font-semibold text-white mb-1">Receive Tokens</h3>
                                        <p className="text-sm text-zinc-500">
                                            Send tokens to your wallet on any supported chain
                                        </p>
                                    </div>

                                    {/* Passkey wallet warning - remind users that passkey = wallet key */}
                                    {smartWallet?.warning && needsPasskeyForSend && (
                                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4 mx-auto max-w-xs">
                                            <div className="flex items-start gap-2">
                                                <span className="text-amber-400 text-sm">🔑</span>
                                                <p className="text-xs text-amber-200/80">
                                                    <strong>Your passkey controls this wallet.</strong> Keep it safe - losing your passkey means losing access to funds.
                                                </p>
                                            </div>
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
                                                className={`w-full py-3 rounded-xl font-medium transition-all mb-3 ${
                                            copied 
                                                ? "bg-emerald-500 text-white" 
                                                : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                        }`}
                                    >
                                                {copied ? "✓ Address Copied!" : "Copy Address"}
                                    </button>

                                    {/* Buy Crypto with Coinbase */}
                                    <button
                                        onClick={async () => {
                                            if (onrampStatus === "ready") {
                                                openOnramp();
                                            } else if (smartWalletAddress) {
                                                const url = await initializeOnramp(smartWalletAddress, {
                                                    presetFiatAmount: 50,
                                                    defaultNetwork: "base",
                                                    defaultAsset: "USDC",
                                                });
                                                if (url) {
                                                    openOnramp();
                                                }
                                            }
                                        }}
                                        disabled={onrampStatus === "loading" || !smartWalletAddress}
                                        className="w-full py-3 rounded-xl font-medium transition-all mb-4 bg-[#0052FF]/20 text-[#0052FF] hover:bg-[#0052FF]/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {onrampStatus === "loading" ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-[#0052FF]/30 border-t-[#0052FF] rounded-full animate-spin" />
                                                Initializing...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-5 h-5" viewBox="0 0 32 32" fill="none">
                                                    <rect width="32" height="32" rx="16" fill="currentColor" fillOpacity="0.15"/>
                                                    <path d="M16 8C11.582 8 8 11.582 8 16s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8zm0 12.5a4.5 4.5 0 110-9 4.5 4.5 0 010 9z" fill="currentColor"/>
                                                </svg>
                                                Buy with Coinbase
                                            </>
                                        )}
                                    </button>
                                    {onrampError && (
                                        <p className="text-xs text-red-400 text-center mb-4">{onrampError}</p>
                                    )}
                                        </>
                                    )}

                                    {/* Supported chains - CRITICAL for users to understand */}
                                    <div className="mt-6 bg-zinc-800/50 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-emerald-400">✓</span>
                                            <span className="text-sm font-medium text-white">Deposit on these chains only:</span>
                                        </div>
                                        
                                        {/* Supported chain pills */}
                                        <div className="flex flex-wrap gap-2 mb-4">
                                            {SEND_ENABLED_CHAIN_IDS.map((chainId) => {
                                                const info = CHAIN_INFO[chainId];
                                                if (!info) return null;
                                                return (
                                                    <div 
                                                        key={chainId}
                                                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
                                                        style={{ backgroundColor: `${info.color}20`, color: info.color }}
                                                    >
                                                        <span>{info.icon}</span>
                                                        <span>{info.name}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Warning about unsupported chains */}
                                        <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
                                            <div className="flex gap-2">
                                                <span className="text-orange-400 text-sm">⚠️</span>
                                                <div>
                                                    <p className="text-xs text-orange-300 font-medium mb-1">
                                                        Do NOT deposit from other chains
                                                    </p>
                                                    <p className="text-xs text-zinc-400">
                                                        This is a Smart Wallet. Sending funds from unsupported chains 
                                                        (Avalanche, Solana, etc.) may result in <strong className="text-orange-300">permanent loss</strong>.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {activeTab === "send" && (
                                <div className="flex flex-col h-full relative">
                                    {/* Loading state */}
                                    {((canUsePasskeySigning && passkeyStatus === "loading") || isSmartWalletLoading) ? (
                                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                                            <div className="w-12 h-12 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-4" />
                                            <p className="text-sm text-zinc-400">Loading wallet...</p>
                                        </div>
                                    ) : (smartWallet?.needsPasskey || (canUsePasskeySigning && passkeyStatus === "error" && needsPasskeyForSend)) ? (
                                        /* Email/Digital ID users without a passkey - prompt to create one */
                                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                                            <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mb-4">
                                                <span className="text-3xl">🔐</span>
                                            </div>
                                            <h3 className="text-lg font-semibold text-white mb-2">Create Your Wallet</h3>
                                            <p className="text-sm text-zinc-400 mb-4 max-w-xs">
                                                {isSolanaUser ? (
                                                    <>Your Solana wallet can&apos;t sign EVM transactions. Create a passkey to get your EVM wallet.</>
                                                ) : (
                                                    <>Set up a passkey to create your wallet. Your passkey will be your wallet key - it signs all your transactions.</>
                                                )}
                                            </p>
                                            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 mb-6 max-w-xs">
                                                <p className="text-xs text-purple-300">
                                                    <strong>🔑 Your Passkey = Your Wallet Key</strong>
                                                    <br />
                                                    <span className="text-zinc-400">Keep it safe - losing it means losing wallet access.</span>
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => setShowPasskeyManager(true)}
                                                className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-xl transition-colors"
                                            >
                                                Create Passkey & Wallet
                                            </button>
                                            <p className="text-xs text-zinc-600 mt-4">
                                                🔒 Your passkey stays on your device
                                            </p>
                                        </div>
                                    ) : canUsePasskeySigning && passkeyStatus === "error" ? (
                                        /* Passkey users with an error */
                                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                                            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                                                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                            </div>
                                            <h3 className="text-lg font-semibold text-white mb-2">Setup Required</h3>
                                            <p className="text-sm text-zinc-400 mb-4 max-w-xs">
                                                {passkeyError || "Failed to initialize passkey wallet"}
                                            </p>
                                            <button
                                                onClick={() => {
                                                    resetPasskey();
                                                    if (userAddress) initializePasskey(userAddress as Address);
                                                }}
                                                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm"
                                            >
                                                Try Again
                                            </button>
                                        </div>
                                    ) : !isConnected && !canUsePasskeySigning ? (
                                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                                            <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mb-4">
                                                <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                                </svg>
                                            </div>
                                            <h3 className="text-lg font-semibold text-white mb-2">Connect Wallet to Send</h3>
                                            <p className="text-sm text-zinc-400 mb-6 max-w-xs">
                                                To send tokens, you need to connect an Ethereum wallet to sign transactions.
                                            </p>
                                            <button
                                                onClick={() => openConnectModal?.()}
                                                className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white font-medium rounded-xl transition-colors"
                                            >
                                                Connect Wallet
                                            </button>
                                            <p className="text-xs text-zinc-600 mt-4">
                                                Your Spritz wallet address will stay the same
                                            </p>
                                        </div>
                                    ) : (
                                    <>
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
                                                                    // Auto-switch to the token's chain
                                                                    if (token.chainId && token.chainId !== selectedChainId) {
                                                                        setSelectedChainId(token.chainId);
                                                                    }
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
                                                                        <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                                            <span>{token.chainIcon}</span>
                                                                            <span>{token.chainName}</span>
                                                                        </span>
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

                                        {/* Recipient Address with ENS support */}
                                        <div>
                                            <label className="block text-xs font-medium text-zinc-400 mb-2">
                                                Recipient
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={recipientInput}
                                                    onChange={(e) => setRecipientInput(e.target.value)}
                                                    placeholder="0x... or ENS name"
                                                    className={`w-full bg-zinc-800/50 border rounded-xl p-3 pr-10 text-white text-sm placeholder-zinc-500 focus:outline-none ${
                                                        recipientInput && !isRecipientValid && !isResolvingEns
                                                            ? "border-red-500/50 focus:border-red-500"
                                                            : isRecipientValid
                                                            ? "border-emerald-500/50 focus:border-emerald-500"
                                                            : "border-zinc-700/50 focus:border-purple-500/50"
                                                    }`}
                                                />
                                                {/* Status indicator */}
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                    {isResolvingEns ? (
                                                        <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                                                    ) : isRecipientValid ? (
                                                        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    ) : recipientInput ? (
                                                        <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    ) : null}
                                                </div>
                                            </div>
                                            {/* Show resolved address for ENS names */}
                                            {recipientEnsName && resolvedRecipient && recipientInput.includes(".") && (
                                                <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                                                    <span>✓</span>
                                                    <span className="text-zinc-500">{resolvedRecipient.slice(0, 6)}...{resolvedRecipient.slice(-4)}</span>
                                                </p>
                                            )}
                                            {/* Show ENS name for addresses */}
                                            {recipientEnsName && resolvedRecipient && !recipientInput.includes(".") && (
                                                <p className="text-xs text-purple-400 mt-1 flex items-center gap-1">
                                                    <span>🏷️</span>
                                                    <span>{recipientEnsName}</span>
                                                </p>
                                            )}
                                            {/* Show error */}
                                            {ensError && (
                                                <p className="text-xs text-red-400 mt-1">{ensError}</p>
                                            )}
                                            {/* Show invalid format error only if not resolving and not an ENS attempt */}
                                            {recipientInput && !isRecipientValid && !isResolvingEns && !ensError && !recipientInput.includes(".") && (
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
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={sendAmount}
                                                        onChange={(e) => {
                                                            // Only allow valid decimal numbers
                                                            const value = e.target.value;
                                                            if (value === "" || /^\d*\.?\d*$/.test(value)) {
                                                                setSendAmount(value);
                                                            }
                                                        }}
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
                                        {sendToken && resolvedRecipient && sendAmount && parseFloat(sendAmount) > 0 && (
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
                                        {safeAddress && !canUsePasskeySigning && (
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

                                        {/* Mainnet info for Safe wallet */}
                                        {useSafeForSend && selectedChainId === 1 && (
                                            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
                                                <div className="flex gap-2">
                                                    <span className="text-blue-400">ℹ️</span>
                                                    <div>
                                                        <p className="text-xs text-blue-300 font-medium">Ethereum mainnet gas fees</p>
                                                        <p className="text-xs text-zinc-400 mt-1">
                                                            Gas will be paid from your wallet&apos;s ETH balance.
                                                            For <strong className="text-emerald-400">free</strong> transactions, try Base or other L2 chains.
                                                        </p>
                                                    </div>
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
                                                    !resolvedRecipient ||
                                                    !sendAmount ||
                                                    parseFloat(sendAmount) <= 0 ||
                                                    effectiveIsSending ||
                                                    isResolvingEns
                                                }
                                                className={`w-full py-3 rounded-xl font-medium transition-colors ${
                                                    sendToken && resolvedRecipient && sendAmount && parseFloat(sendAmount) > 0 && !effectiveIsSending && !isResolvingEns
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
                                                ) : !recipientInput ? (
                                                    "Enter Recipient"
                                                ) : isResolvingEns ? (
                                                    "Resolving ENS..."
                                                ) : !resolvedRecipient ? (
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
                                                ? "⚡ Safe Wallet (experimental, gasless)"
                                                : "Sends from your connected wallet"}
                                        </p>
                                    </div>
                                </>
                                )}
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

            {/* Passkey Manager Modal */}
            {showPasskeyManager && (
                <PasskeyManager
                    userAddress={userAddress}
                    onClose={() => {
                        setShowPasskeyManager(false);
                        // Refresh smart wallet to check if user now has a passkey
                        if (smartWallet?.needsPasskey) {
                            window.location.reload();
                        }
                    }}
                    passkeyIsWalletKey={needsPasskeyForSend}
                    smartWalletAddress={smartWalletAddress}
                />
            )}
        </AnimatePresence>
    );
}
