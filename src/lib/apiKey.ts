import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export interface DeveloperKeyInfo {
    id: string;
    developerAddress: string;
    name: string;
    scopes: string[];
    rateLimitPerMinute: number;
}

const cache = new Map<string, { info: DeveloperKeyInfo; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getSupabase() {
    if (!supabaseUrl || !supabaseServiceKey) return null;
    return createClient(supabaseUrl, supabaseServiceKey);
}

export async function validateApiKey(request: NextRequest): Promise<DeveloperKeyInfo | null> {
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey) return null;

    const cached = cache.get(apiKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.info;
    }

    const supabase = getSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
        .from("shout_developer_keys")
        .select("id, developer_address, name, scopes, rate_limit_per_minute, is_active, revoked_at, approved_at")
        .eq("api_key", apiKey)
        .single();

    // v1: keys must be approved by an admin before they can be used
    if (error || !data || !data.is_active || data.revoked_at || data.approved_at == null) {
        cache.delete(apiKey);
        return null;
    }

    const info: DeveloperKeyInfo = {
        id: data.id,
        developerAddress: data.developer_address,
        name: data.name,
        scopes: data.scopes,
        rateLimitPerMinute: data.rate_limit_per_minute,
    };

    cache.set(apiKey, { info, expiresAt: Date.now() + CACHE_TTL_MS });

    supabase
        .from("shout_developer_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", data.id)
        .then(() => {});

    return info;
}

export function hasApiKey(request: NextRequest): boolean {
    return !!request.headers.get("x-api-key");
}
