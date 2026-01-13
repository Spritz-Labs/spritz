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

/**
 * GET /api/wallet/smart-wallet
 * 
 * Get the user's Smart Wallet address.
 * Creates one deterministically if it doesn't exist.
 * 
 * Returns:
 * - spritzId: The user's identity address
 * - smartWalletAddress: The Smart Wallet address
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
        let smartWalletAddress: Address;

        // Try to get user data and determine wallet type
        if (supabaseUrl && supabaseServiceKey) {
            const supabase = createClient(supabaseUrl, supabaseServiceKey);
            
            // Get user data to determine wallet type and stored smart wallet
            const { data: user } = await supabase
                .from("shout_users")
                .select("wallet_type, smart_wallet_address")
                .eq("wallet_address", spritzId)
                .single();

            walletType = determineWalletType(user);

            // For passkey users, use the stored passkey-based Safe address
            // This address is calculated from the passkey's P256 public key
            if (walletType === "passkey" && user?.smart_wallet_address) {
                smartWalletAddress = user.smart_wallet_address as Address;
                console.log("[SmartWallet] Using stored passkey Safe address:", smartWalletAddress.slice(0, 10));
            } else if (walletType === "passkey") {
                // Passkey user without stored Safe address - check if they have credentials
                const { data: credential } = await supabase
                    .from("passkey_credentials")
                    .select("public_key_x, public_key_y")
                    .eq("user_address", spritzId)
                    .not("public_key_x", "is", null)
                    .order("last_used_at", { ascending: false, nullsFirst: false })
                    .limit(1)
                    .single();
                
                if (credential?.public_key_x && credential?.public_key_y) {
                    // User has passkey - Safe address will be calculated on first tx
                    // For now, use a placeholder that will be updated
                    console.log("[SmartWallet] Passkey user needs Safe address calculation on first tx");
                    smartWalletAddress = calculateSmartWalletFromSpritzId(spritzId);
                } else {
                    // No passkey credentials - use fallback
                    smartWalletAddress = calculateSmartWalletFromSpritzId(spritzId);
                }
            } else {
                // Non-passkey users: use Spritz ID-based Safe
                smartWalletAddress = calculateSmartWalletFromSpritzId(spritzId);
                
                // Store if not already stored
                if (user && !user.smart_wallet_address) {
                    await supabase
                        .from("shout_users")
                        .update({ 
                            smart_wallet_address: smartWalletAddress,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("wallet_address", spritzId);
                }
            }
        } else {
            // No DB access - fallback to calculation
            smartWalletAddress = calculateSmartWalletFromSpritzId(spritzId);
        }

        // Check deployment status and get signing info
        let canSign = false;
        let signerType: "eoa" | "passkey" | "none" = "none";
        
        try {
            const result = await getSmartWalletAddress(spritzId, walletType);
            isDeployed = result.isDeployed;
            canSign = result.canSign;
            signerType = result.signerType;
        } catch {
            // Set defaults based on wallet type
            canSign = walletType === "wallet" || walletType === "email";
            signerType = canSign ? "eoa" : "none";
        }

        console.log("[SmartWallet] Address lookup:", {
            loginAddress: spritzId.slice(0, 10) + "...",
            spritzWallet: smartWalletAddress.slice(0, 10) + "...",
            walletType,
            canSign,
            note: "Safe counterfactual address - deploys on first tx",
        });

        return NextResponse.json({
            spritzId,
            smartWalletAddress,
            isDeployed,
            walletType,
            canSign,
            signerType,
            supportedChains: getSupportedChains(),
        });

    } catch (error) {
        console.error("[SmartWallet] Error:", error);
        
        // Even on error, try to return a calculated address
        try {
            const smartWalletAddress = calculateSmartWalletFromSpritzId(spritzId);
            return NextResponse.json({
                spritzId,
                smartWalletAddress,
                isDeployed: false,
                walletType: "wallet" as WalletType,
                supportedChains: getSupportedChains(),
            });
        } catch {
            return NextResponse.json(
                { error: "Failed to get smart wallet" },
                { status: 500 }
            );
        }
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
