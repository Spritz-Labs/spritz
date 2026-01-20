import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";
import { sanitizeInput, INPUT_LIMITS } from "@/lib/sanitize";
import { getMultiSigSafeAddress } from "@/lib/safeWallet";
import { 
    type Address,
    type Chain,
} from "viem";
import { mainnet, base, arbitrum, optimism, polygon, bsc, avalanche } from "viem/chains";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Supported chains for vault creation
const VAULT_SUPPORTED_CHAINS: Record<number, { chain: Chain; name: string }> = {
    1: { chain: mainnet, name: "Ethereum" },
    8453: { chain: base, name: "Base" },
    42161: { chain: arbitrum, name: "Arbitrum" },
    10: { chain: optimism, name: "Optimism" },
    137: { chain: polygon, name: "Polygon" },
    56: { chain: bsc, name: "BNB Chain" },
    43114: { chain: avalanche, name: "Avalanche" },
};

// Note: Safe contract deployment will be handled via Safe SDK when first transaction is made

export async function POST(request: NextRequest) {
    // Rate limit
    const rateLimitResponse = await checkRateLimit(request, "strict");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        // Get authenticated user
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { 
            name, 
            description, 
            emoji = "🔐",
            chainId, 
            members, // Array of { address, smartWalletAddress, nickname? }
            threshold 
        } = body;

        // Validate inputs
        if (!name || !chainId || !members || !threshold) {
            return NextResponse.json(
                { error: "Name, chainId, members, and threshold are required" },
                { status: 400 }
            );
        }

        // Validate chain
        if (!VAULT_SUPPORTED_CHAINS[chainId]) {
            return NextResponse.json(
                { error: `Chain ${chainId} is not supported for vaults` },
                { status: 400 }
            );
        }

        // Validate members
        if (!Array.isArray(members) || members.length < 1) {
            return NextResponse.json(
                { error: "At least one member is required" },
                { status: 400 }
            );
        }

        // Validate threshold
        const totalSigners = members.length + 1; // +1 for creator
        if (threshold < 1 || threshold > totalSigners) {
            return NextResponse.json(
                { error: `Threshold must be between 1 and ${totalSigners}` },
                { status: 400 }
            );
        }

        // Get creator's smart wallet address from shout_users
        const { data: creatorUser } = await supabase
            .from("shout_users")
            .select("smart_wallet_address")
            .eq("wallet_address", session.userAddress.toLowerCase())
            .single();

        if (!creatorUser?.smart_wallet_address) {
            return NextResponse.json(
                { error: "You need a Spritz Smart Wallet to create a vault" },
                { status: 400 }
            );
        }

        // Verify all members have smart wallets
        const memberAddresses = members.map((m: { address: string }) => m.address.toLowerCase());
        const { data: memberUsers } = await supabase
            .from("shout_users")
            .select("wallet_address, smart_wallet_address")
            .in("wallet_address", memberAddresses);

        const memberWalletMap: Record<string, string> = {};
        for (const user of memberUsers || []) {
            if (user.smart_wallet_address) {
                memberWalletMap[user.wallet_address.toLowerCase()] = user.smart_wallet_address;
            }
        }

        // Check if all members have smart wallets
        const missingWallets = members.filter(
            (m: { address: string }) => !memberWalletMap[m.address.toLowerCase()]
        );
        if (missingWallets.length > 0) {
            return NextResponse.json(
                { 
                    error: "Some members don't have Spritz Smart Wallets",
                    missingMembers: missingWallets.map((m: { address: string }) => m.address),
                },
                { status: 400 }
            );
        }

        // Collect all signer addresses (smart wallet addresses)
        // These Smart Wallets implement EIP-1271 isValidSignature
        const signerAddresses: Address[] = [
            creatorUser.smart_wallet_address as Address,
            ...members.map((m: { address: string }) => memberWalletMap[m.address.toLowerCase()] as Address),
        ];

        // Sort addresses for deterministic Safe address calculation
        const sortedSigners = [...signerAddresses].sort((a, b) => 
            a.toLowerCase().localeCompare(b.toLowerCase())
        );

        // Generate a unique salt nonce based on timestamp and creator
        const saltNonce = BigInt(Date.now());

        // Calculate the actual Safe multi-sig address using the Safe SDK
        // This is the REAL address where the Safe will be deployed
        let safeAddress: Address;
        try {
            safeAddress = await getMultiSigSafeAddress(
                sortedSigners,
                threshold,
                chainId,
                saltNonce
            );
            console.log("[Vault] Calculated Safe address:", safeAddress);
        } catch (safeError) {
            console.error("[Vault] Error calculating Safe address:", safeError);
            return NextResponse.json(
                { error: "Failed to calculate vault address" },
                { status: 500 }
            );
        }

        // Sanitize inputs
        const sanitizedName = sanitizeInput(name, INPUT_LIMITS.SHORT_TEXT);
        const sanitizedDescription = description 
            ? sanitizeInput(description, INPUT_LIMITS.MEDIUM_TEXT) 
            : null;

        // Create vault in database
        const { data: vault, error: vaultError } = await supabase
            .from("shout_vaults")
            .insert({
                name: sanitizedName,
                description: sanitizedDescription,
                emoji: emoji?.slice(0, 10) || "🔐",
                safe_address: safeAddress.toLowerCase(),
                chain_id: chainId,
                threshold,
                creator_address: session.userAddress.toLowerCase(),
                is_deployed: false,
                salt_nonce: saltNonce.toString(), // Store salt for future deployment
            })
            .select()
            .single();

        if (vaultError) {
            console.error("[Vault] Error creating vault:", vaultError);
            return NextResponse.json(
                { error: "Failed to create vault" },
                { status: 500 }
            );
        }

        // Add members (including creator)
        // member_address = EOA address, smart_wallet_address = Safe owner (for EIP-1271 signing)
        const memberInserts = [
            {
                vault_id: vault.id,
                member_address: session.userAddress.toLowerCase(),
                smart_wallet_address: creatorUser.smart_wallet_address.toLowerCase(),
                is_creator: true,
                nickname: null as string | null,
                status: "active",
                joined_at: new Date().toISOString(),
            },
            ...members.map((m: { address: string; nickname?: string }) => ({
                vault_id: vault.id,
                member_address: m.address.toLowerCase(),
                smart_wallet_address: memberWalletMap[m.address.toLowerCase()].toLowerCase(),
                is_creator: false,
                nickname: (m.nickname || null) as string | null,
                status: "active", // Auto-join for now, could be "pending" for invite flow
                joined_at: new Date().toISOString(),
            })),
        ];

        const { error: membersError } = await supabase
            .from("shout_vault_members")
            .insert(memberInserts);

        if (membersError) {
            console.error("[Vault] Error adding members:", membersError);
            // Cleanup vault
            await supabase.from("shout_vaults").delete().eq("id", vault.id);
            return NextResponse.json(
                { error: "Failed to add vault members" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            vault: {
                id: vault.id,
                name: vault.name,
                description: vault.description,
                emoji: vault.emoji,
                safeAddress: vault.safe_address,
                chainId: vault.chain_id,
                threshold: vault.threshold,
                isDeployed: vault.is_deployed,
                createdAt: vault.created_at,
            },
            members: memberInserts.map(m => ({
                address: m.member_address,
                smartWalletAddress: m.smart_wallet_address,
                isCreator: m.is_creator,
                nickname: m.nickname,
            })),
            signerAddresses: sortedSigners,
        });
    } catch (error) {
        console.error("[Vault] Error:", error);
        return NextResponse.json(
            { error: "Failed to create vault" },
            { status: 500 }
        );
    }
}
