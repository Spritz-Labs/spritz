import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Address, type Chain } from "viem";
import { base, mainnet, arbitrum, optimism, polygon, bsc } from "viem/chains";
import { getAuthenticatedUser } from "@/lib/session";

// Chain configurations with reliable RPCs
const CHAINS: Record<number, { chain: Chain; rpc: string }> = {
    1: { chain: mainnet, rpc: "https://rpc.ankr.com/eth" },
    8453: { chain: base, rpc: "https://rpc.ankr.com/base" },
    42161: { chain: arbitrum, rpc: "https://rpc.ankr.com/arbitrum" },
    10: { chain: optimism, rpc: "https://rpc.ankr.com/optimism" },
    137: { chain: polygon, rpc: "https://rpc.ankr.com/polygon" },
    56: { chain: bsc, rpc: "https://rpc.ankr.com/bsc" },
};

const SAFE_ABI = [
    {
        inputs: [],
        name: "nonce",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "getOwners",
        outputs: [{ internalType: "address[]", name: "", type: "address[]" }],
        stateMutability: "view",
        type: "function",
    },
    {
        inputs: [],
        name: "getThreshold",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
    },
] as const;

/**
 * GET /api/vault/[id]/read
 * 
 * Server-side endpoint to read vault contract data.
 * This bypasses CORS issues that can occur with client-side RPC calls.
 * 
 * Query params:
 * - safeAddress: The Safe contract address
 * - chainId: The chain ID
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Authenticate user
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const safeAddress = searchParams.get("safeAddress") as Address;
        const chainIdStr = searchParams.get("chainId");

        if (!safeAddress || !chainIdStr) {
            return NextResponse.json(
                { error: "safeAddress and chainId are required" },
                { status: 400 }
            );
        }

        const chainId = parseInt(chainIdStr);
        const chainConfig = CHAINS[chainId];

        if (!chainConfig) {
            return NextResponse.json(
                { error: `Unsupported chain: ${chainId}` },
                { status: 400 }
            );
        }

        console.log(`[VaultRead] Reading vault ${safeAddress} on chain ${chainId}`);
        console.log(`[VaultRead] Using RPC: ${chainConfig.rpc}`);

        // Create public client
        const publicClient = createPublicClient({
            chain: chainConfig.chain,
            transport: http(chainConfig.rpc),
        });

        // Read vault data with retries
        const maxRetries = 3;
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[VaultRead] Attempt ${attempt}/${maxRetries}...`);

                // Read all data in parallel
                const [nonce, owners, threshold] = await Promise.all([
                    publicClient.readContract({
                        address: safeAddress,
                        abi: SAFE_ABI,
                        functionName: "nonce",
                    }),
                    publicClient.readContract({
                        address: safeAddress,
                        abi: SAFE_ABI,
                        functionName: "getOwners",
                    }),
                    publicClient.readContract({
                        address: safeAddress,
                        abi: SAFE_ABI,
                        functionName: "getThreshold",
                    }),
                ]);

                console.log(`[VaultRead] Success! Nonce: ${nonce}, Owners: ${owners.length}, Threshold: ${threshold}`);

                return NextResponse.json({
                    nonce: Number(nonce),
                    owners: owners,
                    threshold: Number(threshold),
                });
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                console.error(`[VaultRead] Attempt ${attempt} failed:`, lastError.message);

                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }

        // Check if contract exists
        try {
            const code = await publicClient.getCode({ address: safeAddress });
            const hasCode = !!code && code !== "0x" && code.length > 2;
            
            if (!hasCode) {
                return NextResponse.json(
                    { error: "Vault contract not found. It may not be deployed on this network." },
                    { status: 404 }
                );
            }
        } catch (codeErr) {
            console.error("[VaultRead] Failed to check contract code:", codeErr);
        }

        return NextResponse.json(
            { error: `Failed to read vault after ${maxRetries} attempts: ${lastError?.message}` },
            { status: 500 }
        );
    } catch (error) {
        console.error("[VaultRead] Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to read vault" },
            { status: 500 }
        );
    }
}
