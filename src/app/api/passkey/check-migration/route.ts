import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// POST: Check if a user needs migration (has old system credentials but no new ones)
// This is called from the client to help diagnose issues
export async function POST(request: NextRequest) {
    try {
        const { userAddress, hasOldCredentials, oldDeviceId } = await request.json();

        if (!userAddress) {
            return NextResponse.json({ error: "User address required" }, { status: 400 });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Check if user has credentials in the new system
        const { data: newCredentials, error } = await supabase
            .from("passkey_credentials")
            .select("credential_id, created_at, backed_up")
            .eq("user_address", userAddress.toLowerCase());

        if (error) {
            console.error("[PasskeyMigration] Error checking credentials:", error);
            return NextResponse.json({ error: "Failed to check credentials" }, { status: 500 });
        }

        // Check if user exists in shout_users
        const { data: user } = await supabase
            .from("shout_users")
            .select("wallet_address, email, email_verified, created_at")
            .eq("wallet_address", userAddress.toLowerCase())
            .single();

        const hasNewCredentials = newCredentials && newCredentials.length > 0;
        const needsMigration = hasOldCredentials && !hasNewCredentials;

        return NextResponse.json({
            userAddress: userAddress.toLowerCase(),
            hasNewCredentials,
            newCredentialsCount: newCredentials?.length || 0,
            hasOldCredentials: !!hasOldCredentials,
            needsMigration,
            userExists: !!user,
            hasVerifiedEmail: user?.email_verified || false,
            status: needsMigration 
                ? "NEEDS_MIGRATION" 
                : hasNewCredentials 
                    ? "MIGRATED" 
                    : "NO_PASSKEY",
            message: needsMigration
                ? "User has old localStorage credentials but no server-side credentials. Will auto-migrate on login."
                : hasNewCredentials
                    ? "User has server-side credentials. Good to go!"
                    : "User has no passkey credentials.",
        });
    } catch (error) {
        console.error("[PasskeyMigration] Error:", error);
        return NextResponse.json({ error: "Failed to check migration status" }, { status: 500 });
    }
}

// GET: Check migration status by address (admin use)
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get("address");

    if (!userAddress) {
        return NextResponse.json({ error: "Address required" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check credentials
    const { data: credentials } = await supabase
        .from("passkey_credentials")
        .select("*")
        .eq("user_address", userAddress.toLowerCase());

    // Check user
    const { data: user } = await supabase
        .from("shout_users")
        .select("wallet_address, email, email_verified, created_at, wallet_type")
        .eq("wallet_address", userAddress.toLowerCase())
        .single();

    return NextResponse.json({
        userAddress: userAddress.toLowerCase(),
        user: user || null,
        credentials: credentials || [],
        hasCredentials: (credentials?.length || 0) > 0,
        isPreMigrationUser: user && new Date(user.created_at) < new Date("2026-01-09T12:30:00Z"),
    });
}
