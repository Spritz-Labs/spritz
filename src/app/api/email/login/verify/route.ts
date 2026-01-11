import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { privateKeyToAccount } from "viem/accounts";
import { createHash } from "crypto";
import { createAuthResponse } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Secret for key derivation (in production, use a secure secret from env)
const EMAIL_AUTH_SECRET =
    process.env.EMAIL_AUTH_SECRET || "spritz-email-auth-secret-v1";

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

        // Derive the smart account address from email
        const privateKey = derivePrivateKeyFromEmail(normalizedEmail, EMAIL_AUTH_SECRET);
        const account = privateKeyToAccount(privateKey);
        const smartAccountAddress = account.address.toLowerCase();

        // Find or create user with this address
        let { data: user, error: userError } = await supabase
            .from("shout_users")
            .select("*")
            .eq("wallet_address", smartAccountAddress)
            .single();

        if (userError && userError.code === "PGRST116") {
            // User doesn't exist, create them
            const { data: newUser, error: createError } = await supabase
                .from("shout_users")
                .insert({
                    wallet_address: smartAccountAddress,
                    email: normalizedEmail,
                    email_verified: true,
                    email_verified_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .select()
                .single();

            if (createError) {
                console.error("[EmailLogin] Error creating user:", createError);
                // Continue anyway - user can still login
            } else {
                user = newUser;
            }
        } else if (user && !user.email_verified) {
            // User exists but email not verified - update it
            const { error: updateError } = await supabase
                .from("shout_users")
                .update({
                    email: normalizedEmail,
                    email_verified: true,
                    email_verified_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("wallet_address", smartAccountAddress);

            if (updateError) {
                console.error("[EmailLogin] Error updating user email:", updateError);
                // Continue anyway - verification still succeeded
            } else {
                // Update local user object
                user = { ...user, email: normalizedEmail, email_verified: true };
            }
        } else if (user && user.email !== normalizedEmail) {
            // User exists with different email - update it
            const { error: updateError } = await supabase
                .from("shout_users")
                .update({
                    email: normalizedEmail,
                    email_verified: true,
                    email_verified_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("wallet_address", smartAccountAddress);

            if (updateError) {
                console.error("[EmailLogin] Error updating user email:", updateError);
            }
        }

        // Return session with derived address (no longer exposing secret!)
        return createAuthResponse(
            smartAccountAddress,
            "email",
            {
                success: true,
                message: "Email verified successfully",
                email: normalizedEmail,
                walletAddress: smartAccountAddress,
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

