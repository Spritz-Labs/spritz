/**
 * Centralized RPC configuration using dRPC
 * 
 * dRPC provides reliable, load-balanced RPC endpoints.
 * API key is stored in environment variables.
 */

// Chain name mapping for dRPC URLs
const DRPC_CHAIN_NAMES: Record<number, string> = {
    1: "ethereum",
    8453: "base",
    42161: "arbitrum",
    10: "optimism",
    137: "polygon",
    56: "bsc",
    43114: "avalanche",
    130: "unichain", // May not be supported by dRPC, will fallback
};

// Fallback RPCs for chains not supported by dRPC or when API key is missing
const FALLBACK_RPCS: Record<number, string> = {
    1: "https://eth.llamarpc.com",
    8453: "https://base.llamarpc.com",
    42161: "https://arb1.arbitrum.io/rpc",
    10: "https://mainnet.optimism.io",
    137: "https://polygon-rpc.com",
    56: "https://bsc-dataseed.binance.org",
    43114: "https://api.avax.network/ext/bc/C/rpc",
    130: "https://mainnet.unichain.org",
};

/**
 * Get the RPC URL for a specific chain
 * Uses dRPC if API key is available, otherwise falls back to public RPCs
 * 
 * dRPC URL format: https://lb.drpc.org/ogrpc?network={chain}&dkey={key}
 */
export function getRpcUrl(chainId: number): string {
    // Try to get dRPC API key (works in both server and client)
    const apiKey = process.env.NEXT_PUBLIC_DRPC_API_KEY || process.env.DRPC_API_KEY;
    
    if (apiKey && DRPC_CHAIN_NAMES[chainId]) {
        const chainName = DRPC_CHAIN_NAMES[chainId];
        // dRPC load-balanced endpoint format: https://lb.drpc.org/ogrpc?network={chain}&dkey={key}
        return `https://lb.drpc.org/ogrpc?network=${chainName}&dkey=${apiKey}`;
    }
    
    // Fallback to public RPCs
    return FALLBACK_RPCS[chainId] || FALLBACK_RPCS[1];
}

/**
 * Get all RPC URLs as a record
 * Useful for configurations that need the full map
 */
export function getAllRpcUrls(): Record<number, string> {
    return {
        1: getRpcUrl(1),
        8453: getRpcUrl(8453),
        42161: getRpcUrl(42161),
        10: getRpcUrl(10),
        137: getRpcUrl(137),
        56: getRpcUrl(56),
        43114: getRpcUrl(43114),
        130: getRpcUrl(130),
    };
}

/**
 * Check if dRPC is configured
 */
export function isDrpcConfigured(): boolean {
    return !!(process.env.NEXT_PUBLIC_DRPC_API_KEY || process.env.DRPC_API_KEY);
}
