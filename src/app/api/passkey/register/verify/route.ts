import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { createClient } from "@supabase/supabase-js";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";
import { createAuthResponse, createFrontendSessionToken } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";
import { isAddress } from "viem";
import crypto from "crypto";
import { 
    parseCosePublicKey, 
    calculateWebAuthnSignerAddress,
    type P256PublicKey,
} from "@/lib/passkeySigner";
import { getSafeAddress } from "@/lib/safeWallet";
import { type Address } from "viem";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Generate a deterministic wallet address from credential ID
// This MUST match the client-side implementation exactly
function generateWalletAddressFromCredential(credentialId: string): string {
    const data = `spritz-passkey-wallet:${credentialId}`;
    const hash = crypto.createHash("sha256").update(data).digest("hex");
    return `0x${hash.slice(0, 40)}`;
}

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
    // SECURITY: Rate limit registration verification (10 per minute)
    const rateLimitResponse = await checkRateLimit(request, "auth");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        const { 
            userAddress, 
            displayName,
            credential,
            challenge,
            recoveryToken, // Optional: if provided, link to recovered account
        }: {
            userAddress: string;
            displayName?: string;
            credential: RegistrationResponseJSON;
            challenge: string;
            recoveryToken?: string;
        } = await request.json();

        if (!userAddress || !credential || !challenge) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        // SECURITY: Validate address format to prevent injection
        if (!isAddress(userAddress)) {
            return NextResponse.json(
                { error: "Invalid address format" },
                { status: 400 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        // Check if this is a recovery registration (email recovery)
        let recoveredAddress: string | null = null;
        if (recoveryToken) {
            // First check if it's a rescue token (from orphaned passkey flow)
            const { data: rescueData, error: rescueError } = await supabase
                .from("passkey_challenges")
                .select("*")
                .eq("challenge", recoveryToken)
                .eq("ceremony_type", "rescue")
                .eq("used", false)
                .single();
            
            if (rescueData && !rescueError) {
                // This is a rescue token
                if (new Date(rescueData.expires_at) < new Date()) {
                    console.error("[Passkey] Rescue token expired");
                    return NextResponse.json(
                        { error: "Rescue token has expired. Please try logging in again." },
                        { status: 400 }
                    );
                }
                
                recoveredAddress = rescueData.user_address;
                console.log("[Passkey] RESCUE: Linking passkey to rescued address:", recoveredAddress);
                
                // Mark rescue token as used
                await supabase
                    .from("passkey_challenges")
                    .update({ used: true })
                    .eq("id", rescueData.id);
            } else {
                // Check if it's an email recovery token
                console.log("[Passkey] Recovery token provided, checking validity...");
                const { data: recoveryData, error: recoveryError } = await supabase
                    .from("passkey_recovery_codes")
                    .select("*")
                    .eq("recovery_code", recoveryToken.toUpperCase().trim())
                    .eq("used", false)
                    .single();
                
                if (recoveryError || !recoveryData) {
                    console.error("[Passkey] Invalid or used recovery token");
                    return NextResponse.json(
                        { error: "Invalid or already used recovery token" },
                        { status: 400 }
                    );
                }
                
                if (new Date(recoveryData.expires_at) < new Date()) {
                    console.error("[Passkey] Recovery token expired");
                    return NextResponse.json(
                        { error: "Recovery token has expired" },
                        { status: 400 }
                    );
                }
                
                recoveredAddress = recoveryData.user_address;
                console.log("[Passkey] Valid recovery for address:", recoveredAddress);
                
                // Mark recovery code as used
                await supabase
                    .from("passkey_recovery_codes")
                    .update({ used: true, used_at: new Date().toISOString() })
                    .eq("id", recoveryData.id);
            }
        }

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
                // SECURITY: Require user verification (biometric/PIN) for wallet operations
                requireUserVerification: true,
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

        // Determine final wallet address:
        // 1. If recovery: use the recovered address (to restore access to old account)
        // 2. If user is already authenticated: use their existing address (adding passkey to account)
        // 3. Otherwise: generate unique address from credential ID (new account)
        let finalUserAddress: string;
        let addressSource: string;
        
        if (recoveredAddress) {
            // Recovery flow - link to recovered account
            finalUserAddress = recoveredAddress;
            addressSource = "RECOVERED";
        } else {
            // Check if user is already authenticated (adding passkey to existing account)
            const { getAuthenticatedUser } = await import("@/lib/session");
            const existingUser = await getAuthenticatedUser(request);
            
            if (existingUser?.userAddress) {
                // User is logged in - add passkey to their existing account
                finalUserAddress = existingUser.userAddress;
                addressSource = "EXISTING_AUTH";
                console.log("[Passkey] User is authenticated, linking to existing account:", finalUserAddress);
            } else {
                // DEFENSIVE CHECK: If a session cookie was sent but invalid/expired,
                // reject registration to prevent accidentally creating a new account
                // for a user who SHOULD be linked to an existing account
                const sessionCookie = request.cookies.get("spritz_session");
                if (sessionCookie?.value) {
                    // Session cookie exists but is invalid - user's session expired
                    console.error("[Passkey] BLOCKED: Session cookie present but invalid. User must re-login.");
                    return NextResponse.json(
                        { error: "Your session has expired. Please log in again before registering a passkey." },
                        { status: 401 }
                    );
                }
                
                // DEFENSIVE CHECK: Also check if the temp userAddress provided in the challenge
                // belongs to an existing account (Digital ID users might have lost their session)
                const { data: existingAccount } = await supabase
                    .from("shout_users")
                    .select("wallet_address, wallet_type, login_count")
                    .eq("wallet_address", userAddress.toLowerCase())
                    .single();
                
                if (existingAccount && existingAccount.login_count > 0) {
                    // There's an existing account at this address! Don't create a new one.
                    console.log("[Passkey] Found existing account, linking passkey to it:", userAddress);
                    finalUserAddress = userAddress.toLowerCase();
                    addressSource = "EXISTING_ACCOUNT";
                } else {
                    // Genuinely new user - generate unique address from credential ID
                    // NOTE: If a World ID/Email user registers a passkey without being logged in,
                    // they will get a new account. They can recover by logging in with their
                    // original method (World ID, Email, Wallet) which will find their existing account.
                    finalUserAddress = generateWalletAddressFromCredential(credentialId);
                    addressSource = "NEW";
                    console.log("[Passkey] New passkey-only account, generated address:", finalUserAddress.slice(0, 10));
                    console.log("[Passkey] Note: If user has existing World ID/Email account, they should log in first");
                }
            }
        }
        
        console.log("[Passkey] Final address:", finalUserAddress, `(${addressSource})`);

        // Extract P256 public key coordinates for Safe passkey signer
        let p256PublicKey: P256PublicKey | null = null;
        let safeSignerAddress: string | null = null;
        
        try {
            p256PublicKey = parseCosePublicKey(publicKey);
            safeSignerAddress = calculateWebAuthnSignerAddress(p256PublicKey);
            console.log("[Passkey] Extracted P256 coordinates, Safe signer:", safeSignerAddress.slice(0, 10) + "...");
        } catch (parseError) {
            console.warn("[Passkey] Could not parse P256 coordinates:", parseError);
            // Continue without Safe signer support - passkey will still work for auth
        }

        // Store the credential in the database with the FINAL address
        const { error: insertError } = await supabase
            .from("passkey_credentials")
            .insert({
                credential_id: credentialId,
                public_key: publicKey,
                counter,
                user_address: finalUserAddress, // Use derived address, NOT the temp address
                display_name: displayName || "Spritz Passkey",
                aaguid,
                transports,
                backed_up: backedUp,
                // P256 coordinates for Safe passkey signer
                public_key_x: p256PublicKey?.x || null,
                public_key_y: p256PublicKey?.y || null,
                safe_signer_address: safeSignerAddress,
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

        console.log("[Passkey] Successfully registered credential for:", finalUserAddress);
        console.log("[Passkey] Credential ID:", credentialId.slice(0, 20) + "...");
        console.log("[Passkey] Backed up (synced):", backedUp);
        if (safeSignerAddress) {
            console.log("[Passkey] Safe signer ready:", safeSignerAddress.slice(0, 10) + "...");
        }

        // Calculate the Smart Wallet (Safe) address from the passkey signer
        // This is where the user's funds will be stored
        // IMPORTANT: Must use getSafeAddress from safeWallet.ts for consistency with transactions
        let smartWalletAddress: string | null = null;
        if (safeSignerAddress) {
            smartWalletAddress = await getSafeAddress({ 
                ownerAddress: safeSignerAddress as Address, 
                chainId: 8453 
            });
            console.log("[Passkey] Smart Wallet (Safe) address:", smartWalletAddress.slice(0, 10) + "...");
        }

        // Create/update user in shout_users table with the FINAL address
        const { data: existingUser } = await supabase
            .from("shout_users")
            .select("*")
            .eq("wallet_address", finalUserAddress)
            .maybeSingle();
        
        if (!existingUser) {
            // Create new user with wallet address
            await supabase.from("shout_users").insert({
                wallet_address: finalUserAddress,
                first_login: new Date().toISOString(),
                last_login: new Date().toISOString(),
                login_count: 1,
                // Store the Smart Wallet address derived from passkey
                // IMPORTANT: This passkey now controls this wallet
                smart_wallet_address: smartWalletAddress,
            });
            console.log("[Passkey] Created user record with wallet:", finalUserAddress);
            if (smartWalletAddress) {
                console.log("[Passkey] Wallet address locked to this passkey:", smartWalletAddress.slice(0, 10) + "...");
            }
        } else {
            // Update existing user
            // Only set smart_wallet_address if user doesn't already have one
            // (prevents changing wallet address if user already has funds)
            const updateData: Record<string, unknown> = {
                last_login: new Date().toISOString(),
                login_count: (existingUser.login_count || 0) + 1,
            };
            
            if (smartWalletAddress && !existingUser.smart_wallet_address) {
                // First passkey for this user - set their wallet address
                updateData.smart_wallet_address = smartWalletAddress;
                console.log("[Passkey] Set wallet for existing user:", smartWalletAddress.slice(0, 10) + "...");
            } else if (smartWalletAddress && existingUser.smart_wallet_address && 
                       smartWalletAddress.toLowerCase() !== existingUser.smart_wallet_address.toLowerCase()) {
                // WARNING: User already has a different wallet address
                // This could happen if they're adding a second passkey
                console.warn("[Passkey] WARNING: User already has a wallet address:", existingUser.smart_wallet_address);
                console.warn("[Passkey] New passkey would create different wallet:", smartWalletAddress);
                console.warn("[Passkey] Keeping existing wallet to protect funds");
            }
            
            await supabase
                .from("shout_users")
                .update(updateData)
                .eq("wallet_address", finalUserAddress);
        }

        // Generate a SIGNED session token for frontend localStorage (30 days)
        // SECURITY: This token is signed with HMAC-SHA256, not just base64 encoded
        const sessionToken = await createFrontendSessionToken(finalUserAddress, "passkey");

        // Return session with HttpOnly cookie AND sessionToken for frontend
        // IMPORTANT: Return the finalUserAddress so client uses the correct address
        return createAuthResponse(
            finalUserAddress,
            "passkey",
            {
                success: true,
                verified: true,
                credentialId,
                backedUp,
                sessionToken, // For frontend localStorage (now signed!)
                userAddress: finalUserAddress, // This is the REAL address to use
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
