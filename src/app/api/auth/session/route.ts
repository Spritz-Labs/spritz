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

// POST /api/auth/session/refresh - Refresh/recreate session from localStorage data
// This is used when the user has a valid localStorage session but the HTTP-only cookie expired
export async function POST(request: NextRequest) {
    // Rate limit
    const rateLimitResponse = await checkRateLimit(request, "auth");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const { userAddress, authMethod } = await request.json();
        
        if (!userAddress || !authMethod) {
            return NextResponse.json(
                { error: "userAddress and authMethod required" },
                { status: 400 }
            );
        }
        
        // Validate authMethod
        const validMethods: SessionPayload["authMethod"][] = [
            "wallet", "email", "passkey", "world_id", "alien_id", "solana"
        ];
        if (!validMethods.includes(authMethod)) {
            return NextResponse.json(
                { error: "Invalid auth method" },
                { status: 400 }
            );
        }
        
        // Verify user exists in database
        if (supabase) {
            const { data: user, error } = await supabase
                .from("shout_users")
                .select("id, wallet_address")
                .eq("wallet_address", userAddress.toLowerCase ? userAddress.toLowerCase() : userAddress)
                .maybeSingle();
            
            if (error || !user) {
                // User doesn't exist - create them
                console.log("[Session] Creating new user for refresh:", userAddress.slice(0, 20) + "...");
                await supabase.from("shout_users").insert({
                    wallet_address: userAddress.toLowerCase ? userAddress.toLowerCase() : userAddress,
                    auth_method: authMethod,
                    first_login: new Date().toISOString(),
                    last_login: new Date().toISOString(),
                    login_count: 1,
                });
            } else {
                // Update last login
                await supabase
                    .from("shout_users")
                    .update({ last_login: new Date().toISOString() })
                    .eq("wallet_address", user.wallet_address);
            }
        }
        
        console.log("[Session] Refreshed session for:", userAddress.slice(0, 20) + "...", "method:", authMethod);
        
        // Create new session
        return createAuthResponse(
            userAddress.toLowerCase ? userAddress.toLowerCase() : userAddress,
            authMethod,
            { success: true, refreshed: true }
        );
    } catch (error) {
        console.error("[Session] Refresh error:", error);
        return NextResponse.json(
            { error: "Failed to refresh session" },
            { status: 500 }
        );
    }
}
