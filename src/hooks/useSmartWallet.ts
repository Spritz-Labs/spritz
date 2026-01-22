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

// Cache key for localStorage
const SMART_WALLET_CACHE_KEY = "spritz_smart_wallet_cache";

/**
 * Get cached smart wallet address from localStorage
 */
function getCachedSmartWallet(userAddress: string): Address | null {
    if (typeof window === "undefined") return null;
    try {
        const cache = localStorage.getItem(SMART_WALLET_CACHE_KEY);
        if (!cache) return null;
        const parsed = JSON.parse(cache);
        const normalizedAddress = userAddress.toLowerCase();
        return parsed[normalizedAddress] || null;
    } catch {
        return null;
    }
}

/**
 * Cache smart wallet address to localStorage
 */
function setCachedSmartWallet(userAddress: string, smartWalletAddress: Address): void {
    if (typeof window === "undefined") return;
    try {
        const cache = localStorage.getItem(SMART_WALLET_CACHE_KEY);
        const parsed = cache ? JSON.parse(cache) : {};
        parsed[userAddress.toLowerCase()] = smartWalletAddress;
        localStorage.setItem(SMART_WALLET_CACHE_KEY, JSON.stringify(parsed));
    } catch {
        // Ignore cache errors
    }
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

    // Try to get cached address for immediate display
    const cachedAddress = useMemo(() => {
        if (!userAddress) return null;
        return getCachedSmartWallet(userAddress);
    }, [userAddress]);

    // Client-side wallet with cached address (if available)
    const clientSideWallet = useMemo<SmartWalletInfo | null>(() => {
        if (!userAddress) return null;
        
        // Use cached address if available for immediate display
        return {
            spritzId: userAddress.toLowerCase() as Address,
            smartWalletAddress: cachedAddress, // Use cached address!
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
    }, [userAddress, cachedAddress]);

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
            
            // If user needs a passkey, they might still have a stored address (lost passkey case)
            if (data.needsPasskey) {
                // Cache the address if we have one (for lost passkey users)
                if (data.smartWalletAddress && userAddress) {
                    setCachedSmartWallet(userAddress, data.smartWalletAddress);
                }
                
                setSmartWallet({
                    spritzId: data.spritzId || (userAddress.toLowerCase() as Address),
                    smartWalletAddress: data.smartWalletAddress || null, // May have stored address
                    isDeployed: false,
                    walletType: data.walletType || "email",
                    canSign: false,
                    signerType: "none",
                    supportedChains: data.supportedChains || [],
                    needsPasskey: true,
                    passkeyCredentialId: null,
                    warning: data.warning,
                });
                return;
            }
            
            // Server address takes priority - it knows the correct Safe owner
            const serverWallet: SmartWalletInfo = {
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
            };
            
            // Cache the address for offline/session-expired fallback
            if (data.smartWalletAddress && userAddress) {
                setCachedSmartWallet(userAddress, data.smartWalletAddress);
            }
            
            setSmartWallet(serverWallet);
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
