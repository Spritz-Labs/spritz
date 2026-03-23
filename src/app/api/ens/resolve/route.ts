import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkEnsEligibility, type UserRow } from "@/lib/ensEligibility";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/ens/resolve?name=alice.spritz.eth
 * Public endpoint — resolves a spritz.eth subname to its data.
 * Also used by admin to test resolution.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name")?.toLowerCase();

    if (!name) {
        return NextResponse.json({ error: "Missing ?name= parameter" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: config } = await supabase
        .from("shout_ens_config")
        .select("*")
        .limit(1)
        .maybeSingle();

    if (!config) {
        return NextResponse.json({ error: "ENS not configured" }, { status: 503 });
    }

    const parentName = config.parent_name || "spritz.eth";
    const suffix = `.${parentName}`;

    if (!name.endsWith(suffix)) {
        return NextResponse.json({ error: `Name must end with ${suffix}` }, { status: 400 });
    }

    const username = name.slice(0, name.length - suffix.length);
    if (!username || username.includes(".")) {
        return NextResponse.json({ error: "Invalid subname" }, { status: 400 });
    }

    const { data: user } = await supabase
        .from("shout_users")
        .select("wallet_address, smart_wallet_address, username, display_name, avatar_url, wallet_type, ens_subname_claimed_at, ens_resolve_address, is_banned")
        .eq("username", username)
        .maybeSingle();

    if (!user) {
        return NextResponse.json({ found: false, name, username });
    }

    const eligibility = checkEnsEligibility(user as UserRow);
    const claimed = !!user.ens_subname_claimed_at;

    return NextResponse.json({
        found: true,
        name,
        username: user.username,
        claimed,
        eligible: eligibility.eligible,
        reason: eligibility.reason,
        resolveAddress: claimed
            ? user.ens_resolve_address || user.smart_wallet_address || user.wallet_address
            : null,
        walletType: user.wallet_type,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        enabled: config.enabled,
    });
}
