import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * GET /api/passkey/credential
 * 
 * Get the user's passkey credential with Safe signer information.
 * This is used by the client to enable passkey signing for Safe transactions.
 */
export async function GET(request: NextRequest) {
    // Require authentication
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 }
        );
    }

    // Check if user logged in with passkey
    if (session.authMethod !== "passkey") {
        return NextResponse.json(
            { error: "Not authenticated with passkey" },
            { status: 400 }
        );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userAddress = session.userAddress.toLowerCase();

    try {
        // First, get the most recently USED credential (the one they just logged in with)
        const { data: recentCredential } = await supabase
            .from("passkey_credentials")
            .select("credential_id, public_key_x, public_key_y, safe_signer_address, display_name, backed_up, last_used_at")
            .eq("user_address", userAddress)
            .order("last_used_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .single();

        // If the recently used credential has P256 coordinates, use it
        if (recentCredential?.public_key_x && recentCredential?.public_key_y) {
            console.log("[Passkey] Using most recently used credential:", recentCredential.credential_id.slice(0, 20) + "...");
            return NextResponse.json({
                credentialId: recentCredential.credential_id,
                publicKeyX: recentCredential.public_key_x,
                publicKeyY: recentCredential.public_key_y,
                safeSignerAddress: recentCredential.safe_signer_address,
                displayName: recentCredential.display_name,
                backedUp: recentCredential.backed_up,
                safeSignerReady: true,
            });
        }

        // Otherwise, try to find ANY credential with P256 coordinates
        const { data: credential, error } = await supabase
            .from("passkey_credentials")
            .select("credential_id, public_key_x, public_key_y, safe_signer_address, display_name, backed_up")
            .eq("user_address", userAddress)
            .not("public_key_x", "is", null)
            .order("last_used_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .single();

        if (error || !credential) {
            // No credential with P256 coordinates found
            if (recentCredential) {
                // User has credentials but none with P256 support
                console.log("[Passkey] User has credentials but none with P256 support");
                return NextResponse.json({
                    credentialId: recentCredential.credential_id,
                    displayName: recentCredential.display_name,
                    backedUp: recentCredential.backed_up,
                    safeSignerReady: false,
                    message: "Your current passkey was registered before Safe wallet support. Please delete and re-register your passkey to enable sending.",
                });
            }
            
            console.error("[Passkey] No credential found for user:", userAddress);
            return NextResponse.json(
                { error: "No passkey credential found" },
                { status: 404 }
            );
        }

        // Found a credential with P256 support, but it's not the one they logged in with
        // This means they need to use a different passkey
        console.log("[Passkey] Found P256 credential but it's different from login credential");
        console.log("[Passkey] Login credential:", recentCredential?.credential_id?.slice(0, 20) + "...");
        console.log("[Passkey] P256 credential:", credential.credential_id.slice(0, 20) + "...");
        
        return NextResponse.json({
            credentialId: credential.credential_id,
            publicKeyX: credential.public_key_x,
            publicKeyY: credential.public_key_y,
            safeSignerAddress: credential.safe_signer_address,
            displayName: credential.display_name,
            backedUp: credential.backed_up,
            safeSignerReady: true,
            // Warn that this might not be the credential they logged in with
            warning: "The passkey used for login is different from the one linked to your Safe wallet. Make sure to use the correct passkey when signing transactions.",
        });

    } catch (err) {
        console.error("[Passkey] Error fetching credential:", err);
        return NextResponse.json(
            { error: "Failed to fetch credential" },
            { status: 500 }
        );
    }
}
