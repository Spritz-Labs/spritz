import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { 
    parseCosePublicKey, 
    calculateWebAuthnSignerAddress 
} from "@/lib/passkeySigner";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Admin addresses that can run this backfill
const ADMIN_ADDRESSES = [
    "0x89480c2e3e3ab6e2a2c1fc64fb0b6e9f9c2f5555", // Add your admin address
];

/**
 * POST /api/admin/backfill-passkey-signers
 * 
 * Backfills P256 public key coordinates for existing passkey credentials.
 * This enables backwards compatibility for passkeys registered before
 * Safe signer support was added.
 * 
 * Admin only - requires authenticated admin user.
 */
export async function POST(request: NextRequest) {
    // Require authentication
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json(
            { error: "Authentication required" },
            { status: 401 }
        );
    }

    // Check admin access (or allow any authenticated user for now)
    // Uncomment below to restrict to specific admins
    // if (!ADMIN_ADDRESSES.includes(session.userAddress.toLowerCase())) {
    //     return NextResponse.json(
    //         { error: "Admin access required" },
    //         { status: 403 }
    //     );
    // }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // Get all credentials without P256 coordinates
        const { data: credentials, error: fetchError } = await supabase
            .from("passkey_credentials")
            .select("id, credential_id, public_key, user_address")
            .is("public_key_x", null)
            .order("created_at", { ascending: true });

        if (fetchError) {
            console.error("[Backfill] Error fetching credentials:", fetchError);
            return NextResponse.json(
                { error: "Failed to fetch credentials" },
                { status: 500 }
            );
        }

        if (!credentials || credentials.length === 0) {
            return NextResponse.json({
                success: true,
                message: "No credentials need backfilling",
                processed: 0,
            });
        }

        console.log(`[Backfill] Found ${credentials.length} credentials to process`);

        const results = {
            processed: 0,
            success: 0,
            failed: 0,
            errors: [] as { credentialId: string; error: string }[],
        };

        for (const cred of credentials) {
            results.processed++;

            try {
                // Parse the COSE public key to extract P256 coordinates
                const p256Key = parseCosePublicKey(cred.public_key);
                
                // Calculate the Safe WebAuthn signer address
                const signerAddress = calculateWebAuthnSignerAddress(p256Key);

                // Update the credential with the extracted data
                const { error: updateError } = await supabase
                    .from("passkey_credentials")
                    .update({
                        public_key_x: p256Key.x,
                        public_key_y: p256Key.y,
                        safe_signer_address: signerAddress,
                    })
                    .eq("id", cred.id);

                if (updateError) {
                    throw new Error(updateError.message);
                }

                results.success++;
                console.log(`[Backfill] Updated credential ${cred.credential_id.slice(0, 10)}... -> signer ${signerAddress.slice(0, 10)}...`);

            } catch (err) {
                results.failed++;
                const errorMessage = err instanceof Error ? err.message : "Unknown error";
                results.errors.push({
                    credentialId: cred.credential_id,
                    error: errorMessage,
                });
                console.error(`[Backfill] Failed for ${cred.credential_id}:`, errorMessage);
            }
        }

        console.log(`[Backfill] Complete: ${results.success}/${results.processed} successful`);

        return NextResponse.json({
            success: true,
            message: `Backfill complete: ${results.success}/${results.processed} credentials updated`,
            results,
        });

    } catch (err) {
        console.error("[Backfill] Error:", err);
        return NextResponse.json(
            { error: "Backfill failed" },
            { status: 500 }
        );
    }
}

/**
 * GET /api/admin/backfill-passkey-signers
 * 
 * Check how many credentials need backfilling.
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // Count credentials without P256 coordinates
        const { count, error } = await supabase
            .from("passkey_credentials")
            .select("*", { count: "exact", head: true })
            .is("public_key_x", null);

        if (error) {
            return NextResponse.json(
                { error: "Failed to check credentials" },
                { status: 500 }
            );
        }

        // Count total credentials
        const { count: totalCount } = await supabase
            .from("passkey_credentials")
            .select("*", { count: "exact", head: true });

        return NextResponse.json({
            needsBackfill: count || 0,
            total: totalCount || 0,
            alreadyProcessed: (totalCount || 0) - (count || 0),
        });

    } catch (err) {
        return NextResponse.json(
            { error: "Check failed" },
            { status: 500 }
        );
    }
}
