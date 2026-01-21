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
 * 
 * PASSKEY SUPPORT:
 * - Passkey users can sign vault transactions using their passkey
 * - For execution, passkey users need to use the Safe app or have another member execute
 */

import { useState, useCallback, useEffect } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { type Address, type Hex, type Chain, encodeFunctionData, parseUnits, formatEther, concat, toHex, pad, encodeAbiParameters, createPublicClient, http } from "viem";
import { mainnet, base, arbitrum, optimism, polygon, bsc } from "viem/chains";
import { getChainById } from "@/config/chains";
import { getSafeMessageHashAsync, executeVaultViaPasskey, type PasskeyCredential } from "@/lib/safeWallet";
import { usePasskeySigner } from "@/hooks/usePasskeySigner";
import { getRpcUrl } from "@/lib/rpc";

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

// Create a public client for a specific chain (used when wagmi publicClient isn't available)
function getPublicClientForChain(chainId: number) {
    const chain = VIEM_CHAINS[chainId];
    if (!chain) {
        console.warn("[VaultExecution] Unknown chain:", chainId);
        return null;
    }
    
    // Use reliable public RPCs for read operations
    // Use centralized RPC config (dRPC if configured, otherwise fallback)
    const rpcUrl = getRpcUrl(chainId);
    if (!rpcUrl) {
        console.warn("[VaultExecution] No RPC URL for chain:", chainId);
        return null;
    }
    
    console.log("[VaultExecution] Creating public client for chain:", chainId, "RPC:", rpcUrl);
    
    return createPublicClient({
        chain,
        transport: http(rpcUrl),
    });
}

/**
 * Extract r and s components from a DER-encoded ECDSA signature
 * WebAuthn signatures are DER-encoded, but Safe's WebAuthn verifier expects r and s as uint256
 */
function extractRSFromDER(derSignature: Uint8Array): { r: bigint; s: bigint } {
    // DER format: 0x30 [total length] 0x02 [r length] [r] 0x02 [s length] [s]
    let offset = 0;
    
    // Check sequence tag
    if (derSignature[offset++] !== 0x30) {
        throw new Error("Invalid DER signature: expected sequence tag");
    }
    
    // Skip sequence length
    let seqLen = derSignature[offset++];
    if (seqLen & 0x80) {
        // Long form length
        const lenBytes = seqLen & 0x7f;
        offset += lenBytes;
    }
    
    // Read r
    if (derSignature[offset++] !== 0x02) {
        throw new Error("Invalid DER signature: expected integer tag for r");
    }
    const rLen = derSignature[offset++];
    let rBytes = derSignature.slice(offset, offset + rLen);
    offset += rLen;
    
    // Remove leading zero if present (DER uses it to indicate positive number)
    if (rBytes[0] === 0x00 && rBytes.length > 32) {
        rBytes = rBytes.slice(1);
    }
    
    // Read s
    if (derSignature[offset++] !== 0x02) {
        throw new Error("Invalid DER signature: expected integer tag for s");
    }
    const sLen = derSignature[offset++];
    let sBytes = derSignature.slice(offset, offset + sLen);
    
    // Remove leading zero if present
    if (sBytes[0] === 0x00 && sBytes.length > 32) {
        sBytes = sBytes.slice(1);
    }
    
    // Pad to 32 bytes if needed
    const rPadded = new Uint8Array(32);
    const sPadded = new Uint8Array(32);
    rPadded.set(rBytes, 32 - rBytes.length);
    sPadded.set(sBytes, 32 - sBytes.length);
    
    // Convert to bigint
    const r = BigInt("0x" + Array.from(rPadded).map(b => b.toString(16).padStart(2, "0")).join(""));
    const s = BigInt("0x" + Array.from(sPadded).map(b => b.toString(16).padStart(2, "0")).join(""));
    
    return { r, s };
}

/**
 * Extract the clientDataFields from clientDataJSON
 * Safe's WebAuthn verifier expects just the fields after the challenge
 * Format: "clientDataJSON": {"type":"webauthn.get","challenge":"...","origin":"...","crossOrigin":false}
 * We need: ","origin":"...","crossOrigin":false}
 */
