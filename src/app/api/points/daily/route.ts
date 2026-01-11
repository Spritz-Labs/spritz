import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// GET: Check if daily bonus is available
export async function GET(request: NextRequest) {
    // Rate limit
    const rateLimitResponse = await checkRateLimit(request, "general");
    if (rateLimitResponse) return rateLimitResponse;
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        // Get authenticated user from session
        const session = await getAuthenticatedUser(request);
        const { searchParams } = new URL(request.url);
        const paramAddress = searchParams.get("address");
        
        // Use session address, fall back to param for backward compatibility
        const walletAddress = session?.userAddress || paramAddress;

        if (!walletAddress) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }
        
        // Warn if using unauthenticated fallback
        if (!session && paramAddress) {
            console.warn("[DailyPoints] Using unauthenticated address param - migrate to session auth");
        }

        const normalizedAddress = walletAddress.toLowerCase();

        // Get user's last claim date
        const { data: user, error } = await supabase
            .from("shout_users")
            .select("daily_points_claimed_at")
            .eq("wallet_address", normalizedAddress)
            .single();

        if (error) {
            console.error("[DailyPoints] Error fetching user:", error);
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const today = new Date().toISOString().split('T')[0];
        const lastClaimed = user?.daily_points_claimed_at;
        const available = !lastClaimed || lastClaimed !== today;

        // Calculate next reset time (midnight UTC)
        const now = new Date();
        const nextReset = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 1,
            0, 0, 0, 0
        ));

        return NextResponse.json({
            available,
            lastClaimed,
            nextResetAt: nextReset.toISOString(),
            points: 3,
        });
    } catch (error) {
        console.error("[DailyPoints] Error:", error);
        return NextResponse.json({ error: "Failed to check daily bonus" }, { status: 500 });
    }
}

// POST: Claim daily bonus
export async function POST(request: NextRequest) {
    // Rate limit - strict for claiming points
    const rateLimitResponse = await checkRateLimit(request, "strict");
    if (rateLimitResponse) return rateLimitResponse;

    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        // REQUIRE authentication for claiming points
        const session = await getAuthenticatedUser(request);
        if (!session) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        // Use ONLY the authenticated address - don't trust client input
        const normalizedAddress = session.userAddress.toLowerCase();

        // Call the claim function
        const { data: result, error } = await supabase.rpc("claim_daily_points", {
            p_user_address: normalizedAddress,
        });

        if (error) {
            console.error("[DailyPoints] RPC error:", error);
            return NextResponse.json({ error: "Failed to claim bonus" }, { status: 500 });
        }

        if (!result?.success) {
            return NextResponse.json({
                success: false,
                error: result?.error || "Already claimed today",
                nextClaimAt: result?.next_claim_at,
            });
        }

        console.log("[DailyPoints] Claimed:", result.points_awarded, "points for", normalizedAddress);

        return NextResponse.json({
            success: true,
            points: result.points_awarded,
            nextClaimAt: result.next_claim_at,
        });
    } catch (error) {
        console.error("[DailyPoints] Error:", error);
        return NextResponse.json({ error: "Failed to claim bonus" }, { status: 500 });
    }
}

