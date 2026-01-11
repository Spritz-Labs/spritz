import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Get RP ID based on request hostname
function getRpId(request: NextRequest): string {
    // Check env var first
    if (process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID) {
        return process.env.NEXT_PUBLIC_WEBAUTHN_RP_ID;
    }
    
    const host = request.headers.get("host") || "";
    
    // For localhost/development
    if (host.startsWith("localhost") || host.startsWith("127.0.0.1")) {
        return "localhost";
    }
    
    // For Vercel preview deployments
    if (host.includes("vercel.app")) {
        return host.split(":")[0]; // Remove port if any
    }
    
    // For production - use base domain for both spritz.chat and app.spritz.chat
    if (host.includes("spritz.chat")) {
        return "spritz.chat";
    }
    
    // Fallback to host without port
    return host.split(":")[0];
}

export async function POST(request: NextRequest) {
    try {
        const { userAddress, useDevicePasskey } = await request.json();
        const rpId = getRpId(request);
        
        console.log("[Passkey] Using RP ID:", rpId);
        console.log("[Passkey] useDevicePasskey:", useDevicePasskey);

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // If userAddress is provided, get credentials for that user
        // Otherwise, allow discoverable credentials (for cross-device auth)
        let allowCredentials: { id: string; type: "public-key"; transports?: AuthenticatorTransport[] }[] = [];

        if (userAddress) {
            // Get existing credentials for this user
            const { data: credentials } = await supabase
                .from("passkey_credentials")
                .select("credential_id, transports")
                .eq("user_address", userAddress.toLowerCase());

            if (credentials && credentials.length > 0) {
                allowCredentials = credentials.map((cred) => ({
                    id: cred.credential_id,
                    type: "public-key" as const,
                    transports: (cred.transports || ["internal", "hybrid"]) as AuthenticatorTransport[],
                }));
            }
        }

        // If user wants to use device passkey, we get ALL credentials with internal transport
        // This helps find passkeys that weren't registered as discoverable
        if (useDevicePasskey && allowCredentials.length === 0) {
            // Get all credentials that might be on this device (have internal transport)
            const { data: allCredentials } = await supabase
                .from("passkey_credentials")
                .select("credential_id, transports, user_address")
                .contains("transports", ["internal"]);

            if (allCredentials && allCredentials.length > 0) {
                console.log("[Passkey] Found", allCredentials.length, "device credentials to try");
                allowCredentials = allCredentials.map((cred) => ({
                    id: cred.credential_id,
                    type: "public-key" as const,
                    // For device passkey, prioritize internal transport
                    transports: ["internal", "hybrid"] as AuthenticatorTransport[],
                }));
            }
        }

        // Generate authentication options
        const options = await generateAuthenticationOptions({
            rpID: rpId,
            userVerification: "preferred",
            // If we have specific credentials, use them
            // Otherwise, allow any discoverable credential (empty array)
            allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
            timeout: 120000, // 2 minutes for cross-device flow
        });

        // Store the challenge temporarily (expires in 5 minutes)
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        
        // Clean up old expired challenges to prevent database bloat (ignore errors)
        try {
            await supabase
                .from("passkey_challenges")
                .delete()
                .eq("used", true);
            
            await supabase
                .from("passkey_challenges")
                .delete()
                .lt("expires_at", new Date().toISOString());
        } catch (cleanupError) {
            console.warn("[Passkey] Challenge cleanup warning:", cleanupError);
        }
        
        const { error: insertError } = await supabase.from("passkey_challenges").insert({
            challenge: options.challenge,
            ceremony_type: "authentication",
            user_address: userAddress?.toLowerCase() || null,
            expires_at: expiresAt,
        });
        
        if (insertError) {
            console.error("[Passkey] Failed to store challenge:", insertError);
            console.error("[Passkey] Challenge value:", options.challenge.slice(0, 30) + "...");
            // Don't fail if it's just a duplicate - try to continue
            if (!insertError.message?.includes("duplicate")) {
                return NextResponse.json(
                    { error: "Failed to generate authentication options" },
                    { status: 500 }
                );
            }
        }

        console.log("[Passkey] Generated auth options, challenge stored");
        console.log("[Passkey] allowCredentials count:", allowCredentials.length);

        return NextResponse.json({
            options,
            rpId,
        });
    } catch (error) {
        console.error("[Passkey] Auth options error:", error);
        return NextResponse.json(
            { error: "Failed to generate authentication options" },
            { status: 500 }
        );
    }
}
