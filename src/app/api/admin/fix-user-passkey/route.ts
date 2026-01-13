import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseCosePublicKey, calculateWebAuthnSignerAddress } from "@/lib/passkeySigner";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Admin secret for protection
const ADMIN_SECRET = process.env.ADMIN_SECRET || "admin-secret-change-me";

/**
 * POST /api/admin/fix-user-passkey
 * 
 * Fix a user's passkey credentials by extracting P256 coordinates from their
 * COSE public key and resetting their Safe wallet.
 * 
 * This is needed when:
 * - User has multiple passkeys but only some have P256 coords
 * - The credential used for login doesn't match the one with P256 coords
 */
export async function POST(request: NextRequest) {
    try {
        const { userAddress, adminSecret } = await request.json();

        // Verify admin secret
        if (adminSecret !== ADMIN_SECRET) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        if (!userAddress) {
            return NextResponse.json(
                { error: "userAddress required" },
                { status: 400 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const normalizedAddress = userAddress.toLowerCase();

        console.log("[AdminFix] Fixing passkey credentials for:", normalizedAddress);

        // Get ALL credentials for this user
        const { data: credentials, error: credError } = await supabase
            .from("passkey_credentials")
            .select("*")
            .eq("user_address", normalizedAddress)
            .order("last_used_at", { ascending: false, nullsFirst: false });

        if (credError || !credentials || credentials.length === 0) {
            return NextResponse.json(
                { error: "No credentials found for user" },
                { status: 404 }
            );
        }

        console.log("[AdminFix] Found", credentials.length, "credentials");

        const results: Array<{
            credentialId: string;
            hadP256: boolean;
            extractedP256: boolean;
            publicKeyX?: string;
            publicKeyY?: string;
            safeSignerAddress?: string;
            error?: string;
        }> = [];

        // Process each credential
        for (const cred of credentials) {
            const result: typeof results[0] = {
                credentialId: cred.credential_id.slice(0, 20) + "...",
                hadP256: !!(cred.public_key_x && cred.public_key_y),
                extractedP256: false,
            };

            // If already has P256 coords, skip
            if (cred.public_key_x && cred.public_key_y) {
                result.publicKeyX = cred.public_key_x.slice(0, 10) + "...";
                result.publicKeyY = cred.public_key_y.slice(0, 10) + "...";
                result.safeSignerAddress = cred.safe_signer_address;
                results.push(result);
                continue;
            }

            // Try to extract P256 coordinates from COSE public key
            try {
                if (!cred.public_key) {
                    result.error = "No public_key stored";
                    results.push(result);
                    continue;
                }

                const p256Key = parseCosePublicKey(cred.public_key);
                const safeSignerAddress = calculateWebAuthnSignerAddress(p256Key);

                // Update the credential with P256 coords
                const { error: updateError } = await supabase
                    .from("passkey_credentials")
                    .update({
                        public_key_x: p256Key.x,
                        public_key_y: p256Key.y,
                        safe_signer_address: safeSignerAddress,
                    })
                    .eq("credential_id", cred.credential_id);

                if (updateError) {
                    result.error = `Update failed: ${updateError.message}`;
                } else {
                    result.extractedP256 = true;
                    result.publicKeyX = p256Key.x.slice(0, 10) + "...";
                    result.publicKeyY = p256Key.y.slice(0, 10) + "...";
                    result.safeSignerAddress = safeSignerAddress;
                    console.log("[AdminFix] Extracted P256 for credential:", cred.credential_id.slice(0, 20));
                }
            } catch (parseError) {
                result.error = `Parse failed: ${parseError instanceof Error ? parseError.message : "Unknown"}`;
            }

            results.push(result);
        }

        // Now delete the old safe_wallets record so a new one will be created
        // with the correct public key from the most recently used credential
        const { data: existingSafe, error: safeError } = await supabase
            .from("safe_wallets")
            .select("*")
            .eq("user_address", normalizedAddress)
            .single();

        let safeDeleted = false;
        let oldSafeAddress = null;

        if (existingSafe && !safeError) {
            oldSafeAddress = existingSafe.safe_address;
            
            const { error: deleteError } = await supabase
                .from("safe_wallets")
                .delete()
                .eq("user_address", normalizedAddress);

            if (!deleteError) {
                safeDeleted = true;
                console.log("[AdminFix] Deleted old Safe record:", oldSafeAddress);
            }
        }

        // Find the credential that should be used (most recently used with P256)
        const { data: primaryCred } = await supabase
            .from("passkey_credentials")
            .select("credential_id, public_key_x, public_key_y, safe_signer_address, last_used_at")
            .eq("user_address", normalizedAddress)
            .not("public_key_x", "is", null)
            .order("last_used_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .single();

        return NextResponse.json({
            success: true,
            userAddress: normalizedAddress,
            credentialsProcessed: results.length,
            credentials: results,
            safeDeleted,
            oldSafeAddress,
            primaryCredential: primaryCred ? {
                credentialId: primaryCred.credential_id.slice(0, 20) + "...",
                safeSignerAddress: primaryCred.safe_signer_address,
                lastUsedAt: primaryCred.last_used_at,
            } : null,
            message: safeDeleted 
                ? "Safe wallet record deleted. A new Safe will be created on next transaction using the primary credential."
                : "Credentials updated. User may need to send a transaction to create their Safe.",
        });

    } catch (error) {
        console.error("[AdminFix] Error:", error);
        return NextResponse.json(
            { error: "Failed to fix user passkey" },
            { status: 500 }
        );
    }
}
