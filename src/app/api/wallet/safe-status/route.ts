import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { createPublicClient, http, type Address } from "viem";
import { mainnet, base, arbitrum, optimism, polygon, bsc } from "viem/chains";

// Supported chains for Safe
const SUPPORTED_CHAINS = [
    { id: 1, chain: mainnet, name: "Ethereum", symbol: "ETH", explorer: "https://etherscan.io" },
    { id: 8453, chain: base, name: "Base", symbol: "ETH", explorer: "https://basescan.org" },
    { id: 42161, chain: arbitrum, name: "Arbitrum", symbol: "ETH", explorer: "https://arbiscan.io" },
    { id: 10, chain: optimism, name: "Optimism", symbol: "ETH", explorer: "https://optimistic.etherscan.io" },
    { id: 137, chain: polygon, name: "Polygon", symbol: "MATIC", explorer: "https://polygonscan.com" },
    { id: 56, chain: bsc, name: "BNB Chain", symbol: "BNB", explorer: "https://bscscan.com" },
];

// Safe ABI for reading owners and threshold
const SAFE_ABI = [
    {
        name: "getOwners",
        type: "function",
        inputs: [],
        outputs: [{ name: "", type: "address[]" }],
    },
    {
        name: "getThreshold",
        type: "function",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
    },
] as const;

// Safe prefix for Safe App URLs
const SAFE_PREFIXES: Record<number, string> = {
    1: "eth",
    8453: "base",
    42161: "arb1",
    10: "oeth",
    137: "matic",
    56: "bnb",
};

export interface ChainSafeStatus {
    chainId: number;
    chainName: string;
    symbol: string;
    explorer: string;
    isDeployed: boolean;
    owners: string[];
    threshold: number;
    hasRecoverySigner: boolean;
    primarySigner: string | null;
    balanceUsd: number;
    safeAppUrl: string | null;
}

/**
 * GET /api/wallet/safe-status
 * 
 * Fetches Safe deployment status, owners, and recovery signers across all supported chains.
 * Also includes balance information for prioritization.
 */
export async function GET(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const safeAddress = searchParams.get("address");
    const primarySigner = searchParams.get("primarySigner"); // The user's primary signer (passkey signer or EOA)

    if (!safeAddress) {
        return NextResponse.json({ error: "Safe address required" }, { status: 400 });
    }

    try {
        // Fetch status for all chains in parallel
        const statusPromises = SUPPORTED_CHAINS.map(async (chainInfo) => {
            const status: ChainSafeStatus = {
                chainId: chainInfo.id,
                chainName: chainInfo.name,
                symbol: chainInfo.symbol,
                explorer: chainInfo.explorer,
                isDeployed: false,
                owners: [],
                threshold: 0,
                hasRecoverySigner: false,
                primarySigner: primarySigner?.toLowerCase() || null,
                balanceUsd: 0,
                safeAppUrl: null,
            };

            try {
                const publicClient = createPublicClient({
                    chain: chainInfo.chain,
                    transport: http(),
                });

                // Check if Safe is deployed (has code)
                const code = await publicClient.getCode({ address: safeAddress as Address });
                status.isDeployed = !!code && code !== "0x";

                if (status.isDeployed) {
                    // Fetch owners and threshold
                    const [owners, threshold] = await Promise.all([
                        publicClient.readContract({
                            address: safeAddress as Address,
                            abi: SAFE_ABI,
                            functionName: "getOwners",
                        }),
                        publicClient.readContract({
                            address: safeAddress as Address,
                            abi: SAFE_ABI,
                            functionName: "getThreshold",
                        }),
                    ]);

                    status.owners = (owners as string[]).map((o: string) => o.toLowerCase());
                    status.threshold = Number(threshold);

                    // Check if has recovery signer (more than 1 owner)
                    status.hasRecoverySigner = status.owners.length > 1;

                    // Build Safe App URL
                    const prefix = SAFE_PREFIXES[chainInfo.id] || "eth";
                    status.safeAppUrl = `https://app.safe.global/home?safe=${prefix}:${safeAddress}`;
                }

                // Fetch native balance
                const balance = await publicClient.getBalance({ address: safeAddress as Address });
                // Simple USD estimate (you'd want real prices in production)
                const ethPrice = chainInfo.id === 137 ? 0.5 : chainInfo.id === 56 ? 300 : 3500;
                status.balanceUsd = Number(balance) / 1e18 * ethPrice;

            } catch (err) {
                console.error(`[SafeStatus] Error fetching ${chainInfo.name}:`, err);
                // Keep default values on error
            }

            return status;
        });

        const chainStatuses = await Promise.all(statusPromises);

        // Sort: chains with funds first, then deployed, then others
        chainStatuses.sort((a, b) => {
            // First by balance
            if (a.balanceUsd > 0 && b.balanceUsd === 0) return -1;
            if (b.balanceUsd > 0 && a.balanceUsd === 0) return 1;
            // Then by deployment status
            if (a.isDeployed && !b.isDeployed) return -1;
            if (b.isDeployed && !a.isDeployed) return 1;
            // Then by balance amount
            return b.balanceUsd - a.balanceUsd;
        });

        // Summary stats
        const summary = {
            totalChains: chainStatuses.length,
            deployedChains: chainStatuses.filter(s => s.isDeployed).length,
            chainsWithFunds: chainStatuses.filter(s => s.balanceUsd > 0).length,
            chainsWithRecovery: chainStatuses.filter(s => s.hasRecoverySigner).length,
            chainsNeedingRecovery: chainStatuses.filter(s => s.isDeployed && !s.hasRecoverySigner && s.balanceUsd > 0).length,
            totalBalanceUsd: chainStatuses.reduce((sum, s) => sum + s.balanceUsd, 0),
        };

        return NextResponse.json({
            safeAddress,
            primarySigner: primarySigner?.toLowerCase(),
            chains: chainStatuses,
            summary,
        });

    } catch (error) {
        console.error("[SafeStatus] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch Safe status" },
            { status: 500 }
        );
    }
}
