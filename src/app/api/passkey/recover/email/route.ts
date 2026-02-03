import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { checkRateLimit, getClientIdentifier } from "@/lib/ratelimit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const resendApiKey = process.env.RESEND_API_KEY;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.spritz.chat";
const LOGO_URL = `${APP_URL}/spritz-logo-transparent.svg`;

// Generate a 6-digit code
function generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST: Send recovery code to email
export async function POST(request: NextRequest) {
    // Strict rate limit: 3 requests per minute per IP
    const rateLimitResponse = await checkRateLimit(request, "strict");
    if (rateLimitResponse) return rateLimitResponse;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    if (!resend) {
        return NextResponse.json(
            { error: "Email service not configured" },
            { status: 500 }
        );
    }

    try {
        const { email } = await request.json();

        if (!email) {
            return NextResponse.json(
                { error: "Email is required" },
                { status: 400 }
            );
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return NextResponse.json(
                { error: "Invalid email format" },
                { status: 400 }
            );
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Check if this email exists and is verified for a passkey user
        const { data: user, error: userError } = await supabase
            .from("shout_users")
            .select("wallet_address, email_verified")
            .eq("email", normalizedEmail)
            .single();

        if (userError || !user) {
            // Don't reveal if email exists - return generic message
            console.log("[PasskeyRecovery] Email not found:", normalizedEmail);
            return NextResponse.json({
                success: true,
                message: "If this email is associated with a passkey account, you will receive a recovery code.",
            });
        }

        if (!user.email_verified) {
            // Email exists but not verified
            console.log("[PasskeyRecovery] Email not verified:", normalizedEmail);
            return NextResponse.json({
                success: true,
                message: "If this email is associated with a passkey account, you will receive a recovery code.",
            });
        }

        // Check if user has passkey credentials (is a passkey user)
        const { data: credentials } = await supabase
            .from("passkey_credentials")
            .select("id")
            .eq("user_address", user.wallet_address)
            .limit(1);

        // Even if they don't have passkey credentials, we might want to help them
        // (they could have lost all passkeys and need recovery)
        // So we'll send the code anyway if they have a verified email

        // Additional rate limit per email: max 3 codes per hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count: recentCodes } = await supabase
            .from("passkey_email_recovery")
            .select("*", { count: "exact", head: true })
            .eq("email", normalizedEmail)
            .gte("created_at", oneHourAgo);

        if (recentCodes && recentCodes >= 3) {
            console.log("[PasskeyRecovery] Rate limit exceeded for email:", normalizedEmail);
            return NextResponse.json(
                { error: "Too many recovery attempts. Please try again later." },
                { status: 429 }
            );
        }

        // Generate recovery code
        const code = generateCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Store recovery code
        const { error: insertError } = await supabase
            .from("passkey_email_recovery")
            .insert({
                email: normalizedEmail,
                user_address: user.wallet_address,
                code,
                expires_at: expiresAt.toISOString(),
                ip_address: getClientIdentifier(request),
            });

        if (insertError) {
            console.error("[PasskeyRecovery] Insert error:", insertError);
            return NextResponse.json(
                { error: "Failed to create recovery code" },
                { status: 500 }
            );
        }

        // Send email
        const { error: emailError } = await resend.emails.send({
            from: "Spritz <noreply@spritz.chat>",
            to: normalizedEmail,
            subject: "Passkey Recovery Code - Spritz",
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <img src="${LOGO_URL}" alt="Spritz" width="180" height="77" style="display: block; margin: 0 auto; max-width: 180px; height: auto;" />
                        <p style="color: #666; margin-top: 12px;">Passkey Account Recovery</p>
                    </div>
                    
                    <div style="background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); border-radius: 16px; padding: 30px; text-align: center;">
                        <h2 style="color: #fff; font-size: 20px; margin: 0 0 10px 0;">Recovery Code</h2>
                        <p style="color: #999; margin: 0 0 25px 0;">Enter this code to recover your passkey account:</p>
                        
                        <div style="background: #000; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
                            <span style="font-family: monospace; font-size: 36px; font-weight: bold; color: #FF5500; letter-spacing: 8px;">${code}</span>
                        </div>
                        
                        <p style="color: #666; font-size: 13px; margin: 0;">This code expires in <strong>10 minutes</strong>.</p>
                    </div>
                    
                    <div style="background: #2a2a2a; border-radius: 12px; padding: 20px; margin-top: 20px;">
                        <h3 style="color: #fff; font-size: 14px; margin: 0 0 10px 0;">Next Steps:</h3>
                        <ol style="color: #999; font-size: 13px; margin: 0; padding-left: 20px;">
                            <li style="margin-bottom: 8px;">Enter this code in the recovery form</li>
                            <li style="margin-bottom: 8px;">Register a new passkey when prompted</li>
                            <li><strong style="color: #4ade80;">Important:</strong> Save your passkey to <strong>iCloud</strong> or <strong>Google Password Manager</strong> for backup</li>
                        </ol>
                    </div>
                    
                    <p style="color: #666; font-size: 12px; text-align: center; margin-top: 30px;">
                        If you didn't request this code, someone may be trying to access your account. You can safely ignore this email.
                    </p>
                </div>
            `,
        });

        if (emailError) {
            console.error("[PasskeyRecovery] Email send error:", emailError);
            return NextResponse.json(
                { error: "Failed to send recovery email" },
                { status: 500 }
            );
        }

        console.log("[PasskeyRecovery] Recovery code sent to:", normalizedEmail);

        return NextResponse.json({
            success: true,
            message: "If this email is associated with a passkey account, you will receive a recovery code.",
            // In development, you might want to return the code for testing
            // ...(process.env.NODE_ENV === "development" && { code }),
        });
    } catch (error) {
        console.error("[PasskeyRecovery] Error:", error);
        return NextResponse.json(
            { error: "Failed to process recovery request" },
            { status: 500 }
        );
    }
}
