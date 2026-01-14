/**
 * Smart Account utilities for Spritz
 * 
 * Provides deterministic Safe Smart Wallet address calculation for users.
 * 
 * Architecture:
 * - Spritz ID: User's identity address (passkey-derived, email EOA, or connected wallet)
 * - Smart Wallet: Safe counterfactual address (for receiving and sending tokens)
 * 
 * Login Type Support:
 * - Wallet: EOA signs Safe transactions via connected wallet
 * - Email: Derived EOA signs Safe transactions (has private key)
 * - Passkey: Uses Safe's WebAuthn signer (P256 curve)
 * - Digital ID: Similar to passkey approach
 */

import { 
    createPublicClient, 
    http, 
    type Address, 
    keccak256,
    encodePacked,
    getAddress,
    concat,
    pad,
    toHex,
    type Hex,
} from "viem";
import { base, mainnet, arbitrum, optimism, polygon, bsc, type Chain } from "viem/chains";

// Unichain mainnet (not in viem yet)
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

// Safe deployment constants (Safe v1.4.1)
// These are the canonical addresses used by Safe for deterministic deployment
const SAFE_SINGLETON_ADDRESS = "0x41675C099F32341bf84BFc5382aF534df5C7461a" as const; // Safe v1.4.1
const SAFE_PROXY_FACTORY_ADDRESS = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67" as const;
const SAFE_FALLBACK_HANDLER = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99" as const;

// Salt nonce for Spritz wallets (use 0 for consistency)
const SPRITZ_SALT_NONCE = BigInt(0);

// Supported chains for Safe deployment
export const SAFE_CHAINS = {
    1: mainnet,
    8453: base,
    42161: arbitrum,
    10: optimism,
    137: polygon,
    56: bsc,
    130: unichain,
} as const;

/**
 * Create a public client for a specific chain
 */
function getPublicClient(chainId: number = 8453) {
    const chain = SAFE_CHAINS[chainId as keyof typeof SAFE_CHAINS] || base;
    return createPublicClient({
        chain,
        transport: http(),
    });
}

/**
 * Encode Safe initializer data
 * This is the data used in Safe's setup() function
 */
function encodeSafeInitializer(ownerAddress: Address): Hex {
    // setup(address[] owners, uint256 threshold, address to, bytes data, 
    //       address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)
    
    // Encode the setup call for a 1/1 Safe with the owner
    const setupAbi = {
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
    } as const;
    
    // For a simple 1/1 Safe setup:
    // - owners: [ownerAddress]
    // - threshold: 1
    // - to: 0x0 (no module setup)
    // - data: 0x (no module setup data)
    // - fallbackHandler: Safe's default fallback handler
    // - paymentToken: 0x0 (no gas payment token)
    // - payment: 0 (no gas payment)
    // - paymentReceiver: 0x0 (no gas payment receiver)
    
    // Manually encode to avoid importing ABIs
    const functionSelector = "0xb63e800d"; // setup function selector
    
    // Encode parameters
    const ownersOffset = pad(toHex(BigInt(256)), { size: 32 }); // offset to owners array (8 * 32 = 256)
    const threshold = pad(toHex(BigInt(1)), { size: 32 });
    const to = pad("0x0000000000000000000000000000000000000000" as Hex, { size: 32 });
    const dataOffset = pad(toHex(BigInt(320)), { size: 32 }); // offset to data bytes
    const fallbackHandler = pad(SAFE_FALLBACK_HANDLER, { size: 32 });
    const paymentToken = pad("0x0000000000000000000000000000000000000000" as Hex, { size: 32 });
    const payment = pad(toHex(BigInt(0)), { size: 32 });
    const paymentReceiver = pad("0x0000000000000000000000000000000000000000" as Hex, { size: 32 });
    
    // Owners array: length + address
    const ownersLength = pad(toHex(BigInt(1)), { size: 32 });
    const owner = pad(ownerAddress, { size: 32 });
    
    // Data bytes (empty): length
    const dataLength = pad(toHex(BigInt(0)), { size: 32 });
    
    return concat([
        functionSelector as Hex,
        ownersOffset,
        threshold,
        to,
        dataOffset,
        fallbackHandler,
        paymentToken,
        payment,
        paymentReceiver,
        ownersLength,
        owner,
        dataLength,
    ]);
}

