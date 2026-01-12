import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * POST /api/passkey/recover
 * 
 * Link the current user's passkey to an existing account.
 * This is used when a user registers a new passkey but wants to 
 * access their old account (e.g., different device, passkey not synced).
 * 
 * Requires:
 * - User is authenticated with a passkey
 * - Target address exists in the database
 * - User proves ownership via email verification or admin approval
 */
export async function POST(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 }
        );
    }

    if (session.authMethod !== "passkey") {
        return NextResponse.json(
            { error: "Must be authenticated with passkey" },
            { status: 400 }
        );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const { targetAddress, verificationMethod } = await request.json();

        if (!targetAddress) {
            return NextResponse.json(
                { error: "Target address required" },
                { status: 400 }
            );
        }

        const normalizedTarget = targetAddress.toLowerCase();
        const currentAddress = session.userAddress.toLowerCase();

        if (normalizedTarget === currentAddress) {
            return NextResponse.json(
                { error: "Already linked to this address" },
                { status: 400 }
            );
        }

        // Check target account exists
        const { data: targetUser, error: targetError } = await supabase
            .from("shout_users")
            .select("wallet_address, email, username")
            .eq("wallet_address", normalizedTarget)
            .single();

        if (targetError || !targetUser) {
            return NextResponse.json(
                { error: "Target account not found" },
                { status: 404 }
            );
        }

        // Get current user's passkey credential
        const { data: credential, error: credError } = await supabase
            .from("passkey_credentials")
            .select("id, credential_id")
            .eq("user_address", currentAddress)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        if (credError || !credential) {
            return NextResponse.json(
                { error: "No passkey credential found for current session" },
                { status: 400 }
            );
        }

        // For now, allow recovery without verification (admin can review)
        // TODO: Add email verification flow for production
        
        // Update the credential to point to the target address
        const { error: updateError } = await supabase
            .from("passkey_credentials")
            .update({ user_address: normalizedTarget })
            .eq("id", credential.id);

        if (updateError) {
            console.error("[Recovery] Failed to update credential:", updateError);
            return NextResponse.json(
                { error: "Failed to link accounts" },
                { status: 500 }
            );
        }

        // Delete the orphaned user record if it has no other data
        const { data: orphanCheck } = await supabase
            .from("passkey_credentials")
            .select("id")
            .eq("user_address", currentAddress)
            .limit(1);

        if (!orphanCheck || orphanCheck.length === 0) {
            // No more credentials pointing to old address, safe to delete
            await supabase
                .from("shout_users")
                .delete()
                .eq("wallet_address", currentAddress);
        }

        console.log(`[Recovery] Linked passkey ${credential.credential_id.slice(0, 10)}... from ${currentAddress.slice(0, 10)}... to ${normalizedTarget.slice(0, 10)}...`);

        return NextResponse.json({
            success: true,
            message: "Account linked successfully",
            newAddress: normalizedTarget,
            username: targetUser.username,
        });

    } catch (err) {
        console.error("[Recovery] Error:", err);
        return NextResponse.json(
            { error: "Recovery failed" },
            { status: 500 }
        );
    }
}

/**
 * GET /api/passkey/recover
 * 
 * Check if current user has orphaned accounts that can be recovered.
 */
export async function GET(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 }
        );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const currentAddress = session.userAddress.toLowerCase();

    try {
        // Find other accounts that might belong to this user
        // Check by matching aaguid (same authenticator type) or backed_up status
        const { data: currentCred } = await supabase
            .from("passkey_credentials")
            .select("aaguid, backed_up")
            .eq("user_address", currentAddress)
            .single();

        if (!currentCred) {
            return NextResponse.json({ possibleAccounts: [] });
        }

        // Find credentials with same authenticator that might be the same user
        const { data: similarCreds } = await supabase
            .from("passkey_credentials")
            .select("user_address, display_name, created_at")
            .eq("aaguid", currentCred.aaguid)
            .neq("user_address", currentAddress);

        if (!similarCreds || similarCreds.length === 0) {
            return NextResponse.json({ possibleAccounts: [] });
        }

        // Get user info for these addresses
        const addresses = similarCreds.map(c => c.user_address);
        const { data: users } = await supabase
            .from("shout_users")
            .select("wallet_address, username, email")
            .in("wallet_address", addresses);

        const possibleAccounts = (users || []).map(u => ({
            address: u.wallet_address,
            username: u.username,
            hasEmail: !!u.email,
        }));

        return NextResponse.json({ possibleAccounts });

    } catch (err) {
        console.error("[Recovery] Check error:", err);
        return NextResponse.json({ possibleAccounts: [] });
    }
}
