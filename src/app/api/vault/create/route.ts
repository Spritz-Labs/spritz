import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuthWithCsrf } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";
import { sanitizeInput, INPUT_LIMITS } from "@/lib/sanitize";
import { getMultiSigSafeAddress } from "@/lib/safeWallet";
import { ApiError } from "@/lib/apiErrors";
import { VAULT_MAX_MEMBERS, VAULT_NAME_MAX_LENGTH, VAULT_DESCRIPTION_MAX_LENGTH } from "@/lib/constants";
import { 
    type Address,
    type Chain,
    isAddress,
} from "viem";
import { mainnet, base, arbitrum, optimism, polygon, bsc, avalanche } from "viem/chains";
import crypto from "crypto";

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
        // H-5 FIX: Use CSRF-protected authentication
        const session = await requireAuthWithCsrf(request);
        if (session instanceof NextResponse) return session;
        
        if (!session?.userAddress) {
            return ApiError.unauthorized();
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

        // H-3 FIX: Comprehensive input validation
        // Validate required fields
        if (!name || !chainId || !members || !threshold) {
            return ApiError.badRequest("Name, chainId, members, and threshold are required");
        }

        // Validate name length
        if (typeof name !== "string" || name.length > VAULT_NAME_MAX_LENGTH) {
            return ApiError.validationError(`Name must be ${VAULT_NAME_MAX_LENGTH} characters or less`);
        }

        // Validate description length if provided
        if (description && (typeof description !== "string" || description.length > VAULT_DESCRIPTION_MAX_LENGTH)) {
            return ApiError.validationError(`Description must be ${VAULT_DESCRIPTION_MAX_LENGTH} characters or less`);
        }

        // Validate chain
        if (!VAULT_SUPPORTED_CHAINS[chainId]) {
            return ApiError.badRequest(`Chain ${chainId} is not supported for vaults`);
        }

        // H-3 FIX: Validate members array
        if (!Array.isArray(members) || members.length < 1) {
            return ApiError.badRequest("At least one member is required");
        }

        // H-3 FIX: Enforce maximum members limit (DoS prevention)
        if (members.length > VAULT_MAX_MEMBERS - 1) { // -1 for creator
            return ApiError.badRequest(`Maximum ${VAULT_MAX_MEMBERS} total members allowed (including creator)`);
        }

        // H-3 FIX: Validate each member address format
        for (const member of members) {
            if (!member.address || typeof member.address !== "string") {
                return ApiError.validationError("Invalid member format: address required");
            }
            if (!isAddress(member.address)) {
                return ApiError.validationError(`Invalid Ethereum address: ${member.address}`);
            }
        }

        // H-3 FIX: Check for duplicate addresses
        const memberAddressesSet = new Set(members.map((m: { address: string }) => m.address.toLowerCase()));
        if (memberAddressesSet.size !== members.length) {
            return ApiError.badRequest("Duplicate member addresses are not allowed");
        }

        // H-3 FIX: Ensure creator is not in members list
        if (memberAddressesSet.has(session.userAddress.toLowerCase())) {
            return ApiError.badRequest("Creator cannot be in the members list (they are added automatically)");
        }

        // Validate threshold
        const totalSigners = members.length + 1; // +1 for creator
        if (threshold < 1 || threshold > totalSigners) {
            return ApiError.badRequest(`Threshold must be between 1 and ${totalSigners}`);
        }

        // Get creator's smart wallet address from shout_users
        const { data: creatorUser } = await supabase
            .from("shout_users")
            .select("smart_wallet_address")
            .eq("wallet_address", session.userAddress.toLowerCase())
            .single();

        if (!creatorUser?.smart_wallet_address) {
            return ApiError.badRequest("You need a Spritz Smart Wallet to create a vault");
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
            return ApiError.badRequest(
                "Some members don't have Spritz Smart Wallets",
                { missingMembers: missingWallets.map((m: { address: string }) => m.address) }
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

        // M-4 FIX: Generate a unique salt nonce using timestamp + random bytes
        // This prevents address collisions even if vaults are created in rapid succession
        const randomBytes = crypto.randomBytes(8);
        const randomPart = BigInt("0x" + randomBytes.toString("hex"));
        const saltNonce = BigInt(Date.now()) * BigInt(1000000000000) + randomPart;

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
            return ApiError.internal("Failed to calculate vault address");
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
            return ApiError.internal("Failed to create vault");
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
            return ApiError.internal("Failed to add vault members");
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
        return ApiError.internal("Failed to create vault");
    }
}
