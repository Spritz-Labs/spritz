"use client";

import { useState, useCallback } from "react";
import { 
    useAccount, 
    useSendTransaction as useWagmiSendTransaction,
    useEstimateGas,
    useGasPrice,
    useBalance,
} from "wagmi";
import { parseEther, formatEther, type Address } from "viem";

export type SendStatus = "idle" | "estimating" | "confirming" | "pending" | "success" | "error";

export interface GasEstimate {
    gasLimit: bigint;
    gasPrice: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
    estimatedFee: bigint;
    estimatedFeeFormatted: string;
    estimatedFeeUsd: number | null;
}

export interface SendTransactionParams {
    to: Address;
    value: string; // Amount in ETH (not wei)
    chainId?: number;
}

export interface UseSendTransactionReturn {
    // State
    status: SendStatus;
    error: string | null;
    txHash: string | null;
    gasEstimate: GasEstimate | null;
    isEstimating: boolean;
    isSending: boolean;
    
    // Actions
    estimateGas: (params: SendTransactionParams) => Promise<GasEstimate | null>;
    send: (params: SendTransactionParams) => Promise<string | null>;
    reset: () => void;
}

// ETH price for USD estimation (simplified - in production use a price feed)
const ETH_PRICE_USD = 3500; // Approximate, should be fetched

export function useSendTransaction(): UseSendTransactionReturn {
    const { address: userAddress, isConnected } = useAccount();
    const { data: balance } = useBalance({ address: userAddress });
    const { data: gasPrice } = useGasPrice();
    const { sendTransactionAsync } = useWagmiSendTransaction();
    
    const [status, setStatus] = useState<SendStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [gasEstimate, setGasEstimate] = useState<GasEstimate | null>(null);

    const reset = useCallback(() => {
        setStatus("idle");
        setError(null);
        setTxHash(null);
        setGasEstimate(null);
    }, []);

    const estimateGas = useCallback(async (params: SendTransactionParams): Promise<GasEstimate | null> => {
        if (!isConnected || !userAddress) {
            setError("Wallet not connected");
            return null;
        }

        setStatus("estimating");
        setError(null);

        try {
            const valueWei = parseEther(params.value);
            
            // Standard gas limit for ETH transfer
            const gasLimit = BigInt(21000);
            
            // Get current gas price
            const currentGasPrice = gasPrice || BigInt(20000000000); // 20 gwei fallback
            
            // Calculate estimated fee
            const estimatedFee = gasLimit * currentGasPrice;
            const estimatedFeeFormatted = formatEther(estimatedFee);
            const estimatedFeeUsd = parseFloat(estimatedFeeFormatted) * ETH_PRICE_USD;

            const estimate: GasEstimate = {
                gasLimit,
                gasPrice: currentGasPrice,
                estimatedFee,
                estimatedFeeFormatted,
                estimatedFeeUsd,
            };

            setGasEstimate(estimate);
            setStatus("idle");
            return estimate;
        } catch (err) {
            console.error("[SendTransaction] Gas estimation error:", err);
            setError(err instanceof Error ? err.message : "Failed to estimate gas");
            setStatus("error");
            return null;
        }
    }, [isConnected, userAddress, gasPrice]);

    const send = useCallback(async (params: SendTransactionParams): Promise<string | null> => {
        if (!isConnected || !userAddress) {
            setError("Wallet not connected");
            return null;
        }

        setStatus("confirming");
        setError(null);

        try {
            const valueWei = parseEther(params.value);

            // Check balance
            if (balance && valueWei > balance.value) {
                throw new Error("Insufficient balance");
            }

            // Send transaction
            const hash = await sendTransactionAsync({
                to: params.to,
                value: valueWei,
            });

            setTxHash(hash);
            setStatus("success");
            return hash;
        } catch (err: unknown) {
            console.error("[SendTransaction] Error:", err);
            
            // Handle user rejection
            if (err && typeof err === "object" && "code" in err) {
                const errorWithCode = err as { code: number; message?: string };
                if (errorWithCode.code === 4001) {
                    setError("Transaction rejected by user");
                    setStatus("idle");
                    return null;
                }
            }
            
            setError(err instanceof Error ? err.message : "Transaction failed");
            setStatus("error");
            return null;
        }
    }, [isConnected, userAddress, balance, sendTransactionAsync]);

    return {
        status,
        error,
        txHash,
        gasEstimate,
        isEstimating: status === "estimating",
        isSending: status === "confirming" || status === "pending",
        estimateGas,
        send,
        reset,
    };
}

// Validate Ethereum address
export function isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Format gas price in gwei
export function formatGwei(wei: bigint): string {
    const gwei = Number(wei) / 1e9;
    return gwei.toFixed(2);
}
