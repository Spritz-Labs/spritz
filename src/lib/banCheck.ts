import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Check if a user is banned. Returns true if banned.
 * Used in message send APIs to prevent banned users from posting.
 */
export async function isUserBanned(userAddress: string): Promise<boolean> {
    if (!supabaseUrl || !supabaseServiceKey) return false;

    try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data } = await supabase
            .from("shout_users")
            .select("is_banned")
            .eq("wallet_address", userAddress.toLowerCase())
            .single();

        return data?.is_banned === true;
    } catch {
        return false;
    }
}
