import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit } from "@/lib/ratelimit";
import { secureRandomString } from "@/lib/secureRandom";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Generate a secure recovery token using cryptographically secure random
function generateRecoveryToken(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No confusing chars (0/O, 1/I)
    const raw = secureRandomString(12, chars);
    // Format as XXXX-XXXX-XXXX
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

// POST: Verify email code and create recovery token
export async function POST(request: NextRequest) {
    // Auth rate limit: 10 requests per minute
    const rateLimitResponse = await checkRateLimit(request, "auth");
    if (rateLimitResponse) return rateLimitResponse;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const { email, code } = await request.json();

        if (!email || !code) {
            return NextResponse.json(
                { error: "Email and code are required" },
                { status: 400 }
            );
        }

        const normalizedEmail = email.toLowerCase().trim();
        const normalizedCode = code.trim();

        // Find the recovery record
        const { data: recovery, error: findError } = await supabase
            .from("passkey_email_recovery")
            .select("*")
            .eq("email", normalizedEmail)
            .eq("code", normalizedCode)
            .eq("used", false)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        if (findError || !recovery) {
            console.log("[PasskeyRecovery] Invalid code for:", normalizedEmail);
            
            // Increment attempts counter for security tracking
            await supabase
                .from("passkey_email_recovery")
                .update({ attempts: supabase.rpc("increment_attempts") })
                .eq("email", normalizedEmail)
                .eq("used", false);
            
            return NextResponse.json(
                { error: "Invalid or expired recovery code" },
                { status: 400 }
            );
        }

        // Check if expired
        if (new Date(recovery.expires_at) < new Date()) {
            console.log("[PasskeyRecovery] Expired code for:", normalizedEmail);
            return NextResponse.json(
                { error: "Recovery code has expired. Please request a new one." },
                { status: 400 }
            );
        }

        // Check attempts (max 5)
        if (recovery.attempts >= 5) {
            console.log("[PasskeyRecovery] Too many attempts for:", normalizedEmail);
            return NextResponse.json(
                { error: "Too many incorrect attempts. Please request a new code." },
                { status: 400 }
            );
        }

        // Code is valid - mark as used
        await supabase
            .from("passkey_email_recovery")
            .update({ used: true, used_at: new Date().toISOString() })
            .eq("id", recovery.id);

        // Create a recovery token in passkey_recovery_codes (reusing existing table)
        const recoveryToken = generateRecoveryToken();
        const tokenExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        const { error: tokenError } = await supabase
            .from("passkey_recovery_codes")
            .insert({
                user_address: recovery.user_address,
                recovery_code: recoveryToken,
                expires_at: tokenExpires.toISOString(),
                created_by: "email_recovery",
                notes: `Email recovery for ${normalizedEmail}`,
            });

        if (tokenError) {
            console.error("[PasskeyRecovery] Token creation error:", tokenError);
            return NextResponse.json(
                { error: "Failed to create recovery token" },
                { status: 500 }
            );
        }

        console.log("[PasskeyRecovery] Email verified, token created for:", recovery.user_address);

        return NextResponse.json({
            success: true,
            userAddress: recovery.user_address,
            recoveryToken,
            message: "Email verified! You can now register a new passkey.",
            expiresIn: 600, // 10 minutes in seconds
        });
    } catch (error) {
        console.error("[PasskeyRecovery] Verify error:", error);
        return NextResponse.json(
            { error: "Failed to verify recovery code" },
            { status: 500 }
        );
    }
}
