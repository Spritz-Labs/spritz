import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Secret for key derivation (in production, use a secure secret from env)
const EMAIL_AUTH_SECRET =
    process.env.EMAIL_AUTH_SECRET || "spritz-email-auth-secret-v1";

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

        // Return the secret for key derivation
        // In production, you might want to derive the key server-side
        // and return a session token instead
        return NextResponse.json({
            success: true,
            message: "Email verified successfully",
            email: normalizedEmail,
            secret: EMAIL_AUTH_SECRET, // Client will use this to derive the private key
        });
    } catch (error) {
        console.error("[EmailLogin] Verify error:", error);
        return NextResponse.json(
            { error: "Failed to verify code" },
            { status: 500 }
        );
    }
}

