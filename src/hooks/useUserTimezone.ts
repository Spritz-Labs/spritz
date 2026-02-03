"use client";

import { useState, useEffect } from "react";
import { getUserTimezone } from "@/lib/timezone";

/**
 * Returns the user's timezone (from browser). Updates after mount so client
 * components re-render with correct timezone instead of SSR default (UTC).
 * Use with formatTimestamp / formatInTimeZone for all user-facing timestamps.
 */
export function useUserTimezone(): string {
    const [timezone, setTimezone] = useState("UTC");

    useEffect(() => {
        setTimezone(getUserTimezone());
    }, []);

    return timezone;
}
