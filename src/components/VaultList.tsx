"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useVaults, type VaultListItem, type VaultDetails } from "@/hooks/useVaults";
import { getChainById } from "@/config/chains";
import { QRCodeSVG } from "qrcode.react";
import { useEnsResolver } from "@/hooks/useEnsResolver";
import type { VaultBalanceResponse, VaultTokenBalance } from "@/app/api/vault/[id]/balances/route";

type VaultListProps = {
    userAddress: string;
    onCreateNew: () => void;
};

// Common emojis for vaults
const VAULT_EMOJIS = ["🔐", "💰", "🏦", "💎", "🚀", "🌟", "🎯", "🔒", "💼", "🏠", "🎮", "🌈"];

// Tab types for vault detail view
type VaultTab = "assets" | "send" | "receive" | "activity";

export function VaultList({ userAddress, onCreateNew }: VaultListProps) {
    const { vaults, isLoading, getVault, updateVault, deleteVault } = useVaults(userAddress);
    const [selectedVault, setSelectedVault] = useState<VaultDetails | null>(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState<VaultTab>("assets");
    
    // Balance state
    const [balances, setBalances] = useState<VaultBalanceResponse | null>(null);
    const [isLoadingBalances, setIsLoadingBalances] = useState(false);
    
    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editEmoji, setEditEmoji] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    
    // Send state
    const ensResolver = useEnsResolver();
    const [sendAmount, setSendAmount] = useState("");
    const [sendToken, setSendToken] = useState<VaultTokenBalance | null>(null);
    const [isSending, setIsSending] = useState(false);

    // Fetch balances when vault is selected
    const fetchBalances = useCallback(async (vaultId: string) => {
        setIsLoadingBalances(true);
        try {
            const response = await fetch(`/api/vault/${vaultId}/balances`, {
                credentials: "include",
            });
            if (response.ok) {
                const data = await response.json();
                setBalances(data);
            }
        } catch (err) {
            console.error("[VaultList] Error fetching balances:", err);
        } finally {
            setIsLoadingBalances(false);
        }
    }, []);

    const handleViewVault = async (vault: VaultListItem) => {
        setIsLoadingDetails(true);
        setActiveTab("assets");
        setBalances(null);
        const details = await getVault(vault.id);
        setSelectedVault(details);
        setIsLoadingDetails(false);
        
        // Fetch balances after getting vault details
        if (details) {
            fetchBalances(details.id);
        }
    };

    const handleDelete = async (vaultId: string) => {
        if (!confirm("Are you sure you want to delete this vault?")) return;
        
        setIsDeleting(vaultId);
        try {
            await deleteVault(vaultId);
            if (selectedVault?.id === vaultId) {
                setSelectedVault(null);
            }
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to delete vault");
        } finally {
            setIsDeleting(null);
        }
    };

    const copyAddress = async (address: string) => {
        await navigator.clipboard.writeText(address);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const truncateAddress = (addr: string) => 
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    // Check if current user is the creator
    const isCreator = selectedVault?.creatorAddress.toLowerCase() === userAddress.toLowerCase();

    const startEditing = () => {
        if (!selectedVault) return;
        setEditName(selectedVault.name);
        setEditDescription(selectedVault.description || "");
        setEditEmoji(selectedVault.emoji);
        setIsEditing(true);
        setShowEmojiPicker(false);
    };

    const cancelEditing = () => {
        setIsEditing(false);
        setShowEmojiPicker(false);
    };

    const saveEdits = async () => {
        if (!selectedVault || !editName.trim()) return;
        
        setIsSaving(true);
        try {
            await updateVault(selectedVault.id, {
                name: editName.trim(),
                description: editDescription.trim() || undefined,
                emoji: editEmoji,
            });
            
            // Refresh vault details
            const updated = await getVault(selectedVault.id);
            if (updated) {
                setSelectedVault(updated);
            }
            setIsEditing(false);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to update vault");
        } finally {
            setIsSaving(false);
        }
    };

    // Format currency
    const formatUsd = (value: number | null) => {
        if (value === null) return "—";
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value);
    };

    // Format token balance
    const formatBalance = (balance: string, decimals = 4) => {
        const num = parseFloat(balance);
        if (num === 0) return "0";
        if (num < 0.0001) return "<0.0001";
        return num.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: decimals,
        });
    };

    // Get all tokens for send
    const getAllTokens = (): VaultTokenBalance[] => {
        if (!balances) return [];
        const tokens: VaultTokenBalance[] = [];
        if (balances.nativeBalance) {
            tokens.push(balances.nativeBalance);
        }
        tokens.push(...balances.tokens);
        return tokens;
    };

    // Handle send (placeholder for now)
    const handleSendTransaction = async () => {
        if (!selectedVault || !ensResolver.resolvedAddress || !sendAmount || !sendToken) return;
        
        setIsSending(true);
        try {
            // For now, just show a message - actual transaction creation will come later
            const displayTo = ensResolver.ensName 
                ? `${ensResolver.ensName} (${ensResolver.resolvedAddress})`
                : ensResolver.resolvedAddress;
            alert(`Transaction proposal feature coming soon!\n\nTo: ${displayTo}\nAmount: ${sendAmount} ${sendToken.symbol}\n\nThis will require ${selectedVault.threshold} of ${selectedVault.members.length} signatures.`);
            ensResolver.clear();
            setSendAmount("");
            setSendToken(null);
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to create transaction");
        } finally {
            setIsSending(false);
        }
    };

    // Details view
    if (selectedVault) {
        const chainInfo = getChainById(selectedVault.chainId);
        
        return (
            <div className="space-y-4">
                {/* Back button */}
                <button
                    onClick={() => {
                        setIsEditing(false);
                        setShowEmojiPicker(false);
                        setSelectedVault(null);
                        setBalances(null);
                        setActiveTab("assets");
                        ensResolver.clear();
                        setSendAmount("");
                        setSendToken(null);
                    }}
                    className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Vaults
                </button>

                {/* Vault header */}
                <div className="p-4 bg-zinc-800/50 rounded-xl">
                    {isEditing ? (
                        // Edit mode
                        <div className="space-y-3">
                            {/* Emoji picker */}
                            <div>
                                <label className="block text-xs text-zinc-400 mb-1">Emoji</label>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                        className="w-14 h-14 text-3xl bg-zinc-900 rounded-xl hover:bg-zinc-900/70 transition-colors flex items-center justify-center"
                                    >
                                        {editEmoji}
                                    </button>
                                    <AnimatePresence>
                                        {showEmojiPicker && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="absolute top-full left-0 mt-2 p-2 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl z-10 grid grid-cols-6 gap-1"
                                            >
                                                {VAULT_EMOJIS.map((emoji) => (
                                                    <button
                                                        key={emoji}
                                                        type="button"
                                                        onClick={() => {
                                                            setEditEmoji(emoji);
                                                            setShowEmojiPicker(false);
                                                        }}
                                                        className={`w-10 h-10 text-xl rounded-lg hover:bg-zinc-700 transition-colors ${
                                                            editEmoji === emoji ? "bg-orange-500/20 ring-2 ring-orange-500" : ""
                                                        }`}
                                                    >
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                            
                            {/* Name input */}
                            <div>
                                <label className="block text-xs text-zinc-400 mb-1">Name</label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    placeholder="Vault name"
                                    maxLength={50}
                                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                                />
                            </div>
                            
                            {/* Description input */}
                            <div>
                                <label className="block text-xs text-zinc-400 mb-1">Description (optional)</label>
                                <input
                                    type="text"
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    placeholder="What's this vault for?"
                                    maxLength={200}
                                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                                />
                            </div>
                            
                            {/* Action buttons */}
                            <div className="flex items-center gap-2 pt-2">
                                <button
                                    onClick={cancelEditing}
                                    disabled={isSaving}
                                    className="flex-1 px-3 py-2 bg-zinc-700 text-white text-sm font-medium rounded-lg hover:bg-zinc-600 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={saveEdits}
                                    disabled={isSaving || !editName.trim()}
                                    className="flex-1 px-3 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isSaving ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        "Save Changes"
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : (
                        // View mode
                        <div className="flex items-center gap-3">
                            <span className="text-3xl">{selectedVault.emoji}</span>
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-white">{selectedVault.name}</h3>
                                {selectedVault.description && (
                                    <p className="text-sm text-zinc-400">{selectedVault.description}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {isCreator && (
                                    <button
                                        onClick={startEditing}
                                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors"
                                        title="Edit vault"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                    </button>
                                )}
                                <div className="flex items-center gap-1">
                                    <span className="text-lg">{chainInfo?.icon}</span>
                                    <span className="text-sm text-zinc-400">{chainInfo?.name}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Total Balance */}
                <div className="p-4 bg-gradient-to-br from-orange-500/10 to-pink-500/10 border border-orange-500/20 rounded-xl">
                    <p className="text-xs text-zinc-400 mb-1">Total Balance</p>
                    {isLoadingBalances ? (
                        <div className="h-8 w-32 bg-zinc-700/50 rounded animate-pulse" />
                    ) : (
                        <p className="text-2xl font-bold text-white">
                            {formatUsd(balances?.totalUsd ?? 0)}
                        </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                            selectedVault.isDeployed
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-yellow-500/20 text-yellow-400"
                        }`}>
                            {selectedVault.isDeployed ? "Deployed" : "Not Deployed"}
                        </span>
                        <span className="text-xs text-zinc-500">
                            {selectedVault.threshold}/{selectedVault.members.length} signatures required
                        </span>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex gap-1 p-1 bg-zinc-800/50 rounded-xl">
                    {(["assets", "send", "receive", "activity"] as VaultTab[]).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all capitalize ${
                                activeTab === tab
                                    ? "bg-zinc-700 text-white shadow-sm"
                                    : "text-zinc-400 hover:text-zinc-200"
                            }`}
                        >
                            {tab === "assets" && "💰"}
                            {tab === "send" && "📤"}
                            {tab === "receive" && "📥"}
                            {tab === "activity" && "📜"}
                            <span className="ml-1.5 hidden sm:inline">{tab}</span>
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.15 }}
                    >
                        {/* Assets Tab */}
                        {activeTab === "assets" && (
                            <div className="space-y-2">
                                {isLoadingBalances ? (
                                    <div className="space-y-2">
                                        {[1, 2, 3].map((i) => (
                                            <div key={i} className="p-3 bg-zinc-800/50 rounded-xl animate-pulse">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-zinc-700 rounded-full" />
                                                    <div className="flex-1">
                                                        <div className="h-4 w-20 bg-zinc-700 rounded mb-1" />
                                                        <div className="h-3 w-16 bg-zinc-700/50 rounded" />
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="h-4 w-24 bg-zinc-700 rounded mb-1" />
                                                        <div className="h-3 w-16 bg-zinc-700/50 rounded" />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : balances?.nativeBalance || (balances?.tokens && balances.tokens.length > 0) ? (
                                    <>
                                        {/* Native Balance */}
                                        {balances?.nativeBalance && (
                                            <div className="p-3 bg-zinc-800/50 border border-zinc-700 rounded-xl">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-lg">
                                                        {chainInfo?.icon || "💎"}
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-sm font-medium text-white">
                                                            {balances.nativeBalance.symbol}
                                                        </p>
                                                        <p className="text-xs text-zinc-500">Native Token</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-medium text-white">
                                                            {formatBalance(balances.nativeBalance.balanceFormatted)}
                                                        </p>
                                                        <p className="text-xs text-zinc-500">
                                                            {formatUsd(balances.nativeBalance.balanceUsd)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* ERC20 Tokens */}
                                        {balances?.tokens.map((token) => (
                                            <div
                                                key={token.contractAddress}
                                                className="p-3 bg-zinc-800/50 border border-zinc-700 rounded-xl"
                                            >
                                                <div className="flex items-center gap-3">
                                                    {token.logoUrl ? (
                                                        <img
                                                            src={token.logoUrl}
                                                            alt={token.symbol}
                                                            className="w-10 h-10 rounded-full"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-300">
                                                            {token.symbol.slice(0, 2)}
                                                        </div>
                                                    )}
                                                    <div className="flex-1">
                                                        <p className="text-sm font-medium text-white">
                                                            {token.symbol}
                                                        </p>
                                                        <p className="text-xs text-zinc-500">{token.name}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-sm font-medium text-white">
                                                            {formatBalance(token.balanceFormatted)}
                                                        </p>
                                                        <p className="text-xs text-zinc-500">
                                                            {formatUsd(token.balanceUsd)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                ) : (
                                    <div className="text-center py-8">
                                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center text-3xl">
                                            💸
                                        </div>
                                        <h4 className="text-sm font-medium text-white mb-1">No Assets Yet</h4>
                                        <p className="text-xs text-zinc-500">
                                            Deposit funds to this vault to get started
                                        </p>
                                        <button
                                            onClick={() => setActiveTab("receive")}
                                            className="mt-3 px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                                        >
                                            Get Deposit Address
                                        </button>
                                    </div>
                                )}

                                {/* Refresh button */}
                                <button
                                    onClick={() => fetchBalances(selectedVault.id)}
                                    disabled={isLoadingBalances}
                                    className="w-full p-2 text-sm text-zinc-400 hover:text-white transition-colors flex items-center justify-center gap-2"
                                >
                                    <svg
                                        className={`w-4 h-4 ${isLoadingBalances ? "animate-spin" : ""}`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                        />
                                    </svg>
                                    Refresh Balances
                                </button>
                            </div>
                        )}

                        {/* Send Tab */}
                        {activeTab === "send" && (
                            <div className="space-y-4">
                                <div className="p-4 bg-zinc-800/50 rounded-xl space-y-4">
                                    {/* Token selector */}
                                    <div>
                                        <label className="block text-xs text-zinc-400 mb-2">Token</label>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {getAllTokens().map((token) => (
                                                <button
                                                    key={token.contractAddress}
                                                    onClick={() => setSendToken(token)}
                                                    className={`p-2 rounded-lg border text-left transition-all ${
                                                        sendToken?.contractAddress === token.contractAddress
                                                            ? "border-orange-500 bg-orange-500/10"
                                                            : "border-zinc-700 bg-zinc-900 hover:border-zinc-600"
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        {token.logoUrl ? (
                                                            <img src={token.logoUrl} alt="" className="w-6 h-6 rounded-full" />
                                                        ) : (
                                                            <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs">
                                                                {token.symbol.slice(0, 2)}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <p className="text-xs font-medium text-white">{token.symbol}</p>
                                                            <p className="text-[10px] text-zinc-500">
                                                                {formatBalance(token.balanceFormatted, 2)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </button>
                                            ))}
                                            {getAllTokens().length === 0 && (
                                                <p className="col-span-full text-sm text-zinc-500 text-center py-4">
                                                    No tokens available to send
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Amount input */}
                                    <div>
                                        <label className="block text-xs text-zinc-400 mb-2">Amount</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={sendAmount}
                                                onChange={(e) => setSendAmount(e.target.value)}
                                                placeholder="0.00"
                                                className="w-full px-3 py-3 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 pr-16"
                                            />
                                            {sendToken && (
                                                <button
                                                    onClick={() => setSendAmount(sendToken.balanceFormatted)}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-orange-400 hover:text-orange-300"
                                                >
                                                    MAX
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Recipient input with ENS support */}
                                    <div>
                                        <label className="block text-xs text-zinc-400 mb-2">Recipient Address or ENS</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={ensResolver.input}
                                                onChange={(e) => ensResolver.setInput(e.target.value)}
                                                placeholder="0x... or vitalik.eth"
                                                className={`w-full px-3 py-3 bg-zinc-900 border rounded-lg text-white placeholder-zinc-500 focus:outline-none font-mono text-sm ${
                                                    ensResolver.error 
                                                        ? "border-red-500 focus:border-red-500" 
                                                        : ensResolver.isValid
                                                            ? "border-emerald-500 focus:border-emerald-500"
                                                            : "border-zinc-700 focus:border-orange-500"
                                                }`}
                                            />
                                            {/* Loading indicator */}
                                            {ensResolver.isResolving && (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                    <div className="w-4 h-4 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                                                </div>
                                            )}
                                            {/* Valid indicator */}
                                            {!ensResolver.isResolving && ensResolver.isValid && (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                        {/* Show resolved info */}
                                        {ensResolver.ensName && ensResolver.resolvedAddress && (
                                            <p className="mt-1 text-xs text-emerald-400 flex items-center gap-1">
                                                <span>✓</span>
                                                <span className="font-medium">{ensResolver.ensName}</span>
                                                <span className="text-zinc-500">→</span>
                                                <span className="font-mono text-zinc-400">
                                                    {ensResolver.resolvedAddress.slice(0, 6)}...{ensResolver.resolvedAddress.slice(-4)}
                                                </span>
                                            </p>
                                        )}
                                        {/* Error message */}
                                        {ensResolver.error && (
                                            <p className="mt-1 text-xs text-red-400">{ensResolver.error}</p>
                                        )}
                                    </div>

                                    {/* Info box */}
                                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                        <p className="text-xs text-blue-300">
                                            <span className="font-medium">Multisig Required:</span> This transaction will require {selectedVault.threshold} of {selectedVault.members.length} members to sign before it can be executed.
                                        </p>
                                    </div>

                                    {/* Send button */}
                                    <button
                                        onClick={handleSendTransaction}
                                        disabled={!ensResolver.isValid || !sendAmount || !sendToken || isSending || ensResolver.isResolving}
                                        className="w-full py-3 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isSending ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Creating Proposal...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                </svg>
                                                Propose Transaction
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Receive Tab */}
                        {activeTab === "receive" && (
                            <div className="space-y-4">
                                <div className="p-6 bg-zinc-800/50 rounded-xl">
                                    <div className="flex flex-col items-center">
                                        {/* QR Code */}
                                        <div className="p-4 bg-white rounded-2xl mb-4">
                                            <QRCodeSVG
                                                value={selectedVault.safeAddress}
                                                size={180}
                                                level="H"
                                                includeMargin={false}
                                            />
                                        </div>

                                        {/* Chain badge */}
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-lg">{chainInfo?.icon}</span>
                                            <span className="text-sm text-zinc-400">{chainInfo?.name} Network</span>
                                        </div>

                                        {/* Address */}
                                        <button
                                            onClick={() => copyAddress(selectedVault.safeAddress)}
                                            className="w-full p-3 bg-zinc-900 rounded-lg hover:bg-zinc-900/70 transition-colors"
                                        >
                                            <p className="font-mono text-sm text-white break-all">
                                                {selectedVault.safeAddress}
                                            </p>
                                            <p className="text-xs text-orange-400 mt-2">
                                                {copied ? "✓ Copied!" : "Tap to copy"}
                                            </p>
                                        </button>

                                        {/* Warning */}
                                        <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg w-full">
                                            <p className="text-xs text-yellow-300 text-center">
                                                <span className="font-medium">⚠️ Important:</span> Only send {chainInfo?.name} network assets to this address
                                            </p>
                                        </div>

                                        {/* Explorer link */}
                                        {chainInfo?.explorerUrl && (
                                            <a
                                                href={`${chainInfo.explorerUrl}/address/${selectedVault.safeAddress}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="mt-4 text-sm text-orange-400 hover:text-orange-300 flex items-center gap-1"
                                            >
                                                View on Explorer
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                </svg>
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Activity Tab */}
                        {activeTab === "activity" && (
                            <div className="space-y-4">
                                {/* Pending Transactions */}
                                <div className="space-y-2">
                                    <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                                        Pending Transactions
                                    </h4>
                                    <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl text-center">
                                        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-zinc-700/50 flex items-center justify-center">
                                            <svg className="w-6 h-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        </div>
                                        <p className="text-sm text-zinc-400">No pending transactions</p>
                                        <p className="text-xs text-zinc-500 mt-1">
                                            Transactions requiring signatures will appear here
                                        </p>
                                    </div>
                                </div>

                                {/* Transaction History */}
                                <div className="space-y-2">
                                    <h4 className="text-sm font-medium text-zinc-300">Recent Activity</h4>
                                    <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl text-center">
                                        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-zinc-700/50 flex items-center justify-center">
                                            <svg className="w-6 h-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <p className="text-sm text-zinc-400">No activity yet</p>
                                        <p className="text-xs text-zinc-500 mt-1">
                                            Transaction history will appear here
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>

                {/* Members section (collapsed by default) */}
                <details className="group">
                    <summary className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl cursor-pointer hover:bg-zinc-800/70 transition-colors">
                        <span className="text-sm font-medium text-zinc-300">
                            Vault Members ({selectedVault.members.length})
                        </span>
                        <svg
                            className="w-5 h-5 text-zinc-500 transition-transform group-open:rotate-180"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </summary>
                    <div className="mt-2 space-y-2">
                        {selectedVault.members.map((member) => (
                            <div
                                key={member.address}
                                className={`p-3 rounded-xl border flex items-center gap-3 ${
                                    member.isCreator
                                        ? "bg-emerald-500/10 border-emerald-500/30"
                                        : "bg-zinc-800/50 border-zinc-700"
                                }`}
                            >
                                {member.avatar ? (
                                    <img
                                        src={member.avatar}
                                        alt=""
                                        className="w-10 h-10 rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white font-bold">
                                        {(member.username || member.address).slice(0, 2).toUpperCase()}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium text-white truncate">
                                            {member.nickname || member.username || truncateAddress(member.address)}
                                        </p>
                                        {member.isCreator && (
                                            <span className="text-xs px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">
                                                Creator
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-zinc-500 font-mono truncate">
                                        Signer: {truncateAddress(member.smartWalletAddress)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </details>

                {/* Delete button for undeployed vaults */}
                {!selectedVault.isDeployed && isCreator && (
                    <button
                        onClick={() => handleDelete(selectedVault.id)}
                        disabled={isDeleting === selectedVault.id}
                        className="w-full p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    >
                        {isDeleting === selectedVault.id ? "Deleting..." : "Delete Vault"}
                    </button>
                )}
            </div>
        );
    }

    // Loading state
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
            </div>
        );
    }

    // Empty state
    if (vaults.length === 0) {
        return (
            <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center text-3xl">
                    🔐
                </div>
                <h3 className="text-lg font-medium text-white mb-1">No Vaults Yet</h3>
                <p className="text-sm text-zinc-500 mb-4">
                    Create a shared wallet with your friends
                </p>
                <button
                    onClick={onCreateNew}
                    className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-xl hover:bg-orange-600 transition-colors"
                >
                    Create Your First Vault
                </button>
            </div>
        );
    }

    // Vault list
    return (
        <div className="space-y-3">
            {vaults.map((vault) => {
                const chainInfo = getChainById(vault.chainId);
                
                return (
                    <button
                        key={vault.id}
                        onClick={() => handleViewVault(vault)}
                        disabled={isLoadingDetails}
                        className="w-full p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl hover:border-zinc-600 transition-all text-left"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">{vault.emoji}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-medium text-white truncate">
                                        {vault.name}
                                    </h4>
                                    {vault.isCreator && (
                                        <span className="text-xs px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">
                                            Creator
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                                        <span>{chainInfo?.icon}</span>
                                        {chainInfo?.name}
                                    </span>
                                    <span className="text-xs text-zinc-600">•</span>
                                    <span className="text-xs text-zinc-500">
                                        {vault.threshold}/{vault.memberCount} sigs
                                    </span>
                                    <span className="text-xs text-zinc-600">•</span>
                                    <span className={`text-xs ${vault.isDeployed ? "text-emerald-400" : "text-yellow-400"}`}>
                                        {vault.isDeployed ? "Active" : "Pending"}
                                    </span>
                                </div>
                            </div>
                            <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </div>
                    </button>
                );
            })}

            {/* Create new button */}
            <button
                onClick={onCreateNew}
                className="w-full p-3 border border-dashed border-zinc-700 rounded-xl text-sm text-zinc-400 hover:border-orange-500/50 hover:text-orange-400 transition-colors flex items-center justify-center gap-2"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create New Vault
            </button>
        </div>
    );
}