/**
 * Calculate Safe counterfactual address using CREATE2
 * 
 * @deprecated This calculates a BASIC Safe address without 4337 module.
 * For actual Spritz wallets, use getSafeAddress() from safeWallet.ts instead,
 * which uses permissionless.js and includes the 4337 module setup.
 * The addresses produced by these two methods are DIFFERENT.
 * 
 * This calculates where the Safe WILL be deployed, without actually deploying it.
 * The address is deterministic based on: factory, singleton, initializer, and salt.
 */
export function calculateSafeAddress(ownerAddress: Address, saltNonce: bigint = SPRITZ_SALT_NONCE): Address {
    // Get initializer data for the Safe
    const initializer = encodeSafeInitializer(ownerAddress);
    
    // Calculate the salt: keccak256(keccak256(initializer) + saltNonce)
    const initializerHash = keccak256(initializer);
    const salt = keccak256(
        encodePacked(
            ["bytes32", "uint256"],
            [initializerHash, saltNonce]
        )
    );
    
    // Safe Proxy creation code + singleton address
    // This is the bytecode used by Safe's proxy factory
    const proxyCreationCode = "0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441a64736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564";
    
    // Encode singleton address as constructor argument
    const constructorArg = pad(SAFE_SINGLETON_ADDRESS, { size: 32 });
    
    // Combine creation code with constructor argument
    const deploymentCode = concat([proxyCreationCode as Hex, constructorArg]);
    
    // Calculate CREATE2 address: keccak256(0xff + factory + salt + keccak256(bytecode))
    const deploymentCodeHash = keccak256(deploymentCode);
    
    const create2Input = concat([
        "0xff" as Hex,
        SAFE_PROXY_FACTORY_ADDRESS,
        salt,
        deploymentCodeHash,
    ]);
    
    const create2Hash = keccak256(create2Input);
    
    // Take the last 20 bytes for the address
    const addressHex = `0x${create2Hash.slice(-40)}`;
    
    return getAddress(addressHex);
}

/**
 * Calculate Smart Wallet (Safe) address from a Spritz ID.
 * 
 * This is the primary function to get a user's Spritz wallet address.
 * The address is a Safe counterfactual address with the Spritz ID as owner.
 * 
 * @param spritzId - The user's Spritz ID (identity address)
 * @returns The Safe counterfactual address
 */
export function calculateSmartWalletFromSpritzId(spritzId: Address): Address {
    return calculateSafeAddress(spritzId, SPRITZ_SALT_NONCE);
}

/**
 * Legacy alias for calculateSmartWalletFromSpritzId
 */
export function calculateSmartWalletAddress(
    ownerAddress: Address,
    saltNonce: bigint = SPRITZ_SALT_NONCE
): Address {
    return calculateSafeAddress(ownerAddress, saltNonce);
}

/**
 * Get Smart Wallet info for a user.
 * 
 * IMPORTANT: This now uses getSafeAddress from safeWallet.ts for consistency.
 * The address calculation must match what permissionless.js uses for transactions.
 * 
 * @param spritzId - The user's Spritz ID
 * @param authType - Authentication type
 * @returns Smart Wallet address and deployment status
 */
export async function getSmartWalletAddress(
    spritzId: Address,
    authType: "passkey" | "email" | "wallet" | "digitalid" = "wallet"
): Promise<{ 
    smartWalletAddress: Address; 
    isDeployed: boolean;
    chainId: number;
    canSign: boolean;
    signerType: "eoa" | "passkey" | "none";
}> {
    // Import getSafeAddress dynamically to avoid circular dependencies
    const { getSafeAddress, isSafeDeployed } = await import("./safeWallet");
    
    // Calculate the Safe counterfactual address using permissionless.js
    // This MUST match what's used in transactions
    const smartWalletAddress = await getSafeAddress({ ownerAddress: spritzId, chainId: 8453 });
    
    // Determine signing capability based on auth type
    let canSign = false;
    let signerType: "eoa" | "passkey" | "none" = "none";
    
    switch (authType) {
        case "wallet":
            canSign = true;
            signerType = "eoa";
            break;
        case "email":
            canSign = true;
            signerType = "eoa";
            break;
        case "passkey":
            // Passkey users can sign via WebAuthn, but need Safe's passkey module
            canSign = false; // Will be true once passkey module is integrated
            signerType = "passkey";
            break;
        case "digitalid":
            canSign = false; // Similar to passkey
            signerType = "none";
            break;
    }
    
    // Check if Safe is deployed using the same method as safeWallet.ts
    let isDeployed = false;
    try {
        isDeployed = await isSafeDeployed(smartWalletAddress, 8453);
    } catch (error) {
        console.error("[SmartWallet] Error checking deployment:", error);
    }

    return {
        smartWalletAddress,
        isDeployed,
        chainId: 8453, // Base
        canSign,
        signerType,
    };
}

