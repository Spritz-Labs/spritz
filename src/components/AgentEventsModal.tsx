"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { hasRegistration } from "@/lib/eventUtils";
import { EventRegistrationButton } from "./EventRegistrationButton";

interface AgentEvent {
    id: string;
    name: string;
    description: string | null;
    event_type: string | null;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    venue: string | null;
    organizer: string | null;
    event_url: string | null;
    rsvp_url: string | null;
    source: string | null;
    is_featured: boolean;
}

interface AgentEventsModalProps {
    isOpen: boolean;
    onClose: () => void;
    agentId: string;
    agentName: string;
    userAddress: string;
}

const EVENT_TYPES = [
    { value: "conference", label: "🎤 Conference" },
    { value: "summit", label: "🏔️ Summit" },
    { value: "meetup", label: "🤝 Meetup" },
    { value: "party", label: "🎉 Party" },
    { value: "hackathon", label: "💻 Hackathon" },
    { value: "workshop", label: "🛠️ Workshop" },
    { value: "networking", label: "🌐 Networking" },
    { value: "wellness", label: "🧘 Wellness" },
    { value: "other", label: "📅 Other" },
];

const SOURCE_TYPES = [
    { value: "official", label: "Official" },
    { value: "community", label: "Community" },
    { value: "sponsor", label: "Sponsor" },
];

