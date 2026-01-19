"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useVaults, type VaultListItem, type VaultDetails } from "@/hooks/useVaults";
import { getChainById } from "@/config/chains";

type VaultListProps = {
    userAddress: string;
    onCreateNew: () => void;
};

// Common emojis for vaults
const VAULT_EMOJIS = ["🔐", "💰", "🏦", "💎", "🚀", "🌟", "🎯", "🔒", "💼", "🏠", "🎮", "🌈"];

export function VaultList({ userAddress, onCreateNew }: VaultListProps) {
    const { vaults, isLoading, getVault, updateVault, deleteVault } = useVaults(userAddress);
    const [selectedVault, setSelectedVault] = useState<VaultDetails | null>(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    
    // Edit state
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editEmoji, setEditEmoji] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    const handleViewVault = async (vault: VaultListItem) => {
        setIsLoadingDetails(true);
        const details = await getVault(vault.id);
        setSelectedVault(details);
        setIsLoadingDetails(false);
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

                {/* Safe address */}
                <div className="p-4 bg-zinc-800/50 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-zinc-400">Vault Address</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                            selectedVault.isDeployed
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-yellow-500/20 text-yellow-400"
                        }`}>
                            {selectedVault.isDeployed ? "Deployed" : "Not Deployed"}
                        </span>
                    </div>
                    <button
                        onClick={() => copyAddress(selectedVault.safeAddress)}
                        className="w-full flex items-center justify-between p-3 bg-zinc-900 rounded-lg hover:bg-zinc-900/70 transition-colors"
                    >
                        <span className="font-mono text-sm text-white">
                            {truncateAddress(selectedVault.safeAddress)}
                        </span>
                        <span className="text-xs text-zinc-500">
                            {copied ? "Copied!" : "Copy"}
                        </span>
                    </button>
                    {chainInfo?.explorerUrl && (
                        <a
                            href={`${chainInfo.explorerUrl}/address/${selectedVault.safeAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1"
                        >
                            View on {chainInfo.name} Explorer
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                        </a>
                    )}
                </div>

                {/* Threshold */}
                <div className="p-4 bg-zinc-800/50 rounded-xl">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-zinc-400">Required Signatures</span>
                        <span className="text-lg font-bold text-orange-400">
                            {selectedVault.threshold} of {selectedVault.members.length}
                        </span>
                    </div>
                </div>

                {/* Members */}
                <div className="space-y-2">
                    <h4 className="text-sm font-medium text-zinc-300">Vault Members</h4>
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

                {/* Actions */}
                {!selectedVault.isDeployed && (
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
