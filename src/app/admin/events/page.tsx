"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { AdminLayout, AdminAuthWrapper, AdminLoading } from "@/components/AdminLayout";

interface GlobalEvent {
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
    event_url: string | null;
    rsvp_url: string | null;
    tags: string[];
    blockchain_focus: string[] | null;
    source: string;
    status: string;
    is_featured: boolean;
    registration_enabled: boolean;
    current_registrations: number;
    created_at: string;
}

const EVENT_TYPES = ["conference", "hackathon", "meetup", "workshop", "summit", "party", "networking", "other"];
const EVENT_STATUSES = ["draft", "published", "cancelled", "completed"];

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

const STATUS_COLORS: Record<string, string> = {
    draft: "bg-yellow-500/20 text-yellow-400",
    published: "bg-green-500/20 text-green-400",
    cancelled: "bg-red-500/20 text-red-400",
    completed: "bg-zinc-500/20 text-zinc-400",
};

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

export default function AdminEventsPage() {
    const { isAdmin, isReady, getAuthHeaders } = useAdmin();
    const [events, setEvents] = useState<GlobalEvent[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [total, setTotal] = useState(0);

    // Filters
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [typeFilter, setTypeFilter] = useState<string>("");
    const [searchQuery, setSearchQuery] = useState("");

    // Modal state
    const [showAddModal, setShowAddModal] = useState(false);
    const [showScrapeModal, setShowScrapeModal] = useState(false);
    const [editingEvent, setEditingEvent] = useState<GlobalEvent | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        event_type: "conference",
        event_date: "",
        start_time: "",
        end_time: "",
        venue: "",
        city: "",
        country: "",
        is_virtual: false,
        organizer: "",
        event_url: "",
        rsvp_url: "",
        status: "draft",
        is_featured: false,
        registration_enabled: false,
        blockchain_focus: "",
        tags: "",
    });

    // Scrape form state
    const [scrapeUrl, setScrapeUrl] = useState("");
    const [scrapeEventTypes, setScrapeEventTypes] = useState<string[]>([]);
    const [saveSource, setSaveSource] = useState(false);
    const [isScraping, setIsScraping] = useState(false);
    const [scrapeResult, setScrapeResult] = useState<{ extracted: number; inserted: number; skipped: number } | null>(null);

    const fetchEvents = useCallback(async () => {
        if (!isReady) return;
        setIsLoading(true);

        try {
            const params = new URLSearchParams();
            if (statusFilter) params.set("status", statusFilter);
            if (typeFilter) params.set("type", typeFilter);
            if (searchQuery) params.set("search", searchQuery);

            const headers = getAuthHeaders();
            if (!headers) return;
            
            const res = await fetch(`/api/admin/events?${params.toString()}`, {
                headers,
            });
            const data = await res.json();

            if (data.events) {
                setEvents(data.events);
                setTotal(data.total);
            }
        } catch (error) {
            console.error("Failed to fetch events:", error);
        } finally {
            setIsLoading(false);
        }
    }, [isReady, getAuthHeaders, statusFilter, typeFilter, searchQuery]);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const eventData = {
            ...formData,
            blockchain_focus: formData.blockchain_focus ? formData.blockchain_focus.split(",").map(s => s.trim()) : null,
            tags: formData.tags ? formData.tags.split(",").map(s => s.trim()) : [],
        };

        try {
            const url = editingEvent ? `/api/admin/events/${editingEvent.id}` : "/api/admin/events";
            const method = editingEvent ? "PATCH" : "POST";

            const res = await fetch(url, {
                method,
                headers: {
                    ...(getAuthHeaders() || {}),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(eventData),
            });

            if (res.ok) {
                setShowAddModal(false);
                setEditingEvent(null);
                resetForm();
                fetchEvents();
            }
        } catch (error) {
            console.error("Failed to save event:", error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this event?")) return;

        try {
            const deleteHeaders = getAuthHeaders();
            if (!deleteHeaders) return;
            
            const res = await fetch(`/api/admin/events/${id}`, {
                method: "DELETE",
                headers: deleteHeaders,
            });

            if (res.ok) {
                fetchEvents();
            }
        } catch (error) {
            console.error("Failed to delete event:", error);
        }
    };

    const handleScrape = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!scrapeUrl) return;

        setIsScraping(true);
        setScrapeResult(null);

        try {
            const res = await fetch("/api/admin/events/scrape", {
                method: "POST",
                headers: {
                    ...(getAuthHeaders() || {}),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    url: scrapeUrl,
                    event_types: scrapeEventTypes.length > 0 ? scrapeEventTypes : undefined,
                    save_source: saveSource,
                }),
            });

            const data = await res.json();

            if (data.success) {
                setScrapeResult({
                    extracted: data.extracted,
                    inserted: data.inserted,
                    skipped: data.skipped,
                });
                fetchEvents();
            } else {
                alert(data.error || "Failed to scrape events");
            }
        } catch (error) {
            console.error("Failed to scrape:", error);
            alert("Failed to scrape events");
        } finally {
            setIsScraping(false);
        }
    };

    const resetForm = () => {
        setFormData({
            name: "",
            description: "",
            event_type: "conference",
            event_date: "",
            start_time: "",
            end_time: "",
            venue: "",
            city: "",
            country: "",
            is_virtual: false,
            organizer: "",
            event_url: "",
            rsvp_url: "",
            status: "draft",
            is_featured: false,
            registration_enabled: false,
            blockchain_focus: "",
            tags: "",
        });
    };

    const openEditModal = (event: GlobalEvent) => {
        setEditingEvent(event);
        setFormData({
            name: event.name,
            description: event.description || "",
            event_type: event.event_type,
            event_date: event.event_date,
            start_time: event.start_time || "",
            end_time: event.end_time || "",
            venue: event.venue || "",
            city: event.city || "",
            country: event.country || "",
            is_virtual: event.is_virtual,
            organizer: event.organizer || "",
            event_url: event.event_url || "",
            rsvp_url: event.rsvp_url || "",
            status: event.status,
            is_featured: event.is_featured,
            registration_enabled: event.registration_enabled,
            blockchain_focus: event.blockchain_focus?.join(", ") || "",
            tags: event.tags?.join(", ") || "",
        });
        setShowAddModal(true);
    };

    const toggleStatus = async (event: GlobalEvent, newStatus: string) => {
        try {
            const res = await fetch(`/api/admin/events/${event.id}`, {
                method: "PATCH",
                headers: {
                    ...(getAuthHeaders() || {}),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ status: newStatus }),
            });

            if (res.ok) {
                fetchEvents();
            }
        } catch (error) {
            console.error("Failed to update status:", error);
        }
    };

    return (
        <AdminAuthWrapper>
            <AdminLayout title="Events">
                <div className="space-y-6 max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-white">Events Management</h1>
                            <p className="text-zinc-400">Manage global events database • {total} event{total !== 1 ? "s" : ""}</p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowScrapeModal(true)}
                                className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors flex items-center gap-2 text-sm font-medium"
                            >
                                🔍 Scrape Events
                            </button>
                            <button
                                onClick={() => {
                                    resetForm();
                                    setEditingEvent(null);
                                    setShowAddModal(true);
                                }}
                                className="px-4 py-2.5 bg-gradient-to-r from-[#FF5500] to-[#e04d00] hover:shadow-lg hover:shadow-[#FF5500]/20 text-white rounded-xl transition-all flex items-center gap-2 text-sm font-medium"
                            >
                                ➕ Add Event
                            </button>
                        </div>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                            <p className="text-zinc-500 text-xs mb-1">Total Events</p>
                            <p className="text-2xl font-bold text-white">{total}</p>
                        </div>
                        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                            <p className="text-zinc-500 text-xs mb-1">Published</p>
                            <p className="text-2xl font-bold text-green-400">{events.filter(e => e.status === "published").length}</p>
                        </div>
                        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                            <p className="text-zinc-500 text-xs mb-1">Draft</p>
                            <p className="text-2xl font-bold text-yellow-400">{events.filter(e => e.status === "draft").length}</p>
                        </div>
                        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                            <p className="text-zinc-500 text-xs mb-1">Featured</p>
                            <p className="text-2xl font-bold text-[#FF5500]">{events.filter(e => e.is_featured).length}</p>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                        <div className="flex flex-wrap gap-3">
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
                                        className="w-full pl-10 pr-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF5500]/50"
                                    />
                                </div>
                            </div>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50 cursor-pointer"
                            >
                                <option value="">All Statuses</option>
                                {EVENT_STATUSES.map((status) => (
                                    <option key={status} value={status}>{status}</option>
                                ))}
                            </select>
                            <select
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                                className="px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50 cursor-pointer"
                            >
                                <option value="">All Types</option>
                                {EVENT_TYPES.map((type) => (
                                    <option key={type} value={type}>{EVENT_TYPE_ICONS[type]} {type}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Events Grid */}
                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="bg-zinc-900/50 rounded-xl h-48 animate-pulse border border-zinc-800" />
                            ))}
                        </div>
                    ) : events.length === 0 ? (
                        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-12 text-center">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center">
                                <span className="text-3xl">📅</span>
                            </div>
                            <p className="text-zinc-400 mb-4">No events found. Add some events or scrape from a URL.</p>
                            <div className="flex justify-center gap-3">
                                <button
                                    onClick={() => setShowScrapeModal(true)}
                                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                                >
                                    🔍 Scrape Events
                                </button>
                                <button
                                    onClick={() => { resetForm(); setEditingEvent(null); setShowAddModal(true); }}
                                    className="px-4 py-2 bg-[#FF5500] hover:bg-[#e04d00] text-white rounded-lg transition-colors"
                                >
                                    ➕ Add Event
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {events.map((event) => (
                                <div 
                                    key={event.id} 
                                    className={`bg-zinc-900/50 rounded-xl border overflow-hidden hover:border-[#FF5500]/30 transition-all ${event.is_featured ? "border-[#FF5500]/40" : "border-zinc-800"}`}
                                >
                                    {/* Card Header */}
                                    <div className="p-4 border-b border-zinc-800">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-xl shrink-0">
                                                    {EVENT_TYPE_ICONS[event.event_type]}
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="font-semibold text-white truncate flex items-center gap-2">
                                                        {event.name}
                                                        {event.is_featured && <span className="text-yellow-500 shrink-0">⭐</span>}
                                                    </h3>
                                                    <p className="text-xs text-zinc-500">{event.event_type}</p>
                                                </div>
                                            </div>
                                            <select
                                                value={event.status}
                                                onChange={(e) => toggleStatus(event, e.target.value)}
                                                className={`px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[event.status]} bg-transparent border border-current cursor-pointer shrink-0`}
                                            >
                                                {EVENT_STATUSES.map((status) => (
                                                    <option key={status} value={status}>{status}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    
                                    {/* Card Body */}
                                    <div className="p-4 space-y-2">
                                        <div className="flex items-center gap-2 text-sm text-zinc-400">
                                            <span className="text-[#FF5500]">📅</span>
                                            <span>{formatDate(event.event_date)}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-zinc-400">
                                            <span className="text-[#FF5500]">📍</span>
                                            <span>{event.city || event.is_virtual ? (event.is_virtual ? "Virtual" : event.city) : "TBA"}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-zinc-500">
                                            <span>🔗</span>
                                            <span>Source: {event.source}</span>
                                        </div>
                                    </div>
                                    
                                    {/* Card Actions */}
                                    <div className="p-4 pt-0 flex gap-2">
                                        <button
                                            onClick={() => openEditModal(event)}
                                            className="flex-1 px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                                        >
                                            ✏️ Edit
                                        </button>
                                        <button
                                            onClick={() => handleDelete(event.id)}
                                            className="px-3 py-2 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Add/Edit Event Modal */}
                <AnimatePresence>
                    {showAddModal && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                            onClick={() => setShowAddModal(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-zinc-900 rounded-2xl border border-zinc-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                            >
                                <div className="p-6 border-b border-zinc-800">
                                    <h2 className="text-xl font-bold text-white">
                                        {editingEvent ? "Edit Event" : "Add New Event"}
                                    </h2>
                                </div>
                                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="col-span-2">
                                            <label className="block text-sm text-zinc-400 mb-1">Event Name *</label>
                                            <input
                                                type="text"
                                                required
                                                value={formData.name}
                                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">Event Type *</label>
                                            <select
                                                required
                                                value={formData.event_type}
                                                onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
                                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            >
                                                {EVENT_TYPES.map((type) => (
                                                    <option key={type} value={type}>{EVENT_TYPE_ICONS[type]} {type}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">Status</label>
                                            <select
                                                value={formData.status}
                                                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            >
                                                {EVENT_STATUSES.map((status) => (
                                                    <option key={status} value={status}>{status}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">Date *</label>
                                            <input
                                                type="date"
                                                required
                                                value={formData.event_date}
                                                onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-sm text-zinc-400 mb-1">Start Time</label>
                                                <input
                                                    type="time"
                                                    value={formData.start_time}
                                                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                                                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm text-zinc-400 mb-1">End Time</label>
                                                <input
                                                    type="time"
                                                    value={formData.end_time}
                                                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                                                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">Venue</label>
                                            <input
                                                type="text"
                                                value={formData.venue}
                                                onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">City</label>
                                            <input
                                                type="text"
                                                value={formData.city}
                                                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">Country</label>
                                            <input
                                                type="text"
                                                value={formData.country}
                                                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">Organizer</label>
                                            <input
                                                type="text"
                                                value={formData.organizer}
                                                onChange={(e) => setFormData({ ...formData, organizer: e.target.value })}
                                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">Event URL</label>
                                            <input
                                                type="url"
                                                value={formData.event_url}
                                                onChange={(e) => setFormData({ ...formData, event_url: e.target.value })}
                                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">RSVP/Registration URL</label>
                                            <input
                                                type="url"
                                                value={formData.rsvp_url}
                                                onChange={(e) => setFormData({ ...formData, rsvp_url: e.target.value })}
                                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-sm text-zinc-400 mb-1">Description</label>
                                            <textarea
                                                value={formData.description}
                                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                                rows={3}
                                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white resize-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">Blockchain Focus (comma-separated)</label>
                                            <input
                                                type="text"
                                                placeholder="ethereum, solana, bitcoin"
                                                value={formData.blockchain_focus}
                                                onChange={(e) => setFormData({ ...formData, blockchain_focus: e.target.value })}
                                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">Tags (comma-separated)</label>
                                            <input
                                                type="text"
                                                placeholder="defi, nft, web3"
                                                value={formData.tags}
                                                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            />
                                        </div>
                                        <div className="col-span-2 flex flex-wrap gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.is_virtual}
                                                    onChange={(e) => setFormData({ ...formData, is_virtual: e.target.checked })}
                                                    className="rounded border-zinc-600 bg-zinc-800 text-purple-500"
                                                />
                                                <span className="text-zinc-300">Virtual Event</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.is_featured}
                                                    onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
                                                    className="rounded border-zinc-600 bg-zinc-800 text-purple-500"
                                                />
                                                <span className="text-zinc-300">Featured ⭐</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.registration_enabled}
                                                    onChange={(e) => setFormData({ ...formData, registration_enabled: e.target.checked })}
                                                    className="rounded border-zinc-600 bg-zinc-800 text-purple-500"
                                                />
                                                <span className="text-zinc-300">Enable Spritz Registration</span>
                                            </label>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                                        <button
                                            type="button"
                                            onClick={() => setShowAddModal(false)}
                                            className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg transition-colors"
                                        >
                                            {editingEvent ? "Save Changes" : "Add Event"}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Scrape Modal */}
                <AnimatePresence>
                    {showScrapeModal && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                            onClick={() => setShowScrapeModal(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-zinc-900 rounded-2xl border border-zinc-800 w-full max-w-lg"
                            >
                                <div className="p-6 border-b border-zinc-800">
                                    <h2 className="text-xl font-bold text-white">Scrape Events</h2>
                                    <p className="text-sm text-zinc-400 mt-1">
                                        Extract events from a webpage using Firecrawl + AI
                                    </p>
                                </div>
                                <form onSubmit={handleScrape} className="p-6 space-y-4">
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">URL to Scrape *</label>
                                        <input
                                            type="url"
                                            required
                                            value={scrapeUrl}
                                            onChange={(e) => setScrapeUrl(e.target.value)}
                                            placeholder="https://example.com/events"
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">Filter by Event Types</label>
                                        <div className="flex flex-wrap gap-2">
                                            {EVENT_TYPES.map((type) => (
                                                <label key={type} className="flex items-center gap-1 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={scrapeEventTypes.includes(type)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setScrapeEventTypes([...scrapeEventTypes, type]);
                                                            } else {
                                                                setScrapeEventTypes(scrapeEventTypes.filter((t) => t !== type));
                                                            }
                                                        }}
                                                        className="rounded border-zinc-600 bg-zinc-800 text-purple-500"
                                                    />
                                                    <span className="text-sm text-zinc-300">{EVENT_TYPE_ICONS[type]} {type}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={saveSource}
                                            onChange={(e) => setSaveSource(e.target.checked)}
                                            className="rounded border-zinc-600 bg-zinc-800 text-purple-500"
                                        />
                                        <span className="text-zinc-300">Save source for recurring scrapes</span>
                                    </label>

                                    {scrapeResult && (
                                        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                                            <p className="text-green-400">
                                                ✅ Extracted {scrapeResult.extracted} events, inserted {scrapeResult.inserted}, skipped {scrapeResult.skipped}
                                            </p>
                                        </div>
                                    )}

                                    <div className="flex justify-end gap-3 pt-4">
                                        <button
                                            type="button"
                                            onClick={() => setShowScrapeModal(false)}
                                            className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isScraping}
                                            className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {isScraping ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    Scraping...
                                                </>
                                            ) : (
                                                "🔍 Scrape Events"
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </AdminLayout>
        </AdminAuthWrapper>
    );
}
