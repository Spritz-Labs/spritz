import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/user/messaging-keys — Return the authenticated user's encrypted messaging keys.
 * These columns are restricted from the anon Supabase role for security.
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userAddress = session.userAddress.toLowerCase();

    const { data, error } = await supabase
        .from("shout_user_settings")
        .select("messaging_public_key, messaging_private_key_encrypted, messaging_backup_encrypted, messaging_backup_salt, messaging_backup_enabled")
        .eq("wallet_address", userAddress)
        .maybeSingle();

    if (error) {
        return NextResponse.json({ error: "Failed to fetch messaging keys" }, { status: 500 });
    }

    return NextResponse.json({
        messaging_public_key: data?.messaging_public_key ?? null,
        messaging_private_key_encrypted: data?.messaging_private_key_encrypted ?? null,
        messaging_backup_encrypted: data?.messaging_backup_encrypted ?? null,
        messaging_backup_salt: data?.messaging_backup_salt ?? null,
        messaging_backup_enabled: data?.messaging_backup_enabled ?? false,
    });
}
