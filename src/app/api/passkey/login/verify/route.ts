import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { createClient } from "@supabase/supabase-js";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { checkRateLimit } from "@/lib/ratelimit";
import { createAuthResponse } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// RP configuration
const RP_ID = process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID || "spritz.chat";

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

        console.log("[Passkey] Verifying login, challenge:", challenge.slice(0, 30) + "...");

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Verify the challenge exists and hasn't expired
        // First, let's see what's in the database for debugging
        const { data: recentChallenges } = await supabase
            .from("passkey_challenges")
            .select("challenge, ceremony_type, used, expires_at, created_at")
            .eq("ceremony_type", "authentication")
            .order("created_at", { ascending: false })
            .limit(5);
        
        console.log("[Passkey] Recent auth challenges in DB:", recentChallenges?.map(c => ({
            challenge: c.challenge.slice(0, 20) + "...",
            used: c.used,
            expires_at: c.expires_at,
        })));

        // Try to find unused challenge
        let { data: challengeData, error: challengeError } = await supabase
            .from("passkey_challenges")
            .select("*")
            .eq("challenge", challenge)
            .eq("ceremony_type", "authentication")
            .eq("used", false)
            .single();

        console.log("[Passkey] Challenge lookup result:", { 
            found: !!challengeData, 
            error: challengeError?.message,
            challengeInDb: challengeData?.challenge?.slice(0, 20) + "..."
        });

        // If not found, check if it exists but was already used (race condition)
        if (challengeError || !challengeData) {
            const { data: anyChallenge } = await supabase
                .from("passkey_challenges")
                .select("*")
                .eq("challenge", challenge)
                .eq("ceremony_type", "authentication")
                .single();
            
            console.log("[Passkey] Any challenge lookup:", { found: !!anyChallenge, used: anyChallenge?.used });
            
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
        console.log("[Passkey] Verifying against origins:", allowedOrigins);
        console.log("[Passkey] Expected RP_ID:", RP_ID);
        
        let verification;
        try {
            verification = await verifyAuthenticationResponse({
                response: credential,
                expectedChallenge: challenge,
                expectedOrigin: allowedOrigins,
                expectedRPID: RP_ID,
                credential: {
                    id: storedCredential.credential_id,
                    publicKey: publicKeyBytes,
                    counter: storedCredential.counter,
                    transports: storedCredential.transports as AuthenticatorTransport[],
                },
                requireUserVerification: false,
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

        console.log("[Passkey] Successfully authenticated:", storedCredential.user_address);
        console.log("[Passkey] Credential ID:", storedCredential.credential_id.slice(0, 20) + "...");

        // Return session with cookie
        return createAuthResponse(
            storedCredential.user_address,
            "passkey",
            {
                success: true,
                verified: true,
                userAddress: storedCredential.user_address,
                credentialId: storedCredential.credential_id,
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
