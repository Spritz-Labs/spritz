/**
 * Calendar utilities for generating ICS files and calendar links
 */

export interface CalendarEvent {
    title: string;
    description?: string;
    start: Date;
    end: Date;
    location?: string;
    url?: string;
    organizer?: {
        name?: string;
        email?: string;
    };
}

/**
 * Generate ICS file content for an event
 */
export function generateICS(event: CalendarEvent): string {
    const formatICSDate = (date: Date): string => {
        return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    };

    const escapeICS = (text: string): string => {
        return text
            .replace(/\\/g, "\\\\")
            .replace(/;/g, "\\;")
            .replace(/,/g, "\\,")
            .replace(/\n/g, "\\n");
    };

    const dtStart = formatICSDate(event.start);
    const dtEnd = formatICSDate(event.end);
    const dtStamp = formatICSDate(new Date());
    const uid = `event-${Date.now()}-${Math.random().toString(36).substring(7)}@spritz.chat`;

    let icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Spritz//Events//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtStamp}
DTSTART:${dtStart}
DTEND:${dtEnd}
SUMMARY:${escapeICS(event.title)}`;

    if (event.description) {
        icsContent += `\nDESCRIPTION:${escapeICS(event.description)}`;
    }

    if (event.location) {
        icsContent += `\nLOCATION:${escapeICS(event.location)}`;
    }

    if (event.url) {
        icsContent += `\nURL:${event.url}`;
    }

    if (event.organizer?.name || event.organizer?.email) {
        const orgName = event.organizer.name ? escapeICS(event.organizer.name) : "";
        const orgEmail = event.organizer.email || "";
        icsContent += `\nORGANIZER${orgName ? `;CN="${orgName}"` : ""}${orgEmail ? `:mailto:${orgEmail}` : ""}`;
    }

    icsContent += `
STATUS:CONFIRMED
SEQUENCE:0
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Reminder: ${escapeICS(event.title)}
TRIGGER:-PT24H
END:VALARM
END:VEVENT
END:VCALENDAR`;

    return icsContent;
}

/**
 * Generate Google Calendar URL
 */
export function generateGoogleCalendarURL(event: CalendarEvent): string {
    const formatDate = (date: Date): string => {
        return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    };

    const params = new URLSearchParams({
        action: "TEMPLATE",
        text: event.title,
        dates: `${formatDate(event.start)}/${formatDate(event.end)}`,
    });

    if (event.description) {
        params.set("details", event.description);
    }

    if (event.location) {
        params.set("location", event.location);
    }

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate Outlook Calendar URL
 */
export function generateOutlookCalendarURL(event: CalendarEvent): string {
    const formatDate = (date: Date): string => {
        return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    };

    const params = new URLSearchParams({
        subject: event.title,
        startdt: formatDate(event.start),
        enddt: formatDate(event.end),
    });

    if (event.description) {
        params.set("body", event.description);
    }

    if (event.location) {
        params.set("location", event.location);
    }

    return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/**
 * Download ICS file
 */
export function downloadICS(event: CalendarEvent, filename?: string): void {
    const icsContent = generateICS(event);
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || `${event.title.replace(/[^a-z0-9]/gi, "_")}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