/**
 * Get supported chains for Smart Wallets
 */
export function getSupportedChains(): { chainId: number; name: string; sponsorship: "free" | "usdc" }[] {
    return [
        { chainId: 1, name: "Ethereum", sponsorship: "usdc" },      // User pays in USDC
        { chainId: 8453, name: "Base", sponsorship: "free" },       // Sponsored
        { chainId: 42161, name: "Arbitrum", sponsorship: "free" },  // Sponsored
        { chainId: 10, name: "Optimism", sponsorship: "free" },     // Sponsored
        { chainId: 137, name: "Polygon", sponsorship: "free" },     // Sponsored
        { chainId: 56, name: "BNB Chain", sponsorship: "free" },    // Sponsored
        { chainId: 130, name: "Unichain", sponsorship: "free" },    // Sponsored
    ];
}

/**
 * Check if Smart Wallet is deployed on a specific chain
 */
export async function isSmartWalletDeployed(
    smartWalletAddress: Address,
    chainId: number = 8453
): Promise<boolean> {
    try {
        const publicClient = getPublicClient(chainId);
        const code = await publicClient.getCode({ address: smartWalletAddress });
        return code !== undefined && code !== "0x" && code.length > 2;
    } catch {
        return false;
    }
}

/**
 * Get the owner address (Spritz ID) that controls a Safe address
 * Note: This is a reverse lookup and may not always work
 */
export function getOwnerFromSafeAddress(_safeAddress: Address): Address | null {
    // This would require querying the Safe contract or maintaining a mapping
    // For now, return null as we don't have this capability
    return null;
}

// ============================================================================
// LEGACY SAFE RECOVERY
// These functions help recover funds from the old basic Safe addresses
// that were calculated before we switched to permissionless.js
// ============================================================================

// Safe Proxy Factory ABI for deployment
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

