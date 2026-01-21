/**
 * The Graph Token API - Balance fetching service
 * 
 * Uses The Graph's Token API for fast, indexed balance queries with
 * Blockscout as a fallback for chains not supported by The Graph.
 * 
 * API Docs: https://thegraph.com/docs/en/token-api/
 */

import { getTokenLogo, NATIVE_TOKEN_LOGOS } from "@/config/tokenLogos";

const GRAPH_TOKEN_API_KEY = process.env.GRAPH_TOKEN_API_KEY;
const GRAPH_BALANCES_URL = "https://token-api.thegraph.com/v1/evm/balances";

// Cache for balance data (TTL: 30 seconds)
interface CacheEntry {
    data: TokenBalance[];
    totalUsd: number;
    timestamp: number;
}
const balanceCache = new Map<string, CacheEntry>();
const CACHE_TTL = 30_000; // 30 seconds

// Network names for The Graph Token API
export const GRAPH_NETWORK_NAMES: Record<number, string> = {
    1: "mainnet",
    8453: "base",
    42161: "arbitrum-one",
    10: "optimism",
    137: "polygon",
    56: "bsc",
    43114: "avalanche",
    130: "unichain",
};

// Native token info by chain
export const NATIVE_TOKEN_INFO: Record<number, { symbol: string; name: string; decimals: number }> = {
    1: { symbol: "ETH", name: "Ethereum", decimals: 18 },
    8453: { symbol: "ETH", name: "Ethereum", decimals: 18 },
    42161: { symbol: "ETH", name: "Ethereum", decimals: 18 },
    10: { symbol: "ETH", name: "Ethereum", decimals: 18 },
    137: { symbol: "MATIC", name: "Polygon", decimals: 18 },
    56: { symbol: "BNB", name: "BNB", decimals: 18 },
    43114: { symbol: "AVAX", name: "Avalanche", decimals: 18 },
    130: { symbol: "ETH", name: "Ethereum", decimals: 18 },
};

// Trusted tokens by chain (lowercase addresses)
// Only show these tokens to filter out scam/spam tokens
export const TRUSTED_TOKENS: Record<number, Set<string>> = {
    1: new Set([
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
        "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
        "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
        "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
        "0x514910771af9ca656af840dff83e8264ecf986ca", // LINK
        "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", // UNI
        "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", // AAVE
        "0xae7ab96520de3a18e5e111b5eaab095312d7fe84", // stETH
        "0xbe9895146f7af43049ca1c1ae358b0541ea49704", // cbETH
        "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0", // wstETH
    ]),
    8453: new Set([
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
        "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI
        "0x4200000000000000000000000000000000000006", // WETH
        "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22", // cbETH
        "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452", // wstETH
    ]),
    42161: new Set([
        "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // USDC
        "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT
        "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", // DAI
        "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", // WBTC
        "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
        "0x912ce59144191c1204e64559fe8253a0e49e6548", // ARB
    ]),
    10: new Set([
        "0x0b2c639c533813f4aa9d7837caf62653d097ff85", // USDC
        "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", // USDT
        "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", // DAI
        "0x4200000000000000000000000000000000000006", // WETH
        "0x4200000000000000000000000000000000000042", // OP
    ]),
    137: new Set([
        "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // USDC
        "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT
        "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", // DAI
        "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
        "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", // WMATIC
    ]),
    56: new Set([
        "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC
        "0x55d398326f99059ff775485246999027b3197955", // USDT
        "0x2170ed0880ac9a755fd29b2688956bd959f933f8", // ETH
        "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", // WBNB
    ]),
    43114: new Set([
        "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // USDC
        "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", // USDT
        "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab", // WETH
        "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7", // WAVAX
    ]),
};

// Blockscout URLs for fallback
export const BLOCKSCOUT_URLS: Record<number, string> = {
    1: "https://eth.blockscout.com",
    8453: "https://base.blockscout.com",
    42161: "https://arbitrum.blockscout.com",
    10: "https://optimism.blockscout.com",
    137: "https://polygon.blockscout.com",
    56: "https://bsc.blockscout.com",
    43114: "https://avax.blockscout.com",
    130: "https://unichain.blockscout.com",
};

