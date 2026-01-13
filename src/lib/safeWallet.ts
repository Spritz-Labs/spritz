/**
 * Safe Smart Wallet utilities for Spritz
 * 
 * Uses Safe smart accounts with ERC-4337 (Account Abstraction)
 * Powered by permissionless.js and Pimlico
 * 
 * Supports multiple signer types:
 * - EOA: Standard wallet signing (wallet, email users)
 * - Passkey: WebAuthn signing (passkey users)
 */

import { 
    createPublicClient, 
    createWalletClient,
    http, 
    type Address,
    type Chain,
    type Hex,
    encodeFunctionData,
    parseEther,
    formatEther,
    custom,
    bytesToHex,
} from "viem";
import { mainnet, base, arbitrum, optimism, polygon } from "viem/chains";
import { 
    createSmartAccountClient,
    type SmartAccountClient,
} from "permissionless";
import { 
    toSafeSmartAccount,
    type SafeSmartAccountImplementation,
} from "permissionless/accounts";
import { 
    createPimlicoClient,
} from "permissionless/clients/pimlico";
import { 
    entryPoint07Address,
    toWebAuthnAccount,
    type WebAuthnAccount,
} from "viem/account-abstraction";
import { 
    type P256PublicKey,
} from "./passkeySigner";

// Supported chains for Safe deployment (Base only for now during testing)
export const SAFE_SUPPORTED_CHAINS: Record<number, Chain> = {
    8453: base,
    // TODO: Re-enable after testing
    // 1: mainnet,
    // 42161: arbitrum,
    // 10: optimism,
    // 137: polygon,
};

// Get Pimlico bundler URL for a chain
function getPimlicoBundlerUrl(chainId: number): string {
    const apiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
    if (!apiKey) {
        console.error("[SafeWallet] NEXT_PUBLIC_PIMLICO_API_KEY is not set");
        throw new Error("Pimlico API key not configured. Please set NEXT_PUBLIC_PIMLICO_API_KEY.");
    }
    
    const chainNames: Record<number, string> = {
        8453: "base",
        // TODO: Re-enable after testing
        // 1: "ethereum",
        // 42161: "arbitrum",
        // 10: "optimism",
        // 137: "polygon",
    };
    
    const chainName = chainNames[chainId];
    if (!chainName) {
        throw new Error(`Chain ${chainId} not supported for Safe transactions`);
    }
    
    const url = `https://api.pimlico.io/v2/${chainName}/rpc?apikey=${apiKey}`;
    console.log(`[SafeWallet] Using Pimlico for ${chainName} (chain ${chainId})`);
    return url;
}

// Create a public client for a chain
export function getPublicClient(chainId: number) {
    const chain = SAFE_SUPPORTED_CHAINS[chainId];
    if (!chain) {
        throw new Error(`Unsupported chain: ${chainId}`);
    }
    
    return createPublicClient({
        chain,
        transport: http(),
    });
}

// Get sponsorship policy ID from env (optional - for gasless transactions)
function getSponsorshipPolicyId(): string | undefined {
    return process.env.NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID;
}

// Create Pimlico bundler client
export function getPimlicoClient(chainId: number) {
    const chain = SAFE_SUPPORTED_CHAINS[chainId];
    if (!chain) {
        throw new Error(`Unsupported chain: ${chainId}`);
    }
    
    return createPimlicoClient({
        transport: http(getPimlicoBundlerUrl(chainId)),
        entryPoint: {
            address: entryPoint07Address,
            version: "0.7",
        },
    });
}

// Get paymaster context with sponsorship policy
export function getPaymasterContext() {
    const policyId = getSponsorshipPolicyId();
    if (policyId) {
        console.log(`[SafeWallet] Using sponsorship policy: ${policyId}`);
        return { sponsorshipPolicyId: policyId };
    }
    console.log("[SafeWallet] No sponsorship policy configured");
    return undefined;
}

export interface SafeWalletConfig {
    ownerAddress: Address;
    chainId: number;
}

export interface SafeAccountInfo {
    address: Address;
    isDeployed: boolean;
    chainId: number;
}

/**
 * Get the counterfactual Safe address for an owner
 * This is the address where the Safe WILL be deployed
 */
