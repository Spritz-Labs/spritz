"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useFriendsWithWallets, type CreateVaultParams } from "@/hooks/useVaults";
import { CHAIN_LIST, SEND_ENABLED_CHAIN_IDS, getChainById } from "@/config/chains";

type CreateVaultModalProps = {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string;
    onCreate: (params: CreateVaultParams) => Promise<void>;
};

// Chains that support Safe multisig
const VAULT_CHAINS = CHAIN_LIST.filter(chain => 
    SEND_ENABLED_CHAIN_IDS.includes(chain.id)
);

export function CreateVaultModal({
    isOpen,
    onClose,
    userAddress,
    onCreate,
}: CreateVaultModalProps) {
    const { friends, isLoading: isLoadingFriends } = useFriendsWithWallets(userAddress);
    
    // Form state
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [emoji, setEmoji] = useState("🔐");
    const [selectedChain, setSelectedChain] = useState(8453); // Default to Base
    const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
    const [threshold, setThreshold] = useState(1);
    
    // UI state
    const [step, setStep] = useState<"details" | "members" | "threshold" | "confirm">("details");
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Reset form when modal opens
    useEffect(() => {
        if (isOpen) {
            setName("");
            setDescription("");
            setEmoji("🔐");
            setSelectedChain(8453);
            setSelectedFriends([]);
            setThreshold(1);
            setStep("details");
            setError(null);
        }
    }, [isOpen]);

    // Update threshold when friends change
    useEffect(() => {
        const totalSigners = selectedFriends.length + 1;
        if (threshold > totalSigners) {
            setThreshold(totalSigners);
        }
    }, [selectedFriends, threshold]);

    const totalSigners = selectedFriends.length + 1;
    const chainInfo = getChainById(selectedChain);

    const toggleFriend = (address: string) => {
        setSelectedFriends(prev => 
            prev.includes(address)
                ? prev.filter(a => a !== address)
                : [...prev, address]
        );
    };

    const handleCreate = async () => {
        if (!name.trim()) {
            setError("Vault name is required");
            return;
        }
        if (selectedFriends.length === 0) {
            setError("Select at least one friend to add to the vault");
            return;
        }

        setIsCreating(true);
        setError(null);

        try {
            await onCreate({
                name: name.trim(),
                description: description.trim() || undefined,
                emoji,
                chainId: selectedChain,
                members: selectedFriends.map(address => ({ address })),
                threshold,
            });
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create vault");
        } finally {
            setIsCreating(false);
        }
    };

    const truncateAddress = (addr: string) => 
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">{emoji}</span>
                            <div>
                                <h2 className="text-lg font-semibold text-white">
                                    Create Spritz Vault
                                </h2>
                                <p className="text-xs text-zinc-500">
                                    Shared wallet with friends
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                        >
                            <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Progress Steps */}
                    <div className="flex items-center justify-center gap-2 px-4 py-3 border-b border-zinc-800/50">
                        {["details", "members", "threshold", "confirm"].map((s, i) => (
                            <div key={s} className="flex items-center">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                                    step === s
                                        ? "bg-orange-500 text-white"
                                        : ["details", "members", "threshold", "confirm"].indexOf(step) > i
                                            ? "bg-emerald-500 text-white"
                                            : "bg-zinc-700 text-zinc-400"
                                }`}>
                                    {["details", "members", "threshold", "confirm"].indexOf(step) > i ? "✓" : i + 1}
                                </div>
                                {i < 3 && (
                                    <div className={`w-8 h-0.5 mx-1 ${
                                        ["details", "members", "threshold", "confirm"].indexOf(step) > i
                                            ? "bg-emerald-500"
                                            : "bg-zinc-700"
                                    }`} />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="p-4 max-h-[60vh] overflow-y-auto">
                        {/* Step 1: Details */}
                        {step === "details" && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                                        Vault Name
                                    </label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="e.g., Trip Fund, Shared Savings"
                                        className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                                        maxLength={50}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                                        Description (optional)
                                    </label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="What's this vault for?"
                                        className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
                                        rows={2}
                                        maxLength={200}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                                        Emoji Icon
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {["🔐", "💰", "🏦", "💎", "🌟", "🚀", "🎯", "🤝", "✨", "🏠"].map((e) => (
                                            <button
                                                key={e}
                                                onClick={() => setEmoji(e)}
                                                className={`w-10 h-10 rounded-lg text-xl transition-all ${
                                                    emoji === e
                                                        ? "bg-orange-500/20 border-2 border-orange-500"
                                                        : "bg-zinc-800 border border-zinc-700 hover:border-zinc-600"
                                                }`}
                                            >
                                                {e}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                                        Blockchain Network
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {VAULT_CHAINS.map((chain) => (
                                            <button
                                                key={chain.id}
                                                onClick={() => setSelectedChain(chain.id)}
                                                className={`flex items-center gap-2 p-3 rounded-xl border transition-all text-left ${
                                                    selectedChain === chain.id
                                                        ? "bg-orange-500/10 border-orange-500"
                                                        : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                                                }`}
                                            >
                                                <span className="text-lg">{chain.icon}</span>
                                                <div>
                                                    <p className="text-sm font-medium text-white">{chain.name}</p>
                                                    <p className="text-xs text-zinc-500">
                                                        {chain.id === 1 ? "Higher fees" : "Low fees"}
                                                    </p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Select Members */}
                        {step === "members" && (
                            <div className="space-y-4">
                                <p className="text-sm text-zinc-400">
                                    Select friends to add as vault signers. Only friends with Spritz Smart Wallets can be added.
                                </p>

                                {isLoadingFriends ? (
                                    <div className="flex items-center justify-center py-8">
                                        <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                                    </div>
                                ) : friends.length === 0 ? (
                                    <div className="text-center py-8">
                                        <p className="text-zinc-500">No eligible friends found.</p>
                                        <p className="text-sm text-zinc-600 mt-1">
                                            Friends need a Spritz Smart Wallet to be added to vaults.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {friends.map((friend) => (
                                            <button
                                                key={friend.address}
                                                onClick={() => toggleFriend(friend.address)}
                                                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                                                    selectedFriends.includes(friend.address)
                                                        ? "bg-orange-500/10 border-orange-500"
                                                        : "bg-zinc-800/50 border-zinc-700 hover:border-zinc-600"
                                                }`}
                                            >
                                                <div className="relative">
                                                    {friend.avatar ? (
                                                        <img
                                                            src={friend.avatar}
                                                            alt=""
                                                            className="w-10 h-10 rounded-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white font-bold">
                                                            {(friend.username || friend.address).slice(0, 2).toUpperCase()}
                                                        </div>
                                                    )}
                                                    {selectedFriends.includes(friend.address) && (
                                                        <div className="absolute -right-1 -bottom-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                                                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                            </svg>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 text-left">
                                                    <p className="text-sm font-medium text-white">
                                                        {friend.username || friend.ensName || truncateAddress(friend.address)}
                                                    </p>
                                                    <p className="text-xs text-zinc-500 font-mono">
                                                        {truncateAddress(friend.smartWalletAddress)}
                                                    </p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {selectedFriends.length > 0 && (
                                    <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
                                        <span className="text-sm text-zinc-400">Selected</span>
                                        <span className="text-sm font-medium text-orange-400">
                                            {selectedFriends.length} friend{selectedFriends.length !== 1 ? "s" : ""} + you
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 3: Threshold */}
                        {step === "threshold" && (
                            <div className="space-y-4">
                                <p className="text-sm text-zinc-400">
                                    How many signatures are required to execute transactions?
                                </p>

                                <div className="p-4 bg-zinc-800/50 rounded-xl">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-sm text-zinc-300">Required signatures</span>
                                        <span className="text-lg font-bold text-orange-400">
                                            {threshold} of {totalSigners}
                                        </span>
                                    </div>

                                    <input
                                        type="range"
                                        min={1}
                                        max={totalSigners}
                                        value={threshold}
                                        onChange={(e) => setThreshold(parseInt(e.target.value))}
                                        className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                    />

                                    <div className="flex justify-between mt-2 text-xs text-zinc-500">
                                        <span>1 (Any member)</span>
                                        <span>{totalSigners} (All members)</span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h4 className="text-sm font-medium text-zinc-300">Signers</h4>
                                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold">
                                            You
                                        </div>
                                        <div>
                                            <p className="text-sm text-white">You (Creator)</p>
                                            <p className="text-xs text-zinc-500 font-mono">
                                                {truncateAddress(userAddress)}
                                            </p>
                                        </div>
                                    </div>
                                    {selectedFriends.map((addr) => {
                                        const friend = friends.find(f => f.address === addr);
                                        return (
                                            <div key={addr} className="p-3 bg-zinc-800/50 border border-zinc-700 rounded-xl flex items-center gap-3">
                                                {friend?.avatar ? (
                                                    <img src={friend.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                                                        {(friend?.username || addr).slice(0, 2).toUpperCase()}
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="text-sm text-white">
                                                        {friend?.username || friend?.ensName || truncateAddress(addr)}
                                                    </p>
                                                    <p className="text-xs text-zinc-500 font-mono">
                                                        {truncateAddress(friend?.smartWalletAddress || addr)}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Step 4: Confirm */}
                        {step === "confirm" && (
                            <div className="space-y-4">
                                <div className="p-4 bg-zinc-800/50 rounded-xl space-y-3">
                                    <div className="flex items-center gap-3">
                                        <span className="text-3xl">{emoji}</span>
                                        <div>
                                            <h3 className="text-lg font-semibold text-white">{name}</h3>
                                            {description && (
                                                <p className="text-sm text-zinc-400">{description}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 bg-zinc-800/50 rounded-xl">
                                        <p className="text-xs text-zinc-500">Network</p>
                                        <p className="text-sm font-medium text-white flex items-center gap-1">
                                            <span>{chainInfo?.icon}</span>
                                            {chainInfo?.name}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-zinc-800/50 rounded-xl">
                                        <p className="text-xs text-zinc-500">Threshold</p>
                                        <p className="text-sm font-medium text-white">
                                            {threshold} of {totalSigners} signatures
                                        </p>
                                    </div>
                                </div>

                                <div className="p-3 bg-zinc-800/50 rounded-xl">
                                    <p className="text-xs text-zinc-500 mb-2">Members ({totalSigners})</p>
                                    <div className="flex flex-wrap gap-2">
                                        <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">
                                            You (Creator)
                                        </span>
                                        {selectedFriends.map((addr) => {
                                            const friend = friends.find(f => f.address === addr);
                                            return (
                                                <span key={addr} className="px-2 py-1 bg-orange-500/20 text-orange-400 text-xs rounded-full">
                                                    {friend?.username || truncateAddress(addr)}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                                    <p className="text-xs text-blue-300">
                                        💡 The vault will be created but not deployed on-chain until the first transaction. This saves gas costs.
                                    </p>
                                </div>

                                {error && (
                                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                                        <p className="text-sm text-red-400">{error}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center gap-3 p-4 border-t border-zinc-800">
                        {step !== "details" && (
                            <button
                                onClick={() => setStep(
                                    step === "members" ? "details" :
                                    step === "threshold" ? "members" : "threshold"
                                )}
                                disabled={isCreating}
                                className="px-4 py-2.5 rounded-xl text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
                            >
                                Back
                            </button>
                        )}
                        
                        <button
                            onClick={() => {
                                if (step === "details") {
                                    if (!name.trim()) {
                                        setError("Please enter a vault name");
                                        return;
                                    }
                                    setError(null);
                                    setStep("members");
                                } else if (step === "members") {
                                    if (selectedFriends.length === 0) {
                                        setError("Please select at least one friend");
                                        return;
                                    }
                                    setError(null);
                                    setStep("threshold");
                                } else if (step === "threshold") {
                                    setStep("confirm");
                                } else {
                                    handleCreate();
                                }
                            }}
                            disabled={isCreating || (step === "members" && friends.length === 0)}
                            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isCreating ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Creating...
                                </>
                            ) : step === "confirm" ? (
                                "Create Vault"
                            ) : (
                                "Continue"
                            )}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
