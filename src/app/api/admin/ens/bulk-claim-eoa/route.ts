import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkEnsEligibility, isValidSubname, type UserRow } from "@/lib/ensEligibility";
import {
    backfillShoutUserUsernameIfMissing,
    resolveSpritzUsername,
} from "@/lib/ensUserUsername";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function isAdmin(address: string): Promise<boolean> {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data } = await supabase
        .from("shout_admins")
        .select("id")
        .eq("wallet_address", address.toLowerCase())
        .single();
    return !!data;
}

type ShoutUserRow = {
    wallet_address: string;
    smart_wallet_address: string | null;
    username: string | null;
    wallet_type: string | null;
    is_banned: boolean | null;
    ens_subname_claimed_at: string | null;
};

/**
 * POST /api/admin/ens/bulk-claim-eoa
 * Auto-claim username.spritz.eth for users who:
 * - wallet_type is wallet or evm (EOA)
 * - not banned, not already claimed
 * - have a valid Spritz username (shout_users or shout_usernames)
 * - pass normal ENS eligibility (EOA → resolve to wallet_address)
 *
 * Body: { dryRun?: boolean } (default false)
 */
export async function POST(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session || !(await isAdmin(session.userAddress))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: config } = await supabase
        .from("shout_ens_config")
        .select("enabled")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!config?.enabled) {
        return NextResponse.json(
            { error: "Enable ENS subnames in admin before running bulk claim" },
            { status: 400 }
        );
    }

    const pageSize = 500;
    let examined = 0;
    let wouldClaim = 0;
    let claimed = 0;
    const errors: string[] = [];

    const fetchBatch = async (from: number) =>
        supabase
            .from("shout_users")
            .select(
                "wallet_address, smart_wallet_address, username, wallet_type, is_banned, ens_subname_claimed_at"
            )
            .in("wallet_type", ["wallet", "evm"])
            .is("ens_subname_claimed_at", null)
            .or("is_banned.is.null,is_banned.eq.false")
            .order("wallet_address", { ascending: true })
            .range(from, from + pageSize - 1);

    type RowOutcome = "skip" | "eligible" | "claimed" | "error";

    const processRow = async (row: ShoutUserRow, mode: "dry" | "live"): Promise<RowOutcome> => {
        examined++;
        const addr = row.wallet_address.toLowerCase();

        const resolved = await resolveSpritzUsername(supabase, addr, row.username);
        if (mode === "live") {
            await backfillShoutUserUsernameIfMissing(supabase, addr, row.username, resolved);
        }

        const userForEns: UserRow = {
            wallet_address: addr,
            smart_wallet_address: row.smart_wallet_address,
            username: resolved ?? row.username ?? null,
            wallet_type: row.wallet_type,
            is_banned: row.is_banned ?? false,
            ens_subname_claimed_at: null,
        };

        if (!userForEns.username || !isValidSubname(userForEns.username)) {
            return "skip";
        }

        const eligibility = checkEnsEligibility(userForEns);
        if (!eligibility.eligible || !eligibility.resolveAddress) {
            return "skip";
        }

        if (eligibility.resolveAddress.toLowerCase() !== addr) {
            return "skip";
        }

        if (mode === "dry") {
            return "eligible";
        }

        const { error: upErr } = await supabase
            .from("shout_users")
            .update({
                ens_subname_claimed_at: new Date().toISOString(),
                ens_resolve_address: eligibility.resolveAddress,
                ...(row.username?.trim() ? {} : { username: userForEns.username }),
            })
            .eq("wallet_address", addr)
            .is("ens_subname_claimed_at", null);

        if (upErr) {
            errors.push(`${addr}: ${upErr.message}`);
            return "error";
        }
        return "claimed";
    };

    if (dryRun) {
        let from = 0;
        while (true) {
            const { data: batch, error: batchError } = await fetchBatch(from);
            if (batchError) {
                return NextResponse.json({ error: batchError.message }, { status: 500 });
            }
            if (!batch?.length) break;
            for (const row of batch as ShoutUserRow[]) {
                const out = await processRow(row, "dry");
                if (out === "eligible") wouldClaim++;
            }
            from += pageSize;
        }
    } else {
        // Always take page 0: claiming removes rows from this filter, so offset pagination would skip.
        while (true) {
            const { data: batch, error: batchError } = await fetchBatch(0);
            if (batchError) {
                return NextResponse.json({ error: batchError.message }, { status: 500 });
            }
            if (!batch?.length) break;

            for (const row of batch as ShoutUserRow[]) {
                const out = await processRow(row, "live");
                if (out === "claimed") {
                    wouldClaim++;
                    claimed++;
                } else if (out === "error") {
                    wouldClaim++;
                }
            }
        }
    }

    return NextResponse.json({
        dryRun,
        examined,
        wouldClaim,
        claimed: dryRun ? 0 : claimed,
        errors: errors.slice(0, 50),
        errorCount: errors.length,
    });
}
