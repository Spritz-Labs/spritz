import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { getSafeOwners, isSafeDeployed } from "@/lib/safeWallet";
import { type Address } from "viem";

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

        const { searchParams } = new URL(request.url);
        const includeKeys = searchParams.get("includeKeys") === "true";

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Fetch credentials and user's smart wallet address
        const [credentialsResult, userResult] = await Promise.all([
            supabase
                .from("passkey_credentials")
                .select("id, credential_id, display_name, created_at, last_used_at, backed_up, device_info, public_key_x, public_key_y, safe_signer_address")
                .eq("user_address", session.userAddress.toLowerCase())
                .order("created_at", { ascending: false }),
            supabase
                .from("shout_users")
                .select("smart_wallet_address, wallet_type")
                .eq("wallet_address", session.userAddress.toLowerCase())
                .single()
        ]);

        if (credentialsResult.error) {
            console.error("[Passkey] Failed to fetch credentials:", credentialsResult.error);
            return NextResponse.json(
                { error: "Failed to fetch passkeys" },
                { status: 500 }
            );
        }

        const credentials = credentialsResult.data;
        const smartWalletAddress = userResult.data?.smart_wallet_address;
        const isWalletUser = userResult.data?.wallet_type === "wallet";

        // Check which passkeys are actual Safe owners (if Safe is deployed)
        let safeOwners: Address[] = [];
        let safeDeployed = false;
        
        if (smartWalletAddress && !isWalletUser) {
            try {
                safeDeployed = await isSafeDeployed(smartWalletAddress as Address, 8453);
                if (safeDeployed) {
                    safeOwners = await getSafeOwners(smartWalletAddress as Address, 8453);
                }
            } catch (e) {
                console.warn("[Passkey] Could not fetch Safe owners:", e);
            }
        }

        return NextResponse.json({
            credentials: credentials?.map(c => {
                const hasSignerCapability = !!(c.public_key_x && c.safe_signer_address);
                
                // Determine if this passkey can actually sign for the wallet
                let isWalletKey = false;
                let walletKeyStatus: "active" | "not_owner" | "safe_not_deployed" | "no_signer" = "no_signer";
                
                if (hasSignerCapability && c.safe_signer_address) {
                    if (safeDeployed) {
                        // Check if this passkey's signer is actually a Safe owner
                        const isOwner = safeOwners.some(
                            owner => owner.toLowerCase() === c.safe_signer_address?.toLowerCase()
                        );
                        isWalletKey = isOwner;
                        walletKeyStatus = isOwner ? "active" : "not_owner";
                    } else if (smartWalletAddress) {
                        // Safe not deployed yet - assume the oldest passkey with signer is the wallet key
                        // (it will become the owner when Safe deploys)
                        walletKeyStatus = "safe_not_deployed";
                        isWalletKey = true; // Will be owner once deployed
                    }
                }

                return {
                    id: c.id,
                    credentialId: includeKeys ? c.credential_id : (c.credential_id?.slice(0, 20) + "..."),
                    deviceName: c.display_name || (c.device_info as { name?: string })?.name || "Passkey",
                    createdAt: c.created_at,
                    lastUsedAt: c.last_used_at,
                    backedUp: c.backed_up,
                    isWalletKey,
                    walletKeyStatus,
                    // Include full public key if requested (for signing)
                    ...(includeKeys && c.public_key_x && c.public_key_y && {
                        publicKeyX: c.public_key_x,
                        publicKeyY: c.public_key_y,
                        safeSignerAddress: c.safe_signer_address,
                    }),
                };
            }) || [],
            safeDeployed,
            smartWalletAddress,
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

        // Fetch credential and user's smart wallet
        const [credentialResult, userResult] = await Promise.all([
            supabase
                .from("passkey_credentials")
                .select("id, public_key_x, safe_signer_address")
                .eq("id", credentialId)
                .eq("user_address", session.userAddress.toLowerCase())
                .single(),
            supabase
                .from("shout_users")
                .select("smart_wallet_address, wallet_type")
                .eq("wallet_address", session.userAddress.toLowerCase())
                .single()
        ]);

        const credential = credentialResult.data;
        if (!credential) {
            return NextResponse.json(
                { error: "Passkey not found or not authorized" },
                { status: 404 }
            );
        }

        // Check if this passkey is an actual Safe owner (can't delete)
        const smartWalletAddress = userResult.data?.smart_wallet_address;
        const isWalletUser = userResult.data?.wallet_type === "wallet";
        
        if (smartWalletAddress && credential.safe_signer_address && !isWalletUser) {
            try {
                const deployed = await isSafeDeployed(smartWalletAddress as Address, 8453);
                if (deployed) {
                    const owners = await getSafeOwners(smartWalletAddress as Address, 8453);
                    const isActualOwner = owners.some(
                        owner => owner.toLowerCase() === credential.safe_signer_address?.toLowerCase()
                    );
                    
                    if (isActualOwner) {
                        console.log("[Passkey] Blocked deletion of Safe owner passkey:", credentialId);
                        return NextResponse.json(
                            { error: "Cannot delete this passkey - it controls your Spritz Wallet. Deleting it would lock you out of your funds." },
                            { status: 403 }
                        );
                    }
                }
            } catch (e) {
                console.warn("[Passkey] Could not verify Safe ownership:", e);
                // Allow deletion if we can't verify - better UX than being stuck
            }
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
