"use client";

import { useState, useCallback } from "react";
import { useAccount, useSignMessage, useSignTypedData, useChainId } from "wagmi";
import { type Address, isAddress } from "viem";
import { addRecoverySigner, addRecoverySignerWithWallet } from "@/lib/safeWallet";
import type { PasskeyCredential } from "@/lib/safeWallet";

// Chain name mapping for user-friendly error messages
const CHAIN_NAMES: Record<number, string> = {
    1: "Ethereum",
    8453: "Base",
    42161: "Arbitrum",
    10: "Optimism",
    137: "Polygon",
    56: "BNB Chain",
    43114: "Avalanche",
    1301: "Unichain",
};

export type RecoveryInfo = {
    safeAddress: Address;
    primarySigner: Address;
    isWalletUser: boolean;
    isDeployed: boolean;
    owners: Address[];
    threshold: number;
    hasRecoverySigner: boolean;
    recoverySigners: Address[];
    safeAppUrl: string;
};

type UseRecoverySignerReturn = {
    recoveryInfo: RecoveryInfo | null;
    isLoading: boolean;
    error: string | null;
    txHash: string | null;
    status: "idle" | "loading" | "adding" | "success" | "error";
    fetchRecoveryInfo: () => Promise<void>;
    addRecoveryWithPasskey: (recoveryAddress: string, passkeyCredential: PasskeyCredential, chainId?: number, safeAddressOverride?: string) => Promise<string | null>;
    addRecoveryWithWallet: (recoveryAddress: string, chainId?: number, safeAddressOverride?: string) => Promise<string | null>;
};

export function useRecoverySigner(): UseRecoverySignerReturn {
    const { address: walletAddress } = useAccount();
    const { signMessageAsync } = useSignMessage();
    const { signTypedDataAsync } = useSignTypedData();
    const currentChainId = useChainId();
    
    const [recoveryInfo, setRecoveryInfo] = useState<RecoveryInfo | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [status, setStatus] = useState<"idle" | "loading" | "adding" | "success" | "error">("idle");

    const fetchRecoveryInfo = useCallback(async () => {
        setIsLoading(true);
        setStatus("loading");
        setError(null);

        try {
            const response = await fetch("/api/wallet/recovery-signer", {
                credentials: "include",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to fetch recovery info");
            }

            const data = await response.json();
            setRecoveryInfo(data);
            setStatus("idle");
        } catch (err) {
            console.error("[useRecoverySigner] Error:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch recovery info");
            setStatus("error");
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Add recovery signer using passkey
    // safeAddressOverride allows passing Safe address directly (for multi-chain use)
    const addRecoveryWithPasskey = useCallback(async (
        recoveryAddress: string,
        passkeyCredential: PasskeyCredential,
        chainId: number = 8453,
        safeAddressOverride?: string
    ): Promise<string | null> => {
        const safeAddr = safeAddressOverride || recoveryInfo?.safeAddress;
        if (!safeAddr) {
            setError("No Safe address found");
            return null;
        }

        if (!isAddress(recoveryAddress)) {
            setError("Invalid recovery address format");
            return null;
        }

        setStatus("adding");
        setError(null);
        setTxHash(null);

        try {
            const hash = await addRecoverySigner(
                safeAddr as Address,
                recoveryAddress as Address,
                passkeyCredential,
                chainId
            );

            setTxHash(hash);
            setStatus("success");

            // Refresh recovery info after successful addition
            setTimeout(() => {
                fetchRecoveryInfo();
            }, 5000);

            return hash;
        } catch (err) {
            console.error("[useRecoverySigner] Add error (passkey):", err);
            setError(err instanceof Error ? err.message : "Failed to add recovery signer");
            setStatus("error");
            return null;
        }
    }, [recoveryInfo?.safeAddress, fetchRecoveryInfo]);

    // Add recovery signer using connected wallet
    // safeAddressOverride allows passing Safe address directly (for multi-chain use)
    const addRecoveryWithWallet = useCallback(async (
        recoveryAddress: string,
        chainId: number = 8453,
        safeAddressOverride?: string
    ): Promise<string | null> => {
        const safeAddr = safeAddressOverride || recoveryInfo?.safeAddress;
        if (!safeAddr) {
            setError("No Safe address found");
            return null;
        }

        if (!walletAddress) {
            setError("No wallet connected");
            return null;
        }

        if (!isAddress(recoveryAddress)) {
            setError("Invalid recovery address format");
            return null;
        }

        setStatus("adding");
        setError(null);
        setTxHash(null);

        try {
            // Check if on the correct chain - don't auto-switch to avoid modal issues
            if (currentChainId !== chainId) {
                const targetChainName = CHAIN_NAMES[chainId] || `Chain ${chainId}`;
                const currentChainName = CHAIN_NAMES[currentChainId] || `Chain ${currentChainId}`;
                console.log(`[useRecoverySigner] Wrong chain: on ${currentChainName}, need ${targetChainName}`);
                setError(`Please switch to ${targetChainName} in your wallet first (currently on ${currentChainName})`);
                setStatus("error");
                return null;
            }

            const hash = await addRecoverySignerWithWallet(
                safeAddr as Address,
                recoveryAddress as Address,
                walletAddress,
                async (message: string) => {
                    return signMessageAsync({ message }) as Promise<`0x${string}`>;
                },
                async (typedData: unknown) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const data = typedData as any;
                    return signTypedDataAsync({
                        domain: data.domain,
                        types: data.types,
                        primaryType: data.primaryType,
                        message: data.message,
                    }) as Promise<`0x${string}`>;
                },
                chainId
            );

            setTxHash(hash);
            setStatus("success");

            // Refresh recovery info after successful addition
            setTimeout(() => {
                fetchRecoveryInfo();
            }, 5000);

            return hash;
        } catch (err) {
            console.error("[useRecoverySigner] Add error (wallet):", err);
            setError(err instanceof Error ? err.message : "Failed to add recovery signer");
            setStatus("error");
            return null;
        }
    }, [recoveryInfo?.safeAddress, walletAddress, signMessageAsync, signTypedDataAsync, fetchRecoveryInfo, currentChainId]);

    return {
        recoveryInfo,
        isLoading,
        error,
        txHash,
        status,
        fetchRecoveryInfo,
        addRecoveryWithPasskey,
        addRecoveryWithWallet,
    };
}
