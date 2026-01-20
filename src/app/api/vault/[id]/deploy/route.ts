import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { isSafeDeployed } from "@/lib/safeWallet";
import type { Address } from "viem";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/vault/[id]/deploy
 * 
 * Called after the user deploys the vault's Safe contract on-chain.
 * Updates the database to mark the vault as deployed.
 * 
 * Body: { txHash: string }
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: vaultId } = await params;
        const body = await request.json();
        const { txHash } = body;

        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Get vault details
        const { data: vault, error: vaultError } = await supabase
            .from("shout_vaults")
            .select("id, safe_address, chain_id, is_deployed, creator_address")
            .eq("id", vaultId)
            .single();

        if (vaultError || !vault) {
            return NextResponse.json({ error: "Vault not found" }, { status: 404 });
        }

        // Verify user is a member
        const { data: membership } = await supabase
            .from("shout_vault_members")
            .select("id, is_creator")
            .eq("vault_id", vaultId)
            .eq("member_address", user.userAddress.toLowerCase())
            .single();

        if (!membership) {
            return NextResponse.json({ error: "Not a member" }, { status: 403 });
        }

        // Check if already deployed in DB
        if (vault.is_deployed) {
            return NextResponse.json({ 
                success: true, 
                message: "Vault already marked as deployed",
                safeAddress: vault.safe_address,
            });
        }

        // Verify the Safe is actually deployed on-chain
        const deployed = await isSafeDeployed(vault.safe_address as Address, vault.chain_id);
        
        if (!deployed) {
            // Return 202 (Accepted) instead of 400 to indicate pending state
            // The client can retry after a delay
            return NextResponse.json({ 
                error: "Safe not yet deployed on-chain. Please wait for transaction confirmation.",
                status: "pending"
            }, { status: 202 });
        }

        // Update vault as deployed
        const { error: updateError } = await supabase
            .from("shout_vaults")
            .update({
                is_deployed: true,
                deploy_tx_hash: txHash || null,
            })
            .eq("id", vaultId);

        if (updateError) {
            console.error("[Vault Deploy] Update error:", updateError);
            return NextResponse.json({ error: "Failed to update vault" }, { status: 500 });
        }

        console.log("[Vault Deploy] Vault marked as deployed:", vaultId, "Safe:", vault.safe_address);

        return NextResponse.json({
            success: true,
            message: "Vault deployed successfully",
            safeAddress: vault.safe_address,
            txHash,
        });
    } catch (error) {
        console.error("[Vault Deploy] Error:", error);
        return NextResponse.json({ error: "Failed to process deployment" }, { status: 500 });
    }
}

/**
 * GET /api/vault/[id]/deploy
 * 
 * Check if a vault's Safe is deployed on-chain.
 * Returns deployment status and details needed to deploy if not.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: vaultId } = await params;

        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Get vault details
        const { data: vault, error: vaultError } = await supabase
            .from("shout_vaults")
            .select(`
                id, 
                safe_address, 
                chain_id, 
                is_deployed, 
                threshold,
                salt_nonce
            `)
            .eq("id", vaultId)
            .single();

        if (vaultError || !vault) {
            return NextResponse.json({ error: "Vault not found" }, { status: 404 });
        }

        // Verify user is a member
        const { data: membership } = await supabase
            .from("shout_vault_members")
            .select("id")
            .eq("vault_id", vaultId)
            .eq("member_address", user.userAddress.toLowerCase())
            .single();

        if (!membership) {
            return NextResponse.json({ error: "Not a member" }, { status: 403 });
        }

        // Check on-chain status
        const deployedOnChain = await isSafeDeployed(vault.safe_address as Address, vault.chain_id);

        // If deployed on-chain but not in DB, update DB
        if (deployedOnChain && !vault.is_deployed) {
            await supabase
                .from("shout_vaults")
                .update({ is_deployed: true })
                .eq("id", vaultId);
        }

        // Get all member smart wallet addresses (needed for deployment)
        const { data: members } = await supabase
            .from("shout_vault_members")
            .select("smart_wallet_address")
            .eq("vault_id", vaultId)
            .eq("status", "active");

        const ownerAddresses = members?.map(m => m.smart_wallet_address).filter(Boolean) || [];

        return NextResponse.json({
            isDeployed: deployedOnChain,
            isDeployedInDb: vault.is_deployed,
            safeAddress: vault.safe_address,
            chainId: vault.chain_id,
            threshold: vault.threshold,
            saltNonce: vault.salt_nonce,
            owners: ownerAddresses,
        });
    } catch (error) {
        console.error("[Vault Deploy] Error:", error);
        return NextResponse.json({ error: "Failed to check deployment" }, { status: 500 });
    }
}
