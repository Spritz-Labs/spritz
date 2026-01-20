import { NextRequest, NextResponse } from "next/server";
import { verifyCloudProof, type IVerifyResponse } from "@worldcoin/idkit-core/backend";
import { checkRateLimit } from "@/lib/ratelimit";
import { createClient } from "@supabase/supabase-js";
import { createAuthResponse } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export async function POST(request: NextRequest) {
    // Rate limit: 10 requests per minute for auth
    const rateLimitResponse = await checkRateLimit(request, "auth");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const proof = await request.json();
        
        const app_id = process.env.NEXT_PUBLIC_WORLD_ID_APP_ID;
        const action = process.env.NEXT_PUBLIC_WORLD_ID_ACTION;
        
        if (!app_id || !action) {
            console.error("[WorldId] Missing environment variables");
            return NextResponse.json(
                { success: false, error: "World ID not configured" },
                { status: 500 }
            );
        }
        
        console.log("[WorldId] Verifying proof for action:", action);
        
        const verifyRes = await verifyCloudProof(
            proof,
            app_id as `app_${string}`,
            action
        ) as IVerifyResponse;
        
        if (verifyRes.success) {
            console.log("[WorldId] ✓ Verification successful");
            
            // Use nullifier_hash as the user's unique identifier (address)
            const userAddress = proof.nullifier_hash;
            
            // Create/update user in database
            if (supabase) {
                const { data: existingUser } = await supabase
                    .from("shout_users")
                    .select("*")
                    .eq("wallet_address", userAddress)
                    .maybeSingle();
                
                if (!existingUser) {
                    // Create new user
                    const { error: insertError } = await supabase.from("shout_users").insert({
                        wallet_address: userAddress,
                        wallet_type: "world_id", // IMPORTANT: Set wallet_type for World ID users
                        first_login: new Date().toISOString(),
                        last_login: new Date().toISOString(),
                        login_count: 1,
                    });
                    if (insertError) {
                        console.error("[WorldId] Error creating user:", insertError);
                    } else {
                        console.log("[WorldId] Created new user with wallet_type='world_id':", userAddress.slice(0, 20) + "...");
                    }
                } else {
                    // Update existing user
                    // Also fix wallet_type if it's missing (for users created before this fix)
                    const updateData: Record<string, unknown> = {
                        last_login: new Date().toISOString(),
                        login_count: (existingUser.login_count || 0) + 1,
                    };
                    
                    // Fix wallet_type for World ID users who don't have it set
                    if (!existingUser.wallet_type) {
                        updateData.wallet_type = 'world_id';
                        console.log("[WorldId] Fixing wallet_type to 'world_id' for user:", userAddress.slice(0, 10));
                    }
                    
                    await supabase
                        .from("shout_users")
                        .update(updateData)
                        .eq("wallet_address", userAddress);
                    console.log("[WorldId] Updated user:", userAddress.slice(0, 20) + "...");
                }
            }
            
            // Create session with cookie - THIS IS CRITICAL for API access
            return createAuthResponse(
                userAddress,
                "world_id",
                {
                    success: true,
                    nullifier_hash: proof.nullifier_hash,
                    verification_level: proof.verification_level,
                }
            );
        } else {
            console.error("[WorldId] Verification failed:", verifyRes);
            return NextResponse.json(
                { 
                    success: false, 
                    error: "Verification failed",
                    code: (verifyRes as any).code,
                    detail: (verifyRes as any).detail,
                },
                { status: 400 }
            );
        }
    } catch (error) {
        console.error("[WorldId] Error verifying proof:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
