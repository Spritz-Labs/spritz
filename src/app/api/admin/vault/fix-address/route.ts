import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { getMultiSigSafeAddress, isSafeDeployed } from "@/lib/safeWallet";
import type { Address } from "viem";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/admin/vault/fix-address
 * 
 * Admin endpoint to recalculate and fix vault Safe addresses.
 * This is needed because the old address calculation used toSafeSmartAccount (ERC-4337)
 * but deployment uses createProxyWithNonce (vanilla Safe 1.4.1) which produces different addresses.
 * 
 * Body: { vaultId: string, dryRun?: boolean }
 */
export async function POST(request: NextRequest) {
    try {
        const user = await getAuthenticatedUser(request);
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check if user is admin
        const { data: profile } = await supabase
            .from("profiles")
            .select("is_admin")
            .eq("user_address", user.userAddress.toLowerCase())
            .single();

        if (!profile?.is_admin) {
            return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        const body = await request.json();
        const { vaultId, dryRun = true } = body;

        if (!vaultId) {
            return NextResponse.json({ error: "vaultId is required" }, { status: 400 });
        }

        // Get vault details
        const { data: vault, error: vaultError } = await supabase
            .from("shout_vaults")
            .select(`
                id,
                name,
                safe_address,
                chain_id,
                threshold,
                salt_nonce,
                is_deployed
            `)
            .eq("id", vaultId)
            .single();

        if (vaultError || !vault) {
            return NextResponse.json({ error: "Vault not found" }, { status: 404 });
        }

        // Get vault members (smart wallet addresses)
        const { data: members, error: membersError } = await supabase
            .from("shout_vault_members")
            .select("smart_wallet_address")
            .eq("vault_id", vaultId)
            .eq("status", "active");

        if (membersError || !members || members.length === 0) {
            return NextResponse.json({ error: "No active members found" }, { status: 400 });
        }

        const ownerAddresses = members
            .map(m => m.smart_wallet_address)
            .filter(Boolean) as Address[];

        if (ownerAddresses.length === 0) {
            return NextResponse.json({ error: "No valid owner addresses found" }, { status: 400 });
        }

        // Calculate the correct address using the new (fixed) method
        const saltNonce = BigInt(vault.salt_nonce || "0");
        const correctAddress = await getMultiSigSafeAddress(
            ownerAddresses,
            vault.threshold,
            vault.chain_id,
            saltNonce
        );

        const oldAddress = vault.safe_address;
        const addressChanged = correctAddress.toLowerCase() !== oldAddress.toLowerCase();

        // Check if either address has funds
        const oldDeployed = await isSafeDeployed(oldAddress as Address, vault.chain_id);
        const newDeployed = await isSafeDeployed(correctAddress, vault.chain_id);

        const result = {
            vaultId: vault.id,
            vaultName: vault.name,
            chainId: vault.chain_id,
            threshold: vault.threshold,
            owners: ownerAddresses,
            saltNonce: vault.salt_nonce,
            oldAddress,
            correctAddress,
            addressChanged,
            oldAddressDeployed: oldDeployed,
            newAddressDeployed: newDeployed,
            dryRun,
            updated: false,
            warning: null as string | null,
        };

        // Check for potential issues
        if (oldDeployed) {
            result.warning = "WARNING: Old address has deployed contract. This vault may have funds at the old address!";
        }

        if (!dryRun && addressChanged) {
            // Safety check: don't update if old address is deployed (has funds)
            if (oldDeployed) {
                return NextResponse.json({
                    ...result,
                    error: "Cannot update: Old address has deployed contract with potential funds",
                }, { status: 400 });
            }

            // Update the vault with the correct address
            const { error: updateError } = await supabase
                .from("shout_vaults")
                .update({
                    safe_address: correctAddress.toLowerCase(),
                    is_deployed: newDeployed, // Update deployment status too
                })
                .eq("id", vaultId);

            if (updateError) {
                console.error("[Admin Fix Address] Update error:", updateError);
                return NextResponse.json({ error: "Failed to update vault" }, { status: 500 });
            }

            result.updated = true;
            console.log(`[Admin Fix Address] Updated vault ${vaultId} address from ${oldAddress} to ${correctAddress}`);
        }

        return NextResponse.json(result);
    } catch (error) {
        console.error("[Admin Fix Address] Error:", error);
        return NextResponse.json({ error: "Failed to fix address" }, { status: 500 });
    }
}
