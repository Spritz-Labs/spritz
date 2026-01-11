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

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Verify the challenge exists and hasn't expired
        const { data: challengeData, error: challengeError } = await supabase
            .from("passkey_challenges")
            .select("*")
            .eq("challenge", challenge)
            .eq("ceremony_type", "authentication")
            .eq("used", false)
            .single();

        if (challengeError || !challengeData) {
            console.error("[Passkey] Challenge not found:", challengeError);
            return NextResponse.json(
                { error: "Invalid or expired challenge" },
                { status: 400 }
            );
        }

        // Check if challenge has expired
        if (new Date(challengeData.expires_at) < new Date()) {
            return NextResponse.json(
                { error: "Challenge has expired" },
                { status: 400 }
            );
        }

        // Mark challenge as used immediately to prevent replay
        await supabase
            .from("passkey_challenges")
            .update({ used: true })
            .eq("id", challengeData.id);

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
