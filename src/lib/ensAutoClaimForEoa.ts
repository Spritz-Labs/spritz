import type { SupabaseClient } from "@supabase/supabase-js";
import {
    checkEnsEligibility,
    isValidSubname,
    type UserRow,
} from "@/lib/ensEligibility";
import {
    backfillShoutUserUsernameIfMissing,
    resolveSpritzUsername,
} from "@/lib/ensUserUsername";

function eoaOnlyClaimsEnabled(): boolean {
    return process.env.ENS_SUBNAME_EOA_ONLY === "true";
}

function isEoaWalletType(walletType: string | null | undefined): boolean {
    const wt = (walletType || "wallet").toLowerCase();
    return wt === "wallet" || wt === "evm";
}

/**
 * After a Spritz username is saved, reserve username.spritz.eth in our resolver DB for EOA accounts
 * (wallet_type wallet/evm) so the on-chain name always matches the in-app username without a separate claim step.
 * Best-effort: logs and returns on failure; does not throw.
 */
export async function tryAutoClaimEnsSubnameForEoa(
    supabase: SupabaseClient,
    walletAddress: string
): Promise<void> {
    if (!walletAddress.startsWith("0x")) {
        return;
    }

    const addr = walletAddress.toLowerCase();

    try {
        const { data: config } = await supabase
            .from("shout_ens_config")
            .select("enabled")
            .limit(1)
            .maybeSingle();

        if (!config?.enabled) {
            return;
        }

        const { data: row } = await supabase
            .from("shout_users")
            .select(
                "wallet_address, smart_wallet_address, username, wallet_type, is_banned, ens_subname_claimed_at"
            )
            .eq("wallet_address", addr)
            .maybeSingle();

        if (!row) {
            return;
        }

        if (!isEoaWalletType(row.wallet_type)) {
            return;
        }

        if (row.ens_subname_claimed_at) {
            return;
        }

        const resolvedUsername = await resolveSpritzUsername(
            supabase,
            addr,
            row.username
        );
        await backfillShoutUserUsernameIfMissing(
            supabase,
            addr,
            row.username,
            resolvedUsername
        );

        const userForEns: UserRow = {
            ...(row as UserRow),
            username: resolvedUsername ?? row.username ?? null,
        };

        if (!userForEns.username || !isValidSubname(userForEns.username)) {
            return;
        }

        const eligibility = checkEnsEligibility(userForEns, {
            eoaOnlyClaims: eoaOnlyClaimsEnabled(),
        });

        if (!eligibility.eligible || !eligibility.resolveAddress) {
            return;
        }

        if (eligibility.resolveAddress.toLowerCase() !== addr) {
            return;
        }

        const { error: updateError } = await supabase
            .from("shout_users")
            .update({
                ens_subname_claimed_at: new Date().toISOString(),
                ens_resolve_address: eligibility.resolveAddress,
                ...(row.username?.trim() ? {} : { username: userForEns.username }),
            })
            .eq("wallet_address", addr)
            .is("ens_subname_claimed_at", null);

        if (updateError) {
            console.error("[ENS] Auto-claim after username set failed:", updateError.message);
        }
    } catch (e) {
        console.error("[ENS] Auto-claim after username set error:", e);
    }
}
