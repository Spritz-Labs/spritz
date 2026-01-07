"use client";

import React, { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, type State } from "wagmi";
import { mainnet, sepolia, baseSepolia, base } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { wagmiAdapter, projectId } from "@/config/wagmi";

// Setup queryClient with default options
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
            refetchOnWindowFocus: false,
            // Suppress errors for queries that return undefined (like Alien SDK's auth-deeplink)
            throwOnError: false,
            // Return null for queries that would return undefined
            placeholderData: (previousValue: any) => previousValue ?? null,
            // Ensure queries always return a value, even if undefined
            gcTime: 0, // Don't cache queries that might return undefined
        },
    },
});

// Set up metadata
const metadata = {
    name: "Spritz",
    description: "Voice calls and chat over Ethereum & Solana",
    url:
        typeof window !== "undefined"
            ? window.location.origin
            : "https://localhost:3000",
    icons: ["https://avatars.githubusercontent.com/u/179229932"],
};

// Solana networks with Helius RPC
const heliusApiKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY || "";
const heliusMainnet = heliusApiKey
    ? `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
    : "https://api.mainnet-beta.solana.com";
const heliusDevnet = heliusApiKey
    ? `https://devnet.helius-rpc.com/?api-key=${heliusApiKey}`
    : "https://api.devnet.solana.com";

const solanaMainnet = {
    id: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
    name: "Solana",
    network: "solana-mainnet",
    nativeCurrency: { name: "Solana", symbol: "SOL", decimals: 9 },
    rpcUrls: { default: { http: [heliusMainnet] } },
    blockExplorers: { default: { name: "Solscan", url: "https://solscan.io" } },
    testnet: false,
    chainNamespace: "solana" as const,
    caipNetworkId: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
};

const solanaDevnet = {
    id: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    name: "Solana Devnet",
    network: "solana-devnet",
    nativeCurrency: { name: "Solana", symbol: "SOL", decimals: 9 },
    rpcUrls: { default: { http: [heliusDevnet] } },
    blockExplorers: {
        default: { name: "Solscan", url: "https://solscan.io/?cluster=devnet" },
    },
    testnet: true,
    chainNamespace: "solana" as const,
    caipNetworkId: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
};

// Initialize AppKit immediately on client side (before component renders)
if (typeof window !== "undefined") {
    const hasValidProjectId =
        projectId && typeof projectId === "string" && projectId.length > 0;

    if (hasValidProjectId) {
        // Suppress console errors for known issues
        const originalConsoleError = console.error;
        console.error = (...args) => {
            const msg = args[0]?.toString?.() || "";
            if (
                msg.includes("No project ID is configured") ||
                msg.includes("Endpoint URL must start with")
            )
                return;
            originalConsoleError.apply(console, args);
        };

        // Create Solana adapter
        const solanaAdapter = new SolanaAdapter();

        // Check if running as PWA
        const isPWA = typeof window !== "undefined" && (
            window.matchMedia("(display-mode: standalone)").matches ||
            // @ts-expect-error - iOS Safari specific
            window.navigator.standalone === true
        );

        // Initialize with both EVM and Solana
        createAppKit({
            adapters: [wagmiAdapter, solanaAdapter],
            projectId: projectId!,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            networks: [
                mainnet,
                sepolia,
                base,
                baseSepolia,
                solanaMainnet,
                solanaDevnet,
            ] as any,
            metadata,
            features: {
                analytics: true,
            },
            themeMode: "dark",
            themeVariables: {
                "--w3m-accent": "#8b5cf6",
                "--w3m-border-radius-master": "2px",
            },
            // Feature Rainbow and MetaMask at top
            featuredWalletIds: [
                "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // Rainbow
                "c03dfee351b6fcc421b4494ea33b9d4b5a6efac8f435ed0df3a402880992c61b", // MetaMask
            ],
            // Don't limit wallets with includeWalletIds - this allows search to find all wallets
            // Featured wallets will still appear at the top, and EIP-6963 will discover available wallets
            // Optimize wallet discovery and social login performance
            enableEIP6963: true, // Use EIP-6963 for faster wallet discovery
            enableCoinbase: true,
            // Note: Social logins are disabled via CSS due to performance issues
            // The CSS in globals.css hides all social login elements
        });

        setTimeout(() => {
            console.error = originalConsoleError;
        }, 100);
    }
}

export function Web3Provider({
    children,
    initialState,
}: {
    children: ReactNode;
    initialState?: State;
}) {
    // Render children regardless of mount state for SSR
    return (
        <WagmiProvider
            config={wagmiAdapter.wagmiConfig}
            initialState={initialState}
        >
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        </WagmiProvider>
    );
}
