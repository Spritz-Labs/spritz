import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { createClient } from "@supabase/supabase-js";
import { type Address } from "viem";
import { 
    getSmartWalletAddress, 
    getSupportedChains,
} from "@/lib/smartAccount";
import { getSafeAddress, getPasskeySafeAddress } from "@/lib/safeWallet";

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
            // Use permissionless.js to calculate Safe address (matches transaction logic)
            smartWalletAddress = await getSafeAddress({ ownerAddress: spritzId, chainId: 8453 });
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
                
                // Always calculate the correct address using permissionless.js
                // This ensures consistency with transaction logic
                const calculatedAddress = await getSafeAddress({ ownerAddress: spritzId, chainId: 8453 });
                
                // Check if stored address matches (may be old/wrong calculation)
                if (user?.smart_wallet_address && user.smart_wallet_address.toLowerCase() !== calculatedAddress.toLowerCase()) {
                    console.log("[SmartWallet] Stored address mismatch - updating to correct address");
                    console.log("[SmartWallet] Old:", user.smart_wallet_address.slice(0, 10), "New:", calculatedAddress.slice(0, 10));
                }
                
                smartWalletAddress = calculatedAddress;
                
                // Always update to ensure correct address is stored
                await supabase
                    .from("shout_users")
                    .update({ 
                        smart_wallet_address: smartWalletAddress,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("wallet_address", spritzId);
                
                canSign = true;
                signerType = "eoa";
                console.log("[SmartWallet] Wallet user - Safe owned by connected wallet:", smartWalletAddress?.slice(0, 10));
                
            } else {
                // PASSKEY/EMAIL/DIGITAL ID USERS: Safe owned by passkey signer
                // They MUST have a passkey to access their wallet
                
                if (!hasValidPasskey) {
                    // No passkey - user needs to create one first
                    needsPasskey = true;
                    canSign = false;
                    signerType = "none";
                    
                    // If they have a stored address from before (lost passkey scenario),
                    // still return it so they can at least see their balance
                    if (user?.smart_wallet_address) {
                        smartWalletAddress = user.smart_wallet_address as Address;
                        console.log("[SmartWallet] Non-wallet user with stored address but NO passkey:", smartWalletAddress.slice(0, 10));
                        console.log("[SmartWallet] User can view but cannot transact until passkey is restored");
                    } else {
                        smartWalletAddress = null;
                        console.log("[SmartWallet] Non-wallet user without passkey - needs passkey setup");
                    }
                    
                } else {
                    // Has passkey - Safe is owned by the passkey signer
                    passkeyCredentialId = credential.credential_id;
                    
                    // IMPORTANT: Always calculate the correct passkey Safe address
                    // This MUST use getPasskeySafeAddress (not getSafeAddress) because:
                    // - getSafeAddress creates a Safe with an EOA owner
                    // - getPasskeySafeAddress creates a Safe with a WebAuthn owner
                    // - These produce DIFFERENT addresses even with the same "owner"!
                    const calculatedAddress = await getPasskeySafeAddress(
                        credential.public_key_x!,
                        credential.public_key_y!,
                        8453 // Base chain
                    );
                    
                    // Check if stored address matches
                    if (user?.smart_wallet_address && 
                        user.smart_wallet_address.toLowerCase() !== calculatedAddress.toLowerCase()) {
                        console.warn("[SmartWallet] ADDRESS MISMATCH DETECTED!");
                        console.warn("[SmartWallet] Stored (WRONG):", user.smart_wallet_address);
                        console.warn("[SmartWallet] Calculated (CORRECT):", calculatedAddress);
                        // Use the CORRECT address - the calculated one
                    }
                    
                    smartWalletAddress = calculatedAddress;
                    
                    // Always update to ensure correct address is stored
                    await supabase
                        .from("shout_users")
                        .update({ 
                            smart_wallet_address: smartWalletAddress,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("wallet_address", spritzId);
                    
                    console.log("[SmartWallet] Passkey-based Safe address:", smartWalletAddress.slice(0, 10));
                    
                    canSign = true;
                    signerType = "passkey";
                }
            }
        }

        // Check deployment status if we have an address
        if (smartWalletAddress) {
            try {
                // Import isSafeDeployed directly for deployment check
                // The address is already correctly calculated above
                const { isSafeDeployed } = await import("@/lib/safeWallet");
                isDeployed = await isSafeDeployed(smartWalletAddress, 8453);
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

        // Generate Safe app URL for direct access
        const safeAppUrl = smartWalletAddress 
            ? `https://app.safe.global/home?safe=base:${smartWalletAddress}`
            : null;

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
            // Safe app URL for direct wallet access (even outside Spritz)
            safeAppUrl,
            // Warning messages for non-wallet users
            ...(requiresPasskeyToSign(walletType) && !needsPasskey && {
                warning: "Your passkey is your wallet key. If you delete your passkey, you will lose access to this wallet and any funds in it.",
            }),
            // Warning for users who have a stored address but lost their passkey
            ...(needsPasskey && smartWalletAddress && {
                warning: "Your passkey credentials were not found. You can view your wallet balance but cannot send transactions until you restore or re-register your passkey.",
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
