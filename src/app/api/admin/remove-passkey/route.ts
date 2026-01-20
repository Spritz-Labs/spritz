import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Admin endpoint to remove a passkey from any account
// Used for security incidents like accidental account linking
export async function POST(request: NextRequest) {
    try {
        const session = await getAuthenticatedUser(request);
        
        if (!session) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Verify caller is an admin
        const { data: adminUser } = await supabase
            .from("shout_admins")
            .select("id, is_super_admin")
            .eq("wallet_address", session.userAddress.toLowerCase())
            .single();

        if (!adminUser) {
            return NextResponse.json(
                { error: "Admin access required" },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { credentialId, userAddress, reason } = body;

        if (!credentialId && !userAddress) {
            return NextResponse.json(
                { error: "Either credentialId or userAddress is required" },
                { status: 400 }
            );
        }

        if (!reason) {
            return NextResponse.json(
                { error: "Reason is required for audit trail" },
                { status: 400 }
            );
        }

        // Find the credential(s) to remove
        let query = supabase
            .from("passkey_credentials")
            .select("id, credential_id, user_address, display_name, created_at, safe_signer_address");

        if (credentialId) {
            // Remove by credential ID (database ID or WebAuthn credential ID)
            query = query.or(`id.eq.${credentialId},credential_id.eq.${credentialId}`);
        } else if (userAddress) {
            // List all credentials for a user address
            query = query.eq("user_address", userAddress.toLowerCase());
        }

        const { data: credentials, error: fetchError } = await query;

        if (fetchError) {
            console.error("[Admin] Error fetching credentials:", fetchError);
            return NextResponse.json(
                { error: "Failed to fetch credentials" },
                { status: 500 }
            );
        }

        if (!credentials || credentials.length === 0) {
            return NextResponse.json(
                { error: "No credentials found" },
                { status: 404 }
            );
        }

        // If just listing (no specific credential ID provided), return the list
        if (!credentialId) {
            return NextResponse.json({
                message: "Found credentials for user. Provide credentialId to delete a specific one.",
                credentials: credentials.map(c => ({
                    id: c.id,
                    credentialIdPrefix: c.credential_id?.slice(0, 30) + "...",
                    displayName: c.display_name,
                    createdAt: c.created_at,
                    safeSignerAddress: c.safe_signer_address,
                })),
            });
        }

        const credentialToDelete = credentials[0];

        // Log the deletion for audit trail
        console.log("[Admin] PASSKEY REMOVAL:", {
            adminAddress: session.userAddress,
            credentialId: credentialToDelete.id,
            credentialIdWebAuthn: credentialToDelete.credential_id?.slice(0, 30) + "...",
            targetUserAddress: credentialToDelete.user_address,
            displayName: credentialToDelete.display_name,
            reason,
            timestamp: new Date().toISOString(),
        });

        // Store audit log in database
        try {
            await supabase.from("admin_audit_log").insert({
                admin_address: session.userAddress.toLowerCase(),
                action: "remove_passkey",
                target_address: credentialToDelete.user_address,
                details: {
                    credentialId: credentialToDelete.id,
                    credentialIdPrefix: credentialToDelete.credential_id?.slice(0, 30),
                    displayName: credentialToDelete.display_name,
                    safeSignerAddress: credentialToDelete.safe_signer_address,
                    reason,
                },
                created_at: new Date().toISOString(),
            });
        } catch (auditError) {
            // Don't fail if audit log fails - the table might not exist
            console.warn("[Admin] Could not write audit log:", auditError);
        }

        // Delete the credential
        const { error: deleteError } = await supabase
            .from("passkey_credentials")
            .delete()
            .eq("id", credentialToDelete.id);

        if (deleteError) {
            console.error("[Admin] Error deleting credential:", deleteError);
            return NextResponse.json(
                { error: "Failed to delete credential" },
                { status: 500 }
            );
        }

        console.log("[Admin] Successfully removed passkey:", credentialToDelete.id);

        return NextResponse.json({
            success: true,
            message: "Passkey removed successfully",
            removed: {
                id: credentialToDelete.id,
                displayName: credentialToDelete.display_name,
                userAddress: credentialToDelete.user_address,
            },
        });
    } catch (error) {
        console.error("[Admin] Error in remove-passkey:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// GET - List passkeys for a specific user address (admin view)
export async function GET(request: NextRequest) {
    try {
        const session = await getAuthenticatedUser(request);
        
        if (!session) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Verify caller is an admin
        const { data: adminUser } = await supabase
            .from("shout_admins")
            .select("id")
            .eq("wallet_address", session.userAddress.toLowerCase())
            .single();

        if (!adminUser) {
            return NextResponse.json(
                { error: "Admin access required" },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");

        if (!userAddress) {
            return NextResponse.json(
                { error: "userAddress query parameter is required" },
                { status: 400 }
            );
        }

        const { data: credentials, error } = await supabase
            .from("passkey_credentials")
            .select("id, credential_id, display_name, created_at, last_used_at, backed_up, safe_signer_address, device_info")
            .eq("user_address", userAddress.toLowerCase())
            .order("created_at", { ascending: false });

        if (error) {
            console.error("[Admin] Error fetching credentials:", error);
            return NextResponse.json(
                { error: "Failed to fetch credentials" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            userAddress: userAddress.toLowerCase(),
            credentials: credentials?.map(c => ({
                id: c.id,
                credentialIdPrefix: c.credential_id?.slice(0, 30) + "...",
                displayName: c.display_name,
                createdAt: c.created_at,
                lastUsedAt: c.last_used_at,
                backedUp: c.backed_up,
                safeSignerAddress: c.safe_signer_address,
                deviceInfo: c.device_info,
            })) || [],
        });
    } catch (error) {
        console.error("[Admin] Error listing passkeys:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
