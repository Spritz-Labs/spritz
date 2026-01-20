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
    keccak256,
    toHex,
    concat,
    encodeAbiParameters,
} from "viem";
import { mainnet, base, arbitrum, optimism, polygon, bsc, avalanche } from "viem/chains";

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
    43114: avalanche,  // Avalanche C-Chain
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
    43114: { type: "sponsor", reason: "Avalanche - cheap, sponsor freely" },
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
    43114: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", // Avalanche USDC
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
        43114: "avalanche",
    };
    
    const chainName = chainNames[chainId];
    if (!chainName) {
        throw new Error(`Chain ${chainId} not supported for Safe transactions`);
    }
    
    const url = `https://api.pimlico.io/v2/${chainName}/rpc?apikey=${apiKey}`;
    console.log(`[SafeWallet] Using Pimlico for ${chainName} (chain ${chainId})`);
    return url;
}

// RPC URLs for each supported chain (reliable public RPCs)
const CHAIN_RPC_URLS: Record<number, string> = {
    1: "https://eth.llamarpc.com",           // Ethereum Mainnet
    8453: "https://mainnet.base.org",         // Base
    42161: "https://arb1.arbitrum.io/rpc",    // Arbitrum
    10: "https://mainnet.optimism.io",        // Optimism
    137: "https://polygon-rpc.com",           // Polygon
    56: "https://bsc-dataseed.binance.org",   // BSC
    130: "https://mainnet.unichain.org",      // Unichain
    43114: "https://api.avax.network/ext/bc/C/rpc", // Avalanche
};

