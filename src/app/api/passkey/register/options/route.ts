import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// RP (Relying Party) configuration
const RP_NAME = "Spritz";

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

// Validate recovery token
function validateRecoveryToken(token: string): { valid: boolean; userAddress?: string } {
    try {
        const payload = JSON.parse(Buffer.from(token, "base64url").toString());
        if (
            payload.type === "passkey_recovery" &&
            payload.exp > Date.now() &&
            payload.userAddress
        ) {
            return { valid: true, userAddress: payload.userAddress };
        }
        return { valid: false };
    } catch {
        return { valid: false };
    }
}

export async function POST(request: NextRequest) {
    try {
        const { userAddress, displayName, recoveryToken } = await request.json();
        const rpId = getRpId(request);
        
        console.log("[Passkey] Registration using RP ID:", rpId);

        // Check if this is a recovery flow
        let actualUserAddress = userAddress;
        let isRecoveryFlow = false;

        if (recoveryToken) {
            const recoveryResult = validateRecoveryToken(recoveryToken);
            if (!recoveryResult.valid || !recoveryResult.userAddress) {
                return NextResponse.json(
                    { error: "Invalid or expired recovery token" },
                    { status: 400 }
                );
            }
            // Use the user address from the recovery token
            actualUserAddress = recoveryResult.userAddress;
            isRecoveryFlow = true;
            console.log("[Passkey] Recovery flow for:", actualUserAddress);
        }

        if (!actualUserAddress) {
            return NextResponse.json(
                { error: "User address is required" },
                { status: 400 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Check for existing credentials for this user
        const { data: existingCredentials } = await supabase
            .from("passkey_credentials")
            .select("credential_id")
            .eq("user_address", actualUserAddress.toLowerCase());

        // Generate a unique user ID (using the wallet address hash)
        const encoder = new TextEncoder();
        const userIdBuffer = await crypto.subtle.digest(
            "SHA-256",
            encoder.encode(actualUserAddress.toLowerCase())
        );
        const userId = new Uint8Array(userIdBuffer);

        // For recovery flow, we allow registering new credentials even if others exist
        // For normal flow, exclude existing credentials to prevent duplicates
        const excludeCredentials = isRecoveryFlow 
            ? [] // Allow new credential registration during recovery
            : (existingCredentials?.map((cred) => ({
                id: cred.credential_id,
                type: "public-key" as const,
                transports: ["internal", "hybrid"] as AuthenticatorTransport[],
            })) || []);

        // Generate registration options
        const options = await generateRegistrationOptions({
            rpName: RP_NAME,
            rpID: rpId,
            userID: userId,
            userName: actualUserAddress.toLowerCase(),
            userDisplayName: displayName || `Spritz User`,
            // Don't allow re-registering existing credentials (unless recovery)
            excludeCredentials,
            authenticatorSelection: {
                // Prefer platform authenticators (Touch ID, Face ID, Windows Hello)
                // but allow cross-platform (security keys)
                authenticatorAttachment: "platform",
                // Require user verification (biometric or PIN)
                userVerification: "preferred",
                // Request resident key (discoverable credential) for cross-device sync
                residentKey: "preferred",
                requireResidentKey: false,
            },
            // Request attestation for additional security info (optional)
            attestationType: "none",
            // Support common algorithms
            supportedAlgorithmIDs: [-7, -257], // ES256, RS256
            timeout: 120000, // 2 minutes
        });

        // Store the challenge temporarily (expires in 5 minutes)
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        
        await supabase.from("passkey_challenges").insert({
            challenge: options.challenge,
            ceremony_type: "registration",
            user_address: actualUserAddress.toLowerCase(),
            expires_at: expiresAt,
        });

        console.log("[Passkey] Generated registration options for:", actualUserAddress, isRecoveryFlow ? "(recovery)" : "");

        return NextResponse.json({
            options,
            rpId,
            isRecoveryFlow,
            userAddress: actualUserAddress.toLowerCase(),
        });
    } catch (error) {
        console.error("[Passkey] Registration options error:", error);
        return NextResponse.json(
            { error: "Failed to generate registration options" },
            { status: 500 }
        );
    }
}
