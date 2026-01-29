"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import {
    generateICS,
    generateGoogleCalendarURL,
    generateOutlookCalendarURL,
    downloadICS,
    CalendarEvent,
} from "@/lib/calendar";
import { useAuth } from "@/context/AuthProvider";
import { useAdmin } from "@/hooks/useAdmin";
import { SpritzFooter } from "@/components/SpritzFooter";

interface Event {
    id: string;
    slug?: string | null;
    name: string;
    description: string | null;
    event_type: string;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    end_date: string | null;
    is_multi_day: boolean;
    venue: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    is_virtual: boolean;
    virtual_url: string | null;
    organizer: string | null;
    organizer_logo_url: string | null;
    organizer_website: string | null;
    event_url: string | null;
    rsvp_url: string | null;
    ticket_url: string | null;
    banner_image_url: string | null;
    tags: string[];
    blockchain_focus: string[] | null;
    is_featured: boolean;
    registration_enabled: boolean;
    current_registrations: number;
    interested_count?: number;
    going_count?: number;
}

interface Filters {
    eventTypes: string[];
    cities: string[];
    countries: string[];
    blockchains: string[];
}

const EVENT_TYPE_ICONS: Record<string, string> = {
    conference: "🎤",
    hackathon: "💻",
    meetup: "🤝",
    workshop: "🛠️",
    summit: "⛰️",
    party: "🎉",
    networking: "🌐",
    other: "📅",
};

