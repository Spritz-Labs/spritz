import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { SUPPORTED_CHAINS, type SupportedChain } from "@/config/chains";
import { getTokenLogo, NATIVE_TOKEN_LOGOS } from "@/config/tokenLogos";

const GRAPH_TOKEN_API_KEY = process.env.GRAPH_TOKEN_API_KEY;
const GRAPH_TOKEN_API_BASE = "https://token-api.thegraph.com/v1/evm";
const GRAPH_NATIVE_BALANCES_URL = `${GRAPH_TOKEN_API_BASE}/balances/native`;
const GRAPH_TOKEN_BALANCES_URL = `${GRAPH_TOKEN_API_BASE}/balances`;

// Native token price cache (symbol -> {price, timestamp})
const priceCache: Map<string, { price: number; timestamp: number }> = new Map();
const PRICE_CACHE_TTL = 60000; // 1 minute

// CoinGecko IDs for native tokens
const COINGECKO_IDS: Record<string, string> = {
    ETH: "ethereum",
    BNB: "binancecoin",
    MATIC: "matic-network",
    AVAX: "avalanche-2",
};

// Fetch native token prices from CoinGecko
async function getNativeTokenPrice(symbol: string): Promise<number | null> {
    const cached = priceCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
        return cached.price;
    }

    const coinId = COINGECKO_IDS[symbol];
    if (!coinId) return null;

    try {
        const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
            { next: { revalidate: 60 } }
        );

        if (!response.ok) return null;

        const data = await response.json();
        const price = data[coinId]?.usd;

        if (typeof price === "number") {
            priceCache.set(symbol, { price, timestamp: Date.now() });
            return price;
        }
    } catch (error) {
        console.error(`[Wallet] Error fetching ${symbol} price:`, error);
    }

    return null;
}

// Whitelist of trusted tokens by contract address (lowercase)
// Only tokens in this list will be displayed to avoid scam/spam tokens
const TRUSTED_TOKENS: Record<string, Set<string>> = {
    // Ethereum Mainnet
    mainnet: new Set([
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
        "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
        "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
        "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
        "0x514910771af9ca656af840dff83e8264ecf986ca", // LINK
        "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", // UNI
        "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", // AAVE
        "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2", // MKR
        "0xae7ab96520de3a18e5e111b5eaab095312d7fe84", // stETH
        "0xbe9895146f7af43049ca1c1ae358b0541ea49704", // cbETH
        "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0", // wstETH
        "0x4d224452801aced8b2f0aebe155379bb5d594381", // APE
        "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce", // SHIB
        "0x6982508145454ce325ddbe47a25d4ec3d2311933", // PEPE
    ]),
    // BNB Chain
    bsc: new Set([
        "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC
        "0x55d398326f99059ff775485246999027b3197955", // USDT
        "0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3", // DAI
        "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", // BTCB
        "0x2170ed0880ac9a755fd29b2688956bd959f933f8", // ETH
        "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", // WBNB
        "0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82", // CAKE
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
        "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a", // GMX
    ]),
    // Optimism
    optimism: new Set([
        "0x0b2c639c533813f4aa9d7837caf62653d097ff85", // USDC
        "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", // USDT
        "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", // DAI
        "0x68f180fcce6836688e9084f035309e29bf0a2095", // WBTC
        "0x4200000000000000000000000000000000000006", // WETH
        "0x4200000000000000000000000000000000000042", // OP
    ]),
    // Polygon
    polygon: new Set([
        "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // USDC
        "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT
        "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", // DAI
        "0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6", // WBTC
        "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
        "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270", // WMATIC
        "0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39", // LINK
    ]),
    // Avalanche
    avalanche: new Set([
        "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // USDC
        "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", // USDT
        "0xd586e7f844cea2f87f50152665bcbc2c279d8d70", // DAI
        "0x152b9d0fdc40c096757f570a51e494bd4b943e50", // WBTC
        "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab", // WETH
        "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7", // WAVAX
    ]),
    // Unichain
    unichain: new Set([
        "0x078d782b760474a361dda0af3839290b0ef57ad6", // USDC
        "0x4200000000000000000000000000000000000006", // WETH
    ]),
};

