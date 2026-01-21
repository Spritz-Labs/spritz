import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Address, type Chain } from "viem";
import { base, mainnet, arbitrum, optimism, polygon, bsc, avalanche } from "viem/chains";
import { getAuthenticatedUser } from "@/lib/session";
import { getRpcUrl } from "@/lib/rpc";

// Chain configurations using centralized RPC config (dRPC if configured)
const CHAINS: Record<number, Chain> = {
    1: mainnet,
    8453: base,
    42161: arbitrum,
    10: optimism,
    137: polygon,
    56: bsc,
    43114: avalanche,
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
        const chain = CHAINS[chainId];

        if (!chain) {
            return NextResponse.json(
                { error: `Unsupported chain: ${chainId}` },
                { status: 400 }
            );
        }

        const rpcUrl = getRpcUrl(chainId);
        console.log(`[VaultRead] Reading vault ${safeAddress} on chain ${chainId}`);
        console.log(`[VaultRead] Using RPC: ${rpcUrl}`);

        // Create public client
        const publicClient = createPublicClient({
            chain,
            transport: http(rpcUrl),
        });

        // Read vault data with retries
        const maxRetries = 3;
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[VaultRead] Attempt ${attempt}/${maxRetries}...`);

                // First verify this is actually a Safe contract (not a Smart Wallet)
                // Safe contracts have getOwners and getThreshold, Smart Wallets don't
                let nonce: bigint;
                let owners: readonly `0x${string}`[];
                let threshold: bigint;
                
                try {
                    // Read all data in parallel
                    [nonce, owners, threshold] = await Promise.all([
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
                } catch (contractErr) {
                    // Check if this might be a Smart Wallet (ERC-4337) instead of a Safe
                    // Smart Wallets don't have getOwners/getThreshold
                    console.error(`[VaultRead] Contract call failed - this may not be a Safe contract:`, contractErr);
                    throw new Error(
                        "This address does not appear to be a Safe vault. " +
                        "It may be a Smart Wallet or the vault address was stored incorrectly. " +
                        "Please delete this vault and create a new one."
                    );
                }

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