// Create a public client for a chain
export function getPublicClient(chainId: number) {
    const chain = SAFE_SUPPORTED_CHAINS[chainId];
    if (!chain) {
        throw new Error(`Unsupported chain: ${chainId}`);
    }

    const rpcUrl = CHAIN_RPC_URLS[chainId];
    
    return createPublicClient({
        chain,
        transport: http(rpcUrl, { timeout: 30000 }), // 30s timeout with explicit RPC
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
 * Calculate the deterministic address for a vanilla Safe 1.4.1 multi-sig
 * This calculates the address using the same method as createProxyWithNonce
 * 
 * IMPORTANT: This is for VANILLA Safe 1.4.1, NOT ERC-4337 Safe accounts!
 * The address is calculated from: factory + singleton + initializer + saltNonce
 * 
 * @param owners - Array of owner addresses (will be sorted internally)
 * @param threshold - Number of required signatures
 * @param chainId - The chain ID
 * @param saltNonce - Salt nonce for unique addresses (default 0)
 */
export async function getMultiSigSafeAddress(
    owners: Address[],
    threshold: number,
    chainId: number,
    saltNonce: bigint = BigInt(0)
): Promise<Address> {
    const chain = SAFE_SUPPORTED_CHAINS[chainId];
    if (!chain) {
        throw new Error(`Unsupported chain: ${chainId}`);
    }

    if (owners.length === 0) {
        throw new Error("At least one owner is required");
    }

    if (threshold < 1 || threshold > owners.length) {
        throw new Error(`Invalid threshold: ${threshold} for ${owners.length} owners`);
    }
    
    // Sort owners for deterministic address
    const sortedOwners = [...owners].sort((a, b) => 
        a.toLowerCase().localeCompare(b.toLowerCase())
    );

    log(`[SafeWallet] Calculating vanilla Safe 1.4.1 address for ${sortedOwners.length} owners, threshold ${threshold}, nonce ${saltNonce}`);

    // Encode the EXACT same setup data used in deployment
    const setupData = encodeFunctionData({
        abi: [{
            name: "setup",
            type: "function",
            inputs: [
                { name: "_owners", type: "address[]" },
                { name: "_threshold", type: "uint256" },
                { name: "to", type: "address" },
                { name: "data", type: "bytes" },
                { name: "fallbackHandler", type: "address" },
                { name: "paymentToken", type: "address" },
                { name: "payment", type: "uint256" },
                { name: "paymentReceiver", type: "address" },
            ],
            outputs: [],
        }],
        functionName: "setup",
        args: [
            sortedOwners,
            BigInt(threshold),
            "0x0000000000000000000000000000000000000000" as Address,
            "0x" as Hex,
            "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99" as Address, // SAFE_FALLBACK_HANDLER_141
            "0x0000000000000000000000000000000000000000" as Address,
            BigInt(0),
            "0x0000000000000000000000000000000000000000" as Address,
        ],
    });

    // Safe Proxy Factory uses CREATE2 with this formula:
    // address = keccak256(0xff ++ factory ++ salt ++ keccak256(initCode))[12:]
    // where salt = keccak256(keccak256(initializer) ++ saltNonce)
    
    const factory = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67" as Address; // SAFE_PROXY_FACTORY_141
    const singleton = "0x41675C099F32341bf84BFc5382aF534df5C7461a" as Address; // SAFE_SINGLETON_141
    
    // Safe Proxy bytecode from Safe v1.4.1 - MUST match exactly what's deployed on-chain
    // Fetched directly from SafeProxyFactory.proxyCreationCode() on Base
    // The metadata hash varies by deployment, so this MUST match the deployed factory
    const proxyCreationCode = "0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564" as Hex;
    
    // Calculate salt = keccak256(keccak256(initializer) ++ saltNonce)
    const initializerHash = keccak256(setupData);
    const salt = keccak256(
        concat([
            initializerHash,
            toHex(saltNonce, { size: 32 }),
        ])
    );
    
    // Calculate init code hash = keccak256(proxyCreationCode ++ singleton)
    const initCode = concat([
        proxyCreationCode,
        encodeAbiParameters(
            [{ type: "address" }],
            [singleton]
        ),
    ]);
    const initCodeHash = keccak256(initCode);
    
    // Calculate CREATE2 address
    const create2Address = keccak256(
        concat([
            "0xff" as Hex,
            factory,
            salt,
            initCodeHash,
        ])
    );
    
    // Take last 20 bytes as address
    const safeAddress = `0x${create2Address.slice(-40)}` as Address;

    log(`[SafeWallet] Vanilla Safe 1.4.1 address: ${safeAddress}`);

    return safeAddress;
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
        const isDeployed = code !== undefined && code !== "0x" && code.length > 2;
        log(`[SafeWallet] isSafeDeployed check for ${address.slice(0, 10)}... on chain ${chainId}: ${isDeployed} (code length: ${code?.length || 0})`);
        return isDeployed;
    } catch (error) {
        console.error(`[SafeWallet] Error checking if Safe is deployed at ${address}:`, error);
        return false;
    }
}

/**
 * Calculate Safe transaction hash (EIP-712 compliant)
 * 
 * This creates a deterministic hash for a Safe transaction that:
 * 1. Is the same for all signers (deterministic)
 * 2. Is cryptographically secure (based on keccak256)
 * 3. Follows the Safe EIP-712 standard
 * 
 * @param safeAddress - The Safe contract address
 * @param chainId - The chain ID
 * @param to - Destination address
 * @param value - ETH value in wei (as string or bigint)
 * @param data - Transaction data (0x for simple transfer)
 * @param operation - 0 for Call, 1 for DelegateCall
 * @param safeTxGas - Gas for the Safe transaction
 * @param baseGas - Base gas for the transaction
 * @param gasPrice - Gas price for refund
 * @param gasToken - Token for gas payment (0x0 for ETH)
 * @param refundReceiver - Receiver of gas refund
 * @param nonce - Safe transaction nonce
 */
export function calculateSafeTxHash(
    safeAddress: Address,
    chainId: number,
    to: Address,
    value: string | bigint,
    data: Hex = "0x",
    operation: number = 0,
    safeTxGas: bigint = BigInt(0),
    baseGas: bigint = BigInt(0),
    gasPrice: bigint = BigInt(0),
    gasToken: Address = "0x0000000000000000000000000000000000000000" as Address,
    refundReceiver: Address = "0x0000000000000000000000000000000000000000" as Address,
    nonce: number | bigint = 0
): Hex {
    // Safe transaction type hash
    const SAFE_TX_TYPEHASH = keccak256(
        toHex(
            "SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)"
        )
    );

    // EIP-712 domain separator for Safe
    // Safe uses a simpler domain: just chainId and verifyingContract
    const DOMAIN_SEPARATOR_TYPEHASH = keccak256(
        toHex("EIP712Domain(uint256 chainId,address verifyingContract)")
    );

    const domainSeparator = keccak256(
        encodeAbiParameters(
            [{ type: "bytes32" }, { type: "uint256" }, { type: "address" }],
            [DOMAIN_SEPARATOR_TYPEHASH, BigInt(chainId), safeAddress]
        )
    );

    // Hash the data bytes
    const dataHash = keccak256(data);

    // Encode the transaction struct
    const safeTxStructHash = keccak256(
        encodeAbiParameters(
            [
                { type: "bytes32" },
                { type: "address" },
                { type: "uint256" },
                { type: "bytes32" },
                { type: "uint8" },
                { type: "uint256" },
                { type: "uint256" },
                { type: "uint256" },
                { type: "address" },
                { type: "address" },
                { type: "uint256" },
            ],
            [
                SAFE_TX_TYPEHASH,
                to,
                BigInt(value.toString()),
                dataHash,
                operation,
                safeTxGas,
                baseGas,
                gasPrice,
                gasToken,
                refundReceiver,
                BigInt(nonce.toString()),
            ]
        )
    );

    // Final EIP-712 hash: keccak256("\x19\x01" || domainSeparator || structHash)
    const safeTxHash = keccak256(
        concat([
            toHex("\x19\x01", { size: 2 }),
            domainSeparator,
            safeTxStructHash,
        ])
    );

    return safeTxHash;
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
 * @param options.forceNativeGas - If true, user pays gas in native token (ETH) instead of using paymaster
 */
export async function createSafeAccountClient(
    ownerAddress: Address,
    chainId: number,
    signMessage: (message: string) => Promise<`0x${string}`>,
    signTypedData: (data: unknown) => Promise<`0x${string}`>,
    options?: { forceNativeGas?: boolean }
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

        console.log(`[SafeWallet] Safe account address: ${safeAccount.address}, forceNativeGas: ${options?.forceNativeGas}`);

        // Get paymaster context based on chain config
        // If forceNativeGas is true, skip paymaster and user pays in ETH
        const paymasterContext = options?.forceNativeGas
            ? undefined
            : getPaymasterContext(chainId);

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
        if (paymasterContext) {
            log(`[SafeWallet] Using paymaster for gas sponsorship/ERC-20 payment`);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (clientConfig as any).paymaster = pimlicoClient;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    /** If true, EOA pays gas in native ETH (no paymaster) */
    forceNativeGas?: boolean;
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
 * @param options - Additional options (isWebAuthn, forceNativeGas)
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
    const { isWebAuthn = false, forceNativeGas = false } = opts;

    const { to, value, data, tokenAddress, tokenAmount } = params;

    // Build the transaction calls
    const calls: Array<{ to: Address; value: bigint; data: `0x${string}` }> = [];
    
    if (forceNativeGas) {
        log(`[SafeWallet] Using native gas payment (EOA pays)`);
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
 * @param options.forceNativeGas - If true, user pays gas in native token (ETH) instead of using paymaster
 */
export async function createPasskeySafeAccountClient(
    passkeyCredential: PasskeyCredential,
    chainId: number,
    options?: { forceNativeGas?: boolean }
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

    console.log(`[SafeWallet] Safe account address: ${safeAccount.address}, forceNativeGas: ${options?.forceNativeGas}`);

    // Get paymaster context based on chain config
    // If forceNativeGas is true, skip paymaster and user pays in ETH
    const paymasterContext = options?.forceNativeGas
        ? undefined
        : getPaymasterContext(chainId);

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
    if (paymasterContext) {
        log(`[SafeWallet] Using paymaster for gas sponsorship/ERC-20 payment`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (clientConfig as any).paymaster = pimlicoClient;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// Safe contract ABI for direct execution (bypasses ERC-4337)
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
] as const;

// Safe v1.4.1 Factory and Singleton addresses (same across all EVM chains)
// See: https://github.com/safe-global/safe-deployments
const SAFE_PROXY_FACTORY_141 = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67" as Address;
const SAFE_SINGLETON_141 = "0x41675C099F32341bf84BFc5382aF534df5C7461a" as Address;
const SAFE_FALLBACK_HANDLER_141 = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99" as Address;

// Safe Proxy Factory ABI (minimal for createProxyWithNonce)
const SAFE_PROXY_FACTORY_ABI = [
    {
        name: "createProxyWithNonce",
        type: "function",
        inputs: [
            { name: "_singleton", type: "address" },
            { name: "initializer", type: "bytes" },
            { name: "saltNonce", type: "uint256" },
        ],
        outputs: [{ name: "proxy", type: "address" }],
    },
] as const;

// Safe setup function ABI
const SAFE_SETUP_ABI = [
    {
        name: "setup",
        type: "function",
        inputs: [
            { name: "_owners", type: "address[]" },
            { name: "_threshold", type: "uint256" },
            { name: "to", type: "address" },
            { name: "data", type: "bytes" },
            { name: "fallbackHandler", type: "address" },
            { name: "paymentToken", type: "address" },
            { name: "payment", type: "uint256" },
            { name: "paymentReceiver", type: "address" },
        ],
        outputs: [],
    },
] as const;

/**
 * Deploy a Safe wallet on a chain where EOA pays gas
 * 
 * This is used when the Safe hasn't been deployed yet on a chain
 * and the user wants to withdraw funds (e.g., Mainnet without USDC).
 * 
 * @param ownerAddress - The owner of the Safe (EOA address)
 * @param chainId - The chain ID
 * @param walletClient - The wallet client for sending the deploy transaction
 * @param saltNonce - Salt nonce (default 0 for deterministic address)
 */
export async function deploySafeWithEOA(
    ownerAddress: Address,
    chainId: number,
    walletClient: {
        account: { address: Address };
        writeContract: (args: unknown) => Promise<Hex>;
    },
    saltNonce: bigint = BigInt(0)
): Promise<{ txHash: Hex; safeAddress: Address }> {
    const chain = SAFE_SUPPORTED_CHAINS[chainId];
    if (!chain) {
        throw new Error(`Unsupported chain: ${chainId}`);
    }

    log(`[SafeWallet] Deploying Safe for owner ${ownerAddress.slice(0, 10)}... on chain ${chainId}`);

    // Encode the Safe setup call
    // Single owner with threshold 1
    const setupData = encodeFunctionData({
        abi: SAFE_SETUP_ABI,
        functionName: "setup",
        args: [
            [ownerAddress],  // owners array
            BigInt(1),       // threshold
            "0x0000000000000000000000000000000000000000" as Address,  // to (no module setup)
            "0x" as Hex,     // data
            SAFE_FALLBACK_HANDLER_141,  // fallbackHandler
            "0x0000000000000000000000000000000000000000" as Address,  // paymentToken (native)
            BigInt(0),       // payment
            "0x0000000000000000000000000000000000000000" as Address,  // paymentReceiver
        ],
    });

    log(`[SafeWallet] Setup data encoded, deploying via factory...`);

    // Call the factory to deploy
    const txHash = await walletClient.writeContract({
        address: SAFE_PROXY_FACTORY_141,
        abi: SAFE_PROXY_FACTORY_ABI,
        functionName: "createProxyWithNonce",
        args: [SAFE_SINGLETON_141, setupData, saltNonce],
        chain,
    });

    // Calculate the expected Safe address (same as getSafeAddress)
    const safeAddress = await getSafeAddress({ ownerAddress, chainId });

    log(`[SafeWallet] Safe deployment tx: ${txHash}`);
    log(`[SafeWallet] Expected Safe address: ${safeAddress}`);

    return { txHash, safeAddress };
}

/**
 * Deploy a multi-sig Safe wallet (vault) on a chain where EOA pays gas
 * 
 * This is used to deploy a vault's Safe contract. The caller (one of the owners)
 * pays gas for deployment.
 * 
 * @param owners - Array of owner addresses (smart wallet addresses for vault members)
 * @param threshold - Number of required signatures
 * @param chainId - The chain ID
 * @param walletClient - The wallet client for sending the deploy transaction
 * @param saltNonce - Salt nonce for deterministic address
 */
export async function deployMultiSigSafeWithEOA(
    owners: Address[],
    threshold: number,
    chainId: number,
    walletClient: {
        account: { address: Address };
        writeContract: (args: unknown) => Promise<Hex>;
    },
    saltNonce: bigint = BigInt(0)
): Promise<{ txHash: Hex; safeAddress: Address }> {
    const chain = SAFE_SUPPORTED_CHAINS[chainId];
    if (!chain) {
        throw new Error(`Unsupported chain: ${chainId}`);
    }

    if (owners.length === 0) {
        throw new Error("At least one owner is required");
    }

    if (threshold < 1 || threshold > owners.length) {
        throw new Error(`Invalid threshold: ${threshold} for ${owners.length} owners`);
    }

    // Sort owners for deterministic address (same as getMultiSigSafeAddress)
    const sortedOwners = [...owners].sort((a, b) => 
        a.toLowerCase().localeCompare(b.toLowerCase())
    );

    log(`[SafeWallet] Deploying multi-sig Safe for ${sortedOwners.length} owners, threshold ${threshold}`);

    // Encode the Safe setup call with multiple owners
    const setupData = encodeFunctionData({
        abi: SAFE_SETUP_ABI,
        functionName: "setup",
        args: [
            sortedOwners,  // owners array
            BigInt(threshold),  // threshold
            "0x0000000000000000000000000000000000000000" as Address,  // to (no module setup)
            "0x" as Hex,     // data
            SAFE_FALLBACK_HANDLER_141,  // fallbackHandler
            "0x0000000000000000000000000000000000000000" as Address,  // paymentToken (native)
            BigInt(0),       // payment
            "0x0000000000000000000000000000000000000000" as Address,  // paymentReceiver
        ],
    });

    log(`[SafeWallet] Multi-sig setup data encoded, deploying via factory...`);

    // Call the factory to deploy
    const txHash = await walletClient.writeContract({
        address: SAFE_PROXY_FACTORY_141,
        abi: SAFE_PROXY_FACTORY_ABI,
        functionName: "createProxyWithNonce",
        args: [SAFE_SINGLETON_141, setupData, saltNonce],
        chain,
    });

    // Calculate the expected Safe address
    const safeAddress = await getMultiSigSafeAddress(sortedOwners, threshold, chainId, saltNonce);

    log(`[SafeWallet] Multi-sig Safe deployment tx: ${txHash}`);
    log(`[SafeWallet] Expected Safe address: ${safeAddress}`);

    return { txHash, safeAddress };
}

/**
 * Deploy a multi-signature Safe for a vault via user's Safe Smart Wallet
 * This uses the ERC-4337 bundler with paymaster for sponsored gas on L2s
 * 
 * @param owners - Array of owner addresses for the new vault
 * @param threshold - Number of required signatures for the vault
 * @param chainId - The chain ID
 * @param signerAddress - The user's EOA address (Smart Wallet owner)
 * @param signMessage - Function to sign messages
 * @param signTypedData - Function to sign typed data
 * @param saltNonce - Salt nonce for deterministic address
 */
export async function deployVaultViaSponsoredGas(
    owners: Address[],
    threshold: number,
    chainId: number,
    signerAddress: Address,
    signMessage: (message: string) => Promise<Hex>,
    signTypedData: (data: unknown) => Promise<Hex>,
    saltNonce: bigint = BigInt(0)
): Promise<{ txHash: Hex; safeAddress: Address }> {
    const chain = SAFE_SUPPORTED_CHAINS[chainId];
    if (!chain) {
        throw new Error(`Unsupported chain: ${chainId}`);
    }

    if (owners.length === 0) {
        throw new Error("At least one owner is required");
    }

    if (threshold < 1 || threshold > owners.length) {
        throw new Error(`Invalid threshold: ${threshold} for ${owners.length} owners`);
    }

    // Sort owners for deterministic address (same as getMultiSigSafeAddress)
    const sortedOwners = [...owners].sort((a, b) => 
        a.toLowerCase().localeCompare(b.toLowerCase())
    );

    log(`[SafeWallet] Deploying vault via Smart Wallet (sponsored) for ${sortedOwners.length} owners, threshold ${threshold}`);
    log(`[SafeWallet] Using saltNonce: ${saltNonce.toString()} (hex: 0x${saltNonce.toString(16)})`);
    log(`[SafeWallet] Sorted owners: ${sortedOwners.join(', ')}`);

    // Create a Smart Account Client for the user
    const smartAccountClient = await createSafeAccountClient(
        signerAddress,
        chainId,
        signMessage,
        signTypedData,
        { forceNativeGas: false } // Use paymaster for sponsored gas
    );

    // Encode the Safe setup call with multiple owners
    const setupData = encodeFunctionData({
        abi: SAFE_SETUP_ABI,
        functionName: "setup",
        args: [
            sortedOwners,  // owners array
            BigInt(threshold),  // threshold
            "0x0000000000000000000000000000000000000000" as Address,  // to (no module setup)
            "0x" as Hex,     // data
            SAFE_FALLBACK_HANDLER_141,  // fallbackHandler
            "0x0000000000000000000000000000000000000000" as Address,  // paymentToken (native)
            BigInt(0),       // payment
            "0x0000000000000000000000000000000000000000" as Address,  // paymentReceiver
        ],
    });

    // Calculate expected address BEFORE deployment to verify parameters
    const expectedAddress = await getMultiSigSafeAddress(sortedOwners, threshold, chainId, saltNonce);
    log(`[SafeWallet] Expected Safe address: ${expectedAddress}`);

    // Encode the factory call
    const factoryCallData = encodeFunctionData({
        abi: SAFE_PROXY_FACTORY_ABI,
        functionName: "createProxyWithNonce",
        args: [SAFE_SINGLETON_141, setupData, saltNonce],
    });

    log(`[SafeWallet] Factory call encoded. Sending via Smart Wallet (sponsored gas)...`);
    log(`[SafeWallet] Factory: ${SAFE_PROXY_FACTORY_141}, Singleton: ${SAFE_SINGLETON_141}`);

    // Send the transaction through the user's Smart Wallet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txHash = await smartAccountClient.sendTransaction({
        calls: [{
            to: SAFE_PROXY_FACTORY_141,
            data: factoryCallData,
            value: BigInt(0),
        }],
    } as any);

    // Calculate the expected Safe address
    const safeAddress = await getMultiSigSafeAddress(sortedOwners, threshold, chainId, saltNonce);

    log(`[SafeWallet] Vault deployment tx via Smart Wallet: ${txHash}`);
    log(`[SafeWallet] Expected Safe address: ${safeAddress}`);

    return { txHash, safeAddress };
}

/**
 * Execute a Safe transaction directly (EOA pays gas)
 * 
 * This bypasses the ERC-4337 bundler system entirely.
 * The EOA signs the Safe transaction and calls execTransaction directly,
 * paying gas from the EOA's ETH balance.
 * 
 * If the Safe is not deployed, it will be deployed first (EOA pays gas).
 * 
 * @param safeAddress - The deployed Safe address
 * @param chainId - The chain ID
 * @param to - Destination address
 * @param value - ETH value to send (in wei)
 * @param data - Transaction data (0x for simple ETH transfer)
 * @param walletClient - The wallet client for signing and sending
 */
export async function execSafeTransactionDirect(
    safeAddress: Address,
    chainId: number,
    to: Address,
    value: bigint,
    data: Hex = "0x",
    walletClient: {
        account: { address: Address };
        signMessage: (args: { message: { raw: Hex } }) => Promise<Hex>;
        writeContract: (args: unknown) => Promise<Hex>;
    }
): Promise<Hex> {
    const publicClient = getPublicClient(chainId);
    const chain = SAFE_SUPPORTED_CHAINS[chainId];
    
    if (!chain) {
        throw new Error(`Unsupported chain: ${chainId}`);
    }

    log(`[SafeWallet] Direct execution from Safe ${safeAddress.slice(0, 10)}...`);
    log(`[SafeWallet] To: ${to}, Value: ${formatEther(value)} ETH`);
    log(`[SafeWallet] EOA paying gas: ${walletClient.account.address.slice(0, 10)}...`);

    // Check if Safe is deployed
    let deployed = await isSafeDeployed(safeAddress, chainId);
    
    // If not deployed, deploy it first (EOA pays gas)
    if (!deployed) {
        log(`[SafeWallet] Safe not deployed on chain ${chainId}, deploying first...`);
        
        const { txHash: deployTxHash } = await deploySafeWithEOA(
            walletClient.account.address,
            chainId,
            walletClient,
            BigInt(0)
        );
        
        log(`[SafeWallet] Safe deployment tx submitted: ${deployTxHash}`);
        
        // Wait for deployment to be confirmed
        log(`[SafeWallet] Waiting for deployment confirmation...`);
        const receipt = await publicClient.waitForTransactionReceipt({ 
            hash: deployTxHash,
            confirmations: 1,
        });
        
        if (receipt.status !== "success") {
            throw new Error("Safe deployment failed");
        }
        
        log(`[SafeWallet] Safe deployed successfully!`);
        deployed = true;
    }

    // Verify the wallet is an owner of this Safe
    const isOwner = await isSafeOwner(safeAddress, walletClient.account.address, chainId);
    if (!isOwner) {
        throw new Error("Your wallet is not an owner of this Safe. Cannot execute transaction.");
    }

    // Get the Safe's current nonce
    const nonce = await publicClient.readContract({
        address: safeAddress,
        abi: SAFE_ABI,
        functionName: "nonce",
    });
    
    log(`[SafeWallet] Safe nonce: ${nonce}`);

    // Safe transaction parameters
    const operation = 0; // Call (not delegatecall)
    const safeTxGas = BigInt(0); // Let Safe estimate
    const baseGas = BigInt(0);
    const gasPrice = BigInt(0); // No refund
    const gasToken = "0x0000000000000000000000000000000000000000" as Address;
    const refundReceiver = "0x0000000000000000000000000000000000000000" as Address;

    // Get the transaction hash from the Safe contract
    const safeTxHash = await publicClient.readContract({
        address: safeAddress,
        abi: SAFE_ABI,
        functionName: "getTransactionHash",
        args: [to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, nonce],
    });

    log(`[SafeWallet] Safe tx hash: ${safeTxHash}`);

    // Sign the hash with the owner's wallet
    // Safe expects eth_sign format: sign the raw hash bytes
    const signature = await walletClient.signMessage({
        message: { raw: safeTxHash as Hex },
    });

    // Adjust v value for Safe's signature format
    // Safe expects v to be 27 or 28, but eth_sign may return 0 or 1
    let v = parseInt(signature.slice(-2), 16);
    if (v < 27) {
        v += 27;
    }
    // Safe also adds 4 to v for eth_sign signatures
    v += 4;
    
    const adjustedSignature = (signature.slice(0, -2) + v.toString(16).padStart(2, "0")) as Hex;

    log(`[SafeWallet] Signature ready, executing transaction...`);

    // Execute the transaction - EOA pays gas
    const txHash = await walletClient.writeContract({
        address: safeAddress,
        abi: SAFE_ABI,
        functionName: "execTransaction",
        args: [to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, adjustedSignature],
        chain,
    });

    log(`[SafeWallet] Transaction sent: ${txHash}`);

    return txHash as Hex;
}

/**
 * Execute a Safe ERC20 transfer directly (EOA pays gas)
 */
export async function execSafeERC20TransferDirect(
    safeAddress: Address,
    chainId: number,
    tokenAddress: Address,
    to: Address,
    amount: bigint,
    walletClient: {
        account: { address: Address };
        signMessage: (args: { message: { raw: Hex } }) => Promise<Hex>;
        writeContract: (args: unknown) => Promise<Hex>;
    }
): Promise<Hex> {
    // Encode ERC20 transfer
    const data = encodeFunctionData({
        abi: [{
            name: "transfer",
            type: "function",
            inputs: [
                { name: "to", type: "address" },
                { name: "amount", type: "uint256" },
            ],
            outputs: [{ name: "", type: "bool" }],
        }],
        functionName: "transfer",
        args: [to, amount],
    });

    return execSafeTransactionDirect(
        safeAddress,
        chainId,
        tokenAddress,
        BigInt(0), // No ETH value for ERC20 transfer
        data,
        walletClient
    );
}

// ============================================================================
// RECOVERY SIGNER MANAGEMENT
// Functions to add/remove recovery signers on a Safe
// ============================================================================

const SAFE_OWNER_MANAGER_ABI = [
    {
        name: "getOwners",
        type: "function",
        inputs: [],
        outputs: [{ name: "", type: "address[]" }],
        stateMutability: "view",
    },
    {
        name: "getThreshold",
        type: "function",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        name: "isOwner",
        type: "function",
        inputs: [{ name: "owner", type: "address" }],
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "view",
    },
    {
        name: "addOwnerWithThreshold",
        type: "function",
        inputs: [
            { name: "owner", type: "address" },
            { name: "_threshold", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    {
        name: "removeOwner",
        type: "function",
        inputs: [
            { name: "prevOwner", type: "address" },
            { name: "owner", type: "address" },
            { name: "_threshold", type: "uint256" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
] as const;

/**
 * Get the current owners of a Safe
 */
export async function getSafeOwners(
    safeAddress: Address,
    chainId: number
): Promise<Address[]> {
    const publicClient = getPublicClient(chainId);
    
    try {
        const owners = await publicClient.readContract({
            address: safeAddress,
            abi: SAFE_OWNER_MANAGER_ABI,
            functionName: "getOwners",
        });
        return owners as Address[];
    } catch (error) {
        console.error("[SafeWallet] Error getting owners:", error);
        return [];
    }
}

/**
 * Get the current threshold of a Safe
 */
export async function getSafeThreshold(
    safeAddress: Address,
    chainId: number
): Promise<number> {
    const publicClient = getPublicClient(chainId);
    
    try {
        const threshold = await publicClient.readContract({
            address: safeAddress,
            abi: SAFE_OWNER_MANAGER_ABI,
            functionName: "getThreshold",
        });
        return Number(threshold);
    } catch (error) {
        console.error("[SafeWallet] Error getting threshold:", error);
        return 1;
    }
}

/**
 * Check if an address is an owner of a Safe
 */
export async function isSafeOwner(
    safeAddress: Address,
    ownerAddress: Address,
    chainId: number
): Promise<boolean> {
    const publicClient = getPublicClient(chainId);
    
    try {
        const isOwner = await publicClient.readContract({
            address: safeAddress,
            abi: SAFE_OWNER_MANAGER_ABI,
            functionName: "isOwner",
            args: [ownerAddress],
        });
        return isOwner as boolean;
    } catch (error) {
        console.error("[SafeWallet] Error checking owner:", error);
        return false;
    }
}

/**
 * Add a recovery signer to a Safe via passkey-signed transaction
 * 
 * This adds a new EOA as an owner with threshold 1, allowing either
 * the passkey OR the recovery EOA to sign transactions.
 * 
 * @param safeAddress - The Safe address
 * @param recoveryAddress - The EOA address to add as recovery signer
 * @param passkeyCredential - The passkey credential for signing
 * @param chainId - The chain ID
 * @returns Transaction hash
 */
export async function addRecoverySigner(
    safeAddress: Address,
    recoveryAddress: Address,
    passkeyCredential: PasskeyCredential,
    chainId: number
): Promise<string> {
    log(`[SafeWallet] Adding recovery signer ${recoveryAddress.slice(0, 10)}... to Safe ${safeAddress.slice(0, 10)}...`);
    
    // Check if Safe is deployed
    const deployed = await isSafeDeployed(safeAddress, chainId);
    if (!deployed) {
        throw new Error("Safe must be deployed before adding recovery signer. Send a transaction first.");
    }
    
    // Check if already an owner
    const alreadyOwner = await isSafeOwner(safeAddress, recoveryAddress, chainId);
    if (alreadyOwner) {
        throw new Error("This address is already an owner of the Safe");
    }

    // Verify the passkey's signer is an owner of this Safe
    const { calculateWebAuthnSignerAddress } = await import("./passkeySigner");
    const passkeySignerAddress = calculateWebAuthnSignerAddress(passkeyCredential.publicKey, chainId);
    const isPasskeyOwner = await isSafeOwner(safeAddress, passkeySignerAddress, chainId);
    if (!isPasskeyOwner) {
        throw new Error("Your passkey is not an owner of this Safe. Cannot add recovery signer.");
    }
    
    // Encode the addOwnerWithThreshold call
    // Keep threshold at 1 so either passkey OR recovery EOA can sign
    const addOwnerData = encodeFunctionData({
        abi: SAFE_OWNER_MANAGER_ABI,
        functionName: "addOwnerWithThreshold",
        args: [recoveryAddress, BigInt(1)],
    });
    
    // Create passkey client and send the transaction
    const client = await createPasskeySafeAccountClient(passkeyCredential, chainId);
    
    // Send transaction to the Safe itself (self-call to add owner)
    // Use 'calls' format which is the standard for Safe account client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txHash = await client.sendTransaction({
        calls: [{
            to: safeAddress,
            value: BigInt(0),
            data: addOwnerData,
        }],
    } as any);
    
    log(`[SafeWallet] Recovery signer added, tx: ${txHash}`);
    
    return txHash;
}

/**
 * Add a recovery signer to a Safe via EOA wallet-signed transaction
 * 
 * This is for users who connected with a wallet (MetaMask, etc.) rather than passkey.
 * The connected wallet signs the transaction to add the recovery address as an owner.
 * 
 * @param safeAddress - The Safe address
 * @param recoveryAddress - The EOA address to add as recovery signer
 * @param signerAddress - The current owner's address (connected wallet)
 * @param signMessage - Function to sign messages (from wagmi)
 * @param signTypedData - Function to sign typed data (from wagmi)
 * @param chainId - The chain ID
 * @returns Transaction hash
 */
export async function addRecoverySignerWithWallet(
    safeAddress: Address,
    recoveryAddress: Address,
    signerAddress: Address,
    signMessage: (message: string) => Promise<`0x${string}`>,
    signTypedData: (data: unknown) => Promise<`0x${string}`>,
    chainId: number
): Promise<string> {
    log(`[SafeWallet] Adding recovery signer ${recoveryAddress.slice(0, 10)}... to Safe ${safeAddress.slice(0, 10)}... (wallet signing)`);
    
    // Check if Safe is deployed
    const deployed = await isSafeDeployed(safeAddress, chainId);
    if (!deployed) {
        throw new Error("Safe must be deployed before adding recovery signer. Send a transaction first.");
    }
    
    // Check if already an owner
    const alreadyOwner = await isSafeOwner(safeAddress, recoveryAddress, chainId);
    if (alreadyOwner) {
        throw new Error("This address is already an owner of the Safe");
    }

    // Verify the signer is an owner of this Safe
    const isOwner = await isSafeOwner(safeAddress, signerAddress, chainId);
    if (!isOwner) {
        throw new Error("Your wallet is not an owner of this Safe. Cannot add recovery signer.");
    }
    
    // Encode the addOwnerWithThreshold call
    // Keep threshold at 1 so either original owner OR recovery EOA can sign
    const addOwnerData = encodeFunctionData({
        abi: SAFE_OWNER_MANAGER_ABI,
        functionName: "addOwnerWithThreshold",
        args: [recoveryAddress, BigInt(1)],
    });
    
    // Create Safe account client with wallet signing
    const client = await createSafeAccountClient(
        signerAddress,
        chainId,
        signMessage,
        signTypedData
    );
    
    // Send transaction to the Safe itself (self-call to add owner)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txHash = await client.sendTransaction({
        calls: [{
            to: safeAddress,
            value: BigInt(0),
            data: addOwnerData,
        }],
    } as any);
    
    log(`[SafeWallet] Recovery signer added (wallet), tx: ${txHash}`);
    
    return txHash;
}

/**
 * Get recovery signer info for a Safe
 * Returns info about whether recovery is set up and who the signers are
 */
export async function getRecoveryInfo(
    safeAddress: Address,
    primarySignerAddress: Address,
    chainId: number
): Promise<{
    isDeployed: boolean;
    owners: Address[];
    threshold: number;
    hasRecoverySigner: boolean;
    recoverySigners: Address[];
}> {
    const isDeployed = await isSafeDeployed(safeAddress, chainId);
    
    if (!isDeployed) {
        return {
            isDeployed: false,
            owners: [],
            threshold: 1,
            hasRecoverySigner: false,
            recoverySigners: [],
        };
    }
    
    const owners = await getSafeOwners(safeAddress, chainId);
    const threshold = await getSafeThreshold(safeAddress, chainId);
    
    // Recovery signers are any owners that aren't the primary signer
    const recoverySigners = owners.filter(
        owner => owner.toLowerCase() !== primarySignerAddress.toLowerCase()
    );
    
    return {
        isDeployed,
        owners,
        threshold,
        hasRecoverySigner: recoverySigners.length > 0,
        recoverySigners,
    };
}
