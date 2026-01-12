import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// Point values
const POINTS = {
    PHONE_VERIFIED: 100,
    EMAIL_VERIFIED: 100,
    INVITE_REDEEMED: 100, // per invite
    FIVE_FRIENDS: 50,
    ENS_PRIMARY: 50,
    USERNAME_CLAIMED: 10,
    SOCIAL_ADDED: 10,
};

// GET: Get user's points and history
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 }
        );
    }

    try {
        // Require authentication
        const session = await getAuthenticatedUser(request);
        if (!session) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        // Use authenticated user's address only
        const walletAddress = session.userAddress.toLowerCase();

        // Get user's points
        const { data: user, error: userError } = await supabase
            .from("shout_users")
            .select("points, points_claimed")
            .eq("wallet_address", walletAddress)
            .single();

        if (userError) {
            return NextResponse.json({
                points: 0,
                claimed: {},
                history: [],
            });
        }

        // Get points history
        const { data: history } = await supabase
            .from("shout_points_history")
            .select("*")
            .eq("wallet_address", walletAddress)
            .order("created_at", { ascending: false })
            .limit(50);

        return NextResponse.json({
            points: user.points || 0,
            claimed: user.points_claimed || {},
            history: history || [],
        });
    } catch (error) {
        console.error("[Points] Error:", error);
        return NextResponse.json(
            { error: "Failed to get points" },
            { status: 500 }
        );
    }
}

// POST: Award points for an action
export async function POST(request: NextRequest) {
    // Rate limit points claims to prevent abuse
    const rateLimitResponse = await checkRateLimit(request, "strict");
    if (rateLimitResponse) return rateLimitResponse;

    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 }
        );
    }

    try {
        // Require authentication - user must have a valid session
        const session = await getAuthenticatedUser(request);
        if (!session) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        // Check if request has a body
        const contentType = request.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            return NextResponse.json(
                { error: "Content-Type must be application/json" },
                { status: 400 }
            );
        }

        // Safely parse JSON body
        let body;
        try {
            const text = await request.text();
            if (!text || text.trim() === "") {
                return NextResponse.json(
                    { error: "Request body is required" },
                    { status: 400 }
                );
            }
            body = JSON.parse(text);
        } catch (parseError) {
            console.error("[Points] JSON parse error:", parseError);
            return NextResponse.json(
                { error: "Invalid JSON in request body" },
                { status: 400 }
            );
        }

        const { action } = body;
        
        // Security: Use ONLY the authenticated user's address - ignore any client-provided address
        const walletAddress = session.userAddress.toLowerCase();

        if (!action) {
            return NextResponse.json(
                { error: "Action required" },
                { status: 400 }
            );
        }

        let points = 0;
        let reason = "";
        let claimKey = "";

        switch (action) {
            case "phone_verified":
                points = POINTS.PHONE_VERIFIED;
                reason = "Phone number verified";
                claimKey = "phone_verified";
                break;
            case "email_verified":
                points = POINTS.EMAIL_VERIFIED;
                reason = "Email verified";
                claimKey = "email_verified";
                break;
            case "five_friends":
                points = POINTS.FIVE_FRIENDS;
                reason = "Added 5 friends";
                claimKey = "five_friends";
                break;
            case "username_claimed":
                points = POINTS.USERNAME_CLAIMED;
                reason = "Claimed Spritz username";
                claimKey = "username_claimed";
                break;
            case "social_added":
                points = POINTS.SOCIAL_ADDED;
                reason = "Added social link";
                claimKey = "social_added";
                break;
            case "ens_primary":
                points = POINTS.ENS_PRIMARY;
                reason = "Primary ENS name set";
                claimKey = "ens_primary";
                break;
            default:
                return NextResponse.json(
                    { error: "Invalid action" },
                    { status: 400 }
                );
        }

        // Award points using the database function
        const { data, error } = await supabase.rpc("award_points", {
            p_address: walletAddress.toLowerCase(),
            p_points: points,
            p_reason: reason,
            p_claim_key: claimKey,
        });

        if (error) {
            console.error("[Points] Award error:", error);
            return NextResponse.json(
                { error: "Failed to award points" },
                { status: 500 }
            );
        }

        // data is true if points were awarded, false if already claimed
        if (data === false) {
            return NextResponse.json({
                success: false,
                message: "Points already claimed for this action",
                points: 0,
            });
        }

        return NextResponse.json({
            success: true,
            message: reason,
            points,
        });
    } catch (error) {
        console.error("[Points] Error:", error);
        return NextResponse.json(
            { error: "Failed to process points" },
            { status: 500 }
        );
    }
}

