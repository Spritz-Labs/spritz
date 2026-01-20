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
        
        // Log auth flow type (not sensitive)
        if (process.env.NODE_ENV === "development") {
            console.log("[Passkey] Auth options:", { rpId, useDevicePasskey });
        }

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

        // SECURITY: For device passkey mode without a specific user, use discoverable credentials
        // Do NOT fetch all credential IDs from the database - this would expose user information
        // Instead, let the browser discover passkeys based on rpId (resident key / discoverable credential flow)
        if (useDevicePasskey && allowCredentials.length === 0) {
            console.log("[Passkey] Device passkey mode - using discoverable credential flow (no allowCredentials)");
            // Leave allowCredentials empty - browser will show all passkeys for this rpId
            // This is the secure and proper way to handle "sign in with any passkey on this device"
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
            const { count: deletedUsed } = await supabase
                .from("passkey_challenges")
                .delete()
                .eq("used", true)
                .select("*", { count: "exact", head: true });
            
            const { count: deletedExpired } = await supabase
                .from("passkey_challenges")
                .delete()
                .lt("expires_at", new Date().toISOString())
                .select("*", { count: "exact", head: true });
            
            if ((deletedUsed || 0) > 0 || (deletedExpired || 0) > 0) {
                console.log(`[Passkey] Cleaned up ${deletedUsed || 0} used and ${deletedExpired || 0} expired challenges`);
            }
        } catch (cleanupError) {
            console.warn("[Passkey] Challenge cleanup warning:", cleanupError);
        }
        
        console.log("[Passkey] Storing challenge:", options.challenge.slice(0, 40) + "...");
        console.log("[Passkey] Challenge length:", options.challenge.length);
        
        const { data: insertedData, error: insertError } = await supabase.from("passkey_challenges").insert({
            challenge: options.challenge,
            ceremony_type: "authentication",
            user_address: userAddress?.toLowerCase() || null,
            expires_at: expiresAt,
        }).select().single();
        
        if (insertError) {
            console.error("[Passkey] Failed to store challenge:", insertError);
            console.error("[Passkey] Challenge value:", options.challenge.slice(0, 40) + "...");
            // Don't fail if it's just a duplicate - try to continue
            if (!insertError.message?.includes("duplicate")) {
                return NextResponse.json(
                    { error: "Failed to generate authentication options" },
                    { status: 500 }
                );
            }
        } else {
            console.log("[Passkey] Challenge stored successfully, ID:", insertedData?.id);
        }

        console.log("[Passkey] Generated auth options for", useDevicePasskey ? "discoverable" : "specific user", "flow");

        // IMPORTANT: Never cache authentication challenges - they must be fresh
        return NextResponse.json({
            options: optionsWithCredentials,
            rpId,
            useDevicePasskey,
        }, {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
            }
        });
    } catch (error) {
        console.error("[Passkey] Auth options error:", error);
        return NextResponse.json(
            { error: "Failed to generate authentication options" },
            { 
                status: 500,
                headers: {
                    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                }
            }
        );
    }
}
