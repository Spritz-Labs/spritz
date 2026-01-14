import { NextRequest, NextResponse } from "next/server";

// Price cache to avoid excessive API calls
const priceCache: Map<string, { price: number; timestamp: number }> = new Map();
const CACHE_TTL = 60000; // 1 minute

// CoinGecko IDs for tokens
const COINGECKO_IDS: Record<string, string> = {
    ETH: "ethereum",
    BNB: "binancecoin",
    MATIC: "matic-network",
    AVAX: "avalanche-2",
};

/**
 * GET /api/prices?symbols=ETH,BNB
 * 
 * Fetch current prices for native tokens.
 * Returns cached prices if available and fresh.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get("symbols") || "ETH";
    const symbols = symbolsParam.split(",").map(s => s.trim().toUpperCase());

    const prices: Record<string, number | null> = {};

    // Check cache first
    const symbolsToFetch: string[] = [];
    for (const symbol of symbols) {
        const cached = priceCache.get(symbol);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            prices[symbol] = cached.price;
        } else {
            symbolsToFetch.push(symbol);
        }
    }

    // Fetch missing prices from CoinGecko
    if (symbolsToFetch.length > 0) {
        const coinIds = symbolsToFetch
            .map(s => COINGECKO_IDS[s])
            .filter(Boolean)
            .join(",");

        if (coinIds) {
            try {
                const response = await fetch(
                    `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd`,
                    { 
                        headers: { "Accept": "application/json" },
                        next: { revalidate: 60 } 
                    }
                );

                if (response.ok) {
                    const data = await response.json();
                    
                    for (const symbol of symbolsToFetch) {
                        const coinId = COINGECKO_IDS[symbol];
                        const price = coinId ? data[coinId]?.usd : null;
                        
                        if (typeof price === "number") {
                            priceCache.set(symbol, { price, timestamp: Date.now() });
                            prices[symbol] = price;
                        } else {
                            prices[symbol] = null;
                        }
                    }
                }
            } catch (error) {
                console.error("[Prices] Error fetching from CoinGecko:", error);
                // Return nulls for failed fetches
                for (const symbol of symbolsToFetch) {
                    prices[symbol] = null;
                }
            }
        }
    }

    return NextResponse.json({
        prices,
        timestamp: Date.now(),
    });
}
