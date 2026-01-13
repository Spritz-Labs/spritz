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
import { type Address, type Hex, parseEther, parseUnits, formatUnits } from "viem";
import {
    createPasskeySafeAccountClient,
    sendSafeTransaction,
    chainRequiresErc20Payment,
    getChainUsdcAddress,
    getPublicClient,
    checkPaymasterAllowance,
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
    chainId: number;
    
    // Actions
    initialize: (userAddress: Address) => Promise<void>;
    sendTransaction: (
        to: Address, 
        amount: string, 
        tokenAddress?: Address, 
        tokenDecimals?: number,
        chainId?: number,
        safeAddress?: Address // For USDC balance check on mainnet
    ) => Promise<string | null>;
    setChainId: (chainId: number) => void;
    reset: () => void;
}

export function useSafePasskeySend(): UseSafePasskeySendReturn {
    const [status, setStatus] = useState<SafePasskeyStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [credential, setCredential] = useState<PasskeyCredentialData | null>(null);
    const [safeAddress, setSafeAddress] = useState<Address | null>(null);
    const [chainId, setChainId] = useState<number>(8453); // Default to Base

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
        tokenDecimals?: number,
        txChainId?: number,
        safeAddress?: Address // Optional: pass the Safe address to check USDC balance
    ): Promise<string | null> => {
        if (!credential) {
            setError("Passkey not initialized");
            return null;
        }

        // Use provided chainId or fallback to current state
        const effectiveChainId = txChainId || chainId;

        setStatus("signing");
        setError(null);
        setTxHash(null);

        try {
            console.log("[SafePasskeySend] Starting passkey transaction on chain:", effectiveChainId);
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

            // Check if this chain requires ERC-20 payment (mainnet)
            // If user has no USDC or no approval, fall back to native ETH payment
            let forceNativeGas = false;
            if (chainRequiresErc20Payment(effectiveChainId) && safeAddress) {
                const usdcAddress = getChainUsdcAddress(effectiveChainId);
                if (usdcAddress) {
                    try {
                        const publicClient = getPublicClient(effectiveChainId);
                        const erc20Abi = [{ 
                            name: 'balanceOf', 
                            type: 'function', 
                            inputs: [{ name: 'account', type: 'address' }], 
                            outputs: [{ name: '', type: 'uint256' }] 
                        }] as const;
                        
                        const usdcBalance = await publicClient.readContract({
                            address: usdcAddress,
                            abi: erc20Abi,
                            functionName: 'balanceOf',
                            args: [safeAddress],
                        }) as bigint;
                        
                        // Need at least 2 USDC for gas (safe estimate for mainnet)
                        const minUsdcForGas = BigInt(2_000_000); // 2 USDC (6 decimals)
                        if (usdcBalance < minUsdcForGas) {
                            console.log(`[SafePasskeySend] Insufficient USDC for gas (${formatUnits(usdcBalance, 6)} USDC), falling back to ETH payment`);
                            forceNativeGas = true;
                        } else {
                            // Also check for paymaster approval
                            const { hasApproval, allowance } = await checkPaymasterAllowance(safeAddress, effectiveChainId);
                            if (!hasApproval) {
                                console.log(`[SafePasskeySend] No USDC approval for paymaster (allowance: ${formatUnits(allowance, 6)} USDC), falling back to ETH payment`);
                                forceNativeGas = true;
                            } else {
                                console.log(`[SafePasskeySend] Using USDC for gas payment (${formatUnits(usdcBalance, 6)} USDC available, ${formatUnits(allowance, 6)} USDC approved)`);
                            }
                        }
                    } catch (err) {
                        console.log("[SafePasskeySend] Could not check USDC balance/approval, falling back to ETH payment");
                        forceNativeGas = true;
                    }
                }
            }

            // Create Safe account client with passkey signer
            // This uses SafeWebAuthnSharedSigner for ERC-4337 compatibility
            console.log("[SafePasskeySend] Creating Safe account client for chain:", effectiveChainId);
            const safeClient = await createPasskeySafeAccountClient(
                passkeyCredential,
                effectiveChainId,
                { forceNativeGas }
            );

            console.log("[SafePasskeySend] Safe client created, sending transaction...");
            setStatus("sending");

            // Send the transaction with explicit gas limits for WebAuthn
            // (simulation-based gas estimation fails for passkey signatures)
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
                }, true); // isWebAuthn = true for passkey transactions
            } else {
                // Native ETH transfer
                console.log(`[SafePasskeySend] Sending ETH: ${amount} to ${to}`);
                hash = await sendSafeTransaction(safeClient, {
                    to,
                    value: parseEther(amount),
                }, true); // isWebAuthn = true for passkey transactions
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

            // Handle transaction errors with helpful messages
            const errString = err instanceof Error ? err.message : String(err);
            
            // Check for common UserOperation errors
            if (errString.includes("UserOperation reverted") || 
                errString.includes("reverted during simulation") ||
                errString.includes("reason: 0x")) {
                
                if (chainRequiresErc20Payment(effectiveChainId)) {
                    setError("Transaction failed. Mainnet requires ETH + gas fees. Ensure your Safe has funds. Try a free L2 like Base instead.");
                } else {
                    setError("Insufficient funds. Deposit tokens to your wallet address first.");
                }
                setStatus("error");
                return null;
            }
            
            if (errString.includes("insufficient") || errString.includes("paymaster")) {
                if (chainRequiresErc20Payment(effectiveChainId)) {
                    setError("Gas payment failed. Ensure you have ETH in your Safe for gas, or try a free L2 like Base.");
                } else {
                    setError("Insufficient balance to cover gas fees.");
                }
                setStatus("error");
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
        chainId,
        initialize,
        sendTransaction,
        setChainId,
        reset,
    };
}
