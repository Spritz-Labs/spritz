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
import { base, mainnet, arbitrum, optimism, polygon } from "viem/chains";

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
    // Calculate the Safe counterfactual address
    const smartWalletAddress = calculateSafeAddress(spritzId);
    
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
    
    // Check if Safe is deployed
    let isDeployed = false;
    try {
        const publicClient = getPublicClient(8453); // Check on Base
        const code = await publicClient.getCode({ address: smartWalletAddress });
        isDeployed = code !== undefined && code !== "0x" && code.length > 2;
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
export function getSupportedChains(): { chainId: number; name: string }[] {
    return [
        { chainId: 1, name: "Ethereum" },
        { chainId: 8453, name: "Base" },
        { chainId: 42161, name: "Arbitrum" },
        { chainId: 10, name: "Optimism" },
        { chainId: 137, name: "Polygon" },
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
