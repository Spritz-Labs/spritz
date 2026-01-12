"use client";

/**
 * Safe Passkey Send Hook
 * 
 * Uses Safe Protocol Kit for passkey-based transaction signing.
 * This enables users who registered with passkeys to send transactions.
 */

import { useState, useCallback, useEffect } from "react";
import { type Address, parseEther, parseUnits } from "viem";

export type SafePasskeyStatus = "idle" | "loading" | "ready" | "signing" | "sending" | "success" | "error";

export interface PasskeyCredentialData {
    credentialId: string;
    publicKeyX: string; // hex
    publicKeyY: string; // hex
    safeSignerAddress: string;
}

export interface UseSafePasskeySendReturn {
    // State
    status: SafePasskeyStatus;
    error: string | null;
    txHash: string | null;
    isReady: boolean;
    isSending: boolean;
    safeAddress: Address | null;
    
    // Actions
    initialize: (userAddress: Address) => Promise<void>;
    sendTransaction: (
        to: Address, 
        amount: string, 
        tokenAddress?: Address, 
        tokenDecimals?: number
    ) => Promise<string | null>;
    reset: () => void;
}

// RPC URLs for supported chains
const CHAIN_RPC_URLS: Record<number, string> = {
    8453: "https://mainnet.base.org", // Base
};

export function useSafePasskeySend(): UseSafePasskeySendReturn {
    const [status, setStatus] = useState<SafePasskeyStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [credential, setCredential] = useState<PasskeyCredentialData | null>(null);
    const [safeAddress, setSafeAddress] = useState<Address | null>(null);
    const [chainId] = useState<number>(8453); // Base only for now

    /**
     * Load passkey credential and predict Safe address
     */
    const initialize = useCallback(async (userAddress: Address) => {
        setStatus("loading");
        setError(null);

        try {
            // Fetch passkey credential from API
            const response = await fetch(`/api/passkey/credential?address=${userAddress}`, {
                credentials: "include",
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to load passkey credential");
            }

            const data = await response.json();
            
            if (!data.credentialId || !data.publicKeyX || !data.publicKeyY) {
                throw new Error("Passkey not configured for Safe signing. Please re-register your passkey.");
            }

            console.log("[SafePasskeySend] Loaded credential:", {
                credentialId: data.credentialId.slice(0, 20) + "...",
                hasCoordinates: !!data.publicKeyX && !!data.publicKeyY,
            });

            setCredential({
                credentialId: data.credentialId,
                publicKeyX: data.publicKeyX,
                publicKeyY: data.publicKeyY,
                safeSignerAddress: data.safeSignerAddress,
            });

            // For now, use the user's Spritz address as the Safe address
            // In production, this would be a counterfactual Safe address
            setSafeAddress(userAddress);
            setStatus("ready");
            
        } catch (err) {
            console.error("[SafePasskeySend] Initialize error:", err);
            setError(err instanceof Error ? err.message : "Failed to initialize");
            setStatus("error");
        }
    }, []);

    /**
     * Send a transaction using passkey signing
     */
    const sendTransaction = useCallback(async (
        to: Address,
        amount: string,
        tokenAddress?: Address,
        tokenDecimals?: number
    ): Promise<string | null> => {
        if (!credential) {
            setError("Passkey not initialized");
            return null;
        }

        setStatus("signing");
        setError(null);
        setTxHash(null);

        try {
            // Dynamic import to avoid SSR issues
            const Safe = (await import("@safe-global/protocol-kit")).default;

            const rpcUrl = CHAIN_RPC_URLS[chainId];
            if (!rpcUrl) {
                throw new Error(`Chain ${chainId} not supported`);
            }

            console.log("[SafePasskeySend] Creating passkey signer with coordinates");

            // Create the passkey signer object for Safe SDK
            // Coordinates should be hex strings (without 0x prefix based on SDK expectations)
            const passkeySigner = {
                rawId: credential.credentialId,
                coordinates: { 
                    x: credential.publicKeyX.startsWith("0x") ? credential.publicKeyX.slice(2) : credential.publicKeyX,
                    y: credential.publicKeyY.startsWith("0x") ? credential.publicKeyY.slice(2) : credential.publicKeyY,
                },
            };

            // For first-time users, we need to predict the Safe address
            // The Safe will be deployed on the first transaction
            const predictedSafe = await Safe.init({
                provider: rpcUrl,
                signer: passkeySigner,
                predictedSafe: {
                    safeAccountConfig: {
                        owners: [credential.safeSignerAddress as Address],
                        threshold: 1,
                    },
                    safeDeploymentConfig: {
                        saltNonce: "0", // Deterministic address
                    },
                },
            });

            const safeTxAddress = await predictedSafe.getAddress();
            console.log("[SafePasskeySend] Safe address:", safeTxAddress);
            setSafeAddress(safeTxAddress as Address);

            // Create the transaction
            let txData;
            if (tokenAddress && tokenDecimals !== undefined) {
                // ERC20 transfer
                const tokenAmount = parseUnits(amount, tokenDecimals);
                const transferData = encodeERC20Transfer(to, tokenAmount);
                txData = {
                    to: tokenAddress,
                    value: "0",
                    data: transferData,
                };
                console.log("[SafePasskeySend] Creating ERC20 transfer:", { to, amount, tokenAddress });
            } else {
                // Native ETH transfer
                const valueWei = parseEther(amount);
                txData = {
                    to,
                    value: valueWei.toString(),
                    data: "0x",
                };
                console.log("[SafePasskeySend] Creating ETH transfer:", { to, amount });
            }

            setStatus("sending");

            // Create Safe transaction
            const safeTransaction = await predictedSafe.createTransaction({
                transactions: [txData],
            });

            console.log("[SafePasskeySend] Signing transaction with passkey...");

            // Sign with passkey (this will prompt the user)
            const signedTransaction = await predictedSafe.signTransaction(safeTransaction);

            console.log("[SafePasskeySend] Executing transaction...");

            // Execute the transaction
            const result = await predictedSafe.executeTransaction(signedTransaction);
            
            const hash = result.hash as `0x${string}`;
            console.log("[SafePasskeySend] Transaction sent:", hash);

            setTxHash(hash);
            setStatus("success");
            return hash;

        } catch (err: unknown) {
            console.error("[SafePasskeySend] Transaction error:", err);

            // Handle user cancellation
            if (err instanceof DOMException && err.name === "NotAllowedError") {
                setError("Passkey signing was cancelled");
                setStatus("idle");
                return null;
            }

            // Handle other errors
            const message = err instanceof Error ? err.message : "Transaction failed";
            setError(message);
            setStatus("error");
            return null;
        }
    }, [credential, chainId]);

    const reset = useCallback(() => {
        setStatus("idle");
        setError(null);
        setTxHash(null);
    }, []);

    return {
        status,
        error,
        txHash,
        isReady: status === "ready",
        isSending: status === "signing" || status === "sending",
        safeAddress,
        initialize,
        sendTransaction,
        reset,
    };
}

// Helper to encode ERC20 transfer
function encodeERC20Transfer(to: Address, amount: bigint): `0x${string}` {
    // transfer(address,uint256) selector = 0xa9059cbb
    const selector = "0xa9059cbb";
    const toParam = to.slice(2).padStart(64, "0");
    const amountParam = amount.toString(16).padStart(64, "0");
    return `${selector}${toParam}${amountParam}` as `0x${string}`;
}
