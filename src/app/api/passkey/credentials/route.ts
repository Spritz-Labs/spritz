import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET - List all passkeys for the authenticated user
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

        // Include public_key_x to determine if this passkey controls a wallet
        const { data: credentials, error } = await supabase
            .from("passkey_credentials")
            .select("id, credential_id, display_name, created_at, last_used_at, backed_up, device_info, public_key_x, safe_signer_address")
            .eq("user_address", session.userAddress.toLowerCase())
            .order("created_at", { ascending: false });

        if (error) {
            console.error("[Passkey] Failed to fetch credentials:", error);
            return NextResponse.json(
                { error: "Failed to fetch passkeys" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            credentials: credentials?.map(c => ({
                id: c.id,
                credentialId: c.credential_id?.slice(0, 20) + "...",
                deviceName: c.display_name || (c.device_info as { name?: string })?.name || "Passkey",
                createdAt: c.created_at,
                lastUsedAt: c.last_used_at,
                backedUp: c.backed_up,
                // A passkey controls a wallet if it has public key coordinates and a safe signer address
                isWalletKey: !!(c.public_key_x && c.safe_signer_address),
            })) || [],
        });
    } catch (error) {
        console.error("[Passkey] Error listing credentials:", error);
        return NextResponse.json(
            { error: "Failed to list passkeys" },
            { status: 500 }
        );
    }
}

// DELETE - Remove a specific passkey
export async function DELETE(request: NextRequest) {
    try {
        const session = await getAuthenticatedUser(request);
        
        if (!session) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const credentialId = searchParams.get("id");

        if (!credentialId) {
            return NextResponse.json(
                { error: "Credential ID is required" },
                { status: 400 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // First, check if this passkey controls a wallet
        const { data: credential } = await supabase
            .from("passkey_credentials")
            .select("id, public_key_x, safe_signer_address")
            .eq("id", credentialId)
            .eq("user_address", session.userAddress.toLowerCase())
            .single();

        if (!credential) {
            return NextResponse.json(
                { error: "Passkey not found or not authorized" },
                { status: 404 }
            );
        }

        // Block deletion of passkeys that control a wallet
        const isWalletKey = !!(credential.public_key_x && credential.safe_signer_address);
        if (isWalletKey) {
            console.log("[Passkey] Blocked deletion of wallet-controlling passkey:", credentialId);
            return NextResponse.json(
                { error: "Cannot delete passkey that controls your Spritz Wallet. This passkey is required to access your funds." },
                { status: 403 }
            );
        }

        // Delete the credential
        const { error, count } = await supabase
            .from("passkey_credentials")
            .delete({ count: "exact" })
            .eq("id", credentialId)
            .eq("user_address", session.userAddress.toLowerCase());

        if (error) {
            console.error("[Passkey] Failed to delete credential:", error);
            return NextResponse.json(
                { error: "Failed to delete passkey" },
                { status: 500 }
            );
        }

        if (count === 0) {
            return NextResponse.json(
                { error: "Passkey not found or not authorized" },
                { status: 404 }
            );
        }

        console.log("[Passkey] Deleted credential:", credentialId, "for user:", session.userAddress);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Passkey] Error deleting credential:", error);
        return NextResponse.json(
            { error: "Failed to delete passkey" },
            { status: 500 }
        );
    }
}
