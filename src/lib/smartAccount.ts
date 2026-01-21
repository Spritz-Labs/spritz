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
import { base, mainnet, arbitrum, optimism, polygon, bsc, avalanche, type Chain } from "viem/chains";

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
    43114: avalanche,
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
 * IMPORTANT: Address calculation differs by auth type!
 * - Wallet users: Safe owned by EOA → use getSafeAddress
 * - Passkey users: Safe owned by WebAuthn signer → use getPasskeySafeAddress
 * - Email/Digital ID: If they have a passkey, use passkey method; else EOA method
 * 
 * @param spritzId - The user's Spritz ID
 * @param authType - Authentication type
 * @param passkeyCoordinates - P256 public key coords (required for passkey users)
 * @returns Smart Wallet address and deployment status
 */
export async function getSmartWalletAddress(
    spritzId: Address,
    authType: "passkey" | "email" | "wallet" | "digitalid" = "wallet",
    passkeyCoordinates?: { publicKeyX: string; publicKeyY: string }
): Promise<{ 
    smartWalletAddress: Address; 
    isDeployed: boolean;
    chainId: number;
    canSign: boolean;
    signerType: "eoa" | "passkey" | "none";
}> {
    // Import Safe utilities dynamically to avoid circular dependencies
    const { getSafeAddress, getPasskeySafeAddress, isSafeDeployed } = await import("./safeWallet");
    
    let smartWalletAddress: Address;
    let canSign = false;
    let signerType: "eoa" | "passkey" | "none" = "none";
    
    // CRITICAL: Use different address calculations based on auth type
    switch (authType) {
        case "wallet":
            // EOA owns the Safe directly
            smartWalletAddress = await getSafeAddress({ ownerAddress: spritzId, chainId: 8453 });
            canSign = true;
            signerType = "eoa";
            break;
            
        case "email":
            // Email users might have a passkey or use EOA
            if (passkeyCoordinates?.publicKeyX && passkeyCoordinates?.publicKeyY) {
                // Has passkey - use WebAuthn-based Safe
                smartWalletAddress = await getPasskeySafeAddress(
                    passkeyCoordinates.publicKeyX,
                    passkeyCoordinates.publicKeyY,
                    8453
                );
                canSign = true;
                signerType = "passkey";
            } else {
                // No passkey - use EOA-based Safe (they need to add a passkey)
                smartWalletAddress = await getSafeAddress({ ownerAddress: spritzId, chainId: 8453 });
                canSign = false;
                signerType = "none";
            }
            break;
            
        case "passkey":
            // CRITICAL: Passkey users MUST use getPasskeySafeAddress
            // Using getSafeAddress would produce the WRONG address!
            if (!passkeyCoordinates?.publicKeyX || !passkeyCoordinates?.publicKeyY) {
                console.error("[SmartWallet] Passkey user but no coordinates provided!");
                // Fall back to spritzId as placeholder - address will be wrong!
                smartWalletAddress = await getSafeAddress({ ownerAddress: spritzId, chainId: 8453 });
                canSign = false;
                signerType = "none";
            } else {
                smartWalletAddress = await getPasskeySafeAddress(
                    passkeyCoordinates.publicKeyX,
                    passkeyCoordinates.publicKeyY,
                    8453
                );
                canSign = true;
                signerType = "passkey";
            }
            break;
            
        case "digitalid":
            // Digital ID users are like email - might have passkey
            if (passkeyCoordinates?.publicKeyX && passkeyCoordinates?.publicKeyY) {
                smartWalletAddress = await getPasskeySafeAddress(
                    passkeyCoordinates.publicKeyX,
                    passkeyCoordinates.publicKeyY,
                    8453
                );
                canSign = true;
                signerType = "passkey";
            } else {
                // No passkey yet - they need to add one
                smartWalletAddress = await getSafeAddress({ ownerAddress: spritzId, chainId: 8453 });
                canSign = false;
                signerType = "none";
            }
            break;
    }
    
    // Check if Safe is deployed
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
        { chainId: 43114, name: "Avalanche", sponsorship: "free" }, // Sponsored
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
