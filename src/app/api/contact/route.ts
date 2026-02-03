import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { checkRateLimit } from "@/lib/ratelimit";
import { escapeHtml, sanitizeInput, INPUT_LIMITS } from "@/lib/sanitize";

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export async function POST(request: NextRequest) {
    // Rate limit: 3 requests per minute for contact form
    const rateLimitResponse = await checkRateLimit(request, "contact");
    if (rateLimitResponse) return rateLimitResponse;

    if (!resend) {
        return NextResponse.json(
            { error: "Email service not configured" },
            { status: 500 }
        );
    }

    try {
        const contactSource =
            request.headers.get("x-contact-source")?.trim() || null;

        const body = await request.json();

        // Sanitize and validate inputs
        const name = sanitizeInput(body.name || "", INPUT_LIMITS.SHORT_TEXT);
        const email = sanitizeInput(body.email || "", INPUT_LIMITS.EMAIL);
        const inquiry = sanitizeInput(
            body.inquiry || "",
            INPUT_LIMITS.LONG_TEXT
        );

        if (!name || !email || !inquiry) {
            return NextResponse.json(
                { error: "Name, email, and inquiry are required" },
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

        const sourceLabel = contactSource ? `[${contactSource}] ` : "";

        // Send email to connect@spritz.chat
        const { error: emailError } = await resend.emails.send({
            from: "Spritz Contact Form <noreply@spritz.chat>",
            to: "connect@spritz.chat",
            replyTo: email,
            subject: `${sourceLabel}Contact Form: ${name}`,
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #FF5500; font-size: 28px; margin: 0;">Spritz</h1>
                        <p style="color: #666; margin-top: 5px;">New Contact Form Submission</p>
                    </div>
                    
                    <div style="background: #f9f9f9; border-radius: 12px; padding: 24px; margin-bottom: 20px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: 600; width: 80px;">Name:</td>
                                <td style="padding: 8px 0; color: #333;">${escapeHtml(
                                    name
                                )}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #666; font-weight: 600;">Email:</td>
                                <td style="padding: 8px 0; color: #333;">
                                    <a href="mailto:${escapeHtml(
                                        email
                                    )}" style="color: #FF5500;">${escapeHtml(
                email
            )}</a>
                                </td>
                            </tr>
                        </table>
                    </div>
                    
                    <div style="background: #fff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 24px;">
                        <h3 style="margin: 0 0 12px 0; color: #333; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Inquiry</h3>
                        <p style="color: #333; line-height: 1.6; margin: 0; white-space: pre-wrap;">${escapeHtml(
                            inquiry
                        )}</p>
                    </div>
                    
                    ${
                        contactSource
                            ? `<p style="color: #666; font-size: 13px; margin-top: 20px; padding: 12px; background: #f0f0f0; border-radius: 8px;"><strong>Source:</strong> ${escapeHtml(
                                  contactSource
                              )} (spritz.chat landing page)</p>`
                            : ""
                    }
                    <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
                        This email was sent from the Spritz contact form at spritz.chat
                    </p>
                </div>
            `,
        });

        if (emailError) {
            console.error("[Contact] Send error:", emailError);
            return NextResponse.json(
                { error: "Failed to send message" },
                { status: 500 }
            );
        }

        // Send confirmation email to the user
        await resend.emails.send({
            from: "Spritz <noreply@spritz.chat>",
            to: email,
            subject: "We received your message - Spritz",
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #FF5500; font-size: 28px; margin: 0;">Spritz</h1>
                        <p style="color: #666; margin-top: 5px;">Censorship-Resistant Chat for Web3</p>
                    </div>
                    
                    <div style="background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); border-radius: 16px; padding: 30px; text-align: center;">
                        <h2 style="color: #fff; font-size: 20px; margin: 0 0 15px 0;">Thanks for reaching out!</h2>
                        <p style="color: #ccc; margin: 0; line-height: 1.6;">
                            Hi ${escapeHtml(name)},<br><br>
                            We've received your message and will get back to you as soon as possible.
                        </p>
                    </div>
                    
                    <p style="color: #666; font-size: 12px; text-align: center; margin-top: 30px;">
                        In the meantime, feel free to explore <a href="https://app.spritz.chat" style="color: #FF5500;">Spritz</a> or check out our <a href="https://docs.spritz.chat" style="color: #FF5500;">documentation</a>.
                    </p>
                </div>
            `,
        });

        return NextResponse.json({
            success: true,
            message: "Message sent successfully",
        });
    } catch (error) {
        console.error("[Contact] Error:", error);
        return NextResponse.json(
            { error: "Failed to send message" },
            { status: 500 }
        );
    }
}