export default function AgentEventsModal({
    isOpen,
    onClose,
    agentId,
    agentName,
    userAddress,
}: AgentEventsModalProps) {
    const [events, setEvents] = useState<AgentEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [extracting, setExtracting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    
    // Filter state
    const [filterDate, setFilterDate] = useState<string>("");
    const [filterType, setFilterType] = useState<string>("");
    
    // Add/Edit modal state
    const [showAddEdit, setShowAddEdit] = useState(false);
    const [editingEvent, setEditingEvent] = useState<AgentEvent | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        event_type: "other",
        event_date: "",
        start_time: "",
        end_time: "",
        venue: "",
        organizer: "",
        event_url: "",
        rsvp_url: "",
        source: "community",
        is_featured: false,
    });

    // Fetch events
    const fetchEvents = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (filterDate) params.append("date", filterDate);
            if (filterType) params.append("type", filterType);
            
            const res = await fetch(`/api/agents/${agentId}/events?${params}`);
            if (res.ok) {
                const data = await res.json();
                setEvents(data.events || []);
            } else {
                const data = await res.json();
                setError(data.error || "Failed to fetch events");
            }
        } catch (err) {
            setError("Failed to fetch events");
        } finally {
            setLoading(false);
        }
    }, [agentId, filterDate, filterType]);

    useEffect(() => {
        if (isOpen) {
            fetchEvents();
        }
    }, [isOpen, fetchEvents]);

    // Extract events from knowledge base
    const handleExtract = async () => {
        setExtracting(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch(`/api/agents/${agentId}/events/extract`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userAddress, year: 2026 }),
            });
            
            if (res.ok) {
                const data = await res.json();
                setSuccess(`Extracted ${data.extracted} events (${data.inserted} new, ${data.skipped} duplicates)`);
                fetchEvents();
            } else {
                const data = await res.json();
                setError(data.error || "Failed to extract events");
            }
        } catch (err) {
            setError("Failed to extract events");
        } finally {
            setExtracting(false);
        }
    };

    // Toggle featured status
    const handleToggleFeatured = async (event: AgentEvent) => {
        try {
            const res = await fetch(`/api/agents/${agentId}/events/${event.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    userAddress, 
                    is_featured: !event.is_featured 
                }),
            });
            
            if (res.ok) {
                setEvents(prev => prev.map(e => 
                    e.id === event.id ? { ...e, is_featured: !e.is_featured } : e
                ));
            }
        } catch (err) {
            console.error("Failed to toggle featured:", err);
        }
    };

    // Delete event
    const handleDelete = async (eventId: string) => {
        if (!confirm("Delete this event?")) return;
        
        try {
            const res = await fetch(
                `/api/agents/${agentId}/events?userAddress=${userAddress}&eventId=${eventId}`,
                { method: "DELETE" }
            );
            
            if (res.ok) {
                setEvents(prev => prev.filter(e => e.id !== eventId));
                setSuccess("Event deleted");
            }
        } catch (err) {
            setError("Failed to delete event");
        }
    };

    // Open add/edit modal
    const openAddEdit = (event?: AgentEvent) => {
        if (event) {
            setEditingEvent(event);
            setFormData({
                name: event.name,
                description: event.description || "",
                event_type: event.event_type || "other",
                event_date: event.event_date,
                start_time: event.start_time || "",
                end_time: event.end_time || "",
                venue: event.venue || "",
                organizer: event.organizer || "",
                event_url: event.event_url || "",
                rsvp_url: event.rsvp_url || "",
                source: event.source || "community",
                is_featured: event.is_featured,
            });
        } else {
            setEditingEvent(null);
            setFormData({
                name: "",
                description: "",
                event_type: "other",
                event_date: "",
                start_time: "",
                end_time: "",
                venue: "",
                organizer: "",
                event_url: "",
                rsvp_url: "",
                source: "community",
                is_featured: false,
            });
        }
        setShowAddEdit(true);
    };

    // Save event (add or edit)
    const handleSave = async () => {
        if (!formData.name || !formData.event_date) {
            setError("Name and date are required");
            return;
        }

        try {
            if (editingEvent) {
                // Update existing
                const res = await fetch(`/api/agents/${agentId}/events/${editingEvent.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userAddress, ...formData }),
                });
                
                if (res.ok) {
                    const data = await res.json();
                    setEvents(prev => prev.map(e => 
                        e.id === editingEvent.id ? data.event : e
                    ));
                    setSuccess("Event updated");
                    setShowAddEdit(false);
                } else {
                    const data = await res.json();
                    setError(data.error || "Failed to update event");
                }
            } else {
                // Create new
                const res = await fetch(`/api/agents/${agentId}/events`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userAddress, event: formData }),
                });
                
                if (res.ok) {
                    const data = await res.json();
                    setEvents(prev => [...prev, data.event]);
                    setSuccess("Event added");
                    setShowAddEdit(false);
                } else {
                    const data = await res.json();
                    setError(data.error || "Failed to add event");
                }
            }
        } catch (err) {
            setError("Failed to save event");
        }
    };

    // Format time for display
    const formatTime = (time: string | null) => {
        if (!time) return "";
        try {
            const [hours, minutes] = time.split(":");
            const hour = parseInt(hours);
            const ampm = hour >= 12 ? "PM" : "AM";
            const hour12 = hour % 12 || 12;
            return `${hour12}:${minutes} ${ampm}`;
        } catch {
            return time;
        }
    };

    // Get unique dates for filter
    const uniqueDates = [...new Set(events.map(e => e.event_date))].sort();

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-zinc-900 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden border border-zinc-800 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-white">📅 Event Management</h2>
                            <p className="text-sm text-zinc-400">{agentName} • {events.length} events</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                            <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Toolbar */}
                    <div className="px-6 py-3 border-b border-zinc-800 flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleExtract}
                            disabled={extracting}
                            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-purple-500/50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            {extracting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Extracting...
                                </>
                            ) : (
                                <>
                                    🤖 Extract from Knowledge
                                </>
                            )}
                        </button>
                        
                        <button
                            onClick={() => openAddEdit()}
                            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            + Add Event
                        </button>

                        <div className="flex-1" />

                        {/* Filters */}
                        <select
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
                        >
                            <option value="">All Dates</option>
                            {uniqueDates.map(date => (
                                <option key={date} value={date}>{date}</option>
                            ))}
                        </select>

                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white"
                        >
                            <option value="">All Types</option>
                            {EVENT_TYPES.map(type => (
                                <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Messages */}
                    {error && (
                        <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="mx-6 mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm">
                            {success}
                        </div>
                    )}

                    {/* Events List */}
                    <div className="p-6 overflow-y-auto max-h-[calc(85vh-200px)]">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                            </div>
                        ) : events.length === 0 ? (
                            <div className="text-center py-12 text-zinc-500">
                                <div className="text-4xl mb-3">📅</div>
                                <p>No events yet</p>
                                <p className="text-sm mt-1">Click "Extract from Knowledge" to auto-populate events</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {events.map(event => (
                                    <div
                                        key={event.id}
                                        className={`p-4 rounded-xl border transition-all ${
                                            event.is_featured 
                                                ? "bg-purple-500/10 border-purple-500/30" 
                                                : "bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600"
                                        }`}
                                    >
                                        <div className="flex items-start gap-4">
                                            {/* Event Type Icon */}
                                            <div className="text-2xl flex-shrink-0">
                                                {EVENT_TYPES.find(t => t.value === event.event_type)?.label.split(" ")[0] || "📅"}
                                            </div>

                                            {/* Event Details */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    {event.is_featured && (
                                                        <span className="px-2 py-0.5 bg-purple-500 text-white text-xs rounded-full">⭐ Featured</span>
                                                    )}
                                                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                                                        event.source === "official" ? "bg-blue-500/20 text-blue-400" :
                                                        event.source === "sponsor" ? "bg-amber-500/20 text-amber-400" :
                                                        "bg-zinc-700 text-zinc-300"
                                                    }`}>
                                                        {event.source || "community"}
                                                    </span>
                                                </div>
                                                
                                                <h3 className="font-semibold text-white truncate">{event.name}</h3>
                                                
                                                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-zinc-400">
                                                    <span>📅 {event.event_date}</span>
                                                    {event.start_time && (
                                                        <span>
                                                            🕐 {formatTime(event.start_time)}
                                                            {event.end_time && ` - ${formatTime(event.end_time)}`}
                                                        </span>
                                                    )}
                                                    {event.venue && <span>📍 {event.venue}</span>}
                                                    {event.organizer && <span>🏢 {event.organizer}</span>}
                                                </div>
                                                
                                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                                    {hasRegistration(event) && (
                                                        <EventRegistrationButton
                                                            eventUrl={event.rsvp_url || event.event_url || ""}
                                                            eventId={event.id}
                                                            agentId={agentId}
                                                            className="text-xs"
                                                        />
                                                    )}
                                                    {event.event_url && (
                                                        <a
                                                            href={event.event_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-xs text-purple-400 hover:text-purple-300 truncate max-w-full"
                                                        >
                                                            🔗 {event.event_url}
                                                        </a>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <button
                                                    onClick={() => handleToggleFeatured(event)}
                                                    className={`p-2 rounded-lg transition-colors ${
                                                        event.is_featured 
                                                            ? "bg-purple-500 text-white" 
                                                            : "bg-zinc-700 text-zinc-400 hover:text-yellow-400"
                                                    }`}
                                                    title={event.is_featured ? "Unfeature" : "Feature"}
                                                >
                                                    ⭐
                                                </button>
                                                <button
                                                    onClick={() => openAddEdit(event)}
                                                    className="p-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-400 hover:text-white rounded-lg transition-colors"
                                                    title="Edit"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(event.id)}
                                                    className="p-2 bg-zinc-700 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 rounded-lg transition-colors"
                                                    title="Delete"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Public Events Page Link */}
                    <div className="px-6 py-3 border-t border-zinc-800 flex items-center justify-between">
                        <a
                            href={`/agent/${agentId}/events`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
                        >
                            View public events page →
                        </a>
                        <span className="text-xs text-zinc-500">
                            {events.filter(e => e.is_featured).length} featured • {uniqueDates.length} days
                        </span>
                    </div>
                </motion.div>

                {/* Add/Edit Modal */}
                <AnimatePresence>
                    {showAddEdit && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/60 z-60 flex items-center justify-center p-4"
                            onClick={() => setShowAddEdit(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="bg-zinc-900 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto border border-zinc-800"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="px-6 py-4 border-b border-zinc-800">
                                    <h3 className="text-lg font-bold text-white">
                                        {editingEvent ? "Edit Event" : "Add Event"}
                                    </h3>
                                </div>
                                
                                <div className="p-6 space-y-4">
                                    {/* Name */}
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">Event Name *</label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            placeholder="e.g., Builder Nights Denver"
                                        />
                                    </div>

                                    {/* Date & Time */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">Date *</label>
                                            <input
                                                type="date"
                                                value={formData.event_date}
                                                onChange={(e) => setFormData(prev => ({ ...prev, event_date: e.target.value }))}
                                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">Start Time</label>
                                            <input
                                                type="time"
                                                value={formData.start_time}
                                                onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">End Time</label>
                                            <input
                                                type="time"
                                                value={formData.end_time}
                                                onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            />
                                        </div>
                                    </div>

                                    {/* Type & Source */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">Event Type</label>
                                            <select
                                                value={formData.event_type}
                                                onChange={(e) => setFormData(prev => ({ ...prev, event_type: e.target.value }))}
                                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            >
                                                {EVENT_TYPES.map(type => (
                                                    <option key={type.value} value={type.value}>{type.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">Source</label>
                                            <select
                                                value={formData.source}
                                                onChange={(e) => setFormData(prev => ({ ...prev, source: e.target.value }))}
                                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            >
                                                {SOURCE_TYPES.map(type => (
                                                    <option key={type.value} value={type.value}>{type.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Venue & Organizer */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">Venue</label>
                                            <input
                                                type="text"
                                                value={formData.venue}
                                                onChange={(e) => setFormData(prev => ({ ...prev, venue: e.target.value }))}
                                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                                placeholder="e.g., Stockyards Event Center"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-zinc-400 mb-1">Organizer</label>
                                            <input
                                                type="text"
                                                value={formData.organizer}
                                                onChange={(e) => setFormData(prev => ({ ...prev, organizer: e.target.value }))}
                                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                                placeholder="e.g., MetaMask"
                                            />
                                        </div>
                                    </div>

                                    {/* Event URL */}
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">Event URL</label>
                                        <input
                                            type="url"
                                            value={formData.event_url}
                                            onChange={(e) => setFormData(prev => ({ ...prev, event_url: e.target.value }))}
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            placeholder="https://..."
                                        />
                                    </div>

                                    {/* RSVP/Registration URL */}
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">
                                            Registration URL (RSVP)
                                            <span className="text-zinc-500 text-xs ml-1">(e.g., Luma registration link)</span>
                                        </label>
                                        <input
                                            type="url"
                                            value={formData.rsvp_url}
                                            onChange={(e) => setFormData(prev => ({ ...prev, rsvp_url: e.target.value }))}
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            placeholder="https://lu.ma/event-slug or registration URL"
                                        />
                                        <p className="text-xs text-zinc-500 mt-1">
                                            If left empty and Event URL is a Luma link, it will be used for registration
                                        </p>
                                    </div>

                                    {/* Description */}
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">Description</label>
                                        <textarea
                                            value={formData.description}
                                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white resize-none"
                                            rows={3}
                                            placeholder="Brief description..."
                                        />
                                    </div>

                                    {/* Featured */}
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.is_featured}
                                            onChange={(e) => setFormData(prev => ({ ...prev, is_featured: e.target.checked }))}
                                            className="w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500"
                                        />
                                        <span className="text-white">⭐ Featured Event</span>
                                    </label>
                                </div>

                                <div className="px-6 py-4 border-t border-zinc-800 flex gap-3 justify-end">
                                    <button
                                        onClick={() => setShowAddEdit(false)}
                                        className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium"
                                    >
                                        {editingEvent ? "Save Changes" : "Add Event"}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </AnimatePresence>
    );
}
