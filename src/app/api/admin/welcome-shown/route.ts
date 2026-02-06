import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// POST: Mark welcome as shown for a user
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        // Require authentication
        const session = await getAuthenticatedUser(request);
        if (!session) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const { walletAddress } = await request.json();

        if (!walletAddress) {
            return NextResponse.json({ error: "Wallet address required" }, { status: 400 });
        }

        const normalizedAddress = walletAddress.toLowerCase();

        // Security: Only allow users to mark welcome shown for their own address
        if (normalizedAddress !== session.userAddress.toLowerCase()) {
            return NextResponse.json({ error: "Cannot update other users" }, { status: 403 });
        }

        // Update welcome_shown_at timestamp
        const { error } = await supabase
            .from("shout_users")
            .update({ 
                welcome_shown_at: new Date().toISOString(),
            })
            .eq("wallet_address", normalizedAddress);

        if (error) {
            console.error("[WelcomeShown] Error updating:", error);
            return NextResponse.json({ error: "Failed to update" }, { status: 500 });
        }

        console.log("[WelcomeShown] Marked welcome as shown for:", normalizedAddress);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[WelcomeShown] Error:", error);
        return NextResponse.json({ error: "Failed to mark welcome as shown" }, { status: 500 });
    }
}
