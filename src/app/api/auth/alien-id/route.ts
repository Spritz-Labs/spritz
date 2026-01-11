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
export async function POST(request: NextRequest) {
    // Rate limit: 10 requests per minute for auth
    const rateLimitResponse = await checkRateLimit(request, "auth");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const { alienAddress, token } = await request.json();
        
        if (!alienAddress) {
            return NextResponse.json(
                { success: false, error: "Alien address required" },
                { status: 400 }
            );
        }

        // Optionally verify the token with Alien's API
        // For now, we trust the client-side SDK verification
        // In production, you might want to verify the JWT with Alien's public key
        
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
                await supabase.from("shout_users").insert({
                    wallet_address: alienAddress,
                    auth_method: "alien_id",
                    first_login: new Date().toISOString(),
                    last_login: new Date().toISOString(),
                    login_count: 1,
                });
                console.log("[AlienId] Created new user:", alienAddress.slice(0, 20) + "...");
            } else {
                // Update existing user
                await supabase
                    .from("shout_users")
                    .update({
                        last_login: new Date().toISOString(),
                        login_count: (existingUser.login_count || 0) + 1,
                    })
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
