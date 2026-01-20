/**
 * Hook for signing and executing vault (multi-sig Safe) transactions
 * 
 * For threshold=1 vaults: Sign and execute in one step
 * For threshold>1 vaults: Each signer signs, then anyone can execute when threshold met
 * 
 * IMPORTANT: Vaults use Smart Wallet addresses as owners.
 * Smart Wallets are Safe contracts that implement EIP-1271 (isValidSignature).
 * When executing, we use contract signature format where v=0.
 * 
 * For EIP-1271 contract signatures:
 * - Safe's isValidSignature wraps the hash before validation
 * - EOA must sign the wrapped hash, not the raw safeTxHash
 * - See getSafeMessageHash() for the wrapping logic
 */

import { useState, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { type Address, type Hex, type Chain, encodeFunctionData, parseUnits, formatEther, concat, toHex, pad, encodeAbiParameters } from "viem";
import { mainnet, base, arbitrum, optimism, polygon, bsc } from "viem/chains";
import { getChainById } from "@/config/chains";
import { getSafeMessageHashAsync } from "@/lib/safeWallet";

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

/**
 * Build an EIP-1271 contract signature for Safe
 * 
 * Safe's signature format for contract signers (v=0):
 * - r: address of contract owner (padded to 32 bytes, left-padded with zeros)  
 * - s: offset to dynamic data from start of signatures (32 bytes)
 * - v: 0x00 (indicates contract signature)
 * - Dynamic part: 32-byte length + actual signature bytes (NOT padded)
 * 
 * @param contractAddress - The contract owner address (Smart Wallet)
 * @param signature - The actual signature (from EOA owner of the Smart Wallet)
 * @param dynamicOffset - Byte offset from start of signatures to where dynamic data begins
 */
function buildContractSignature(
    contractAddress: Address,
    signature: string,
    dynamicOffset: number
): { staticPart: string; dynamicPart: string; dynamicLength: number } {
    // r = verifier address (Smart Wallet), left-padded to 32 bytes
    const r = contractAddress.slice(2).toLowerCase().padStart(64, "0");
    
    // s = offset to dynamic data (from the very start of the signatures bytes)
    const s = dynamicOffset.toString(16).padStart(64, "0");
    
    // v = 0 indicates contract signature
    const v = "00";
    
    // Static part (65 bytes = 130 hex chars)
    const staticPart = r + s + v;
    
    // Dynamic part: length (32 bytes) + signature bytes (not padded)
    // Safe reads: sigLength from position s, then signature from s+32
    const sigHex = signature.startsWith("0x") ? signature.slice(2) : signature;
    const sigLengthBytes = sigHex.length / 2;
    const lengthHex = sigLengthBytes.toString(16).padStart(64, "0");
    
    // No padding needed - Safe just reads sigLength bytes
    const dynamicPart = lengthHex + sigHex;
    const dynamicLength = 32 + sigLengthBytes; // length field + signature
    
    return { staticPart, dynamicPart, dynamicLength };
}

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

            // Check if user's EOA is an owner (rare for vaults, but possible)
            const eoaIsOwner = owners.some(
                (owner) => owner.toLowerCase() === userAddress.toLowerCase()
            );
            
            // Check if user's Smart Wallet is an owner (standard for vaults)
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
     * @param smartWalletAddress - If the Safe owner is a Smart Wallet (not EOA), provide the SW address
     *                            The signature is still created by the EOA, but stored under the SW address
     * 
     * IMPORTANT for EIP-1271 (Smart Wallet signers):
     * When a Smart Wallet is the owner of the Vault, the Vault calls isValidSignature()
     * on the Smart Wallet. Safe's isValidSignature wraps the hash before validation:
     * - messageHash = keccak256(abi.encode(SAFE_MSG_TYPEHASH, originalHash))
     * - finalHash = keccak256("\x19\x01" || domainSeparator || messageHash)
     * 
     * So we must sign the WRAPPED hash, not the raw safeTxHash!
     */
    const signTransaction = useCallback(async (params: {
        safeAddress: Address;
        chainId: number;
        to: Address;
        value: string;
        data: Hex;
        nonce: number;
        smartWalletAddress?: Address;
    }): Promise<{ success: boolean; signature?: string; signerAddress?: string; safeTxHash?: string; error?: string }> => {
        if (!walletClient || !publicClient || !userAddress) {
            return { success: false, error: "Wallet not connected" };
        }

        setStatus("signing");
        setError(null);

        try {
            const { safeAddress, to, value, data, nonce, smartWalletAddress } = params;
            
            console.log("[VaultExecution] Signing transaction...");
            if (smartWalletAddress) {
                console.log("[VaultExecution] Signing for Smart Wallet owner:", smartWalletAddress);
            }

            // Get the vault's safeTxHash
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

            console.log("[VaultExecution] Vault safeTxHash:", safeTxHash);

            // Determine what hash to sign
            // For Smart Wallet owners (EIP-1271), we need to sign the WRAPPED hash
            // because Safe's isValidSignature wraps the hash before validation
            let hashToSign: Hex;
            
            if (smartWalletAddress) {
                // For contract signers: sign the Safe message hash
                // This is what the Smart Wallet's isValidSignature will validate against
                // Use async version to fetch the actual domain separator from the contract
                hashToSign = await getSafeMessageHashAsync(
                    smartWalletAddress, 
                    params.chainId, 
                    safeTxHash,
                    publicClient
                );
                console.log("[VaultExecution] EIP-1271: Signing wrapped Safe message hash:", hashToSign);
            } else {
                // For EOA signers: sign the raw safeTxHash
                hashToSign = safeTxHash;
            }

            // Sign the hash with wallet (EOA)
            const signature = await walletClient.signMessage({
                message: { raw: hashToSign },
            });

            // Adjust v value for Safe's signature format
            // For eth_sign, v should be 27 or 28, and we add 4 for eth_sign type
            let v = parseInt(signature.slice(-2), 16);
            if (v < 27) {
                v += 27;
            }
            v += 4; // Safe adds 4 for eth_sign signatures
            const adjustedSignature = signature.slice(0, -2) + v.toString(16).padStart(2, "0");

            console.log("[VaultExecution] Signature generated (eth_sign format, v=" + v + ")");
            setStatus("idle");

            // Return the Smart Wallet address as signer if provided (for ERC-1271 contract signatures)
            // The signature is from EOA but the Safe owner is the Smart Wallet
            const signerAddress = smartWalletAddress?.toLowerCase() || userAddress.toLowerCase();
            console.log("[VaultExecution] Signer address recorded as:", signerAddress);

            return {
                success: true,
                signature: adjustedSignature,
                signerAddress,
                safeTxHash, // Return the vault's safeTxHash (not the wrapped one) for reference
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
     * Supports both EOA signatures and ERC-1271 contract signatures (for Smart Wallet owners)
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

            // Verify Safe is deployed by trying to read nonce
            try {
                await publicClient.readContract({
                    address: safeAddress,
                    abi: SAFE_ABI,
                    functionName: "nonce",
                });
            } catch (readErr) {
                console.error("[VaultExecution] Cannot read Safe nonce:", readErr);
                const code = await publicClient.getCode({ address: safeAddress });
                if (!code || code === "0x" || code.length <= 2) {
                    throw new Error("Safe is not deployed yet. If you just deployed it, please wait and try again.");
                }
            }

            // Get Safe owners to determine which signers are contracts vs EOAs
            const owners = await publicClient.readContract({
                address: safeAddress,
                abi: SAFE_ABI,
                functionName: "getOwners",
            }) as Address[];
            
            console.log("[VaultExecution] Safe owners:", owners);

            // Sort signatures by signer address (Safe requires ascending order)
            const sortedSigs = [...signatures].sort((a, b) => 
                a.signerAddress.toLowerCase().localeCompare(b.signerAddress.toLowerCase())
            );

            // Determine which signers are contracts (Smart Wallets)
            const signerInfo: Array<{
                signerAddress: string;
                signature: string;
                isContract: boolean;
                isOwner: boolean;
            }> = [];

            for (const sig of sortedSigs) {
                const signerAddr = sig.signerAddress.toLowerCase() as Address;
                const isOwner = owners.some(o => o.toLowerCase() === signerAddr);
                
                // Check if the signer is a contract
                const signerCode = await publicClient.getCode({ address: signerAddr });
                const isContract = signerCode !== undefined && signerCode !== "0x" && signerCode.length > 2;
                
                console.log(`[VaultExecution] Signer ${signerAddr.slice(0, 10)}... isOwner=${isOwner}, isContract=${isContract}`);
                
                if (isOwner) {
                    signerInfo.push({
                        signerAddress: sig.signerAddress,
                        signature: sig.signature,
                        isContract,
                        isOwner,
                    });
                } else {
                    console.warn(`[VaultExecution] Skipping signer ${signerAddr} - not an owner`);
                }
            }

            // Build the signature bytes
            // For contract signers: static part points to dynamic data
            // For EOA signers: just the 65-byte signature
            
            let staticParts = "";
            let dynamicParts = "";
            
            // Calculate where dynamic data starts (after all static 65-byte parts)
            let dynamicOffset = signerInfo.length * 65;
            
            for (const info of signerInfo) {
                if (info.isContract) {
                    // Contract signature (EIP-1271) - v=0 format
                    const { staticPart, dynamicPart, dynamicLength } = buildContractSignature(
                        info.signerAddress as Address,
                        info.signature,
                        dynamicOffset
                    );
                    staticParts += staticPart;
                    dynamicParts += dynamicPart;
                    dynamicOffset += dynamicLength;
                } else {
                    // EOA signature - just append the 65-byte signature
                    const sigHex = info.signature.startsWith("0x") ? info.signature.slice(2) : info.signature;
                    staticParts += sigHex;
                }
            }
            
            const concatenatedSigs = ("0x" + staticParts + dynamicParts) as Hex;
            
            console.log("[VaultExecution] Final signatures length:", concatenatedSigs.length / 2 - 1, "bytes");
            console.log("[VaultExecution] Signatures (first 100 chars):", concatenatedSigs.slice(0, 100) + "...");

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
            console.log("[VaultExecution] Safe address:", safeAddress);
            console.log("[VaultExecution] User EOA:", userAddress);
            console.log("[VaultExecution] User Smart Wallet:", smartWalletAddress);

            // Try to get threshold - this will fail if Safe is not deployed
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
                const code = await publicClient.getCode({ address: safeAddress });
                const isDeployed = code !== undefined && code !== "0x" && code.length > 2;
                console.log("[VaultExecution] getCode check - deployed:", isDeployed, "code length:", code?.length);
                
                if (!isDeployed) {
                    setStatus("error");
                    setError("Vault Safe is not deployed yet. If you just deployed it, please wait a moment and try again.");
                    return { success: false, error: "Vault Safe is not deployed yet" };
                }
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
                const eoaIsOwner = await publicClient.readContract({
                    address: safeAddress,
                    abi: SAFE_ABI,
                    functionName: "isOwner",
                    args: [userAddress],
                }) as boolean;
                
                // Check if user's Smart Wallet is an owner
                let swIsOwner = false;
                if (smartWalletAddress) {
                    swIsOwner = await publicClient.readContract({
                        address: safeAddress,
                        abi: SAFE_ABI,
                        functionName: "isOwner",
                        args: [smartWalletAddress],
                    }) as boolean;
                }

                console.log("[VaultExecution] EOA is owner:", eoaIsOwner, "SW is owner:", swIsOwner);

                if (!eoaIsOwner && !swIsOwner) {
                    // Get actual owners for debugging
                    try {
                        const owners = await publicClient.readContract({
                            address: safeAddress,
                            abi: SAFE_ABI,
                            functionName: "getOwners",
                        }) as Address[];
                        console.error("[VaultExecution] Safe owners:", owners);
                    } catch (e) {
                        console.error("[VaultExecution] Could not fetch owners:", e);
                    }
                    setStatus("error");
                    setError("You are not an owner of this vault");
                    return { success: false, error: "You are not an owner of this vault" };
                }
                
                // Determine signer: prefer Smart Wallet if it's the owner (uses EIP-1271)
                const signerAddress = swIsOwner ? smartWalletAddress! : userAddress;

                console.log("[VaultExecution] Using signer:", signerAddress);

                setStatus("signing");

                // Get Safe nonce
                const nonce = await publicClient.readContract({
                    address: safeAddress,
                    abi: SAFE_ABI,
                    functionName: "nonce",
                }) as bigint;

                console.log("[VaultExecution] Safe nonce:", nonce);

                // Sign with EOA
                // If Smart Wallet is the owner, we pass smartWalletAddress so it's recorded as the signer
                const signResult = await signTransaction({
                    safeAddress,
                    chainId,
                    to,
                    value,
                    data,
                    nonce: Number(nonce),
                    smartWalletAddress: swIsOwner ? smartWalletAddress : undefined,
                });

                if (!signResult.success || !signResult.signature) {
                    return { success: false, error: signResult.error || "Failed to sign" };
                }

                // Execute with single signature
                // executeWithSignatures will detect if signer is a contract and format accordingly
                return await executeWithSignatures({
                    safeAddress,
                    chainId,
                    to,
                    value,
                    data,
                    signatures: [{ 
                        signerAddress: signerAddress.toLowerCase(), 
                        signature: signResult.signature,
                    }],
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