// RPC URLs for native balance fallback
export const RPC_URLS: Record<number, string> = {
    1: "https://eth.llamarpc.com",
    8453: "https://mainnet.base.org",
    42161: "https://arb1.arbitrum.io/rpc",
    10: "https://mainnet.optimism.io",
    137: "https://polygon-rpc.com",
    56: "https://bsc-dataseed.binance.org",
    43114: "https://api.avax.network/ext/bc/C/rpc",
    130: "https://mainnet.unichain.org",
};

export type TokenBalance = {
    contractAddress: string;
    symbol: string;
    name: string;
    decimals: number;
    balance: string;
    balanceFormatted: string;
    balanceUsd: number | null;
    tokenType: "native" | "erc20";
    logoUrl?: string;
};

// The Graph Token API response types
interface GraphBalance {
    contract: string;
    symbol: string;
    name: string;
    decimals: number;
    amount: string;
    value: number | null; // USD value
    network: string;
}

/**
 * Fetch balances for an address on a specific chain using The Graph Token API
 * Falls back to Blockscout if Graph API fails
 */
export async function fetchBalances(
    address: string,
    chainId: number,
    networkName?: string
): Promise<{ balances: TokenBalance[]; totalUsd: number; source: "graph" | "blockscout" | "rpc" }> {
    const cacheKey = `${address.toLowerCase()}-${chainId}`;
    const cached = balanceCache.get(cacheKey);
    
    // Return cached data if still valid
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[GraphTokenAPI] Cache hit for ${address.slice(0, 10)}... on chain ${chainId}`);
        return { balances: cached.data, totalUsd: cached.totalUsd, source: "graph" };
    }

    const network = networkName || GRAPH_NETWORK_NAMES[chainId];
    
    // Try The Graph Token API first
    if (GRAPH_TOKEN_API_KEY && network) {
        try {
            const result = await fetchFromGraph(address, chainId, network);
            if (result.balances.length > 0 || result.totalUsd > 0) {
                // Cache the result
                balanceCache.set(cacheKey, {
                    data: result.balances,
                    totalUsd: result.totalUsd,
                    timestamp: Date.now(),
                });
                return { ...result, source: "graph" };
            }
        } catch (error) {
            console.error(`[GraphTokenAPI] Graph API failed for chain ${chainId}:`, error);
        }
    }

    // Fallback to Blockscout
    try {
        const result = await fetchFromBlockscout(address, chainId);
        if (result.balances.length > 0 || result.totalUsd > 0) {
            balanceCache.set(cacheKey, {
                data: result.balances,
                totalUsd: result.totalUsd,
                timestamp: Date.now(),
            });
            return { ...result, source: "blockscout" };
        }
    } catch (error) {
        console.error(`[GraphTokenAPI] Blockscout failed for chain ${chainId}:`, error);
    }

    // Final fallback: RPC for native balance only
    try {
        const result = await fetchNativeBalanceRpc(address, chainId);
        balanceCache.set(cacheKey, {
            data: result.balances,
            totalUsd: result.totalUsd,
            timestamp: Date.now(),
        });
        return { ...result, source: "rpc" };
    } catch (error) {
        console.error(`[GraphTokenAPI] RPC fallback failed for chain ${chainId}:`, error);
    }

    return { balances: [], totalUsd: 0, source: "rpc" };
}

/**
 * Fetch balances from The Graph Token API
 */
async function fetchFromGraph(
    address: string,
    chainId: number,
    network: string
): Promise<{ balances: TokenBalance[]; totalUsd: number }> {
    console.log(`[GraphTokenAPI] Fetching from Graph for ${address.slice(0, 10)}... on ${network}`);
    
    const response = await fetch(
        `${GRAPH_BALANCES_URL}?network=${network}&address=${address}`,
        {
            headers: {
                "Authorization": `Bearer ${GRAPH_TOKEN_API_KEY}`,
                "Accept": "application/json",
            },
            cache: "no-store",
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Graph API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const graphBalances: GraphBalance[] = data.data || [];
    
    console.log(`[GraphTokenAPI] Graph returned ${graphBalances.length} balances`);

    const balances: TokenBalance[] = [];
    let totalUsd = 0;
    const trustedSet = TRUSTED_TOKENS[chainId] || new Set();
    const nativeInfo = NATIVE_TOKEN_INFO[chainId] || { symbol: "ETH", name: "Native", decimals: 18 };

    for (const item of graphBalances) {
        const isNative = item.contract.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
        
        // Filter untrusted tokens (except native)
        if (!isNative && !trustedSet.has(item.contract.toLowerCase())) {
            continue;
        }

        const decimals = item.decimals || 18;
        const balanceFormatted = Number(BigInt(item.amount)) / Math.pow(10, decimals);
        
        // Skip zero balances
        if (balanceFormatted <= 0) continue;

        // Calculate USD value
        let balanceUsd = item.value;
        if (!balanceUsd) {
            // Fallback for stablecoins
            const stablecoins = ["USDC", "USDT", "DAI", "BUSD"];
            if (stablecoins.includes(item.symbol?.toUpperCase())) {
                balanceUsd = balanceFormatted;
            }
        }

        const tokenBalance: TokenBalance = {
            contractAddress: isNative ? "native" : item.contract,
            symbol: isNative ? nativeInfo.symbol : item.symbol,
            name: isNative ? nativeInfo.name : item.name,
            decimals,
            balance: item.amount,
            balanceFormatted: balanceFormatted.toString(),
            balanceUsd,
            tokenType: isNative ? "native" : "erc20",
            logoUrl: isNative 
                ? NATIVE_TOKEN_LOGOS[nativeInfo.symbol]
                : getTokenLogo(item.symbol, item.contract, network),
        };

        balances.push(tokenBalance);

        if (balanceUsd) {
            totalUsd += balanceUsd;
        }
    }

    // Sort: native first, then by USD value
    balances.sort((a, b) => {
        if (a.tokenType === "native" && b.tokenType !== "native") return -1;
        if (b.tokenType === "native" && a.tokenType !== "native") return 1;
        return (b.balanceUsd || 0) - (a.balanceUsd || 0);
    });

    console.log(`[GraphTokenAPI] Processed ${balances.length} balances, total: $${totalUsd.toFixed(2)}`);
    return { balances, totalUsd };
}

/**
 * Fetch balances from Blockscout API
 */
async function fetchFromBlockscout(
    address: string,
    chainId: number
): Promise<{ balances: TokenBalance[]; totalUsd: number }> {
    const blockscoutUrl = BLOCKSCOUT_URLS[chainId];
    if (!blockscoutUrl) {
        throw new Error(`No Blockscout URL for chain ${chainId}`);
    }

    console.log(`[GraphTokenAPI] Fetching from Blockscout for ${address.slice(0, 10)}... on chain ${chainId}`);

    const [addressResponse, tokensResponse] = await Promise.all([
        fetch(`${blockscoutUrl}/api/v2/addresses/${address}`, {
            headers: { Accept: "application/json" },
            cache: "no-store",
        }),
        fetch(`${blockscoutUrl}/api/v2/addresses/${address}/token-balances`, {
            headers: { Accept: "application/json" },
            cache: "no-store",
        }),
    ]);

    const balances: TokenBalance[] = [];
    let totalUsd = 0;
    const nativeInfo = NATIVE_TOKEN_INFO[chainId] || { symbol: "ETH", name: "Native", decimals: 18 };
    const trustedSet = TRUSTED_TOKENS[chainId] || new Set();

    // Process native balance
    if (addressResponse.ok) {
        const addressData = await addressResponse.json();
        const rawBalance = addressData.coin_balance || "0";
        const balanceWei = BigInt(rawBalance);

        if (balanceWei > BigInt(0)) {
            const balanceFormatted = Number(balanceWei) / 1e18;
            const exchangeRate = addressData.exchange_rate ? parseFloat(addressData.exchange_rate) : null;
            const balanceUsd = exchangeRate ? balanceFormatted * exchangeRate : null;

            balances.push({
                contractAddress: "native",
                symbol: nativeInfo.symbol,
                name: nativeInfo.name,
                decimals: 18,
                balance: rawBalance,
                balanceFormatted: balanceFormatted.toString(),
                balanceUsd,
                tokenType: "native",
                logoUrl: NATIVE_TOKEN_LOGOS[nativeInfo.symbol],
            });

            if (balanceUsd) {
                totalUsd += balanceUsd;
            }
        }
    }

    // Process token balances
    if (tokensResponse.ok) {
        const tokensData = await tokensResponse.json();

        for (const tokenData of tokensData) {
            const token = tokenData.token;

            // Skip non-ERC20 tokens
            if (token.type !== "ERC-20") continue;

            // Skip untrusted tokens
            if (!trustedSet.has(token.address_hash.toLowerCase())) continue;

            const rawBalance = tokenData.value || "0";
            const decimals = parseInt(token.decimals) || 18;
            const balanceFormatted = Number(BigInt(rawBalance)) / Math.pow(10, decimals);

            // Skip zero balances
            if (balanceFormatted <= 0) continue;

            // Calculate USD value
            let balanceUsd: number | null = null;
            if (token.exchange_rate) {
                balanceUsd = balanceFormatted * parseFloat(token.exchange_rate);
            } else {
                const stablecoins = ["USDC", "USDT", "DAI", "BUSD"];
                if (stablecoins.includes(token.symbol.toUpperCase())) {
                    balanceUsd = balanceFormatted;
                }
            }

            balances.push({
                contractAddress: token.address_hash,
                symbol: token.symbol,
                name: token.name,
                decimals,
                balance: rawBalance,
                balanceFormatted: balanceFormatted.toString(),
                balanceUsd,
                tokenType: "erc20",
                logoUrl: token.icon_url || getTokenLogo(token.symbol, token.address_hash, ""),
            });

            if (balanceUsd) {
                totalUsd += balanceUsd;
            }
        }
    }

    // Sort: native first, then by USD value
    balances.sort((a, b) => {
        if (a.tokenType === "native" && b.tokenType !== "native") return -1;
        if (b.tokenType === "native" && a.tokenType !== "native") return 1;
        return (b.balanceUsd || 0) - (a.balanceUsd || 0);
    });

    console.log(`[GraphTokenAPI] Blockscout: ${balances.length} balances, total: $${totalUsd.toFixed(2)}`);
    return { balances, totalUsd };
}

/**
 * Fetch native token balance via RPC (last resort fallback)
 */
async function fetchNativeBalanceRpc(
    address: string,
    chainId: number
): Promise<{ balances: TokenBalance[]; totalUsd: number }> {
    const rpcUrl = RPC_URLS[chainId];
    if (!rpcUrl) {
        throw new Error(`No RPC URL for chain ${chainId}`);
    }

    console.log(`[GraphTokenAPI] Fetching native balance via RPC for ${address.slice(0, 10)}... on chain ${chainId}`);

    const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_getBalance",
            params: [address, "latest"],
            id: 1,
        }),
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`RPC error: ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error.message);
    }

    const rawBalance = BigInt(data.result || "0").toString();
    const balanceFormatted = Number(BigInt(rawBalance)) / 1e18;
    const nativeInfo = NATIVE_TOKEN_INFO[chainId] || { symbol: "ETH", name: "Native", decimals: 18 };

    const balances: TokenBalance[] = [];
    let totalUsd = 0;

    if (balanceFormatted > 0) {
        // Note: No USD price available via RPC
        balances.push({
            contractAddress: "native",
            symbol: nativeInfo.symbol,
            name: nativeInfo.name,
            decimals: 18,
            balance: rawBalance,
            balanceFormatted: balanceFormatted.toString(),
            balanceUsd: null,
            tokenType: "native",
            logoUrl: NATIVE_TOKEN_LOGOS[nativeInfo.symbol],
        });
    }

    console.log(`[GraphTokenAPI] RPC fallback: ${balanceFormatted} ${nativeInfo.symbol}`);
    return { balances, totalUsd };
}

/**
 * Clear cache for a specific address/chain (useful after transactions)
 */
export function clearBalanceCache(address?: string, chainId?: number): void {
    if (address && chainId) {
        const cacheKey = `${address.toLowerCase()}-${chainId}`;
        balanceCache.delete(cacheKey);
    } else if (address) {
        // Clear all chains for this address
        for (const key of balanceCache.keys()) {
            if (key.startsWith(address.toLowerCase())) {
                balanceCache.delete(key);
            }
        }
    } else {
        // Clear entire cache
        balanceCache.clear();
    }
}
