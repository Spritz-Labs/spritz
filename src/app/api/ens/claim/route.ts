import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/session";
import { checkEnsEligibility, isValidSubname, type UserRow } from "@/lib/ensEligibility";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Spritz username lives in shout_usernames; ENS eligibility historically read shout_users.username only.
 * Merge so existing accounts work, and backfill shout_users when missing.
 */
async function resolveSpritzUsername(
    supabase: SupabaseClient,
    walletAddress: string,
    rowUsername: string | null
): Promise<string | null> {
    const trimmed = rowUsername?.trim();
    if (trimmed) return trimmed;
    const { data } = await supabase
        .from("shout_usernames")
        .select("username")
        .eq("wallet_address", walletAddress)
        .maybeSingle();
    return data?.username?.trim() || null;
}

async function backfillShoutUserUsernameIfMissing(
    supabase: SupabaseClient,
    walletAddress: string,
    rowUsername: string | null,
    resolved: string | null
) {
    if (!resolved || rowUsername?.trim()) return;
    const { error } = await supabase
        .from("shout_users")
        .update({ username: resolved })
        .eq("wallet_address", walletAddress);
    if (error) {
        console.error("[ENS claim] shout_users username backfill error:", error);
    }
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

    const resolvedUsername = await resolveSpritzUsername(supabase, userAddress, user.username);
    await backfillShoutUserUsernameIfMissing(supabase, userAddress, user.username, resolvedUsername);

    const userForEns: UserRow = {
        ...(user as UserRow),
        username: resolvedUsername ?? user.username ?? null,
    };

    if (user.ens_subname_claimed_at) {
        return NextResponse.json(
            { error: "Already claimed", subname: `${userForEns.username}.spritz.eth` },
            { status: 409 }
        );
    }

    if (!userForEns.username || !isValidSubname(userForEns.username)) {
        return NextResponse.json({ error: "Set a valid username first (2-32 chars, a-z, 0-9, underscore)" }, { status: 400 });
    }

    const eligibility = checkEnsEligibility(userForEns);
    if (!eligibility.eligible) {
        return NextResponse.json({ error: eligibility.reason }, { status: 403 });
    }

    const { error: updateError } = await supabase
        .from("shout_users")
        .update({
            ens_subname_claimed_at: new Date().toISOString(),
            ens_resolve_address: eligibility.resolveAddress,
            ...(user.username?.trim() ? {} : { username: userForEns.username }),
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

    const resolvedUsername = await resolveSpritzUsername(supabase, userAddress, user.username);
    await backfillShoutUserUsernameIfMissing(supabase, userAddress, user.username, resolvedUsername);

    const userForEns: UserRow = {
        ...(user as UserRow),
        username: resolvedUsername ?? user.username ?? null,
    };

    const eligibility = checkEnsEligibility(userForEns);
    const parentName = config?.parent_name || "spritz.eth";

    const claimed = !!user.ens_subname_claimed_at;
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
        resolveAddress: user.ens_resolve_address || eligibility.resolveAddress,
        username: displayUsername,
        walletType: user.wallet_type,
    });
}
