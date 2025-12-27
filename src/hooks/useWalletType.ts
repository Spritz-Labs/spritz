"use client";

import { useAccount } from "wagmi";
import { useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";

export type WalletType = "evm" | "solana" | null;

export function useWalletType() {
    // Get wagmi account (EVM)
    const { address: evmAddress, isConnected: isEvmConnected } = useAccount();

    // Get AppKit account (works for both EVM and Solana)
    const { address: appKitAddress, isConnected: isAppKitConnected } =
        useAppKitAccount();

    // Get current network to determine chain type
    const { chainId } = useAppKitNetwork();

    // Solana chain IDs in AppKit
    const SOLANA_MAINNET_ID = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
    const SOLANA_DEVNET_ID = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1";

    const isSolanaChain =
        chainId === SOLANA_MAINNET_ID || chainId === SOLANA_DEVNET_ID;

    // Determine wallet type
    let walletType: WalletType = null;
    let address: string | null = null;

    if (isAppKitConnected && appKitAddress) {
        if (isSolanaChain) {
            walletType = "solana";
            address = appKitAddress;
        } else if (isEvmConnected && evmAddress) {
            walletType = "evm";
            address = evmAddress;
        } else {
            // Fallback - check address format
            // Solana addresses are base58 encoded, ~44 chars, no 0x prefix
            // EVM addresses start with 0x and are 42 chars
            if (appKitAddress.startsWith("0x")) {
                walletType = "evm";
            } else {
                walletType = "solana";
            }
            address = appKitAddress;
        }
    }

    return {
        walletType,
        address,
        isConnected: isAppKitConnected,
        isEvm: walletType === "evm",
        isSolana: walletType === "solana",
        // Original wagmi values for EVM-specific features
        evmAddress: isEvmConnected ? evmAddress : null,
    };
}

// Utility to check if an address is Solana format
export function isSolanaAddress(address: string): boolean {
    // Solana addresses are base58 encoded, typically 32-44 characters
    // They don't start with 0x
    if (!address || address.startsWith("0x")) return false;
    // Basic base58 character check
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return base58Regex.test(address);
}

// Utility to check if an address is EVM format
export function isEvmAddress(address: string): boolean {
    if (!address) return false;
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}