function formatDate(dateStr: string, endDate?: string | null): string {
    const start = new Date(dateStr);
    const end = endDate ? new Date(endDate) : null;

    if (end && end.getTime() !== start.getTime()) {
        // Multi-day event
        const startDay = start.getDate();
        const endDay = end.getDate();
        const startMonth = start.toLocaleDateString("en-US", {
            month: "short",
        });
        const endMonth = end.toLocaleDateString("en-US", { month: "short" });
        const year = start.getFullYear();

        if (startMonth === endMonth) {
            return `${startDay} - ${endDay} ${startMonth} ${year}`;
        } else {
            return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${year}`;
        }
    }

    return start.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function formatTime(time: string | null): string {
    if (!time) return "";
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

function formatDateRange(event: Event): string {
    const start = new Date(event.event_date);
    const end = event.end_date ? new Date(event.end_date) : start;

    if (end.getTime() === start.getTime()) {
        // Single day
        const day = start.getDate();
        const month = start.toLocaleDateString("en-US", { month: "short" });
        return `${day} ${month}`;
    } else {
        // Multi-day
        const startDay = start.getDate();
        const endDay = end.getDate();
        const startMonth = start.toLocaleDateString("en-US", {
            month: "short",
        });
        const endMonth = end.toLocaleDateString("en-US", { month: "short" });

        if (startMonth === endMonth) {
            return `${startDay} - ${endDay} ${startMonth}`;
        } else {
            return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
        }
    }
}

// Determine if an event is a main event (conference) or side event
function isMainEvent(event: Event): boolean {
    // Main events are typically conferences or summits
    if (event.event_type === "conference" || event.event_type === "summit") {
        // Check if name contains "side event" - if so, it's a side event
        const nameLower = event.name.toLowerCase();
        if (
            nameLower.includes("side event") ||
            nameLower.includes("side events")
        ) {
            return false;
        }
        return true;
    }
    return false;
}

// Check if URL looks like a registration/RSVP link (Luma, Eventbrite, etc.)
function isRegistrationUrl(url: string | null | undefined): boolean {
    if (!url) return false;
    const u = url.toLowerCase();
    return (
        u.includes("lu.ma") ||
        u.includes("eventbrite") ||
        u.includes("luma.link") ||
        u.includes("forms.gle") ||
        u.includes("typeform.com") ||
        u.includes("tally.so") ||
        u.includes("airtable.com") ||
        u.includes("calendly.com") ||
        u.includes("eventbrite.")
    );
}

function isSideEvent(event: Event): boolean {
    // Side events are typically meetups, parties, workshops, networking events
    // OR conferences/summits with "side event" in the name
    const nameLower = event.name.toLowerCase();
    if (nameLower.includes("side event") || nameLower.includes("side events")) {
        return true;
    }

    // Non-main event types are typically side events
    const sideEventTypes = [
        "meetup",
        "party",
        "workshop",
        "networking",
        "hackathon",
    ];
    return sideEventTypes.includes(event.event_type);
}

function EventCard({
    event,
    onEdit,
}: {
    event: Event;
    onEdit?: (event: Event) => void;
}) {
    const typeIcon = EVENT_TYPE_ICONS[event.event_type] || "📅";
    const [showCalendarMenu, setShowCalendarMenu] = useState(false);
    const { isAuthenticated } = useAuth();
    const { isAdmin } = useAdmin();
    const isMain = isMainEvent(event);
    const isSide = isSideEvent(event);
    const [userInterest, setUserInterest] = useState<string | null>(null); // 'interested' | 'going' | null
    const [isRegistered, setIsRegistered] = useState(false);
    const [interestedCount, setInterestedCount] = useState(
        event.interested_count || 0,
    );
    const [goingCount, setGoingCount] = useState(event.going_count || 0);
    const [isLoadingInterest, setIsLoadingInterest] = useState(false);

    // Fetch user's interest status and counts (no list exposed)
    useEffect(() => {
        async function fetchInterest() {
            try {
                const res = await fetch(`/api/events/${event.id}/interest`, {
                    credentials: "include",
                });
                const data = await res.json();
                if (data) {
                    setUserInterest(data.user_interest || null);
                    setIsRegistered(!!data.is_registered);
                    setInterestedCount(data.interested_count || 0);
                    setGoingCount(data.going_count || 0);
                }
            } catch (error) {
                console.error("Failed to fetch interest:", error);
            }
        }
        fetchInterest();
    }, [event.id]);

    const handleInterest = async (type: "interested" | "going") => {
        if (!isAuthenticated) {
            // Redirect to login or show login modal
            window.location.href = "/?login=true";
            return;
        }

        setIsLoadingInterest(true);
        try {
            if (userInterest === type) {
                // Remove interest
                const res = await fetch(
                    `/api/events/${event.id}/interest?type=${type}`,
                    {
                        method: "DELETE",
                        credentials: "include",
                    },
                );
                if (res.ok) {
                    setUserInterest(null);
                    if (type === "interested") {
                        setInterestedCount((prev) => Math.max(0, prev - 1));
                    } else {
                        setGoingCount((prev) => Math.max(0, prev - 1));
                    }
                }
            } else {
                // Add/update interest
                const res = await fetch(`/api/events/${event.id}/interest`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ interest_type: type }),
                });
                const data = await res.json();
                if (data.success) {
                    const oldType = userInterest;
                    setUserInterest(type);

                    // Update counts
                    if (oldType === "interested") {
                        setInterestedCount((prev) => Math.max(0, prev - 1));
                    } else if (oldType === "going") {
                        setGoingCount((prev) => Math.max(0, prev - 1));
                    }

                    if (type === "interested") {
                        setInterestedCount((prev) => prev + 1);
                    } else {
                        setGoingCount((prev) => prev + 1);
                    }
                }
            }
            // Refetch so UI matches server (session/cookie may affect GET)
            const refetch = await fetch(`/api/events/${event.id}/interest`, {
                credentials: "include",
            });
            const refetchData = await refetch.json();
            if (refetchData.user_interest !== undefined)
                setUserInterest(refetchData.user_interest || null);
            if (refetchData.interested_count !== undefined)
                setInterestedCount(refetchData.interested_count ?? 0);
            if (refetchData.going_count !== undefined)
                setGoingCount(refetchData.going_count ?? 0);
            if (refetchData.is_registered !== undefined)
                setIsRegistered(!!refetchData.is_registered);
        } catch (error) {
            console.error("Failed to update interest:", error);
        } finally {
            setIsLoadingInterest(false);
        }
    };

    // Show "Going ✓" when user chose Going or registered on Spritz
    const showAsGoing = userInterest === "going" || isRegistered;

    // Get country flag emoji
    const getCountryFlag = (country: string | null): string => {
        if (!country) return "";
        // Simple mapping for common countries - can be expanded
        const flags: Record<string, string> = {
            UK: "🇬🇧",
            "United Kingdom": "🇬🇧",
            USA: "🇺🇸",
            "United States": "🇺🇸",
            Dubai: "🇦🇪",
            UAE: "🇦🇪",
            "Hong Kong": "🇭🇰",
            Thailand: "🇹🇭",
            Singapore: "🇸🇬",
            Malaysia: "🇲🇾",
            Japan: "🇯🇵",
            "South Korea": "🇰🇷",
            China: "🇨🇳",
            India: "🇮🇳",
            Australia: "🇦🇺",
            Canada: "🇨🇦",
            Germany: "🇩🇪",
            France: "🇫🇷",
            Spain: "🇪🇸",
            Italy: "🇮🇹",
            Netherlands: "🇳🇱",
            Portugal: "🇵🇹",
            Switzerland: "🇨🇭",
            Austria: "🇦🇹",
            Poland: "🇵🇱",
            "Czech Republic": "🇨🇿",
            Romania: "🇷🇴",
            Mexico: "🇲🇽",
            Brazil: "🇧🇷",
            Argentina: "🇦🇷",
            Chile: "🇨🇱",
            Colombia: "🇨🇴",
            "South Africa": "🇿🇦",
            Kenya: "🇰🇪",
            Nigeria: "🇳🇬",
            Egypt: "🇪🇬",
            Israel: "🇮🇱",
            Turkey: "🇹🇷",
            Taiwan: "🇹🇼",
            Philippines: "🇵🇭",
            Indonesia: "🇮🇩",
            Vietnam: "🇻🇳",
        };
        return flags[country] || "";
    };

    // Build location string
    const locationParts = [
        event.venue,
        event.address,
        event.city,
        event.country
            ? `${getCountryFlag(event.country)} ${event.country}`
            : null,
    ].filter(Boolean);
    const locationStr = locationParts.join(", ");

    // Build full location for calendar
    const fullLocation =
        [event.venue, event.address, event.city, event.country]
            .filter(Boolean)
            .join(", ") ||
        (event.is_virtual && event.virtual_url ? "Virtual Event" : "");

    // Create calendar event
    const createCalendarEvent = (): CalendarEvent => {
        const startDate = new Date(event.event_date);
        if (event.start_time) {
            const [hours, minutes] = event.start_time.split(":");
            startDate.setHours(parseInt(hours), parseInt(minutes), 0);
        }

        const endDate = event.end_date
            ? new Date(event.end_date)
            : new Date(startDate);
        if (event.end_time) {
            const [hours, minutes] = event.end_time.split(":");
            endDate.setHours(parseInt(hours), parseInt(minutes), 0);
        } else if (!event.end_date) {
            // Default to 2 hours if no end time
            endDate.setHours(startDate.getHours() + 2);
        }

        return {
            title: event.name,
            description: [
                event.description,
                event.organizer ? `Organized by: ${event.organizer}` : null,
                event.event_url ? `Website: ${event.event_url}` : null,
                event.rsvp_url ? `RSVP: ${event.rsvp_url}` : null,
            ]
                .filter(Boolean)
                .join("\n\n"),
            start: startDate,
            end: endDate,
            location: fullLocation,
            url: event.event_url || event.rsvp_url || undefined,
            organizer: event.organizer
                ? {
                      name: event.organizer,
                      email: undefined,
                  }
                : undefined,
        };
    };

    const handleAddToCalendar = (provider: "google" | "outlook" | "ics") => {
        const calEvent = createCalendarEvent();
        if (provider === "google") {
            window.open(generateGoogleCalendarURL(calEvent), "_blank");
        } else if (provider === "outlook") {
            window.open(generateOutlookCalendarURL(calEvent), "_blank");
        } else {
            downloadICS(calEvent);
        }
        setShowCalendarMenu(false);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`relative bg-zinc-900/60 backdrop-blur-sm rounded-2xl border overflow-hidden hover:border-[#FF5500]/50 transition-all group flex flex-col h-full ${
                event.is_featured
                    ? "border-[#FF5500]/40 ring-1 ring-[#FF5500]/20"
                    : isMain
                      ? "border-blue-500/30 ring-1 ring-blue-500/10"
                      : isSide
                        ? "border-purple-500/20"
                        : "border-zinc-800"
            }`}
        >
            {/* Admin Edit Button */}
            {isAdmin && onEdit && (
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onEdit(event);
                    }}
                    className="absolute top-3 right-3 z-10 bg-zinc-800/90 hover:bg-zinc-700 text-white p-2 rounded-lg shadow-lg transition-all flex items-center gap-1.5 border border-zinc-700 hover:border-[#FF5500]/50"
                    title="Edit Event"
                >
                    <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                    </svg>
                </button>
            )}

            {/* Registered badge – show on list when user is registered */}
            {isRegistered && (
                <div
                    className={`absolute ${isAdmin && onEdit ? "top-12" : "top-3"} right-3 z-10 bg-green-500/90 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1`}
                    title="You're registered"
                >
                    ✓ Registered
                </div>
            )}
            {/* Featured Badge (below Registered when both) */}
            {event.is_featured && (
                <div
                    className={`absolute ${isRegistered || (isAdmin && onEdit) ? "top-12" : "top-3"} right-3 z-10 bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg`}
                >
                    ⭐ Featured
                </div>
            )}

            {/* Main Event / Side Event Badge */}
            {isMain && (
                <div className="absolute top-3 left-3 z-10 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1">
                    🎯 Main Event
                </div>
            )}
            {isSide && !isMain && (
                <div className="absolute top-3 left-3 z-10 bg-gradient-to-r from-purple-600 to-purple-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg flex items-center gap-1">
                    🎪 Side Event
                </div>
            )}

            {/* Banner Image or Gradient Header */}
            {event.banner_image_url ? (
                <div className="h-36 bg-zinc-800 overflow-hidden flex-shrink-0 relative">
                    <img
                        src={event.banner_image_url}
                        alt={event.name}
                        className="w-full h-full max-h-36 object-cover group-hover:scale-105 transition-transform duration-500"
                        style={{ maxHeight: "144px", objectFit: "cover" }}
                        loading="lazy"
                    />
                </div>
            ) : (
                <div className="h-20 bg-gradient-to-br from-[#FF5500]/20 via-zinc-900 to-zinc-900 flex items-center justify-center border-b border-zinc-800 flex-shrink-0">
                    <span className="text-3xl opacity-50">{typeIcon}</span>
                </div>
            )}

            <div className="p-5 flex flex-col flex-1 min-h-0">
                {/* Event Type & Virtual Badge */}
                <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#FF5500]/10 text-[#FF5500] border border-[#FF5500]/20">
                        {typeIcon} {event.event_type}
                    </span>
                    {event.is_virtual && (
                        <span className="px-2 py-1 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            🌐 Virtual
                        </span>
                    )}
                </div>

                {/* Title */}
                <h3 className="text-lg font-bold text-white mb-3 line-clamp-2 group-hover:text-[#FF5500] transition-colors">
                    {event.name}
                </h3>

                {/* Description Preview */}
                {event.description && (
                    <p className="text-sm text-zinc-400 mb-3 line-clamp-2">
                        {event.description}
                    </p>
                )}

                {/* Date Range */}
                <div className="flex items-center gap-2 text-sm text-zinc-300 mb-2">
                    <span className="text-[#FF5500]">📅</span>
                    <span className="font-medium">
                        {formatDateRange(event)}
                    </span>
                    {event.start_time && (
                        <>
                            <span className="text-zinc-600">•</span>
                            <span>{formatTime(event.start_time)}</span>
                            {event.end_time && (
                                <span> - {formatTime(event.end_time)}</span>
                            )}
                        </>
                    )}
                </div>

                {/* Location */}
                {locationStr && (
                    <div className="flex items-start gap-2 text-sm text-zinc-400 mb-3">
                        <span className="text-[#FF5500] mt-0.5">📍</span>
                        <span className="flex-1">{locationStr}</span>
                    </div>
                )}

                {/* Virtual URL */}
                {event.is_virtual && event.virtual_url && (
                    <div className="flex items-center gap-2 text-sm text-blue-400 mb-3">
                        <span>🔗</span>
                        <a
                            href={event.virtual_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline truncate"
                        >
                            {event.virtual_url}
                        </a>
                    </div>
                )}

                {/* Organizer with Website */}
                {event.organizer && (
                    <div className="flex items-center gap-2 text-sm text-zinc-400 mb-3">
                        <span className="text-[#FF5500]">🏢</span>
                        <span className="truncate">{event.organizer}</span>
                        {event.organizer_website && (
                            <a
                                href={event.organizer_website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#FF5500] hover:underline ml-1"
                                title="Organizer Website"
                            >
                                🔗
                            </a>
                        )}
                    </div>
                )}

                {/* Blockchain Focus Tags */}
                {event.blockchain_focus &&
                    event.blockchain_focus.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                            {event.blockchain_focus.map((chain) => (
                                <span
                                    key={chain}
                                    className="px-2 py-1 text-xs rounded-md bg-zinc-800/50 text-zinc-300 border border-zinc-700/50 capitalize"
                                >
                                    {chain}
                                </span>
                            ))}
                        </div>
                    )}

                {/* Actions */}
                <div className="flex flex-col gap-2 mt-auto pt-3 border-t border-zinc-800">
                    {/* Primary Actions Row: RSVP first when available, then Website/Tickets */}
                    <div className="flex gap-2">
                        {/* RSVP: explicit rsvp_url, or event_url that looks like registration */}
                        {(event.rsvp_url ||
                            (event.event_url &&
                                isRegistrationUrl(event.event_url))) && (
                            <a
                                href={event.rsvp_url || event.event_url || "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 text-center py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white text-sm font-semibold hover:shadow-lg hover:shadow-[#FF5500]/20 transition-all"
                            >
                                RSVP
                            </a>
                        )}
                        {event.registration_enabled &&
                            !event.rsvp_url &&
                            !(
                                event.event_url &&
                                isRegistrationUrl(event.event_url)
                            ) && (
                                <Link
                                    href={
                                        event.slug
                                            ? `/event/${event.slug}`
                                            : `/events/${event.id}`
                                    }
                                    className="flex-1 text-center py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white text-sm font-semibold hover:shadow-lg hover:shadow-[#FF5500]/20 transition-all"
                                >
                                    Register
                                </Link>
                            )}
                        {/* Website: event_url only if not already shown as RSVP and not same as rsvp_url */}
                        {event.event_url &&
                            !(
                                event.rsvp_url &&
                                event.event_url === event.rsvp_url
                            ) &&
                            !(
                                isRegistrationUrl(event.event_url) &&
                                !event.rsvp_url
                            ) && (
                                <a
                                    href={event.event_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 text-center py-2.5 px-4 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-800 hover:border-zinc-600 transition-all"
                                >
                                    Website
                                </a>
                            )}
                        {event.ticket_url &&
                            !event.rsvp_url &&
                            !(
                                event.event_url &&
                                isRegistrationUrl(event.event_url)
                            ) && (
                                <a
                                    href={event.ticket_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 text-center py-2.5 px-4 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-800 hover:border-zinc-600 transition-all"
                                >
                                    Tickets
                                </a>
                            )}
                    </div>

                    {/* Interest & Going Buttons */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => handleInterest("interested")}
                            disabled={isLoadingInterest}
                            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                                userInterest === "interested"
                                    ? "bg-amber-500/30 text-amber-300 border-2 border-amber-400/60 shadow-[0_0_12px_rgba(251,191,36,0.25)]"
                                    : "bg-zinc-800/50 text-zinc-400 border border-zinc-700 hover:bg-zinc-800 hover:border-zinc-600"
                            } disabled:opacity-50`}
                        >
                            <span>★</span>
                            <span>Interested</span>
                            {interestedCount > 0 && (
                                <span className="text-xs opacity-75">
                                    ({interestedCount})
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => handleInterest("going")}
                            disabled={isLoadingInterest}
                            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                                showAsGoing
                                    ? "bg-green-500/20 text-green-400 border border-green-500/40"
                                    : "bg-zinc-800/50 text-zinc-400 border border-zinc-700 hover:bg-zinc-800 hover:border-zinc-600"
                            } disabled:opacity-50`}
                        >
                            <span>✓</span>
                            <span>{showAsGoing ? "Going ✓" : "Going"}</span>
                            {goingCount > 0 && (
                                <span className="text-xs opacity-75">
                                    ({goingCount})
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Add to Calendar Button */}
                    <div className="relative">
                        <button
                            onClick={() =>
                                setShowCalendarMenu(!showCalendarMenu)
                            }
                            className="w-full py-2 px-4 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-800 hover:border-zinc-600 transition-all flex items-center justify-center gap-2"
                        >
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                            </svg>
                            Add to Calendar
                            <svg
                                className={`w-4 h-4 transition-transform ${showCalendarMenu ? "rotate-180" : ""}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 9l-7 7-7-7"
                                />
                            </svg>
                        </button>

                        {/* Calendar Menu Dropdown */}
                        {showCalendarMenu && (
                            <div className="absolute bottom-full left-0 right-0 mb-2 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-10">
                                <button
                                    onClick={() =>
                                        handleAddToCalendar("google")
                                    }
                                    className="w-full px-4 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center gap-2"
                                >
                                    <span>📅</span>
                                    Google Calendar
                                </button>
                                <button
                                    onClick={() =>
                                        handleAddToCalendar("outlook")
                                    }
                                    className="w-full px-4 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center gap-2"
                                >
                                    <span>📅</span>
                                    Outlook Calendar
                                </button>
                                <button
                                    onClick={() => handleAddToCalendar("ics")}
                                    className="w-full px-4 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center gap-2"
                                >
                                    <span>📥</span>
                                    Download .ics file
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Click outside to close calendar menu */}
            {showCalendarMenu && (
                <div
                    className="fixed inset-0 z-0"
                    onClick={() => setShowCalendarMenu(false)}
                />
            )}
        </motion.div>
    );
}

export default function EventsPage() {
    const { isAuthenticated } = useAuth();
    const { isAdmin, isReady, getAuthHeaders } = useAdmin();
    const [events, setEvents] = useState<Event[]>([]);
    const [rawEvents, setRawEvents] = useState<Event[]>([]);
    const [totalFromApi, setTotalFromApi] = useState(0);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [filters, setFilters] = useState<Filters>({
        eventTypes: [],
        cities: [],
        countries: [],
        blockchains: [],
    });
    const [isLoading, setIsLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const loadMoreRef = useRef<HTMLDivElement>(null);

    // Filter state
    const [selectedType, setSelectedType] = useState<string>("");
    const [selectedCity, setSelectedCity] = useState<string>("");
    const [selectedBlockchain, setSelectedBlockchain] = useState<string>("");
    const [searchQuery, setSearchQuery] = useState("");
    const [showUpcoming, setShowUpcoming] = useState(true);
    const [eventCategory, setEventCategory] = useState<string>(""); // "main" | "side" | ""

    // Tab state - replaces eventCategory for better UX
    const [activeTab, setActiveTab] = useState<string>("all"); // "all" | "main" | "side" | "hackathon" | "networking" | "summit" | "conference" | "meetup" | "workshop" | "party"

    // Edit modal state
    const [editingEvent, setEditingEvent] = useState<Event | null>(null);
    const [editFormData, setEditFormData] = useState({
        name: "",
        description: "",
        event_type: "conference",
        event_date: "",
        start_time: "",
        end_time: "",
        venue: "",
        city: "",
        country: "",
        organizer: "",
        event_url: "",
        rsvp_url: "",
        is_featured: false,
        status: "published",
    });
    const [isSaving, setIsSaving] = useState(false);

    // Submit event modal (user-created events)
    const [showSubmitEventModal, setShowSubmitEventModal] = useState(false);
    const [submitFormData, setSubmitFormData] = useState({
        name: "",
        description: "",
        event_type: "conference",
        event_date: "",
        start_time: "",
        venue: "",
        city: "",
        country: "",
        organizer: "",
        event_url: "",
        banner_image_url: "",
    });
    const [submitBannerFile, setSubmitBannerFile] = useState<File | null>(null);
    const [submitLoading, setSubmitLoading] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // Apply tab filter + sort (featured first, then main, then date)
    const applyFilterAndSort = useCallback(
        (eventsList: Event[]): Event[] => {
            let filtered: Event[] = eventsList;
            if (activeTab === "main") {
                filtered = eventsList.filter((e: Event) => isMainEvent(e));
            } else if (activeTab === "side") {
                filtered = eventsList.filter(
                    (e: Event) => isSideEvent(e) && !isMainEvent(e),
                );
            } else if (activeTab !== "all") {
                filtered = eventsList.filter(
                    (e: Event) => e.event_type === activeTab,
                );
            }
            if (eventCategory === "main" && activeTab === "all") {
                filtered = eventsList.filter((e: Event) => isMainEvent(e));
            } else if (eventCategory === "side" && activeTab === "all") {
                filtered = eventsList.filter(
                    (e: Event) => isSideEvent(e) && !isMainEvent(e),
                );
            }
            filtered.sort((a, b) => {
                if (a.is_featured && !b.is_featured) return -1;
                if (!a.is_featured && b.is_featured) return 1;
                const aIsMain = isMainEvent(a);
                const bIsMain = isMainEvent(b);
                if (aIsMain && !bIsMain) return -1;
                if (!aIsMain && bIsMain) return 1;
                return (
                    new Date(a.event_date).getTime() -
                    new Date(b.event_date).getTime()
                );
            });
            return filtered;
        },
        [activeTab, eventCategory],
    );

    useEffect(() => {
        fetchEvents();
    }, [
        selectedType,
        selectedCity,
        selectedBlockchain,
        searchQuery,
        showUpcoming,
        eventCategory,
        activeTab,
    ]);

    async function fetchEvents() {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (selectedType) params.set("type", selectedType);
            if (selectedCity) params.set("city", selectedCity);
            if (selectedBlockchain)
                params.set("blockchain", selectedBlockchain);
            if (searchQuery) params.set("search", searchQuery);
            if (showUpcoming) params.set("upcoming", "true");
            params.set("limit", "50");
            params.set("offset", "0");

            const res = await fetch(`/api/events?${params.toString()}`);
            const data = await res.json();

            if (data.events) {
                const eventsList: Event[] = data.events;
                setRawEvents(eventsList);
                setTotalFromApi(data.total ?? eventsList.length);
                const filtered = applyFilterAndSort(eventsList);
                setEvents(filtered);
                setTotal(filtered.length);
                if (data.filters) setFilters(data.filters);
            }
        } catch (error) {
            console.error("Failed to fetch events:", error);
        } finally {
            setIsLoading(false);
        }
    }

    const loadMoreEvents = useCallback(async () => {
        if (rawEvents.length >= totalFromApi || isLoadingMore) return;
        setIsLoadingMore(true);
        try {
            const params = new URLSearchParams();
            if (selectedType) params.set("type", selectedType);
            if (selectedCity) params.set("city", selectedCity);
            if (selectedBlockchain)
                params.set("blockchain", selectedBlockchain);
            if (searchQuery) params.set("search", searchQuery);
            if (showUpcoming) params.set("upcoming", "true");
            params.set("limit", "50");
            params.set("offset", String(rawEvents.length));

            const res = await fetch(`/api/events?${params.toString()}`);
            const data = await res.json();

            if (data.events && data.events.length > 0) {
                const nextRaw = [...rawEvents, ...(data.events as Event[])];
                setRawEvents(nextRaw);
                setTotalFromApi(data.total ?? nextRaw.length);
                const filtered = applyFilterAndSort(nextRaw);
                setEvents(filtered);
                setTotal(filtered.length);
            }
        } catch (error) {
            console.error("Failed to load more events:", error);
        } finally {
            setIsLoadingMore(false);
        }
    }, [
        rawEvents.length,
        totalFromApi,
        isLoadingMore,
        selectedType,
        selectedCity,
        selectedBlockchain,
        searchQuery,
        showUpcoming,
        applyFilterAndSort,
    ]);

    // Auto load more when user scrolls to bottom (sentinel enters viewport)
    useEffect(() => {
        const el = loadMoreRef.current;
        if (!el || rawEvents.length >= totalFromApi || totalFromApi === 0)
            return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (
                    entries[0]?.isIntersecting &&
                    rawEvents.length < totalFromApi &&
                    !isLoadingMore
                ) {
                    loadMoreEvents();
                }
            },
            { rootMargin: "200px" },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [rawEvents.length, totalFromApi, isLoadingMore, loadMoreEvents]);

    const handleEditEvent = (event: Event) => {
        setEditingEvent(event);
        setEditFormData({
            name: event.name,
            description: event.description || "",
            event_type: event.event_type,
            event_date: event.event_date,
            start_time: event.start_time || "",
            end_time: event.end_time || "",
            venue: event.venue || "",
            city: event.city || "",
            country: event.country || "",
            organizer: event.organizer || "",
            event_url: event.event_url || "",
            rsvp_url: event.rsvp_url || "",
            is_featured: event.is_featured,
            status: "published", // Public events are always published
        });
    };

    const handleSaveEvent = async () => {
        if (!editingEvent || !isAdmin) return;

        setIsSaving(true);
        try {
            const authHeaders = getAuthHeaders();
            if (!authHeaders) {
                alert("Admin authentication required");
                return;
            }

            const res = await fetch(`/api/admin/events/${editingEvent.id}`, {
                method: "PATCH",
                headers: {
                    ...authHeaders,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(editFormData),
            });

            if (res.ok) {
                setEditingEvent(null);
                fetchEvents(); // Refresh events
            } else {
                const data = await res.json();
                alert(data.error || "Failed to update event");
            }
        } catch (error) {
            console.error("Failed to save event:", error);
            alert("Failed to save event");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSubmitEvent = async () => {
        if (!submitFormData.name?.trim() || !submitFormData.event_type || !submitFormData.event_date) {
            setSubmitError("Name, event type, and date are required.");
            return;
        }
        setSubmitError(null);
        setSubmitLoading(true);
        try {
            let bannerUrl = submitFormData.banner_image_url || "";
            if (submitBannerFile) {
                const formData = new FormData();
                formData.append("file", submitBannerFile);
                formData.append("context", "event");
                const uploadRes = await fetch("/api/upload", {
                    method: "POST",
                    credentials: "include",
                    body: formData,
                });
                const uploadData = await uploadRes.json();
                if (!uploadRes.ok || !uploadData.url) {
                    setSubmitError(uploadData.error || "Image upload failed");
                    setSubmitLoading(false);
                    return;
                }
                bannerUrl = uploadData.url;
            }
            const res = await fetch("/api/events/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    ...submitFormData,
                    banner_image_url: bannerUrl || null,
                }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setShowSubmitEventModal(false);
                setSubmitFormData({
                    name: "",
                    description: "",
                    event_type: "conference",
                    event_date: "",
                    start_time: "",
                    venue: "",
                    city: "",
                    country: "",
                    organizer: "",
                    event_url: "",
                    banner_image_url: "",
                });
                setSubmitBannerFile(null);
                window.location.href = "/events/manage";
            } else {
                setSubmitError(data.error || "Failed to create event");
            }
        } catch (e) {
            console.error("Submit event error:", e);
            setSubmitError("Failed to create event");
        } finally {
            setSubmitLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#09090b] text-white">
            {/* Background gradient */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-[600px] bg-[radial-gradient(ellipse_at_top,rgba(255,85,0,0.12)_0%,transparent_60%)]" />
            </div>

            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#09090b]/80 backdrop-blur-xl border-b border-zinc-800/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
                    <div className="flex items-center justify-between">
                        <Link
                            href="/"
                            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                        >
                            <img
                                src="/icons/icon-96x96.png"
                                alt="Spritz"
                                className="w-9 h-9 rounded-xl"
                            />
                            <span className="text-xl font-bold hidden sm:block">
                                Spritz
                            </span>
                        </Link>
                        <div className="flex items-center gap-3">
                            <Link
                                href="/"
                                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                            >
                                ← Back to App
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-8">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#FF5500]/10 border border-[#FF5500]/30 rounded-full text-[#FF5500] text-sm font-medium mb-4">
                            📅 Event Directory
                        </div>
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3">
                            <span className="bg-gradient-to-r from-[#FF5500] to-[#FF6B1A] bg-clip-text text-transparent">
                                Discover Events
                            </span>
                        </h1>
                        <p className="text-lg text-zinc-400 max-w-xl">
                            Find conferences, hackathons, meetups, and more.
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        {isAuthenticated && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setShowSubmitEventModal(true)}
                                    className="px-4 py-2.5 rounded-xl bg-[#FF5500] hover:bg-[#e04d00] text-white text-sm font-medium transition-colors flex items-center gap-2"
                                >
                                    + Submit event
                                </button>
                                <Link
                                    href="/events/manage"
                                    className="px-4 py-2.5 rounded-xl border border-zinc-600 text-zinc-300 hover:bg-zinc-800 text-sm font-medium transition-colors"
                                >
                                    Manage my events
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabbed Navigation */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-6">
                <div className="flex flex-wrap gap-2 overflow-x-auto pb-2">
                    <button
                        onClick={() => {
                            setActiveTab("all");
                            setEventCategory(""); // Clear legacy filter
                        }}
                        className={`px-4 py-2 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
                            activeTab === "all"
                                ? "bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white shadow-lg shadow-[#FF5500]/20"
                                : "bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 border border-zinc-700"
                        }`}
                    >
                        All Events
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("main");
                            setEventCategory(""); // Clear legacy filter
                        }}
                        className={`px-4 py-2 rounded-xl font-medium text-sm transition-all whitespace-nowrap flex items-center gap-1.5 ${
                            activeTab === "main"
                                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                                : "bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 border border-zinc-700"
                        }`}
                    >
                        🎯 Main Events
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("side");
                            setEventCategory(""); // Clear legacy filter
                        }}
                        className={`px-4 py-2 rounded-xl font-medium text-sm transition-all whitespace-nowrap flex items-center gap-1.5 ${
                            activeTab === "side"
                                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/20"
                                : "bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 border border-zinc-700"
                        }`}
                    >
                        🎪 Side Events
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("conference");
                            setEventCategory(""); // Clear legacy filter
                        }}
                        className={`px-4 py-2 rounded-xl font-medium text-sm transition-all whitespace-nowrap flex items-center gap-1.5 ${
                            activeTab === "conference"
                                ? "bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white shadow-lg shadow-[#FF5500]/20"
                                : "bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 border border-zinc-700"
                        }`}
                    >
                        🎤 Conferences
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("hackathon");
                            setEventCategory(""); // Clear legacy filter
                        }}
                        className={`px-4 py-2 rounded-xl font-medium text-sm transition-all whitespace-nowrap flex items-center gap-1.5 ${
                            activeTab === "hackathon"
                                ? "bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white shadow-lg shadow-[#FF5500]/20"
                                : "bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 border border-zinc-700"
                        }`}
                    >
                        💻 Hackathons
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("summit");
                            setEventCategory(""); // Clear legacy filter
                        }}
                        className={`px-4 py-2 rounded-xl font-medium text-sm transition-all whitespace-nowrap flex items-center gap-1.5 ${
                            activeTab === "summit"
                                ? "bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white shadow-lg shadow-[#FF5500]/20"
                                : "bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 border border-zinc-700"
                        }`}
                    >
                        ⛰️ Summits
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("networking");
                            setEventCategory(""); // Clear legacy filter
                        }}
                        className={`px-4 py-2 rounded-xl font-medium text-sm transition-all whitespace-nowrap flex items-center gap-1.5 ${
                            activeTab === "networking"
                                ? "bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white shadow-lg shadow-[#FF5500]/20"
                                : "bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 border border-zinc-700"
                        }`}
                    >
                        🌐 Networking
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("meetup");
                            setEventCategory(""); // Clear legacy filter
                        }}
                        className={`px-4 py-2 rounded-xl font-medium text-sm transition-all whitespace-nowrap flex items-center gap-1.5 ${
                            activeTab === "meetup"
                                ? "bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white shadow-lg shadow-[#FF5500]/20"
                                : "bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 border border-zinc-700"
                        }`}
                    >
                        🤝 Meetups
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("workshop");
                            setEventCategory(""); // Clear legacy filter
                        }}
                        className={`px-4 py-2 rounded-xl font-medium text-sm transition-all whitespace-nowrap flex items-center gap-1.5 ${
                            activeTab === "workshop"
                                ? "bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white shadow-lg shadow-[#FF5500]/20"
                                : "bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 border border-zinc-700"
                        }`}
                    >
                        🛠️ Workshops
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("party");
                            setEventCategory(""); // Clear legacy filter
                        }}
                        className={`px-4 py-2 rounded-xl font-medium text-sm transition-all whitespace-nowrap flex items-center gap-1.5 ${
                            activeTab === "party"
                                ? "bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white shadow-lg shadow-[#FF5500]/20"
                                : "bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 border border-zinc-700"
                        }`}
                    >
                        🎉 Parties
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
                <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl border border-zinc-800 p-4">
                    <div className="flex flex-wrap gap-3">
                        {/* Search */}
                        <div className="flex-1 min-w-[200px]">
                            <div className="relative">
                                <svg
                                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                    />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search events..."
                                    value={searchQuery}
                                    onChange={(e) =>
                                        setSearchQuery(e.target.value)
                                    }
                                    className="w-full pl-10 pr-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF5500]/50 focus:ring-1 focus:ring-[#FF5500]/20 transition-all"
                                />
                            </div>
                        </div>

                        {/* Event Type */}
                        <select
                            value={selectedType}
                            onChange={(e) => setSelectedType(e.target.value)}
                            className="px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50 cursor-pointer"
                        >
                            <option value="">All Types</option>
                            {filters.eventTypes.map((type) => (
                                <option key={type} value={type}>
                                    {EVENT_TYPE_ICONS[type]} {type}
                                </option>
                            ))}
                        </select>

                        {/* City */}
                        <select
                            value={selectedCity}
                            onChange={(e) => setSelectedCity(e.target.value)}
                            className="px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50 cursor-pointer"
                        >
                            <option value="">All Cities</option>
                            {filters.cities.map((city) => (
                                <option key={city} value={city}>
                                    {city}
                                </option>
                            ))}
                        </select>

                        {/* Blockchain */}
                        {filters.blockchains.length > 0 && (
                            <select
                                value={selectedBlockchain}
                                onChange={(e) =>
                                    setSelectedBlockchain(e.target.value)
                                }
                                className="px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50 cursor-pointer"
                            >
                                <option value="">All Chains</option>
                                {filters.blockchains.map((chain) => (
                                    <option key={chain} value={chain}>
                                        {chain}
                                    </option>
                                ))}
                            </select>
                        )}

                        {/* Upcoming Toggle */}
                        <label className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl cursor-pointer hover:border-zinc-600 transition-colors">
                            <input
                                type="checkbox"
                                checked={showUpcoming}
                                onChange={(e) =>
                                    setShowUpcoming(e.target.checked)
                                }
                                className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-[#FF5500] focus:ring-[#FF5500]/50"
                            />
                            <span className="text-zinc-300 text-sm whitespace-nowrap">
                                Upcoming only
                            </span>
                        </label>
                    </div>
                </div>
            </div>

            {/* Events Grid */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[...Array(6)].map((_, i) => (
                            <div
                                key={i}
                                className="bg-zinc-900/50 rounded-2xl border border-zinc-800 h-80 animate-pulse"
                            />
                        ))}
                    </div>
                ) : events.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-zinc-800/50 flex items-center justify-center">
                            <span className="text-4xl">📅</span>
                        </div>
                        <h3 className="text-xl font-semibold text-zinc-300 mb-2">
                            No events found
                        </h3>
                        <p className="text-zinc-500 mb-6">
                            Try adjusting your filters or check back later.
                        </p>
                        <button
                            onClick={() => {
                                setSelectedType("");
                                setSelectedCity("");
                                setSelectedBlockchain("");
                                setSearchQuery("");
                                setEventCategory("");
                            }}
                            className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors"
                        >
                            Clear Filters
                        </button>
                    </div>
                ) : (
                    <AnimatePresence mode="popLayout">
                        <div className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {events.map((event, index) => (
                                    <motion.div
                                        key={event.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{
                                            delay: Math.min(index * 0.05, 0.5),
                                        }}
                                        className="h-full"
                                    >
                                        <EventCard
                                            event={event}
                                            onEdit={
                                                isAdmin && isReady
                                                    ? handleEditEvent
                                                    : undefined
                                            }
                                        />
                                    </motion.div>
                                ))}
                            </div>
                            {rawEvents.length < totalFromApi &&
                                totalFromApi > 0 && (
                                    <div
                                        className="flex justify-center py-6"
                                        ref={loadMoreRef}
                                    >
                                        <button
                                            type="button"
                                            onClick={loadMoreEvents}
                                            disabled={isLoadingMore}
                                            className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
                                        >
                                            {isLoadingMore
                                                ? "Loading…"
                                                : `Load more (${rawEvents.length} of ${totalFromApi} loaded)`}
                                        </button>
                                    </div>
                                )}
                        </div>
                    </AnimatePresence>
                )}
            </div>

            {/* Footer */}
            <SpritzFooter />

            {/* Edit Event Modal */}
            {editingEvent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-zinc-900 rounded-2xl border border-zinc-800 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                    >
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold text-white">
                                    Edit Event
                                </h2>
                                <button
                                    onClick={() => setEditingEvent(null)}
                                    className="text-zinc-400 hover:text-white transition-colors"
                                >
                                    <svg
                                        className="w-6 h-6"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M6 18L18 6M6 6l12 12"
                                        />
                                    </svg>
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                                        Event Name
                                    </label>
                                    <input
                                        type="text"
                                        value={editFormData.name}
                                        onChange={(e) =>
                                            setEditFormData({
                                                ...editFormData,
                                                name: e.target.value,
                                            })
                                        }
                                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                                        Description
                                    </label>
                                    <textarea
                                        value={editFormData.description}
                                        onChange={(e) =>
                                            setEditFormData({
                                                ...editFormData,
                                                description: e.target.value,
                                            })
                                        }
                                        rows={3}
                                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                                            Event Type
                                        </label>
                                        <select
                                            value={editFormData.event_type}
                                            onChange={(e) =>
                                                setEditFormData({
                                                    ...editFormData,
                                                    event_type: e.target.value,
                                                })
                                            }
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                        >
                                            {EVENT_TYPE_ICONS &&
                                                Object.keys(
                                                    EVENT_TYPE_ICONS,
                                                ).map((type) => (
                                                    <option
                                                        key={type}
                                                        value={type}
                                                    >
                                                        {EVENT_TYPE_ICONS[type]}{" "}
                                                        {type}
                                                    </option>
                                                ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                                            Event Date
                                        </label>
                                        <input
                                            type="date"
                                            value={editFormData.event_date}
                                            onChange={(e) =>
                                                setEditFormData({
                                                    ...editFormData,
                                                    event_date: e.target.value,
                                                })
                                            }
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                                            Start Time
                                        </label>
                                        <input
                                            type="time"
                                            value={editFormData.start_time}
                                            onChange={(e) =>
                                                setEditFormData({
                                                    ...editFormData,
                                                    start_time: e.target.value,
                                                })
                                            }
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                                            End Time
                                        </label>
                                        <input
                                            type="time"
                                            value={editFormData.end_time}
                                            onChange={(e) =>
                                                setEditFormData({
                                                    ...editFormData,
                                                    end_time: e.target.value,
                                                })
                                            }
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                                            City
                                        </label>
                                        <input
                                            type="text"
                                            value={editFormData.city}
                                            onChange={(e) =>
                                                setEditFormData({
                                                    ...editFormData,
                                                    city: e.target.value,
                                                })
                                            }
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                                            Country
                                        </label>
                                        <input
                                            type="text"
                                            value={editFormData.country}
                                            onChange={(e) =>
                                                setEditFormData({
                                                    ...editFormData,
                                                    country: e.target.value,
                                                })
                                            }
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                                        Venue
                                    </label>
                                    <input
                                        type="text"
                                        value={editFormData.venue}
                                        onChange={(e) =>
                                            setEditFormData({
                                                ...editFormData,
                                                venue: e.target.value,
                                            })
                                        }
                                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                                        Organizer
                                    </label>
                                    <input
                                        type="text"
                                        value={editFormData.organizer}
                                        onChange={(e) =>
                                            setEditFormData({
                                                ...editFormData,
                                                organizer: e.target.value,
                                            })
                                        }
                                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                                        Event URL
                                    </label>
                                    <input
                                        type="url"
                                        value={editFormData.event_url}
                                        onChange={(e) =>
                                            setEditFormData({
                                                ...editFormData,
                                                event_url: e.target.value,
                                            })
                                        }
                                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                                        RSVP URL
                                    </label>
                                    <input
                                        type="url"
                                        value={editFormData.rsvp_url}
                                        onChange={(e) =>
                                            setEditFormData({
                                                ...editFormData,
                                                rsvp_url: e.target.value,
                                            })
                                        }
                                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="is_featured"
                                        checked={editFormData.is_featured}
                                        onChange={(e) =>
                                            setEditFormData({
                                                ...editFormData,
                                                is_featured: e.target.checked,
                                            })
                                        }
                                        className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-[#FF5500] focus:ring-[#FF5500]/50"
                                    />
                                    <label
                                        htmlFor="is_featured"
                                        className="text-sm text-zinc-300"
                                    >
                                        Featured Event
                                    </label>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={handleSaveEvent}
                                    disabled={isSaving}
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#FF5500]/20 transition-all disabled:opacity-50"
                                >
                                    {isSaving ? "Saving..." : "Save Changes"}
                                </button>
                                <button
                                    onClick={() => setEditingEvent(null)}
                                    className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Submit Event Modal */}
            {showSubmitEventModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-zinc-900 rounded-2xl border border-zinc-800 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                    >
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold text-white">
                                    Submit an event
                                </h2>
                                <button
                                    onClick={() => {
                                        setShowSubmitEventModal(false);
                                        setSubmitError(null);
                                    }}
                                    className="text-zinc-400 hover:text-white transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            {submitError && (
                                <p className="mb-4 text-sm text-red-400">{submitError}</p>
                            )}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">Event name *</label>
                                    <input
                                        type="text"
                                        value={submitFormData.name}
                                        onChange={(e) => setSubmitFormData({ ...submitFormData, name: e.target.value })}
                                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                        placeholder="e.g. ETH Denver 2025"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">Description</label>
                                    <textarea
                                        value={submitFormData.description}
                                        onChange={(e) => setSubmitFormData({ ...submitFormData, description: e.target.value })}
                                        rows={3}
                                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                        placeholder="Brief description of the event"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">Event type *</label>
                                        <select
                                            value={submitFormData.event_type}
                                            onChange={(e) => setSubmitFormData({ ...submitFormData, event_type: e.target.value })}
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                        >
                                            {Object.entries(EVENT_TYPE_ICONS).map(([type]) => (
                                                <option key={type} value={type}>{EVENT_TYPE_ICONS[type]} {type}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">Event date *</label>
                                        <input
                                            type="date"
                                            value={submitFormData.event_date}
                                            onChange={(e) => setSubmitFormData({ ...submitFormData, event_date: e.target.value })}
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">Start time</label>
                                    <input
                                        type="time"
                                        value={submitFormData.start_time}
                                        onChange={(e) => setSubmitFormData({ ...submitFormData, start_time: e.target.value })}
                                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">Venue</label>
                                    <input
                                        type="text"
                                        value={submitFormData.venue}
                                        onChange={(e) => setSubmitFormData({ ...submitFormData, venue: e.target.value })}
                                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                        placeholder="Venue name"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">City</label>
                                        <input
                                            type="text"
                                            value={submitFormData.city}
                                            onChange={(e) => setSubmitFormData({ ...submitFormData, city: e.target.value })}
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">Country</label>
                                        <input
                                            type="text"
                                            value={submitFormData.country}
                                            onChange={(e) => setSubmitFormData({ ...submitFormData, country: e.target.value })}
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">Organizer</label>
                                    <input
                                        type="text"
                                        value={submitFormData.organizer}
                                        onChange={(e) => setSubmitFormData({ ...submitFormData, organizer: e.target.value })}
                                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">Event / ticket URL</label>
                                    <input
                                        type="url"
                                        value={submitFormData.event_url}
                                        onChange={(e) => setSubmitFormData({ ...submitFormData, event_url: e.target.value })}
                                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                                        placeholder="https://..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-zinc-300 mb-2">Event image (optional)</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => setSubmitBannerFile(e.target.files?.[0] || null)}
                                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-zinc-700 file:text-white"
                                    />
                                    <p className="mt-1 text-xs text-zinc-500">Max 5MB. JPG, PNG, WebP.</p>
                                </div>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={handleSubmitEvent}
                                    disabled={submitLoading}
                                    className="flex-1 px-4 py-2.5 bg-[#FF5500] hover:bg-[#e04d00] text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                                >
                                    {submitLoading ? "Creating…" : "Create event (draft)"}
                                </button>
                                <button
                                    onClick={() => { setShowSubmitEventModal(false); setSubmitError(null); }}
                                    className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
