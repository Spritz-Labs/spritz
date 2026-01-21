// Supported chains for wallet balance display
// RPC URLs are managed centrally in src/lib/rpc.ts (uses dRPC if configured)
export type SupportedChain = {
    id: number;
    name: string;
    network: string; // The Graph API network identifier
    symbol: string;
    icon: string;
    color: string;
    explorerUrl: string;
};

export const SUPPORTED_CHAINS: Record<string, SupportedChain> = {
    ethereum: {
        id: 1,
        name: "Ethereum",
        network: "mainnet",
        symbol: "ETH",
        icon: "🔷",
        color: "#627EEA",
        explorerUrl: "https://etherscan.io",
    },
    bsc: {
        id: 56,
        name: "BNB Chain",
        network: "bsc",
        symbol: "BNB",
        icon: "🔶",
        color: "#F3BA2F",
        explorerUrl: "https://bscscan.com",
    },
    base: {
        id: 8453,
        name: "Base",
        network: "base",
        symbol: "ETH",
        icon: "🔵",
        color: "#0052FF",
        explorerUrl: "https://basescan.org",
    },
    unichain: {
        id: 130,
        name: "Unichain",
        network: "unichain",
        symbol: "ETH",
        icon: "🦄",
        color: "#FF007A",
        explorerUrl: "https://unichain.blockscout.com",
    },
    arbitrum: {
        id: 42161,
        name: "Arbitrum",
        network: "arbitrum-one",
        symbol: "ETH",
        icon: "⬡",
        color: "#28A0F0",
        explorerUrl: "https://arbiscan.io",
    },
    optimism: {
        id: 10,
        name: "Optimism",
        network: "optimism",
        symbol: "ETH",
        icon: "🔴",
        color: "#FF0420",
        explorerUrl: "https://optimistic.etherscan.io",
    },
    polygon: {
        id: 137,
        name: "Polygon",
        network: "polygon",
        symbol: "MATIC",
        icon: "🟣",
        color: "#8247E5",
        explorerUrl: "https://polygonscan.com",
    },
    avalanche: {
        id: 43114,
        name: "Avalanche",
        network: "avalanche",
        symbol: "AVAX",
        icon: "🔺",
        color: "#E84142",
        explorerUrl: "https://snowtrace.io",
    },
};

export const CHAIN_LIST = Object.values(SUPPORTED_CHAINS);

// Chains enabled for sending (Safe wallet support)
export const SEND_ENABLED_CHAIN_IDS = [
    1,      // Ethereum (user pays USDC for gas)
    8453,   // Base (sponsored)
    42161,  // Arbitrum (sponsored)
    10,     // Optimism (sponsored)
    137,    // Polygon (sponsored)
    56,     // BNB Chain (sponsored)
    130,    // Unichain (sponsored)
    43114,  // Avalanche (sponsored)
];

// Check if a chain supports sending
export function isSendEnabledChain(chainId: number): boolean {
    return SEND_ENABLED_CHAIN_IDS.includes(chainId);
}

// Get chain by ID
export function getChainById(id: number): SupportedChain | undefined {
    return CHAIN_LIST.find((chain) => chain.id === id);
}

// Get chain by network name
export function getChainByNetwork(network: string): SupportedChain | undefined {
    return CHAIN_LIST.find((chain) => chain.network === network);
}
