"use client";

import { useState } from "react";
import { useMultiChainSafeStatus, type ChainSafeStatus } from "@/hooks/useMultiChainSafeStatus";
import { useRecoverySigner } from "@/hooks/useRecoverySigner";
import { useEnsResolver } from "@/hooks/useEnsResolver";
import { useAccount } from "wagmi";
import type { PasskeyCredential } from "@/lib/safeWallet";

// Chain icons (simplified inline SVGs)
function ChainIcon({ chainId, size = 20 }: { chainId: number; size?: number }) {
    const style = { width: size, height: size };
    
    switch (chainId) {
        case 1: // Ethereum
            return (
                <svg style={style} viewBox="0 0 784 1277" fill="none">
                    <path d="M392.07 0L383.5 29.11v873.79l8.57 8.55 392.06-231.75L392.07 0z" fill="#343434"/>
                    <path d="M392.07 0L0 679.7l392.07 231.76V496.18V0z" fill="#8C8C8C"/>
                    <path d="M392.07 981.17l-4.83 5.89v300.87l4.83 14.1 392.3-552.49-392.3 231.63z" fill="#3C3C3B"/>
                    <path d="M392.07 1302.03V981.17L0 749.54l392.07 552.49z" fill="#8C8C8C"/>
                </svg>
            );
        case 8453: // Base
            return (
                <svg style={style} viewBox="0 0 111 111" fill="none">
                    <circle cx="55.5" cy="55.5" r="55.5" fill="#0052FF"/>
                    <path d="M55.5 95C77.3152 95 95 77.3152 95 55.5C95 33.6848 77.3152 16 55.5 16C34.5254 16 17.4116 32.2826 16.0596 52.875H67.625V58.125H16.0596C17.4116 78.7174 34.5254 95 55.5 95Z" fill="white"/>
                </svg>
            );
        case 42161: // Arbitrum
            return (
                <svg style={style} viewBox="0 0 40 40" fill="none">
                    <rect width="40" height="40" rx="20" fill="#213147"/>
                    <path d="M22.3 22.0784L24.3784 26.9804L27.7941 25.6765L24.7549 18.251L22.3 22.0784Z" fill="#12AAFF"/>
                    <path d="M14.7255 25.6765L18.1412 26.9804L20.2196 22.0784L17.7647 18.251L14.7255 25.6765Z" fill="#12AAFF"/>
                </svg>
            );
        case 10: // Optimism
            return (
                <svg style={style} viewBox="0 0 28 28" fill="none">
                    <rect width="28" height="28" rx="14" fill="#FF0420"/>
                    <path d="M9.22 18.35c-.97 0-1.81-.2-2.51-.61-.7-.41-1.24-.99-1.61-1.73-.37-.75-.56-1.62-.56-2.61 0-1 .19-1.87.56-2.61.38-.75.92-1.33 1.62-1.74.7-.42 1.53-.62 2.5-.62.68 0 1.29.1 1.82.31.53.2.98.49 1.34.87l-1.09 1.15c-.5-.53-1.15-.79-1.96-.79-.55 0-1.03.13-1.44.38-.4.25-.72.61-.94 1.08-.22.46-.33 1.01-.33 1.65 0 .63.11 1.18.33 1.65.22.46.54.82.95 1.07.41.25.9.37 1.46.37.81 0 1.46-.27 1.96-.81l1.09 1.16c-.36.38-.81.68-1.35.88-.54.2-1.15.31-1.84.31z" fill="white"/>
                </svg>
            );
        case 137: // Polygon
            return (
                <svg style={style} viewBox="0 0 38 33" fill="none">
                    <path d="M28.8 10.075c-.65-.375-1.5-.375-2.25 0l-5.25 3.075-3.525 2.025-5.175 3.075c-.65.375-1.5.375-2.25 0l-4.05-2.4c-.65-.375-1.125-1.125-1.125-1.95V9.925c0-.75.375-1.5 1.125-1.95l4.05-2.325c.65-.375 1.5-.375 2.25 0l4.05 2.4c.65.375 1.125 1.125 1.125 1.95v3.075l3.525-2.1V7.9c0-.75-.375-1.5-1.125-1.95L13.8.8c-.65-.375-1.5-.375-2.25 0L5.1 5.95C4.35 6.4 3.975 7.15 3.975 7.9v10.35c0 .75.375 1.5 1.125 1.95l6.45 3.75c.65.375 1.5.375 2.25 0l5.175-3l3.525-2.1 5.175-3c.65-.375 1.5-.375 2.25 0l4.05 2.325c.65.375 1.125 1.125 1.125 1.95v3.975c0 .75-.375 1.5-1.125 1.95l-3.975 2.325c-.65.375-1.5.375-2.25 0l-4.05-2.325c-.65-.375-1.125-1.125-1.125-1.95v-3l-3.525 2.1v3.075c0 .75.375 1.5 1.125 1.95l6.45 3.75c.65.375 1.5.375 2.25 0l6.45-3.75c.65-.375 1.125-1.125 1.125-1.95V13.9c0-.75-.375-1.5-1.125-1.95l-6.525-3.875z" fill="#8247E5"/>
                </svg>
            );
        case 56: // BNB Chain
            return (
                <svg style={style} viewBox="0 0 32 32" fill="none">
                    <circle cx="16" cy="16" r="16" fill="#F3BA2F"/>
                    <path d="M12.116 14.404L16 10.52l3.886 3.886 2.26-2.26L16 6l-6.144 6.144 2.26 2.26zM6 16l2.26-2.26L10.52 16l-2.26 2.26L6 16zm6.116 1.596L16 21.48l3.886-3.886 2.26 2.259L16 26l-6.144-6.144-.003-.003 2.263-2.257z" fill="white"/>
                </svg>
            );
        default:
            return <span className="text-base">⬡</span>;
    }
}

