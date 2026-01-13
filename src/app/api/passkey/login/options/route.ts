import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/ratelimit";

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
    // SECURITY: Rate limit login attempts (10 per minute)
    const rateLimitResponse = await checkRateLimit(request, "auth");
    if (rateLimitResponse) return rateLimitResponse;

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

        // For device passkey mode without a specific user, get ALL credentials with platform transport
        // This allows the browser to match against any credential that might be on this device
        if (useDevicePasskey && allowCredentials.length === 0) {
            console.log("[Passkey] Device passkey mode - fetching all platform credentials...");
            const { data: allCredentials } = await supabase
                .from("passkey_credentials")
                .select("credential_id, transports")
                .limit(100); // Limit to prevent huge lists

            if (allCredentials && allCredentials.length > 0) {
                // Filter to only include credentials with internal/platform transport
                const platformCredentials = allCredentials.filter(cred => {
                    const transports = cred.transports || [];
                    return transports.includes("internal") || transports.includes("hybrid") || transports.length === 0;
                });
                
                console.log("[Passkey] Found", platformCredentials.length, "potential device credentials");
                
                allowCredentials = platformCredentials.map((cred) => ({
                    id: cred.credential_id,
                    type: "public-key" as const,
                    transports: ["internal", "hybrid"] as AuthenticatorTransport[],
                }));
            }
        }

        // Generate authentication options
        const options = await generateAuthenticationOptions({
            rpID: rpId,
            userVerification: "preferred",
            // Include credentials if we have them (helps with non-discoverable credentials)
            // If empty, browser will only show discoverable credentials
            allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
            timeout: 120000, // 2 minutes
        });
        
        // For device passkey, include the allowCredentials in the response
        // so the client can use them directly with native WebAuthn API
        const optionsWithCredentials = {
            ...options,
            // Include credentials for client-side use
            allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
        };

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
        console.log("[Passkey] useDevicePasskey mode:", useDevicePasskey);

        return NextResponse.json({
            options: optionsWithCredentials,
            rpId,
            useDevicePasskey,
        });
    } catch (error) {
        console.error("[Passkey] Auth options error:", error);
        return NextResponse.json(
            { error: "Failed to generate authentication options" },
            { status: 500 }
        );
    }
}
