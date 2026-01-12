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
        // Get the user's passkey credential
        const { data: credential, error } = await supabase
            .from("passkey_credentials")
            .select("credential_id, public_key_x, public_key_y, safe_signer_address, display_name, backed_up")
            .eq("user_address", userAddress)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        if (error || !credential) {
            console.error("[Passkey] No credential found for user:", userAddress);
            return NextResponse.json(
                { error: "No passkey credential found" },
                { status: 404 }
            );
        }

        // Check if Safe signer info is available
        if (!credential.public_key_x || !credential.public_key_y) {
            return NextResponse.json({
                credentialId: credential.credential_id,
                displayName: credential.display_name,
                backedUp: credential.backed_up,
                safeSignerReady: false,
                message: "Passkey was registered before Safe signer support. Please re-register to enable Safe transactions.",
            });
        }

        return NextResponse.json({
            credentialId: credential.credential_id,
            publicKeyX: credential.public_key_x,
            publicKeyY: credential.public_key_y,
            safeSignerAddress: credential.safe_signer_address,
            displayName: credential.display_name,
            backedUp: credential.backed_up,
            safeSignerReady: true,
        });

    } catch (err) {
        console.error("[Passkey] Error fetching credential:", err);
        return NextResponse.json(
            { error: "Failed to fetch credential" },
            { status: 500 }
        );
    }
}
