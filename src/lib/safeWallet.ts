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
import { entryPoint07Address } from "viem/account-abstraction";
import { 
    encodeWebAuthnSignature,
    type P256PublicKey,
    SAFE_WEBAUTHN_SIGNER_SINGLETON,
} from "./passkeySigner";

// Supported chains for Safe deployment
export const SAFE_SUPPORTED_CHAINS: Record<number, Chain> = {
    1: mainnet,
    8453: base,
    42161: arbitrum,
    10: optimism,
    137: polygon,
};

// Get Pimlico bundler URL for a chain
function getPimlicoBundlerUrl(chainId: number): string {
    const apiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
    if (!apiKey) {
        console.error("[SafeWallet] NEXT_PUBLIC_PIMLICO_API_KEY is not set");
        throw new Error("Pimlico API key not configured. Please set NEXT_PUBLIC_PIMLICO_API_KEY.");
    }
    
    const chainNames: Record<number, string> = {
        1: "ethereum",
        8453: "base",
        42161: "arbitrum",
        10: "optimism",
        137: "polygon",
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

        // Create smart account client with Pimlico as bundler and paymaster
        const smartAccountClient = createSmartAccountClient({
            account: safeAccount,
            chain,
            bundlerTransport: http(getPimlicoBundlerUrl(chainId)),
            paymaster: pimlicoClient,
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
}

/**
 * Send a transaction through a Safe Smart Account
 */
export async function sendSafeTransaction(
    client: SmartAccountClient,
    params: SendTransactionParams
): Promise<`0x${string}`> {
    const { to, value, data } = params;
    
    // Use sendUserOperation for ERC-4337 transactions
    // The SmartAccountClient handles wrapping this in a UserOperation
    const txHash = await client.sendTransaction({
        calls: [{
            to,
            value,
            data: data || "0x",
        }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    
    return txHash;
}

/**
 * Passkey signing function type
 */
export type PasskeySignFunction = (challenge: Hex) => Promise<{
    authenticatorData: Uint8Array;
    clientDataJSON: string;
    signature: Uint8Array;
} | null>;

/**
 * Passkey credential for Safe
 */
export interface PasskeyCredential {
    publicKey: P256PublicKey;
    credentialId: string;
    sign: PasskeySignFunction;
}

/**
 * Create a Safe Smart Account Client with a passkey owner
 * 
 * This uses Safe's WebAuthn signer module to enable passkey-based signing.
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

    // For passkey signing, we need to use a WebAuthn signer as the Safe owner
    // The signer address is deterministic based on the public key coordinates
    const { calculateWebAuthnSignerAddress } = await import("./passkeySigner");
    const webAuthnSignerAddress = calculateWebAuthnSignerAddress(passkeyCredential.publicKey);

    // Create Safe account with the WebAuthn signer as owner
    const safeAccount = await toSafeSmartAccount({
        client: publicClient,
        owners: [{
            address: webAuthnSignerAddress,
            type: "local",
            signMessage: async ({ message }: { message: string | { raw: string | Uint8Array } }) => {
                // For passkey signing, we need to sign the message with WebAuthn
                const messageBytes = typeof message === "string" 
                    ? new TextEncoder().encode(message)
                    : typeof message.raw === "string"
                        ? new TextEncoder().encode(message.raw)
                        : message.raw;
                
                const challenge = bytesToHex(messageBytes instanceof Uint8Array ? messageBytes : new Uint8Array(messageBytes));
                const result = await passkeyCredential.sign(challenge as Hex);
                
                if (!result) {
                    throw new Error("Passkey signing cancelled");
                }
                
                // Encode the WebAuthn signature
                return encodeWebAuthnSignature(
                    result.authenticatorData,
                    result.clientDataJSON,
                    result.signature
                );
            },
            signTypedData: async (typedData: Record<string, unknown>) => {
                // For typed data, we hash it first then sign
                const { hashTypedData } = await import("viem");
                const hash = hashTypedData(typedData as Parameters<typeof hashTypedData>[0]);
                
                const result = await passkeyCredential.sign(hash);
                
                if (!result) {
                    throw new Error("Passkey signing cancelled");
                }
                
                return encodeWebAuthnSignature(
                    result.authenticatorData,
                    result.clientDataJSON,
                    result.signature
                );
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

    // Create smart account client with Pimlico
    const smartAccountClient = createSmartAccountClient({
        account: safeAccount,
        chain,
        bundlerTransport: http(getPimlicoBundlerUrl(chainId)),
        paymaster: pimlicoClient,
        userOperation: {
            estimateFeesPerGas: async () => {
                return (await pimlicoClient.getUserOperationGasPrice()).fast;
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
