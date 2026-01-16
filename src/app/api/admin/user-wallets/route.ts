import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Address, formatEther, defineChain } from "viem";
import { mainnet, base, arbitrum, optimism, polygon, bsc, avalanche } from "viem/chains";
import { supabase } from "@/config/supabase";

// Admin addresses (same as other admin endpoints)
const ADMIN_ADDRESSES = [
    "0x89480c2E67876650b48622907ff5C48A569a36C7".toLowerCase(),
    "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045".toLowerCase(),
];

// Define Unichain
const unichain = defineChain({
    id: 130,
    name: "Unichain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
        default: { http: ["https://mainnet.unichain.org"] },
    },
    blockExplorers: {
        default: { name: "Uniscan", url: "https://uniscan.xyz" },
    },
});

// Verify admin auth
async function verifyAdminAuth(request: NextRequest): Promise<{ isAdmin: boolean; address: string | null }> {
    const authHeader = request.headers.get("x-wallet-address");
    const signature = request.headers.get("x-wallet-signature");

    if (!authHeader || !signature) {
        return { isAdmin: false, address: null };
    }

    const address = authHeader.toLowerCase();
    const isAdmin = ADMIN_ADDRESSES.includes(address);

    return { isAdmin, address };
}

// Supported chains
const CHAINS = [
    { id: 1, chain: mainnet, name: "Ethereum", symbol: "ETH", color: "#627EEA", sponsored: false },
    { id: 8453, chain: base, name: "Base", symbol: "ETH", color: "#0052FF", sponsored: true },
    { id: 42161, chain: arbitrum, name: "Arbitrum", symbol: "ETH", color: "#28A0F0", sponsored: true },
    { id: 10, chain: optimism, name: "Optimism", symbol: "ETH", color: "#FF0420", sponsored: true },
    { id: 137, chain: polygon, name: "Polygon", symbol: "MATIC", color: "#8247E5", sponsored: true },
    { id: 56, chain: bsc, name: "BNB Chain", symbol: "BNB", color: "#F3BA2F", sponsored: true },
    { id: 43114, chain: avalanche, name: "Avalanche", symbol: "AVAX", color: "#E84142", sponsored: true },
    { id: 130, chain: unichain, name: "Unichain", symbol: "ETH", color: "#FF007A", sponsored: true },
];

// Token prices (fallback)
const TOKEN_PRICES: Record<number, number> = {
    1: 3500,
    8453: 3500,
    42161: 3500,
    10: 3500,
    137: 0.5,
    56: 300,
    43114: 35,
    130: 3500,
};

export interface ChainWalletStatus {
    chainId: number;
    chainName: string;
    symbol: string;
    color: string;
    isDeployed: boolean;
    balance: string;
    balanceUsd: number;
    sponsored: boolean;
}

/**
 * GET /api/admin/user-wallets?address=0x...
 * 
 * Admin endpoint to fetch wallet deployment status across all chains for a specific user.
 */
export async function GET(request: NextRequest) {
    const { isAdmin, address: adminAddress } = await verifyAdminAuth(request);
    
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get("address");

    if (!userAddress) {
        return NextResponse.json({ error: "User address required" }, { status: 400 });
    }

    try {
        // First, try to get the user's smart wallet address from the database
        let safeAddress = userAddress;
        
        if (supabase) {
            // Check if this is an EOA with a linked smart wallet
            const { data: credential } = await supabase
                .from("passkey_credentials")
                .select("smart_wallet_address")
                .eq("wallet_address", userAddress.toLowerCase())
                .maybeSingle();
            
            if (credential?.smart_wallet_address) {
                safeAddress = credential.smart_wallet_address;
            }
        }

        // Helper for timeouts
        const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
            return Promise.race([
                promise,
                new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
            ]);
        };

        // Check deployment and balance on each chain
        const chainStatuses = await Promise.all(
            CHAINS.map(async (chainInfo) => {
                const status: ChainWalletStatus = {
                    chainId: chainInfo.id,
                    chainName: chainInfo.name,
                    symbol: chainInfo.symbol,
                    color: chainInfo.color,
                    isDeployed: false,
                    balance: "0",
                    balanceUsd: 0,
                    sponsored: chainInfo.sponsored,
                };

                try {
                    const client = createPublicClient({
                        chain: chainInfo.chain,
                        transport: http(),
                    });

                    // Check if deployed (has code)
                    const code = await withTimeout(
                        client.getCode({ address: safeAddress as Address }),
                        5000,
                        "0x" as `0x${string}`
                    );
                    status.isDeployed = !!code && code !== "0x";

                    // Get balance
                    const balance = await withTimeout(
                        client.getBalance({ address: safeAddress as Address }),
                        3000,
                        BigInt(0)
                    );
                    
                    const balanceEth = Number(formatEther(balance));
                    status.balance = balanceEth.toFixed(6);
                    status.balanceUsd = balanceEth * (TOKEN_PRICES[chainInfo.id] || 3500);
                } catch (err) {
                    // Keep defaults on error
                    console.error(`[AdminUserWallets] Error for ${chainInfo.name}:`, err);
                }

                return status;
            })
        );

        // Sort by: deployed first, then by balance
        chainStatuses.sort((a, b) => {
            if (a.isDeployed && !b.isDeployed) return -1;
            if (!a.isDeployed && b.isDeployed) return 1;
            return b.balanceUsd - a.balanceUsd;
        });

        // Summary
        const summary = {
            smartWalletAddress: safeAddress,
            deployedCount: chainStatuses.filter(c => c.isDeployed).length,
            totalChains: chainStatuses.length,
            totalBalanceUsd: chainStatuses.reduce((sum, c) => sum + c.balanceUsd, 0),
            chainsWithBalance: chainStatuses.filter(c => c.balanceUsd > 0.01).length,
        };

        return NextResponse.json({
            userAddress,
            ...summary,
            chains: chainStatuses,
        });

    } catch (error) {
        console.error("[AdminUserWallets] Error:", error);
        return NextResponse.json({ error: "Failed to fetch wallet status" }, { status: 500 });
    }
}
