import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/session";
import { logAccess } from "@/lib/auditLog";
import { supabaseService } from "@/lib/supabaseServer";

/**
 * GET /api/user/messaging-keys — Return the authenticated user's encrypted messaging keys.
 * These columns are restricted from the anon Supabase role for security.
 */
export async function GET(request: NextRequest) {
    const session = await requireAuth(request);
    if (session instanceof NextResponse) return session;

    if (!supabaseService) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 503 }
        );
    }

    const userAddress = session.userAddress.toLowerCase();

    logAccess(request, "messaging_keys.read", {
        userAddress,
        resourceTable: "shout_user_settings",
    });

    const { data, error } = await supabaseService
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
