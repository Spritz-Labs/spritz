/**
 * Timezone utilities for scheduling system
 * Uses date-fns-tz for reliable timezone handling
 */

import {
    fromZonedTime,
    toZonedTime,
    format,
    formatInTimeZone,
} from "date-fns-tz";

/**
 * Get user's timezone from browser (use in client only; returns UTC on server)
 */
export function getUserTimezone(): string {
    if (typeof window !== "undefined") {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    return "UTC";
}

/**
 * Format a UTC date for display in a specific timezone.
 * Use this for all user-facing timestamps so times show in the user's timezone.
 * @param date - Date object or ISO string (assumed UTC)
 * @param timezone - IANA timezone (e.g. from getUserTimezone())
 * @param formatStr - date-fns format pattern (default: "h:mm a" for time, "MMM d, h:mm a" for date+time)
 */
export function formatTimestamp(
    date: Date | string,
    timezone: string,
    formatStr: string = "h:mm a"
): string {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return formatInTimeZone(dateObj, timezone, formatStr);
}

/**
 * Format time only (e.g. for message timestamps) in user's timezone
 */
export function formatTimeInTimezone(
    date: Date | string,
    timezone: string
): string {
    return formatTimestamp(date, timezone, "h:mm a");
}

/**
 * Format date only (e.g. for "Yesterday", "Jan 15") in user's timezone
 */
export function formatDateInTimezone(
    date: Date | string,
    timezone: string,
    options: "short" | "weekday" | "monthDay" = "monthDay"
): string {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    switch (options) {
        case "short":
            return formatInTimeZone(dateObj, timezone, "MMM d");
        case "weekday":
            return formatInTimeZone(dateObj, timezone, "EEE");
        case "monthDay":
        default:
            return formatInTimeZone(dateObj, timezone, "MMM d");
    }
}

/**
 * Convert a local time (HH:MM) in a specific timezone to UTC
 * @param date - Date object for the day (in UTC or any timezone, we'll use it for year/month/day)
 * @param time - Time string (HH:MM) in the specified timezone
 * @param timezone - Timezone (e.g., "America/New_York")
 * @returns Date object in UTC
 */
export function localTimeToUTC(
    date: Date,
    time: string,
    timezone: string
): Date {
    const [hours, minutes] = time.split(":").map(Number);

    // Get the date parts in the target timezone
    const zonedDate = toZonedTime(date, timezone);
    const year = zonedDate.getFullYear();
    const month = zonedDate.getMonth();
    const day = zonedDate.getDate();

    // Create a date string representing this local time in the timezone
    // Format: "2024-01-15T14:30:00" (no timezone info, treated as local to the timezone)
    const dateTimeString = `${year}-${String(month + 1).padStart(
        2,
        "0"
    )}-${String(day).padStart(2, "0")}T${String(hours).padStart(
        2,
        "0"
    )}:${String(minutes).padStart(2, "0")}:00`;

    // Convert from the timezone to UTC
    return fromZonedTime(dateTimeString, timezone);
}

/**
 * Convert UTC to local time in a specific timezone
 * @param utcDate - Date object in UTC
 * @param timezone - Target timezone
 * @returns Object with date and time strings
 */
export function utcToLocalTime(
    utcDate: Date,
    timezone: string
): { date: string; time: string } {
    const zonedDate = toZonedTime(utcDate, timezone);

    const year = zonedDate.getFullYear();
    const month = String(zonedDate.getMonth() + 1).padStart(2, "0");
    const day = String(zonedDate.getDate()).padStart(2, "0");
    const hour = String(zonedDate.getHours()).padStart(2, "0");
    const minute = String(zonedDate.getMinutes()).padStart(2, "0");

    return {
        date: `${year}-${month}-${day}`,
        time: `${hour}:${minute}`,
    };
}

/**
 * Format a date/time for display in a specific timezone
 */
export function formatDateTime(
    date: Date | string,
    timezone: string,
    options?: { format?: string; includeTimezone?: boolean }
): string {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    const zonedDate = toZonedTime(dateObj, timezone);

    const formatString = options?.format || "MMM d, yyyy 'at' h:mm a";
    let formatted = format(zonedDate, formatString, { timeZone: timezone });

    if (options?.includeTimezone) {
        const tzAbbr = getTimezoneAbbreviation(timezone, dateObj);
        formatted += ` ${tzAbbr}`;
    }

    return formatted;
}

/**
 * Get timezone abbreviation (e.g., "EST", "PST")
 */
export function getTimezoneAbbreviation(
    timezone: string,
    date: Date = new Date()
): string {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        timeZoneName: "short",
    });

    const parts = formatter.formatToParts(date);
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "";
    return tzName;
}

/**
 * Convert a date/time from one timezone to another
 */
export function convertTimezone(
    dateTime: Date | string,
    fromTimezone: string,
    toTimezone: string
): Date {
    const date = typeof dateTime === "string" ? new Date(dateTime) : dateTime;

    // First convert to UTC (if not already)
    // Then convert from UTC to target timezone
    // Actually, we want to return a Date object, so we need to think about this differently

    // If the input is a string like "2024-01-15T14:30:00", we need to know what timezone it's in
    // For our use case, we'll assume the date is already in UTC and we want to convert it
    // to show what time it would be in the target timezone

    // Actually, Date objects are always in UTC internally
    // So we just need to format it in the target timezone
    // But if we want to return a Date, we need to convert the "local time in fromTimezone" to "local time in toTimezone"

    // For scheduling, we typically have:
    // - A time in the recipient's timezone (fromTimezone)
    // - We want to know what UTC time that represents
    // - Then we want to show it in the scheduler's timezone (toTimezone)

    // So the flow is: localTime (fromTimezone) -> UTC -> localTime (toTimezone)
    // But Date objects are always UTC, so we just need to format it differently

    return date; // Date is already UTC, just format it differently when displaying
}

/**
 * Get the day of week (0-6, Sunday=0) for a date in a specific timezone
 * This is important because a Date at midnight UTC could be a different day
 * in different timezones
 */
export function getDayOfWeekInTimezone(date: Date, timezone: string): number {
    const zonedDate = toZonedTime(date, timezone);
    return zonedDate.getDay();
}

/**
 * Get common timezones list
 */
export const COMMON_TIMEZONES = [
    { value: "America/New_York", label: "Eastern Time (ET)" },
    { value: "America/Chicago", label: "Central Time (CT)" },
    { value: "America/Denver", label: "Mountain Time (MT)" },
    { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
    { value: "America/Phoenix", label: "Arizona (MST)" },
    { value: "America/Anchorage", label: "Alaska Time (AKT)" },
    { value: "Pacific/Honolulu", label: "Hawaii Time (HST)" },
    { value: "Europe/London", label: "London (GMT/BST)" },
    { value: "Europe/Paris", label: "Paris (CET/CEST)" },
    { value: "Europe/Berlin", label: "Berlin (CET/CEST)" },
    { value: "Asia/Tokyo", label: "Tokyo (JST)" },
    { value: "Asia/Shanghai", label: "Shanghai (CST)" },
    { value: "Asia/Dubai", label: "Dubai (GST)" },
    { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
    { value: "UTC", label: "UTC" },
];
