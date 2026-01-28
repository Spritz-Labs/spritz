"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { generateICS, generateGoogleCalendarURL, generateOutlookCalendarURL, downloadICS, CalendarEvent } from "@/lib/calendar";
import { useAuth } from "@/context/AuthProvider";

interface Event {
    id: string;
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
        const startMonth = start.toLocaleDateString("en-US", { month: "short" });
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
        const startMonth = start.toLocaleDateString("en-US", { month: "short" });
        const endMonth = end.toLocaleDateString("en-US", { month: "short" });
        
        if (startMonth === endMonth) {
            return `${startDay} - ${endDay} ${startMonth}`;
        } else {
            return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
        }
    }
}

function EventCard({ event }: { event: Event }) {
    const typeIcon = EVENT_TYPE_ICONS[event.event_type] || "📅";
    const [showCalendarMenu, setShowCalendarMenu] = useState(false);
    const { isAuthenticated } = useAuth();
    const [userInterest, setUserInterest] = useState<string | null>(null); // 'interested' | 'going' | null
    const [interestedCount, setInterestedCount] = useState(event.interested_count || 0);
    const [goingCount, setGoingCount] = useState(event.going_count || 0);
    const [showAttendees, setShowAttendees] = useState(false);
    const [attendees, setAttendees] = useState<Array<{ wallet_address: string; interest_type: string }>>([]);
    const [isLoadingInterest, setIsLoadingInterest] = useState(false);

    // Fetch user's interest status and counts
    useEffect(() => {
        async function fetchInterest() {
            try {
                const res = await fetch(`/api/events/${event.id}/interest`);
                const data = await res.json();
                if (data) {
                    setUserInterest(data.user_interest || null);
                    setInterestedCount(data.interested_count || 0);
                    setGoingCount(data.going_count || 0);
                    if (data.users) {
                        setAttendees(data.users);
                    }
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
                const res = await fetch(`/api/events/${event.id}/interest?type=${type}`, {
                    method: "DELETE",
                    credentials: "include",
                });
                if (res.ok) {
                    setUserInterest(null);
                    if (type === "interested") {
                        setInterestedCount(prev => Math.max(0, prev - 1));
                    } else {
                        setGoingCount(prev => Math.max(0, prev - 1));
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
                        setInterestedCount(prev => Math.max(0, prev - 1));
                    } else if (oldType === "going") {
                        setGoingCount(prev => Math.max(0, prev - 1));
                    }
                    
                    if (type === "interested") {
                        setInterestedCount(prev => prev + 1);
                    } else {
                        setGoingCount(prev => prev + 1);
                    }

                    // Refresh attendees list
                    const interestRes = await fetch(`/api/events/${event.id}/interest`);
                    const interestData = await interestRes.json();
                    if (interestData.users) {
                        setAttendees(interestData.users);
                    }
                }
            }
        } catch (error) {
            console.error("Failed to update interest:", error);
        } finally {
            setIsLoadingInterest(false);
        }
    };

    const handleShowAttendees = async () => {
        if (!isAuthenticated) {
            window.location.href = "/?login=true";
            return;
        }
        setShowAttendees(!showAttendees);
    };

    // Get country flag emoji
    const getCountryFlag = (country: string | null): string => {
        if (!country) return "";
        // Simple mapping for common countries - can be expanded
        const flags: Record<string, string> = {
            "UK": "🇬🇧",
            "United Kingdom": "🇬🇧",
            "USA": "🇺🇸",
            "United States": "🇺🇸",
            "Dubai": "🇦🇪",
            "UAE": "🇦🇪",
            "Hong Kong": "🇭🇰",
            "Thailand": "🇹🇭",
            "Singapore": "🇸🇬",
            "Malaysia": "🇲🇾",
            "Japan": "🇯🇵",
            "South Korea": "🇰🇷",
            "China": "🇨🇳",
            "India": "🇮🇳",
            "Australia": "🇦🇺",
            "Canada": "🇨🇦",
            "Germany": "🇩🇪",
            "France": "🇫🇷",
            "Spain": "🇪🇸",
            "Italy": "🇮🇹",
            "Netherlands": "🇳🇱",
            "Portugal": "🇵🇹",
            "Switzerland": "🇨🇭",
            "Austria": "🇦🇹",
            "Poland": "🇵🇱",
            "Czech Republic": "🇨🇿",
            "Romania": "🇷🇴",
            "Mexico": "🇲🇽",
            "Brazil": "🇧🇷",
            "Argentina": "🇦🇷",
            "Chile": "🇨🇱",
            "Colombia": "🇨🇴",
            "South Africa": "🇿🇦",
            "Kenya": "🇰🇪",
            "Nigeria": "🇳🇬",
            "Egypt": "🇪🇬",
            "Israel": "🇮🇱",
            "Turkey": "🇹🇷",
            "Taiwan": "🇹🇼",
            "Philippines": "🇵🇭",
            "Indonesia": "🇮🇩",
            "Vietnam": "🇻🇳",
        };
        return flags[country] || "";
    };

    // Build location string
    const locationParts = [
        event.venue,
        event.address,
        event.city,
        event.country ? `${getCountryFlag(event.country)} ${event.country}` : null,
    ].filter(Boolean);
    const locationStr = locationParts.join(", ");

    // Build full location for calendar
    const fullLocation = [
        event.venue,
        event.address,
        event.city,
        event.country,
    ].filter(Boolean).join(", ") || (event.is_virtual && event.virtual_url ? "Virtual Event" : "");

    // Create calendar event
    const createCalendarEvent = (): CalendarEvent => {
        const startDate = new Date(event.event_date);
        if (event.start_time) {
            const [hours, minutes] = event.start_time.split(":");
            startDate.setHours(parseInt(hours), parseInt(minutes), 0);
        }

        const endDate = event.end_date ? new Date(event.end_date) : new Date(startDate);
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
            ].filter(Boolean).join("\n\n"),
            start: startDate,
            end: endDate,
            location: fullLocation,
            url: event.event_url || event.rsvp_url || undefined,
            organizer: event.organizer ? {
                name: event.organizer,
                email: undefined,
            } : undefined,
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
            className={`relative bg-zinc-900/60 backdrop-blur-sm rounded-2xl border overflow-hidden hover:border-[#FF5500]/50 transition-all group ${event.is_featured ? "border-[#FF5500]/40 ring-1 ring-[#FF5500]/20" : "border-zinc-800"}`}
        >
            {/* Featured Badge */}
            {event.is_featured && (
                <div className="absolute top-3 right-3 z-10 bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg">
                    ⭐ Featured
                </div>
            )}

            {/* Banner Image or Gradient Header */}
            {event.banner_image_url ? (
                <div className="h-36 bg-zinc-800 overflow-hidden">
                    <img
                        src={event.banner_image_url}
                        alt={event.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                </div>
            ) : (
                <div className="h-20 bg-gradient-to-br from-[#FF5500]/20 via-zinc-900 to-zinc-900 flex items-center justify-center border-b border-zinc-800">
                    <span className="text-3xl opacity-50">{typeIcon}</span>
                </div>
            )}

            <div className="p-5">
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
                    <span className="font-medium">{formatDateRange(event)}</span>
                    {event.start_time && (
                        <>
                            <span className="text-zinc-600">•</span>
                            <span>{formatTime(event.start_time)}</span>
                            {event.end_time && <span> - {formatTime(event.end_time)}</span>}
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
                {event.blockchain_focus && event.blockchain_focus.length > 0 && (
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
                    {/* Primary Actions Row */}
                    <div className="flex gap-2">
                        {event.rsvp_url && (
                            <a
                                href={event.rsvp_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 text-center py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white text-sm font-semibold hover:shadow-lg hover:shadow-[#FF5500]/20 transition-all"
                            >
                                RSVP
                            </a>
                        )}
                        {event.registration_enabled && !event.rsvp_url && (
                            <Link
                                href={`/events/${event.id}`}
                                className="flex-1 text-center py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white text-sm font-semibold hover:shadow-lg hover:shadow-[#FF5500]/20 transition-all"
                            >
                                Register
                            </Link>
                        )}
                        {event.event_url && (
                            <a
                                href={event.event_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 text-center py-2.5 px-4 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-800 hover:border-zinc-600 transition-all"
                            >
                                Website
                            </a>
                        )}
                        {event.ticket_url && !event.rsvp_url && (
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
                                    ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
                                    : "bg-zinc-800/50 text-zinc-400 border border-zinc-700 hover:bg-zinc-800 hover:border-zinc-600"
                            } disabled:opacity-50`}
                        >
                            <span>★</span>
                            <span>Interested</span>
                            {interestedCount > 0 && (
                                <span className="text-xs opacity-75">({interestedCount})</span>
                            )}
                        </button>
                        <button
                            onClick={() => handleInterest("going")}
                            disabled={isLoadingInterest}
                            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                                userInterest === "going"
                                    ? "bg-green-500/20 text-green-400 border border-green-500/40"
                                    : "bg-zinc-800/50 text-zinc-400 border border-zinc-700 hover:bg-zinc-800 hover:border-zinc-600"
                            } disabled:opacity-50`}
                        >
                            <span>✓</span>
                            <span>Going?</span>
                            {goingCount > 0 && (
                                <span className="text-xs opacity-75">({goingCount})</span>
                            )}
                        </button>
                    </div>

                    {/* Show Attendees Button (restricted) */}
                    {(interestedCount > 0 || goingCount > 0) && (
                        <button
                            onClick={handleShowAttendees}
                            className="w-full py-1.5 px-3 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors border border-zinc-800 hover:border-zinc-700"
                        >
                            {isAuthenticated ? (
                                showAttendees ? (
                                    "Hide"
                                ) : (
                                    <>
                                        See who&apos;s {interestedCount > 0 && `${interestedCount} interested`}
                                        {interestedCount > 0 && goingCount > 0 && " and "}
                                        {goingCount > 0 && `${goingCount} going`}
                                    </>
                                )
                            ) : (
                                "Log in to see who's going"
                            )}
                        </button>
                    )}

                    {/* Attendees List (restricted to authenticated users) */}
                    {showAttendees && isAuthenticated && attendees.length > 0 && (
                        <div className="mt-2 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50 max-h-40 overflow-y-auto">
                            <div className="space-y-2">
                                {attendees.filter(a => a.interest_type === "going").length > 0 && (
                                    <div>
                                        <div className="text-xs font-medium text-zinc-400 mb-1">Going ({attendees.filter(a => a.interest_type === "going").length})</div>
                                        <div className="flex flex-wrap gap-1">
                                            {attendees.filter(a => a.interest_type === "going").slice(0, 10).map((attendee, idx) => (
                                                <span
                                                    key={idx}
                                                    className="text-xs px-2 py-0.5 rounded bg-zinc-700/50 text-zinc-300"
                                                    title={attendee.wallet_address}
                                                >
                                                    {attendee.wallet_address.slice(0, 6)}...{attendee.wallet_address.slice(-4)}
                                                </span>
                                            ))}
                                            {attendees.filter(a => a.interest_type === "going").length > 10 && (
                                                <span className="text-xs px-2 py-0.5 rounded bg-zinc-700/50 text-zinc-300">
                                                    +{attendees.filter(a => a.interest_type === "going").length - 10}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {attendees.filter(a => a.interest_type === "interested").length > 0 && (
                                    <div>
                                        <div className="text-xs font-medium text-zinc-400 mb-1">Interested ({attendees.filter(a => a.interest_type === "interested").length})</div>
                                        <div className="flex flex-wrap gap-1">
                                            {attendees.filter(a => a.interest_type === "interested").slice(0, 10).map((attendee, idx) => (
                                                <span
                                                    key={idx}
                                                    className="text-xs px-2 py-0.5 rounded bg-zinc-700/50 text-zinc-300"
                                                    title={attendee.wallet_address}
                                                >
                                                    {attendee.wallet_address.slice(0, 6)}...{attendee.wallet_address.slice(-4)}
                                                </span>
                                            ))}
                                            {attendees.filter(a => a.interest_type === "interested").length > 10 && (
                                                <span className="text-xs px-2 py-0.5 rounded bg-zinc-700/50 text-zinc-300">
                                                    +{attendees.filter(a => a.interest_type === "interested").length - 10}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Add to Calendar Button */}
                    <div className="relative">
                        <button
                            onClick={() => setShowCalendarMenu(!showCalendarMenu)}
                            className="w-full py-2 px-4 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-800 hover:border-zinc-600 transition-all flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            Add to Calendar
                            <svg className={`w-4 h-4 transition-transform ${showCalendarMenu ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>

                        {/* Calendar Menu Dropdown */}
                        {showCalendarMenu && (
                            <div className="absolute bottom-full left-0 right-0 mb-2 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-10">
                                <button
                                    onClick={() => handleAddToCalendar("google")}
                                    className="w-full px-4 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-700 transition-colors flex items-center gap-2"
                                >
                                    <span>📅</span>
                                    Google Calendar
                                </button>
                                <button
                                    onClick={() => handleAddToCalendar("outlook")}
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
    const [events, setEvents] = useState<Event[]>([]);
    const [filters, setFilters] = useState<Filters>({ eventTypes: [], cities: [], countries: [], blockchains: [] });
    const [isLoading, setIsLoading] = useState(true);
    const [total, setTotal] = useState(0);

    // Filter state
    const [selectedType, setSelectedType] = useState<string>("");
    const [selectedCity, setSelectedCity] = useState<string>("");
    const [selectedBlockchain, setSelectedBlockchain] = useState<string>("");
    const [searchQuery, setSearchQuery] = useState("");
    const [showUpcoming, setShowUpcoming] = useState(true);

    useEffect(() => {
        fetchEvents();
    }, [selectedType, selectedCity, selectedBlockchain, searchQuery, showUpcoming]);

    async function fetchEvents() {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (selectedType) params.set("type", selectedType);
            if (selectedCity) params.set("city", selectedCity);
            if (selectedBlockchain) params.set("blockchain", selectedBlockchain);
            if (searchQuery) params.set("search", searchQuery);
            if (showUpcoming) params.set("upcoming", "true");
            params.set("limit", "50");

            const res = await fetch(`/api/events?${params.toString()}`);
            const data = await res.json();

            if (data.events) {
                setEvents(data.events);
                setTotal(data.total);
                setFilters(data.filters);
            }
        } catch (error) {
            console.error("Failed to fetch events:", error);
        } finally {
            setIsLoading(false);
        }
    }

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
                        <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                            <img
                                src="/icons/icon-96x96.png"
                                alt="Spritz"
                                className="w-9 h-9 rounded-xl"
                            />
                            <span className="text-xl font-bold hidden sm:block">Spritz</span>
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
                    <div className="text-sm text-zinc-500">
                        {total} event{total !== 1 ? "s" : ""} available
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-8">
                <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl border border-zinc-800 p-4">
                    <div className="flex flex-wrap gap-3">
                        {/* Search */}
                        <div className="flex-1 min-w-[200px]">
                            <div className="relative">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search events..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
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
                                <option key={city} value={city}>{city}</option>
                            ))}
                        </select>

                        {/* Blockchain */}
                        {filters.blockchains.length > 0 && (
                            <select
                                value={selectedBlockchain}
                                onChange={(e) => setSelectedBlockchain(e.target.value)}
                                className="px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50 cursor-pointer"
                            >
                                <option value="">All Chains</option>
                                {filters.blockchains.map((chain) => (
                                    <option key={chain} value={chain}>{chain}</option>
                                ))}
                            </select>
                        )}

                        {/* Upcoming Toggle */}
                        <label className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl cursor-pointer hover:border-zinc-600 transition-colors">
                            <input
                                type="checkbox"
                                checked={showUpcoming}
                                onChange={(e) => setShowUpcoming(e.target.checked)}
                                className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-[#FF5500] focus:ring-[#FF5500]/50"
                            />
                            <span className="text-zinc-300 text-sm whitespace-nowrap">Upcoming only</span>
                        </label>
                    </div>
                </div>
            </div>

            {/* Events Grid */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="bg-zinc-900/50 rounded-2xl border border-zinc-800 h-80 animate-pulse" />
                        ))}
                    </div>
                ) : events.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-zinc-800/50 flex items-center justify-center">
                            <span className="text-4xl">📅</span>
                        </div>
                        <h3 className="text-xl font-semibold text-zinc-300 mb-2">No events found</h3>
                        <p className="text-zinc-500 mb-6">Try adjusting your filters or check back later.</p>
                        <button
                            onClick={() => {
                                setSelectedType("");
                                setSelectedCity("");
                                setSelectedBlockchain("");
                                setSearchQuery("");
                            }}
                            className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors"
                        >
                            Clear Filters
                        </button>
                    </div>
                ) : (
                    <AnimatePresence mode="popLayout">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {events.map((event, index) => (
                                <motion.div
                                    key={event.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                >
                                    <EventCard event={event} />
                                </motion.div>
                            ))}
                        </div>
                    </AnimatePresence>
                )}
            </div>

            {/* Footer */}
            <footer className="border-t border-zinc-800 py-8">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center">
                    <p className="text-zinc-500 text-sm">
                        Powered by <Link href="/" className="text-[#FF5500] hover:underline">Spritz</Link>
                    </p>
                </div>
            </footer>
        </div>
    );
}
