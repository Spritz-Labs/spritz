/**
 * Event utility functions
 * Helper functions for event-related operations
 */

/**
 * Check if a URL is a Luma event URL
 * Luma URLs typically follow patterns like:
 * - lu.ma/event-slug
 * - lu.ma/username/event-slug
 * - www.lu.ma/event-slug
 */
export function isLumaUrl(url: string | null | undefined): boolean {
    if (!url) return false;
    try {
        const urlObj = new URL(url);
        return urlObj.hostname === "lu.ma" || 
               urlObj.hostname === "www.lu.ma" ||
               urlObj.hostname.endsWith(".lu.ma");
    } catch {
        // If URL parsing fails, check if it contains lu.ma
        return url.includes("lu.ma/");
    }
}

/**
 * Get the registration URL for an event
 * Prioritizes rsvp_url, then checks if event_url is a Luma URL
 */
export function getRegistrationUrl(event: {
    rsvp_url?: string | null;
    event_url?: string | null;
}): string | null {
    // If there's an explicit RSVP URL, use it
    if (event.rsvp_url) {
        return event.rsvp_url;
    }
    
    // If event_url is a Luma URL, use it for registration
    if (event.event_url && isLumaUrl(event.event_url)) {
        return event.event_url;
    }
    
    return null;
}

/**
 * Check if an event has registration available
 */
export function hasRegistration(event: {
    rsvp_url?: string | null;
    event_url?: string | null;
}): boolean {
    return getRegistrationUrl(event) !== null;
}

/**
 * Register user for an event via the API
 * Returns a registration link that the user can click
 */
export async function registerForEvent(
    eventUrl: string,
    eventId?: string,
    agentId?: string
): Promise<{
    success: boolean;
    registrationLink?: string;
    needsSetup?: boolean;
    setupUrl?: string;
    message?: string;
    error?: string;
}> {
    try {
        const response = await fetch("/api/events/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                eventUrl,
                eventId,
                agentId,
            }),
        });

        const data = await response.json();
        return data;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to register",
        };
    }
}
