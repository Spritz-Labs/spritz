"use client";

import { createStorage, http } from "wagmi";
import { mainnet, sepolia, baseSepolia, base, arbitrum, optimism, polygon, avalanche } from "wagmi/chains";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";

// Get projectId from environment
export const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
    console.warn(
        "WalletConnect Project ID not set. Wallet connection will be disabled."
    );
}

// EVM Networks - includes all networks with USDC support for scheduling payments
export const evmNetworks = [mainnet, sepolia, base, baseSepolia, arbitrum, optimism, polygon, avalanche];

// Custom localStorage wrapper for PWA persistence
const localStorageWrapper = {
    getItem: (key: string) => {
        if (typeof window === "undefined") return null;
        return window.localStorage.getItem(key);
    },
    setItem: (key: string, value: string) => {
        if (typeof window === "undefined") return;
        window.localStorage.setItem(key, value);
    },
    removeItem: (key: string) => {
        if (typeof window === "undefined") return;
        window.localStorage.removeItem(key);
    },
};

// Create wagmiAdapter for EVM chains with localStorage for PWA session persistence
export const wagmiAdapter = new WagmiAdapter({
    storage: createStorage({
        storage: localStorageWrapper,
    }),
    ssr: true,
    projectId: projectId || "demo",
    networks: evmNetworks,
    transports: {
        [mainnet.id]: http(),
        [sepolia.id]: http(),
        [base.id]: http(),
        [baseSepolia.id]: http(),
        [arbitrum.id]: http(),
        [optimism.id]: http(),
        [polygon.id]: http(),
        [avalanche.id]: http(),
    },
});

export const config = wagmiAdapter.wagmiConfig;
