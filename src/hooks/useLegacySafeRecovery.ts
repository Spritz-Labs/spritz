"use client";

import { useState, useCallback } from "react";
import { useAccount, useWalletClient, useSignMessage } from "wagmi";
import { type Address, type Hex, parseEther, formatEther } from "viem";
import {
    calculateSafeAddress,
    isLegacySafeDeployed,
    deployLegacySafe,
    execLegacySafeTransaction,
} from "@/lib/smartAccount";

export type RecoveryStatus = "idle" | "checking" | "deploying" | "withdrawing" | "success" | "error";

export interface LegacySafeInfo {
    address: Address;
    isDeployed: boolean;
    needsRecovery: boolean;
}

export interface UseLegacySafeRecoveryReturn {
    legacySafe: LegacySafeInfo | null;
    status: RecoveryStatus;
    error: string | null;
    txHash: string | null;
    
    checkLegacySafe: (chainId?: number) => Promise<void>;
    deployLegacySafe: (chainId: number) => Promise<string | null>;
    withdrawFromLegacySafe: (chainId: number, to: Address, amountEth: string) => Promise<string | null>;
}

/**
 * Hook for recovering funds from legacy Safe addresses
 * 
 * The old Safe calculation (without 4337 module) produced different addresses
 * than the current permissionless.js calculation. This hook helps users
 * recover funds that were sent to those old addresses.
 */
export function useLegacySafeRecovery(): UseLegacySafeRecoveryReturn {
    const { address: ownerAddress, isConnected } = useAccount();
    const { data: walletClient } = useWalletClient();
    const { signMessageAsync } = useSignMessage();
    
    const [legacySafe, setLegacySafe] = useState<LegacySafeInfo | null>(null);
    const [status, setStatus] = useState<RecoveryStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);

    const checkLegacySafe = useCallback(async (chainId: number = 1) => {
        if (!ownerAddress) {
            setError("Wallet not connected");
            return;
        }

        setStatus("checking");
        setError(null);

        try {
            // Calculate legacy Safe address
            const legacyAddress = calculateSafeAddress(ownerAddress);
            
            // Check if deployed
            const isDeployed = await isLegacySafeDeployed(legacyAddress, chainId);

            setLegacySafe({
                address: legacyAddress,
                isDeployed,
                needsRecovery: true, // User should check balance manually
            });
            
            setStatus("idle");
            console.log("[LegacyRecovery] Legacy Safe:", legacyAddress, "Deployed:", isDeployed);
        } catch (err) {
            console.error("[LegacyRecovery] Error:", err);
            setError(err instanceof Error ? err.message : "Failed to check legacy Safe");
            setStatus("error");
        }
    }, [ownerAddress]);

    const deployLegacySafeAction = useCallback(async (chainId: number): Promise<string | null> => {
        if (!ownerAddress || !walletClient) {
            setError("Wallet not connected");
            return null;
        }

        setStatus("deploying");
        setError(null);
        setTxHash(null);

        try {
            const walletClientWrapper = {
                account: { address: ownerAddress },
                writeContract: async (args: unknown) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return await walletClient.writeContract(args as any);
                },
            };

            const result = await deployLegacySafe(ownerAddress, chainId, walletClientWrapper);
            
            setTxHash(result.txHash);
            setStatus("success");
            
            // Update deployment status
            if (legacySafe) {
                setLegacySafe({ ...legacySafe, isDeployed: true });
            }
            
            return result.txHash;
        } catch (err) {
            console.error("[LegacyRecovery] Deploy error:", err);
            setError(err instanceof Error ? err.message : "Failed to deploy legacy Safe");
            setStatus("error");
            return null;
        }
    }, [ownerAddress, walletClient, legacySafe]);

    const withdrawFromLegacySafe = useCallback(async (
        chainId: number,
        to: Address,
        amountEth: string
    ): Promise<string | null> => {
        if (!ownerAddress || !walletClient || !legacySafe) {
            setError("Wallet not connected or legacy Safe not checked");
            return null;
        }

        if (!legacySafe.isDeployed) {
            setError("Legacy Safe not deployed. Deploy it first.");
            return null;
        }

        setStatus("withdrawing");
        setError(null);
        setTxHash(null);

        try {
            const walletClientWrapper = {
                account: { address: ownerAddress },
                signMessage: async (args: { message: { raw: Hex } }) => {
                    return await signMessageAsync({ message: { raw: args.message.raw } });
                },
                writeContract: async (args: unknown) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    return await walletClient.writeContract(args as any);
                },
            };

            const amountWei = parseEther(amountEth);
            console.log(`[LegacyRecovery] Withdrawing ${amountEth} ETH (${amountWei} wei) to ${to}`);

            const hash = await execLegacySafeTransaction(
                legacySafe.address,
                chainId,
                to,
                amountWei,
                "0x",
                walletClientWrapper
            );

            setTxHash(hash);
            setStatus("success");
            return hash;
        } catch (err) {
            console.error("[LegacyRecovery] Withdraw error:", err);
            setError(err instanceof Error ? err.message : "Failed to withdraw from legacy Safe");
            setStatus("error");
            return null;
        }
    }, [ownerAddress, walletClient, legacySafe, signMessageAsync]);

    return {
        legacySafe,
        status,
        error,
        txHash,
        checkLegacySafe,
        deployLegacySafe: deployLegacySafeAction,
        withdrawFromLegacySafe,
    };
}
