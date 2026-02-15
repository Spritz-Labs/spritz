import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbi, getAddress, isAddress } from "viem";
import { mainnet, base, arbitrum, optimism, polygon, bsc, avalanche } from "viem/chains";

// Map chain IDs to viem chain objects
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CHAIN_MAP: Record<number, any> = {
    1: mainnet,
    8453: base,
    42161: arbitrum,
    10: optimism,
    137: polygon,
    56: bsc,
    43114: avalanche,
};

// Unichain config (not in viem by default)
const unichain = {
    id: 130,
    name: "Unichain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
        default: { http: ["https://mainnet.unichain.org"] },
    },
    blockExplorers: {
        default: { name: "Blockscout", url: "https://unichain.blockscout.com" },
    },
} as const;

const ERC20_ABI = parseAbi([
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
]);

const OWNABLE_ABI = parseAbi([
    "function owner() view returns (address)",
]);

function getRpcUrl(chainId: number): string {
    const apiKey = process.env.NEXT_PUBLIC_DRPC_API_KEY || process.env.DRPC_API_KEY;
    const drpcChains: Record<number, string> = {
        1: "ethereum", 8453: "base", 42161: "arbitrum", 10: "optimism",
        137: "polygon", 56: "bsc", 43114: "avalanche", 130: "unichain",
    };
    if (apiKey && drpcChains[chainId]) {
        return `https://lb.drpc.org/ogrpc?network=${drpcChains[chainId]}&dkey=${apiKey}`;
    }
    const fallbacks: Record<number, string> = {
        1: "https://eth.llamarpc.com", 8453: "https://base.llamarpc.com",
        42161: "https://arb1.arbitrum.io/rpc", 10: "https://mainnet.optimism.io",
        137: "https://polygon-rpc.com", 56: "https://bsc-dataseed.binance.org",
        43114: "https://api.avax.network/ext/bc/C/rpc", 130: "https://mainnet.unichain.org",
    };
    return fallbacks[chainId] || fallbacks[1];
}

function getClient(chainId: number) {
    const chain = CHAIN_MAP[chainId] || (chainId === 130 ? unichain : mainnet);
    return createPublicClient({
        chain: chain as typeof mainnet,
        transport: http(getRpcUrl(chainId)),
    });
}

// GET /api/token-chats/token-info?address=0x...&chainId=1&userAddress=0x...
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const tokenAddress = searchParams.get("address");
    const chainId = parseInt(searchParams.get("chainId") || "1");
    const userAddress = searchParams.get("userAddress");

    if (!tokenAddress || !isAddress(tokenAddress)) {
        return NextResponse.json({ error: "Invalid token address" }, { status: 400 });
    }

    const supportedChains = [1, 8453, 42161, 10, 137, 56, 43114, 130];
    if (!supportedChains.includes(chainId)) {
        return NextResponse.json({ error: "Unsupported chain" }, { status: 400 });
    }

    try {
        const client = getClient(chainId);
        const address = getAddress(tokenAddress);

        // Fetch token metadata
        const [name, symbol, decimals] = await Promise.all([
            client.readContract({ address, abi: ERC20_ABI, functionName: "name" }).catch(() => null),
            client.readContract({ address, abi: ERC20_ABI, functionName: "symbol" }).catch(() => null),
            client.readContract({ address, abi: ERC20_ABI, functionName: "decimals" }).catch(() => 18),
        ]);

        if (!name && !symbol) {
            return NextResponse.json({ error: "Not a valid ERC20 token" }, { status: 400 });
        }

        // Check Ownable.owner() if userAddress provided
        let isOwner = false;
        let ownerAddress: string | null = null;
        if (userAddress && isAddress(userAddress)) {
            try {
                const owner = await client.readContract({
                    address,
                    abi: OWNABLE_ABI,
                    functionName: "owner",
                });
                ownerAddress = owner as string;
                isOwner = ownerAddress.toLowerCase() === userAddress.toLowerCase();
            } catch {
                // Contract doesn't implement Ownable - that's fine
            }
        }

        // Check if userAddress is the deployer (via contract creation tx)
        let isDeployer = false;
        if (userAddress && isAddress(userAddress) && !isOwner) {
            try {
                // Etherscan-style: check the contract's bytecode creator
                // We can use getTransaction on the contract creation hash
                // But a simpler heuristic: check nonce of contract address
                // Actually the most reliable way is to check the creation tx
                // For now we skip this and rely on Ownable.owner()
                // TODO: Add deployer check via block explorer API
            } catch {
                // Skip deployer check
            }
        }

        // Check user's token balance if provided
        let userBalance: string | null = null;
        if (userAddress && isAddress(userAddress)) {
            try {
                const balance = await client.readContract({
                    address,
                    abi: ERC20_ABI,
                    functionName: "balanceOf",
                    args: [getAddress(userAddress)],
                });
                userBalance = (balance as bigint).toString();
            } catch {
                // Could not fetch balance
            }
        }

        return NextResponse.json({
            address: address,
            chainId,
            name: name || "Unknown Token",
            symbol: symbol || "???",
            decimals: Number(decimals),
            ownerAddress,
            isOwner,
            isDeployer,
            userBalance,
        });
    } catch (err) {
        console.error("[token-info] Error:", err);
        return NextResponse.json(
            { error: "Failed to fetch token info" },
            { status: 500 },
        );
    }
}
