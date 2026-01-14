"use client";

import { useState, useCallback } from "react";
import { type Address, isAddress } from "viem";
import { addRecoverySigner } from "@/lib/safeWallet";
import type { PasskeyCredential } from "@/lib/safeWallet";

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
    addRecovery: (recoveryAddress: string, passkeyCredential: PasskeyCredential, chainId?: number) => Promise<string | null>;
};

export function useRecoverySigner(): UseRecoverySignerReturn {
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

    const addRecovery = useCallback(async (
        recoveryAddress: string,
        passkeyCredential: PasskeyCredential,
        chainId: number = 8453
    ): Promise<string | null> => {
        if (!recoveryInfo?.safeAddress) {
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
            // Call the safeWallet function to add recovery signer
            const hash = await addRecoverySigner(
                recoveryInfo.safeAddress,
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
            console.error("[useRecoverySigner] Add error:", err);
            setError(err instanceof Error ? err.message : "Failed to add recovery signer");
            setStatus("error");
            return null;
        }
    }, [recoveryInfo?.safeAddress, fetchRecoveryInfo]);

    return {
        recoveryInfo,
        isLoading,
        error,
        txHash,
        status,
        fetchRecoveryInfo,
        addRecovery,
    };
}
