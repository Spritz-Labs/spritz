import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { createPublicClient, http, type Address, formatEther, formatGwei } from "viem";
import { mainnet, base, arbitrum, optimism, polygon, bsc } from "viem/chains";

// Supported chains for Safe with gas sponsorship info
const SUPPORTED_CHAINS = [
    { id: 1, chain: mainnet, name: "Ethereum", symbol: "ETH", explorer: "https://etherscan.io", sponsored: false },
    { id: 8453, chain: base, name: "Base", symbol: "ETH", explorer: "https://basescan.org", sponsored: true },
    { id: 42161, chain: arbitrum, name: "Arbitrum", symbol: "ETH", explorer: "https://arbiscan.io", sponsored: true },
    { id: 10, chain: optimism, name: "Optimism", symbol: "ETH", explorer: "https://optimistic.etherscan.io", sponsored: true },
    { id: 137, chain: polygon, name: "Polygon", symbol: "MATIC", explorer: "https://polygonscan.com", sponsored: true },
    { id: 56, chain: bsc, name: "BNB Chain", symbol: "BNB", explorer: "https://bscscan.com", sponsored: true },
];

// Approximate gas units for Safe deployment (SafeProxyFactory.createProxyWithNonce)
// This includes ~300k for Safe deployment + ~100k for 4337 module setup
const SAFE_DEPLOYMENT_GAS = BigInt(450000);

// Native token prices (hardcoded fallback - in production use a price feed)
const TOKEN_PRICES: Record<number, number> = {
    1: 3500,     // ETH
    8453: 3500,  // ETH on Base
    42161: 3500, // ETH on Arbitrum  
    10: 3500,    // ETH on Optimism
    137: 0.5,    // MATIC
    56: 300,     // BNB
};

// Minimum gas prices in gwei (fallback when RPC returns unrealistic values)
// These are conservative estimates based on typical network conditions
const MIN_GAS_PRICES_GWEI: Record<number, number> = {
    1: 15,       // Ethereum mainnet: typically 10-50+ gwei
    8453: 0.01,  // Base: very low
    42161: 0.1,  // Arbitrum: very low
    10: 0.01,    // Optimism: very low  
    137: 30,     // Polygon: typically 30-100+ gwei
    56: 3,       // BNB: typically 3-5 gwei
};

// Convert gwei to wei
const gweiToWei = (gwei: number) => BigInt(Math.floor(gwei * 1e9));

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

export interface DeploymentGasEstimate {
    gasUnits: string;
    gasPriceGwei: string;
    estimatedCostEth: string;
    estimatedCostUsd: number;
    isSponsored: boolean;
}

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
    deploymentEstimate: DeploymentGasEstimate | null;
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
        // Helper to add timeout to promises
        const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
            return Promise.race([
                promise,
                new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
            ]);
        };

        // Fetch status for all chains in parallel with timeout
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
                deploymentEstimate: null,
            };

            try {
                const publicClient = createPublicClient({
                    chain: chainInfo.chain,
                    transport: http(),
                });

                // Check if Safe is deployed (has code) with 10s timeout
                const code = await withTimeout(
                    publicClient.getCode({ address: safeAddress as Address }),
                    10000,
                    "0x" as `0x${string}`
                );
                status.isDeployed = !!code && code !== "0x";

                if (status.isDeployed) {
                    // Fetch owners and threshold with 10s timeout each
                    const [owners, threshold] = await Promise.all([
                        withTimeout(
                            publicClient.readContract({
                                address: safeAddress as Address,
                                abi: SAFE_ABI,
                                functionName: "getOwners",
                            }),
                            10000,
                            [] as readonly string[]
                        ),
                        withTimeout(
                            publicClient.readContract({
                                address: safeAddress as Address,
                                abi: SAFE_ABI,
                                functionName: "getThreshold",
                            }),
                            10000,
                            BigInt(0)
                        ),
                    ]);

                    status.owners = (owners as string[]).map((o: string) => o.toLowerCase());
                    status.threshold = Number(threshold);

                    // Check if has recovery signer (more than 1 owner)
                    status.hasRecoverySigner = status.owners.length > 1;

                    // Build Safe App URL
                    const prefix = SAFE_PREFIXES[chainInfo.id] || "eth";
                    status.safeAppUrl = `https://app.safe.global/home?safe=${prefix}:${safeAddress}`;
                } else {
                    // Not deployed - estimate deployment cost
                    try {
                        let gasPrice = await withTimeout(
                            publicClient.getGasPrice(),
                            5000,
                            BigInt(0)
                        );
                        
                        // Apply minimum gas price threshold to avoid unrealistic estimates
                        const minGasPrice = gweiToWei(MIN_GAS_PRICES_GWEI[chainInfo.id] || 1);
                        if (gasPrice < minGasPrice) {
                            console.log(`[SafeStatus] Gas price for ${chainInfo.name} too low (${formatGwei(gasPrice)} gwei), using minimum ${MIN_GAS_PRICES_GWEI[chainInfo.id]} gwei`);
                            gasPrice = minGasPrice;
                        }
                        
                        if (gasPrice > BigInt(0)) {
                            const estimatedCostWei = SAFE_DEPLOYMENT_GAS * gasPrice;
                            const estimatedCostEth = Number(formatEther(estimatedCostWei));
                            const tokenPrice = TOKEN_PRICES[chainInfo.id] || 3500;
                            
                            status.deploymentEstimate = {
                                gasUnits: SAFE_DEPLOYMENT_GAS.toString(),
                                gasPriceGwei: formatGwei(gasPrice),
                                estimatedCostEth: estimatedCostEth.toFixed(6),
                                estimatedCostUsd: estimatedCostEth * tokenPrice,
                                isSponsored: chainInfo.sponsored,
                            };
                        }
                    } catch (gasErr) {
                        console.error(`[SafeStatus] Error estimating gas for ${chainInfo.name}:`, gasErr);
                        
                        // Use fallback minimum gas price on error
                        const fallbackGasPrice = gweiToWei(MIN_GAS_PRICES_GWEI[chainInfo.id] || 15);
                        const estimatedCostWei = SAFE_DEPLOYMENT_GAS * fallbackGasPrice;
                        const estimatedCostEth = Number(formatEther(estimatedCostWei));
                        const tokenPrice = TOKEN_PRICES[chainInfo.id] || 3500;
                        
                        status.deploymentEstimate = {
                            gasUnits: SAFE_DEPLOYMENT_GAS.toString(),
                            gasPriceGwei: formatGwei(fallbackGasPrice),
                            estimatedCostEth: estimatedCostEth.toFixed(6),
                            estimatedCostUsd: estimatedCostEth * tokenPrice,
                            isSponsored: chainInfo.sponsored,
                        };
                    }
                }

                // Fetch native balance with 5s timeout
                const balance = await withTimeout(
                    publicClient.getBalance({ address: safeAddress as Address }),
                    5000,
                    BigInt(0)
                );
                // Use token prices
                const tokenPrice = TOKEN_PRICES[chainInfo.id] || 3500;
                status.balanceUsd = Number(balance) / 1e18 * tokenPrice;

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
