"use client";

import { useState, useEffect } from "react";
import { useAccount, useBalance } from "wagmi";
import { type Address, formatEther, parseEther } from "viem";
import { useLegacySafeRecovery } from "@/hooks/useLegacySafeRecovery";

interface LegacySafeRecoveryProps {
    onClose?: () => void;
}

export function LegacySafeRecovery({ onClose }: LegacySafeRecoveryProps) {
    const { address: userAddress } = useAccount();
    const {
        legacySafe,
        status,
        error,
        txHash,
        checkLegacySafe,
        deployLegacySafe,
        withdrawFromLegacySafe,
    } = useLegacySafeRecovery();

    const [withdrawAmount, setWithdrawAmount] = useState("");
    const [withdrawTo, setWithdrawTo] = useState("");
    const chainId = 1; // Mainnet

    // Check legacy Safe on mount
    useEffect(() => {
        if (userAddress) {
            checkLegacySafe(chainId);
        }
    }, [userAddress, checkLegacySafe]);

    // Get balance of legacy Safe
    const { data: legacyBalance } = useBalance({
        address: legacySafe?.address,
        chainId,
    });

    // Set withdraw address to user's EOA by default
    useEffect(() => {
        if (userAddress && !withdrawTo) {
            setWithdrawTo(userAddress);
        }
    }, [userAddress, withdrawTo]);

    // Set max amount
    const handleMax = () => {
        if (legacyBalance) {
            // Leave some for gas estimation buffer
            const maxAmount = legacyBalance.value > parseEther("0.001") 
                ? formatEther(legacyBalance.value - parseEther("0.001"))
                : formatEther(legacyBalance.value);
            setWithdrawAmount(maxAmount);
        }
    };

    const handleDeploy = async () => {
        await deployLegacySafe(chainId);
    };

    const handleWithdraw = async () => {
        if (!withdrawTo || !withdrawAmount) return;
        await withdrawFromLegacySafe(chainId, withdrawTo as Address, withdrawAmount);
    };

    if (!legacySafe) {
        return (
            <div className="p-4 text-center text-zinc-400">
                <div className="w-6 h-6 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin mx-auto mb-2" />
                Checking legacy Safe...
            </div>
        );
    }

    const hasBalance = legacyBalance && legacyBalance.value > BigInt(0);

    return (
        <div className="bg-zinc-900 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Legacy Safe Recovery</h3>
                {onClose && (
                    <button onClick={onClose} className="text-zinc-400 hover:text-white">
                        ✕
                    </button>
                )}
            </div>

            <div className="bg-zinc-800 rounded-xl p-3 space-y-2">
                <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Legacy Safe Address:</span>
                    <a 
                        href={`https://etherscan.io/address/${legacySafe.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline font-mono"
                    >
                        {legacySafe.address.slice(0, 6)}...{legacySafe.address.slice(-4)}
                    </a>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Status:</span>
                    <div className="flex items-center gap-2">
                        <span className={legacySafe.isDeployed ? "text-emerald-400" : "text-amber-400"}>
                            {legacySafe.isDeployed ? "Deployed ✓" : "Not Deployed"}
                        </span>
                        <button
                            onClick={() => checkLegacySafe(chainId)}
                            className="text-xs text-zinc-500 hover:text-blue-400 transition-colors"
                            title="Refresh status"
                        >
                            🔄
                        </button>
                    </div>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Balance:</span>
                    <span className={hasBalance ? "text-emerald-400 font-medium" : "text-zinc-500"}>
                        {legacyBalance ? `${formatEther(legacyBalance.value)} ETH` : "Loading..."}
                    </span>
                </div>
            </div>

            {!hasBalance && (
                <div className="bg-zinc-800/50 rounded-xl p-3 text-center text-zinc-500 text-sm">
                    No ETH found in legacy Safe. Nothing to recover.
                </div>
            )}

            {hasBalance && !legacySafe.isDeployed && (
                <div className="space-y-3">
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                        <p className="text-xs text-amber-300 font-medium">Step 1: Deploy Safe</p>
                        <p className="text-xs text-zinc-400 mt-1">
                            The Safe contract needs to be deployed first. This costs ~$10-20 in gas.
                        </p>
                    </div>
                    <button
                        onClick={handleDeploy}
                        disabled={status === "deploying"}
                        className="w-full py-3 rounded-xl font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {status === "deploying" ? (
                            <span className="flex items-center justify-center gap-2">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Deploying...
                            </span>
                        ) : (
                            "Deploy Safe Contract"
                        )}
                    </button>
                </div>
            )}

            {hasBalance && legacySafe.isDeployed && (
                <div className="space-y-3">
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                        <p className="text-xs text-emerald-300 font-medium">Step 2: Withdraw Funds</p>
                        <p className="text-xs text-zinc-400 mt-1">
                            Safe is deployed. Enter amount to withdraw. Gas costs ~$5-10.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-zinc-400">Withdraw To:</label>
                        <input
                            type="text"
                            value={withdrawTo}
                            onChange={(e) => setWithdrawTo(e.target.value)}
                            placeholder="0x..."
                            className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-white text-sm font-mono"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-xs text-zinc-400">Amount (ETH):</label>
                            <button
                                onClick={handleMax}
                                className="text-xs text-blue-400 hover:underline"
                            >
                                Max
                            </button>
                        </div>
                        <input
                            type="text"
                            value={withdrawAmount}
                            onChange={(e) => setWithdrawAmount(e.target.value)}
                            placeholder="0.0"
                            className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-white text-sm"
                        />
                    </div>

                    <button
                        onClick={handleWithdraw}
                        disabled={status === "withdrawing" || !withdrawAmount || !withdrawTo}
                        className="w-full py-3 rounded-xl font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {status === "withdrawing" ? (
                            <span className="flex items-center justify-center gap-2">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Withdrawing...
                            </span>
                        ) : (
                            "Withdraw from Legacy Safe"
                        )}
                    </button>
                </div>
            )}

            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                    <p className="text-xs text-red-400">{error}</p>
                </div>
            )}

            {txHash && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                    <p className="text-xs text-emerald-400 mb-1">Transaction sent!</p>
                    <a
                        href={`https://etherscan.io/tx/${txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:underline break-all"
                    >
                        {txHash}
                    </a>
                </div>
            )}

            <p className="text-xs text-zinc-600 text-center">
                This recovers funds from the old Safe address calculation.
                Your connected wallet signs and pays gas.
            </p>
        </div>
    );
}
