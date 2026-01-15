"use client";

import { useState, useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { useRecoverySigner } from "@/hooks/useRecoverySigner";
import { useEnsResolver } from "@/hooks/useEnsResolver";
import type { PasskeyCredential } from "@/lib/safeWallet";

interface RecoverySignerManagerProps {
    onClose?: () => void;
}

export function RecoverySignerManager({ onClose }: RecoverySignerManagerProps) {
    const { isConnected } = useAccount();
    const [passkeyCredential, setPasskeyCredential] = useState<PasskeyCredential | null>(null);
    const {
        recoveryInfo,
        isLoading,
        error,
        txHash,
        status,
        fetchRecoveryInfo,
        addRecoveryWithPasskey,
        addRecoveryWithWallet,
    } = useRecoverySigner();

    // ENS resolver for recovery address
    const {
        input: recoveryInput,
        resolvedAddress: resolvedRecoveryAddress,
        ensName: recoveryEnsName,
        isResolving: isResolvingEns,
        error: ensError,
        isValid: isRecoveryAddressValid,
        setInput: setRecoveryInput,
        clear: clearRecoveryInput,
    } = useEnsResolver();

    const [showAddForm, setShowAddForm] = useState(false);
    const formRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll to form and focus input when it opens
    useEffect(() => {
        if (showAddForm) {
            // Small delay to ensure DOM is updated
            setTimeout(() => {
                formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                inputRef.current?.focus();
            }, 100);
        }
    }, [showAddForm]);

    // Fetch recovery info and passkey credential on mount
    useEffect(() => {
        fetchRecoveryInfo();
        
        // Fetch passkey credential for signing (only needed for passkey users)
        const fetchPasskey = async () => {
            try {
                const response = await fetch("/api/passkey/credentials?includeKeys=true", {
                    credentials: "include",
                });
                if (response.ok) {
                    const data = await response.json();
                    // Find the wallet key passkey
                    const walletKey = data.credentials?.find((c: { isWalletKey?: boolean }) => c.isWalletKey);
                    if (walletKey?.publicKeyX && walletKey?.publicKeyY) {
                        setPasskeyCredential({
                            credentialId: walletKey.credentialId,
                            publicKey: {
                                x: walletKey.publicKeyX,
                                y: walletKey.publicKeyY,
                            },
                        });
                    }
                }
            } catch (err) {
                console.error("[RecoverySigner] Error fetching passkey:", err);
            }
        };
        fetchPasskey();
    }, [fetchRecoveryInfo]);

    const handleAddRecovery = async () => {
        if (!resolvedRecoveryAddress) {
            alert("Please enter a valid Ethereum address or ENS name");
            return;
        }
        
        // Use wallet signing for wallet users, passkey for others
        if (recoveryInfo?.isWalletUser) {
            await addRecoveryWithWallet(resolvedRecoveryAddress);
        } else {
            if (!passkeyCredential) {
                alert("Passkey required to add recovery signer. Please set up a passkey first.");
                return;
            }
            await addRecoveryWithPasskey(resolvedRecoveryAddress, passkeyCredential);
        }
    };

    // Check if user can add recovery (has valid signing method)
    // Wallet users need their wallet connected, passkey users need a passkey credential
    const canAddRecovery = (recoveryInfo?.isWalletUser && isConnected) || !!passkeyCredential;

    const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    if (isLoading && !recoveryInfo) {
        return (
            <div className="bg-zinc-900 rounded-2xl p-4">
                <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
                    <span className="ml-3 text-zinc-400">Loading recovery info...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-zinc-900 rounded-2xl p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-white">Recovery Signer</h3>
                    <p className="text-xs text-zinc-500">Add a backup wallet to recover your Safe</p>
                </div>
                {onClose && (
                    <button onClick={onClose} className="text-zinc-400 hover:text-white">
                        ✕
                    </button>
                )}
            </div>

            {/* Wallet User Notice */}
            {recoveryInfo?.isWalletUser && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                    <p className="text-xs text-emerald-400 font-medium">✓ You&apos;re using a connected wallet</p>
                    <p className="text-xs text-zinc-400 mt-1">
                        Your wallet is a primary signer. You can add another wallet as a backup recovery signer.
                    </p>
                </div>
            )}

            {/* Safe Not Deployed */}
            {recoveryInfo && !recoveryInfo.isDeployed && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                    <p className="text-xs text-amber-400 font-medium">⚠️ Safe Not Yet Deployed</p>
                    <p className="text-xs text-zinc-400 mt-1">
                        Your Safe will be deployed with your first transaction. 
                        After that, you can add a recovery signer.
                    </p>
                </div>
            )}

            {/* Current Signers */}
            {recoveryInfo?.isDeployed && (
                <div className="bg-zinc-800 rounded-xl p-3 space-y-2">
                    <p className="text-xs text-zinc-400 font-medium">Current Owners ({recoveryInfo.owners.length})</p>
                    <div className="space-y-1">
                        {recoveryInfo.owners.map((owner, idx) => (
                            <div key={owner} className="flex items-center justify-between">
                                <code className="text-xs text-zinc-300 font-mono">
                                    {truncateAddress(owner)}
                                </code>
                                <span className="text-xs text-zinc-500">
                                    {owner.toLowerCase() === recoveryInfo.primarySigner.toLowerCase() 
                                        ? "Primary" 
                                        : "Recovery"}
                                </span>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-zinc-500 mt-2">
                        Threshold: {recoveryInfo.threshold} of {recoveryInfo.owners.length} required to sign
                    </p>
                </div>
            )}

            {/* Wallet not connected notice for wallet users */}
            {recoveryInfo?.isDeployed && recoveryInfo?.isWalletUser && !isConnected && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                    <p className="text-xs text-amber-400 font-medium">⚠️ Wallet Not Connected</p>
                    <p className="text-xs text-zinc-400 mt-1">
                        Connect your wallet to add a recovery signer.
                    </p>
                </div>
            )}

            {/* Add Recovery Signer */}
            {recoveryInfo?.isDeployed && !recoveryInfo.hasRecoverySigner && (
                <>
                    {!showAddForm ? (
                        <button
                            onClick={() => setShowAddForm(true)}
                            disabled={!canAddRecovery}
                            className="w-full py-3 rounded-xl font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            + Add Recovery Signer
                        </button>
                    ) : (
                        <div ref={formRef} className="space-y-3">
                            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
                                <p className="text-xs text-blue-400 font-medium">💡 How Recovery Works</p>
                                <p className="text-xs text-zinc-400 mt-1">
                                    {recoveryInfo.isWalletUser 
                                        ? "Add another wallet as a backup. Either wallet can sign transactions."
                                        : "Add any Ethereum wallet as a backup. If you lose your passkey, you can use this wallet to access your funds via the Safe app."
                                    }
                                </p>
                            </div>

                            <div>
                                <label className="text-xs text-zinc-400 block mb-1">
                                    Recovery Wallet Address
                                </label>
                                <div className="relative">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        value={recoveryInput}
                                        onChange={(e) => setRecoveryInput(e.target.value)}
                                        placeholder="0x... or ENS name"
                                        className={`w-full bg-zinc-800 rounded-xl px-3 py-2 text-white text-sm font-mono ${
                                            ensError ? "border border-red-500/50" : ""
                                        }`}
                                    />
                                    {isResolvingEns && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
                                        </div>
                                    )}
                                </div>
                                {/* Show resolved address for ENS names */}
                                {recoveryEnsName && resolvedRecoveryAddress && recoveryInput.includes(".") && (
                                    <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                                        <span>✓</span>
                                        <span className="text-zinc-500 font-mono">
                                            {resolvedRecoveryAddress.slice(0, 6)}...{resolvedRecoveryAddress.slice(-4)}
                                        </span>
                                    </p>
                                )}
                                {/* Show ENS name for addresses (reverse lookup) */}
                                {recoveryEnsName && resolvedRecoveryAddress && !recoveryInput.includes(".") && (
                                    <p className="text-xs text-purple-400 mt-1 flex items-center gap-1">
                                        <span>🏷️</span>
                                        <span>{recoveryEnsName}</span>
                                    </p>
                                )}
                                {/* Show ENS error */}
                                {ensError && (
                                    <p className="text-xs text-red-400 mt-1">{ensError}</p>
                                )}
                                <p className="text-xs text-zinc-600 mt-1">
                                    Use a wallet you control (MetaMask, hardware wallet, etc.)
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setShowAddForm(false);
                                        clearRecoveryInput();
                                    }}
                                    className="flex-1 py-2.5 rounded-xl font-medium bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddRecovery}
                                    disabled={status === "adding" || !isRecoveryAddressValid || isResolvingEns || !canAddRecovery}
                                    className="flex-1 py-2.5 rounded-xl font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {status === "adding" ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            {recoveryInfo?.isWalletUser ? "Confirm in wallet..." : "Sign with passkey..."}
                                        </span>
                                    ) : isResolvingEns ? (
                                        "Resolving..."
                                    ) : (
                                        "Add Recovery"
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Has Recovery Already */}
            {recoveryInfo?.hasRecoverySigner && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                    <p className="text-xs text-emerald-400 font-medium">✓ Recovery Signer Active</p>
                    <p className="text-xs text-zinc-400 mt-1">
                        Your Safe has a backup owner. You can recover access via the Safe app.
                    </p>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                    <p className="text-xs text-red-400">{error}</p>
                </div>
            )}

            {/* Success */}
            {status === "success" && txHash && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                    <p className="text-xs text-emerald-400 mb-1">✓ Recovery signer added!</p>
                    <a
                        href={`https://basescan.org/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:underline"
                    >
                        View transaction ↗
                    </a>
                </div>
            )}

            {/* Safe App Link */}
            {recoveryInfo?.safeAppUrl && (
                <a
                    href={recoveryInfo.safeAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-2.5 rounded-xl font-medium text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors text-center"
                >
                    🔐 Open in Safe App ↗
                </a>
            )}

            {/* Help Text */}
            <p className="text-xs text-zinc-600 text-center">
                Recovery signers let you access your wallet even if you lose your passkey.
            </p>
        </div>
    );
}
