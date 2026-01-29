import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { createClient } from "@supabase/supabase-js";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { checkRateLimit, getClientIdentifier } from "@/lib/ratelimit";
import { createAuthResponse, createFrontendSessionToken } from "@/lib/session";
import { ApiError } from "@/lib/apiErrors";
import { RESCUE_TOKEN_EXPIRY_MINUTES, RATE_LIMIT_RESCUE_PER_ADDRESS } from "@/lib/constants";
import { getPasskeySafeAddress } from "@/lib/safeWallet";
import crypto from "crypto";

// Generate address from credential ID (must match registration logic exactly)
function generateWalletAddressFromCredential(credentialId: string): string {
    const data = `spritz-passkey-wallet:${credentialId}`;
    const hash = crypto.createHash("sha256").update(data).digest("hex");
    return `0x${hash.slice(0, 40)}`;
}

/**
 * SECURITY: Check rescue attempt rate limit per address
 * Prevents brute-force rescue attacks
 */
async function checkRescueRateLimit(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: any,
    targetAddress: string,
    clientIp: string
): Promise<{ allowed: boolean; reason?: string }> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    // Count recent rescue attempts for this address
    const { count: addressAttempts } = await supabase
        .from("passkey_challenges")
        .select("*", { count: "exact", head: true })
        .eq("ceremony_type", "rescue")
        .eq("user_address", targetAddress)
        .gte("created_at", oneHourAgo);
    
    if ((addressAttempts || 0) >= RATE_LIMIT_RESCUE_PER_ADDRESS) {
        console.warn(`[Passkey] SECURITY: Rescue rate limit exceeded for address ${targetAddress.slice(0, 10)}`);
        return { allowed: false, reason: "Too many rescue attempts for this account. Please try again later." };
    }
    
    // Also check by IP to prevent mass rescue attempts
    const { count: ipAttempts } = await supabase
        .from("passkey_challenges")
        .select("*", { count: "exact", head: true })
        .eq("ceremony_type", "rescue")
        .eq("client_ip", clientIp)
        .gte("created_at", oneHourAgo);
    
    if ((ipAttempts || 0) >= 10) {
        console.warn(`[Passkey] SECURITY: Rescue rate limit exceeded for IP`);
        return { allowed: false, reason: "Too many rescue attempts. Please try again later." };
    }
    
    return { allowed: true };
}

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
            return ApiError.badRequest("Missing required fields");
        }

        // Log request info for debugging
        const host = request.headers.get("host") || "";
        const rpId = getRpId(request);
        console.log("[Passkey] Login verify request from host:", host);
        console.log("[Passkey] Using RP ID:", rpId);
        console.log("[Passkey] Credential ID from browser:", credential.id);

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const clientIp = getClientIdentifier(request);

        // H-1 FIX: Use atomic UPDATE with WHERE clause to prevent race conditions
        // This atomically finds an unused, unexpired challenge AND marks it as used
        console.log("[Passkey] Looking for challenge:", challenge.slice(0, 40) + "...");
        console.log("[Passkey] Challenge length:", challenge.length);
        
        const { data: consumedChallenge, error: consumeError } = await supabase
            .from("passkey_challenges")
            .update({ used: true, consumed_at: new Date().toISOString() })
            .eq("challenge", challenge)
            .eq("ceremony_type", "authentication")
            .eq("used", false)
            .gt("expires_at", new Date().toISOString())
            .select()
            .single();

        // If no challenge was consumed, check why for proper error message
        if (consumeError || !consumedChallenge) {
            console.log("[Passkey] Consume error:", consumeError?.message);
            
            // First, try to find any matching challenge (regardless of type/used/expiry)
            const { data: anyMatch } = await supabase
                .from("passkey_challenges")
                .select("challenge, ceremony_type, used, expires_at, created_at")
                .eq("challenge", challenge)
                .single();
            
            if (anyMatch) {
                console.log("[Passkey] Found challenge with:", {
                    ceremony_type: anyMatch.ceremony_type,
                    used: anyMatch.used,
                    expires_at: anyMatch.expires_at,
                    created_at: anyMatch.created_at,
                    isExpired: new Date(anyMatch.expires_at) < new Date(),
                });
                
                if (anyMatch.used) {
                    console.error("[Passkey] Challenge already used (prevented replay attack)");
                    return ApiError.badRequest("Challenge already used. Please try again.");
                }
                if (new Date(anyMatch.expires_at) < new Date()) {
                    console.error("[Passkey] Challenge expired at:", anyMatch.expires_at);
                    return ApiError.badRequest("Challenge has expired. Please try again.");
                }
                if (anyMatch.ceremony_type !== "authentication") {
                    console.error("[Passkey] Challenge has wrong ceremony type:", anyMatch.ceremony_type);
                    return ApiError.badRequest("Invalid challenge type. Please try again.");
                }
            } else {
                // Challenge not in database at all - list recent ones to debug
                const { data: recentChallenges } = await supabase
                    .from("passkey_challenges")
                    .select("challenge, ceremony_type, created_at")
                    .eq("ceremony_type", "authentication")
                    .order("created_at", { ascending: false })
                    .limit(3);
                
                console.error("[Passkey] Challenge NOT found in DB. Recent challenges:");
                recentChallenges?.forEach((c, i) => {
                    console.error(`  ${i + 1}. ${c.challenge.slice(0, 40)}... (created: ${c.created_at})`);
                });
            }
            
            console.error("[Passkey] Challenge not found:", challenge.slice(0, 40) + "...");
            return ApiError.badRequest("Invalid or expired challenge. Please try again.");
        }

        const challengeData = consumedChallenge;

        // Look up the credential by ID
        console.log("[Passkey] Looking up credential ID:", credential.id);
        console.log("[Passkey] Full credential ID (first 50):", credential.id.slice(0, 50));
        
        const { data: storedCredential, error: credError } = await supabase
            .from("passkey_credentials")
            .select("*")
            .eq("credential_id", credential.id)
            .single();

        // Debug: also try a partial match to see if it's an encoding issue
        if (!storedCredential) {
            const { data: allCreds } = await supabase
                .from("passkey_credentials")
                .select("credential_id, user_address, created_at")
                .order("created_at", { ascending: false })
                .limit(5);
            console.log("[Passkey] Recent credentials in DB:", allCreds?.map(c => ({
                id_prefix: c.credential_id.slice(0, 30),
                user: c.user_address.slice(0, 10),
                created: c.created_at
            })));
        }

        if (credError || !storedCredential) {
            console.error("[Passkey] Credential not found. Sent ID:", credential.id);
            console.error("[Passkey] DB error:", credError?.message);
            
            // C-2 SECURITY FIX: Secured rescue flow with rate limiting and verification
            // Compute what address this credential would derive to
            const derivedAddress = generateWalletAddressFromCredential(credential.id);
            console.log("[Passkey] Derived address for rescue check:", derivedAddress);
            
            // Check if this address exists in our user database
            const { data: existingUser } = await supabase
                .from("shout_users")
                .select("wallet_address, login_count, email, email_verified")
                .eq("wallet_address", derivedAddress)
                .single();
            
            if (existingUser) {
                // SECURITY: Check rescue rate limit before proceeding
                const rateCheck = await checkRescueRateLimit(supabase, derivedAddress, clientIp);
                if (!rateCheck.allowed) {
                    console.warn("[Passkey] SECURITY: Rescue blocked by rate limit");
                    return ApiError.rateLimited();
                }
                
                // Account exists! This is an orphaned passkey that was never saved to DB
                console.log("[Passkey] RESCUE: Found orphaned account!", derivedAddress);
                console.log("[Passkey] User has", existingUser.login_count, "previous logins");
                
                // SECURITY: Log this rescue attempt for audit
                console.warn(`[Passkey] SECURITY AUDIT: Rescue attempt for ${derivedAddress} from IP ${clientIp}`);
                
                // Generate a rescue token
                const rescueToken = crypto.randomUUID();
                const rescueExpiry = new Date(Date.now() + RESCUE_TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString();
                
                // Store rescue token with client IP for audit trail
                await supabase.from("passkey_challenges").insert({
                    challenge: rescueToken,
                    ceremony_type: "rescue",
                    user_address: derivedAddress,
                    expires_at: rescueExpiry,
                    used: false,
                    client_ip: clientIp, // For rate limiting and audit
                });
                
                // SECURITY: If user has verified email, require email verification for rescue
                const requiresEmailVerification = existingUser.email_verified && existingUser.email;
                
                // Return rescue info to frontend
                return NextResponse.json(
                    { 
                        error: "rescue_available",
                        message: requiresEmailVerification 
                            ? "We found your account! Please verify via email to re-link your passkey."
                            : "We found your account! Your passkey needs to be re-linked.",
                        rescueAddress: derivedAddress,
                        rescueToken: rescueToken,
                        requiresEmailVerification,
                        // Mask email for privacy
                        maskedEmail: requiresEmailVerification 
                            ? existingUser.email.replace(/(.{2})(.*)(@.*)/, "$1***$3")
                            : undefined,
                    },
                    { status: 400 }
                );
            }
            
            // No rescue available - truly not found
            console.log("[Passkey] No rescue available, derived address not in DB");
            return ApiError.badRequest("Credential not found. Please register first.");
        }

        // Decode the stored public key
        const publicKeyBytes = Buffer.from(storedCredential.public_key, "base64");

        // Verify the authentication response
        const allowedOrigins = getAllowedOrigins();
        // rpId already defined above for logging
        
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
            return ApiError.badRequest("Authentication verification failed. Please try again.");
        }

        if (!verification.verified) {
            return ApiError.badRequest("Authentication failed");
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
        
        // Calculate the correct Smart Wallet address from the passkey's public key
        // IMPORTANT: This ensures users get the correct address even if they registered before the fix
        let correctSmartWalletAddress: string | null = null;
        if (storedCredential.public_key_x && storedCredential.public_key_y) {
            try {
                correctSmartWalletAddress = await getPasskeySafeAddress(
                    storedCredential.public_key_x,
                    storedCredential.public_key_y,
                    8453 // Base chain
                );
                console.log("[Passkey] Calculated correct Smart Wallet address:", correctSmartWalletAddress.slice(0, 10) + "...");
            } catch (err) {
                console.error("[Passkey] Failed to calculate Smart Wallet address:", err);
            }
        }
        
        if (!existingUser) {
            // Create new user
            await supabase.from("shout_users").insert({
                wallet_address: storedCredential.user_address,
                wallet_type: "passkey", // IMPORTANT: Set wallet_type for passkey users
                first_login: new Date().toISOString(),
                last_login: new Date().toISOString(),
                login_count: 1,
                smart_wallet_address: correctSmartWalletAddress,
            });
            console.log("[Passkey] Created user record with wallet_type='passkey'");
            if (correctSmartWalletAddress) {
                console.log("[Passkey] Set smart_wallet_address:", correctSmartWalletAddress.slice(0, 10) + "...");
            }
        } else {
            // Update existing user
            // Also fix wallet_type if it's missing or wrong (for users created before this fix)
            const updateData: Record<string, unknown> = {
                last_login: new Date().toISOString(),
                login_count: (existingUser.login_count || 0) + 1,
            };
            
            // Fix wallet_type for passkey users who don't have it set correctly
            // IMPORTANT: Don't change wallet_type for existing "wallet" users!
            // - "wallet" users can sign with their connected EOA - passkey is optional extra security
            if (!existingUser.wallet_type || existingUser.wallet_type === 'evm') {
                updateData.wallet_type = 'passkey';
                console.log("[Passkey] Fixing wallet_type to 'passkey' for user:", storedCredential.user_address.slice(0, 10));
            } else if (existingUser.wallet_type === 'wallet') {
                // EOA users keep their wallet type - they can still sign with their wallet!
                console.log("[Passkey] Wallet user logging in with passkey - keeping wallet_type='wallet':", storedCredential.user_address.slice(0, 10));
            }
            
            // CRITICAL FIX: Update smart_wallet_address if missing or incorrect
            // This fixes users who registered before the address calculation was fixed
            if (correctSmartWalletAddress) {
                if (!existingUser.smart_wallet_address) {
                    // User doesn't have a smart wallet address yet - set it
                    updateData.smart_wallet_address = correctSmartWalletAddress;
                    console.log("[Passkey] Setting missing smart_wallet_address:", correctSmartWalletAddress.slice(0, 10) + "...");
                } else if (existingUser.smart_wallet_address.toLowerCase() !== correctSmartWalletAddress.toLowerCase()) {
                    // User has an INCORRECT smart wallet address from before the fix
                    // IMPORTANT: Update to correct address, but log a warning
                    console.warn("[Passkey] FIXING incorrect smart_wallet_address!");
                    console.warn("[Passkey] Old (wrong):", existingUser.smart_wallet_address);
                    console.warn("[Passkey] New (correct):", correctSmartWalletAddress);
                    updateData.smart_wallet_address = correctSmartWalletAddress;
                }
            }
            
            await supabase
                .from("shout_users")
                .update(updateData)
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
        return ApiError.internal("Failed to verify authentication");
    }
}
