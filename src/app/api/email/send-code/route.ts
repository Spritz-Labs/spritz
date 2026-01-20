import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { checkRateLimit } from "@/lib/ratelimit";
import { secureVerificationCode } from "@/lib/secureRandom";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const resendApiKey = process.env.RESEND_API_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const resend = resendApiKey ? new Resend(resendApiKey) : null;

export async function POST(request: NextRequest) {
    // Rate limit: 5 requests per minute for email sending (strict)
    const rateLimitResponse = await checkRateLimit(request, "strict");
    if (rateLimitResponse) return rateLimitResponse;

    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 }
        );
    }

    if (!resend) {
        return NextResponse.json(
            { error: "Email service not configured. Set RESEND_API_KEY." },
            { status: 500 }
        );
    }

    try {
        const { walletAddress, email } = await request.json();

        if (!walletAddress || !email) {
            return NextResponse.json(
                { error: "Wallet address and email are required" },
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

        // Check if email is already verified by another user
        const { data: existingUser } = await supabase
            .from("shout_users")
            .select("wallet_address")
            .eq("email", email.toLowerCase())
            .eq("email_verified", true)
            .neq("wallet_address", walletAddress.toLowerCase())
            .single();

        if (existingUser) {
            return NextResponse.json(
                { error: "This email is already verified by another account" },
                { status: 400 }
            );
        }

        // Generate cryptographically secure verification code
        const code = secureVerificationCode();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        // Delete any existing codes for this wallet
        await supabase
            .from("shout_email_verification")
            .delete()
            .eq("wallet_address", walletAddress.toLowerCase());

        // Insert new verification code
        const { error: insertError } = await supabase
            .from("shout_email_verification")
            .insert({
                wallet_address: walletAddress.toLowerCase(),
                email: email.toLowerCase(),
                code,
                expires_at: expiresAt.toISOString(),
            });

        if (insertError) {
            console.error("[Email] Insert error:", insertError);
            return NextResponse.json(
                { error: "Failed to create verification code" },
                { status: 500 }
            );
        }

        // Send email via Resend
        const { error: emailError } = await resend.emails.send({
            from: "Spritz <noreply@spritz.chat>",
            to: email,
            subject: "Verify your email for Spritz",
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #FF5500; font-size: 28px; margin: 0;">Spritz</h1>
                        <p style="color: #666; margin-top: 5px;">Voice Calls for Web3</p>
                    </div>
                    
                    <div style="background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); border-radius: 16px; padding: 30px; text-align: center;">
                        <h2 style="color: #fff; font-size: 20px; margin: 0 0 10px 0;">Verify your email</h2>
                        <p style="color: #999; margin: 0 0 25px 0;">Enter this code in the app to verify your email address:</p>
                        
                        <div style="background: #000; border-radius: 12px; padding: 20px; margin-bottom: 25px;">
                            <span style="font-family: monospace; font-size: 32px; font-weight: bold; color: #FF5500; letter-spacing: 8px;">${code}</span>
                        </div>
                        
                        <p style="color: #666; font-size: 13px; margin: 0;">This code expires in 15 minutes.</p>
                    </div>
                    
                    <p style="color: #666; font-size: 12px; text-align: center; margin-top: 30px;">
                        If you didn't request this code, you can safely ignore this email.
                    </p>
                </div>
            `,
        });

        if (emailError) {
            console.error("[Email] Send error:", emailError);
            return NextResponse.json(
                { error: "Failed to send verification email" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Verification code sent",
        });
    } catch (error) {
        console.error("[Email] Error:", error);
        return NextResponse.json(
            { error: "Failed to send verification code" },
            { status: 500 }
        );
    }
}
