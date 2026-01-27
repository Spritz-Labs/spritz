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

interface EventSource {
    id: string;
    name: string;
    url: string;
    source_type: string;
    scrape_interval_hours: number;
    last_scraped_at: string | null;
    next_scrape_at: string | null;
    is_active: boolean;
    events_found: number;
    last_error: string | null;
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

const SCRAPE_INTERVALS = [
    { value: 6, label: "Every 6 hours" },
    { value: 12, label: "Every 12 hours" },
    { value: 24, label: "Daily" },
    { value: 72, label: "Every 3 days" },
    { value: 168, label: "Weekly" },
];

const SOURCE_TYPES = [
    { value: "event_calendar", label: "📅 Event Calendar" },
    { value: "conference_list", label: "🎤 Conference List" },
    { value: "hackathon_list", label: "💻 Hackathon List" },
    { value: "organization_page", label: "🏢 Organization Page" },
];

const CRAWL_DEPTHS = [
    { value: 1, label: "Single page only", description: "Just the URL you enter" },
    { value: 2, label: "Shallow (2 levels)", description: "Main page + linked pages" },
    { value: 3, label: "Medium (3 levels)", description: "Good for event calendars" },
    { value: 4, label: "Deep (4 levels)", description: "Large sites with nested pages" },
];

const MAX_PAGES_OPTIONS = [
    { value: 10, label: "10" },
    { value: 20, label: "20" },
    { value: 50, label: "50" },
    { value: 100, label: "100" },
    { value: 0, label: "∞" },
];

const PAGE_SIZES = [25, 50, 100, 200];

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

export default function AdminEventsPage() {
    const { isAdmin, isReady, getAuthHeaders, address, signOut } = useAdmin();
    const [events, setEvents] = useState<GlobalEvent[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [total, setTotal] = useState(0);

    // Pagination
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const totalPages = Math.ceil(total / pageSize);

    // Bulk selection
    const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
    const [isBulkActionsOpen, setIsBulkActionsOpen] = useState(false);
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);

    // Filters
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [typeFilter, setTypeFilter] = useState<string>("");
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

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
    const [scrapeEventTypes, setScrapeEventTypes] = useState<string[]>(EVENT_TYPES); // All selected by default
    const [saveSource, setSaveSource] = useState(true); // Enable recurring scrapes by default
    const [scrapeInterval, setScrapeInterval] = useState(24); // Default daily
    const [sourceType, setSourceType] = useState("event_calendar");
    const [crawlDepth, setCrawlDepth] = useState(2); // Default shallow crawl
    const [maxPages, setMaxPages] = useState(20); // Default 20 pages
    const [infiniteScroll, setInfiniteScroll] = useState(false); // For lazy-load pages
    const [scrollCount, setScrollCount] = useState(5); // Number of scroll actions
    const [isScraping, setIsScraping] = useState(false);
    const [scrapeResult, setScrapeResult] = useState<{ extracted: number; inserted: number; skipped: number; pagesScraped?: number } | null>(null);
    
    // Event sources state
    const [eventSources, setEventSources] = useState<EventSource[]>([]);
    const [showSourcesPanel, setShowSourcesPanel] = useState(false);
    const [isLoadingSources, setIsLoadingSources] = useState(false);

    const fetchEvents = useCallback(async () => {
        if (!isReady) return;
        setIsLoading(true);

        try {
            const params = new URLSearchParams();
            if (statusFilter) params.set("status", statusFilter);
            if (typeFilter) params.set("type", typeFilter);
            if (searchQuery) params.set("search", searchQuery);
            params.set("limit", pageSize.toString());
            params.set("offset", ((page - 1) * pageSize).toString());

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
    }, [isReady, getAuthHeaders, statusFilter, typeFilter, searchQuery, page, pageSize]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setPage(1);
        setSelectedEvents(new Set());
    }, [statusFilter, typeFilter, searchQuery, pageSize]);

    const fetchEventSources = useCallback(async () => {
        if (!isReady) return;
        setIsLoadingSources(true);

        try {
            const headers = getAuthHeaders();
            if (!headers) return;
            
            const res = await fetch("/api/admin/events/sources", {
                headers,
            });
            const data = await res.json();

            if (data.sources) {
                setEventSources(data.sources);
            }
        } catch (error) {
            console.error("Failed to fetch event sources:", error);
        } finally {
            setIsLoadingSources(false);
        }
    }, [isReady, getAuthHeaders]);

    useEffect(() => {
        fetchEvents();
        fetchEventSources();
    }, [fetchEvents, fetchEventSources]);

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
                    event_types: scrapeEventTypes.length === EVENT_TYPES.length ? undefined : scrapeEventTypes,
                    save_source: saveSource,
                    scrape_interval_hours: scrapeInterval,
                    source_type: sourceType,
                    crawl_depth: crawlDepth,
                    max_pages: maxPages,
                    infinite_scroll: infiniteScroll,
                    scroll_count: scrollCount,
                }),
            });

            const data = await res.json();

            if (data.success) {
                setScrapeResult({
                    extracted: data.extracted,
                    inserted: data.inserted,
                    skipped: data.skipped,
                    pagesScraped: data.pages_scraped,
                });
                fetchEvents();
                if (saveSource) {
                    fetchEventSources();
                }
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

    // Bulk actions
    const toggleSelectAll = () => {
        if (selectedEvents.size === events.length) {
            setSelectedEvents(new Set());
        } else {
            setSelectedEvents(new Set(events.map(e => e.id)));
        }
    };

    const toggleSelectEvent = (id: string) => {
        const newSelected = new Set(selectedEvents);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedEvents(newSelected);
    };

    const handleBulkAction = async (action: "publish" | "draft" | "delete") => {
        if (selectedEvents.size === 0) return;
        
        const confirmMessage = action === "delete" 
            ? `Delete ${selectedEvents.size} event(s)? This cannot be undone.`
            : `Set ${selectedEvents.size} event(s) to "${action}"?`;
        
        if (!confirm(confirmMessage)) return;

        setIsBulkProcessing(true);

        try {
            const res = await fetch("/api/admin/events/bulk", {
                method: "POST",
                headers: {
                    ...(getAuthHeaders() || {}),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    action,
                    event_ids: Array.from(selectedEvents),
                }),
            });

            const data = await res.json();

            if (data.success) {
                setSelectedEvents(new Set());
                setIsBulkActionsOpen(false);
                fetchEvents();
            } else {
                alert(data.error || "Bulk action failed");
            }
        } catch (error) {
            console.error("Bulk action failed:", error);
            alert("Bulk action failed");
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const toggleSourceActive = async (sourceId: string, isActive: boolean) => {
        try {
            const res = await fetch(`/api/admin/events/sources/${sourceId}`, {
                method: "PATCH",
                headers: {
                    ...(getAuthHeaders() || {}),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ is_active: isActive }),
            });

            if (res.ok) {
                fetchEventSources();
            }
        } catch (error) {
            console.error("Failed to update source:", error);
        }
    };

    const deleteSource = async (sourceId: string) => {
        if (!confirm("Delete this scrape source? This won't delete any events already scraped.")) return;
        
        try {
            const res = await fetch(`/api/admin/events/sources/${sourceId}`, {
                method: "DELETE",
                headers: getAuthHeaders() || {},
            });

            if (res.ok) {
                fetchEventSources();
            }
        } catch (error) {
            console.error("Failed to delete source:", error);
        }
    };

    const triggerManualScrape = async (sourceId: string) => {
        try {
            const res = await fetch(`/api/admin/events/sources/${sourceId}/scrape`, {
                method: "POST",
                headers: getAuthHeaders() || {},
            });

            const data = await res.json();
            if (data.success) {
                alert(`Scraped ${data.extracted} events, inserted ${data.inserted}, skipped ${data.skipped}`);
                fetchEvents();
                fetchEventSources();
            } else {
                alert(data.error || "Scrape failed");
            }
        } catch (error) {
            console.error("Failed to trigger scrape:", error);
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

    // Show loading state while checking auth
    if (!isReady) {
        return <AdminLoading />;
    }

    // Show auth wrapper if not admin
    if (!isAdmin) {
        return (
            <AdminAuthWrapper title="Admin Access">
                <p className="text-zinc-400">You must be an admin to access this page.</p>
            </AdminAuthWrapper>
        );
    }

    return (
        <AdminLayout 
            title="Events" 
            subtitle="Manage global events database"
            address={address}
            onSignOut={signOut}
        >
            <div className="space-y-6">
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
                    <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-4">
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

                    {/* Filters & Controls */}
                    <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                        <div className="flex flex-wrap gap-3 items-center">
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
                                        className="w-full pl-10 pr-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF5500]/50"
                                    />
                                </div>
                            </div>

                            {/* Filters */}
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

                            {/* Select All / Deselect All */}
                            {events.length > 0 && (
                                <button
                                    onClick={toggleSelectAll}
                                    className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                                        selectedEvents.size === events.length
                                            ? "bg-[#FF5500]/20 text-[#FF5500] border border-[#FF5500]/40"
                                            : "bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700"
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedEvents.size === events.length && events.length > 0}
                                        onChange={toggleSelectAll}
                                        className="rounded border-zinc-600 bg-zinc-800 text-[#FF5500] focus:ring-[#FF5500]"
                                    />
                                    {selectedEvents.size === events.length ? "Deselect All" : "Select All"}
                                </button>
                            )}

                            {/* View Mode Toggle */}
                            <div className="flex bg-zinc-800 rounded-lg p-1">
                                <button
                                    onClick={() => setViewMode("grid")}
                                    className={`p-2 rounded-md transition-colors ${viewMode === "grid" ? "bg-[#FF5500] text-white" : "text-zinc-400 hover:text-white"}`}
                                    title="Grid View"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => setViewMode("table")}
                                    className={`p-2 rounded-md transition-colors ${viewMode === "table" ? "bg-[#FF5500] text-white" : "text-zinc-400 hover:text-white"}`}
                                    title="Table View"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                    </svg>
                                </button>
                            </div>

                            {/* Page Size */}
                            <select
                                value={pageSize}
                                onChange={(e) => setPageSize(Number(e.target.value))}
                                className="px-3 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white text-sm focus:outline-none focus:border-[#FF5500]/50 cursor-pointer"
                            >
                                {PAGE_SIZES.map((size) => (
                                    <option key={size} value={size}>{size} per page</option>
                                ))}
                            </select>
                        </div>

                        {/* Bulk Actions Bar */}
                        <AnimatePresence>
                            {selectedEvents.size > 0 && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-zinc-700">
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm text-[#FF5500] font-medium">
                                                {selectedEvents.size} event{selectedEvents.size !== 1 ? "s" : ""} selected
                                            </span>
                                            <button
                                                onClick={() => setSelectedEvents(new Set())}
                                                className="text-xs text-zinc-400 hover:text-white transition-colors"
                                            >
                                                Clear selection
                                            </button>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleBulkAction("publish")}
                                                disabled={isBulkProcessing}
                                                className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-sm font-medium hover:bg-green-500/30 transition-colors disabled:opacity-50"
                                            >
                                                ✓ Publish All
                                            </button>
                                            <button
                                                onClick={() => handleBulkAction("draft")}
                                                disabled={isBulkProcessing}
                                                className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-lg text-sm font-medium hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
                                            >
                                                📝 Set Draft
                                            </button>
                                            <button
                                                onClick={() => handleBulkAction("delete")}
                                                disabled={isBulkProcessing}
                                                className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50"
                                            >
                                                🗑️ Delete
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Events Display */}
                    {isLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                            {[...Array(10)].map((_, i) => (
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
                    ) : viewMode === "table" ? (
                        /* Table View */
                        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-zinc-800 bg-zinc-800/50">
                                            <th className="p-3 text-left">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedEvents.size === events.length && events.length > 0}
                                                    onChange={toggleSelectAll}
                                                    className="rounded border-zinc-600 bg-zinc-800 text-[#FF5500] focus:ring-[#FF5500]"
                                                />
                                            </th>
                                            <th className="p-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Event</th>
                                            <th className="p-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Type</th>
                                            <th className="p-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Date</th>
                                            <th className="p-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Location</th>
                                            <th className="p-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Status</th>
                                            <th className="p-3 text-left text-xs font-medium text-zinc-400 uppercase tracking-wider">Source</th>
                                            <th className="p-3 text-right text-xs font-medium text-zinc-400 uppercase tracking-wider">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800">
                                        {events.map((event) => (
                                            <tr 
                                                key={event.id} 
                                                className={`hover:bg-zinc-800/30 transition-colors ${selectedEvents.has(event.id) ? "bg-[#FF5500]/5" : ""}`}
                                            >
                                                <td className="p-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedEvents.has(event.id)}
                                                        onChange={() => toggleSelectEvent(event.id)}
                                                        className="rounded border-zinc-600 bg-zinc-800 text-[#FF5500] focus:ring-[#FF5500]"
                                                    />
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-lg">{EVENT_TYPE_ICONS[event.event_type]}</span>
                                                        <div>
                                                            <p className="font-medium text-white flex items-center gap-1">
                                                                {event.name}
                                                                {event.is_featured && <span className="text-yellow-500 text-xs">⭐</span>}
                                                            </p>
                                                            {event.organizer && (
                                                                <p className="text-xs text-zinc-500">{event.organizer}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-3">
                                                    <span className="text-sm text-zinc-400 capitalize">{event.event_type}</span>
                                                </td>
                                                <td className="p-3">
                                                    <span className="text-sm text-zinc-300">{formatDate(event.event_date)}</span>
                                                </td>
                                                <td className="p-3">
                                                    <span className="text-sm text-zinc-400">
                                                        {event.is_virtual ? "🌐 Virtual" : event.city || "TBA"}
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    <select
                                                        value={event.status}
                                                        onChange={(e) => toggleStatus(event, e.target.value)}
                                                        className={`px-2 py-1 rounded-lg text-xs font-medium ${STATUS_COLORS[event.status]} bg-transparent border border-current cursor-pointer`}
                                                    >
                                                        {EVENT_STATUSES.map((status) => (
                                                            <option key={status} value={status}>{status}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td className="p-3">
                                                    <span className="text-xs text-zinc-500">{event.source}</span>
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex justify-end gap-1">
                                                        <button
                                                            onClick={() => openEditModal(event)}
                                                            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"
                                                            title="Edit"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(event.id)}
                                                            className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                            title="Delete"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        /* Grid View */
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                            {events.map((event) => (
                                <div 
                                    key={event.id} 
                                    className={`bg-zinc-900/50 rounded-xl border overflow-hidden hover:border-[#FF5500]/30 transition-all relative ${
                                        event.is_featured ? "border-[#FF5500]/40" : "border-zinc-800"
                                    } ${selectedEvents.has(event.id) ? "ring-2 ring-[#FF5500]" : ""}`}
                                >
                                    {/* Selection Checkbox */}
                                    <div className="absolute top-3 left-3 z-10">
                                        <input
                                            type="checkbox"
                                            checked={selectedEvents.has(event.id)}
                                            onChange={() => toggleSelectEvent(event.id)}
                                            className="rounded border-zinc-600 bg-zinc-800/80 text-[#FF5500] focus:ring-[#FF5500]"
                                        />
                                    </div>

                                    {/* Card Header */}
                                    <div className="p-4 border-b border-zinc-800 pl-10">
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

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                            <div className="text-sm text-zinc-400">
                                Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, total)} of {total} events
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setPage(1)}
                                    disabled={page === 1}
                                    className="p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    title="First page"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    title="Previous page"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>
                                
                                <div className="flex items-center gap-1 px-2">
                                    {[...Array(Math.min(5, totalPages))].map((_, i) => {
                                        let pageNum: number;
                                        if (totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if (page <= 3) {
                                            pageNum = i + 1;
                                        } else if (page >= totalPages - 2) {
                                            pageNum = totalPages - 4 + i;
                                        } else {
                                            pageNum = page - 2 + i;
                                        }
                                        
                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => setPage(pageNum)}
                                                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                                                    page === pageNum
                                                        ? "bg-[#FF5500] text-white"
                                                        : "bg-zinc-800 text-zinc-400 hover:text-white"
                                                }`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>

                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    title="Next page"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => setPage(totalPages)}
                                    disabled={page === totalPages}
                                    className="p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    title="Last page"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </div>
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
                                                    className="rounded border-zinc-600 bg-zinc-800 text-[#FF5500] focus:ring-[#FF5500]"
                                                />
                                                <span className="text-zinc-300">Virtual Event</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.is_featured}
                                                    onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
                                                    className="rounded border-zinc-600 bg-zinc-800 text-[#FF5500] focus:ring-[#FF5500]"
                                                />
                                                <span className="text-zinc-300">Featured ⭐</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.registration_enabled}
                                                    onChange={(e) => setFormData({ ...formData, registration_enabled: e.target.checked })}
                                                    className="rounded border-zinc-600 bg-zinc-800 text-[#FF5500] focus:ring-[#FF5500]"
                                                />
                                                <span className="text-zinc-300">Enable Spritz Registration</span>
                                            </label>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
                                        <button
                                            type="button"
                                            onClick={() => setShowAddModal(false)}
                                            className="px-4 py-2.5 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-6 py-2.5 bg-gradient-to-r from-[#FF5500] to-[#e04d00] hover:from-[#FF6600] hover:to-[#FF5500] text-white rounded-xl font-medium transition-all shadow-lg shadow-[#FF5500]/20"
                                        >
                                            {editingEvent ? "Save Changes" : "Add Event"}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Scrape Modal - Spritz Branded */}
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
                                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 rounded-2xl border border-zinc-800 w-full max-w-xl shadow-2xl shadow-black/50 overflow-hidden"
                            >
                                {/* Header with Spritz accent */}
                                <div className="relative p-6 border-b border-zinc-800 bg-gradient-to-r from-[#FF5500]/10 to-transparent">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#FF5500] to-[#FF5500]/30" />
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-[#FF5500]/20 flex items-center justify-center">
                                            <svg className="w-5 h-5 text-[#FF5500]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-white">Scrape Events</h2>
                                            <p className="text-sm text-zinc-400">
                                                AI-powered event extraction with Firecrawl
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <form onSubmit={handleScrape} className="p-6 space-y-5">
                                    {/* URL Input */}
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                                            URL to Scrape
                                        </label>
                                        <div className="relative">
                                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                                </svg>
                                            </div>
                                            <input
                                                type="url"
                                                required
                                                value={scrapeUrl}
                                                onChange={(e) => setScrapeUrl(e.target.value)}
                                                placeholder="https://cryptonomads.org/events"
                                                className="w-full pl-10 pr-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF5500]/50 focus:border-[#FF5500]/50 transition-all"
                                            />
                                        </div>
                                    </div>

                                    {/* Event Types - All selected by default */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-sm font-medium text-zinc-300">
                                                Event Types
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setScrapeEventTypes(
                                                    scrapeEventTypes.length === EVENT_TYPES.length ? [] : EVENT_TYPES
                                                )}
                                                className="text-xs text-[#FF5500] hover:text-[#FF5500]/80 transition-colors"
                                            >
                                                {scrapeEventTypes.length === EVENT_TYPES.length ? "Deselect All" : "Select All"}
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                            {EVENT_TYPES.map((type) => {
                                                const isSelected = scrapeEventTypes.includes(type);
                                                return (
                                                    <button
                                                        key={type}
                                                        type="button"
                                                        onClick={() => {
                                                            if (isSelected) {
                                                                setScrapeEventTypes(scrapeEventTypes.filter((t) => t !== type));
                                                            } else {
                                                                setScrapeEventTypes([...scrapeEventTypes, type]);
                                                            }
                                                        }}
                                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                                                            isSelected
                                                                ? "bg-[#FF5500]/20 text-[#FF5500] border border-[#FF5500]/40"
                                                                : "bg-zinc-800/50 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                                                        }`}
                                                    >
                                                        <span>{EVENT_TYPE_ICONS[type]}</span>
                                                        <span className="capitalize">{type}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <p className="text-xs text-zinc-500 mt-2">
                                            {scrapeEventTypes.length === EVENT_TYPES.length 
                                                ? "✨ Grabbing all event types for maximum coverage" 
                                                : `Filtering to ${scrapeEventTypes.length} type(s)`}
                                        </p>
                                    </div>

                                    {/* Firecrawl Depth Settings */}
                                    <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-700/50">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="w-6 h-6 rounded-lg bg-[#FF5500]/20 flex items-center justify-center">
                                                <svg className="w-3.5 h-3.5 text-[#FF5500]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                                                </svg>
                                            </div>
                                            <span className="text-sm font-medium text-zinc-200">Crawl Depth</span>
                                        </div>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-xs text-zinc-400 mb-1 block">How deep to crawl</label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {CRAWL_DEPTHS.map((depth) => (
                                                        <button
                                                            key={depth.value}
                                                            type="button"
                                                            onClick={() => setCrawlDepth(depth.value)}
                                                            className={`p-3 rounded-lg text-left transition-all ${
                                                                crawlDepth === depth.value
                                                                    ? "bg-[#FF5500]/20 border border-[#FF5500]/40"
                                                                    : "bg-zinc-800/50 border border-zinc-700 hover:border-zinc-600"
                                                            }`}
                                                        >
                                                            <div className="text-sm font-medium text-white">{depth.label}</div>
                                                            <div className="text-xs text-zinc-500">{depth.description}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-xs text-zinc-400 mb-1 block">Max pages to scrape</label>
                                                <div className="flex gap-2">
                                                    {MAX_PAGES_OPTIONS.map((opt) => (
                                                        <button
                                                            key={opt.value}
                                                            type="button"
                                                            onClick={() => setMaxPages(opt.value)}
                                                            className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all ${
                                                                maxPages === opt.value
                                                                    ? "bg-[#FF5500]/20 text-[#FF5500] border border-[#FF5500]/40"
                                                                    : "bg-zinc-800/50 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                                                            }`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <p className="text-xs text-zinc-500">
                                                🔥 Deeper crawls find more events but take longer. Use &quot;Medium&quot; or &quot;Deep&quot; for event calendar sites.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Infinite Scroll Option */}
                                    <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-700/50">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-lg bg-[#FF5500]/20 flex items-center justify-center">
                                                    <svg className="w-3.5 h-3.5 text-[#FF5500]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <span className="text-sm font-medium text-zinc-200">Infinite Scroll Mode</span>
                                                    <p className="text-xs text-zinc-500">For pages that load more content as you scroll</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setInfiniteScroll(!infiniteScroll)}
                                                className={`relative w-11 h-6 rounded-full transition-colors ${
                                                    infiniteScroll ? "bg-[#FF5500]" : "bg-zinc-700"
                                                }`}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                                                    infiniteScroll ? "translate-x-6" : "translate-x-1"
                                                }`} />
                                            </button>
                                        </div>

                                        <AnimatePresence>
                                            {infiniteScroll && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="pt-3 border-t border-zinc-700/50">
                                                        <label className="text-xs text-zinc-400 mb-2 block">Scroll iterations</label>
                                                        <div className="flex flex-wrap gap-2">
                                                            {[5, 10, 25, 50, 100].map((count) => (
                                                                <button
                                                                    key={count}
                                                                    type="button"
                                                                    onClick={() => setScrollCount(count)}
                                                                    className={`px-3 py-2 rounded-lg text-sm transition-all ${
                                                                        scrollCount === count
                                                                            ? "bg-[#FF5500]/20 text-[#FF5500] border border-[#FF5500]/40"
                                                                            : "bg-zinc-800/50 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                                                                    }`}
                                                                >
                                                                    {count}x
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <p className="text-xs text-zinc-500 mt-2">
                                                            📜 Will scroll {scrollCount}x (~{Math.round(scrollCount * 1.5)}s). No auto-detect - use higher values for long feeds.
                                                        </p>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {/* Recurring Scrapes Section */}
                                    <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-700/50">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-lg bg-[#FF5500]/20 flex items-center justify-center">
                                                    <svg className="w-3.5 h-3.5 text-[#FF5500]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                </div>
                                                <span className="text-sm font-medium text-zinc-200">Auto-Scrape Schedule</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setSaveSource(!saveSource)}
                                                className={`relative w-11 h-6 rounded-full transition-colors ${
                                                    saveSource ? "bg-[#FF5500]" : "bg-zinc-700"
                                                }`}
                                            >
                                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                                                    saveSource ? "translate-x-6" : "translate-x-1"
                                                }`} />
                                            </button>
                                        </div>

                                        <AnimatePresence>
                                            {saveSource && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="space-y-3 pt-3 border-t border-zinc-700/50">
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div>
                                                                <label className="text-xs text-zinc-400 mb-1 block">Source Type</label>
                                                                <select
                                                                    value={sourceType}
                                                                    onChange={(e) => setSourceType(e.target.value)}
                                                                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FF5500]/50"
                                                                >
                                                                    {SOURCE_TYPES.map((st) => (
                                                                        <option key={st.value} value={st.value}>{st.label}</option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <div>
                                                                <label className="text-xs text-zinc-400 mb-1 block">Scrape Interval</label>
                                                                <select
                                                                    value={scrapeInterval}
                                                                    onChange={(e) => setScrapeInterval(Number(e.target.value))}
                                                                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#FF5500]/50"
                                                                >
                                                                    {SCRAPE_INTERVALS.map((interval) => (
                                                                        <option key={interval.value} value={interval.value}>
                                                                            {interval.label}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </div>
                                                        <p className="text-xs text-zinc-500">
                                                            🔄 This source will be automatically re-scraped to discover new events
                                                        </p>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {/* Result */}
                                    {scrapeResult && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                                                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <p className="text-green-400 font-medium">Scrape Complete!</p>
                                                    <p className="text-green-400/70 text-sm">
                                                        {scrapeResult.pagesScraped && `Crawled ${scrapeResult.pagesScraped} pages • `}
                                                        Found {scrapeResult.extracted} events • Added {scrapeResult.inserted} • Skipped {scrapeResult.skipped}
                                                    </p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}

                                    {/* Actions */}
                                    <div className="flex justify-between items-center pt-4 border-t border-zinc-800">
                                        <button
                                            type="button"
                                            onClick={() => setShowSourcesPanel(true)}
                                            className="text-sm text-zinc-400 hover:text-[#FF5500] transition-colors flex items-center gap-1.5"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                            </svg>
                                            View {eventSources.length} Saved Source{eventSources.length !== 1 ? "s" : ""}
                                        </button>
                                        <div className="flex gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setShowScrapeModal(false)}
                                                className="px-4 py-2.5 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={isScraping}
                                                className="px-6 py-2.5 bg-gradient-to-r from-[#FF5500] to-[#e04d00] hover:from-[#FF6600] hover:to-[#FF5500] text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-[#FF5500]/20"
                                            >
                                                {isScraping ? (
                                                    <>
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        Scraping...
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                        </svg>
                                                        Scrape Events
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Saved Sources Panel */}
                <AnimatePresence>
                    {showSourcesPanel && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                            onClick={() => setShowSourcesPanel(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 rounded-2xl border border-zinc-800 w-full max-w-2xl max-h-[80vh] shadow-2xl shadow-black/50 overflow-hidden flex flex-col"
                            >
                                {/* Header */}
                                <div className="relative p-6 border-b border-zinc-800 bg-gradient-to-r from-[#FF5500]/10 to-transparent shrink-0">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#FF5500] to-[#FF5500]/30" />
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-[#FF5500]/20 flex items-center justify-center">
                                                <svg className="w-5 h-5 text-[#FF5500]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h2 className="text-xl font-bold text-white">Scheduled Sources</h2>
                                                <p className="text-sm text-zinc-400">
                                                    {eventSources.length} source{eventSources.length !== 1 ? "s" : ""} configured for auto-scraping
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setShowSourcesPanel(false)}
                                            className="p-2 text-zinc-400 hover:text-white transition-colors rounded-lg hover:bg-zinc-800"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Sources List */}
                                <div className="flex-1 overflow-y-auto p-4">
                                    {isLoadingSources ? (
                                        <div className="flex items-center justify-center py-12">
                                            <div className="w-8 h-8 border-2 border-[#FF5500]/30 border-t-[#FF5500] rounded-full animate-spin" />
                                        </div>
                                    ) : eventSources.length === 0 ? (
                                        <div className="text-center py-12">
                                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center">
                                                <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <p className="text-zinc-400 mb-2">No scheduled sources yet</p>
                                            <p className="text-zinc-500 text-sm">Enable &quot;Auto-Scrape Schedule&quot; when scraping to add one</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {eventSources.map((source) => (
                                                <div
                                                    key={source.id}
                                                    className={`p-4 rounded-xl border transition-all ${
                                                        source.is_active 
                                                            ? "bg-zinc-800/50 border-zinc-700" 
                                                            : "bg-zinc-900/50 border-zinc-800 opacity-60"
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-lg">{SOURCE_TYPES.find(s => s.value === source.source_type)?.label.split(" ")[0] || "📅"}</span>
                                                                <h3 className="font-medium text-white truncate">{source.name}</h3>
                                                                {source.is_active ? (
                                                                    <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400">Active</span>
                                                                ) : (
                                                                    <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-700 text-zinc-400">Paused</span>
                                                                )}
                                                            </div>
                                                            <p className="text-sm text-zinc-500 truncate mb-2">{source.url}</p>
                                                            <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
                                                                <span className="flex items-center gap-1">
                                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                    </svg>
                                                                    {SCRAPE_INTERVALS.find(i => i.value === source.scrape_interval_hours)?.label || `${source.scrape_interval_hours}h`}
                                                                </span>
                                                                <span className="flex items-center gap-1">
                                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                                    </svg>
                                                                    {source.events_found} events found
                                                                </span>
                                                                {source.last_scraped_at && (
                                                                    <span>Last: {new Date(source.last_scraped_at).toLocaleDateString()}</span>
                                                                )}
                                                            </div>
                                                            {source.last_error && (
                                                                <p className="text-xs text-red-400 mt-1 truncate">⚠️ {source.last_error}</p>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <button
                                                                onClick={() => triggerManualScrape(source.id)}
                                                                className="p-2 text-zinc-400 hover:text-[#FF5500] transition-colors rounded-lg hover:bg-zinc-700"
                                                                title="Scrape Now"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => toggleSourceActive(source.id, !source.is_active)}
                                                                className={`p-2 rounded-lg transition-colors ${
                                                                    source.is_active 
                                                                        ? "text-green-400 hover:bg-green-500/20" 
                                                                        : "text-zinc-400 hover:bg-zinc-700"
                                                                }`}
                                                                title={source.is_active ? "Pause" : "Activate"}
                                                            >
                                                                {source.is_active ? (
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                    </svg>
                                                                )}
                                                            </button>
                                                            <button
                                                                onClick={() => deleteSource(source.id)}
                                                                className="p-2 text-zinc-400 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
                                                                title="Delete"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 shrink-0">
                                    <p className="text-xs text-zinc-500 text-center">
                                        🔄 Sources are automatically scraped via cron job • Runs every 6 hours
                                    </p>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
        </AdminLayout>
    );
}
