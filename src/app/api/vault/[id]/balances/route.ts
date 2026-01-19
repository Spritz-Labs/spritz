import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { getChainById } from "@/config/chains";
import { getTokenLogo, NATIVE_TOKEN_LOGOS } from "@/config/tokenLogos";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Blockscout API endpoints for each chain
const BLOCKSCOUT_URLS: Record<number, string> = {
    1: "https://eth.blockscout.com",
    8453: "https://base.blockscout.com",
    42161: "https://arbitrum.blockscout.com",
    10: "https://optimism.blockscout.com",
    137: "https://polygon.blockscout.com",
    56: "https://bsc.blockscout.com",
    43114: "https://avax.blockscout.com",
    130: "https://unichain.blockscout.com",
};

// RPC URLs for each chain
const RPC_URLS: Record<number, string> = {
    1: "https://eth.llamarpc.com",
    8453: "https://mainnet.base.org",
    42161: "https://arb1.arbitrum.io/rpc",
    10: "https://mainnet.optimism.io",
    137: "https://polygon-rpc.com",
    56: "https://bsc-dataseed.binance.org",
    43114: "https://api.avax.network/ext/bc/C/rpc",
    130: "https://mainnet.unichain.org",
};

// Token info for direct RPC queries (used as fallback when Blockscout is slow)
type TokenInfo = {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoUrl?: string;
};