// Check if a token is trusted (native tokens are always trusted)
function isTrustedToken(network: string, contractAddress: string | null): boolean {
    // Native tokens are always trusted
    if (!contractAddress || 
        contractAddress === "native" ||
        contractAddress === "0x0000000000000000000000000000000000000000" ||
        contractAddress === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee") {
        return true;
    }
    
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

// Fetch balances for a single chain using The Graph Token API
// Native and ERC-20 balances require separate API calls
async function fetchChainBalances(
    address: string,
    chain: SupportedChain
): Promise<ChainBalance> {
    try {
        if (!GRAPH_TOKEN_API_KEY) {
            return {
                chain,
                nativeBalance: null,
                tokens: [],
                totalUsd: 0,
                error: "API not configured",
            };
        }

        const headers = {
            Accept: "application/json",
            Authorization: `Bearer ${GRAPH_TOKEN_API_KEY}`,
        };

        // Fetch native and ERC-20 balances in parallel
        const [nativeResponse, tokensResponse] = await Promise.all([
            fetch(`${GRAPH_NATIVE_BALANCES_URL}?network=${chain.network}&address=${address}`, {
                headers,
                next: { revalidate: 30 },
            }),
            fetch(`${GRAPH_TOKEN_BALANCES_URL}?network=${chain.network}&address=${address}`, {
                headers,
                next: { revalidate: 30 },
            }),
        ]);

        const balances: TokenBalance[] = [];
        let nativeBalance: TokenBalance | null = null;
        let totalUsd = 0;

        // Process native balance from The Graph
        let nativeFromGraph = false;
        if (nativeResponse.ok) {
            const nativeData = await nativeResponse.json();
            const nativeList = nativeData.data || nativeData;
            
            if (Array.isArray(nativeList) && nativeList.length > 0) {
                const native = nativeList[0];
                const rawAmount = native.amount || "0";
                const decimals = native.decimals || 18;
                // native.value is the formatted token amount (e.g., 0.5 ETH), NOT USD value
                const tokenAmount = typeof native.value === "number" 
                    ? native.value 
                    : parseFloat(rawAmount) / Math.pow(10, decimals);
                
                // Only create balance if non-zero (same as RPC fallback)
                if (tokenAmount > 0) {
                    // Fetch USD price for native token (not provided by Graph API)
                    const usdPrice = await getNativeTokenPrice(chain.symbol);
                    const balanceUsd = usdPrice ? tokenAmount * usdPrice : null;

                    nativeBalance = {
                        contractAddress: "native",
                        symbol: native.symbol || chain.symbol,
                        name: native.name || chain.name,
                        decimals: decimals,
                        balance: rawAmount,
                        balanceFormatted: tokenAmount.toString(),
                        balanceUsd: balanceUsd,
                        tokenType: "native",
                        logoUrl: NATIVE_TOKEN_LOGOS[chain.symbol] || undefined,
                    };

                    if (balanceUsd && balanceUsd > 0) {
                        totalUsd += balanceUsd;
                    }
                }
                nativeFromGraph = true;
            } else {
                // Graph returned an empty array - will try RPC fallback
                console.log(`[Wallet] ${chain.name}: Graph API returned no native balance data`);
            }
        } else {
            const errorText = await nativeResponse.text();
            console.error(`[Wallet] Error fetching ${chain.name} native balance:`, nativeResponse.status, errorText);
        }

        // Fallback: Fetch native balance directly via RPC if Graph returned empty
        if (!nativeFromGraph && chain.rpcUrl) {
            console.log(`[Wallet] ${chain.name}: Using RPC fallback for native balance`);
            try {
                const rpcResponse = await fetch(chain.rpcUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        method: "eth_getBalance",
                        params: [address, "latest"],
                        id: 1,
                    }),
                });

                if (rpcResponse.ok) {
                    const rpcData = await rpcResponse.json();
                    if (rpcData.result) {
                        const rawAmount = BigInt(rpcData.result).toString();
                        const decimals = 18;
                        const tokenAmount = parseFloat(rawAmount) / Math.pow(10, decimals);
                        
                        console.log(`[Wallet] ${chain.name}: RPC returned ${tokenAmount} ${chain.symbol}`);
                        
                        // Only create balance if non-zero
                        if (tokenAmount > 0) {
                            // Fetch USD price for native token
                            const usdPrice = await getNativeTokenPrice(chain.symbol);
                            const balanceUsd = usdPrice ? tokenAmount * usdPrice : null;

                            nativeBalance = {
                                contractAddress: "native",
                                symbol: chain.symbol,
                                name: chain.name,
                                decimals: decimals,
                                balance: rawAmount,
                                balanceFormatted: tokenAmount.toString(),
                                balanceUsd: balanceUsd,
                                tokenType: "native",
                                logoUrl: NATIVE_TOKEN_LOGOS[chain.symbol] || undefined,
                            };

                            if (balanceUsd && balanceUsd > 0) {
                                totalUsd += balanceUsd;
                            }
                        }
                    } else if (rpcData.error) {
                        console.error(`[Wallet] ${chain.name}: RPC error:`, rpcData.error);
                    }
                } else {
                    console.error(`[Wallet] ${chain.name}: RPC request failed with status ${rpcResponse.status}`);
                }
            } catch (rpcError) {
                console.error(`[Wallet] RPC fallback error for ${chain.name}:`, rpcError);
            }
        } else if (!nativeFromGraph) {
            console.warn(`[Wallet] ${chain.name}: No RPC URL configured for fallback`);
        }

        // Process ERC-20 token balances
        if (tokensResponse.ok) {
            const tokensData = await tokensResponse.json();
            const tokenList = tokensData.data || tokensData;
            
            if (Array.isArray(tokenList)) {
                // Debug: log first token's structure to understand API response
                if (tokenList.length > 0) {
                    const sampleToken = tokenList[0];
                    console.log(`[Wallet] ${chain.name}: Sample token response:`, {
                        symbol: sampleToken.symbol,
                        amount: sampleToken.amount,
                        value: sampleToken.value,
                        value_usd: sampleToken.value_usd,
                    });
                }
                
                for (const token of tokenList) {
                    const contractAddr = token.contract || token.contractAddress;
                    
                    // Skip if no contract address (shouldn't happen for ERC-20)
                    if (!contractAddr) continue;

                    // Skip untrusted tokens (scam/spam filter)
                    if (!isTrustedToken(chain.network, contractAddr)) {
                        continue;
                    }

                    const rawAmount = token.amount || token.balance || "0";
                    const decimals = token.decimals || 18;
                    // token.value is the formatted token amount, not USD
                    const tokenAmount = typeof token.value === "number"
                        ? token.value
                        : parseFloat(rawAmount) / Math.pow(10, decimals);
                    
                    // Skip zero balances
                    if (tokenAmount <= 0) continue;
                    
                    const symbol = token.symbol || "???";
                    
                    // Use value_usd if available (The Graph Token API provides this for ERC-20)
                    // Fallback: For stablecoins (USDC, USDT, DAI), assume 1:1 USD value
                    let balanceUsd: number | null = typeof token.value_usd === "number" ? token.value_usd : null;
                    if (balanceUsd === null) {
                        const stablecoins = ["USDC", "USDT", "DAI", "BUSD", "TUSD", "USDP", "GUSD", "FRAX"];
                        if (stablecoins.includes(symbol.toUpperCase())) {
                            balanceUsd = tokenAmount; // 1:1 USD ratio for stablecoins
                        }
                    }

                    const tokenBalance: TokenBalance = {
                        contractAddress: contractAddr,
                        symbol: symbol,
                        name: token.name || "Unknown Token",
                        decimals: decimals,
                        balance: rawAmount,
                        balanceFormatted: tokenAmount.toString(),
                        balanceUsd: balanceUsd,
                        tokenType: "erc20",
                        logoUrl: token.logoUrl || token.logo || getTokenLogo(symbol, contractAddr, chain.network),
                    };

                    if (balanceUsd && balanceUsd > 0) {
                        totalUsd += balanceUsd;
                        console.log(`[Wallet] ${chain.name}: Added ${symbol} $${balanceUsd.toFixed(2)} to total (now $${totalUsd.toFixed(2)})`);
                    } else {
                        console.log(`[Wallet] ${chain.name}: ${symbol} has no USD value (value_usd: ${token.value_usd}, calculated: ${balanceUsd})`);
                    }

                    balances.push(tokenBalance);
                }
            }
        } else {
            const errorText = await tokensResponse.text();
            console.error(`[Wallet] Error fetching ${chain.name} token balances:`, tokensResponse.status, errorText);
        }

        // Sort tokens by USD value (highest first)
        balances.sort((a, b) => (b.balanceUsd || 0) - (a.balanceUsd || 0));

        // Log summary for debugging
        console.log(`[Wallet] ${chain.name}: Final total = $${totalUsd.toFixed(2)} (native: $${nativeBalance?.balanceUsd?.toFixed(2) || 0}, tokens: ${balances.length} with ${balances.filter(t => t.balanceUsd).length} having USD values)`);

        return {
            chain,
            nativeBalance,
            tokens: balances,
            totalUsd,
        };
    } catch (error) {
        console.error(`[Wallet] Error fetching ${chain.name} balances:`, error);
        return {
            chain,
            nativeBalance: null,
            tokens: [],
            totalUsd: 0,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

// Preferred chain order for display (by importance/usage)
const CHAIN_DISPLAY_ORDER = [
    "ethereum",   // Mainnet first
    "base",       // L2s in order of popularity
    "arbitrum",
    "optimism",
    "polygon",
    "bsc",
    "unichain",
    "avalanche",
];

// GET /api/wallet/balances - Fetch balances across all supported chains
export async function GET(request: NextRequest) {
    // Require authentication
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 }
        );
    }

    const { searchParams } = new URL(request.url);
    // Use the address from query params (smart wallet address from frontend)
    // Authentication ensures only logged-in users can use this endpoint
    const addressParam = searchParams.get("address");
    
    if (!addressParam) {
        return NextResponse.json(
            { error: "Address required" },
            { status: 400 }
        );
    }

    // Normalize address
    const address = addressParam.toLowerCase();

    // Optional: filter to specific chains
    const chainsParam = searchParams.get("chains");
    const requestedChains = chainsParam 
        ? chainsParam.split(",").filter(c => c in SUPPORTED_CHAINS)
        : Object.keys(SUPPORTED_CHAINS);

    // Sort chains by preferred display order
    const sortedChains = [...requestedChains].sort((a, b) => {
        const aIndex = CHAIN_DISPLAY_ORDER.indexOf(a);
        const bIndex = CHAIN_DISPLAY_ORDER.indexOf(b);
        // Chains not in the order list go to the end
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
    });

    try {
        // Fetch balances for all requested chains in parallel
        // The Graph Token API returns USD values directly, no need for separate price fetching
        console.log(`[Wallet] Fetching balances for ${address.slice(0, 10)}... on ${sortedChains.length} chains:`, sortedChains.join(", "));
        
        const chainPromises = sortedChains.map((chainKey) =>
            fetchChainBalances(address, SUPPORTED_CHAINS[chainKey])
        );

        const balances = await Promise.all(chainPromises);

        // Log per-chain results for debugging
        for (const balance of balances) {
            const hasBalance = balance.nativeBalance || balance.tokens.length > 0;
            if (balance.error) {
                console.warn(`[Wallet] ${balance.chain.name}: Error - ${balance.error}`);
            } else if (hasBalance) {
                const nativeInfo = balance.nativeBalance 
                    ? `${balance.nativeBalance.balanceFormatted} ${balance.chain.symbol} ($${(balance.nativeBalance.balanceUsd || 0).toFixed(2)})`
                    : "0";
                console.log(`[Wallet] ${balance.chain.name}: $${balance.totalUsd.toFixed(2)} (native: ${nativeInfo}, tokens: ${balance.tokens.length})`);
            }
        }

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
