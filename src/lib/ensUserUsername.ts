import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Spritz username lives in shout_usernames; ENS paths also use shout_users.username.
 * Resolve the effective name and optionally backfill shout_users.
 */
export async function resolveSpritzUsername(
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

export async function backfillShoutUserUsernameIfMissing(
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
        console.error("[ENS] shout_users username backfill error:", error);
    }
}
