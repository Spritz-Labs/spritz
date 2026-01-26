"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";

interface Event {
    id: string;
    name: string;
    description: string | null;
    event_type: string;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    venue: string | null;
    city: string | null;
    country: string | null;
    is_virtual: boolean;
    organizer: string | null;
    organizer_logo_url: string | null;
    event_url: string | null;
    rsvp_url: string | null;
    banner_image_url: string | null;
    tags: string[];
    blockchain_focus: string[] | null;
    is_featured: boolean;
    registration_enabled: boolean;
    current_registrations: number;
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

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
        weekday: "short",
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

function EventCard({ event }: { event: Event }) {
    const typeIcon = EVENT_TYPE_ICONS[event.event_type] || "📅";

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

                {/* Date & Time */}
                <div className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                    <span className="text-[#FF5500]">📅</span>
                    <span>{formatDate(event.event_date)}</span>
                    {event.start_time && (
                        <>
                            <span className="text-zinc-600">•</span>
                            <span>{formatTime(event.start_time)}</span>
                        </>
                    )}
                </div>

                {/* Location */}
                {(event.city || event.venue) && (
                    <div className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                        <span className="text-[#FF5500]">📍</span>
                        <span className="truncate">
                            {event.venue && <span>{event.venue}</span>}
                            {event.venue && event.city && ", "}
                            {event.city}
                            {event.country && `, ${event.country}`}
                        </span>
                    </div>
                )}

                {/* Organizer */}
                {event.organizer && (
                    <div className="flex items-center gap-2 text-sm text-zinc-400 mb-4">
                        <span className="text-[#FF5500]">🏢</span>
                        <span className="truncate">{event.organizer}</span>
                    </div>
                )}

                {/* Tags */}
                {event.blockchain_focus && event.blockchain_focus.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                        {event.blockchain_focus.slice(0, 3).map((chain) => (
                            <span
                                key={chain}
                                className="px-2 py-0.5 text-xs rounded-md bg-zinc-800 text-zinc-400 border border-zinc-700"
                            >
                                {chain}
                            </span>
                        ))}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-auto pt-2 border-t border-zinc-800">
                    {event.registration_enabled && (
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
                            View Event →
                        </a>
                    )}
                    {event.rsvp_url && !event.registration_enabled && (
                        <a
                            href={event.rsvp_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 text-center py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white text-sm font-semibold hover:shadow-lg hover:shadow-[#FF5500]/20 transition-all"
                        >
                            RSVP →
                        </a>
                    )}
                </div>
            </div>
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
