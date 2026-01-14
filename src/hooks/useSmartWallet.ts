"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { type Address } from "viem";

export type SmartWalletInfo = {
    spritzId: Address;
    smartWalletAddress: Address | null;
    isDeployed: boolean;
    walletType: "passkey" | "email" | "wallet" | "digitalid";
    canSign: boolean;
    signerType: "eoa" | "passkey" | "none";
    supportedChains: { chainId: number; name: string; sponsorship?: "free" | "usdc" }[];
    /** Whether user needs to create a passkey before they can use the wallet */
    needsPasskey?: boolean;
    /** The passkey credential ID that controls this wallet */
    passkeyCredentialId?: string | null;
    /** Warning message about passkey being wallet key */
    warning?: string;
};

type UseSmartWalletReturn = {
    smartWallet: SmartWalletInfo | null;
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
};

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

    // Don't calculate client-side - wait for API to return the correct address
    // This prevents showing a potentially incorrect address before the API responds
    // The server uses permissionless.js which produces the actual Safe address
    const clientSideWallet = useMemo<SmartWalletInfo | null>(() => {
        if (!userAddress) return null;
        
        // Only provide spritzId client-side, not the Safe address
        // The Safe address comes from the API to ensure consistency
        return {
            spritzId: userAddress.toLowerCase() as Address,
            smartWalletAddress: null, // Wait for API
            isDeployed: false,
            walletType: "wallet",
            canSign: true,
            signerType: "eoa",
            supportedChains: [
                { chainId: 1, name: "Ethereum", sponsorship: "usdc" },
                { chainId: 8453, name: "Base", sponsorship: "free" },
                { chainId: 42161, name: "Arbitrum", sponsorship: "free" },
                { chainId: 10, name: "Optimism", sponsorship: "free" },
                { chainId: 137, name: "Polygon", sponsorship: "free" },
                { chainId: 56, name: "BNB Chain", sponsorship: "free" },
                { chainId: 130, name: "Unichain", sponsorship: "free" },
            ],
        };
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
                // For wallet users, we can fallback to client-side calculation
                if (clientSideWallet) {
                    setSmartWallet(clientSideWallet);
                }
                return;
            }

            const data = await response.json();
            
            // If user needs a passkey, return the server response as-is
            // (smartWalletAddress will be null)
            if (data.needsPasskey) {
                setSmartWallet({
                    spritzId: data.spritzId || (userAddress.toLowerCase() as Address),
                    smartWalletAddress: null,
                    isDeployed: false,
                    walletType: data.walletType || "email",
                    canSign: false,
                    signerType: "none",
                    supportedChains: data.supportedChains || [],
                    needsPasskey: true,
                    passkeyCredentialId: null,
                });
                return;
            }
            
            // Server address takes priority - it knows the correct Safe owner
            setSmartWallet({
                spritzId: data.spritzId,
                smartWalletAddress: data.smartWalletAddress,
                isDeployed: data.isDeployed || false,
                walletType: data.walletType || "wallet",
                canSign: data.canSign || false,
                signerType: data.signerType || "none",
                supportedChains: data.supportedChains || clientSideWallet?.supportedChains || [],
                needsPasskey: false,
                passkeyCredentialId: data.passkeyCredentialId,
                warning: data.warning,
            });
        } catch (err) {
            console.error("[useSmartWallet] Error:", err);
            setError(err instanceof Error ? err.message : "Failed to get smart wallet");
            
            // Only fallback for wallet users (who don't need passkeys)
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
