import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { privateKeyToAccount } from "viem/accounts";
import { createHash } from "crypto";
import { createAuthResponse, getAuthenticatedUser } from "@/lib/session";

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
    console.warn("[EmailRestore] WARNING: No EMAIL_AUTH_SECRET set. Using insecure default for development only.");
}
const EFFECTIVE_EMAIL_SECRET = EMAIL_AUTH_SECRET || "dev-only-insecure-email-secret-do-not-use-in-production";

// Derive a deterministic private key from email + secret (server-side version)
function derivePrivateKeyFromEmail(
    email: string,
    secret: string
): `0x${string}` {
    const data = `${email.toLowerCase()}:${secret}`;
    const hash = createHash("sha256").update(data).digest("hex");
    return `0x${hash.padStart(64, "0").slice(0, 64)}` as `0x${string}`;
}

/**
 * Restore session for email users who have localStorage but no session cookie
 * This endpoint verifies the email-derived address matches and creates a session
 */
export async function POST(request: NextRequest) {
    // If already authenticated, just return success
    const existingSession = await getAuthenticatedUser(request);
    if (existingSession) {
        return NextResponse.json({ 
            success: true, 
            message: "Already authenticated",
            walletAddress: existingSession.userAddress,
        });
    }

    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 }
        );
    }

    try {
        const { email, address } = await request.json();

        if (!email || !address) {
            return NextResponse.json(
                { error: "Email and address are required" },
                { status: 400 }
            );
        }

        const normalizedEmail = email.toLowerCase();
        const normalizedAddress = address.toLowerCase();

        // Server re-derives the address from email to verify it matches
        const privateKey = derivePrivateKeyFromEmail(normalizedEmail, EFFECTIVE_EMAIL_SECRET);
        const account = privateKeyToAccount(privateKey);
        const expectedAddress = account.address.toLowerCase();

        // Verify the client-provided address matches the derived address
        if (normalizedAddress !== expectedAddress) {
            console.warn("[EmailRestore] Address mismatch:", {
                provided: normalizedAddress,
                expected: expectedAddress,
            });
            return NextResponse.json(
                { error: "Invalid session data" },
                { status: 401 }
            );
        }

        // Find user in database
        const { data: user } = await supabase
            .from("shout_users")
            .select("*")
            .eq("wallet_address", expectedAddress)
            .single();

        // Create session for the verified email user
        console.log("[EmailRestore] Restoring session for:", normalizedEmail);
        
        return createAuthResponse(
            expectedAddress,
            "email",
            {
                success: true,
                message: "Session restored",
                email: normalizedEmail,
                walletAddress: expectedAddress,
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
        console.error("[EmailRestore] Error:", error);
        return NextResponse.json(
            { error: "Failed to restore session" },
            { status: 500 }
        );
    }
}
