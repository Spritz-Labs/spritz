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
 * POST /api/admin/vault/sync-deployment
 * 
 * Admin endpoint to sync vault deployment status with on-chain state.
 * Checks each vault's Safe address on-chain and updates the database accordingly.
 * 
 * Body: { vaultId?: string } - Optional specific vault ID to sync
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

        const body = await request.json().catch(() => ({}));
        const { vaultId } = body;

        // Get vaults to check
        let query = supabase
            .from("shout_vaults")
            .select("id, name, safe_address, chain_id, is_deployed");

        if (vaultId) {
            query = query.eq("id", vaultId);
        } else {
            // Only check vaults that are marked as not deployed
            query = query.eq("is_deployed", false);
        }

        const { data: vaults, error: vaultsError } = await query;

        if (vaultsError) {
            console.error("[Admin Vault Sync] Error fetching vaults:", vaultsError);
            return NextResponse.json({ error: "Failed to fetch vaults" }, { status: 500 });
        }

        if (!vaults || vaults.length === 0) {
            return NextResponse.json({ 
                message: "No vaults to sync",
                synced: 0,
                checked: 0 
            });
        }

        const results = {
            checked: 0,
            synced: 0,
            details: [] as Array<{
                id: string;
                name: string;
                safeAddress: string;
                wasDeployed: boolean;
                nowDeployed: boolean;
                updated: boolean;
            }>
        };

        for (const vault of vaults) {
            results.checked++;
            
            try {
                const deployedOnChain = await isSafeDeployed(
                    vault.safe_address as Address, 
                    vault.chain_id
                );

                const detail = {
                    id: vault.id,
                    name: vault.name,
                    safeAddress: vault.safe_address,
                    wasDeployed: vault.is_deployed,
                    nowDeployed: deployedOnChain,
                    updated: false,
                };

                // If deployed on-chain but not in DB, update
                if (deployedOnChain && !vault.is_deployed) {
                    const { error: updateError } = await supabase
                        .from("shout_vaults")
                        .update({ is_deployed: true })
                        .eq("id", vault.id);

                    if (!updateError) {
                        detail.updated = true;
                        results.synced++;
                        console.log(`[Admin Vault Sync] Updated vault ${vault.id} (${vault.name}) as deployed`);
                    } else {
                        console.error(`[Admin Vault Sync] Failed to update vault ${vault.id}:`, updateError);
                    }
                }

                results.details.push(detail);
            } catch (err) {
                console.error(`[Admin Vault Sync] Error checking vault ${vault.id}:`, err);
                results.details.push({
                    id: vault.id,
                    name: vault.name,
                    safeAddress: vault.safe_address,
                    wasDeployed: vault.is_deployed,
                    nowDeployed: false,
                    updated: false,
                });
            }
        }

        console.log(`[Admin Vault Sync] Completed: checked ${results.checked}, synced ${results.synced}`);

        return NextResponse.json({
            message: `Synced ${results.synced} of ${results.checked} vaults`,
            ...results
        });
    } catch (error) {
        console.error("[Admin Vault Sync] Error:", error);
        return NextResponse.json({ error: "Failed to sync vaults" }, { status: 500 });
    }
}
