import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";
import { sanitizeInput, INPUT_LIMITS } from "@/lib/sanitize";

function getAppUrl(request: NextRequest): string {
    if (process.env.NEXT_PUBLIC_APP_URL) {
        return process.env.NEXT_PUBLIC_APP_URL;
    }
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
    return `${proto}://${host}`;
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Generate a unique invite token
function generateInviteToken(): string {
    return randomBytes(16).toString("hex");
}

// POST /api/scheduling/create-shareable - Create a shareable scheduled call
export async function POST(request: NextRequest) {
    // Rate limit - strict for creating scheduled calls
    const rateLimitResponse = await checkRateLimit(request, "strict");
    if (rateLimitResponse) return rateLimitResponse;

    try {
        // Get authenticated user
        const session = await getAuthenticatedUser(request);
        
        const body = await request.json();
        const {
            schedulerAddress: bodySchedulerAddress,
            scheduledAt, // ISO date string
            durationMinutes = 30,
            title,
            timezone,
        } = body;
        
        // Use session address, fall back to body for backward compatibility
        const schedulerAddress = session?.userAddress || bodySchedulerAddress;

        if (!schedulerAddress || !scheduledAt) {
            return NextResponse.json(
                { error: "Authentication and scheduled time are required" },
                { status: 400 }
            );
        }
        
        // Warn if using unauthenticated fallback
        if (!session && bodySchedulerAddress) {
            console.warn("[CreateShareable] Using unauthenticated address - migrate to session auth");
        }

        // Validate scheduled time is in the future
        const scheduledTime = new Date(scheduledAt);
        if (scheduledTime < new Date()) {
            return NextResponse.json(
                { error: "Scheduled time must be in the future" },
                { status: 400 }
            );
        }

        // Generate unique invite token
        const inviteToken = generateInviteToken();

        // Sanitize title input
        const sanitizedTitle = title ? sanitizeInput(title, INPUT_LIMITS.SHORT_TEXT) : "Scheduled Call";

        // Create the scheduled call entry
        // Note: recipient_wallet_address is set to schedulerAddress since they're hosting
        // scheduler_wallet_address can be null for anonymous bookings
        const { data: scheduledCall, error } = await supabase
            .from("shout_scheduled_calls")
            .insert({
                recipient_wallet_address: schedulerAddress.toLowerCase(),
                scheduler_wallet_address: schedulerAddress.toLowerCase(),
                scheduled_at: scheduledTime.toISOString(),
                duration_minutes: durationMinutes,
                title: sanitizedTitle,
                timezone: timezone || "UTC",
                status: "pending",
                invite_token: inviteToken,
                is_paid: false,
            })
            .select()
            .single();

        if (error) {
            console.error("[CreateShareable] Supabase error:", error);
            return NextResponse.json(
                { error: "Failed to create scheduled call" },
                { status: 500 }
            );
        }

        // Send email to the user (host) with join link and calendar invite
        try {
            const inviteRes = await fetch(`${getAppUrl(request)}/api/scheduling/invite`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scheduledCallId: scheduledCall.id }),
            });
            if (!inviteRes.ok) {
                console.warn("[CreateShareable] Invite email failed (user may not have email on file)");
            }
        } catch (inviteErr) {
            console.warn("[CreateShareable] Invite email error:", inviteErr);
        }

        return NextResponse.json({
            success: true,
            inviteToken: scheduledCall.invite_token,
            scheduledCall: {
                id: scheduledCall.id,
                scheduledAt: scheduledCall.scheduled_at,
                title: scheduledCall.title,
                durationMinutes: scheduledCall.duration_minutes,
            },
        });
    } catch (error) {
        console.error("[CreateShareable] Error:", error);
        return NextResponse.json(
            { error: "Failed to create shareable scheduled call" },
            { status: 500 }
        );
    }
}

