import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";
import { sanitizeInput, INPUT_LIMITS } from "@/lib/sanitize";
import { 
    type Address,
    type Chain,
    keccak256,
    encodeAbiParameters,
    parseAbiParameters,
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

/**
 * Calculate a deterministic vault identifier
 * Note: The actual Safe address will be determined when deploying via Safe SDK
 * This is a placeholder that ensures uniqueness for the vault
 */
function calculateVaultId(
    owners: Address[],
    threshold: number,
    saltNonce: bigint
): Address {
    // Create a deterministic identifier based on owners, threshold, and nonce
    const vaultHash = keccak256(
        encodeAbiParameters(
            parseAbiParameters("address[], uint256, uint256"),
            [owners, BigInt(threshold), saltNonce]
        )
    );
    
    // Use first 20 bytes as a pseudo-address (not a real Safe address)
    return ("0x" + vaultHash.slice(26)) as Address;
}

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

        // Get creator's smart wallet address
        const { data: creatorWallet } = await supabase
            .from("shout_profiles")
            .select("smart_wallet_address")
            .eq("wallet_address", session.userAddress.toLowerCase())
            .single();

        if (!creatorWallet?.smart_wallet_address) {
            return NextResponse.json(
                { error: "You need a Spritz Smart Wallet to create a vault" },
                { status: 400 }
            );
        }

        // Verify all members have smart wallets
        const memberAddresses = members.map((m: { address: string }) => m.address.toLowerCase());
        const { data: memberProfiles } = await supabase
            .from("shout_profiles")
            .select("wallet_address, smart_wallet_address")
            .in("wallet_address", memberAddresses);

        const memberWalletMap: Record<string, string> = {};
        for (const profile of memberProfiles || []) {
            if (profile.smart_wallet_address) {
                memberWalletMap[profile.wallet_address.toLowerCase()] = profile.smart_wallet_address;
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
        const signerAddresses: Address[] = [
            creatorWallet.smart_wallet_address as Address,
            ...members.map((m: { address: string }) => memberWalletMap[m.address.toLowerCase()] as Address),
        ];

        // Sort addresses for deterministic vault ID calculation
        const sortedSigners = [...signerAddresses].sort((a, b) => 
            a.toLowerCase().localeCompare(b.toLowerCase())
        );

        // Generate a unique salt nonce based on timestamp and creator
        const saltNonce = BigInt(Date.now());

        // Generate a deterministic vault identifier
        // The actual Safe address will be determined when deploying via Safe SDK
        const vaultId = calculateVaultId(sortedSigners, threshold, saltNonce);

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
                safe_address: vaultId.toLowerCase(),
                chain_id: chainId,
                threshold,
                creator_address: session.userAddress.toLowerCase(),
                is_deployed: false,
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
        const memberInserts = [
            {
                vault_id: vault.id,
                member_address: session.userAddress.toLowerCase(),
                smart_wallet_address: creatorWallet.smart_wallet_address.toLowerCase(),
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
