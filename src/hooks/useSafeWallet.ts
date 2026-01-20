"use client";

import { useState, useCallback, useEffect } from "react";
import { useAccount, useSignMessage, useSignTypedData, useWalletClient, useSwitchChain } from "wagmi";
import { type Address, type Hex, parseEther, parseUnits, formatEther, formatUnits } from "viem";
import {
    getSafeAddress,
    isSafeDeployed,
    createSafeAccountClient,
    createPasskeySafeAccountClient,
    sendSafeTransaction,
    estimateSafeGas,
    execSafeTransactionDirect,
    execSafeERC20TransferDirect,
    SAFE_SUPPORTED_CHAINS,
    chainRequiresErc20Payment,
    checkPaymasterAllowance,
    getPublicClient,
    type SendTransactionParams,
    type PasskeyCredential,
} from "@/lib/safeWallet";
import { type P256PublicKey } from "@/lib/passkeySigner";

export type SafeStatus = "idle" | "loading" | "ready" | "deploying" | "sending" | "success" | "error";

export type SignerType = "eoa" | "passkey";

export interface SafeWalletState {
    safeAddress: Address | null;
    isDeployed: boolean;
    chainId: number;
    status: SafeStatus;
    error: string | null;
    signerType: SignerType;
}

export interface SendOptions {
    /** If true, EOA pays gas in ETH instead of Safe paying via paymaster */
    useEOAForGas?: boolean;
    /** Override the chain ID for this transaction */
    chainId?: number;
}

export interface UseSafeWalletReturn {
    // State
    safeAddress: Address | null;
    isDeployed: boolean;
    isLoading: boolean;
    isSending: boolean;
    status: SafeStatus;
    error: string | null;
    txHash: string | null;
    signerType: SignerType;
    
    // Gas estimation
    estimatedGas: {
        costEth: string;
        costUsd: number | null;
    } | null;
    
    // Actions
    initialize: (chainId?: number) => Promise<void>;
    initializeWithPasskey: (credential: PasskeyCredentialInput, chainId?: number) => Promise<void>;
    sendTransaction: (to: Address, amountEth: string, tokenAddress?: Address, tokenDecimals?: number, options?: SendOptions) => Promise<string | null>;
    estimateGas: (to: Address, amountEth: string) => Promise<void>;
    reset: () => void;
}

export interface PasskeyCredentialInput {
    credentialId: string;
    publicKeyX: Hex;
    publicKeyY: Hex;
}

// Fetch ETH price from API
async function fetchEthPrice(): Promise<number> {
    try {
        const response = await fetch("/api/prices?symbols=ETH");
        if (response.ok) {
            const data = await response.json();
            return data.prices?.ETH || 3500; // Fallback to 3500 if API fails
        }
    } catch (error) {
        console.error("[SafeWallet] Error fetching ETH price:", error);
    }
    return 3500; // Fallback price
}

