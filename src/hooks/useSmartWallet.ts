"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { 
    keccak256, 
    encodePacked, 
    getAddress, 
    concat, 
    pad, 
    toHex,
    type Address,
    type Hex,
} from "viem";

export type SmartWalletInfo = {
    spritzId: Address;
    smartWalletAddress: Address;
    isDeployed: boolean;
    walletType: "passkey" | "email" | "wallet" | "digitalid";
    canSign: boolean;
    signerType: "eoa" | "passkey" | "none";
    supportedChains: { chainId: number; name: string }[];
};

type UseSmartWalletReturn = {
    smartWallet: SmartWalletInfo | null;
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
};

// Safe deployment constants (must match server-side)
const SAFE_SINGLETON_ADDRESS = "0x41675C099F32341bf84BFc5382aF534df5C7461a" as const;
const SAFE_PROXY_FACTORY_ADDRESS = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67" as const;
const SAFE_FALLBACK_HANDLER = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99" as const;
const SPRITZ_SALT_NONCE = BigInt(0);

/**
 * Encode Safe initializer data (client-side version)
 */
function encodeSafeInitializer(ownerAddress: Address): Hex {
    const functionSelector = "0xb63e800d";
    
    const ownersOffset = pad(toHex(BigInt(256)), { size: 32 });
    const threshold = pad(toHex(BigInt(1)), { size: 32 });
    const to = pad("0x0000000000000000000000000000000000000000" as Hex, { size: 32 });
    const dataOffset = pad(toHex(BigInt(320)), { size: 32 });
    const fallbackHandler = pad(SAFE_FALLBACK_HANDLER, { size: 32 });
    const paymentToken = pad("0x0000000000000000000000000000000000000000" as Hex, { size: 32 });
    const payment = pad(toHex(BigInt(0)), { size: 32 });
    const paymentReceiver = pad("0x0000000000000000000000000000000000000000" as Hex, { size: 32 });
    const ownersLength = pad(toHex(BigInt(1)), { size: 32 });
    const owner = pad(ownerAddress, { size: 32 });
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
 * Calculate Safe counterfactual address (client-side version)
 * Must match the server-side calculation exactly
 */
function calculateSafeAddress(ownerAddress: Address, saltNonce: bigint = SPRITZ_SALT_NONCE): Address {
    const initializer = encodeSafeInitializer(ownerAddress);
    const initializerHash = keccak256(initializer);
    const salt = keccak256(
        encodePacked(
            ["bytes32", "uint256"],
            [initializerHash, saltNonce]
        )
    );
    
    const proxyCreationCode = "0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441a64736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564";
    
    const constructorArg = pad(SAFE_SINGLETON_ADDRESS, { size: 32 });
    const deploymentCode = concat([proxyCreationCode as Hex, constructorArg]);
    const deploymentCodeHash = keccak256(deploymentCode);
    
    const create2Input = concat([
        "0xff" as Hex,
        SAFE_PROXY_FACTORY_ADDRESS,
        salt,
        deploymentCodeHash,
    ]);
    
    const create2Hash = keccak256(create2Input);
    const addressHex = `0x${create2Hash.slice(-40)}`;
    
    return getAddress(addressHex);
}

/**
 * Hook to get the user's Smart Wallet (Safe) address.
 * 
 * The dual address system:
 * - spritzId: User's identity address (for social features, database)
 * - smartWalletAddress: Safe counterfactual address (for tokens)
 */
export function useSmartWallet(userAddress: string | null): UseSmartWalletReturn {
    const [smartWallet, setSmartWallet] = useState<SmartWalletInfo | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Calculate Safe address client-side immediately
    const clientSideWallet = useMemo<SmartWalletInfo | null>(() => {
        if (!userAddress) return null;
        
        try {
            const spritzId = userAddress.toLowerCase() as Address;
            const smartWalletAddress = calculateSafeAddress(spritzId);
            
            return {
                spritzId,
                smartWalletAddress,
                isDeployed: false,
                walletType: "wallet",
                canSign: true, // Assume wallet users can sign
                signerType: "eoa",
                supportedChains: [
                    { chainId: 1, name: "Ethereum" },
                    { chainId: 8453, name: "Base" },
                    { chainId: 42161, name: "Arbitrum" },
                    { chainId: 10, name: "Optimism" },
                    { chainId: 137, name: "Polygon" },
                ],
            };
        } catch {
            return null;
        }
    }, [userAddress]);

    const fetchSmartWallet = useCallback(async () => {
        if (!userAddress) {
            setSmartWallet(null);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/wallet/smart-wallet", {
                credentials: "include",
            });

            if (!response.ok) {
                if (clientSideWallet) {
                    setSmartWallet(clientSideWallet);
                }
                return;
            }

            const data = await response.json();
            
            // Merge server data with client-side calculated address
            // IMPORTANT: Server address takes priority (passkey users have different Safe)
            setSmartWallet({
                ...clientSideWallet,
                ...data,
                // Server address takes priority - passkey users have a different Safe
                // based on their P256 public key, not their Spritz ID
                smartWalletAddress: data.smartWalletAddress || clientSideWallet?.smartWalletAddress,
            });
        } catch (err) {
            console.error("[useSmartWallet] Error:", err);
            setError(err instanceof Error ? err.message : "Failed to get smart wallet");
            
            if (clientSideWallet) {
                setSmartWallet(clientSideWallet);
            }
        } finally {
            setIsLoading(false);
        }
    }, [userAddress, clientSideWallet]);

    // Set client-side wallet immediately
    useEffect(() => {
        if (clientSideWallet && !smartWallet) {
            setSmartWallet(clientSideWallet);
        }
    }, [clientSideWallet, smartWallet]);

    // Fetch from API for deployment status and auth type
    useEffect(() => {
        if (userAddress) {
            fetchSmartWallet();
        }
    }, [userAddress, fetchSmartWallet]);

    return {
        smartWallet: smartWallet || clientSideWallet,
        isLoading,
        error,
        refresh: fetchSmartWallet,
    };
}

/**
 * Get the display address for wallet features.
 */
export function getWalletDisplayAddress(
    smartWallet: SmartWalletInfo | null,
    fallbackAddress: string
): Address {
    if (smartWallet?.smartWalletAddress) {
        return smartWallet.smartWalletAddress;
    }
    return fallbackAddress as Address;
}

/**
 * Format address for display (truncated)
 */
export function formatAddress(address: string): string {
    if (!address) return "";
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
