import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { formatInTimeZone } from "date-fns-tz";
import { addMinutes } from "date-fns";

function generateInviteToken(): string {
    return randomBytes(16).toString("hex");
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Always use app.spritz.chat for email links (not spritz.chat which is landing page)
const BASE_URL = "https://app.spritz.chat";
const LOGO_URL = `${BASE_URL}/spritz-logo-transparent.svg`;

// Generate ICS calendar file content
function generateICSFile({
    title,
    description,
    startTime,
    duration,
    location,
    organizerEmail,
    organizerName,
    attendeeEmail,
    attendeeName,
    uid,
}: {
    title: string;
    description: string;
    startTime: Date;
    duration: number;
    location: string;
    organizerEmail?: string;
    organizerName: string;
    attendeeEmail?: string;
    attendeeName: string;
    uid: string;
}): string {
    const endTime = addMinutes(startTime, duration);
    
    // Format dates in ICS format (YYYYMMDDTHHmmssZ)
    const formatICSDate = (date: Date): string => {
        return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    };
    
    const dtStart = formatICSDate(startTime);
    const dtEnd = formatICSDate(endTime);
    const dtStamp = formatICSDate(new Date());
    
    // Escape special characters in text fields
    const escapeICS = (text: string): string => {
        return text
            .replace(/\\/g, "\\\\")
            .replace(/;/g, "\\;")
            .replace(/,/g, "\\,")
            .replace(/\n/g, "\\n");
    };
    
    let icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Spritz//Video Calls//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:${uid}@spritz.chat
DTSTAMP:${dtStamp}
DTSTART:${dtStart}
DTEND:${dtEnd}
SUMMARY:${escapeICS(title)}
DESCRIPTION:${escapeICS(description)}
LOCATION:${escapeICS(location)}
STATUS:CONFIRMED
SEQUENCE:0`;

    if (organizerEmail) {
        icsContent += `
ORGANIZER;CN="${escapeICS(organizerName)}":mailto:${organizerEmail}`;
    }
    
    if (attendeeEmail) {
        icsContent += `
ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN="${escapeICS(attendeeName)}":mailto:${attendeeEmail}`;
    }
    
    icsContent += `
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Reminder: ${escapeICS(title)}
TRIGGER:-PT15M
END:VALARM
END:VEVENT
END:VCALENDAR`;

    return icsContent;
}

// POST /api/scheduling/invite - Send scheduling invite emails
export async function POST(request: NextRequest) {
    if (!resend) {
        return NextResponse.json(
            { error: "Email service not configured" },
            { status: 503 }
        );
    }

    try {
        const body = await request.json();
        const { scheduledCallId, recipientEmail, schedulerEmail } = body;

        if (!scheduledCallId) {
            return NextResponse.json(
                { error: "Scheduled call ID required" },
                { status: 400 }
            );
        }

        // Get scheduled call details
        const { data: call, error: callError } = await supabase
            .from("shout_scheduled_calls")
            .select("*")
            .eq("id", scheduledCallId)
            .single();

        if (callError || !call) {
            return NextResponse.json(
                { error: "Scheduled call not found" },
                { status: 404 }
            );
        }

        // Ensure invite_token exists (older records may not have one)
        let inviteToken = call.invite_token;
        if (!inviteToken) {
            inviteToken = generateInviteToken();
            await supabase
                .from("shout_scheduled_calls")
                .update({ invite_token: inviteToken })
                .eq("id", scheduledCallId);
        }

        // Get recipient (host) user details
        const { data: hostUser } = await supabase
            .from("shout_users")
            .select("display_name, email")
            .eq("wallet_address", call.recipient_wallet_address)
            .single();

        const hostName = hostUser?.display_name || `${call.recipient_wallet_address.slice(0, 6)}...${call.recipient_wallet_address.slice(-4)}`;
        const guestName = call.guest_name || call.scheduler_name || "Guest";
        const scheduledTime = new Date(call.scheduled_at);
        const timezone = call.timezone || "UTC";
        const duration = call.duration_minutes || 30;
        const isPaid = call.is_paid || call.payment_amount_cents > 0;

        // Format time for display
        const formattedDate = formatInTimeZone(scheduledTime, timezone, "EEEE, MMMM d, yyyy");
        const formattedTime = formatInTimeZone(scheduledTime, timezone, "h:mm a zzz");

        const emailsSent = [];
        const joinUrl = `${BASE_URL}/join/${inviteToken}`;
        const guestEmailAddress = schedulerEmail || call.guest_email || call.scheduler_email;
        const hostEmailAddress = recipientEmail || hostUser?.email;

        // Generate ICS calendar file
        const icsContent = generateICSFile({
            title: `${isPaid ? "Priority Session" : "Call"} with ${hostName}`,
            description: `Join your Spritz video call at: ${joinUrl}${call.notes ? `\\n\\nNotes: ${call.notes}` : ""}`,
            startTime: scheduledTime,
            duration,
            location: joinUrl,
            organizerEmail: hostEmailAddress,
            organizerName: hostName,
            attendeeEmail: guestEmailAddress,
            attendeeName: guestName,
            uid: call.id,
        });
        
        // Convert to base64 for email attachment
        const icsBase64 = Buffer.from(icsContent).toString("base64");
        const icsAttachment = {
            filename: "invite.ics",
            content: icsBase64,
            content_type: "text/calendar;charset=utf-8;method=REQUEST",
        };

        // Send to scheduler (guest)
        if (guestEmailAddress) {
            try {
                await resend.emails.send({
                    from: "Spritz <noreply@spritz.chat>",
                    to: guestEmailAddress,
                    subject: `✅ Your call with ${hostName} is confirmed`,
                    html: generateGuestEmail({
                        guestName,
                        hostName,
                        formattedDate,
                        formattedTime,
                        duration,
                        isPaid,
                        inviteToken,
                        notes: call.notes,
                        timezone,
                        scheduledTime,
                    }),
                    attachments: [icsAttachment],
                });
                emailsSent.push({ email: guestEmailAddress, type: "guest" });
            } catch (err) {
                console.error("[Invite] Failed to send guest email:", err);
            }
        }

        // Send to host (recipient)
        if (hostEmailAddress) {
            try {
                await resend.emails.send({
                    from: "Spritz <noreply@spritz.chat>",
                    to: hostEmailAddress,
                    subject: `📅 New booking: ${guestName} scheduled a call`,
                    html: generateHostEmail({
                        guestName,
                        guestEmail: guestEmailAddress,
                        hostName,
                        formattedDate,
                        formattedTime,
                        duration,
                        isPaid,
                        amount: call.payment_amount_cents,
                        inviteToken,
                        notes: call.notes,
                        timezone,
                        scheduledTime,
                    }),
                    attachments: [icsAttachment],
                });
                emailsSent.push({ email: hostEmailAddress, type: "host" });
            } catch (err) {
                console.error("[Invite] Failed to send host email:", err);
            }
        }

        // Update invite_sent_at timestamp
        await supabase
            .from("shout_scheduled_calls")
            .update({ invite_sent_at: new Date().toISOString() })
            .eq("id", scheduledCallId);

        return NextResponse.json({
            success: true,
            emailsSent,
        });
    } catch (error) {
        console.error("[Invite] Error:", error);
        return NextResponse.json(
            { error: "Failed to send invite emails" },
            { status: 500 }
        );
    }
}

interface GuestEmailParams {
    guestName: string;
    hostName: string;
    formattedDate: string;
    formattedTime: string;
    duration: number;
    isPaid: boolean;
    inviteToken: string;
    notes?: string;
    timezone: string;
    scheduledTime: Date;
}

function generateGuestEmail({
    guestName,
    hostName,
    formattedDate,
    formattedTime,
    duration,
    isPaid,
    inviteToken,
    notes,
    scheduledTime,
}: GuestEmailParams): string {
    // Generate Google Calendar link with proper dates
    const endTime = addMinutes(scheduledTime, duration);
    const gcalStart = scheduledTime.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const gcalEnd = endTime.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const gcalTitle = encodeURIComponent(`Call with ${hostName}`);
    const gcalDetails = encodeURIComponent(`Join your Spritz video call at: ${BASE_URL}/join/${inviteToken}`);
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${gcalTitle}&dates=${gcalStart}/${gcalEnd}&details=${gcalDetails}`;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 32px;">
            <img src="${LOGO_URL}" alt="Spritz" width="180" height="77" style="display: block; margin: 0 auto; max-width: 180px; height: auto;" />
        </div>

        <!-- Main Card -->
        <div style="background: linear-gradient(135deg, #18181b 0%, #1f1f23 100%); border-radius: 20px; padding: 32px; border: 1px solid #27272a;">
            <!-- Confirmation Badge -->
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(34, 197, 94, 0.15); color: #22c55e; padding: 8px 16px; border-radius: 100px; font-size: 14px; font-weight: 600;">
                    <span style="font-size: 16px;">✓</span> Booking Confirmed
                </div>
            </div>

            <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0 0 8px 0; text-align: center;">
                Hi ${guestName}!
            </h1>
            <p style="color: #a1a1aa; font-size: 16px; margin: 0 0 32px 0; text-align: center; line-height: 1.5;">
                Your ${isPaid ? "priority session" : "call"} with ${hostName} is confirmed.
            </p>

            <!-- Time Card -->
            <div style="background: #09090b; border-radius: 16px; padding: 24px; margin-bottom: 24px; text-align: center;">
                <div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 16px;">
                    <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #FF5500, #FB8D22); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                        <span style="font-size: 24px;">📅</span>
                    </div>
                </div>
                <p style="color: #ffffff; font-size: 20px; font-weight: 600; margin: 0 0 8px 0;">
                    ${formattedDate}
                </p>
                <p style="color: #FF5500; font-size: 18px; font-weight: 600; margin: 0 0 4px 0;">
                    ${formattedTime}
                </p>
                <p style="color: #71717a; font-size: 14px; margin: 0;">
                    ${duration} minutes
                </p>
            </div>

            ${notes ? `
            <!-- Notes -->
            <div style="background: #09090b; border-radius: 12px; padding: 16px; margin-bottom: 24px; border-left: 3px solid #FF5500;">
                <p style="color: #a1a1aa; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0;">Your notes</p>
                <p style="color: #e4e4e7; font-size: 14px; margin: 0; line-height: 1.5;">${notes}</p>
            </div>
            ` : ""}

            <!-- Join Button -->
            <a href="${BASE_URL}/join/${inviteToken}" style="display: block; background: linear-gradient(135deg, #FF5500, #FB8D22); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-size: 16px; font-weight: 600; text-align: center; margin-bottom: 16px;">
                Join Call When It's Time
            </a>

            <p style="color: #71717a; font-size: 13px; text-align: center; margin: 0;">
                <span style="color: #52525b;">📎 Calendar invite attached</span> · 
                <a href="${googleCalendarUrl}" style="color: #FF5500; text-decoration: none;">Add to Google Calendar</a>
            </p>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 32px;">
            <p style="color: #52525b; font-size: 12px; margin: 0;">
                Sent via <a href="${BASE_URL}" style="color: #FF5500; text-decoration: none;">Spritz</a> · Web3 Video Calls
            </p>
        </div>
    </div>
</body>
</html>
    `;
}

interface HostEmailParams {
    guestName: string;
    guestEmail?: string;
    hostName: string;
    formattedDate: string;
    formattedTime: string;
    duration: number;
    isPaid: boolean;
    amount?: number;
    inviteToken: string;
    notes?: string;
    timezone: string;
    scheduledTime: Date;
}

function generateHostEmail({
    guestName,
    guestEmail,
    formattedDate,
    formattedTime,
    duration,
    isPaid,
    amount,
    inviteToken,
    notes,
    scheduledTime,
}: HostEmailParams): string {
    // Generate Google Calendar link with proper dates
    const endTime = addMinutes(scheduledTime, duration);
    const gcalStart = scheduledTime.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const gcalEnd = endTime.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const gcalTitle = encodeURIComponent(`Call with ${guestName}`);
    const gcalDetails = encodeURIComponent(`Join your Spritz video call at: ${BASE_URL}/join/${inviteToken}`);
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${gcalTitle}&dates=${gcalStart}/${gcalEnd}&details=${gcalDetails}`;

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <div style="max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 32px;">
            <img src="${LOGO_URL}" alt="Spritz" width="180" height="77" style="display: block; margin: 0 auto; max-width: 180px; height: auto;" />
        </div>

        <!-- Main Card -->
        <div style="background: linear-gradient(135deg, #18181b 0%, #1f1f23 100%); border-radius: 20px; padding: 32px; border: 1px solid #27272a;">
            <!-- New Booking Badge -->
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(255, 85, 0, 0.15); color: #FF5500; padding: 8px 16px; border-radius: 100px; font-size: 14px; font-weight: 600;">
                    <span style="font-size: 16px;">📅</span> New Booking
                </div>
            </div>

            <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0 0 8px 0; text-align: center;">
                ${guestName} booked a call
            </h1>
            <p style="color: #a1a1aa; font-size: 16px; margin: 0 0 32px 0; text-align: center; line-height: 1.5;">
                ${isPaid ? `This is a paid session ($${((amount || 0) / 100).toFixed(2)})` : "Free consultation"}
            </p>

            <!-- Guest Info -->
            <div style="background: #09090b; border-radius: 16px; padding: 20px; margin-bottom: 16px;">
                <p style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px 0;">Guest Details</p>
                <p style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 0 0 4px 0;">${guestName}</p>
                ${guestEmail ? `<p style="color: #a1a1aa; font-size: 14px; margin: 0;">${guestEmail}</p>` : ""}
            </div>

            <!-- Time Card -->
            <div style="background: #09090b; border-radius: 16px; padding: 20px; margin-bottom: 16px;">
                <p style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px 0;">When</p>
                <p style="color: #ffffff; font-size: 18px; font-weight: 600; margin: 0 0 4px 0;">
                    ${formattedDate}
                </p>
                <p style="color: #FF5500; font-size: 16px; font-weight: 500; margin: 0 0 4px 0;">
                    ${formattedTime}
                </p>
                <p style="color: #71717a; font-size: 14px; margin: 0;">
                    ${duration} minutes
                </p>
            </div>

            ${notes ? `
            <!-- Notes -->
            <div style="background: #09090b; border-radius: 12px; padding: 16px; margin-bottom: 24px; border-left: 3px solid #FF5500;">
                <p style="color: #a1a1aa; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0;">Notes from guest</p>
                <p style="color: #e4e4e7; font-size: 14px; margin: 0; line-height: 1.5;">${notes}</p>
            </div>
            ` : ""}

            <!-- Join Button -->
            <a href="${BASE_URL}/join/${inviteToken}" style="display: block; background: linear-gradient(135deg, #FF5500, #FB8D22); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-size: 16px; font-weight: 600; text-align: center; margin-bottom: 16px;">
                View & Join Call
            </a>

            <p style="color: #71717a; font-size: 13px; text-align: center; margin: 0;">
                <span style="color: #52525b;">📎 Calendar invite attached</span> · 
                <a href="${googleCalendarUrl}" style="color: #FF5500; text-decoration: none;">Add to Google Calendar</a>
            </p>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 32px;">
            <p style="color: #52525b; font-size: 12px; margin: 0;">
                Manage your availability at <a href="${BASE_URL}" style="color: #FF5500; text-decoration: none;">spritz.chat</a>
            </p>
        </div>
    </div>
</body>
</html>
    `;
}

