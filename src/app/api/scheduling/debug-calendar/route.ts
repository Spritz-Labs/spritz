import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/scheduling/debug-calendar?userAddress=...&date=2024-01-20&time=09:00
// Debug endpoint to see what Google Calendar returns for a given time slot
// Also checks database for existing scheduled calls
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");
        const date = searchParams.get("date"); // YYYY-MM-DD
        const time = searchParams.get("time"); // HH:MM (in user's timezone)
        const timezone = searchParams.get("timezone") || "America/Chicago";
        const duration = parseInt(searchParams.get("duration") || "30"); // Duration in minutes

        if (!userAddress || !date || !time) {
            return NextResponse.json(
                { error: "userAddress, date, and time required" },
                { status: 400 }
            );
        }

        // Calculate time range
        // Using a simple offset calculation based on common US timezones
        const timezoneOffsets: Record<string, number> = {
            "America/New_York": -5,    // EST (winter) / EDT (summer: -4)
            "America/Chicago": -6,      // CST (winter) / CDT (summer: -5)
            "America/Denver": -7,       // MST
            "America/Los_Angeles": -8,  // PST
            "UTC": 0,
        };
        
        const offsetHours = timezoneOffsets[timezone] ?? -6;
        const [hours, minutes] = time.split(":").map(Number);
        const utcHours = hours - offsetHours;
        const startDate = new Date(`${date}T${String(utcHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00.000Z`);
        const endDate = new Date(startDate.getTime() + duration * 60 * 1000);

        const startISO = startDate.toISOString();
        const endISO = endDate.toISOString();

        // === CHECK 1: Database scheduled calls ===
        const windowStart = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
        const windowEnd = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
        
        const { data: existingCalls, error: dbError } = await supabase
            .from("shout_scheduled_calls")
            .select("id, scheduled_at, duration_minutes, status, title, scheduler_wallet_address")
            .eq("recipient_wallet_address", userAddress.toLowerCase())
            .in("status", ["pending", "confirmed"])
            .gte("scheduled_at", windowStart.toISOString())
            .lte("scheduled_at", windowEnd.toISOString());

        // Check for database conflicts
        const slotStart = startDate.getTime();
        const slotEnd = endDate.getTime();
        
        const dbConflicts = existingCalls?.filter((call) => {
            const callStart = new Date(call.scheduled_at).getTime();
            const callDuration = (call.duration_minutes || 30) * 60 * 1000;
            const callEnd = callStart + callDuration;
            
            return (
                (slotStart >= callStart && slotStart < callEnd) ||
                (slotEnd > callStart && slotEnd <= callEnd) ||
                (slotStart <= callStart && slotEnd >= callEnd)
            );
        }) || [];

        // === CHECK 2: Google Calendar ===
        const { data: connection } = await supabase
            .from("shout_calendar_connections")
            .select("*")
            .eq("wallet_address", userAddress.toLowerCase())
            .eq("provider", "google")
            .eq("is_active", true)
            .single();

        let calendarResult = null;
        
        if (connection?.access_token) {
            try {
                const oauth2Client = new google.auth.OAuth2(
                    process.env.GOOGLE_CLIENT_ID,
                    process.env.GOOGLE_CLIENT_SECRET
                );
                oauth2Client.setCredentials({
                    access_token: connection.access_token,
                    refresh_token: connection.refresh_token,
                });

                // Refresh token if needed
                const tokenExpiry = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
                if (tokenExpiry && tokenExpiry.getTime() < Date.now() && connection.refresh_token) {
                    const { credentials } = await oauth2Client.refreshAccessToken();
                    await supabase
                        .from("shout_calendar_connections")
                        .update({
                            access_token: credentials.access_token,
                            token_expires_at: credentials.expiry_date 
                                ? new Date(credentials.expiry_date).toISOString()
                                : new Date(Date.now() + 3600 * 1000).toISOString(),
                        })
                        .eq("wallet_address", userAddress.toLowerCase())
                        .eq("provider", "google");
                    oauth2Client.setCredentials(credentials);
                }

                const calendar = google.calendar({ version: "v3", auth: oauth2Client });

                // Query freebusy
                const busyResponse = await calendar.freebusy.query({
                    requestBody: {
                        timeMin: startISO,
                        timeMax: endISO,
                        timeZone: timezone,
                        items: [{ id: connection.calendar_id || "primary" }],
                    },
                });

                const calendarData = busyResponse.data.calendars?.[connection.calendar_id || "primary"];
                const busyPeriods = calendarData?.busy || [];
                const errors = calendarData?.errors || [];

                // Also get actual events in that time range
                const eventsResponse = await calendar.events.list({
                    calendarId: connection.calendar_id || "primary",
                    timeMin: startISO,
                    timeMax: endISO,
                    singleEvents: true,
                    orderBy: "startTime",
                    timeZone: timezone,
                });

                const events = (eventsResponse.data.items || []).map(e => ({
                    id: e.id,
                    summary: e.summary,
                    start: e.start,
                    end: e.end,
                    status: e.status,
                    transparency: e.transparency,
                    eventType: e.eventType,
                    creator: e.creator?.email,
                    organizer: e.organizer?.email,
                }));

                calendarResult = {
                    calendarId: connection.calendar_id || "primary",
                    busyPeriods,
                    errors,
                    isBusy: busyPeriods.length > 0,
                    events,
                };
            } catch (calError: unknown) {
                calendarResult = {
                    error: calError instanceof Error ? calError.message : String(calError),
                };
            }
        } else {
            calendarResult = {
                error: "No active Google Calendar connection",
            };
        }

        // === SUMMARY ===
        const wouldBlock = dbConflicts.length > 0 || (calendarResult && !('error' in calendarResult) && calendarResult.isBusy);

        return NextResponse.json({
            query: {
                userAddress,
                date,
                time,
                timezone,
                duration,
                startISO,
                endISO,
            },
            database: {
                existingCallsInWindow: existingCalls?.length || 0,
                conflicts: dbConflicts.map(c => ({
                    id: c.id,
                    scheduledAt: c.scheduled_at,
                    duration: c.duration_minutes,
                    status: c.status,
                    title: c.title,
                })),
                hasConflict: dbConflicts.length > 0,
                error: dbError?.message,
            },
            googleCalendar: calendarResult,
            summary: {
                wouldBlock,
                blockReason: dbConflicts.length > 0 
                    ? "database_conflict" 
                    : (calendarResult && !('error' in calendarResult) && calendarResult.isBusy)
                        ? "calendar_busy"
                        : null,
            },
        });
    } catch (error) {
        console.error("[Debug Calendar] Error:", error);
        return NextResponse.json(
            { error: "Failed to check calendar", details: String(error) },
            { status: 500 }
        );
    }
}