interface ChainStatusRowProps {
    chain: ChainSafeStatus;
    onAddRecovery: (chainId: number) => void;
    isAddingRecovery: boolean;
    selectedChainForRecovery: number | null;
}

function ChainStatusRow({ chain, onAddRecovery, isAddingRecovery, selectedChainForRecovery }: ChainStatusRowProps) {
    const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    const isSelected = selectedChainForRecovery === chain.chainId;
    
    return (
        <div className={`bg-zinc-800/50 rounded-xl p-3 border transition-colors ${
            chain.balanceUsd > 0 && !chain.hasRecoverySigner && chain.isDeployed
                ? "border-amber-500/30"
                : chain.hasRecoverySigner
                ? "border-emerald-500/30"
                : "border-zinc-700/30"
        }`}>
            {/* Chain Header */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <ChainIcon chainId={chain.chainId} size={24} />
                    <div>
                        <p className="text-sm font-medium text-white">{chain.chainName}</p>
                        {chain.balanceUsd > 0 && (
                            <p className="text-xs text-zinc-400">
                                ${chain.balanceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </p>
                        )}
                    </div>
                </div>
                
                {/* Status Badge */}
                <div className="flex items-center gap-2">
                    {chain.isDeployed ? (
                        chain.hasRecoverySigner ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                                ✓ Protected
                            </span>
                        ) : chain.balanceUsd > 0 ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                                ⚠️ Needs Recovery
                            </span>
                        ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-400">
                                Deployed
                            </span>
                        )
                    ) : chain.balanceUsd > 0 ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                            Has Funds
                        </span>
                    ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500">
                            Not Deployed
                        </span>
                    )}
                </div>
            </div>

            {/* Details for deployed chains */}
            {chain.isDeployed && (
                <div className="space-y-2 pt-2 border-t border-zinc-700/30">
                    {/* Owners */}
                    <div className="flex items-start justify-between">
                        <span className="text-[10px] text-zinc-500">Owners ({chain.owners.length})</span>
                        <div className="text-right">
                            {chain.owners.map((owner, idx) => (
                                <div key={owner} className="flex items-center gap-1 justify-end">
                                    <code className="text-[10px] text-zinc-400 font-mono">
                                        {truncateAddress(owner)}
                                    </code>
                                    <span className="text-[9px] text-zinc-600">
                                        {owner === chain.primarySigner ? "(you)" : "(recovery)"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Threshold */}
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-zinc-500">Threshold</span>
                        <span className="text-[10px] text-zinc-400">{chain.threshold} of {chain.owners.length}</span>
                    </div>

                    {/* Add Recovery Button */}
                    {!chain.hasRecoverySigner && (
                        <button
                            onClick={() => onAddRecovery(chain.chainId)}
                            disabled={isAddingRecovery}
                            className="w-full mt-2 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                        >
                            {isSelected && isAddingRecovery ? "Adding..." : "+ Add Recovery Signer"}
                        </button>
                    )}

                    {/* Safe App Link */}
                    {chain.safeAppUrl && (
                        <a
                            href={chain.safeAppUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-center text-[10px] text-blue-400 hover:text-blue-300 mt-1"
                        >
                            Open in Safe App ↗
                        </a>
                    )}
                </div>
            )}

            {/* Info for non-deployed chains with funds */}
            {!chain.isDeployed && chain.balanceUsd > 0 && (
                <p className="text-[10px] text-zinc-500 mt-2 pt-2 border-t border-zinc-700/30">
                    Safe will deploy with your first transaction on this chain
                </p>
            )}
        </div>
    );
}

interface MultiChainSecurityProps {
    safeAddress: string;
    primarySigner: string;
    balances?: { chain: { id: number }; totalUsd: number }[];
}

export function MultiChainSecurity({ safeAddress, primarySigner, balances }: MultiChainSecurityProps) {
    const { isConnected } = useAccount();
    const { status, isLoading, error, refresh } = useMultiChainSafeStatus(safeAddress, primarySigner);
    const [selectedChainForRecovery, setSelectedChainForRecovery] = useState<number | null>(null);
    const [showAddRecoveryForm, setShowAddRecoveryForm] = useState(false);
    const [passkeyCredential, setPasskeyCredential] = useState<PasskeyCredential | null>(null);

    // Recovery signer hook
    const {
        status: recoveryStatus,
        error: recoveryError,
        txHash,
        addRecoveryWithPasskey,
        addRecoveryWithWallet,
    } = useRecoverySigner();

    // ENS resolver
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

    // Fetch passkey on mount
    useState(() => {
        const fetchPasskey = async () => {
            try {
                const response = await fetch("/api/passkey/credentials?includeKeys=true", {
                    credentials: "include",
                });
                if (response.ok) {
                    const data = await response.json();
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
                console.error("[MultiChainSecurity] Error fetching passkey:", err);
            }
        };
        fetchPasskey();
    });

    // Merge balance data from wallet balances hook
    const chainsWithBalances = status?.chains.map(chain => {
        const balanceData = balances?.find(b => b.chain.id === chain.chainId);
        return {
            ...chain,
            balanceUsd: balanceData?.totalUsd ?? chain.balanceUsd,
        };
    }) || [];

    // Sort by balance
    chainsWithBalances.sort((a, b) => b.balanceUsd - a.balanceUsd);

    const handleAddRecovery = (chainId: number) => {
        setSelectedChainForRecovery(chainId);
        setShowAddRecoveryForm(true);
    };

    const handleSubmitRecovery = async () => {
        if (!resolvedRecoveryAddress || !selectedChainForRecovery) return;

        // Determine signing method based on whether passkey exists
        if (passkeyCredential) {
            await addRecoveryWithPasskey(resolvedRecoveryAddress, passkeyCredential, selectedChainForRecovery);
        } else if (isConnected) {
            await addRecoveryWithWallet(resolvedRecoveryAddress, selectedChainForRecovery);
        }

        // Refresh status after adding
        if (recoveryStatus === "success") {
            refresh();
            setShowAddRecoveryForm(false);
            clearRecoveryInput();
        }
    };

    const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    if (isLoading && !status) {
        return (
            <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
                <span className="ml-3 text-zinc-400 text-sm">Loading security status...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 text-red-400 mb-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="font-medium">Failed to load security status</span>
                </div>
                <p className="text-zinc-400 text-sm mb-3">{error}</p>
                <button
                    onClick={refresh}
                    className="text-sm text-orange-400 hover:text-orange-300"
                >
                    Try again
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header with summary */}
            <div className="bg-zinc-900 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="text-base font-semibold text-white">Multi-Chain Security</h3>
                        <p className="text-xs text-zinc-500">Your Safe wallet across all chains</p>
                    </div>
                    <button
                        onClick={refresh}
                        disabled={isLoading}
                        className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors disabled:opacity-50"
                    >
                        <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>

                {/* Warning for chains needing recovery */}
                {status && status.summary.chainsNeedingRecovery > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-3">
                        <p className="text-xs text-amber-400 font-medium">
                            ⚠️ {status.summary.chainsNeedingRecovery} chain{status.summary.chainsNeedingRecovery > 1 ? 's' : ''} with funds need recovery signers
                        </p>
                        <p className="text-[10px] text-zinc-400 mt-1">
                            Add a backup wallet to protect your funds on each chain
                        </p>
                    </div>
                )}

                {/* Summary Stats */}
                {status && (
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-zinc-800/50 rounded-lg p-2">
                            <p className="text-lg font-bold text-white">{status.summary.deployedChains}</p>
                            <p className="text-[10px] text-zinc-500">Deployed</p>
                        </div>
                        <div className="bg-zinc-800/50 rounded-lg p-2">
                            <p className="text-lg font-bold text-emerald-400">{status.summary.chainsWithRecovery}</p>
                            <p className="text-[10px] text-zinc-500">Protected</p>
                        </div>
                        <div className="bg-zinc-800/50 rounded-lg p-2">
                            <p className="text-lg font-bold text-white">${status.summary.totalBalanceUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                            <p className="text-[10px] text-zinc-500">Total Value</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Add Recovery Form */}
            {showAddRecoveryForm && selectedChainForRecovery && (
                <div className="bg-zinc-900 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <ChainIcon chainId={selectedChainForRecovery} size={20} />
                            <h4 className="text-sm font-medium text-white">
                                Add Recovery on {chainsWithBalances.find(c => c.chainId === selectedChainForRecovery)?.chainName}
                            </h4>
                        </div>
                        <button
                            onClick={() => {
                                setShowAddRecoveryForm(false);
                                clearRecoveryInput();
                            }}
                            className="text-zinc-400 hover:text-white"
                        >
                            ✕
                        </button>
                    </div>

                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-2">
                        <p className="text-[10px] text-blue-400">
                            💡 This adds a backup wallet as co-owner on this specific chain. 
                            You&apos;ll need to add recovery separately on each chain where you have funds.
                        </p>
                    </div>

                    <div>
                        <label className="text-xs text-zinc-400 block mb-1">Recovery Wallet Address</label>
                        <input
                            type="text"
                            value={recoveryInput}
                            onChange={(e) => setRecoveryInput(e.target.value)}
                            placeholder="0x... or ENS name"
                            className="w-full bg-zinc-800 rounded-lg px-3 py-2 text-white text-sm font-mono"
                        />
                        {recoveryEnsName && resolvedRecoveryAddress && (
                            <p className="text-xs text-emerald-400 mt-1">
                                ✓ {truncateAddress(resolvedRecoveryAddress)}
                            </p>
                        )}
                        {ensError && <p className="text-xs text-red-400 mt-1">{ensError}</p>}
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                setShowAddRecoveryForm(false);
                                clearRecoveryInput();
                            }}
                            className="flex-1 py-2 rounded-lg bg-zinc-700 text-zinc-300 text-sm hover:bg-zinc-600"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmitRecovery}
                            disabled={recoveryStatus === "adding" || !isRecoveryAddressValid || isResolvingEns}
                            className="flex-1 py-2 rounded-lg bg-emerald-500 text-white text-sm hover:bg-emerald-600 disabled:opacity-50"
                        >
                            {recoveryStatus === "adding" ? "Signing..." : "Add Recovery"}
                        </button>
                    </div>

                    {recoveryError && (
                        <p className="text-xs text-red-400">{recoveryError}</p>
                    )}
                    {txHash && (
                        <p className="text-xs text-emerald-400">✓ Recovery added! TX: {truncateAddress(txHash)}</p>
                    )}
                </div>
            )}

            {/* Chain List */}
            <div className="space-y-2">
                {chainsWithBalances.map((chain) => (
                    <ChainStatusRow
                        key={chain.chainId}
                        chain={chain}
                        onAddRecovery={handleAddRecovery}
                        isAddingRecovery={recoveryStatus === "adding"}
                        selectedChainForRecovery={selectedChainForRecovery}
                    />
                ))}
            </div>

            {/* Help Text */}
            <div className="bg-zinc-900 rounded-xl p-4">
                <p className="text-xs text-zinc-500 font-medium mb-2">💡 Why per-chain recovery?</p>
                <p className="text-[10px] text-zinc-600">
                    Safe wallets are smart contracts deployed separately on each blockchain. 
                    A recovery signer added on Base doesn&apos;t protect your funds on Ethereum. 
                    Add recovery on each chain where you have funds.
                </p>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                    <p className="text-xs text-red-400">{error}</p>
                </div>
            )}
        </div>
    );
}
