import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, createAuthResponse, type SessionPayload } from "@/lib/session";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/ratelimit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// GET /api/auth/session - Get current session info
export async function GET(request: NextRequest) {
    const session = await getAuthenticatedUser(request);
    
    if (!session) {
        return NextResponse.json({ 
            authenticated: false,
            user: null,
        });
    }
    
    // Optionally fetch fresh user data from database
    let userData = null;
    if (supabase) {
        const { data: user } = await supabase
            .from("shout_users")
            .select("id, wallet_address, username, ens_name, email, email_verified, beta_access, subscription_tier, points, invite_count, is_banned, display_name, avatar_url")
            .eq("wallet_address", session.userAddress)
            .single();
        
        userData = user;
    }
    
    return NextResponse.json({
        authenticated: true,
        session: {
            userAddress: session.userAddress,
            authMethod: session.authMethod,
            expiresAt: new Date(session.exp * 1000).toISOString(),
        },
        user: userData,
    });
}

// POST /api/auth/session - Extend an existing valid session
// SECURITY: This endpoint ONLY works if the user already has a valid session cookie.
// It does NOT create sessions from scratch - that must go through proper auth flows
// (passkey login, email verification, wallet signature, etc.)
export async function POST(request: NextRequest) {
    // Rate limit
    const rateLimitResponse = await checkRateLimit(request, "auth");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        // SECURITY: Require existing valid session - this endpoint only EXTENDS sessions
        // It cannot CREATE sessions from scratch
        const existingSession = await getAuthenticatedUser(request);
        if (!existingSession) {
            console.warn("[Session] Attempted session refresh without valid existing session");
            return NextResponse.json(
                { error: "Authentication required. Please login again." },
                { status: 401 }
            );
        }
        
        // Use the verified session data, not client-provided data
        const userAddress = existingSession.userAddress;
        const authMethod = existingSession.authMethod;
        
        // Optionally update last login in database
        if (supabase) {
            await supabase
                .from("shout_users")
                .update({ last_login: new Date().toISOString() })
                .eq("wallet_address", userAddress);
        }
        
        console.log("[Session] Extended session for:", userAddress.slice(0, 10) + "...", "method:", authMethod);
        
        // Create new session with extended expiry
        return createAuthResponse(
            userAddress,
            authMethod,
            { success: true, extended: true }
        );
    } catch (error) {
        console.error("[Session] Extend error:", error);
        return NextResponse.json(
            { error: "Failed to extend session" },
            { status: 500 }
        );
    }
}
