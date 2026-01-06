import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const resendApiKey = process.env.RESEND_API_KEY;

const supabase =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Generate a 6-digit code
function generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest) {
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

        const normalizedEmail = email.toLowerCase();

        // Generate verification code
        const code = generateCode();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        // Delete any existing codes for this email
        await supabase
            .from("shout_email_login")
            .delete()
            .eq("email", normalizedEmail);

        // Insert new verification code
        const { error: insertError } = await supabase
            .from("shout_email_login")
            .insert({
                email: normalizedEmail,
                code,
                expires_at: expiresAt.toISOString(),
            });

        if (insertError) {
            console.error("[EmailLogin] Insert error:", insertError);
            return NextResponse.json(
                { error: "Failed to create verification code" },
                { status: 500 }
            );
        }

        // Send email via Resend
        const { error: emailError } = await resend.emails.send({
            from: "Spritz <noreply@spritz.chat>",
            to: email,
            subject: "Your Spritz login code",
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #FF5500; font-size: 28px; margin: 0;">Spritz</h1>
                        <p style="color: #666; margin-top: 5px;">Voice Calls for Web3</p>
                    </div>
                    
                    <div style="background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); border-radius: 16px; padding: 30px; text-align: center;">
                        <h2 style="color: #fff; font-size: 20px; margin: 0 0 10px 0;">Your login code</h2>
                        <p style="color: #999; margin: 0 0 25px 0;">Enter this code in the app to sign in:</p>
                        
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
            console.error("[EmailLogin] Send error:", emailError);
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
        console.error("[EmailLogin] Error:", error);
        return NextResponse.json(
            { error: "Failed to send verification code" },
            { status: 500 }
        );
    }
}