const KNOWN_TOKENS: Record<number, TokenInfo[]> = {
    1: [
        { address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", symbol: "USDC", name: "USD Coin", decimals: 6, logoUrl: "https://assets.coingecko.com/coins/images/6319/small/usdc.png" },
        { address: "0xdac17f958d2ee523a2206206994597c13d831ec7", symbol: "USDT", name: "Tether USD", decimals: 6, logoUrl: "https://assets.coingecko.com/coins/images/325/small/Tether.png" },
        { address: "0x6b175474e89094c44da98b954eedeac495271d0f", symbol: "DAI", name: "Dai Stablecoin", decimals: 18, logoUrl: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png" },
    ],
    8453: [
        { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", name: "USD Coin", decimals: 6, logoUrl: "https://assets.coingecko.com/coins/images/6319/small/usdc.png" },
        { address: "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", symbol: "DAI", name: "Dai Stablecoin", decimals: 18, logoUrl: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png" },
    ],
    42161: [
        { address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", symbol: "USDC", name: "USD Coin", decimals: 6, logoUrl: "https://assets.coingecko.com/coins/images/6319/small/usdc.png" },
        { address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", symbol: "USDT", name: "Tether USD", decimals: 6, logoUrl: "https://assets.coingecko.com/coins/images/325/small/Tether.png" },
        { address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", symbol: "DAI", name: "Dai Stablecoin", decimals: 18, logoUrl: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png" },
    ],
    10: [
        { address: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", symbol: "USDC", name: "USD Coin", decimals: 6, logoUrl: "https://assets.coingecko.com/coins/images/6319/small/usdc.png" },
        { address: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", symbol: "USDT", name: "Tether USD", decimals: 6, logoUrl: "https://assets.coingecko.com/coins/images/325/small/Tether.png" },
        { address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", symbol: "DAI", name: "Dai Stablecoin", decimals: 18, logoUrl: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png" },
    ],
    137: [
        { address: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", symbol: "USDC", name: "USD Coin", decimals: 6, logoUrl: "https://assets.coingecko.com/coins/images/6319/small/usdc.png" },
        { address: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", symbol: "USDT", name: "Tether USD", decimals: 6, logoUrl: "https://assets.coingecko.com/coins/images/325/small/Tether.png" },
        { address: "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", symbol: "DAI", name: "Dai Stablecoin", decimals: 18, logoUrl: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png" },
    ],
    56: [
        { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", symbol: "USDC", name: "USD Coin", decimals: 18, logoUrl: "https://assets.coingecko.com/coins/images/6319/small/usdc.png" },
        { address: "0x55d398326f99059ff775485246999027b3197955", symbol: "USDT", name: "Tether USD", decimals: 18, logoUrl: "https://assets.coingecko.com/coins/images/325/small/Tether.png" },
    ],
    43114: [
        { address: "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", symbol: "USDC", name: "USD Coin", decimals: 6, logoUrl: "https://assets.coingecko.com/coins/images/6319/small/usdc.png" },
        { address: "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", symbol: "USDT", name: "Tether USD", decimals: 6, logoUrl: "https://assets.coingecko.com/coins/images/325/small/Tether.png" },
    ],
};

// Trusted tokens by chain ID (for Blockscout filtering)
const TRUSTED_TOKENS: Record<number, Set<string>> = {
    1: new Set([
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
        "0xdac17f958d2ee523a2206206994597c13d831ec7", // USDT
        "0x6b175474e89094c44da98b954eedeac495271d0f", // DAI
        "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", // WBTC
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
    ]),
    8453: new Set([
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
        "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI
        "0x4200000000000000000000000000000000000006", // WETH
    ]),
    42161: new Set([
        "0xaf88d065e77c8cc2239327c5edb3a432268e5831", // USDC
        "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", // USDT
        "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", // DAI
        "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
    ]),
    10: new Set([
        "0x0b2c639c533813f4aa9d7837caf62653d097ff85", // USDC
        "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", // USDT
        "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", // DAI
        "0x4200000000000000000000000000000000000006", // WETH
    ]),
    137: new Set([
        "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // USDC
        "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", // USDT
        "0x8f3cf7ad23cd3cadbd9735aff958023239c6a063", // DAI
        "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", // WETH
    ]),
    56: new Set([
        "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", // USDC
        "0x55d398326f99059ff775485246999027b3197955", // USDT
        "0x2170ed0880ac9a755fd29b2688956bd959f933f8", // ETH
    ]),
    43114: new Set([
        "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // USDC
        "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7", // USDT
        "0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab", // WETH
    ]),
};

// Helper: Get token balance via RPC
async function getTokenBalanceRpc(
    rpcUrl: string,
    tokenAddress: string,
    walletAddress: string
): Promise<bigint> {
    try {
        // balanceOf(address) function selector: 0x70a08231
        const paddedWallet = walletAddress.toLowerCase().replace("0x", "").padStart(64, "0");
        const data = `0x70a08231${paddedWallet}`;
        
        console.log("[Vault RPC] Calling:", { rpcUrl, tokenAddress, walletAddress, data: data.substring(0, 20) + "..." });
        
        const response = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "eth_call",
                params: [{ to: tokenAddress, data }, "latest"],
                id: 1,
            }),
        });
        
        const result = await response.json();
        console.log("[Vault RPC] Result:", result);
        
        if (result.result && result.result !== "0x") {
            return BigInt(result.result);
        }
        return BigInt(0);
    } catch (err) {
        console.error("[Vault RPC] Error:", err);
        return BigInt(0);
    }
}

export type VaultTokenBalance = {
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

export type VaultBalanceResponse = {
    vaultId: string;
    safeAddress: string;
    chainId: number;
    nativeBalance: VaultTokenBalance | null;
    tokens: VaultTokenBalance[];
    totalUsd: number;
    lastUpdated: string;
};

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

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: vaultId } = await params;
        
        // Authenticate user
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        // Get vault details
        const { data: vault, error: vaultError } = await supabase
            .from("shout_vaults")
            .select("id, safe_address, chain_id")
            .eq("id", vaultId)
            .single();

        if (vaultError || !vault) {
            return NextResponse.json(
                { error: "Vault not found" },
                { status: 404 }
            );
        }

        // Verify user is a member of this vault
        const { data: membership } = await supabase
            .from("shout_vault_members")
            .select("id")
            .eq("vault_id", vaultId)
            .eq("user_address", user.userAddress.toLowerCase())
            .single();

        if (!membership) {
            return NextResponse.json(
                { error: "Not a member of this vault" },
                { status: 403 }
            );
        }

        const chainInfo = getChainById(vault.chain_id);
        const blockscoutUrl = BLOCKSCOUT_URLS[vault.chain_id];
        
        let nativeBalance: VaultTokenBalance | null = null;
        const tokens: VaultTokenBalance[] = [];
        let totalUsd = 0;

        if (blockscoutUrl) {
            try {
                // Fetch native balance and token balances in parallel
                const [addressResponse, tokensResponse] = await Promise.all([
                    fetch(`${blockscoutUrl}/api/v2/addresses/${vault.safe_address}`, {
                        headers: { Accept: "application/json" },
                        cache: "no-store",
                    }),
                    fetch(`${blockscoutUrl}/api/v2/addresses/${vault.safe_address}/token-balances`, {
                        headers: { Accept: "application/json" },
                        cache: "no-store",
                    }),
                ]);

                // Process native balance
                if (addressResponse.ok) {
                    const addressData: BlockscoutAddressResponse = await addressResponse.json();
                    const rawBalance = addressData.coin_balance || "0";
                    const balanceWei = BigInt(rawBalance);

                    if (balanceWei > BigInt(0)) {
                        const balanceFormatted = Number(balanceWei) / 1e18;
                        const exchangeRate = addressData.exchange_rate
                            ? parseFloat(addressData.exchange_rate)
                            : null;
                        const balanceUsd = exchangeRate
                            ? balanceFormatted * exchangeRate
                            : null;

                        nativeBalance = {
                            contractAddress: "native",
                            symbol: chainInfo?.symbol || "ETH",
                            name: chainInfo?.name || "Native Token",
                            decimals: 18,
                            balance: rawBalance,
                            balanceFormatted: balanceFormatted.toString(),
                            balanceUsd,
                            tokenType: "native",
                            logoUrl: NATIVE_TOKEN_LOGOS[chainInfo?.symbol || "ETH"],
                        };

                        if (balanceUsd) {
                            totalUsd += balanceUsd;
                        }
                    }
                }

                // Process token balances from Blockscout
                let foundTokensFromBlockscout = false;
                if (tokensResponse.ok) {
                    const tokensData: BlockscoutTokenBalance[] = await tokensResponse.json();
                    const trustedSet = TRUSTED_TOKENS[vault.chain_id] || new Set();

                    for (const tokenData of tokensData) {
                        const token = tokenData.token;

                        // Skip non-ERC20 tokens
                        if (token.type !== "ERC-20") continue;

                        // Skip untrusted tokens
                        if (!trustedSet.has(token.address_hash.toLowerCase())) continue;

                        const rawBalance = tokenData.value || "0";
                        const decimals = parseInt(token.decimals) || 18;
                        const balanceFormatted =
                            Number(BigInt(rawBalance)) / Math.pow(10, decimals);

                        // Skip zero balances
                        if (balanceFormatted <= 0) continue;

                        foundTokensFromBlockscout = true;

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
                            logoUrl: token.icon_url || getTokenLogo(token.symbol, token.address_hash, chainInfo?.network || ""),
                        });

                        if (balanceUsd) {
                            totalUsd += balanceUsd;
                        }
                    }
                }
                
                // Fallback: If Blockscout returned no tokens, query known tokens via RPC
                // This handles cases where Blockscout indexing is delayed
                if (!foundTokensFromBlockscout) {
                    const rpcUrl = RPC_URLS[vault.chain_id];
                    const knownTokens = KNOWN_TOKENS[vault.chain_id] || [];
                    
                    console.log("[Vault Balances] RPC Fallback Debug:", {
                        chainId: vault.chain_id,
                        safeAddress: vault.safe_address,
                        rpcUrl,
                        knownTokensCount: knownTokens.length,
                    });
                    
                    if (rpcUrl && knownTokens.length > 0) {
                        console.log("[Vault Balances] Blockscout returned no tokens, trying RPC fallback");
                        
                        for (const token of knownTokens) {
                            console.log(`[Vault Balances] Checking ${token.symbol} at ${token.address}`);
                            const balance = await getTokenBalanceRpc(rpcUrl, token.address, vault.safe_address);
                            console.log(`[Vault Balances] ${token.symbol} balance: ${balance.toString()}`);
                            
                            if (balance > BigInt(0)) {
                                const balanceFormatted = Number(balance) / Math.pow(10, token.decimals);
                                
                                // For stablecoins, USD value = balance
                                const stablecoins = ["USDC", "USDT", "DAI", "BUSD"];
                                const balanceUsd = stablecoins.includes(token.symbol) ? balanceFormatted : null;
                                
                                tokens.push({
                                    contractAddress: token.address,
                                    symbol: token.symbol,
                                    name: token.name,
                                    decimals: token.decimals,
                                    balance: balance.toString(),
                                    balanceFormatted: balanceFormatted.toString(),
                                    balanceUsd,
                                    tokenType: "erc20",
                                    logoUrl: token.logoUrl,
                                });
                                
                                if (balanceUsd) {
                                    totalUsd += balanceUsd;
                                }
                            }
                        }
                    }
                }
            } catch (fetchError) {
                console.error("[Vault Balances] Blockscout fetch error:", fetchError);
            }
        }

        const response: VaultBalanceResponse = {
            vaultId: vault.id,
            safeAddress: vault.safe_address,
            chainId: vault.chain_id,
            nativeBalance,
            tokens,
            totalUsd,
            lastUpdated: new Date().toISOString(),
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error("[Vault Balances] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch vault balances" },
            { status: 500 }
        );
    }
}
