import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

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

/**
 * GET /api/admin/ens — Get ENS config + stats
 */
export async function GET(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session || !(await isAdmin(session.userAddress))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: config } = await supabase
        .from("shout_ens_config")
        .select("*")
        .limit(1)
        .maybeSingle();

    const { count: totalClaimed } = await supabase
        .from("shout_users")
        .select("id", { count: "exact", head: true })
        .not("ens_subname_claimed_at", "is", null);

    const { count: eligibleCount } = await supabase
        .from("shout_users")
        .select("id", { count: "exact", head: true })
        .not("username", "is", null)
        .in("wallet_type", ["wallet", "evm", "passkey"]);

    const { data: recentClaims } = await supabase
        .from("shout_users")
        .select("username, wallet_address, wallet_type, ens_subname_claimed_at, ens_resolve_address")
        .not("ens_subname_claimed_at", "is", null)
        .order("ens_subname_claimed_at", { ascending: false })
        .limit(20);

    const host = request.headers.get("host") || "";
    const xfProto = request.headers.get("x-forwarded-proto");
    const isLocal =
        host.includes("localhost") || host.startsWith("127.");
    const proto =
        xfProto || (isLocal ? "http" : "https");
    const appOrigin = host
        ? `${proto}://${host}`
        : process.env.NEXT_PUBLIC_APP_URL || "https://app.spritz.chat";
    const recommendedGatewayUrl = `${appOrigin.replace(/\/$/, "")}/api/ens/ccip-gateway?sender={sender}&data={data}`;

    return NextResponse.json({
        config: config || null,
        stats: {
            totalClaimed: totalClaimed || 0,
            eligibleCount: eligibleCount || 0,
        },
        recentClaims: recentClaims || [],
        setup: {
            appOrigin,
            recommendedGatewayUrl,
            ensManagerUrl: `https://app.ens.domains/${encodeURIComponent((config?.parent_name as string) || "spritz.eth")}`,
            docsUrl: "https://docs.ens.domains/resolvers/ccip-read",
            contractPath: "contracts/SpritzENSResolver.sol",
        },
    });
}

/**
 * PATCH /api/admin/ens — Update ENS config
 */
export async function PATCH(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session || !(await isAdmin(session.userAddress))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: existing } = await supabase
        .from("shout_ens_config")
        .select("id")
        .limit(1)
        .maybeSingle();

    const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        updated_by: session.userAddress.toLowerCase(),
    };

    if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
    if (typeof body.gateway_url === "string") updates.gateway_url = body.gateway_url.trim();
    if (typeof body.parent_name === "string") updates.parent_name = body.parent_name.trim();
    if (typeof body.resolver_address === "string") updates.resolver_address = body.resolver_address.trim();
    if (typeof body.signer_address === "string") updates.signer_address = body.signer_address.trim();
    if (typeof body.ttl === "number") updates.ttl = body.ttl;

    if (existing) {
        const { error } = await supabase
            .from("shout_ens_config")
            .update(updates)
            .eq("id", existing.id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
        const { error } = await supabase
            .from("shout_ens_config")
            .insert({ ...updates, parent_name: "spritz.eth", gateway_url: "https://app.spritz.chat/api/ens/ccip-gateway" });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
