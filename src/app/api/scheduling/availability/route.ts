import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { localTimeToUTC, getDayOfWeekInTimezone } from "@/lib/timezone";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/scheduling/availability?userAddress=...&startDate=...&endDate=...
// Get available time slots for scheduling a call with a user
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userAddress = searchParams.get("userAddress");
        const startDate = searchParams.get("startDate"); // ISO date string
        const endDate = searchParams.get("endDate"); // ISO date string

        if (!userAddress) {
            return NextResponse.json(
                { error: "User address required" },
                { status: 400 }
            );
        }

        // Check if user has scheduling enabled
        const { data: settings } = await supabase
            .from("shout_user_settings")
            .select("scheduling_enabled, scheduling_duration_minutes, scheduling_free_duration_minutes, scheduling_paid_duration_minutes, scheduling_buffer_minutes, scheduling_advance_notice_hours")
            .eq("wallet_address", userAddress.toLowerCase())
            .single();

        if (!settings?.scheduling_enabled) {
            return NextResponse.json(
                { error: "User does not have scheduling enabled" },
                { status: 403 }
            );
        }

        // Get user's availability windows
        const { data: windows } = await supabase
            .from("shout_availability_windows")
            .select("*")
            .eq("wallet_address", userAddress.toLowerCase())
            .eq("is_active", true);

        if (!windows || windows.length === 0) {
            return NextResponse.json({
                availableSlots: [],
                message: "No availability windows configured",
            });
        }

        // Get Google Calendar connection
        const { data: connection } = await supabase
            .from("shout_calendar_connections")
            .select("*")
            .eq("wallet_address", userAddress.toLowerCase())
            .eq("provider", "google")
            .eq("is_active", true)
            .single();

        // Get user's timezone (from first window or default to UTC)
        const userTimezone = windows[0]?.timezone || "UTC";

        // Parse date range (these are in UTC, but we'll work with them as dates)
        const start = startDate ? new Date(startDate) : new Date();
        const end = endDate ? new Date(endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default 30 days

        // Generate potential slots from availability windows
        const potentialSlots: Array<{
            start: Date;
            end: Date;
            dayOfWeek: number;
        }> = [];

        // Normalize start and end dates to noon UTC to avoid date boundary issues
        const normalizedStart = new Date(start);
        normalizedStart.setUTCHours(12, 0, 0, 0);
        const normalizedEnd = new Date(end);
        normalizedEnd.setUTCHours(12, 0, 0, 0);
        
        // Iterate through each day in the range
        const current = new Date(normalizedStart);
        
        console.log("[Scheduling] Checking availability from", normalizedStart.toISOString(), "to", normalizedEnd.toISOString());
        console.log("[Scheduling] User timezone:", userTimezone);
        console.log("[Scheduling] Availability windows:", windows.map(w => ({ day: w.day_of_week, start: w.start_time, end: w.end_time })));
        
        while (current <= normalizedEnd) {
            // Get day of week in user's timezone (important for correct day matching)
            const dayOfWeek = getDayOfWeekInTimezone(current, userTimezone);
            const matchingWindows = windows.filter((w) => w.day_of_week === dayOfWeek);
            
            // Get day name for better logging
            const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const dayName = dayNames[dayOfWeek];
            
            console.log(`[Scheduling] Checking date: ${current.toISOString()}, dayOfWeek: ${dayOfWeek} (${dayName}), matching windows: ${matchingWindows.length}`);
            
            if (matchingWindows.length === 0) {
                console.log(`[Scheduling] No windows match for ${dayName} (dayOfWeek=${dayOfWeek}). Available windows:`, windows.map(w => `${dayNames[w.day_of_week]} (${w.day_of_week})`));
            }

            for (const window of matchingWindows) {
                // Get the timezone for this window (default to user's timezone)
                const windowTimezone = window.timezone || userTimezone;
                
                // Convert local time in the window's timezone to UTC
                // The times (e.g., "09:00") are in the window's timezone
                const slotStartUTC = localTimeToUTC(current, window.start_time, windowTimezone);
                const slotEndUTC = localTimeToUTC(current, window.end_time, windowTimezone);

                // Check minimum advance notice
                const advanceNoticeHours = settings.scheduling_advance_notice_hours || 24;
                const minStartTime = new Date(Date.now() + advanceNoticeHours * 60 * 60 * 1000);
                const now = new Date();
                
                console.log(`[Scheduling] Window ${window.day_of_week} (${window.start_time}-${window.end_time}): slotStartUTC=${slotStartUTC.toISOString()}, minStartTime=${minStartTime.toISOString()}, now=${now.toISOString()}, advanceNoticeHours=${advanceNoticeHours}`);
                
                if (slotStartUTC < minStartTime) {
                    console.log(`[Scheduling] Skipping window ${window.day_of_week} - slotStartUTC (${slotStartUTC.toISOString()}) is before minStartTime (${minStartTime.toISOString()})`);
                    continue;
                }

                // Split into slots based on duration
                // IMPORTANT: Use the minimum duration (free duration) to generate slots
                // This ensures slots work for both free and paid bookings
                // Slots are generated at the minimum interval, but can accommodate longer bookings
                const freeDuration = settings.scheduling_free_duration_minutes ?? settings.scheduling_duration_minutes ?? 15;
                const paidDuration = settings.scheduling_paid_duration_minutes ?? settings.scheduling_duration_minutes ?? 30;
                
                // Use free duration for slot generation (smallest interval)
                // Paid bookings can use multiple consecutive slots if needed
                const slotGenerationDuration = freeDuration;
                const buffer = settings.scheduling_buffer_minutes || 15;
                const slotDuration = slotGenerationDuration + buffer;
                
                console.log(`[Scheduling] Slot generation for ${dayOfWeek}: freeDuration=${freeDuration}, paidDuration=${paidDuration}, slotGenerationDuration=${slotGenerationDuration}, buffer=${buffer}, slotDuration=${slotDuration}`);
                
                // Store the actual duration for this slot (will be determined by booking type)
                const duration = slotGenerationDuration;

                let currentSlotStart = new Date(slotStartUTC);
                let slotCount = 0;
                while (currentSlotStart.getTime() + slotDuration * 60 * 1000 <= slotEndUTC.getTime()) {
                    const currentSlotEnd = new Date(currentSlotStart.getTime() + duration * 60 * 1000);
                    potentialSlots.push({
                        start: new Date(currentSlotStart),
                        end: currentSlotEnd,
                        dayOfWeek,
                    });
                    slotCount++;
                    currentSlotStart = new Date(currentSlotStart.getTime() + slotDuration * 60 * 1000);
                }
                console.log(`[Scheduling] Generated ${slotCount} potential slots for day ${dayOfWeek} (${window.start_time}-${window.end_time})`);
            }

            current.setDate(current.getDate() + 1);
        }

        // If Google Calendar is connected, check for conflicts
        let availableSlots = potentialSlots;
        if (connection && connection.access_token) {
            try {
                const oauth2Client = new google.auth.OAuth2(
                    process.env.GOOGLE_CLIENT_ID,
                    process.env.GOOGLE_CLIENT_SECRET
                );
                oauth2Client.setCredentials({
                    access_token: connection.access_token,
                    refresh_token: connection.refresh_token,
                });

                // Check if token needs refresh (tokens expire after 1 hour)
                const tokenExpiry = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
                const isExpired = tokenExpiry && tokenExpiry.getTime() < Date.now();
                
                if (isExpired && connection.refresh_token) {
                    console.log("[Scheduling] Refreshing expired Google token for", userAddress);
                    try {
                        const { credentials } = await oauth2Client.refreshAccessToken();
                        
                        // Update stored tokens
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
                    } catch (refreshError) {
                        console.error("[Scheduling] Token refresh failed:", refreshError);
                        // IMPORTANT: If token refresh fails, return empty slots for safety
                        // User needs to reconnect their Google Calendar
                        console.log("[Scheduling] Token refresh failed - returning empty slots. User should reconnect Google Calendar.");
                        return NextResponse.json({
                            availableSlots: [],
                            message: "Calendar connection expired. Please reconnect your Google Calendar in settings.",
                            calendarError: true,
                        });
                    }
                } else if (isExpired) {
                    // Token expired but no refresh token - can't refresh
                    console.log("[Scheduling] Token expired with no refresh token - returning empty slots");
                    return NextResponse.json({
                        availableSlots: [],
                        message: "Calendar connection expired. Please reconnect your Google Calendar in settings.",
                        calendarError: true,
                    });
                }

                const calendar = google.calendar({ version: "v3", auth: oauth2Client });

                // Get busy times from Google Calendar
                const busyResponse = await calendar.freebusy.query({
                    requestBody: {
                        timeMin: start.toISOString(),
                        timeMax: end.toISOString(),
                        items: [{ id: connection.calendar_id || "primary" }],
                    },
                });

                const busyPeriods = busyResponse.data.calendars?.[connection.calendar_id || "primary"]?.busy || [];
                
                console.log("[Scheduling] Found", busyPeriods.length, "busy periods from Google Calendar");

                // Filter out slots that conflict with busy periods
                availableSlots = potentialSlots.filter((slot) => {
                    const slotStart = slot.start.getTime();
                    const slotEnd = slot.end.getTime();

                    return !busyPeriods.some((busy) => {
                        const busyStart = new Date(busy.start!).getTime();
                        const busyEnd = new Date(busy.end!).getTime();

                        // Check for overlap
                        return (
                            (slotStart >= busyStart && slotStart < busyEnd) ||
                            (slotEnd > busyStart && slotEnd <= busyEnd) ||
                            (slotStart <= busyStart && slotEnd >= busyEnd)
                        );
                    });
                });
                
                console.log("[Scheduling] Filtered from", potentialSlots.length, "to", availableSlots.length, "available slots");
            } catch (error) {
                console.error("[Scheduling] Google Calendar error:", error);
                // IMPORTANT: If calendar is connected but check fails, show NO slots
                // This prevents double-booking when there's an API issue
                // User should reconnect their calendar if this happens
                console.log("[Scheduling] Calendar check failed - returning empty slots for safety");
                availableSlots = [];
            }
        } else {
            console.log("[Scheduling] No Google Calendar connected for", userAddress);
        }

        // Also check for existing scheduled calls
        const { data: existingCalls } = await supabase
            .from("shout_scheduled_calls")
            .select("scheduled_at, duration_minutes")
            .eq("recipient_wallet_address", userAddress.toLowerCase())
            .in("status", ["pending", "confirmed"])
            .gte("scheduled_at", start.toISOString())
            .lte("scheduled_at", end.toISOString());

        if (existingCalls && existingCalls.length > 0) {
            availableSlots = availableSlots.filter((slot) => {
                const slotStart = slot.start.getTime();
                const slotEnd = slot.end.getTime();

                return !existingCalls.some((call) => {
                    const callStart = new Date(call.scheduled_at).getTime();
                    const callDuration = (call.duration_minutes || 30) * 60 * 1000;
                    const callEnd = callStart + callDuration;

                    // Check for overlap
                    return (
                        (slotStart >= callStart && slotStart < callEnd) ||
                        (slotEnd > callStart && slotEnd <= callEnd) ||
                        (slotStart <= callStart && slotEnd >= callEnd)
                    );
                });
            });
        }

        // Format slots for response (all times in UTC)
        console.log(`[Scheduling] Final result: ${availableSlots.length} available slots after filtering`);
        if (availableSlots.length > 0) {
            console.log(`[Scheduling] First 5 slots:`, availableSlots.slice(0, 5).map(s => ({ start: s.start.toISOString(), end: s.end.toISOString(), dayOfWeek: s.dayOfWeek })));
        }
        
        const formattedSlots = availableSlots.map((slot) => ({
            start: slot.start.toISOString(),
            end: slot.end.toISOString(),
        }));

        return NextResponse.json({
            availableSlots: formattedSlots,
            duration: settings.scheduling_duration_minutes || 30,
            priceCents: 0, // Will be fetched from settings in schedule endpoint
            timezone: userTimezone, // Return the user's timezone for display purposes
        });
    } catch (error) {
        console.error("[Scheduling] Availability error:", error);
        return NextResponse.json(
            { error: "Failed to fetch availability" },
            { status: 500 }
        );
    }
}

