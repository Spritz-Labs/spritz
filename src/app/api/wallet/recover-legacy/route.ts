import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { type Address } from "viem";
import { 
    calculateSafeAddress, 
    isLegacySafeDeployed,
} from "@/lib/smartAccount";

/**
 * GET /api/wallet/recover-legacy
 * 
 * Check if user has funds in a legacy Safe that needs recovery
 */
export async function GET(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    if (!session) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const ownerAddress = session.userAddress.toLowerCase() as Address;
    
    // Calculate the legacy Safe address (old calculation without 4337)
    const legacySafeAddress = calculateSafeAddress(ownerAddress);
    
    // Check deployment status on mainnet
    const isDeployed = await isLegacySafeDeployed(legacySafeAddress, 1);

    return NextResponse.json({
        ownerAddress,
        legacySafeAddress,
        isDeployed,
        message: "Use wallet client to deploy (if needed) and execute withdrawal. EOA pays gas.",
        instructions: [
            "1. Connect your wallet",
            "2. If Safe not deployed, first deploy it (costs ~$10-20 gas)",
            "3. Then execute withdrawal transaction (costs ~$5-10 gas)",
            "4. Your EOA signs and pays for both transactions",
        ],
    });
}
