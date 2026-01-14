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
