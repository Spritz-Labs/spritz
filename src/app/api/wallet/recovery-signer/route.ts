import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { createClient } from "@supabase/supabase-js";
import { type Address, isAddress } from "viem";
import { getRecoveryInfo, getSafeOwners } from "@/lib/safeWallet";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * GET /api/wallet/recovery-signer
 * 
 * Get recovery signer status for the user's Safe
 */
export async function GET(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const spritzId = session.userAddress.toLowerCase() as Address;

    try {
        if (!supabaseUrl || !supabaseServiceKey) {
            return NextResponse.json({ error: "Database not configured" }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Get user's Smart Wallet address and passkey info
        const { data: user } = await supabase
            .from("shout_users")
            .select("smart_wallet_address, wallet_type")
            .eq("wallet_address", spritzId)
            .single();

        if (!user?.smart_wallet_address) {
            return NextResponse.json({ 
                error: "No Smart Wallet found",
                needsWallet: true,
            }, { status: 404 });
        }

        const safeAddress = user.smart_wallet_address as Address;
        const chainId = 8453; // Base

        // Get passkey signer address (for passkey users)
        const { data: credential } = await supabase
            .from("passkey_credentials")
            .select("safe_signer_address")
            .eq("user_address", spritzId)
            .not("safe_signer_address", "is", null)
            .order("last_used_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .single();

        // Determine primary signer based on user type
        const isWalletUser = user.wallet_type === "wallet" || !user.wallet_type;
        const primarySigner = isWalletUser 
            ? spritzId 
            : (credential?.safe_signer_address as Address) || spritzId;

        // Get recovery info from the Safe
        const recoveryInfo = await getRecoveryInfo(safeAddress, primarySigner, chainId);

        return NextResponse.json({
            safeAddress,
            primarySigner,
            isWalletUser,
            ...recoveryInfo,
            // Safe app URL for direct access
            safeAppUrl: `https://app.safe.global/home?safe=base:${safeAddress}`,
        });

    } catch (error) {
        console.error("[RecoverySigner] Error:", error);
        return NextResponse.json(
            { error: "Failed to get recovery info" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/wallet/recovery-signer
 * 
 * Note: The actual signing happens client-side with the passkey.
 * This endpoint just validates the recovery address.
 */
export async function POST(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { recoveryAddress } = body;

        // Validate address format
        if (!recoveryAddress || !isAddress(recoveryAddress)) {
            return NextResponse.json(
                { error: "Invalid recovery address" },
                { status: 400 }
            );
        }

        // Return success - client will handle the actual transaction
        return NextResponse.json({
            message: "Recovery address validated",
            recoveryAddress,
            instructions: "Use the client-side addRecoverySigner function to complete the process",
        });

    } catch (error) {
        console.error("[RecoverySigner] Error:", error);
        return NextResponse.json(
            { error: "Failed to validate recovery address" },
            { status: 500 }
        );
    }
}