// Safe ABI for direct execution
const LEGACY_SAFE_ABI = [
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

/**
 * Check if a legacy Safe is deployed
 */
export async function isLegacySafeDeployed(
    safeAddress: Address,
    chainId: number = 1
): Promise<boolean> {
    const publicClient = getPublicClient(chainId);
    try {
        const code = await publicClient.getCode({ address: safeAddress });
        return code !== undefined && code !== "0x" && code.length > 2;
    } catch {
        return false;
    }
}

/**
 * Deploy a legacy Safe (basic Safe without 4337 module)
 * 
 * This deploys the Safe that matches the old calculateSafeAddress() calculation.
 * The EOA pays gas for deployment.
 */
export async function deployLegacySafe(
    ownerAddress: Address,
    chainId: number,
    walletClient: {
        account: { address: Address };
        writeContract: (args: any) => Promise<Hex>;
    }
): Promise<{ safeAddress: Address; txHash: Hex }> {
    const chain = SAFE_CHAINS[chainId as keyof typeof SAFE_CHAINS];
    if (!chain) {
        throw new Error(`Unsupported chain: ${chainId}`);
    }

    // Calculate expected address
    const expectedAddress = calculateSafeAddress(ownerAddress, SPRITZ_SALT_NONCE);
    
    // Check if already deployed
    const deployed = await isLegacySafeDeployed(expectedAddress, chainId);
    if (deployed) {
        console.log("[LegacySafe] Already deployed at:", expectedAddress);
        return { safeAddress: expectedAddress, txHash: "0x" as Hex };
    }

    console.log("[LegacySafe] Deploying legacy Safe for owner:", ownerAddress.slice(0, 10));
    console.log("[LegacySafe] Expected address:", expectedAddress);

    // Get initializer data
    const initializer = encodeSafeInitializer(ownerAddress);

    // Deploy via proxy factory
    const txHash = await walletClient.writeContract({
        address: SAFE_PROXY_FACTORY_ADDRESS,
        abi: SAFE_PROXY_FACTORY_ABI,
        functionName: "createProxyWithNonce",
        args: [SAFE_SINGLETON_ADDRESS, initializer, SPRITZ_SALT_NONCE],
        chain,
    });

    console.log("[LegacySafe] Deployment tx:", txHash);

    return { safeAddress: expectedAddress, txHash };
}

/**
 * Execute a transaction from a legacy Safe
 * 
 * This allows the owner EOA to execute transactions from the old basic Safe.
 * The EOA signs the Safe transaction and pays gas.
 */
export async function execLegacySafeTransaction(
    safeAddress: Address,
    chainId: number,
    to: Address,
    value: bigint,
    data: Hex = "0x",
    walletClient: {
        account: { address: Address };
        signMessage: (args: { message: { raw: Hex } }) => Promise<Hex>;
        writeContract: (args: any) => Promise<Hex>;
    }
): Promise<Hex> {
    const publicClient = getPublicClient(chainId);
    const chain = SAFE_CHAINS[chainId as keyof typeof SAFE_CHAINS];
    
    if (!chain) {
        throw new Error(`Unsupported chain: ${chainId}`);
    }

    console.log(`[LegacySafe] Executing from ${safeAddress.slice(0, 10)}...`);
    console.log(`[LegacySafe] To: ${to}, Value: ${value} wei`);

    // Check if Safe is deployed
    const deployed = await isLegacySafeDeployed(safeAddress, chainId);
    if (!deployed) {
        throw new Error("Legacy Safe is not deployed. Deploy it first.");
    }

    // Get the Safe's current nonce
    const nonce = await publicClient.readContract({
        address: safeAddress,
        abi: LEGACY_SAFE_ABI,
        functionName: "nonce",
    });
    
    console.log(`[LegacySafe] Safe nonce: ${nonce}`);

    // Safe transaction parameters (no gas refund)
    const operation = 0;
    const safeTxGas = BigInt(0);
    const baseGas = BigInt(0);
    const gasPrice = BigInt(0);
    const gasToken = "0x0000000000000000000000000000000000000000" as Address;
    const refundReceiver = "0x0000000000000000000000000000000000000000" as Address;

    // Get transaction hash from Safe
    const safeTxHash = await publicClient.readContract({
        address: safeAddress,
        abi: LEGACY_SAFE_ABI,
        functionName: "getTransactionHash",
        args: [to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, nonce],
    });

    console.log(`[LegacySafe] Safe tx hash: ${safeTxHash}`);

    // Sign the hash
    const signature = await walletClient.signMessage({
        message: { raw: safeTxHash as Hex },
    });

    // Adjust v value for Safe's eth_sign format
    let v = parseInt(signature.slice(-2), 16);
    if (v < 27) v += 27;
    v += 4; // Safe adds 4 for eth_sign
    
    const adjustedSignature = (signature.slice(0, -2) + v.toString(16).padStart(2, "0")) as Hex;

    console.log(`[LegacySafe] Executing transaction...`);

    // Execute
    const txHash = await walletClient.writeContract({
        address: safeAddress,
        abi: LEGACY_SAFE_ABI,
        functionName: "execTransaction",
        args: [to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, adjustedSignature],
        chain,
    });

    console.log(`[LegacySafe] Transaction sent: ${txHash}`);

    return txHash as Hex;
}

/**
 * Recover funds from a legacy Safe
 * 
 * Combines deployment (if needed) and withdrawal into one flow.
 */
export async function recoverFromLegacySafe(
    ownerAddress: Address,
    chainId: number,
    recipientAddress: Address,
    amountWei: bigint,
    walletClient: {
        account: { address: Address };
        signMessage: (args: { message: { raw: Hex } }) => Promise<Hex>;
        writeContract: (args: any) => Promise<Hex>;
    }
): Promise<{ deployTxHash?: Hex; withdrawTxHash: Hex; safeAddress: Address }> {
    // Calculate the legacy Safe address
    const safeAddress = calculateSafeAddress(ownerAddress, SPRITZ_SALT_NONCE);
    console.log(`[LegacySafe] Recovery from: ${safeAddress}`);

    // Check if deployed
    let deployTxHash: Hex | undefined;
    const deployed = await isLegacySafeDeployed(safeAddress, chainId);
    
    if (!deployed) {
        console.log(`[LegacySafe] Safe not deployed, deploying first...`);
        const result = await deployLegacySafe(ownerAddress, chainId, walletClient);
        deployTxHash = result.txHash;
        
        // Wait a bit for deployment to confirm
        console.log(`[LegacySafe] Waiting for deployment confirmation...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Execute withdrawal
    const withdrawTxHash = await execLegacySafeTransaction(
        safeAddress,
        chainId,
        recipientAddress,
        amountWei,
        "0x",
        walletClient
    );

    return { deployTxHash, withdrawTxHash, safeAddress };
}