export async function getSafeAddress(config: SafeWalletConfig): Promise<Address> {
    const { ownerAddress, chainId } = config;
    const chain = SAFE_SUPPORTED_CHAINS[chainId];
    if (!chain) {
        throw new Error(`Unsupported chain: ${chainId}`);
    }

    const publicClient = getPublicClient(chainId);
    
    // Create a temporary wallet client for address calculation
    const safeAccount = await toSafeSmartAccount({
        client: publicClient,
        owners: [{ address: ownerAddress, type: "local" } as any],
        version: "1.4.1",
        entryPoint: {
            address: entryPoint07Address,
            version: "0.7",
        },
        saltNonce: BigInt(0), // Use 0 for deterministic address
    });

    return safeAccount.address;
}

/**
 * Check if a Safe is deployed at the given address
 */
export async function isSafeDeployed(
    address: Address, 
    chainId: number
): Promise<boolean> {
    const publicClient = getPublicClient(chainId);
    
    try {
        const code = await publicClient.getCode({ address });
        return code !== undefined && code !== "0x" && code.length > 2;
    } catch {
        return false;
    }
}

/**
 * Create a Safe Smart Account Client
 * This client can be used to send transactions through the Safe
 */
export async function createSafeAccountClient(
    ownerAddress: Address,
    chainId: number,
    signMessage: (message: string) => Promise<`0x${string}`>,
    signTypedData: (data: unknown) => Promise<`0x${string}`>,
): Promise<SmartAccountClient> {
    const chain = SAFE_SUPPORTED_CHAINS[chainId];
    if (!chain) {
        throw new Error(`Unsupported chain: ${chainId}`);
    }

    console.log(`[SafeWallet] Creating Safe account for owner ${ownerAddress.slice(0, 10)}... on chain ${chainId}`);

    const publicClient = getPublicClient(chainId);
    const pimlicoClient = getPimlicoClient(chainId);

    try {
        // Create Safe account with the owner's signing capability
        const safeAccount = await toSafeSmartAccount({
            client: publicClient,
            owners: [{
                address: ownerAddress,
                type: "local",
                signMessage: async ({ message }: { message: string | { raw: string | Uint8Array } }) => {
                    if (typeof message === "string") {
                        return signMessage(message);
                    }
                    return signMessage(message.raw as string);
                },
                signTypedData: async (typedData: Record<string, unknown>) => {
                    return signTypedData(typedData);
                },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any],
            version: "1.4.1",
            entryPoint: {
                address: entryPoint07Address,
                version: "0.7",
            },
            saltNonce: BigInt(0),
        });

        console.log(`[SafeWallet] Safe account address: ${safeAccount.address}`);

        // Get sponsorship context if configured
        const paymasterContext = getPaymasterContext();

        // Create smart account client with Pimlico as bundler and paymaster
        const smartAccountClient = createSmartAccountClient({
            account: safeAccount,
            chain,
            bundlerTransport: http(getPimlicoBundlerUrl(chainId)),
            paymaster: pimlicoClient,
            paymasterContext, // Include sponsorship policy if set
            userOperation: {
                estimateFeesPerGas: async () => {
                    const prices = await pimlicoClient.getUserOperationGasPrice();
                    console.log(`[SafeWallet] Gas prices:`, prices.fast);
                    return prices.fast;
                },
            },
        });

        return smartAccountClient as SmartAccountClient;
    } catch (err) {
        console.error(`[SafeWallet] Failed to create Safe account:`, err);
        throw err;
    }
}

export interface SendTransactionParams {
    to: Address;
    value: bigint;
    data?: `0x${string}`;
    // For ERC20 token transfers
    tokenAddress?: Address;
    tokenAmount?: bigint;
    tokenDecimals?: number;
}

// ERC20 transfer function signature
const ERC20_TRANSFER_ABI = [{
    name: "transfer",
    type: "function",
    inputs: [
        { name: "to", type: "address" },
        { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
}] as const;

/**
 * Encode an ERC20 transfer call
 */
export function encodeERC20Transfer(to: Address, amount: bigint): `0x${string}` {
    return encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [to, amount],
    });
}

// Gas limits for WebAuthn transactions (simulation-based estimation fails for passkeys)
// These are generous limits for Safe deployment + WebAuthn signature validation
const WEBAUTHN_GAS_LIMITS = {
    verificationGasLimit: BigInt(800000),   // Safe deployment + WebAuthn signature validation
    callGasLimit: BigInt(200000),           // Actual transaction execution  
    preVerificationGas: BigInt(100000),     // Pre-verification overhead
    paymasterVerificationGasLimit: BigInt(150000),
    paymasterPostOpGasLimit: BigInt(50000),
};

/**
 * Send a transaction through a Safe Smart Account
 * Supports both native ETH transfers and ERC20 token transfers
 * 
 * @param client - The Smart Account Client
 * @param params - Transaction parameters
 * @param isWebAuthn - If true, uses explicit gas limits (required for passkey accounts)
 */
export async function sendSafeTransaction(
    client: SmartAccountClient,
    params: SendTransactionParams,
    isWebAuthn = false
): Promise<`0x${string}`> {
    const { to, value, data, tokenAddress, tokenAmount } = params;
    
    // Determine if this is a token transfer or native ETH transfer
    let calls;
    
    if (tokenAddress && tokenAmount !== undefined) {
        // ERC20 token transfer
        console.log(`[SafeWallet] Sending ERC20 token transfer: ${tokenAmount} to ${to}`);
        calls = [{
            to: tokenAddress,
            value: BigInt(0),
            data: encodeERC20Transfer(to, tokenAmount),
        }];
    } else {
        // Native ETH transfer
        console.log(`[SafeWallet] Sending native ETH transfer: ${value} wei to ${to}`);
        calls = [{
            to,
            value,
            data: data || "0x",
        }];
    }
    
    // Use sendUserOperation for ERC-4337 transactions
    // The SmartAccountClient handles wrapping this in a UserOperation
    // For WebAuthn accounts, we must provide explicit gas limits since simulation fails
    const txParams: Record<string, unknown> = { calls };
    
    if (isWebAuthn) {
        console.log(`[SafeWallet] Using explicit gas limits for WebAuthn transaction`);
        txParams.verificationGasLimit = WEBAUTHN_GAS_LIMITS.verificationGasLimit;
        txParams.callGasLimit = WEBAUTHN_GAS_LIMITS.callGasLimit;
        txParams.preVerificationGas = WEBAUTHN_GAS_LIMITS.preVerificationGas;
        txParams.paymasterVerificationGasLimit = WEBAUTHN_GAS_LIMITS.paymasterVerificationGasLimit;
        txParams.paymasterPostOpGasLimit = WEBAUTHN_GAS_LIMITS.paymasterPostOpGasLimit;
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txHash = await client.sendTransaction(txParams as any);
    
    return txHash;
}

/**
 * Passkey credential for Safe
 * Using viem's WebAuthn types for proper integration
 */
export interface PasskeyCredential {
    /** The credential ID (base64url encoded) */
    credentialId: string;
    /** The P256 public key coordinates */
    publicKey: P256PublicKey;
}

/**
 * Create a Safe Smart Account Client with a passkey owner
 * 
 * Uses viem's toWebAuthnAccount and permissionless.js's Safe + WebAuthn integration.
 * This properly uses SafeWebAuthnSharedSigner for ERC-4337 compatibility.
 */
export async function createPasskeySafeAccountClient(
    passkeyCredential: PasskeyCredential,
    chainId: number,
): Promise<SmartAccountClient> {
    const chain = SAFE_SUPPORTED_CHAINS[chainId];
    if (!chain) {
        throw new Error(`Unsupported chain: ${chainId}`);
    }

    const publicClient = getPublicClient(chainId);
    const pimlicoClient = getPimlicoClient(chainId);

    // Validate the passkey credential
    if (!passkeyCredential.credentialId || passkeyCredential.credentialId.length < 10) {
        throw new Error(`Invalid credential ID: ${passkeyCredential.credentialId}`);
    }
    if (!passkeyCredential.publicKey.x || !passkeyCredential.publicKey.y) {
        throw new Error("Missing public key coordinates");
    }

    // Convert our P256 public key to the format viem/ox expects (concatenated x||y, 64 bytes)
    // x and y are each 32 bytes (64 hex chars) with 0x prefix
    const xHex = passkeyCredential.publicKey.x.replace(/^0x/i, '');
    const yHex = passkeyCredential.publicKey.y.replace(/^0x/i, '');
    
    // Validate coordinates are valid hex
    if (!/^[0-9a-fA-F]+$/.test(xHex) || !/^[0-9a-fA-F]+$/.test(yHex)) {
        throw new Error(`Invalid public key format: x=${xHex.slice(0, 20)}..., y=${yHex.slice(0, 20)}...`);
    }
    
    // Ensure each coordinate is exactly 64 hex chars (32 bytes), pad with leading zeros if needed
    const xPadded = xHex.padStart(64, '0');
    const yPadded = yHex.padStart(64, '0');
    
    // Concatenate: total 128 hex chars (64 bytes)
    const formattedPublicKey = `0x${xPadded}${yPadded}` as Hex;
    
    // Validate final length
    if (formattedPublicKey.length !== 130) {
        throw new Error(`Invalid public key length: ${formattedPublicKey.length}, expected 130`);
    }

    console.log(`[SafeWallet] Creating WebAuthn account with credential: ${passkeyCredential.credentialId.slice(0, 20)}...`);
    console.log(`[SafeWallet] Public key X: ${passkeyCredential.publicKey.x} (${xHex.length} chars without 0x)`);
    console.log(`[SafeWallet] Public key Y: ${passkeyCredential.publicKey.y} (${yHex.length} chars without 0x)`);
    console.log(`[SafeWallet] Formatted public key (full): ${formattedPublicKey}`);
    console.log(`[SafeWallet] Formatted public key length: ${formattedPublicKey.length} (should be 130 for 64 bytes + 0x)`);

    // Get the rpId - must match the domain where the passkey was created
    // In browser, use current hostname; this ensures passkeys created on app.spritz.chat work there
    const rpId = typeof window !== 'undefined' ? window.location.hostname : 'app.spritz.chat';
    console.log(`[SafeWallet] Using rpId: ${rpId}`);

    // Helper to convert base64url to ArrayBuffer (matching login flow)
    const base64urlToArrayBuffer = (base64url: string): ArrayBuffer => {
        const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
        const padding = '='.repeat((4 - (base64.length % 4)) % 4);
        const binaryString = atob(base64 + padding);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    };

    // Custom getFn that exactly mirrors the working login flow
    // This uses the same navigator.credentials.get() options that work for login
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customGetFn = async (options?: any): Promise<any> => {
        console.log(`[SafeWallet] customGetFn called`);
        
        if (!options?.publicKey) {
            console.log(`[SafeWallet] No publicKey in options, using default get`);
            return navigator.credentials.get(options);
        }

        // Build options exactly like the working login flow
        const credentialIdBuffer = base64urlToArrayBuffer(passkeyCredential.credentialId);
        
        // First try with specific credential ID (faster if it works)
        const publicKeyOptionsWithCred: PublicKeyCredentialRequestOptions = {
            challenge: options.publicKey.challenge,
            rpId: rpId,
            timeout: 120000,
            userVerification: 'preferred',
            allowCredentials: [{
                id: credentialIdBuffer,
                type: 'public-key',
                transports: ['internal', 'hybrid'] as AuthenticatorTransport[],
            }],
        };

        console.log(`[SafeWallet] Using rpId: ${rpId}`);
        console.log(`[SafeWallet] Credential ID (first 20 chars): ${passkeyCredential.credentialId.slice(0, 20)}...`);

        try {
            // Try with specific credential first
            console.log(`[SafeWallet] Trying with specific credential ID...`);
            const credential = await navigator.credentials.get({
                publicKey: publicKeyOptionsWithCred,
                mediation: "optional",
            } as CredentialRequestOptions);
            
            if (credential) {
                console.log(`[SafeWallet] Got credential successfully with specific ID`);
                return credential;
            }
        } catch (error) {
            console.log(`[SafeWallet] Specific credential failed, trying discoverable...`, error);
        }

        // Fallback: Try discoverable credential (no allowCredentials)
        // This lets the browser find any passkey for this rpId
        console.log(`[SafeWallet] Trying discoverable credential lookup...`);
        const publicKeyOptionsDiscoverable: PublicKeyCredentialRequestOptions = {
            challenge: options.publicKey.challenge,
            rpId: rpId,
            timeout: 120000,
            userVerification: 'preferred',
            // No allowCredentials - browser will show all available passkeys for this rpId
        };

        try {
            const credential = await navigator.credentials.get({
                publicKey: publicKeyOptionsDiscoverable,
                mediation: "optional",
            } as CredentialRequestOptions);
            
            if (!credential) {
                throw new Error('No credential returned');
            }
            
            console.log(`[SafeWallet] Got credential via discoverable lookup`);
            return credential;
        } catch (error) {
            console.error(`[SafeWallet] All credential methods failed:`, error);
            throw error;
        }
    };

    // Create a WebAuthn account using viem's built-in support
    const webAuthnAccount = toWebAuthnAccount({
        credential: {
            id: passkeyCredential.credentialId,
            publicKey: formattedPublicKey,
        },
        rpId, // Explicitly set rpId to match where passkey was created
        getFn: customGetFn, // Use custom function that mirrors login flow
    });

    console.log(`[SafeWallet] WebAuthn account created, type: ${webAuthnAccount.type}`);

    // Create Safe account with the WebAuthn account as owner
    // Explicitly pass WebAuthn-related addresses for clarity
    // Using Safe v1.4.1 which is more widely deployed
    const safeAccount = await toSafeSmartAccount({
        client: publicClient,
        owners: [webAuthnAccount],
        version: "1.4.1",
        entryPoint: {
            address: entryPoint07Address,
            version: "0.7",
        },
        saltNonce: BigInt(0),
        // Explicitly set WebAuthn addresses (these are the defaults but being explicit)
        safeWebAuthnSharedSignerAddress: "0x94a4F6affBd8975951142c3999aEAB7ecee555c2" as Address,
        safeP256VerifierAddress: "0xA86e0054C51E4894D88762a017ECc5E5235f5DBA" as Address,
    });

    console.log(`[SafeWallet] Safe account address: ${safeAccount.address}`);

    // Get sponsorship context if configured
    const paymasterContext = getPaymasterContext();

    console.log(`[SafeWallet] Creating smart account client...`);
    console.log(`[SafeWallet] Paymaster context:`, paymasterContext);

    // Use Pimlico client directly as paymaster - it handles sponsorship
    const smartAccountClient = createSmartAccountClient({
        account: safeAccount,
        chain,
        bundlerTransport: http(getPimlicoBundlerUrl(chainId)),
        paymaster: pimlicoClient,
        paymasterContext: paymasterContext,
        userOperation: {
            estimateFeesPerGas: async () => {
                const prices = await pimlicoClient.getUserOperationGasPrice();
                console.log(`[SafeWallet] Gas prices:`, prices.fast);
                return prices.fast;
            },
        },
    });

    return smartAccountClient as SmartAccountClient;
}

/**
 * Estimate gas for a Safe transaction
 */
export async function estimateSafeGas(
    ownerAddress: Address,
    chainId: number,
    params: SendTransactionParams
): Promise<{
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    preVerificationGas: bigint;
    verificationGasLimit: bigint;
    callGasLimit: bigint;
    totalGas: bigint;
    estimatedCostWei: bigint;
    estimatedCostEth: string;
}> {
    const pimlicoClient = getPimlicoClient(chainId);
    
    // Get gas prices
    const gasPrice = await pimlicoClient.getUserOperationGasPrice();
    
    // Estimate with typical values for ETH transfer
    const preVerificationGas = BigInt(50000);
    const verificationGasLimit = BigInt(100000);
    const callGasLimit = BigInt(100000);
    
    const totalGas = preVerificationGas + verificationGasLimit + callGasLimit;
    const estimatedCostWei = totalGas * gasPrice.fast.maxFeePerGas;
    
    return {
        maxFeePerGas: gasPrice.fast.maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.fast.maxPriorityFeePerGas,
        preVerificationGas,
        verificationGasLimit,
        callGasLimit,
        totalGas,
        estimatedCostWei,
        estimatedCostEth: formatEther(estimatedCostWei),
    };
}