export function useSafeWallet(): UseSafeWalletReturn {
    const { address: ownerAddress, isConnected, chainId: connectedChainId } = useAccount();
    const { signMessageAsync } = useSignMessage();
    const { signTypedDataAsync } = useSignTypedData();
    const { data: walletClient } = useWalletClient();
    const { switchChainAsync } = useSwitchChain();
    
    const [safeAddress, setSafeAddress] = useState<Address | null>(null);
    const [isDeployed, setIsDeployed] = useState(false);
    const [chainId, setChainId] = useState<number>(8453); // Default to Base
    const [status, setStatus] = useState<SafeStatus>("idle");
    const [error, setError] = useState<string | null>(null);
    const [txHash, setTxHash] = useState<string | null>(null);
    const [estimatedGas, setEstimatedGas] = useState<{ costEth: string; costUsd: number | null } | null>(null);
    const [signerType, setSignerType] = useState<SignerType>("eoa");
    const [passkeyCredential, setPasskeyCredential] = useState<PasskeyCredential | null>(null);

    // Initialize Safe address with EOA signer
    const initialize = useCallback(async (preferredChainId?: number) => {
        if (!ownerAddress || !isConnected) {
            setError("Wallet not connected");
            return;
        }

        const targetChainId = preferredChainId || connectedChainId || 8453;
        
        if (!SAFE_SUPPORTED_CHAINS[targetChainId]) {
            setError(`Chain ${targetChainId} not supported for Safe`);
            return;
        }

        setStatus("loading");
        setError(null);
        setChainId(targetChainId);
        setSignerType("eoa");

        try {
            // Get the counterfactual Safe address
            const address = await getSafeAddress({
                ownerAddress,
                chainId: targetChainId,
            });

            setSafeAddress(address);

            // Check if already deployed
            const deployed = await isSafeDeployed(address, targetChainId);
            setIsDeployed(deployed);
            
            setStatus("ready");
        } catch (err) {
            console.error("[SafeWallet] Initialization error:", err);
            setError(err instanceof Error ? err.message : "Failed to initialize Safe");
            setStatus("error");
        }
    }, [ownerAddress, isConnected, connectedChainId]);

    // Initialize Safe with passkey signer
    const initializeWithPasskey = useCallback(async (
        credential: PasskeyCredentialInput,
        preferredChainId?: number
    ) => {
        const targetChainId = preferredChainId || 8453;
        
        if (!SAFE_SUPPORTED_CHAINS[targetChainId]) {
            setError(`Chain ${targetChainId} not supported for Safe`);
            return;
        }

        setStatus("loading");
        setError(null);
        setChainId(targetChainId);
        setSignerType("passkey");

        try {
            // Import passkey signer utilities
            const { calculateWebAuthnSignerAddress } = await import("@/lib/passkeySigner");
            
            const publicKey: P256PublicKey = {
                x: credential.publicKeyX,
                y: credential.publicKeyY,
            };

            // Calculate the Safe address with WebAuthn signer as owner
            const webAuthnSignerAddress = calculateWebAuthnSignerAddress(publicKey, targetChainId);
            
            // Get the Safe address with this owner
            const address = await getSafeAddress({
                ownerAddress: webAuthnSignerAddress,
                chainId: targetChainId,
            });

            setSafeAddress(address);

            // Create the passkey signing function
            const signWithPasskey = async (challenge: Hex): Promise<{
                authenticatorData: Uint8Array;
                clientDataJSON: string;
                signature: Uint8Array;
            } | null> => {
                const rpId = window.location.hostname;
                const challengeBytes = hexToBytes(challenge);
                
                const options: PublicKeyCredentialRequestOptions = {
                    challenge: challengeBytes.buffer.slice(
                        challengeBytes.byteOffset,
                        challengeBytes.byteOffset + challengeBytes.byteLength
                    ) as ArrayBuffer,
                    rpId,
                    allowCredentials: [{
                        id: base64UrlToArrayBuffer(credential.credentialId),
                        type: "public-key",
                        transports: ["internal", "hybrid"] as AuthenticatorTransport[],
                    }],
                    userVerification: "required",
                    timeout: 60000,
                };

                try {
                    const assertion = await navigator.credentials.get({
                        publicKey: options,
                    }) as PublicKeyCredential;

                    if (!assertion) return null;

                    const response = assertion.response as AuthenticatorAssertionResponse;
                    
                    return {
                        authenticatorData: new Uint8Array(response.authenticatorData),
                        clientDataJSON: new TextDecoder().decode(response.clientDataJSON),
                        signature: new Uint8Array(response.signature),
                    };
                } catch {
                    return null;
                }
            };

            // Store the passkey credential for signing
            // Note: viem's toWebAuthnAccount handles the actual signing
            setPasskeyCredential({
                publicKey,
                credentialId: credential.credentialId,
            });

            // Check if already deployed
            const deployed = await isSafeDeployed(address, targetChainId);
            setIsDeployed(deployed);
            
            setStatus("ready");
            console.log("[SafeWallet] Initialized with passkey signer:", address.slice(0, 10) + "...");
        } catch (err) {
            console.error("[SafeWallet] Passkey initialization error:", err);
            setError(err instanceof Error ? err.message : "Failed to initialize Safe with passkey");
            setStatus("error");
        }
    }, []);

    // Estimate gas for a transaction
    const estimateGas = useCallback(async (to: Address, amountEth: string) => {
        if (!ownerAddress || !chainId) return;

        try {
            const estimate = await estimateSafeGas(
                ownerAddress,
                chainId,
                {
                    to,
                    value: parseEther(amountEth),
                }
            );

            const costEth = estimate.estimatedCostEth;
            
            // Fetch real-time ETH price
            const ethPrice = await fetchEthPrice();
            const costUsd = parseFloat(costEth) * ethPrice;

            setEstimatedGas({
                costEth,
                costUsd: costUsd > 0.01 ? costUsd : null,
            });
        } catch (err) {
            console.error("[SafeWallet] Gas estimation error:", err);
            // Don't set error, just log it
        }
    }, [ownerAddress, chainId]);

    // Send transaction through Safe
    // Supports both native ETH and ERC20 token transfers
    const sendTransaction = useCallback(async (
        to: Address,
        amount: string,
        tokenAddress?: Address,
        tokenDecimals?: number,
        options?: SendOptions
    ): Promise<string | null> => {
        const { useEOAForGas = false, chainId: overrideChainId } = options || {};
        
        // Use override chainId if provided, otherwise use hook's chainId
        const targetChainId = overrideChainId || chainId;
        
        // Validate based on signer type
        if (signerType === "eoa") {
            if (!ownerAddress || !isConnected || !walletClient) {
                setError("Wallet not connected");
                return null;
            }
        } else if (signerType === "passkey") {
            if (!passkeyCredential) {
                setError("Passkey not initialized");
                return null;
            }
        }

        if (!SAFE_SUPPORTED_CHAINS[targetChainId]) {
            setError("Unsupported chain");
            return null;
        }

        setStatus("sending");
        setError(null);
        setTxHash(null);

        try {
            // Switch wallet to target chain if needed (required for EIP-712 signing)
            if (connectedChainId !== targetChainId && signerType === "eoa") {
                console.log(`[SafeWallet] Switching wallet from chain ${connectedChainId} to ${targetChainId}`);
                try {
                    await switchChainAsync({ chainId: targetChainId });
                    console.log(`[SafeWallet] Successfully switched to chain ${targetChainId}`);
                } catch (switchError) {
                    console.error(`[SafeWallet] Failed to switch chain:`, switchError);
                    setError(`Please switch your wallet to ${SAFE_SUPPORTED_CHAINS[targetChainId]?.name || `chain ${targetChainId}`}`);
                    setStatus("error");
                    return null;
                }
            }
            // For Mainnet without USDC approval:
            // - Try bundler with native gas (Safe pays from its ETH balance)
            // - If useEOAForGas is true, use direct execution (EOA pays gas)
            const predictedSafeAddress = safeAddress || await getSafeAddress({ ownerAddress: ownerAddress!, chainId: targetChainId });
            let forceNativeGas = useEOAForGas;

            if (chainRequiresErc20Payment(targetChainId) && predictedSafeAddress && !useEOAForGas) {
                console.log(`[SafeWallet] Checking USDC approval for mainnet transaction...`);
                const { hasApproval, allowance } = await checkPaymasterAllowance(predictedSafeAddress, targetChainId);
                console.log(`[SafeWallet] USDC approval: ${hasApproval}, allowance: ${allowance.toString()}`);
                if (!hasApproval) {
                    // No USDC approval - use native gas from Safe's ETH balance via bundler
                    // This is more gas efficient than direct execution
                    console.log(`[SafeWallet] No USDC approval on Mainnet - using bundler with native gas from Safe balance`);
                    forceNativeGas = true;
                }
            }

            // If using EOA for gas on Mainnet, use DIRECT Safe execution (bypasses bundler)
            // This lets the EOA pay gas directly from their wallet
            // Note: If Safe isn't deployed yet, it will be deployed first (EOA pays gas)
            if (useEOAForGas && chainRequiresErc20Payment(targetChainId) && walletClient) {
                console.log(`[SafeWallet] Using DIRECT Safe execution - EOA pays gas`);
                
                // Create wallet client wrapper for direct execution
                const walletClientWrapper = {
                    account: { address: ownerAddress! },
                    signMessage: async (args: { message: { raw: Hex } }) => {
                        // Use wagmi's signMessage for raw hash signing
                        return await signMessageAsync({ message: { raw: args.message.raw } });
                    },
                    writeContract: async (args: unknown) => {
                        // Use walletClient to write contract
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        return await walletClient.writeContract(args as any);
                    },
                };

                let hash;
                if (tokenAddress && tokenDecimals !== undefined) {
                    // ERC20 token transfer
                    const tokenAmount = parseUnits(amount, tokenDecimals);
                    console.log(`[SafeWallet] Direct ERC20 transfer: ${amount} (${tokenAmount} raw) to ${to}`);
                    hash = await execSafeERC20TransferDirect(
                        predictedSafeAddress,
                        targetChainId,
                        tokenAddress,
                        to,
                        tokenAmount,
                        walletClientWrapper
                    );
                } else {
                    // Native ETH transfer
                    console.log(`[SafeWallet] Direct ETH transfer: ${amount} to ${to}`);
                    hash = await execSafeTransactionDirect(
                        predictedSafeAddress,
                        targetChainId,
                        to,
                        parseEther(amount),
                        "0x",
                        walletClientWrapper
                    );
                }

                setTxHash(hash);
                setStatus("success");
                return hash;
            }

            // Standard path: Use ERC-4337 bundler with paymaster
            let safeClient;

            if (signerType === "passkey" && passkeyCredential) {
                // Create Safe account client with passkey signer
                safeClient = await createPasskeySafeAccountClient(
                    passkeyCredential,
                    targetChainId,
                    { forceNativeGas }
                );
            } else {
                // Create Safe account client with EOA signer
                // Use walletClient directly to avoid wagmi chain validation
                // Safe bundler signing is chain-agnostic
                if (!walletClient) {
                    throw new Error("Wallet client not available");
                }
                safeClient = await createSafeAccountClient(
                    ownerAddress!,
                    targetChainId,
                    async (message: string) => {
                        // Sign message directly - chain agnostic for bundler transactions
                        return await walletClient.signMessage({ 
                            account: walletClient.account!, 
                            message 
                        });
                    },
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    async (typedData: any) => {
                        // Sign typed data directly - chain agnostic for bundler transactions
                        return await walletClient.signTypedData({
                            account: walletClient.account!,
                            ...typedData,
                        });
                    },
                    { forceNativeGas }
                );
            }

            // Get the Safe address from the client (more reliable than state variable)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const safeAccountAddress = (safeClient as any).account?.address as Address | undefined;
            console.log(`[SafeWallet] Safe account address: ${safeAccountAddress}, forceNativeGas: ${forceNativeGas}, chainId: ${targetChainId}`);

            // PRE-FLIGHT BALANCE CHECK: Verify the Safe has sufficient balance before sending
            // This prevents failed on-chain transactions from empty/underfunded wallets
            if (safeAccountAddress) {
                const publicClient = getPublicClient(targetChainId);
                
                if (tokenAddress && tokenDecimals !== undefined) {
                    // Check ERC-20 token balance
                    const erc20Abi = [{ 
                        name: 'balanceOf', 
                        type: 'function', 
                        inputs: [{ name: 'account', type: 'address' }], 
                        outputs: [{ name: '', type: 'uint256' }] 
                    }] as const;
                    
                    try {
                        const tokenBalance = await publicClient.readContract({
                            address: tokenAddress,
                            abi: erc20Abi,
                            functionName: 'balanceOf',
                            args: [safeAccountAddress],
                        }) as bigint;
                        
                        const transferAmount = parseUnits(amount, tokenDecimals);
                        if (tokenBalance < transferAmount) {
                            console.log(`[SafeWallet] Insufficient token balance: ${formatUnits(tokenBalance, tokenDecimals)} < ${amount}`);
                            setError(`Insufficient balance. Your Safe has ${formatUnits(tokenBalance, tokenDecimals)} tokens but you're trying to send ${amount}. Deposit tokens to your Safe first at ${safeAccountAddress}`);
                            setStatus("error");
                            return null;
                        }
                    } catch (err) {
                        console.log("[SafeWallet] Could not verify token balance, proceeding anyway:", err);
                    }
                } else {
                    // Check native ETH balance
                    try {
                        const ethBalance = await publicClient.getBalance({ address: safeAccountAddress });
                        const transferAmount = parseEther(amount);
                        
                        if (ethBalance < transferAmount) {
                            console.log(`[SafeWallet] Insufficient ETH balance: ${formatEther(ethBalance)} < ${amount}`);
                            setError(`Insufficient balance. Your Safe has ${formatEther(ethBalance)} ETH but you're trying to send ${amount} ETH. Deposit ETH to your Safe first at ${safeAccountAddress}`);
                            setStatus("error");
                            return null;
                        }
                    } catch (err) {
                        console.log("[SafeWallet] Could not verify ETH balance, proceeding anyway:", err);
                    }
                }
            }

            // Send the transaction - handle both native ETH and ERC20 tokens
            const sendOptions = {
                isWebAuthn: signerType === "passkey",
                chainId: targetChainId,
                safeAddress: safeAccountAddress,
                forceNativeGas,
            };
            
            let hash;
            if (tokenAddress && tokenDecimals !== undefined) {
                // ERC20 token transfer
                const tokenAmount = parseUnits(amount, tokenDecimals);
                console.log(`[SafeWallet] Sending ERC20: ${amount} (${tokenAmount} raw) to ${to}`);
                hash = await sendSafeTransaction(safeClient, {
                    to,
                    value: BigInt(0),
                    tokenAddress,
                    tokenAmount,
                    tokenDecimals,
                }, sendOptions);
            } else {
                // Native ETH transfer
                console.log(`[SafeWallet] Sending ETH: ${amount} to ${to}`);
                hash = await sendSafeTransaction(safeClient, {
                    to,
                    value: parseEther(amount),
                }, sendOptions);
            }

            setTxHash(hash);
            setStatus("success");
            
            // Update deployment status (Safe deploys on first tx)
            setIsDeployed(true);

            return hash;
        } catch (err: unknown) {
            console.error("[SafeWallet] Transaction error:", err);
            
            // Handle user rejection
            if (err && typeof err === "object" && "code" in err) {
                const errorWithCode = err as { code: number };
                if (errorWithCode.code === 4001) {
                    setError("Transaction rejected");
                    setStatus("idle");
                    return null;
                }
            }

            // Handle passkey cancellation
            if (err instanceof DOMException && err.name === "NotAllowedError") {
                setError("Signing cancelled");
                setStatus("idle");
                return null;
            }

            // Handle transaction errors with helpful messages
            const errString = err instanceof Error ? err.message : String(err);
            
            // Check for Safe not deployed error
            if (errString.includes("Safe is not deployed") || errString.includes("not deployed")) {
                setError("Your Safe wallet isn't deployed on this network yet. First, send any transaction on Base (free gas) to deploy your Safe, then return here.");
                setStatus("error");
                return null;
            }
            
            // Check for AA21 error (insufficient prefund for native gas)
            // This happens on Mainnet when user has no USDC approval and Safe can't pay ETH prefund
            if (errString.includes("AA21") || errString.includes("didn't pay prefund")) {
                if (chainRequiresErc20Payment(chainId)) {
                    // Mainnet: explain the issue and provide options
                    setError("Mainnet Safe Wallet requires USDC for gas fees. Options: 1) Toggle to 'EOA' mode above to send from your connected wallet, 2) Bridge your funds to Base (free transactions), or 3) Deposit ~$2 USDC to your Safe for gas.");
                } else {
                    setError("Insufficient ETH in Safe for gas fees. Deposit ETH to your Safe wallet first.");
                }
                setStatus("error");
                return null;
            }

            // Check for common UserOperation errors (sponsorship may have failed)
            if (errString.includes("UserOperation reverted") ||
                errString.includes("reverted during simulation") ||
                errString.includes("reason: 0x")) {

                if (chainRequiresErc20Payment(chainId)) {
                    // Mainnet transaction failed - sponsorship may not be available
                    setError("Mainnet transaction failed. Gas sponsorship may not be available. Options: 1) Toggle to 'EOA' mode to send from your connected wallet, 2) Use a bridge to move funds to Base (free transactions), or 3) Deposit ~$2 USDC to your Safe for gas fees.");
                } else {
                    // L2s have sponsored gas but still need the token
                    setError("Insufficient funds in Safe. Deposit tokens to your Safe wallet address first.");
                }
                setStatus("error");
                return null;
            }
            
            if (errString.includes("insufficient") || errString.includes("paymaster")) {
                if (chainRequiresErc20Payment(chainId)) {
                    setError("Gas payment failed. Ensure you have at least 2 USDC in your Safe for gas fees, or try a free L2 like Base.");
                } else {
                    setError("Insufficient balance to cover gas fees. Deposit more funds to your Safe wallet.");
                }
                setStatus("error");
                return null;
            }

            setError(err instanceof Error ? err.message : "Transaction failed");
            setStatus("error");
            return null;
        }
    }, [ownerAddress, isConnected, walletClient, chainId, signMessageAsync, signTypedDataAsync, signerType, passkeyCredential]);

    // Reset state
    const reset = useCallback(() => {
        setStatus("idle");
        setError(null);
        setTxHash(null);
        setEstimatedGas(null);
    }, []);

    // Auto-initialize when wallet connects
    useEffect(() => {
        if (isConnected && ownerAddress && status === "idle") {
            initialize();
        }
    }, [isConnected, ownerAddress, status, initialize]);

    return {
        safeAddress,
        isDeployed,
        isLoading: status === "loading",
        isSending: status === "sending" || status === "deploying",
        status,
        error,
        txHash,
        signerType,
        estimatedGas,
        initialize,
        initializeWithPasskey,
        sendTransaction,
        estimateGas,
        reset,
    };
}

// Utility functions for passkey handling
function hexToBytes(hex: Hex): Uint8Array {
    const bytes = new Uint8Array((hex.length - 2) / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16);
    }
    return bytes;
}

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}
