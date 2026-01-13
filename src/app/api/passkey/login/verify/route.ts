import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { createClient } from "@supabase/supabase-js";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { checkRateLimit } from "@/lib/ratelimit";
import { createAuthResponse, createFrontendSessionToken } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Get RP ID based on request hostname
function getRpId(request: NextRequest): string {
    if (process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID) {
        return process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID;
    }
    
    const host = request.headers.get("host") || "";
    
    if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
        return "localhost";
    }
    
    if (host.includes("vercel.app")) {
        return host.split(":")[0];
    }
    
    if (host.includes("spritz.chat")) {
        return "spritz.chat";
    }
    
    return host.split(":")[0];
}

// Session token generation moved to @/lib/session (createFrontendSessionToken)
// SECURITY: Tokens are now signed with HMAC-SHA256

// Get allowed origins - support multiple origins for different environments
function getAllowedOrigins(): string[] {
    const origins: string[] = [];
    
    // Primary app URL
    if (process.env.NEXT_PUBLIC_APP_URL) {
        origins.push(process.env.NEXT_PUBLIC_APP_URL);
    }
    
    // Production origins
    origins.push("https://spritz.chat");
    origins.push("https://app.spritz.chat");
    origins.push("https://www.spritz.chat");
    
    // Development
    if (process.env.NODE_ENV === "development") {
        origins.push("http://localhost:3000");
        origins.push("http://127.0.0.1:3000");
    }
    
    return [...new Set(origins)]; // Dedupe
}

export async function POST(request: NextRequest) {
    // Rate limit: 10 requests per minute for auth
    const rateLimitResponse = await checkRateLimit(request, "auth");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const { 
            credential,
            challenge 
        }: {
            credential: AuthenticationResponseJSON;
            challenge: string;
        } = await request.json();

        if (!credential || !challenge) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Try to find unused challenge
        let { data: challengeData, error: challengeError } = await supabase
            .from("passkey_challenges")
            .select("*")
            .eq("challenge", challenge)
            .eq("ceremony_type", "authentication")
            .eq("used", false)
            .single();

        // If not found, check if it exists but was already used (race condition)
        if (challengeError || !challengeData) {
            const { data: anyChallenge } = await supabase
                .from("passkey_challenges")
                .select("*")
                .eq("challenge", challenge)
                .eq("ceremony_type", "authentication")
                .single();
            
            if (anyChallenge) {
                if (anyChallenge.used) {
                    console.error("[Passkey] Challenge already used (possible replay attack)");
                    return NextResponse.json(
                        { error: "Challenge already used. Please try again." },
                        { status: 400 }
                    );
                }
                if (new Date(anyChallenge.expires_at) < new Date()) {
                    console.error("[Passkey] Challenge expired at:", anyChallenge.expires_at);
                    return NextResponse.json(
                        { error: "Challenge has expired. Please try again." },
                        { status: 400 }
                    );
                }
            }
            
            console.error("[Passkey] Challenge not found in database");
            console.error("[Passkey] Looking for:", challenge.slice(0, 30) + "...");
            console.error("[Passkey] Query error:", challengeError);
            return NextResponse.json(
                { error: "Invalid or expired challenge. Please try again." },
                { status: 400 }
            );
        }

        // Check if challenge has expired
        if (new Date(challengeData.expires_at) < new Date()) {
            console.error("[Passkey] Challenge expired at:", challengeData.expires_at);
            return NextResponse.json(
                { error: "Challenge has expired. Please try again." },
                { status: 400 }
            );
        }

        // Mark challenge as used immediately to prevent replay
        const { error: updateError } = await supabase
            .from("passkey_challenges")
            .update({ used: true })
            .eq("id", challengeData.id);
        
        if (updateError) {
            console.error("[Passkey] Failed to mark challenge as used:", updateError);
        }

        // Look up the credential by ID
        const { data: storedCredential, error: credError } = await supabase
            .from("passkey_credentials")
            .select("*")
            .eq("credential_id", credential.id)
            .single();

        if (credError || !storedCredential) {
            console.error("[Passkey] Credential not found:", credential.id);
            return NextResponse.json(
                { error: "Credential not found. Please register first." },
                { status: 400 }
            );
        }

        // Decode the stored public key
        const publicKeyBytes = Buffer.from(storedCredential.public_key, "base64");

        // Verify the authentication response
        const allowedOrigins = getAllowedOrigins();
        const rpId = getRpId(request);
        
        let verification;
        try {
            verification = await verifyAuthenticationResponse({
                response: credential,
                expectedChallenge: challenge,
                expectedOrigin: allowedOrigins,
                expectedRPID: rpId,
                credential: {
                    id: storedCredential.credential_id,
                    publicKey: publicKeyBytes,
                    counter: storedCredential.counter,
                    transports: storedCredential.transports as AuthenticatorTransport[],
                },
                // SECURITY: Require user verification (biometric/PIN) for wallet operations
                requireUserVerification: true,
            });
        } catch (verifyError) {
            console.error("[Passkey] Authentication verification failed:", verifyError);
            console.error("[Passkey] Credential response origin:", credential.response);
            return NextResponse.json(
                { error: "Authentication verification failed. Check server logs for details." },
                { status: 400 }
            );
        }

        if (!verification.verified) {
            return NextResponse.json(
                { error: "Authentication failed" },
                { status: 400 }
            );
        }

        // Update the counter to prevent replay attacks
        const newCounter = verification.authenticationInfo.newCounter;
        await supabase
            .from("passkey_credentials")
            .update({ 
                counter: newCounter,
                last_used_at: new Date().toISOString(),
            })
            .eq("credential_id", storedCredential.credential_id);

        console.log("[Passkey] Authentication successful for:", storedCredential.user_address.slice(0, 10) + "...");

        // Create/update user in shout_users table
        const { data: existingUser } = await supabase
            .from("shout_users")
            .select("*")
            .eq("wallet_address", storedCredential.user_address)
            .maybeSingle();
        
        if (!existingUser) {
            // Create new user
            await supabase.from("shout_users").insert({
                wallet_address: storedCredential.user_address,
                first_login: new Date().toISOString(),
                last_login: new Date().toISOString(),
                login_count: 1,
            });
            console.log("[Passkey] Created user record");
        } else {
            // Update existing user
            await supabase
                .from("shout_users")
                .update({
                    last_login: new Date().toISOString(),
                    login_count: (existingUser.login_count || 0) + 1,
                })
                .eq("wallet_address", storedCredential.user_address);
        }

        // Generate SIGNED session token for frontend localStorage (30 days)
        // SECURITY: Token is signed with HMAC-SHA256, not just base64 encoded
        const sessionToken = await createFrontendSessionToken(storedCredential.user_address, "passkey");

        // Return session with cookie AND sessionToken for frontend
        return createAuthResponse(
            storedCredential.user_address,
            "passkey",
            {
                success: true,
                verified: true,
                userAddress: storedCredential.user_address,
                credentialId: storedCredential.credential_id,
                sessionToken, // For frontend localStorage
            }
        );
    } catch (error) {
        console.error("[Passkey] Auth verify error:", error);
        return NextResponse.json(
            { error: "Failed to verify authentication" },
            { status: 500 }
        );
    }
}
