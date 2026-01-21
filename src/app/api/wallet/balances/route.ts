import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { SUPPORTED_CHAINS, type SupportedChain } from "@/config/chains";
import { 
    fetchBalances, 
    GRAPH_NETWORK_NAMES, 
    type TokenBalance,
    clearBalanceCache,
} from "@/lib/graphTokenApi";

export type { TokenBalance };

export type ChainBalance = {
    chain: SupportedChain;
    nativeBalance: TokenBalance | null;
    tokens: TokenBalance[];
    totalUsd: number;
    source: "graph" | "blockscout" | "rpc";
    error?: string;
};

export type WalletBalancesResponse = {
    address: string;
    balances: ChainBalance[];
    totalUsd: number;
    lastUpdated: string;
};

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

// Fetch balances for a single chain
async function fetchChainBalances(
    address: string,
    chain: SupportedChain
): Promise<ChainBalance> {
    try {
        const network = GRAPH_NETWORK_NAMES[chain.id];
        const { balances, totalUsd, source } = await fetchBalances(
            address, 
            chain.id, 
            network || chain.network
        );

        // Separate native and token balances
        const nativeBalance = balances.find(b => b.tokenType === "native") || null;
        const tokens = balances.filter(b => b.tokenType === "erc20");

        console.log(`[Wallet] ${chain.name} (${source}): $${totalUsd.toFixed(2)} (native: ${nativeBalance?.balanceFormatted || 0} ${chain.symbol}, tokens: ${tokens.length})`);

        return {
            chain,
            nativeBalance,
            tokens,
            totalUsd,
            source,
        };
    } catch (error) {
        console.error(`[Wallet] Error fetching ${chain.name} balances:`, error);
        return {
            chain,
            nativeBalance: null,
            tokens: [],
            totalUsd: 0,
            source: "rpc",
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

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
    const refresh = searchParams.get("refresh") === "true";

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

    const address = addressParam;

    // Clear cache if refresh requested
    if (refresh) {
        clearBalanceCache(address);
        console.log(`[Wallet] Cache cleared for ${address.slice(0, 10)}...`);
    }

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
        console.log(`[Wallet] Fetching balances for ${address.slice(0, 10)}... on ${sortedChains.length} chains (Graph Token API + fallbacks)`);

        const chainPromises = sortedChains.map((chainKey) =>
            fetchChainBalances(address, SUPPORTED_CHAINS[chainKey])
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

// POST /api/wallet/balances - Clear cache for an address
export async function POST(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 }
        );
    }

    const body = await request.json();
    const { address, chainId } = body;

    if (address) {
        clearBalanceCache(address, chainId);
        console.log(`[Wallet] Cache cleared for ${address.slice(0, 10)}... chain: ${chainId || "all"}`);
    }

    return NextResponse.json({ success: true });
}
