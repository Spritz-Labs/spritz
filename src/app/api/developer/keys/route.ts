import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/session";
import { randomBytes } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function generateApiKey(): string {
    return "sk_live_" + randomBytes(32).toString("hex");
}

export async function GET(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
        .from("shout_developer_keys")
        .select("id, name, scopes, rate_limit_per_minute, is_active, last_used_at, created_at, revoked_at")
        .eq("developer_address", session.userAddress)
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 });
    }

    const masked = (data || []).map((key) => ({
        ...key,
        api_key_preview: "sk_live_****" + (key.id?.slice(-4) || ""),
    }));

    return NextResponse.json({ keys: masked });
}

export async function POST(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "Default";
    const scopes = Array.isArray(body.scopes) ? body.scopes.filter((s: unknown) => typeof s === "string") : ["read", "write"];

    const apiKey = generateApiKey();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
        .from("shout_developer_keys")
        .insert({
            developer_address: session.userAddress,
            api_key: apiKey,
            name,
            scopes,
        })
        .select("id, name, scopes, rate_limit_per_minute, created_at")
        .single();

    if (error) {
        return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
    }

    return NextResponse.json({
        key: {
            ...data,
            api_key: apiKey,
        },
        warning: "Store this API key securely. It will not be shown again.",
    });
}
