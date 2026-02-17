"use client";

import React, { type ReactNode } from "react";
import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { WagmiProvider, type State } from "wagmi";
import { mainnet, sepolia, baseSepolia, base } from "@reown/appkit/networks";
import { arbitrum, optimism, polygon, avalanche } from "wagmi/chains";
import { createAppKit } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { wagmiAdapter, projectId } from "@/config/wagmi";

// Suppress specific errors at the window level before they reach the Next.js dev overlay
if (typeof window !== "undefined") {
    const suppressedPatterns = [
        'Query data cannot be undefined',
        'auth-deeplink',
        'DialogContent',
        'DialogTitle',
        'aria-describedby',
        'VisuallyHidden',
    ];
    
    const shouldSuppress = (message: string) => {
        return suppressedPatterns.some(pattern => message.includes(pattern));
    };
    
    // Suppress unhandled rejections
    window.addEventListener('unhandledrejection', (event) => {
        const message = event.reason?.message || String(event.reason);
        if (shouldSuppress(message)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
    }, true);
    
    // Suppress error events
    window.addEventListener('error', (event) => {
        const message = event.message || event.error?.message || '';
        if (shouldSuppress(message)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return false;
        }
    }, true);
    
    // Patch console.error to suppress these warnings
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
        const message = args.map(arg => String(arg)).join(' ');
        if (shouldSuppress(message)) {
            return;
        }
        originalConsoleError.apply(console, args);
    };
    
    // Patch console.warn for the aria-describedby warning
    const originalConsoleWarn = console.warn;
    console.warn = (...args: unknown[]) => {
        const message = args.map(arg => String(arg)).join(' ');
        if (shouldSuppress(message)) {
            return;
        }
        originalConsoleWarn.apply(console, args);
    };
}

// Setup queryClient with default options to handle Alien SDK's React Query usage
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
            refetchOnWindowFocus: false,
            // Suppress errors for queries that return undefined (like Alien SDK's auth-deeplink)
            throwOnError: (error) => {
                // Never throw for undefined data errors
                if (error?.message?.includes('Query data cannot be undefined')) {
                    return false;
                }
                return false; // Also suppress other query errors from throwing to React
            },
            // Stale time to reduce refetches
            staleTime: 1000 * 60, // 1 minute
        },
        mutations: {
            throwOnError: false,
        },
    },
    queryCache: new QueryCache({
        onError: (error: Error, query) => {
            // Silently ignore the auth-deeplink undefined error
            if (
                error?.message?.includes('Query data cannot be undefined') ||
                query.queryKey?.[0] === 'auth-deeplink'
            ) {
                return; // Swallow the error
            }
            // Log other errors normally
            console.error('[QueryCache Error]', error);
        },
    }),
});

// Pre-populate the auth-deeplink query to prevent "Query data cannot be undefined" error
// The Alien SDK creates this query but returns undefined, which violates React Query v5's requirements
// By pre-setting the data to null, we prevent the validation error
queryClient.setQueryData(["auth-deeplink"], null);

// Also set defaults so any subsequent invalidation/refetch returns null instead of undefined
queryClient.setQueryDefaults(["auth-deeplink"], {
    queryFn: () => null,
    staleTime: Infinity,
    gcTime: Infinity, // Keep in cache forever (was cacheTime in v4)
    retry: false,
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
            // Include all EVM chains that Wagmi uses so connection chain stays in sync (avoids "connector chain does not match connection's chain" when wallet is on e.g. Optimism)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            networks: [
                mainnet,
                sepolia,
                base,
                baseSepolia,
                arbitrum,
                optimism,
                polygon,
                avalanche,
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
