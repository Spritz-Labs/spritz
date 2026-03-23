import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/session";
import { checkEnsEligibility, isValidSubname, type UserRow } from "@/lib/ensEligibility";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

    if (user.ens_subname_claimed_at) {
        return NextResponse.json({ error: "Already claimed", subname: `${user.username}.spritz.eth` }, { status: 409 });
    }

    if (!user.username || !isValidSubname(user.username)) {
        return NextResponse.json({ error: "Set a valid username first (2-32 chars, a-z, 0-9, underscore)" }, { status: 400 });
    }

    const eligibility = checkEnsEligibility(user as UserRow);
    if (!eligibility.eligible) {
        return NextResponse.json({ error: eligibility.reason }, { status: 403 });
    }

    const { error: updateError } = await supabase
        .from("shout_users")
        .update({
            ens_subname_claimed_at: new Date().toISOString(),
            ens_resolve_address: eligibility.resolveAddress,
        })
        .eq("wallet_address", userAddress);

    if (updateError) {
        return NextResponse.json({ error: "Failed to claim subname" }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        subname: `${user.username}.spritz.eth`,
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

    const eligibility = checkEnsEligibility(user as UserRow);
    const parentName = config?.parent_name || "spritz.eth";

    return NextResponse.json({
        enabled: config?.enabled || false,
        eligible: eligibility.eligible,
        reason: eligibility.reason,
        claimed: !!user.ens_subname_claimed_at,
        subname: user.ens_subname_claimed_at ? `${user.username}.${parentName}` : null,
        resolveAddress: user.ens_resolve_address || eligibility.resolveAddress,
        username: user.username,
        walletType: user.wallet_type,
    });
}
