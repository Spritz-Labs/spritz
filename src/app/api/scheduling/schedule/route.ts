import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { Resend } from "resend";
import { verifyX402Payment, type X402Config } from "@/lib/x402";
import { toZonedTime, format } from "date-fns-tz";

function generateInviteToken(): string {
    return randomBytes(16).toString("hex");
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

// Helper to get the app's base URL from the request
function getAppUrl(request: NextRequest): string {
    if (process.env.NEXT_PUBLIC_APP_URL) {
        return process.env.NEXT_PUBLIC_APP_URL;
    }
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const host =
        request.headers.get("x-forwarded-host") ||
        request.headers.get("host") ||
        "localhost:3000";
    return `${proto}://${host}`;
}

// POST /api/scheduling/schedule - Schedule a call with a user
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            recipientAddress, // User to schedule with
            schedulerAddress, // Person scheduling (optional, can be anonymous)
            scheduledAt, // ISO date string (should be in UTC)
            timezone, // Timezone of the scheduled time (for display/storage)
            durationMinutes, // Optional, defaults to user's setting
            title, // Optional title/description
            guestEmail, // Optional email for calendar invite
            guestName, // Optional name for calendar invite
            notes, // Optional notes from scheduler
            isPaid, // Whether this is a paid booking
            paymentTransactionHash, // Direct USDC transfer tx hash from frontend
            paymentHeader, // x402 payment header if payment required (for API calls)
        } = body;

        if (!recipientAddress || !scheduledAt) {
            return NextResponse.json(
                { error: "Recipient address and scheduled time are required" },
                { status: 400 }
            );
        }

        // Debug: Log incoming request
        console.log("[Schedule] Incoming request:", {
            recipientAddress,
            scheduledAt,
            timezone,
            durationMinutes,
            isPaid,
        });

        // Get recipient's scheduling settings
        const { data: settings } = await supabase
            .from("shout_user_settings")
            .select(
                "scheduling_enabled, scheduling_price_cents, scheduling_network, scheduling_wallet_address, scheduling_duration_minutes, scheduling_paid_enabled, scheduling_free_enabled"
            )
            .eq("wallet_address", recipientAddress.toLowerCase())
            .single();

        if (!settings?.scheduling_enabled) {
            return NextResponse.json(
                { error: "User does not have scheduling enabled" },
                { status: 403 }
            );
        }

        const priceCents = settings.scheduling_price_cents || 0;
        const duration =
            durationMinutes || settings.scheduling_duration_minutes || 30;

        // Determine if payment is required based on the booking type
        const requiresPayment =
            isPaid && priceCents > 0 && settings.scheduling_paid_enabled;

        // Verify payment if required
        let paymentResult = null;
        if (requiresPayment) {
            // Accept either direct tx hash from frontend OR x402 payment header
            if (!paymentTransactionHash && !paymentHeader) {
                return NextResponse.json(
                    {
                        error: "Payment required",
                        priceCents,
                        network: settings.scheduling_network || "base",
                        payToAddress:
                            settings.scheduling_wallet_address ||
                            recipientAddress,
                    },
                    { status: 402 }
                );
            }

            // If we have a direct transaction hash from the frontend, use that
            if (paymentTransactionHash) {
                paymentResult = {
                    isValid: true,
                    transactionHash: paymentTransactionHash,
                    payerAddress: schedulerAddress,
                };
            } else if (paymentHeader) {
                // Otherwise verify via x402
                const x402Config: X402Config = {
                    priceUSD: `$${(priceCents / 100).toFixed(2)}`,
                    network: (settings.scheduling_network || "base") as
                        | "base"
                        | "base-sepolia",
                    payToAddress:
                        settings.scheduling_wallet_address || recipientAddress,
                    description: `Schedule a call with ${recipientAddress.slice(
                        0,
                        6
                    )}...${recipientAddress.slice(-4)}`,
                };

                // Create a mock request with the payment header for verification
                const mockRequest = new NextRequest(request.url, {
                    headers: {
                        "X-Payment": paymentHeader,
                    },
                });

                paymentResult = await verifyX402Payment(
                    mockRequest,
                    x402Config
                );

                if (!paymentResult.isValid) {
                    return NextResponse.json(
                        {
                            error: "Payment verification failed",
                            details: paymentResult.error,
                        },
                        { status: 402 }
                    );
                }
            }
        }

        // Validate the scheduled time is available
        // scheduledAt should be in UTC ISO format
        const scheduledTime = new Date(scheduledAt);
        const now = new Date();

        // Get recipient's timezone for calendar event creation
        const { data: recipientWindows } = await supabase
            .from("shout_availability_windows")
            .select("timezone")
            .eq("wallet_address", recipientAddress.toLowerCase())
            .eq("is_active", true)
            .limit(1)
            .single();

        const recipientTimezone =
            recipientWindows?.timezone || timezone || "UTC";

        // Check minimum advance notice
        const { data: advanceNotice } = await supabase
            .from("shout_user_settings")
            .select("scheduling_advance_notice_hours")
            .eq("wallet_address", recipientAddress.toLowerCase())
            .single();

        const minAdvanceHours =
            advanceNotice?.scheduling_advance_notice_hours || 24;
        const minTime = new Date(
            now.getTime() + minAdvanceHours * 60 * 60 * 1000
        );

        if (scheduledTime < minTime) {
            return NextResponse.json(
                {
                    error: `Scheduled time must be at least ${minAdvanceHours} hours in advance`,
                },
                { status: 400 }
            );
        }

        // Check if slot is still available (race condition protection)
        // Use a wider window to catch all potential conflicts
        const slotStart = scheduledTime.getTime();
        const slotEnd = new Date(
            scheduledTime.getTime() + duration * 60 * 1000
        );
        const slotEndTime = slotEnd.getTime();

        // Check existing scheduled calls - need to check for ANY overlap
        // A call overlaps if: callStart < slotEnd AND callEnd > slotStart
        // Fetch calls that could overlap: start time in [slotStart - lookback, slotEnd]
        // Use 24h lookback so long events (e.g. 3hr meeting) that start before our slot are included
        const lookbackMinutes = 24 * 60;
        const queryStart = new Date(slotStart - lookbackMinutes * 60 * 1000);
        const queryEnd = new Date(slotEndTime); // calls starting after slotEnd can't overlap

        const { data: existingCalls } = await supabase
            .from("shout_scheduled_calls")
            .select("id, scheduled_at, duration_minutes")
            .eq("recipient_wallet_address", recipientAddress.toLowerCase())
            .in("status", ["pending", "confirmed"])
            .gte("scheduled_at", queryStart.toISOString())
            .lte("scheduled_at", queryEnd.toISOString());

        // Check for any overlapping calls
        const hasConflict = existingCalls?.some((call) => {
            const callStart = new Date(call.scheduled_at).getTime();
            const callDuration = (call.duration_minutes || 30) * 60 * 1000;
            const callEnd = callStart + callDuration;

            // Check for any overlap between [slotStart, slotEnd] and [callStart, callEnd]
            return (
                (slotStart >= callStart && slotStart < callEnd) || // New slot starts during existing call
                (slotEndTime > callStart && slotEndTime <= callEnd) || // New slot ends during existing call
                (slotStart <= callStart && slotEndTime >= callEnd) // New slot completely contains existing call
            );
        });

        if (hasConflict) {
            console.log("[Schedule] Database conflict detected:", {
                requestedSlot: {
                    start: scheduledTime.toISOString(),
                    end: slotEnd.toISOString(),
                },
                existingCallsCount: existingCalls?.length || 0,
            });
            return NextResponse.json(
                {
                    error: "This time slot is no longer available",
                    source: "database",
                },
                { status: 409 }
            );
        }

        // Also check Google Calendar for busy times (if connected)
        const { data: calendarConnection } = await supabase
            .from("shout_calendar_connections")
            .select("*")
            .eq("wallet_address", recipientAddress.toLowerCase())
            .eq("provider", "google")
            .eq("is_active", true)
            .single();

        if (calendarConnection?.access_token) {
            try {
                const oauth2Client = new google.auth.OAuth2(
                    process.env.GOOGLE_CLIENT_ID,
                    process.env.GOOGLE_CLIENT_SECRET
                );
                oauth2Client.setCredentials({
                    access_token: calendarConnection.access_token,
                    refresh_token: calendarConnection.refresh_token,
                });

                // Refresh token if needed
                const tokenExpiry = calendarConnection.token_expires_at
                    ? new Date(calendarConnection.token_expires_at)
                    : null;
                if (
                    tokenExpiry &&
                    tokenExpiry.getTime() < Date.now() &&
                    calendarConnection.refresh_token
                ) {
                    const { credentials } =
                        await oauth2Client.refreshAccessToken();
                    await supabase
                        .from("shout_calendar_connections")
                        .update({
                            access_token: credentials.access_token,
                            token_expires_at: credentials.expiry_date
                                ? new Date(
                                      credentials.expiry_date
                                  ).toISOString()
                                : new Date(
                                      Date.now() + 3600 * 1000
                                  ).toISOString(),
                        })
                        .eq("wallet_address", recipientAddress.toLowerCase())
                        .eq("provider", "google");
                    oauth2Client.setCredentials(credentials);
                }

                const calendar = google.calendar({
                    version: "v3",
                    auth: oauth2Client,
                });
                const busyResponse = await calendar.freebusy.query({
                    requestBody: {
                        timeMin: scheduledTime.toISOString(),
                        timeMax: slotEnd.toISOString(),
                        items: [
                            { id: calendarConnection.calendar_id || "primary" },
                        ],
                    },
                });

                const calendarData =
                    busyResponse.data.calendars?.[
                        calendarConnection.calendar_id || "primary"
                    ];
                const busyPeriods = calendarData?.busy || [];
                const calendarErrors = calendarData?.errors || [];

                // Log detailed info about the freebusy response
                console.log("[Schedule] Google Calendar freebusy check:", {
                    calendarId: calendarConnection.calendar_id || "primary",
                    requestedSlot: {
                        start: scheduledTime.toISOString(),
                        end: slotEnd.toISOString(),
                    },
                    busyPeriodsCount: busyPeriods.length,
                    busyPeriods: busyPeriods.map((b) => ({
                        start: b.start,
                        end: b.end,
                    })),
                    errors: calendarErrors,
                });

                // If there are calendar API errors, log them
                if (calendarErrors.length > 0) {
                    console.warn(
                        "[Schedule] Calendar API errors:",
                        calendarErrors
                    );
                }

                // Only treat as conflict if a busy period actually overlaps our slot
                // (matches availability logic; avoids false positives from adjacent/boundary events)
                const slotStartMs = scheduledTime.getTime();
                const slotEndMs = slotEnd.getTime();
                const hasCalendarConflict = busyPeriods.some((b) => {
                    const busyStart = new Date(b.start!).getTime();
                    const busyEnd = new Date(b.end!).getTime();
                    return busyStart < slotEndMs && busyEnd > slotStartMs;
                });

                if (hasCalendarConflict) {
                    return NextResponse.json(
                        {
                            error: "This time slot is no longer available",
                            source: "google_calendar",
                        },
                        { status: 409 }
                    );
                }
            } catch (calendarError) {
                console.error(
                    "[Schedule] Google Calendar check error:",
                    calendarError
                );
                // Continue with booking - calendar check is best-effort
            }
        }

        // Create scheduled call record (invite_token required for join link and email)
        const inviteToken = generateInviteToken();
        const { data: scheduledCall, error: createError } = await supabase
            .from("shout_scheduled_calls")
            .insert({
                scheduler_wallet_address:
                    schedulerAddress?.toLowerCase() || null,
                recipient_wallet_address: recipientAddress.toLowerCase(),
                scheduled_at: scheduledTime.toISOString(),
                duration_minutes: duration,
                title: title || "Scheduled Call",
                status: "pending",
                payment_required: priceCents > 0,
                payment_amount_cents: priceCents > 0 ? priceCents : null,
                payment_transaction_hash:
                    paymentResult?.transactionHash || null,
                payment_status:
                    priceCents > 0
                        ? paymentResult?.isValid
                            ? "paid"
                            : "pending"
                        : null,
                guest_email: guestEmail || null,
                guest_name: guestName || null,
                scheduler_email: guestEmail || null,
                scheduler_name: guestName || null,
                notes: notes || null,
                is_paid: isPaid || priceCents > 0,
                timezone: recipientTimezone,
                invite_token: inviteToken,
            })
            .select()
            .single();

        if (createError) {
            console.error("[Scheduling] Create error:", createError);
            return NextResponse.json(
                { error: "Failed to create scheduled call" },
                { status: 500 }
            );
        }

        // Get recipient's calendar connection
        const { data: connection } = await supabase
            .from("shout_calendar_connections")
            .select("*")
            .eq("wallet_address", recipientAddress.toLowerCase())
            .eq("provider", "google")
            .eq("is_active", true)
            .single();

        let calendarEventId = null;

        // Create Google Calendar event if connected
        if (connection && connection.access_token) {
            try {
                const oauth2Client = new google.auth.OAuth2();
                oauth2Client.setCredentials({
                    access_token: connection.access_token,
                    refresh_token: connection.refresh_token,
                });

                const calendar = google.calendar({
                    version: "v3",
                    auth: oauth2Client,
                });

                // Get recipient's display name
                const { data: recipientUser } = await supabase
                    .from("shout_users")
                    .select("display_name, email")
                    .eq("wallet_address", recipientAddress.toLowerCase())
                    .single();

                const eventTitle =
                    title ||
                    `Call with ${
                        schedulerAddress
                            ? schedulerAddress.slice(0, 6) +
                              "..." +
                              schedulerAddress.slice(-4)
                            : guestName || "Guest"
                    }`;
                const eventDescription = `Scheduled call via Spritz\n\n${
                    title || ""
                }\n\nScheduler: ${schedulerAddress || guestEmail || "Guest"}`;

                // Convert UTC to recipient's timezone for Google Calendar
                // Google Calendar expects RFC3339 format with timezone
                const zonedStart = toZonedTime(
                    scheduledTime,
                    recipientTimezone
                );
                const zonedEnd = toZonedTime(slotEnd, recipientTimezone);

                // Format as RFC3339: "2024-01-15T09:00:00-05:00"
                const startDateTime = format(
                    zonedStart,
                    "yyyy-MM-dd'T'HH:mm:ss",
                    { timeZone: recipientTimezone }
                );
                const endDateTime = format(zonedEnd, "yyyy-MM-dd'T'HH:mm:ss", {
                    timeZone: recipientTimezone,
                });

                // Create event without attendees to avoid permission issues
                // Guest will receive email invite separately via Resend
                const event = await calendar.events.insert({
                    calendarId: connection.calendar_id || "primary",
                    requestBody: {
                        summary: eventTitle,
                        description: `${eventDescription}\n\nGuest: ${
                            guestName || ""
                        } ${guestEmail ? `<${guestEmail}>` : ""}`.trim(),
                        start: {
                            dateTime: startDateTime,
                            timeZone: recipientTimezone,
                        },
                        end: {
                            dateTime: endDateTime,
                            timeZone: recipientTimezone,
                        },
                        reminders: {
                            useDefault: false,
                            overrides: [
                                { method: "popup", minutes: 15 }, // 15 minutes before
                            ],
                        },
                    },
                });

                calendarEventId = event.data.id || null;

                // Update scheduled call with calendar event ID
                if (calendarEventId) {
                    await supabase
                        .from("shout_scheduled_calls")
                        .update({ calendar_event_id: calendarEventId })
                        .eq("id", scheduledCall.id);
                }
            } catch (error) {
                console.error("[Scheduling] Google Calendar error:", error);
                // Continue even if calendar creation fails
            }
        }

        // Send calendar invite emails via the invite endpoint (always send so host gets email from shout_users)
        if (resend && scheduledCall) {
            try {
                // Call the invite endpoint to send beautiful emails (guest if guestEmail, host from DB)
                const inviteResponse = await fetch(
                    `${getAppUrl(request)}/api/scheduling/invite`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            scheduledCallId: scheduledCall.id,
                            recipientEmail: connection?.calendar_email,
                            schedulerEmail: guestEmail,
                        }),
                    }
                );

                if (!inviteResponse.ok) {
                    console.error("[Scheduling] Failed to send invite emails");
                }
            } catch (error) {
                console.error("[Scheduling] Email send error:", error);
                // Continue even if email fails
            }
        }

        return NextResponse.json({
            success: true,
            scheduledCall: {
                ...scheduledCall,
                calendarEventId,
            },
        });
    } catch (error) {
        console.error("[Scheduling] Schedule error:", error);
        return NextResponse.json(
            { error: "Failed to schedule call" },
            { status: 500 }
        );
    }
}
