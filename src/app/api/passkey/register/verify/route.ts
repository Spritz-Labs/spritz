import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { createClient } from "@supabase/supabase-js";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";
import { createAuthResponse } from "@/lib/session";

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
    try {
        const { 
            userAddress, 
            displayName,
            credential,
            challenge 
        }: {
            userAddress: string;
            displayName?: string;
            credential: RegistrationResponseJSON;
            challenge: string;
        } = await request.json();

        if (!userAddress || !credential || !challenge) {
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
            .eq("ceremony_type", "registration")
            .eq("user_address", userAddress.toLowerCase())
            .eq("used", false)
            .single();

        if (challengeError || !challengeData) {
            console.error("[Passkey] Challenge not found or expired:", challengeError);
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

        // Mark challenge as used
        await supabase
            .from("passkey_challenges")
            .update({ used: true })
            .eq("id", challengeData.id);

        // Verify the registration response
        const allowedOrigins = getAllowedOrigins();
        const rpId = getRpId(request);
        console.log("[Passkey] Verifying registration against origins:", allowedOrigins);
        console.log("[Passkey] Expected RP_ID:", rpId);
        
        let verification;
        try {
            verification = await verifyRegistrationResponse({
                response: credential,
                expectedChallenge: challenge,
                expectedOrigin: allowedOrigins,
                expectedRPID: rpId,
                requireUserVerification: false, // Allow both UV and non-UV
            });
        } catch (verifyError) {
            console.error("[Passkey] Verification failed:", verifyError);
            return NextResponse.json(
                { error: "Credential verification failed. Check server logs for details." },
                { status: 400 }
            );
        }

        if (!verification.verified || !verification.registrationInfo) {
            return NextResponse.json(
                { error: "Credential verification failed" },
                { status: 400 }
            );
        }

        const { registrationInfo } = verification;

        // Extract credential data
        const credentialId = registrationInfo.credential.id;
        const publicKey = Buffer.from(registrationInfo.credential.publicKey).toString("base64");
        const counter = registrationInfo.credential.counter;
        const aaguid = registrationInfo.aaguid;
        const backedUp = registrationInfo.credentialBackedUp;

        // Get transports from the response if available
        const transports = credential.response.transports || ["internal", "hybrid"];

        // Store the credential in the database
        const { error: insertError } = await supabase
            .from("passkey_credentials")
            .insert({
                credential_id: credentialId,
                public_key: publicKey,
                counter,
                user_address: userAddress.toLowerCase(),
                display_name: displayName || "Spritz Passkey",
                aaguid,
                transports,
                backed_up: backedUp,
                device_info: {
                    userAgent: request.headers.get("user-agent"),
                    registeredAt: new Date().toISOString(),
                },
            });

        if (insertError) {
            console.error("[Passkey] Failed to store credential:", insertError);
            return NextResponse.json(
                { error: "Failed to store credential" },
                { status: 500 }
            );
        }

        console.log("[Passkey] Successfully registered credential for:", userAddress);
        console.log("[Passkey] Credential ID:", credentialId.slice(0, 20) + "...");
        console.log("[Passkey] Backed up (synced):", backedUp);

        // Create/update user in shout_users table
        const normalizedAddress = userAddress.toLowerCase();
        const { data: existingUser } = await supabase
            .from("shout_users")
            .select("*")
            .eq("wallet_address", normalizedAddress)
            .maybeSingle();
        
        if (!existingUser) {
            // Create new user
            await supabase.from("shout_users").insert({
                wallet_address: normalizedAddress,
                first_login: new Date().toISOString(),
                last_login: new Date().toISOString(),
                login_count: 1,
            });
            console.log("[Passkey] Created user record:", normalizedAddress);
        } else {
            // Update existing user
            await supabase
                .from("shout_users")
                .update({
                    last_login: new Date().toISOString(),
                    login_count: (existingUser.login_count || 0) + 1,
                })
                .eq("wallet_address", normalizedAddress);
        }

        // Generate a session token for frontend localStorage (30 days)
        const sessionToken = await generateSessionToken(normalizedAddress);

        // Return session with HttpOnly cookie AND sessionToken for frontend
        return createAuthResponse(
            normalizedAddress,
            "passkey",
            {
                success: true,
                verified: true,
                credentialId,
                backedUp,
                sessionToken, // For frontend localStorage
                userAddress: normalizedAddress,
            }
        );
    } catch (error) {
        console.error("[Passkey] Registration verify error:", error);
        return NextResponse.json(
            { error: "Failed to verify registration" },
            { status: 500 }
        );
    }
}

// Generate a simple session token
async function generateSessionToken(userAddress: string): Promise<string> {
    const payload = {
        sub: userAddress,
        iat: Date.now(),
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
        type: "passkey",
    };
    
    // Encode as base64 (in production, sign this with a secret)
    return Buffer.from(JSON.stringify(payload)).toString("base64url");
}
