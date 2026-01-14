import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { SUPPORTED_CHAINS, type SupportedChain } from "@/config/chains";
import { getTokenLogo, NATIVE_TOKEN_LOGOS } from "@/config/tokenLogos";

// Blockscout API endpoints for each chain
const BLOCKSCOUT_URLS: Record<string, string> = {
    ethereum: "https://eth.blockscout.com",
    base: "https://base.blockscout.com",
    "arbitrum-one": "https://arbitrum.blockscout.com",
    optimism: "https://optimism.blockscout.com",
    polygon: "https://polygon.blockscout.com",
    bsc: "https://bsc.blockscout.com",
    avalanche: "https://avax.blockscout.com",
    // Unichain doesn't have Blockscout yet - will use RPC fallback
};

// Whitelist of trusted tokens by contract address (lowercase)
// Only tokens in this list will be displayed to avoid scam/spam tokens
const TRUSTED_TOKENS: Record<string, Set<string>> = {
    // Ethereum Mainnet
    ethereum: new Set([
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
    // Base
    base: new Set([
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
        "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI
        "0x4200000000000000000000000000000000000006", // WETH
        "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22", // cbETH
        "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452", // wstETH
    ]),
    // Arbitrum
    "arbitrum-one": new Set([
        "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // USDC
        "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT
        "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", // DAI
        "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f", // WBTC
        "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
        "0x912ce59144191c1204e64559fe8253a0e49e6548", // ARB
    ]),
    // Optimism
    optimism: new Set([
        "0x0b2c639c533813f4aa9d7837caf62653d097ff85", // USDC
        "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", // USDT
        "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", // DAI
        "0x4200000000000000000000000000000000000006", // WETH
        "0x4200000000000000000000000000000000000042", // OP
    ]),
    // Polygon
    polygon: new Set([
        "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // USDC
        "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT
        "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", // DAI
        "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
        "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", // WMATIC
    ]),
    // BNB Chain
    bsc: new Set([
        "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC
        "0x55d398326f99059ff775485246999027b3197955", // USDT
        "0x2170ed0880ac9a755fd29b2688956bd959f933f8", // ETH
        "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", // WBNB
    ]),
    // Avalanche
    avalanche: new Set([
        "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // USDC
        "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", // USDT
        "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab", // WETH
        "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7", // WAVAX
    ]),
};

// Check if a token is trusted
function isTrustedToken(network: string, contractAddress: string): boolean {
    const trustedSet = TRUSTED_TOKENS[network];
    if (!trustedSet) return false;
    return trustedSet.has(contractAddress.toLowerCase());
}

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

export type ChainBalance = {
    chain: SupportedChain;
    nativeBalance: TokenBalance | null;
    tokens: TokenBalance[];
    totalUsd: number;
    error?: string;
};

export type WalletBalancesResponse = {
    address: string;
    balances: ChainBalance[];
    totalUsd: number;
    lastUpdated: string;
};

// Blockscout API response types
interface BlockscoutAddressResponse {
    coin_balance: string | null;
    exchange_rate: string | null;
}

interface BlockscoutTokenBalance {
    token: {
        address_hash: string;
        decimals: string;
        exchange_rate: string | null;
        icon_url: string | null;
        name: string;
        symbol: string;
        type: string;
    };
    value: string;
}

// Fetch balances using Blockscout API
async function fetchChainBalancesBlockscout(
    address: string,
    chain: SupportedChain
): Promise<ChainBalance> {
    const blockscoutUrl = BLOCKSCOUT_URLS[chain.network];
    
    if (!blockscoutUrl) {
        // Fallback to RPC for chains without Blockscout
        return fetchChainBalancesRpc(address, chain);
    }

    try {
        // Fetch native balance and token balances in parallel
        const [addressResponse, tokensResponse] = await Promise.all([
            fetch(`${blockscoutUrl}/api/v2/addresses/${address}`, {
                headers: { Accept: "application/json" },
                cache: "no-store", // Always fetch fresh data
            }),
            fetch(`${blockscoutUrl}/api/v2/addresses/${address}/token-balances`, {
                headers: { Accept: "application/json" },
                cache: "no-store",
            }),
        ]);

        let nativeBalance: TokenBalance | null = null;
        const tokens: TokenBalance[] = [];
        let totalUsd = 0;

        // Process native balance
        if (addressResponse.ok) {
            const addressData: BlockscoutAddressResponse = await addressResponse.json();
            const rawBalance = addressData.coin_balance || "0";
            const balanceWei = BigInt(rawBalance);
            
            if (balanceWei > BigInt(0)) {
                const balanceFormatted = Number(balanceWei) / 1e18;
                const exchangeRate = addressData.exchange_rate ? parseFloat(addressData.exchange_rate) : null;
                const balanceUsd = exchangeRate ? balanceFormatted * exchangeRate : null;

                nativeBalance = {
                    contractAddress: "native",
                    symbol: chain.symbol,
                    name: chain.name,
                    decimals: 18,
                    balance: rawBalance,
                    balanceFormatted: balanceFormatted.toString(),
                    balanceUsd,
                    tokenType: "native",
                    logoUrl: NATIVE_TOKEN_LOGOS[chain.symbol],
                };

                if (balanceUsd) {
                    totalUsd += balanceUsd;
                }
            }
        } else {
            console.error(`[Wallet] Blockscout ${chain.name} address error:`, addressResponse.status);
        }

        // Process token balances
        if (tokensResponse.ok) {
            const tokensData: BlockscoutTokenBalance[] = await tokensResponse.json();
            
            for (const tokenData of tokensData) {
                const token = tokenData.token;
                
                // Skip non-ERC20 tokens
                if (token.type !== "ERC-20") continue;
                
                // Skip untrusted tokens (scam filter)
                if (!isTrustedToken(chain.network, token.address_hash)) {
                    continue;
                }

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
                    // Fallback for stablecoins
                    const stablecoins = ["USDC", "USDT", "DAI", "BUSD"];
                    if (stablecoins.includes(token.symbol.toUpperCase())) {
                        balanceUsd = balanceFormatted;
                    }
                }

                tokens.push({
                    contractAddress: token.address_hash,
                    symbol: token.symbol,
                    name: token.name,
                    decimals,
                    balance: rawBalance,
                    balanceFormatted: balanceFormatted.toString(),
                    balanceUsd,
                    tokenType: "erc20",
                    logoUrl: token.icon_url || getTokenLogo(token.symbol, token.address_hash, chain.network),
                });

                if (balanceUsd) {
                    totalUsd += balanceUsd;
                }
            }
        } else {
            console.error(`[Wallet] Blockscout ${chain.name} tokens error:`, tokensResponse.status);
        }

        // Sort tokens by USD value
        tokens.sort((a, b) => (b.balanceUsd || 0) - (a.balanceUsd || 0));

        console.log(`[Wallet] ${chain.name} (Blockscout): $${totalUsd.toFixed(2)} (native: ${nativeBalance?.balanceFormatted || 0} ${chain.symbol}, tokens: ${tokens.length})`);

        return {
            chain,
            nativeBalance,
            tokens,
            totalUsd,
        };
    } catch (error) {
        console.error(`[Wallet] Blockscout error for ${chain.name}:`, error);
        // Fallback to RPC
        return fetchChainBalancesRpc(address, chain);
    }
}

// Fallback: Fetch native balance via RPC (for chains without Blockscout)
async function fetchChainBalancesRpc(
    address: string,
    chain: SupportedChain
): Promise<ChainBalance> {
    try {
        if (!chain.rpcUrl) {
            return {
                chain,
                nativeBalance: null,
                tokens: [],
                totalUsd: 0,
                error: "No RPC URL configured",
            };
        }

        const rpcResponse = await fetch(chain.rpcUrl, {
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

        if (!rpcResponse.ok) {
            throw new Error(`RPC error: ${rpcResponse.status}`);
        }

        const rpcData = await rpcResponse.json();
        if (rpcData.error) {
            throw new Error(rpcData.error.message);
        }

        const rawBalance = BigInt(rpcData.result || "0").toString();
        const balanceFormatted = Number(BigInt(rawBalance)) / 1e18;

        let nativeBalance: TokenBalance | null = null;
        let totalUsd = 0;

        if (balanceFormatted > 0) {
            // Fetch price from CoinGecko for native token
            const balanceUsd = await getNativeTokenPrice(chain.symbol, balanceFormatted);

            nativeBalance = {
                contractAddress: "native",
                symbol: chain.symbol,
                name: chain.name,
                decimals: 18,
                balance: rawBalance,
                balanceFormatted: balanceFormatted.toString(),
                balanceUsd,
                tokenType: "native",
                logoUrl: NATIVE_TOKEN_LOGOS[chain.symbol],
            };

            if (balanceUsd) {
                totalUsd = balanceUsd;
            }
        }

        console.log(`[Wallet] ${chain.name} (RPC): $${totalUsd.toFixed(2)} (native: ${balanceFormatted} ${chain.symbol})`);

        return {
            chain,
            nativeBalance,
            tokens: [], // RPC fallback doesn't fetch tokens
            totalUsd,
        };
    } catch (error) {
        console.error(`[Wallet] RPC error for ${chain.name}:`, error);
        return {
            chain,
            nativeBalance: null,
            tokens: [],
            totalUsd: 0,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

// Native token price cache
const priceCache: Map<string, { price: number; timestamp: number }> = new Map();
const PRICE_CACHE_TTL = 60000; // 1 minute

const COINGECKO_IDS: Record<string, string> = {
    ETH: "ethereum",
    BNB: "binancecoin",
    MATIC: "matic-network",
    AVAX: "avalanche-2",
    UNI: "uniswap", // For Unichain
};

async function getNativeTokenPrice(symbol: string, amount: number): Promise<number | null> {
    const cached = priceCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
        return amount * cached.price;
    }

    const coinId = COINGECKO_IDS[symbol];
    if (!coinId) return null;

    try {
        const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
            { cache: "no-store" }
        );

        if (!response.ok) return null;

        const data = await response.json();
        const price = data[coinId]?.usd;

        if (typeof price === "number") {
            priceCache.set(symbol, { price, timestamp: Date.now() });
            return amount * price;
        }
    } catch (error) {
        console.error(`[Wallet] Error fetching ${symbol} price:`, error);
    }

    return null;
}

// Preferred chain order for display
const CHAIN_DISPLAY_ORDER = [
    "ethereum",
    "base",
    "arbitrum-one",
    "optimism",
    "polygon",
    "bsc",
    "avalanche",
];

// GET /api/wallet/balances
export async function GET(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 }
        );
    }

    const { searchParams } = new URL(request.url);
    const addressParam = searchParams.get("address");

    if (!addressParam) {
        return NextResponse.json(
            { error: "Address required" },
            { status: 400 }
        );
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(addressParam)) {
        return NextResponse.json(
            { error: "Invalid address format" },
            { status: 400 }
        );
    }

    const address = addressParam; // Keep original case for Blockscout

    // Optional: filter to specific chains
    const chainsParam = searchParams.get("chains");
    const requestedChains = chainsParam
        ? chainsParam.split(",").filter(c => c in SUPPORTED_CHAINS)
        : Object.keys(SUPPORTED_CHAINS);

    // Sort chains by preferred display order
    const sortedChains = [...requestedChains].sort((a, b) => {
        const aIndex = CHAIN_DISPLAY_ORDER.indexOf(a);
        const bIndex = CHAIN_DISPLAY_ORDER.indexOf(b);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
    });

    try {
        console.log(`[Wallet] Fetching balances via Blockscout for ${address.slice(0, 10)}... on ${sortedChains.length} chains`);

        const chainPromises = sortedChains.map((chainKey) =>
            fetchChainBalancesBlockscout(address, SUPPORTED_CHAINS[chainKey])
        );

        const balances = await Promise.all(chainPromises);

        // Calculate total USD across all chains
        const totalUsd = balances.reduce((sum, chain) => sum + chain.totalUsd, 0);
        console.log(`[Wallet] Total portfolio: $${totalUsd.toFixed(2)}`);

        const response: WalletBalancesResponse = {
            address,
            balances,
            totalUsd,
            lastUpdated: new Date().toISOString(),
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error("[Wallet] Error fetching balances:", error);
        return NextResponse.json(
            { error: "Failed to fetch wallet balances" },
            { status: 500 }
        );
    }
}
