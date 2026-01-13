import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { createClient } from "@supabase/supabase-js";
import { type Address } from "viem";
import { 
    getSmartWalletAddress, 
    calculateSmartWalletFromSpritzId,
    getSupportedChains,
    calculateSafeAddress,
} from "@/lib/smartAccount";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type WalletType = "passkey" | "email" | "wallet" | "digitalid";

// Determine wallet type from user data
function determineWalletType(user: { wallet_type?: string } | null): WalletType {
    if (!user) return "wallet";
    const type = user.wallet_type?.toLowerCase();
    if (type === "passkey") return "passkey";
    if (type === "email") return "email";
    if (type?.includes("world") || type?.includes("alien")) return "digitalid";
    return "wallet"; // Default to wallet (connected EOA)
}

// Check if user type requires a passkey to sign transactions
function requiresPasskeyToSign(walletType: WalletType): boolean {
    // Wallet users can sign with their connected wallet
    // Everyone else needs a passkey
    return walletType !== "wallet";
}

/**
 * GET /api/wallet/smart-wallet
 * 
 * Get the user's Smart Wallet address.
 * 
 * ARCHITECTURE:
 * - Wallet users: Safe owned by their connected wallet (they can sign directly)
 * - Passkey/Email/Digital ID users: Safe owned by their passkey signer
 *   - If no passkey exists, returns needsPasskey: true
 *   - The passkey IS their wallet key - losing it means losing access
 * 
 * Returns:
 * - spritzId: The user's identity address
 * - smartWalletAddress: The Smart Wallet address (null if needs passkey)
 * - needsPasskey: Whether user needs to create a passkey first
 * - passkeyCredentialId: The passkey that controls this wallet
 * - isDeployed: Whether the wallet is deployed on-chain
 * - supportedChains: List of supported chains
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

    const spritzId = session.userAddress.toLowerCase() as Address;

    try {
        let walletType: WalletType = "wallet";
        let isDeployed = false;
        let smartWalletAddress: Address | null = null;
        let needsPasskey = false;
        let passkeyCredentialId: string | null = null;
        let canSign = false;
        let signerType: "eoa" | "passkey" | "none" = "none";

        if (!supabaseUrl || !supabaseServiceKey) {
            // No DB access - fallback for wallet users only
            smartWalletAddress = calculateSmartWalletFromSpritzId(spritzId);
            canSign = true;
            signerType = "eoa";
        } else {
            const supabase = createClient(supabaseUrl, supabaseServiceKey);
            
            // Get user data
            const { data: user } = await supabase
                .from("shout_users")
                .select("wallet_type, smart_wallet_address")
                .eq("wallet_address", spritzId)
                .single();

            walletType = determineWalletType(user);
            
            // Check if user has a passkey
            const { data: credential } = await supabase
                .from("passkey_credentials")
                .select("id, credential_id, safe_signer_address, public_key_x, public_key_y")
                .eq("user_address", spritzId)
                .not("public_key_x", "is", null)
                .order("last_used_at", { ascending: false, nullsFirst: false })
                .limit(1)
                .single();

            const hasValidPasskey = !!(credential?.safe_signer_address && credential?.public_key_x);
            
            if (walletType === "wallet") {
                // WALLET USERS: Safe owned by their connected wallet
                // They can sign with their connected wallet, no passkey needed
                
                if (user?.smart_wallet_address) {
                    smartWalletAddress = user.smart_wallet_address as Address;
                } else {
                    smartWalletAddress = calculateSmartWalletFromSpritzId(spritzId);
                    
                    // Store for future lookups
                    await supabase
                        .from("shout_users")
                        .update({ 
                            smart_wallet_address: smartWalletAddress,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("wallet_address", spritzId);
                }
                
                canSign = true;
                signerType = "eoa";
                console.log("[SmartWallet] Wallet user - Safe owned by connected wallet:", smartWalletAddress?.slice(0, 10));
                
            } else {
                // PASSKEY/EMAIL/DIGITAL ID USERS: Safe owned by passkey signer
                // They MUST have a passkey to access their wallet
                
                if (!hasValidPasskey) {
                    // No passkey - user needs to create one first
                    needsPasskey = true;
                    smartWalletAddress = null;
                    canSign = false;
                    signerType = "none";
                    console.log("[SmartWallet] Non-wallet user without passkey - needs passkey setup");
                    
                } else {
                    // Has passkey - Safe is owned by the passkey signer
                    passkeyCredentialId = credential.credential_id;
                    
                    // Check if we have a stored address (prevents address changes)
                    if (user?.smart_wallet_address) {
                        smartWalletAddress = user.smart_wallet_address as Address;
                        console.log("[SmartWallet] Using stored passkey-based Safe:", smartWalletAddress.slice(0, 10));
                    } else {
                        // Calculate Safe from passkey signer
                        smartWalletAddress = calculateSafeAddress(credential.safe_signer_address as Address);
                        
                        // Store permanently - this passkey now controls this Safe
                        await supabase
                            .from("shout_users")
                            .update({ 
                                smart_wallet_address: smartWalletAddress,
                                updated_at: new Date().toISOString(),
                            })
                            .eq("wallet_address", spritzId);
                        
                        console.log("[SmartWallet] Created passkey-based Safe:", smartWalletAddress.slice(0, 10));
                    }
                    
                    canSign = true;
                    signerType = "passkey";
                }
            }
        }

        // Check deployment status if we have an address
        if (smartWalletAddress) {
            try {
                const result = await getSmartWalletAddress(spritzId, walletType);
                isDeployed = result.isDeployed;
            } catch {
                isDeployed = false;
            }
        }

        console.log("[SmartWallet] Result:", {
            spritzId: spritzId.slice(0, 10) + "...",
            smartWallet: smartWalletAddress?.slice(0, 10) || "none",
            walletType,
            needsPasskey,
            canSign,
        });

        return NextResponse.json({
            spritzId,
            smartWalletAddress,
            needsPasskey,
            passkeyCredentialId,
            isDeployed,
            walletType,
            canSign,
            signerType,
            supportedChains: getSupportedChains(),
            // Warning message for non-wallet users
            ...(requiresPasskeyToSign(walletType) && !needsPasskey && {
                warning: "Your passkey is your wallet key. If you delete your passkey, you will lose access to this wallet and any funds in it.",
            }),
        });

    } catch (error) {
        console.error("[SmartWallet] Error:", error);
        return NextResponse.json(
            { error: "Failed to get smart wallet" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/wallet/smart-wallet
 * 
 * Future: Deploy the user's Smart Wallet on a specific chain.
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

    return NextResponse.json({
        message: "Smart wallet deployment coming soon",
        note: "For now, you can receive tokens at your Smart Wallet address. Deployment will happen automatically on first transaction.",
    });
}
