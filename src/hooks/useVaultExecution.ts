/**
 * Hook for signing and executing vault (multi-sig Safe) transactions
 * 
 * For threshold=1 vaults: Sign and execute in one step
 * For threshold>1 vaults: Each signer signs, then anyone can execute when threshold met
 */

import { useState, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { type Address, type Hex, type Chain, encodeFunctionData, parseUnits, formatEther, concat, toHex } from "viem";
import { mainnet, base, arbitrum, optimism, polygon, bsc } from "viem/chains";
import { getChainById } from "@/config/chains";

// Map chain IDs to viem chain objects
const VIEM_CHAINS: Record<number, Chain> = {
    1: mainnet,
    8453: base,
    42161: arbitrum,
    10: optimism,
    137: polygon,
    56: bsc,
};

// Safe ABI for execution
const SAFE_ABI = [
    {
        name: "execTransaction",
        type: "function",
        inputs: [
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "data", type: "bytes" },
            { name: "operation", type: "uint8" },
            { name: "safeTxGas", type: "uint256" },
            { name: "baseGas", type: "uint256" },
            { name: "gasPrice", type: "uint256" },
            { name: "gasToken", type: "address" },
            { name: "refundReceiver", type: "address" },
            { name: "signatures", type: "bytes" },
        ],
        outputs: [{ name: "success", type: "bool" }],
    },
    {
        name: "getTransactionHash",
        type: "function",
        inputs: [
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "data", type: "bytes" },
            { name: "operation", type: "uint8" },
            { name: "safeTxGas", type: "uint256" },
            { name: "baseGas", type: "uint256" },
            { name: "gasPrice", type: "uint256" },
            { name: "gasToken", type: "address" },
            { name: "refundReceiver", type: "address" },
            { name: "_nonce", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bytes32" }],
    },
    {
        name: "nonce",
        type: "function",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "getOwners",
        type: "function",
        inputs: [],
        outputs: [{ name: "", type: "address[]" }],
    },
    {
        name: "getThreshold",
        type: "function",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
    },
    {
        name: "isOwner",
        type: "function",
        inputs: [{ name: "owner", type: "address" }],
        outputs: [{ name: "", type: "bool" }],
    },
] as const;

// ERC20 transfer ABI
const ERC20_TRANSFER_ABI = [
    {
        name: "transfer",
        type: "function",
        inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
    },
] as const;

export type VaultExecutionStatus = "idle" | "checking" | "signing" | "executing" | "success" | "error";

export function useVaultExecution() {
    const { address: userAddress } = useAccount();
    const { data: walletClient } = useWalletClient();
    const publicClient = usePublicClient();
    
    const [status, setStatus] = useState<VaultExecutionStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);

    /**
     * Check if the user can sign for a vault
     * @param safeAddress - The Safe contract address
     * @param chainId - The chain ID
     * @param smartWalletAddress - Optional: user's Smart Wallet address (if different from EOA)
     */
    const canSign = useCallback(async (
        safeAddress: Address,
        chainId: number,
        smartWalletAddress?: Address
    ): Promise<{ canSign: boolean; isDeployed: boolean; threshold: number; owners: Address[]; signerAddress: Address | null }> => {
        if (!userAddress || !publicClient) {
            return { canSign: false, isDeployed: false, threshold: 0, owners: [], signerAddress: null };
        }

        try {
            // Check if Safe is deployed
            const code = await publicClient.getCode({ address: safeAddress });
            const isDeployed = code !== undefined && code !== "0x";

            if (!isDeployed) {
                // For undeployed Safes, we can't verify ownership on-chain
                // Trust the database for now
                return { canSign: true, isDeployed: false, threshold: 0, owners: [], signerAddress: smartWalletAddress || userAddress };
            }

            // Get owners and threshold
            const [owners, threshold] = await Promise.all([
                publicClient.readContract({
                    address: safeAddress,
                    abi: SAFE_ABI,
                    functionName: "getOwners",
                }) as Promise<Address[]>,
                publicClient.readContract({
                    address: safeAddress,
                    abi: SAFE_ABI,
                    functionName: "getThreshold",
                }) as Promise<bigint>,
            ]);

            // Check if user's EOA is an owner
            const eoaIsOwner = owners.some(
                (owner) => owner.toLowerCase() === userAddress.toLowerCase()
            );
            
            // Check if user's Smart Wallet is an owner (Safe was deployed with SW addresses)
            const swIsOwner = smartWalletAddress ? owners.some(
                (owner) => owner.toLowerCase() === smartWalletAddress.toLowerCase()
            ) : false;

            const isOwner = eoaIsOwner || swIsOwner;
            // Use Smart Wallet address for signing if that's the owner, otherwise EOA
            const signerAddress = swIsOwner ? smartWalletAddress! : (eoaIsOwner ? userAddress : null);

            return {
                canSign: isOwner,
                isDeployed: true,
                threshold: Number(threshold),
                owners,
                signerAddress,
            };
        } catch (err) {
            console.error("[VaultExecution] Error checking ownership:", err);
            return { canSign: false, isDeployed: false, threshold: 0, owners: [], signerAddress: null };
        }
    }, [userAddress, publicClient]);

    /**
     * Get the safeTxHash for a transaction (for signing)
     */
    const getSafeTxHash = useCallback(async (params: {
        safeAddress: Address;
        chainId: number;
        to: Address;
        value: bigint;
        data: Hex;
        nonce: bigint;
    }): Promise<Hex | null> => {
        if (!publicClient) return null;

        try {
            const { safeAddress, to, value, data, nonce } = params;
            
            const operation = 0;
            const safeTxGas = BigInt(0);
            const baseGas = BigInt(0);
            const gasPrice = BigInt(0);
            const gasToken = "0x0000000000000000000000000000000000000000" as Address;
            const refundReceiver = "0x0000000000000000000000000000000000000000" as Address;

            const safeTxHash = await publicClient.readContract({
                address: safeAddress,
                abi: SAFE_ABI,
                functionName: "getTransactionHash",
                args: [to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, nonce],
            });

            return safeTxHash as Hex;
        } catch (err) {
            console.error("[VaultExecution] Error getting safeTxHash:", err);
            return null;
        }
    }, [publicClient]);

    /**
     * Sign a vault transaction (returns signature to store in DB)
     */
    const signTransaction = useCallback(async (params: {
        safeAddress: Address;
        chainId: number;
        to: Address;
        value: string;
        data: Hex;
        nonce: number;
    }): Promise<{ success: boolean; signature?: string; signerAddress?: string; safeTxHash?: string; error?: string }> => {
        if (!walletClient || !publicClient || !userAddress) {
            return { success: false, error: "Wallet not connected" };
        }

        setStatus("signing");
        setError(null);

        try {
            const { safeAddress, to, value, data, nonce } = params;
            
            console.log("[VaultExecution] Signing transaction...");

            // Get safeTxHash
            const safeTxHash = await getSafeTxHash({
                safeAddress,
                chainId: params.chainId,
                to,
                value: BigInt(value || "0"),
                data,
                nonce: BigInt(nonce),
            });

            if (!safeTxHash) {
                throw new Error("Failed to get transaction hash");
            }

            console.log("[VaultExecution] Safe tx hash:", safeTxHash);

            // Sign the hash with wallet
            const signature = await walletClient.signMessage({
                message: { raw: safeTxHash },
            });

            // Adjust v value for Safe's signature format
            let v = parseInt(signature.slice(-2), 16);
            if (v < 27) {
                v += 27;
            }
            v += 4; // Safe adds 4 for eth_sign signatures
            const adjustedSignature = signature.slice(0, -2) + v.toString(16).padStart(2, "0");

            console.log("[VaultExecution] Signature generated");
            setStatus("idle");

            return {
                success: true,
                signature: adjustedSignature,
                signerAddress: userAddress.toLowerCase(),
                safeTxHash,
            };
        } catch (err) {
            console.error("[VaultExecution] Sign error:", err);
            const errorMessage = err instanceof Error ? err.message : "Failed to sign";
            setStatus("error");
            setError(errorMessage);
            return { success: false, error: errorMessage };
        }
    }, [walletClient, publicClient, userAddress, getSafeTxHash]);

    /**
     * Execute with multiple signatures (for multi-sig)
     */
    const executeWithSignatures = useCallback(async (params: {
        safeAddress: Address;
        chainId: number;
        to: Address;
        value: string;
        data: Hex;
        signatures: Array<{ signerAddress: string; signature: string }>;
    }): Promise<{ success: boolean; txHash?: string; error?: string }> => {
        if (!walletClient || !publicClient || !userAddress) {
            return { success: false, error: "Wallet not connected" };
        }

        setStatus("executing");
        setError(null);
        setTxHash(null);

        try {
            const { safeAddress, chainId, to, value, data, signatures } = params;
            
            console.log("[VaultExecution] Executing with", signatures.length, "signatures");

            // Verify Safe is deployed by trying to read nonce (more reliable than getCode)
            try {
                await publicClient.readContract({
                    address: safeAddress,
                    abi: SAFE_ABI,
                    functionName: "nonce",
                });
            } catch (readErr) {
                console.error("[VaultExecution] Cannot read Safe nonce:", readErr);
                // Fallback to getCode check
                const code = await publicClient.getCode({ address: safeAddress });
                if (!code || code === "0x" || code.length <= 2) {
                    throw new Error("Safe is not deployed yet. If you just deployed it, please wait and try again.");
                }
            }

            // Sort signatures by signer address (Safe requires this)
            const sortedSigs = [...signatures].sort((a, b) => 
                a.signerAddress.toLowerCase().localeCompare(b.signerAddress.toLowerCase())
            );

            // Concatenate signatures
            // Each signature is 65 bytes (r: 32, s: 32, v: 1) = 130 hex chars
            const concatenatedSigs = ("0x" + sortedSigs.map(s => 
                s.signature.startsWith("0x") ? s.signature.slice(2) : s.signature
            ).join("")) as Hex;

            console.log("[VaultExecution] Concatenated signatures:", concatenatedSigs.slice(0, 50) + "...");

            const operation = 0;
            const safeTxGas = BigInt(0);
            const baseGas = BigInt(0);
            const gasPrice = BigInt(0);
            const gasToken = "0x0000000000000000000000000000000000000000" as Address;
            const refundReceiver = "0x0000000000000000000000000000000000000000" as Address;

            // Get the chain config
            const chain = VIEM_CHAINS[chainId];
            if (!chain) {
                throw new Error(`Unsupported chain: ${chainId}`);
            }

            // Execute the transaction
            const hash = await walletClient.writeContract({
                address: safeAddress,
                abi: SAFE_ABI,
                functionName: "execTransaction",
                args: [
                    to as Address,
                    BigInt(value || "0"),
                    data,
                    operation,
                    safeTxGas,
                    baseGas,
                    gasPrice,
                    gasToken,
                    refundReceiver,
                    concatenatedSigs,
                ],
                chain,
            });

            console.log("[VaultExecution] Transaction sent:", hash);
            setTxHash(hash);
            setStatus("success");

            return { success: true, txHash: hash };
        } catch (err) {
            console.error("[VaultExecution] Execute error:", err);
            const errorMessage = err instanceof Error ? err.message : "Transaction failed";
            setStatus("error");
            setError(errorMessage);
            return { success: false, error: errorMessage };
        }
    }, [walletClient, publicClient, userAddress]);

    /**
     * Execute a vault transaction (for threshold=1 or with pre-collected signatures)
     * @param smartWalletAddress - Optional: user's Smart Wallet address if that's the Safe owner
     */
    const execute = useCallback(async (params: {
        safeAddress: Address;
        chainId: number;
        to: Address;
        value: string;
        data: Hex;
        signatures?: Array<{ signerAddress: string; signature: string }>;
        smartWalletAddress?: Address;
    }): Promise<{ success: boolean; txHash?: string; error?: string; needsMoreSignatures?: boolean; threshold?: number }> => {
        const { safeAddress, chainId, to, value, data, signatures, smartWalletAddress } = params;

        if (!walletClient || !publicClient || !userAddress) {
            return { success: false, error: "Wallet not connected" };
        }

        setStatus("checking");
        setError(null);
        setTxHash(null);

        try {
            console.log("[VaultExecution] Starting execution...");

            // Try to get threshold - this will fail if Safe is not deployed
            // This is more reliable than getCode() which can have RPC caching issues
            let threshold: bigint;
            try {
                threshold = await publicClient.readContract({
                    address: safeAddress,
                    abi: SAFE_ABI,
                    functionName: "getThreshold",
                }) as bigint;
                console.log("[VaultExecution] Threshold:", threshold);
            } catch (thresholdErr) {
                console.error("[VaultExecution] Failed to get threshold:", thresholdErr);
                // Fallback: check getCode
                const code = await publicClient.getCode({ address: safeAddress });
                const isDeployed = code !== undefined && code !== "0x" && code.length > 2;
                console.log("[VaultExecution] getCode check - deployed:", isDeployed, "code length:", code?.length);
                
                if (!isDeployed) {
                    setStatus("error");
                    setError("Vault Safe is not deployed yet. If you just deployed it, please wait a moment and try again.");
                    return { success: false, error: "Vault Safe is not deployed yet" };
                }
                // If we got here, getCode shows deployed but readContract failed - RPC issue
                throw new Error("Safe appears deployed but unable to read contract. Please try again.");
            }

            // If we have pre-collected signatures, use them
            if (signatures && signatures.length >= Number(threshold)) {
                return await executeWithSignatures({
                    safeAddress,
                    chainId,
                    to,
                    value,
                    data,
                    signatures,
                });
            }

            // For threshold=1, sign and execute in one step
            if (Number(threshold) === 1) {
                // Check if user's EOA is an owner
                let eoaIsOwner = await publicClient.readContract({
                    address: safeAddress,
                    abi: SAFE_ABI,
                    functionName: "isOwner",
                    args: [userAddress],
                }) as boolean;
                
                // Check if user's Smart Wallet is an owner (vaults may use SW addresses)
                let swIsOwner = false;
                if (smartWalletAddress) {
                    swIsOwner = await publicClient.readContract({
                        address: safeAddress,
                        abi: SAFE_ABI,
                        functionName: "isOwner",
                        args: [smartWalletAddress],
                    }) as boolean;
                }

                if (!eoaIsOwner && !swIsOwner) {
                    setStatus("error");
                    setError("You are not an owner of this vault");
                    return { success: false, error: "You are not an owner of this vault" };
                }
                
                // Use Smart Wallet as signer if that's the owner
                const signerAddress = swIsOwner ? smartWalletAddress! : userAddress;

                setStatus("signing");

                // Get Safe nonce
                const nonce = await publicClient.readContract({
                    address: safeAddress,
                    abi: SAFE_ABI,
                    functionName: "nonce",
                }) as bigint;

                // Sign
                const signResult = await signTransaction({
                    safeAddress,
                    chainId,
                    to,
                    value,
                    data,
                    nonce: Number(nonce),
                });

                if (!signResult.success || !signResult.signature) {
                    return { success: false, error: signResult.error || "Failed to sign" };
                }

                // Execute with single signature
                return await executeWithSignatures({
                    safeAddress,
                    chainId,
                    to,
                    value,
                    data,
                    signatures: [{ signerAddress: signResult.signerAddress!, signature: signResult.signature }],
                });
            }

            // Multi-sig: not enough signatures
            setStatus("error");
            const sigCount = signatures?.length || 0;
            setError(`Need ${Number(threshold)} signatures, have ${sigCount}`);
            return { 
                success: false, 
                error: `Need ${Number(threshold)} signatures to execute`,
                needsMoreSignatures: true,
                threshold: Number(threshold),
            };
        } catch (err) {
            console.error("[VaultExecution] Error:", err);
            const errorMessage = err instanceof Error ? err.message : "Transaction failed";
            setStatus("error");
            setError(errorMessage);
            return { success: false, error: errorMessage };
        }
    }, [walletClient, publicClient, userAddress, signTransaction, executeWithSignatures]);

    const reset = useCallback(() => {
        setStatus("idle");
        setError(null);
        setTxHash(null);
    }, []);

    return {
        status,
        error,
        txHash,
        canSign,
        signTransaction,
        executeWithSignatures,
        execute,
        reset,
        isExecuting: status === "checking" || status === "signing" || status === "executing",
        isSigning: status === "signing",
    };
}
