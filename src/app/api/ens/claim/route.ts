import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/session";
import {
    checkEnsEligibility,
    getEnsFundsCopy,
    isValidSubname,
    type UserRow,
} from "@/lib/ensEligibility";
import {
    backfillShoutUserUsernameIfMissing,
    resolveSpritzUsername,
} from "@/lib/ensUserUsername";
import { tryAutoClaimEnsSubnameForEoa } from "@/lib/ensAutoClaimForEoa";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function eoaOnlyClaimsEnabled(): boolean {
    return process.env.ENS_SUBNAME_EOA_ONLY === "true";
}

/**
 * POST /api/ens/claim — Authenticated user claims username.spritz.eth
 */
export async function POST(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: config } = await supabase
        .from("shout_ens_config")
        .select("enabled")
        .limit(1)
        .maybeSingle();

    if (!config?.enabled) {
        return NextResponse.json({ error: "ENS subnames are not currently enabled" }, { status: 503 });
    }

    const userAddress = session.userAddress.toLowerCase();

    const { data: user } = await supabase
        .from("shout_users")
        .select("wallet_address, smart_wallet_address, username, wallet_type, is_banned, ens_subname_claimed_at")
        .eq("wallet_address", userAddress)
        .maybeSingle();

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const wasClaimedBeforeRequest = !!user.ens_subname_claimed_at;

    let resolvedUsername = await resolveSpritzUsername(supabase, userAddress, user.username);
    await backfillShoutUserUsernameIfMissing(supabase, userAddress, user.username, resolvedUsername);

    await tryAutoClaimEnsSubnameForEoa(supabase, userAddress);

    const { data: userAfterAuto } = await supabase
        .from("shout_users")
        .select(
            "wallet_address, smart_wallet_address, username, wallet_type, is_banned, ens_subname_claimed_at, ens_resolve_address"
        )
        .eq("wallet_address", userAddress)
        .maybeSingle();

    const row = userAfterAuto ?? user;

    resolvedUsername = await resolveSpritzUsername(supabase, userAddress, row.username);
    await backfillShoutUserUsernameIfMissing(supabase, userAddress, row.username, resolvedUsername);

    const userForEns: UserRow = {
        ...(row as UserRow),
        username: resolvedUsername ?? row.username ?? null,
    };

    if (row.ens_subname_claimed_at) {
        if (wasClaimedBeforeRequest) {
            return NextResponse.json(
                { error: "Already claimed", subname: `${userForEns.username}.spritz.eth` },
                { status: 409 }
            );
        }
        return NextResponse.json({
            success: true,
            subname: `${userForEns.username}.spritz.eth`,
            resolveAddress: row.ens_resolve_address,
        });
    }

    if (!userForEns.username || !isValidSubname(userForEns.username)) {
        return NextResponse.json({ error: "Set a valid username first (2-32 chars, a-z, 0-9, underscore)" }, { status: 400 });
    }

    const eligibility = checkEnsEligibility(userForEns, {
        eoaOnlyClaims: eoaOnlyClaimsEnabled(),
    });
    if (!eligibility.eligible) {
        return NextResponse.json({ error: eligibility.reason }, { status: 403 });
    }

    const { error: updateError } = await supabase
        .from("shout_users")
        .update({
            ens_subname_claimed_at: new Date().toISOString(),
            ens_resolve_address: eligibility.resolveAddress,
            ...(row.username?.trim() ? {} : { username: userForEns.username }),
        })
        .eq("wallet_address", userAddress);

    if (updateError) {
        return NextResponse.json({ error: "Failed to claim subname" }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        subname: `${userForEns.username}.spritz.eth`,
        resolveAddress: eligibility.resolveAddress,
    });
}

/**
 * GET /api/ens/claim — Check eligibility for current user
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userAddress = session.userAddress.toLowerCase();

    const { data: config } = await supabase
        .from("shout_ens_config")
        .select("enabled, parent_name")
        .limit(1)
        .maybeSingle();

    const { data: user } = await supabase
        .from("shout_users")
        .select("wallet_address, smart_wallet_address, username, wallet_type, is_banned, ens_subname_claimed_at, ens_resolve_address")
        .eq("wallet_address", userAddress)
        .maybeSingle();

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let resolvedUsername = await resolveSpritzUsername(supabase, userAddress, user.username);
    await backfillShoutUserUsernameIfMissing(supabase, userAddress, user.username, resolvedUsername);

    await tryAutoClaimEnsSubnameForEoa(supabase, userAddress);

    const { data: userFresh } = await supabase
        .from("shout_users")
        .select(
            "wallet_address, smart_wallet_address, username, wallet_type, is_banned, ens_subname_claimed_at, ens_resolve_address"
        )
        .eq("wallet_address", userAddress)
        .maybeSingle();

    const row = userFresh ?? user;

    resolvedUsername = await resolveSpritzUsername(supabase, userAddress, row.username);
    await backfillShoutUserUsernameIfMissing(supabase, userAddress, row.username, resolvedUsername);

    const userForEns: UserRow = {
        ...(row as UserRow),
        username: resolvedUsername ?? row.username ?? null,
    };

    const eoaOnly = eoaOnlyClaimsEnabled();
    const eligibility = checkEnsEligibility(userForEns, { eoaOnlyClaims: eoaOnly });
    const { resolveTarget, fundsNotice } = getEnsFundsCopy(userForEns);
    const parentName = config?.parent_name || "spritz.eth";

    const claimed = !!row.ens_subname_claimed_at;
    const displayUsername = userForEns.username;
    return NextResponse.json({
        enabled: config?.enabled || false,
        eligible: eligibility.eligible,
        reason: eligibility.reason,
        claimed,
        parentName,
        subname: claimed && displayUsername ? `${displayUsername}.${parentName}` : null,
        suggestedSubname:
            !claimed && displayUsername ? `${displayUsername}.${parentName}` : null,
        resolveAddress: row.ens_resolve_address || eligibility.resolveAddress,
        username: displayUsername,
        walletType: user.wallet_type,
        resolveTarget,
        fundsNotice,
        eoaOnlyMode: eoaOnly,
    });
}
