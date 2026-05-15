import { describe, it, expect } from "vitest";
import {
    formatTimestamp,
    formatTimeInTimezone,
    formatDateInTimezone,
    getUserTimezone,
} from "@/lib/timezone";

describe("formatTimestamp", () => {
    it("formats a Date object in the given timezone", () => {
        const utcDate = new Date("2025-01-15T14:30:00Z");
        const result = formatTimestamp(utcDate, "America/New_York", "h:mm a");
        expect(result).toBe("9:30 AM");
    });

    it("formats an ISO string in the given timezone", () => {
        const result = formatTimestamp("2025-06-15T20:00:00Z", "America/Chicago", "h:mm a");
        expect(result).toBe("3:00 PM");
    });

    it("uses default format (h:mm a) when none provided", () => {
        const result = formatTimestamp("2025-03-10T12:00:00Z", "UTC");
        expect(result).toBe("12:00 PM");
    });

    it("handles custom format strings", () => {
        const result = formatTimestamp("2025-01-15T14:30:00Z", "UTC", "MMM d, yyyy");
        expect(result).toBe("Jan 15, 2025");
    });

    it("handles UTC timezone correctly", () => {
        const result = formatTimestamp("2025-12-25T00:00:00Z", "UTC", "h:mm a");
        expect(result).toBe("12:00 AM");
    });
});

describe("formatTimeInTimezone", () => {
    it("returns time in h:mm a format", () => {
        const result = formatTimeInTimezone("2025-01-15T18:45:00Z", "UTC");
        expect(result).toBe("6:45 PM");
    });
});

describe("formatDateInTimezone", () => {
    it("formats with monthDay option by default", () => {
        const result = formatDateInTimezone("2025-03-20T10:00:00Z", "UTC");
        expect(result).toBe("Mar 20");
    });

    it("formats with short option", () => {
        const result = formatDateInTimezone("2025-11-05T10:00:00Z", "UTC", "short");
        expect(result).toBe("Nov 5");
    });
});

describe("getUserTimezone", () => {
    it("returns a valid IANA timezone string", () => {
        const tz = getUserTimezone();
        expect(tz).toBeTruthy();
        expect(typeof tz).toBe("string");
    });
});
