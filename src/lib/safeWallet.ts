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

// SECURITY: Only log sensitive details in development
const isDev = process.env.NODE_ENV === "development";
const log = (message: string, ...args: unknown[]) => {
    console.log(message, ...args);
};
const debugLog = (message: string, ...args: unknown[]) => {
    if (isDev) console.log(message, ...args);
};

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
import { mainnet, base, arbitrum, optimism, polygon, bsc } from "viem/chains";

// Unichain mainnet (not in viem yet, define manually)
const unichain: Chain = {
    id: 130,
    name: "Unichain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
        default: { http: ["https://mainnet.unichain.org"] },
    },
    blockExplorers: {
        default: { name: "Uniscan", url: "https://uniscan.xyz" },
    },
};
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

// Supported chains for Safe deployment
export const SAFE_SUPPORTED_CHAINS: Record<number, Chain> = {
    1: mainnet,        // Ethereum Mainnet
    8453: base,        // Base
    42161: arbitrum,   // Arbitrum One
    10: optimism,      // Optimism
    137: polygon,      // Polygon
    56: bsc,           // BSC (BNB Chain)
    130: unichain,     // Unichain
};

// Chain sponsorship configuration
// - "sponsor": Full gas sponsorship (you pay)
// - "erc20": User pays gas in USDC (they pay)
// - "none": User pays in native token (they pay ETH/BNB)
export type SponsorshipType = "sponsor" | "erc20" | "none";

export const CHAIN_SPONSORSHIP_CONFIG: Record<number, { type: SponsorshipType; reason: string }> = {
    // Mainnet: Use ERC-20 paymaster (user pays in USDC)
    // But if no USDC approval, we sponsor the first transaction to bootstrap
    1: { type: "erc20", reason: "Mainnet gas is expensive - user pays in USDC" },
    8453: { type: "sponsor", reason: "Base L2 - cheap, sponsor freely" },
    42161: { type: "sponsor", reason: "Arbitrum L2 - cheap, sponsor freely" },
    10: { type: "sponsor", reason: "Optimism L2 - cheap, sponsor freely" },
    137: { type: "sponsor", reason: "Polygon - cheap, sponsor freely" },
    56: { type: "sponsor", reason: "BSC - cheap, sponsor freely" },
    130: { type: "sponsor", reason: "Unichain L2 - cheap, sponsor freely" },
};

/**
 * Check if Mainnet transaction should be sponsored (first-time bootstrap)
 * 
 * On Mainnet, if user has no USDC approval for the paymaster, we try to sponsor
 * their first transaction. This includes the USDC approval so future transactions
 * can use the ERC-20 paymaster.
 * 
 * NOTE: Sponsorship policies may or may not cover Mainnet. If they don't,
 * the transaction will fail gracefully with a helpful error message.
 */
export function shouldSponsorMainnetBootstrap(chainId: number, hasUsdcApproval: boolean): boolean {
    // Only applies to Mainnet
    if (chainId !== 1) return false;
    
    // Sponsor if no USDC approval exists (first-time user)
    return !hasUsdcApproval;
}

// USDC addresses for ERC-20 paymaster
export const USDC_ADDRESSES: Record<number, Address> = {
    1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",    // Ethereum USDC
    8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",  // Base USDC
    42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // Arbitrum USDC
    10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",   // Optimism USDC
    137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",  // Polygon USDC
    56: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",   // BSC USDC
    // Unichain USDC - TBD
};

/**
 * Get Pimlico bundler URL for a chain
 * 
 * SECURITY NOTE: The Pimlico API key is exposed client-side (NEXT_PUBLIC_*) because
 * account abstraction operations must happen in the browser for WebAuthn signing.
 * 
 * Mitigations in place:
 * 1. Sponsorship Policy: Limits gas spending per user/time period (configured in Pimlico dashboard)
 * 2. Domain Restrictions: API key can be restricted to specific domains in Pimlico settings
 * 3. Rate Limiting: Pimlico has built-in rate limiting per API key
 * 
 * For additional security, consider:
 * - Setting up domain restrictions in Pimlico dashboard
 * - Monitoring usage in Pimlico analytics
 * - Using separate API keys for development/production
 */