function extractClientDataFields(clientDataJSON: string): string {
    // Find the end of the challenge value (after the base64url challenge string)
    const challengeEndIndex = clientDataJSON.indexOf('","', clientDataJSON.indexOf('"challenge"'));
    if (challengeEndIndex === -1) {
        throw new Error("Invalid clientDataJSON: could not find challenge end");
    }
    
    // Extract everything from after the challenge to the end
    // This includes: ,"origin":"...","crossOrigin":...}
    const fields = clientDataJSON.slice(challengeEndIndex);
    
    // Remove the closing brace - Safe adds it back
    return fields.endsWith("}") ? fields.slice(0, -1) : fields;
}

export function useVaultExecution(passkeyUserAddress?: Address) {
    const { address: wagmiAddress } = useAccount();
    const { data: walletClient } = useWalletClient();
    const wagmiPublicClient = usePublicClient();
    const passkeySigner = usePasskeySigner();
    
    // Use wagmi address if connected, otherwise use passkey address
    const userAddress = wagmiAddress || passkeyUserAddress;
    
    // Track if this is a passkey-only user (no external wallet connected)
    const isPasskeyOnly = !wagmiAddress && !!passkeyUserAddress;
    
    const [status, setStatus] = useState<VaultExecutionStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    
    // Auto-load passkey credential when user is a passkey user
    // This is needed for vault execution to work
    useEffect(() => {
        if (isPasskeyOnly && passkeyUserAddress && !passkeySigner.isReady && !passkeySigner.isLoading) {
            console.log("[VaultExecution] Auto-loading passkey credential for:", passkeyUserAddress.slice(0, 10));
            passkeySigner.loadCredential(passkeyUserAddress);
        }
    }, [isPasskeyOnly, passkeyUserAddress, passkeySigner]);
    
    // Get public client for a specific chain
    // IMPORTANT: If chainId is provided, ALWAYS use chain-specific client
    // because wagmiPublicClient might be on a different chain!
    const getPublicClient = useCallback((chainId?: number) => {
        // If a specific chain is requested, use chain-specific client
        if (chainId) {
            // Only use wagmi client if it's on the same chain
            if (wagmiPublicClient && wagmiPublicClient.chain?.id === chainId) {
                return wagmiPublicClient;
            }
            return getPublicClientForChain(chainId);
        }
        // No chain specified - use wagmi if available, otherwise default to Base
        if (wagmiPublicClient) return wagmiPublicClient;
        return getPublicClientForChain(8453);
    }, [wagmiPublicClient]);

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
        const publicClient = getPublicClient(chainId);
        
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
    }, [userAddress, getPublicClient]);

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
        const publicClient = getPublicClient(params.chainId);
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
    }, [getPublicClient]);

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
     * 
     * PASSKEY SUPPORT:
     * - Passkey users can sign using their passkey credential
     * - The passkey signer is loaded automatically when needed
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
        const publicClient = getPublicClient(params.chainId);
        
        // Check if we have either a wallet client OR passkey capability
        const hasWalletClient = !!walletClient;
        const canUsePasskey = isPasskeyOnly && !!userAddress;
        
        if (!publicClient || !userAddress) {
            return { success: false, error: "Not connected" };
        }
        
        if (!hasWalletClient && !canUsePasskey) {
            return { success: false, error: "Wallet not connected" };
        }

        setStatus("signing");
        setError(null);

        try {
            const { safeAddress, to, value, data, nonce, smartWalletAddress } = params;
            
            console.log("[VaultExecution] Signing transaction...");
            console.log("[VaultExecution] Using passkey:", canUsePasskey && !hasWalletClient);
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

            let signature: string;
            
            // Sign with wallet client or passkey
            if (hasWalletClient && walletClient) {
                // Sign the hash with wallet (EOA)
                signature = await walletClient.signMessage({
                    message: { raw: hashToSign },
                });
            } else if (canUsePasskey) {
                // Load passkey credential if not already loaded
                if (!passkeySigner.isReady) {
                    await passkeySigner.loadCredential(userAddress);
                }
                
                if (!passkeySigner.credential) {
                    throw new Error("Failed to load passkey credential");
                }
                
                // Sign with passkey
                const passkeyResult = await passkeySigner.signChallenge(hashToSign);
                if (!passkeyResult) {
                    throw new Error(passkeySigner.error || "Passkey signing cancelled");
                }
                
                // For WebAuthn/passkey signatures with Safe Smart Wallet:
                // The signature must be ABI-encoded with all WebAuthn assertion components
                // Safe's WebAuthn verification expects: (authenticatorData, clientDataFields, r, s)
                
                // 1. Extract r and s from the DER-encoded signature
                const { r, s } = extractRSFromDER(passkeyResult.signature);
                
                // 2. Extract the "clientDataFields" from clientDataJSON
                // This is everything after the challenge in the JSON (origin, type, etc.)
                const clientDataFields = extractClientDataFields(passkeyResult.clientDataJSON);
                
                // 3. ABI-encode the full WebAuthn signature for Safe verification
                signature = encodeAbiParameters(
                    [
                        { name: "authenticatorData", type: "bytes" },
                        { name: "clientDataFields", type: "bytes" },
                        { name: "r", type: "uint256" },
                        { name: "s", type: "uint256" },
                    ],
                    [
                        toHex(passkeyResult.authenticatorData),
                        toHex(new TextEncoder().encode(clientDataFields)),
                        r,
                        s,
                    ]
                );
                
                console.log("[VaultExecution] WebAuthn signature encoded for Safe verification");
            } else {
                throw new Error("No signing method available");
            }

            let adjustedSignature: string;
            
            if (canUsePasskey && !hasWalletClient) {
                // For WebAuthn signatures, don't adjust v - the signature is already properly encoded
                adjustedSignature = signature;
                console.log("[VaultExecution] Using WebAuthn signature format");
            } else {
                // Adjust v value for Safe's signature format (EOA signatures)
                // For eth_sign, v should be 27 or 28, and we add 4 for eth_sign type
                let v = parseInt(signature.slice(-2), 16);
                if (v < 27) {
                    v += 27;
                }
                v += 4; // Safe adds 4 for eth_sign signatures
                adjustedSignature = signature.slice(0, -2) + v.toString(16).padStart(2, "0");
                console.log("[VaultExecution] EOA signature adjusted (v=" + v + ")");
            }
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
    }, [walletClient, userAddress, getSafeTxHash, getPublicClient, isPasskeyOnly, passkeySigner]);

    /**
     * Execute vault transaction via passkey Smart Wallet
     * This is used when passkey users need to execute vault transactions
     */
    const executeWithSignaturesViaPasskey = useCallback(async (params: {
        safeAddress: Address;
        chainId: number;
        to: Address;
        value: string;
        data: Hex;
        signatures: Array<{ signerAddress: string; signature: string }>;
    }): Promise<{ success: boolean; txHash?: string; error?: string }> => {
        // Try to load credential if not ready
        if (!passkeySigner.isReady && passkeyUserAddress) {
            console.log("[VaultExecution] Passkey not ready, attempting to load credential...");
            await passkeySigner.loadCredential(passkeyUserAddress);
            // Wait a moment for state to update
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (!passkeySigner.isReady || !passkeySigner.credential) {
            return { success: false, error: "Unable to load passkey. Please ensure you have a passkey registered and try again." };
        }
        
        const { credentialId, publicKeyX, publicKeyY } = passkeySigner.credential;
        if (!credentialId || !publicKeyX || !publicKeyY) {
            return { success: false, error: "Invalid passkey credential" };
        }

        setStatus("executing");
        setError(null);
        setTxHash(null);

        try {
            const { safeAddress, chainId, to, value, data, signatures } = params;
            
            console.log("[VaultExecution] Executing via Passkey Smart Wallet with", signatures.length, "signatures");
            console.log("[VaultExecution] Chain:", chainId, "Vault:", safeAddress);

            // Use server-side API to read vault data (bypasses CORS issues)
            console.log("[VaultExecution] Reading vault data via server API...");
            const vaultReadResponse = await fetch(
                `/api/vault/${safeAddress}/read?safeAddress=${safeAddress}&chainId=${chainId}`,
                { credentials: "include" }
            );
            
            if (!vaultReadResponse.ok) {
                const errorData = await vaultReadResponse.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to read vault (status ${vaultReadResponse.status})`);
            }
            
            const vaultData = await vaultReadResponse.json();
            const owners = vaultData.owners as Address[];
            
            if (!owners || owners.length === 0) {
                throw new Error("Failed to read vault owners");
            }
            
            console.log("[VaultExecution] Vault owners:", owners);
            
            console.log("[VaultExecution] Signature signer addresses:", signatures.map(s => s.signerAddress));

            // Sort signatures by signer address (Safe requires ascending order)
            const sortedSigs = [...signatures].sort((a, b) => 
                a.signerAddress.toLowerCase().localeCompare(b.signerAddress.toLowerCase())
            );

            // Build signatures with contract signature format for Smart Wallet owners
            const signerInfo: Array<{
                signerAddress: string;
                signature: string;
                isContract: boolean;
                isOwner: boolean;
            }> = [];
            
            // Track non-owner signers for error message
            const nonOwnerSigners: string[] = [];

            // Create a fresh client for checking signer types
            const freshClient = getPublicClientForChain(chainId);
            
            for (const sig of sortedSigs) {
                const signerAddr = sig.signerAddress.toLowerCase() as Address;
                const isOwner = owners.some(o => o.toLowerCase() === signerAddr);
                
                // Check if signer is a contract - if client unavailable, assume contract for Smart Wallets
                let isContract = true; // Default to true for Smart Wallets
                if (freshClient) {
                    try {
                        const signerCode = await freshClient.getCode({ address: signerAddr });
                        isContract = signerCode !== undefined && signerCode !== "0x" && signerCode.length > 2;
                    } catch (codeErr) {
                        console.warn(`[VaultExecution] Could not check if signer is contract, assuming true:`, codeErr);
                    }
                }
                
                console.log(`[VaultExecution] Signer ${signerAddr.slice(0, 10)}... isOwner=${isOwner}, isContract=${isContract}`);
                
                if (isOwner) {
                    signerInfo.push({
                        signerAddress: sig.signerAddress,
                        signature: sig.signature,
                        isContract,
                        isOwner,
                    });
                } else {
                    nonOwnerSigners.push(signerAddr);
                }
            }

            if (signerInfo.length === 0) {
                // Provide a more helpful error message
                const ownersShort = owners.map(o => `${o.slice(0, 6)}...${o.slice(-4)}`).join(", ");
                const signersShort = nonOwnerSigners.map(s => `${s.slice(0, 6)}...${s.slice(-4)}`).join(", ");
                console.error("[VaultExecution] Owner mismatch! Vault owners:", owners);
                console.error("[VaultExecution] Signature signers:", signatures.map(s => s.signerAddress));
                throw new Error(
                    `Vault ownership mismatch: Your Smart Wallet (${signersShort}) is not an owner of this vault. ` +
                    `Vault owners: ${ownersShort}. This vault may have been created with an outdated Smart Wallet address. ` +
                    `Please create a new vault to use with your current passkey.`
                );
            }

            // Build the final signatures bytes for Safe
            // Contract signatures use special format with v=0
            const staticParts: string[] = [];
            const dynamicParts: string[] = [];
            let dynamicOffset = signerInfo.length * 65; // 65 bytes per static signature

            for (const info of signerInfo) {
                if (info.isContract) {
                    // Build contract signature
                    const contractSig = buildContractSignature(
                        info.signerAddress as Address,
                        info.signature,
                        dynamicOffset
                    );
                    staticParts.push(contractSig.staticPart);
                    dynamicParts.push(contractSig.dynamicPart);
                    dynamicOffset += contractSig.dynamicLength;
                } else {
                    // Regular EOA signature (65 bytes, no padding needed)
                    const sigHex = info.signature.startsWith("0x") 
                        ? info.signature.slice(2) 
                        : info.signature;
                    staticParts.push(sigHex);
                }
            }

            const combinedSignatures = "0x" + staticParts.join("") + dynamicParts.join("") as Hex;
            console.log("[VaultExecution] Combined signatures length:", combinedSignatures.length);

            // Create passkey credential - use the credential from the signer hook
            const passkeyCredential: PasskeyCredential = {
                credentialId,
                publicKey: {
                    x: publicKeyX,
                    y: publicKeyY,
                },
            };

            // Execute via passkey Smart Wallet
            const hash = await executeVaultViaPasskey(
                safeAddress,
                chainId,
                to,
                BigInt(value),
                data,
                combinedSignatures,
                passkeyCredential
            );

            setTxHash(hash);
            setStatus("success");
            console.log("[VaultExecution] Passkey execution successful:", hash);

            return { success: true, txHash: hash };
        } catch (err) {
            console.error("[VaultExecution] Passkey execution error:", err);
            const errorMessage = err instanceof Error ? err.message : "Execution failed";
            setStatus("error");
            setError(errorMessage);
            return { success: false, error: errorMessage };
        }
    }, [passkeySigner, getPublicClient]);

    /**
     * Execute with multiple signatures (for multi-sig)
     * Supports both EOA signatures and ERC-1271 contract signatures (for Smart Wallet owners)
     * 
     * Now also supports passkey users via passkey Smart Wallet execution.
     */
    const executeWithSignatures = useCallback(async (params: {
        safeAddress: Address;
        chainId: number;
        to: Address;
        value: string;
        data: Hex;
        signatures: Array<{ signerAddress: string; signature: string }>;
    }): Promise<{ success: boolean; txHash?: string; error?: string }> => {
        const publicClient = getPublicClient(params.chainId);
        
        // For passkey users, we can execute via the passkey Smart Wallet
        if (isPasskeyOnly && passkeySigner.isReady) {
            return executeWithSignaturesViaPasskey(params);
        }
        
        // Execution requires a wallet client to send the transaction and pay gas
        if (!walletClient || !publicClient || !userAddress) {
            if (isPasskeyOnly) {
                // Try to load passkey credential if not ready
                if (passkeyUserAddress && !passkeySigner.isReady) {
                    console.log("[VaultExecution] Loading passkey credential for execution...");
                    await passkeySigner.loadCredential(passkeyUserAddress);
                    // Wait a moment for state to update
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
                // Try again after loading
                if (passkeySigner.isReady) {
                    return executeWithSignaturesViaPasskey(params);
                }
                return { 
                    success: false, 
                    error: "Unable to load passkey. Please refresh the page and try again." 
                };
            }
            return { success: false, error: "Please connect your wallet to execute vault transactions." };
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
            
            // Track non-owner signers for error message
            const nonOwnerSigners: string[] = [];

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
                    nonOwnerSigners.push(signerAddr);
                }
            }
            
            // Check if we have any valid signatures
            if (signerInfo.length === 0) {
                const ownersShort = owners.map(o => `${o.slice(0, 6)}...${o.slice(-4)}`).join(", ");
                const signersShort = nonOwnerSigners.map(s => `${s.slice(0, 6)}...${s.slice(-4)}`).join(", ");
                console.error("[VaultExecution] Owner mismatch! Vault owners:", owners);
                console.error("[VaultExecution] Signature signers:", signatures.map(s => s.signerAddress));
                throw new Error(
                    `Vault ownership mismatch: Your Smart Wallet (${signersShort}) is not an owner of this vault. ` +
                    `Vault owners: ${ownersShort}. This vault may have been created with an outdated Smart Wallet address. ` +
                    `Please create a new vault to use with your current passkey.`
                );
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

            // Prepare the transaction arguments
            const txArgs = [
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
            ] as const;

            // Get current gas prices to ensure transaction is properly priced
            let maxFeePerGas: bigint | undefined;
            let maxPriorityFeePerGas: bigint | undefined;
            try {
                const feeData = await publicClient.estimateFeesPerGas();
                maxFeePerGas = feeData.maxFeePerGas;
                maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
                // Add 10% buffer to gas prices to help with network congestion
                if (maxFeePerGas) {
                    maxFeePerGas = (maxFeePerGas * BigInt(110)) / BigInt(100);
                }
                console.log("[VaultExecution] Gas prices:", {
                    maxFeePerGas: maxFeePerGas?.toString(),
                    maxPriorityFeePerGas: maxPriorityFeePerGas?.toString(),
                });
            } catch (feeErr) {
                console.warn("[VaultExecution] Fee estimation failed, using defaults:", feeErr);
                // Fallback to reasonable defaults for Base
                maxFeePerGas = BigInt(100000000); // 0.1 gwei
                maxPriorityFeePerGas = BigInt(50000000); // 0.05 gwei
            }

            // Estimate gas first to help wallets that have issues with complex Safe transactions
            let gasEstimate: bigint | undefined;
            try {
                gasEstimate = await publicClient.estimateContractGas({
                    address: safeAddress,
                    abi: SAFE_ABI,
                    functionName: "execTransaction",
                    args: txArgs,
                    account: userAddress,
                });
                // Add 20% buffer for safety
                gasEstimate = (gasEstimate * BigInt(120)) / BigInt(100);
                console.log("[VaultExecution] Estimated gas:", gasEstimate.toString());
            } catch (gasErr) {
                console.warn("[VaultExecution] Gas estimation failed, letting wallet estimate:", gasErr);
            }

            // Execute the transaction with explicit gas parameters
            const hash = await walletClient.writeContract({
                address: safeAddress,
                abi: SAFE_ABI,
                functionName: "execTransaction",
                args: txArgs,
                chain,
                ...(gasEstimate ? { gas: gasEstimate } : {}),
                ...(maxFeePerGas ? { maxFeePerGas } : {}),
                ...(maxPriorityFeePerGas ? { maxPriorityFeePerGas } : {}),
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
    }, [walletClient, userAddress, getPublicClient, isPasskeyOnly, executeWithSignaturesViaPasskey, passkeySigner, passkeyUserAddress]);

    /**
     * Execute a vault transaction (for threshold=1 or with pre-collected signatures)
     * @param smartWalletAddress - Optional: user's Smart Wallet address if that's the Safe owner
     * 
     * NOTE: Execution requires an external wallet to pay gas. Passkey-only users cannot execute
     * directly and should use the Safe app or ask another vault member to execute.
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
        const publicClient = getPublicClient(chainId);

        // For passkey users, try to execute via passkey Smart Wallet
        if (isPasskeyOnly) {
            // Try to load passkey if not ready
            if (passkeyUserAddress && !passkeySigner.isReady && !passkeySigner.isLoading) {
                console.log("[VaultExecution] Loading passkey for vault execution...");
                await passkeySigner.loadCredential(passkeyUserAddress);
                // Wait for state to update
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            if (!passkeySigner.isReady) {
                return { 
                    success: false, 
                    error: "Unable to load passkey. Please refresh the page and try again." 
                };
            }
            
            // For passkey users, we need to sign and execute via passkey Smart Wallet
            // This handles both pre-collected signatures AND threshold=1 (sign on demand)
            const credential = passkeySigner.credential;
            if (!credential) {
                return { success: false, error: "Passkey credential not available" };
            }
            
            // If we have pre-collected signatures, use them
            if (signatures && signatures.length > 0) {
                return executeWithSignaturesViaPasskey({
                    safeAddress,
                    chainId,
                    to,
                    value,
                    data,
                    signatures,
                });
            }
            
            // For threshold=1 vaults without pre-collected signatures, 
            // we need to sign with the passkey and execute
            console.log("[VaultExecution] Passkey user executing threshold=1 vault transaction");
            
            // Get current nonce for the vault via server-side API (bypasses CORS)
            console.log("[VaultExecution] Reading vault nonce via server API...");
            const vaultReadResponse = await fetch(
                `/api/vault/${safeAddress}/read?safeAddress=${safeAddress}&chainId=${chainId}`,
                { credentials: "include" }
            );
            
            if (!vaultReadResponse.ok) {
                const errorData = await vaultReadResponse.json().catch(() => ({}));
                return { 
                    success: false, 
                    error: errorData.error || `Failed to read vault (status ${vaultReadResponse.status})` 
                };
            }
            
            const vaultData = await vaultReadResponse.json();
            const nonce = vaultData.nonce as number;
            
            console.log("[VaultExecution] Vault nonce:", nonce);
            
            // Sign the transaction with the passkey first
            // CRITICAL: Pass smartWalletAddress so the signature is recorded under the Safe owner
            const signResult = await signTransaction({
                safeAddress,
                chainId,
                to,
                value,
                data,
                nonce,
                smartWalletAddress, // Pass the Smart Wallet address for EIP-1271 signing
            });
            
            if (!signResult.success || !signResult.signature) {
                return { 
                    success: false, 
                    error: signResult.error || "Failed to sign transaction with passkey" 
                };
            }
            
            // Execute with the signature
            // Use the signer address returned from signTransaction (which will be the Smart Wallet)
            return executeWithSignaturesViaPasskey({
                safeAddress,
                chainId,
                to,
                value,
                data,
                signatures: [{
                    signerAddress: signResult.signerAddress || smartWalletAddress || userAddress || passkeyUserAddress!,
                    signature: signResult.signature,
                }],
            });
        }

        // Execution requires a wallet client to send the transaction and pay gas
        if (!walletClient || !publicClient || !userAddress) {
            return { success: false, error: "Please connect your wallet to execute vault transactions." };
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
    }, [walletClient, userAddress, signTransaction, executeWithSignatures, executeWithSignaturesViaPasskey, getPublicClient, isPasskeyOnly, passkeySigner, passkeyUserAddress]);

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
        isPasskeyOnly, // True if user is authenticated via passkey only (no external wallet)
    };
}
