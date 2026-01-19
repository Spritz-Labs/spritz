import { NextRequest, NextResponse } from "next/server";

// Public debug endpoint - no auth required
// Usage: /api/vault/debug-balance?address=0x...&chainId=8453

const BLOCKSCOUT_URLS: Record<number, string> = {
    8453: "https://base.blockscout.com",
    1: "https://eth.blockscout.com",
    42161: "https://arbitrum.blockscout.com",
};

const TRUSTED_TOKENS: Record<number, Set<string>> = {
    8453: new Set([
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
        "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI
        "0x4200000000000000000000000000000000000006", // WETH
    ]),
};

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    const chainId = parseInt(searchParams.get("chainId") || "8453");
    
    if (!address) {
        return NextResponse.json({ error: "Missing address param" }, { status: 400 });
    }
    
    const blockscoutUrl = BLOCKSCOUT_URLS[chainId];
    if (!blockscoutUrl) {
        return NextResponse.json({ error: `No blockscout URL for chain ${chainId}` }, { status: 400 });
    }
    
    const debugInfo: Record<string, unknown> = {
        input: { address, chainId, blockscoutUrl },
        steps: [],
    };
    
    try {
        // Step 1: Fetch token balances
        const url = `${blockscoutUrl}/api/v2/addresses/${address}/token-balances`;
        debugInfo.steps.push({ step: 1, action: "fetch", url });
        
        const response = await fetch(url, {
            headers: { Accept: "application/json" },
            cache: "no-store",
        });
        
        debugInfo.steps.push({ step: 2, action: "response", status: response.status, ok: response.ok });
        
        if (!response.ok) {
            const errorText = await response.text();
            debugInfo.steps.push({ step: 3, action: "error", errorText });
            return NextResponse.json({ ...debugInfo, error: "Blockscout fetch failed" });
        }
        
        // Step 2: Parse response
        const tokensData = await response.json();
        debugInfo.steps.push({ step: 3, action: "parse", tokenCount: tokensData.length });
        debugInfo.rawTokens = tokensData;
        
        // Step 3: Filter tokens
        const trustedSet = TRUSTED_TOKENS[chainId] || new Set();
        debugInfo.trustedTokens = Array.from(trustedSet);
        
        const processedTokens = [];
        
        for (const tokenData of tokensData) {
            const token = tokenData.token;
            const tokenDebug: Record<string, unknown> = {
                symbol: token.symbol,
                address: token.address_hash,
                addressLower: token.address_hash.toLowerCase(),
                type: token.type,
                value: tokenData.value,
            };
            
            // Check type
            if (token.type !== "ERC-20") {
                tokenDebug.skipped = "not ERC-20";
                processedTokens.push(tokenDebug);
                continue;
            }
            
            // Check trusted
            const isTrusted = trustedSet.has(token.address_hash.toLowerCase());
            tokenDebug.isTrusted = isTrusted;
            
            if (!isTrusted) {
                tokenDebug.skipped = "not trusted";
                processedTokens.push(tokenDebug);
                continue;
            }
            
            // Check balance
            const rawBalance = tokenData.value || "0";
            const decimals = parseInt(token.decimals) || 18;
            const balanceFormatted = Number(BigInt(rawBalance)) / Math.pow(10, decimals);
            
            tokenDebug.rawBalance = rawBalance;
            tokenDebug.decimals = decimals;
            tokenDebug.balanceFormatted = balanceFormatted;
            
            if (balanceFormatted <= 0) {
                tokenDebug.skipped = "zero balance";
                processedTokens.push(tokenDebug);
                continue;
            }
            
            tokenDebug.passed = true;
            processedTokens.push(tokenDebug);
        }
        
        debugInfo.processedTokens = processedTokens;
        debugInfo.passedTokens = processedTokens.filter((t: Record<string, unknown>) => t.passed);
        
        return NextResponse.json(debugInfo);
    } catch (err) {
        debugInfo.error = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json(debugInfo);
    }
}
