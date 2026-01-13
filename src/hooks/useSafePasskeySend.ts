"use client";

/**
 * Safe Passkey Send Hook
 * 
 * Uses permissionless + Pimlico + viem's WebAuthn support for passkey-based Safe transaction signing.
 * This enables users who registered with passkeys to send transactions.
 * 
 * Uses SafeWebAuthnSharedSigner for proper ERC-4337 compatibility.
 */

import { useState, useCallback } from "react";
import { type Address, type Hex, parseEther, parseUnits } from "viem";
import {
    createPasskeySafeAccountClient,
    sendSafeTransaction,
    type PasskeyCredential,
} from "@/lib/safeWallet";

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
            // In production, this would be the counterfactual Safe address
            setSafeAddress(userAddress);
            setStatus("ready");
            
        } catch (err) {
            console.error("[SafePasskeySend] Initialize error:", err);
            setError(err instanceof Error ? err.message : "Failed to initialize");
            setStatus("error");
        }
    }, []);

    /**
     * Send a transaction using passkey signing via permissionless + Pimlico
     * 
     * This uses viem's toWebAuthnAccount which handles all the WebAuthn
     * signing logic internally, including prompting the user for their passkey.
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
            console.log("[SafePasskeySend] Starting passkey transaction");
            console.log("[SafePasskeySend] Credential ID:", credential.credentialId.slice(0, 20) + "...");

            // Create the passkey credential object
            // viem's toWebAuthnAccount will handle the actual signing
            const passkeyCredential: PasskeyCredential = {
                credentialId: credential.credentialId,
                publicKey: {
                    x: credential.publicKeyX as Hex,
                    y: credential.publicKeyY as Hex,
                },
            };

            // Create Safe account client with passkey signer
            // This uses SafeWebAuthnSharedSigner for ERC-4337 compatibility
            console.log("[SafePasskeySend] Creating Safe account client...");
            const safeClient = await createPasskeySafeAccountClient(
                passkeyCredential,
                chainId
            );

            console.log("[SafePasskeySend] Safe client created, sending transaction...");
            setStatus("sending");

            // Send the transaction
            let hash;
            if (tokenAddress && tokenDecimals !== undefined) {
                // ERC20 token transfer
                const tokenAmount = parseUnits(amount, tokenDecimals);
                console.log(`[SafePasskeySend] Sending ERC20: ${amount} to ${to}`);
                hash = await sendSafeTransaction(safeClient, {
                    to,
                    value: BigInt(0),
                    tokenAddress,
                    tokenAmount,
                    tokenDecimals,
                });
            } else {
                // Native ETH transfer
                console.log(`[SafePasskeySend] Sending ETH: ${amount} to ${to}`);
                hash = await sendSafeTransaction(safeClient, {
                    to,
                    value: parseEther(amount),
                });
            }

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
