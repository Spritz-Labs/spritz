import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/scheduling/debug-calendar?userAddress=...&date=2024-01-20&time=09:00
// Debug endpoint to see what Google Calendar returns for a given time slot
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");
        const date = searchParams.get("date"); // YYYY-MM-DD
        const time = searchParams.get("time"); // HH:MM (in user's timezone)
        const timezone = searchParams.get("timezone") || "America/Chicago";

        if (!userAddress || !date || !time) {
            return NextResponse.json(
                { error: "userAddress, date, and time required" },
                { status: 400 }
            );
        }

        // Get calendar connection
        const { data: connection } = await supabase
            .from("shout_calendar_connections")
            .select("*")
            .eq("wallet_address", userAddress.toLowerCase())
            .eq("provider", "google")
            .eq("is_active", true)
            .single();

        if (!connection?.access_token) {
            return NextResponse.json({
                error: "No active Google Calendar connection",
                hasConnection: !!connection,
            });
        }

        // Create OAuth client
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

        // Calculate time range (1 hour slot)
        const [hours, minutes] = time.split(":").map(Number);
        const startDate = new Date(`${date}T${time}:00`);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // +1 hour

        // Convert to UTC for the API
        // Note: The date string is interpreted in local time, we need to account for timezone
        const startISO = startDate.toISOString();
        const endISO = endDate.toISOString();

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
            transparency: e.transparency, // "transparent" = free, "opaque" = busy
            eventType: e.eventType,
            creator: e.creator?.email,
            organizer: e.organizer?.email,
        }));

        // Get list of all calendars
        const calendarListResponse = await calendar.calendarList.list();
        const calendars = (calendarListResponse.data.items || []).map(c => ({
            id: c.id,
            summary: c.summary,
            primary: c.primary,
            accessRole: c.accessRole,
        }));

        return NextResponse.json({
            query: {
                userAddress,
                date,
                time,
                timezone,
                startISO,
                endISO,
            },
            connection: {
                calendarId: connection.calendar_id,
                lastSyncAt: connection.last_sync_at,
                isActive: connection.is_active,
            },
            freebusy: {
                busyPeriods,
                errors,
                isBusy: busyPeriods.length > 0,
            },
            events,
            availableCalendars: calendars,
        });
    } catch (error) {
        console.error("[Debug Calendar] Error:", error);
        return NextResponse.json(
            { error: "Failed to check calendar", details: String(error) },
            { status: 500 }
        );
    }
}
