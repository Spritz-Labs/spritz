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

const EVENT_TYPE_COLORS: Record<string, string> = {
    conference: "from-blue-500 to-indigo-600",
    hackathon: "from-purple-500 to-pink-600",
    meetup: "from-green-500 to-emerald-600",
    workshop: "from-orange-500 to-amber-600",
    summit: "from-cyan-500 to-blue-600",
    party: "from-pink-500 to-rose-600",
    networking: "from-teal-500 to-cyan-600",
    other: "from-gray-500 to-slate-600",
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
    const typeColor = EVENT_TYPE_COLORS[event.event_type] || EVENT_TYPE_COLORS.other;
    const typeIcon = EVENT_TYPE_ICONS[event.event_type] || "📅";

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`relative bg-zinc-900/80 backdrop-blur-sm rounded-2xl border border-zinc-800 overflow-hidden hover:border-zinc-700 transition-all group ${event.is_featured ? "ring-2 ring-yellow-500/50" : ""}`}
        >
            {/* Featured Badge */}
            {event.is_featured && (
                <div className="absolute top-3 right-3 z-10 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded-full">
                    ⭐ Featured
                </div>
            )}

            {/* Banner Image */}
            {event.banner_image_url ? (
                <div className="h-40 bg-gradient-to-br from-zinc-800 to-zinc-900 overflow-hidden">
                    <img
                        src={event.banner_image_url}
                        alt={event.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                </div>
            ) : (
                <div className={`h-24 bg-gradient-to-br ${typeColor} flex items-center justify-center`}>
                    <span className="text-4xl">{typeIcon}</span>
                </div>
            )}

            <div className="p-5">
                {/* Event Type Badge */}
                <div className="flex items-center gap-2 mb-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gradient-to-r ${typeColor} text-white`}>
                        {typeIcon} {event.event_type}
                    </span>
                    {event.is_virtual && (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            🌐 Virtual
                        </span>
                    )}
                </div>

                {/* Title */}
                <h3 className="text-lg font-bold text-white mb-2 line-clamp-2 group-hover:text-purple-400 transition-colors">
                    {event.name}
                </h3>

                {/* Date & Time */}
                <div className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                    <span>📅</span>
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
                        <span>📍</span>
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
                    <div className="flex items-center gap-2 text-sm text-zinc-400 mb-3">
                        <span>🏢</span>
                        <span className="truncate">{event.organizer}</span>
                    </div>
                )}

                {/* Tags */}
                {event.blockchain_focus && event.blockchain_focus.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                        {event.blockchain_focus.slice(0, 3).map((chain) => (
                            <span
                                key={chain}
                                className="px-2 py-0.5 text-xs rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700"
                            >
                                {chain}
                            </span>
                        ))}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-auto">
                    {event.registration_enabled && (
                        <Link
                            href={`/events/${event.id}`}
                            className="flex-1 text-center py-2 px-4 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium hover:from-purple-600 hover:to-pink-600 transition-all"
                        >
                            Register
                        </Link>
                    )}
                    {event.event_url && (
                        <a
                            href={event.event_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 text-center py-2 px-4 rounded-lg border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-800 transition-all"
                        >
                            View Event →
                        </a>
                    )}
                    {event.rsvp_url && !event.registration_enabled && (
                        <a
                            href={event.rsvp_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 text-center py-2 px-4 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium hover:from-purple-600 hover:to-pink-600 transition-all"
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
        <div className="min-h-screen bg-black text-white">
            {/* Header */}
            <div className="bg-gradient-to-b from-purple-900/20 to-transparent">
                <div className="max-w-7xl mx-auto px-4 py-12">
                    <Link href="/" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors">
                        ← Back to Spritz
                    </Link>
                    
                    <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-500 to-orange-400 bg-clip-text text-transparent mb-4">
                        Events
                    </h1>
                    <p className="text-xl text-zinc-400 max-w-2xl">
                        Discover conferences, hackathons, meetups, and more.
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="max-w-7xl mx-auto px-4 pb-8">
                <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl border border-zinc-800 p-4 mb-8">
                    <div className="flex flex-wrap gap-4">
                        {/* Search */}
                        <div className="flex-1 min-w-[200px]">
                            <input
                                type="text"
                                placeholder="Search events..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                            />
                        </div>

                        {/* Event Type */}
                        <select
                            value={selectedType}
                            onChange={(e) => setSelectedType(e.target.value)}
                            className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
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
                            className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                        >
                            <option value="">All Cities</option>
                            {filters.cities.map((city) => (
                                <option key={city} value={city}>{city}</option>
                            ))}
                        </select>

                        {/* Blockchain */}
                        <select
                            value={selectedBlockchain}
                            onChange={(e) => setSelectedBlockchain(e.target.value)}
                            className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                        >
                            <option value="">All Chains</option>
                            {filters.blockchains.map((chain) => (
                                <option key={chain} value={chain}>{chain}</option>
                            ))}
                        </select>

                        {/* Upcoming Toggle */}
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={showUpcoming}
                                onChange={(e) => setShowUpcoming(e.target.checked)}
                                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500"
                            />
                            <span className="text-zinc-400">Upcoming only</span>
                        </label>
                    </div>
                </div>

                {/* Results Count */}
                <div className="flex justify-between items-center mb-6">
                    <p className="text-zinc-400">
                        {isLoading ? "Loading..." : `${total} event${total !== 1 ? "s" : ""} found`}
                    </p>
                </div>

                {/* Events Grid */}
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="bg-zinc-900/50 rounded-2xl h-80 animate-pulse" />
                        ))}
                    </div>
                ) : events.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="text-6xl mb-4">📅</div>
                        <h3 className="text-xl font-semibold text-zinc-300 mb-2">No events found</h3>
                        <p className="text-zinc-500">Try adjusting your filters or check back later.</p>
                    </div>
                ) : (
                    <AnimatePresence mode="popLayout">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {events.map((event) => (
                                <EventCard key={event.id} event={event} />
                            ))}
                        </div>
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
}
