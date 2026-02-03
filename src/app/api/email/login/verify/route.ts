import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { privateKeyToAccount } from "viem/accounts";
import { createHash } from "crypto";
import { createAuthResponse, createFrontendSessionToken } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// SECURITY: Email auth secret must be explicitly set - no fallback
const EMAIL_AUTH_SECRET = process.env.EMAIL_AUTH_SECRET;
if (!EMAIL_AUTH_SECRET) {
    if (process.env.NODE_ENV === "production") {
        throw new Error("CRITICAL: EMAIL_AUTH_SECRET must be set in production!");
    }
    console.warn("[EmailLogin] WARNING: No EMAIL_AUTH_SECRET set. Using insecure default for development only.");
}
const EFFECTIVE_EMAIL_SECRET = EMAIL_AUTH_SECRET || "dev-only-insecure-email-secret-do-not-use-in-production";

// Session token generation moved to @/lib/session (createFrontendSessionToken)
// SECURITY: Tokens are now signed with HMAC-SHA256

// Derive a deterministic private key from email + secret (server-side version)
function derivePrivateKeyFromEmail(
    email: string,
    secret: string
): `0x${string}` {
    const data = `${email.toLowerCase()}:${secret}`;
    const hash = createHash("sha256").update(data).digest("hex");
    // Ensure it's a valid private key (64 hex chars, starts with 0x)
    return `0x${hash.padStart(64, "0").slice(0, 64)}` as `0x${string}`;
}

export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 }
        );
    }

    try {
        const { email, code } = await request.json();

        if (!email || !code) {
            return NextResponse.json(
                { error: "Email and code are required" },
                { status: 400 }
            );
        }

        const normalizedEmail = email.toLowerCase();

        // Find the verification record
        const { data: verification, error: findError } = await supabase
            .from("shout_email_login")
            .select("*")
            .eq("email", normalizedEmail)
            .eq("code", code)
            .eq("verified", false)
            .single();

        if (findError || !verification) {
            return NextResponse.json(
                { error: "Invalid verification code" },
                { status: 400 }
            );
        }

        // Check if expired
        if (new Date(verification.expires_at) < new Date()) {
            return NextResponse.json(
                { error: "Verification code has expired" },
                { status: 400 }
            );
        }

        // Mark verification as complete
        await supabase
            .from("shout_email_login")
            .update({ verified: true })
            .eq("id", verification.id);

        // CRITICAL FIX: Check for EXISTING account with this email FIRST
        // This prevents creating duplicate accounts when EMAIL_AUTH_SECRET changes
        // or when users have accounts from different auth methods
        const { data: existingUsers } = await supabase
            .from("shout_users")
            .select("*")
            .eq("email", normalizedEmail)
            .eq("email_verified", true)
            .order("login_count", { ascending: false }); // Prefer most-used account

        let user = existingUsers?.[0] || null;
        let finalAddress: string;

        if (user) {
            // Use the EXISTING account - don't create a new one!
            console.log("[EmailLogin] Found existing account for email:", normalizedEmail, "->", user.wallet_address);
            finalAddress = user.wallet_address;
            
            // Update last login
            await supabase
                .from("shout_users")
                .update({
                    last_login: new Date().toISOString(),
                    login_count: (user.login_count || 0) + 1,
                })
                .eq("wallet_address", finalAddress);
        } else {
            // No existing account with this email - derive address and create new user
            const privateKey = derivePrivateKeyFromEmail(normalizedEmail, EFFECTIVE_EMAIL_SECRET);
            const account = privateKeyToAccount(privateKey);
            finalAddress = account.address.toLowerCase();

            // Check if this derived address already exists (edge case)
            const { data: derivedUser } = await supabase
                .from("shout_users")
                .select("*")
                .eq("wallet_address", finalAddress)
                .single();

            if (derivedUser) {
                user = derivedUser;
                // Update with verified email and opt in to email updates
                await supabase
                    .from("shout_users")
                    .update({
                        email: normalizedEmail,
                        email_verified: true,
                        email_verified_at: new Date().toISOString(),
                        email_updates_opt_in: true,
                        last_login: new Date().toISOString(),
                        login_count: (derivedUser.login_count || 0) + 1,
                    })
                    .eq("wallet_address", finalAddress);
            } else {
                // Create new user (opt in to email updates when they verify)
                const { data: newUser, error: createError } = await supabase
                    .from("shout_users")
                    .insert({
                        wallet_address: finalAddress,
                        email: normalizedEmail,
                        email_verified: true,
                        email_verified_at: new Date().toISOString(),
                        email_updates_opt_in: true,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        login_count: 1,
                    })
                    .select()
                    .single();

                if (createError) {
                    console.error("[EmailLogin] Error creating user:", createError);
                } else {
                    user = newUser;
                }
            }
        }

        // Generate SIGNED session token for frontend localStorage (matches passkey flow)
        // SECURITY: Token is signed with HMAC-SHA256, not just base64 encoded
        const sessionToken = await createFrontendSessionToken(finalAddress, "email");

        // Return session with cookie AND sessionToken for frontend
        return createAuthResponse(
            finalAddress,
            "email",
            {
                success: true,
                message: "Email verified successfully",
                email: normalizedEmail,
                walletAddress: finalAddress,
                sessionToken, // For frontend localStorage
                user: user ? {
                    id: user.id,
                    wallet_address: user.wallet_address,
                    email: user.email,
                    email_verified: user.email_verified || false,
                    beta_access: user.beta_access || false,
                } : null,
            },
            user?.id
        );
    } catch (error) {
        console.error("[EmailLogin] Verify error:", error);
        return NextResponse.json(
            { error: "Failed to verify code" },
            { status: 500 }
        );
    }
}

