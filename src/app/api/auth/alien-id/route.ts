import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/ratelimit";
import { createAuthResponse } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

// POST: Create session for Alien ID user
// Supports two flows:
// 1. SSO Flow: alienAddress + token (from Alien SSO SDK)
// 2. Mini App Flow: token + isMiniApp (from Alien Mini App with injected token)
export async function POST(request: NextRequest) {
    // Rate limit: 10 requests per minute for auth
    const rateLimitResponse = await checkRateLimit(request, "auth");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const { alienAddress: providedAddress, token, isMiniApp } = await request.json();
        
        if (!token) {
            return NextResponse.json(
                { success: false, error: "Token required for verification" },
                { status: 400 }
            );
        }

        // SECURITY: Verify the Alien ID token
        // The token is a JWT that should be verified with Alien's public key
        // For now, we do basic validation - the token must exist and contain the claimed address
        let alienAddress: string;
        
        try {
            // Decode JWT payload (base64url encoded middle part)
            const parts = token.split(".");
            if (parts.length !== 3) {
                console.error("[AlienId] Invalid token format - not a JWT");
                return NextResponse.json(
                    { success: false, error: "Invalid token format" },
                    { status: 400 }
                );
            }
            
            // Decode the payload
            const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(atob(payloadBase64));
            
            // Extract user identifier from token
            // Alien SDK typically puts user info in 'sub' or a custom claim
            const tokenAddress = payload.sub || payload.user_id || payload.address || payload.wallet_address;
            
            if (!tokenAddress) {
                console.error("[AlienId] Token missing user identifier");
                return NextResponse.json(
                    { success: false, error: "Token missing user identifier" },
                    { status: 400 }
                );
            }
            
            // For Mini App flow: extract address from token (no separate alienAddress provided)
            // For SSO flow: verify the provided address matches the token
            if (isMiniApp) {
                // Mini App flow - use the address from the token directly
                alienAddress = tokenAddress;
                console.log("[AlienId] Mini App auth - using address from token:", alienAddress.slice(0, 20) + "...");
            } else {
                // SSO flow - verify the provided address matches the token
                if (!providedAddress) {
                    return NextResponse.json(
                        { success: false, error: "Alien address required" },
                        { status: 400 }
                    );
                }
                
                // CRITICAL: Verify the token's address matches the claimed address
                // This prevents an attacker from using their valid token to claim someone else's address
                if (tokenAddress.toLowerCase() !== providedAddress.toLowerCase()) {
                    console.error("[AlienId] SECURITY: Token address mismatch!", {
                        claimed: providedAddress.slice(0, 15),
                        inToken: tokenAddress.slice(0, 15),
                    });
                    return NextResponse.json(
                        { success: false, error: "Token does not match claimed address" },
                        { status: 401 }
                    );
                }
                
                alienAddress = providedAddress;
            }
            
            // Check token expiration if present
            if (payload.exp && payload.exp * 1000 < Date.now()) {
                console.error("[AlienId] Token expired");
                return NextResponse.json(
                    { success: false, error: "Token has expired" },
                    { status: 401 }
                );
            }
            
            console.log("[AlienId] Token validated for:", alienAddress.slice(0, 20) + "...", isMiniApp ? "(Mini App)" : "(SSO)");
        } catch (tokenError) {
            console.error("[AlienId] Token validation error:", tokenError);
            return NextResponse.json(
                { success: false, error: "Invalid token" },
                { status: 400 }
            );
        }
        
        console.log("[AlienId] Creating session for:", alienAddress.slice(0, 20) + "...");
        
        // Create/update user in database
        if (supabase) {
            const { data: existingUser } = await supabase
                .from("shout_users")
                .select("*")
                .eq("wallet_address", alienAddress)
                .maybeSingle();
            
            if (!existingUser) {
                // Create new user
                const { error: insertError } = await supabase.from("shout_users").insert({
                    wallet_address: alienAddress,
                    wallet_type: "alien_id", // IMPORTANT: Set wallet_type for Alien ID users
                    first_login: new Date().toISOString(),
                    last_login: new Date().toISOString(),
                    login_count: 1,
                });
                if (insertError) {
                    console.error("[AlienId] Error creating user:", insertError);
                } else {
                    console.log("[AlienId] Created new user with wallet_type='alien_id':", alienAddress.slice(0, 20) + "...");
                }
            } else {
                // Update existing user
                // Also fix wallet_type if it's missing (for users created before this fix)
                const updateData: Record<string, unknown> = {
                    last_login: new Date().toISOString(),
                    login_count: (existingUser.login_count || 0) + 1,
                };
                
                // Fix wallet_type for Alien ID users who don't have it set
                if (!existingUser.wallet_type) {
                    updateData.wallet_type = 'alien_id';
                    console.log("[AlienId] Fixing wallet_type to 'alien_id' for user:", alienAddress.slice(0, 10));
                }
                
                await supabase
                    .from("shout_users")
                    .update(updateData)
                    .eq("wallet_address", alienAddress);
                console.log("[AlienId] Updated user:", alienAddress.slice(0, 20) + "...");
            }
        }
        
        // Create session with cookie - THIS IS CRITICAL for API access
        return createAuthResponse(
            alienAddress,
            "alien_id",
            {
                success: true,
                alienAddress,
            }
        );
    } catch (error) {
        console.error("[AlienId] Error creating session:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