function getPimlicoBundlerUrl(chainId: number): string {
    const apiKey = process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
    if (!apiKey) {
        console.error("[SafeWallet] NEXT_PUBLIC_PIMLICO_API_KEY is not set");
        throw new Error("Pimlico API key not configured. Please set NEXT_PUBLIC_PIMLICO_API_KEY.");
    }
    
    // Pimlico chain name mapping
    // See: https://docs.pimlico.io/infra/bundler/endpoints
    const chainNames: Record<number, string> = {
        1: "ethereum",
        8453: "base",
        42161: "arbitrum",
        10: "optimism",
        137: "polygon",
        56: "binance",
        130: "unichain",
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

/**
 * Get paymaster context with sponsorship policy (chain-aware)
 * 
 * @param chainId - The chain ID
 * @param options - Configuration options
 * @param options.forceNativeGas - Skip paymaster, use native gas (user pays in ETH)
 * @param options.forceSponsor - Force sponsorship (for Mainnet bootstrap)
 * @returns Paymaster context or undefined for native gas payment
 */
export function getPaymasterContext(
    chainId: number = 8453, 
    options: { forceNativeGas?: boolean; forceSponsor?: boolean } = {}
) {
    const { forceNativeGas = false, forceSponsor = false } = options;
    
    // If explicitly forcing native gas payment, return undefined (no paymaster)
    if (forceNativeGas) {
        log(`[SafeWallet] Using native gas payment for chain ${chainId} (user pays in ETH)`);
        return undefined;
    }

    const config = CHAIN_SPONSORSHIP_CONFIG[chainId];
    const policyId = getSponsorshipPolicyId();
    
    if (!config) {
        log(`[SafeWallet] No sponsorship config for chain ${chainId}`);
        return undefined;
    }
    
    // Force sponsorship for Mainnet bootstrap (first transaction without USDC approval)
    if (forceSponsor && policyId) {
        log(`[SafeWallet] Sponsoring Mainnet bootstrap transaction for chain ${chainId}`);
        return { sponsorshipPolicyId: policyId };
    }
    
    // For sponsored chains, use the policy
    if (config.type === "sponsor" && policyId) {
        log(`[SafeWallet] Using sponsorship for chain ${chainId}: ${config.reason}`);
        return { sponsorshipPolicyId: policyId };
    }
    
    // For ERC-20 paymaster chains (like mainnet), return ERC-20 config
    if (config.type === "erc20") {
        const usdcAddress = USDC_ADDRESSES[chainId];
        if (usdcAddress) {
            log(`[SafeWallet] Using ERC-20 paymaster for chain ${chainId}: ${config.reason}`);
            // Pimlico ERC-20 paymaster uses token address in context
            return { 
                token: usdcAddress,
                // Note: User must have approved the paymaster to spend their USDC
            };
        }
        log(`[SafeWallet] No USDC address for chain ${chainId}, falling back to native gas`);
    }
    
    log(`[SafeWallet] No sponsorship for chain ${chainId}: ${config.reason}`);
    return undefined;
}

/**
 * Check if a chain requires ERC-20 payment (like mainnet)
 */
export function chainRequiresErc20Payment(chainId: number): boolean {
    const config = CHAIN_SPONSORSHIP_CONFIG[chainId];
    return config?.type === "erc20";
}

/**
 * Get the USDC address for a chain (if any)
 */
export function getChainUsdcAddress(chainId: number): Address | undefined {
    return USDC_ADDRESSES[chainId];
}

/**
 * Pimlico ERC-20 Paymaster address for approval checking
 * This is the contract that needs USDC approval to pay for gas
 * EntryPoint v0.7 paymaster: https://docs.pimlico.io/infra/paymaster/erc20-paymaster/contract-addresses
 */
export const PIMLICO_ERC20_PAYMASTER_ADDRESS: Address = "0x777777777777AeC03fd955926DbF81597e66834C";

/**
 * Check if the paymaster has sufficient USDC allowance
 */
export async function checkPaymasterAllowance(
    safeAddress: Address,
    chainId: number
): Promise<{ hasApproval: boolean; allowance: bigint; minRequired: bigint }> {
    const usdcAddress = USDC_ADDRESSES[chainId];
    if (!usdcAddress) {
        return { hasApproval: true, allowance: BigInt(0), minRequired: BigInt(0) };
    }
    
    try {
        const publicClient = getPublicClient(chainId);
        const erc20Abi = [{ 
            name: 'allowance', 
            type: 'function', 
            inputs: [
                { name: 'owner', type: 'address' },
                { name: 'spender', type: 'address' }
            ], 
            outputs: [{ name: '', type: 'uint256' }] 
        }] as const;
        
        const allowance = await publicClient.readContract({
            address: usdcAddress,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [safeAddress, PIMLICO_ERC20_PAYMASTER_ADDRESS],
        }) as bigint;
        
        // Minimum required is about 2 USDC for gas on mainnet (generous estimate)
        const minRequired = BigInt(2_000_000); // 2 USDC (6 decimals)
        
        return {
            hasApproval: allowance >= minRequired,
            allowance,
            minRequired,
        };
    } catch (err) {
        console.error("[SafeWallet] Error checking paymaster allowance:", err);
        // If we can't check, assume no approval
        return { hasApproval: false, allowance: BigInt(0), minRequired: BigInt(2_000_000) };
    }
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
 * 
 * @param ownerAddress - The owner's EOA address
 * @param chainId - The chain ID
 * @param signMessage - Function to sign messages
 * @param signTypedData - Function to sign typed data
 * @param options - Optional configuration
 * @param options.forceNativeGas - If true, user pays gas in native token (ETH) instead of USDC
 * @param options.sponsorBootstrap - If true, sponsor this transaction (for Mainnet bootstrap)
 */
export async function createSafeAccountClient(
    ownerAddress: Address,
    chainId: number,
    signMessage: (message: string) => Promise<`0x${string}`>,
    signTypedData: (data: unknown) => Promise<`0x${string}`>,
    options?: { forceNativeGas?: boolean; sponsorBootstrap?: boolean }
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

        console.log(`[SafeWallet] Safe account address: ${safeAccount.address}, forceNativeGas: ${options?.forceNativeGas}, sponsorBootstrap: ${options?.sponsorBootstrap}`);

        // Get sponsorship context if configured (chain-aware)
        // Priority: sponsorBootstrap > forceNativeGas > default chain config
        const useNativeGas = options?.forceNativeGas === true && !options?.sponsorBootstrap;
        const useSponsor = options?.sponsorBootstrap === true;
        
        const paymasterContext = useNativeGas 
            ? undefined 
            : getPaymasterContext(chainId, { forceSponsor: useSponsor });

        // Create smart account client with Pimlico as bundler
        // IMPORTANT: Only include paymaster if we're NOT using native gas
        // When using native gas, the user pays in ETH and we don't need a paymaster
        const clientConfig: Parameters<typeof createSmartAccountClient>[0] = {
            account: safeAccount,
            chain,
            bundlerTransport: http(getPimlicoBundlerUrl(chainId)),
            userOperation: {
                estimateFeesPerGas: async () => {
                    const prices = await pimlicoClient.getUserOperationGasPrice();
                    console.log(`[SafeWallet] Gas prices:`, prices.fast);
                    return prices.fast;
                },
            },
        };

        // Only add paymaster if NOT using native gas
        if (!useNativeGas) {
            if (useSponsor) {
                log(`[SafeWallet] Sponsoring Mainnet bootstrap transaction`);
            } else {
                log(`[SafeWallet] Using paymaster for gas sponsorship/ERC-20 payment`);
            }
            (clientConfig as any).paymaster = pimlicoClient;
            (clientConfig as any).paymasterContext = paymasterContext;
        } else {
            log(`[SafeWallet] No paymaster - user pays gas in native ETH`);
        }

        const smartAccountClient = createSmartAccountClient(clientConfig);

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

// ERC20 approve function signature
const ERC20_APPROVE_ABI = [{
    name: "approve",
    type: "function",
    inputs: [
        { name: "spender", type: "address" },
        { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
}] as const;

/**
 * Encode an ERC20 approve call
 */
export function encodeERC20Approve(spender: Address, amount: bigint): `0x${string}` {
    return encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [spender, amount],
    });
}

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

export interface SendTransactionOptions {
    /** If true, uses explicit gas limits (required for passkey/WebAuthn accounts) */
    isWebAuthn?: boolean;
    /** Chain ID for determining if USDC approval is needed */
    chainId?: number;
    /** Safe address for checking approval status */
    safeAddress?: Address;
    /** If true, this is a sponsored bootstrap transaction - bundle USDC approval */
    sponsorBootstrap?: boolean;
}

/**
 * Send a transaction through a Safe Smart Account
 * Supports both native ETH transfers and ERC20 token transfers
 * 
 * For sponsored Mainnet bootstrap transactions, automatically batches
 * USDC approval so future transactions can use ERC-20 paymaster.
 * 
 * @param client - The Smart Account Client
 * @param params - Transaction parameters
 * @param options - Additional options (isWebAuthn, chainId, safeAddress, sponsorBootstrap)
 */
export async function sendSafeTransaction(
    client: SmartAccountClient,
    params: SendTransactionParams,
    options: SendTransactionOptions | boolean = false
): Promise<`0x${string}`> {
    // Handle legacy boolean parameter for backwards compatibility
    const opts: SendTransactionOptions = typeof options === 'boolean' 
        ? { isWebAuthn: options } 
        : options;
    const { isWebAuthn = false, chainId, safeAddress, sponsorBootstrap = false } = opts;
    
    const { to, value, data, tokenAddress, tokenAmount } = params;
    
    // Build the transaction calls
    const calls: Array<{ to: Address; value: bigint; data: `0x${string}` }> = [];
    
    // For sponsored Mainnet bootstrap transactions, batch USDC approval first
    // This ensures future transactions can use the ERC-20 paymaster
    if (sponsorBootstrap && chainId === 1) {
        const usdcAddress = USDC_ADDRESSES[chainId];
        if (usdcAddress) {
            // Approve 100 USDC for the paymaster (enough for many transactions)
            const approvalAmount = BigInt(100_000_000); // 100 USDC (6 decimals)
            console.log(`[SafeWallet] Batching USDC approval for paymaster ${PIMLICO_ERC20_PAYMASTER_ADDRESS}`);
            calls.push({
                to: usdcAddress,
                value: BigInt(0),
                data: encodeERC20Approve(PIMLICO_ERC20_PAYMASTER_ADDRESS, approvalAmount),
            });
        }
    }
    
    // Add the main transaction
    if (tokenAddress && tokenAmount !== undefined) {
        // ERC20 token transfer
        console.log(`[SafeWallet] Sending ERC20 token transfer: ${tokenAmount} to ${to}`);
        calls.push({
            to: tokenAddress,
            value: BigInt(0),
            data: encodeERC20Transfer(to, tokenAmount),
        });
    } else {
        // Native ETH transfer
        console.log(`[SafeWallet] Sending native ETH transfer: ${value} wei to ${to}`);
        calls.push({
            to,
            value,
            data: data || "0x" as `0x${string}`,
        });
    }
    
    console.log(`[SafeWallet] Sending transaction with ${calls.length} call(s)`);
    
    // Use sendUserOperation for ERC-4337 transactions
    // The SmartAccountClient handles wrapping this in a UserOperation
    // For WebAuthn accounts, we must provide explicit gas limits since simulation fails
    const txParams: Record<string, unknown> = { calls };
    
    if (isWebAuthn) {
        console.log(`[SafeWallet] Using explicit gas limits for WebAuthn transaction`);
        // Increase call gas limit if we're batching approval
        const callGasMultiplier = calls.length > 1 ? BigInt(2) : BigInt(1);
        txParams.verificationGasLimit = WEBAUTHN_GAS_LIMITS.verificationGasLimit;
        txParams.callGasLimit = WEBAUTHN_GAS_LIMITS.callGasLimit * callGasMultiplier;
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
/**
 * Create a Safe Smart Account Client with a passkey owner
 * 
 * @param passkeyCredential - The passkey credential with public key
 * @param chainId - The chain ID
 * @param options - Optional configuration
 * @param options.forceNativeGas - If true, user pays gas in native token (ETH) instead of USDC
 * @param options.sponsorBootstrap - If true, sponsor this transaction (for Mainnet bootstrap)
 */
export async function createPasskeySafeAccountClient(
    passkeyCredential: PasskeyCredential,
    chainId: number,
    options?: { forceNativeGas?: boolean; sponsorBootstrap?: boolean }
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

    log(`[SafeWallet] Creating WebAuthn account with credential: ${passkeyCredential.credentialId.slice(0, 20)}...`);
    // SECURITY: Only log full key details in development
    debugLog(`[SafeWallet] Public key X: ${passkeyCredential.publicKey.x.slice(0, 10)}...`);
    debugLog(`[SafeWallet] Public key Y: ${passkeyCredential.publicKey.y.slice(0, 10)}...`);
    debugLog(`[SafeWallet] Formatted public key length: ${formattedPublicKey.length}`);

    // Get the rpId - must match the domain where the passkey was created
    // IMPORTANT: Registration uses "spritz.chat" (parent domain) for all *.spritz.chat subdomains
    // So we must use "spritz.chat" here too, not "app.spritz.chat"
    const getRpId = (): string => {
        if (typeof window === 'undefined') return 'spritz.chat';
        const hostname = window.location.hostname;
        // Match the registration logic: use parent domain for spritz.chat subdomains
        if (hostname.includes('spritz.chat')) {
            return 'spritz.chat';
        }
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'localhost';
        }
        return hostname;
    };
    const rpId = getRpId();
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

        debugLog(`[SafeWallet] Using rpId: ${rpId}`);
        debugLog(`[SafeWallet] Credential ID: ${passkeyCredential.credentialId.slice(0, 20)}...`);

        try {
            // Try with specific credential first
            debugLog(`[SafeWallet] Trying with specific credential ID...`);
            const credential = await navigator.credentials.get({
                publicKey: publicKeyOptionsWithCred,
                mediation: "optional",
            } as CredentialRequestOptions);
            
            if (credential) {
                debugLog(`[SafeWallet] Got credential successfully`);
                return credential;
            }
        } catch (error) {
            debugLog(`[SafeWallet] Specific credential failed, trying discoverable...`);
        }

        // Fallback: Try discoverable credential (no allowCredentials)
        // This lets the browser find any passkey for this rpId
        debugLog(`[SafeWallet] Trying discoverable credential lookup...`);
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
            
            debugLog(`[SafeWallet] Got credential via discoverable lookup`);
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

    console.log(`[SafeWallet] Safe account address: ${safeAccount.address}, forceNativeGas: ${options?.forceNativeGas}, sponsorBootstrap: ${options?.sponsorBootstrap}`);

    // Get sponsorship context if configured (chain-aware)
    // Priority: sponsorBootstrap > forceNativeGas > default chain config
    const useNativeGas = options?.forceNativeGas === true && !options?.sponsorBootstrap;
    const useSponsor = options?.sponsorBootstrap === true;
    
    const paymasterContext = useNativeGas 
        ? undefined 
        : getPaymasterContext(chainId, { forceSponsor: useSponsor });

    log(`[SafeWallet] Creating smart account client...`);

    // Create smart account client with Pimlico as bundler
    // IMPORTANT: Only include paymaster if we're NOT using native gas
    const clientConfig: Parameters<typeof createSmartAccountClient>[0] = {
        account: safeAccount,
        chain,
        bundlerTransport: http(getPimlicoBundlerUrl(chainId)),
        userOperation: {
            estimateFeesPerGas: async () => {
                const prices = await pimlicoClient.getUserOperationGasPrice();
                console.log(`[SafeWallet] Gas prices:`, prices.fast);
                return prices.fast;
            },
        },
    };

    // Only add paymaster if NOT using native gas
    if (!useNativeGas) {
        if (useSponsor) {
            log(`[SafeWallet] Sponsoring Mainnet bootstrap transaction`);
        } else {
            log(`[SafeWallet] Using paymaster for gas sponsorship/ERC-20 payment`);
        }
        (clientConfig as any).paymaster = pimlicoClient;
        (clientConfig as any).paymasterContext = paymasterContext;
    } else {
        log(`[SafeWallet] No paymaster - user pays gas in native ETH`);
    }

    const smartAccountClient = createSmartAccountClient(clientConfig);

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
