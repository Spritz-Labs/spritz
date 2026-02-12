"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthProvider";
import { SpritzFooter } from "@/components/SpritzFooter";

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

type ManagedEvent = {
    id: string;
    slug: string | null;
    name: string;
    event_type: string;
    event_date: string;
    status: string;
    created_at: string;
    banner_image_url: string | null;
};

type AttendingEvent = {
    id: string;
    slug: string | null;
    name: string;
    event_type: string;
    event_date: string;
    start_time: string | null;
    end_date: string | null;
    venue: string | null;
    city: string | null;
    country: string | null;
    banner_image_url: string | null;
    is_virtual: boolean;
    registration_status: string;
};

export default function ManageEventsPage() {
    const { isAuthenticated } = useAuth();
    const [events, setEvents] = useState<ManagedEvent[]>([]);
    const [attendingEvents, setAttendingEvents] = useState<AttendingEvent[]>(
        [],
    );
    const [loading, setLoading] = useState(true);
    const [attendingLoading, setAttendingLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [cancellingId, setCancellingId] = useState<string | null>(null);
    const [publishingId, setPublishingId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"attending" | "created">(
        "attending",
    );

    // Fetch user-created events
    useEffect(() => {
        if (!isAuthenticated) {
            setLoading(false);
            setAttendingLoading(false);
            return;
        }
        async function fetchMine() {
            try {
                const res = await fetch("/api/events/mine", {
                    credentials: "include",
                });
                const data = await res.json();
                if (res.ok) {
                    setEvents(data.events || []);
                } else {
                    setError(data.error || "Failed to load events");
                }
            } catch {
                setError("Failed to load events");
            } finally {
                setLoading(false);
            }
        }
        fetchMine();
    }, [isAuthenticated]);

    // Fetch events user is attending
    useEffect(() => {
        if (!isAuthenticated) return;
        async function fetchAttending() {
            try {
                const res = await fetch("/api/events/attending", {
                    credentials: "include",
                });
                const data = await res.json();
                if (res.ok) {
                    setAttendingEvents(data.events || []);
                }
            } catch {
                // silently fail
            } finally {
                setAttendingLoading(false);
            }
        }
        fetchAttending();
    }, [isAuthenticated]);

    const handlePublishEvent = async (eventId: string) => {
        if (
            !confirm(
                "Publish this event? It will appear on the public events directory.",
            )
        )
            return;
        setPublishingId(eventId);
        try {
            const res = await fetch(`/api/events/${eventId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ status: "published" }),
            });
            if (res.ok) {
                setEvents((prev) =>
                    prev.map((e) =>
                        e.id === eventId ? { ...e, status: "published" } : e,
                    ),
                );
            } else {
                const data = await res.json();
                alert(data.error || "Failed to publish event");
            }
        } catch {
            alert("Failed to publish event");
        } finally {
            setPublishingId(null);
        }
    };

    const handleCancelEvent = async (eventId: string) => {
        if (
            !confirm(
                "Cancel this event? It will no longer be visible to the public.",
            )
        )
            return;
        setCancellingId(eventId);
        try {
            const res = await fetch(`/api/events/${eventId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ status: "cancelled" }),
            });
            if (res.ok) {
                setEvents((prev) =>
                    prev.map((e) =>
                        e.id === eventId ? { ...e, status: "cancelled" } : e,
                    ),
                );
            } else {
                const data = await res.json();
                alert(data.error || "Failed to cancel event");
            }
        } catch {
            alert("Failed to cancel event");
        } finally {
            setCancellingId(null);
        }
    };

    const getEventHref = (ev: { id: string; slug?: string | null }) =>
        ev.slug ? `/event/${ev.slug}` : `/events/${ev.id}`;

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center px-4">
                <p className="text-zinc-400 mb-4">
                    Sign in to manage your events.
                </p>
                <Link
                    href="/?login=true&redirect=/events/manage"
                    className="px-4 py-2 bg-[#FF5500] hover:bg-[#e04d00] text-white rounded-xl font-medium"
                >
                    Sign in
                </Link>
                <Link
                    href="/events"
                    className="mt-4 text-zinc-400 hover:text-white text-sm"
                >
                    ← Back to events
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#09090b] text-white">
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-[400px] bg-[radial-gradient(ellipse_at_top,rgba(255,85,0,0.08)_0%,transparent_60%)]" />
            </div>

            <header className="sticky top-0 z-50 bg-[#09090b]/80 backdrop-blur-xl border-b border-zinc-800/50">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
                    <Link
                        href="/events"
                        className="text-zinc-400 hover:text-white text-sm flex items-center gap-2"
                    >
                        ← Back to events
                    </Link>
                    <Link
                        href="/events"
                        className="px-4 py-2 rounded-xl bg-[#FF5500] hover:bg-[#e04d00] text-white text-sm font-medium"
                    >
                        + Submit new event
                    </Link>
                </div>
            </header>

            <main className="relative max-w-4xl mx-auto px-4 sm:px-6 py-8">
                <h1 className="text-2xl font-bold text-white mb-2">
                    My Events
                </h1>
                <p className="text-zinc-400 text-sm mb-6">
                    Events you&apos;re attending and events you created.
                </p>

                {/* Tabs */}
                <div className="flex gap-1 p-1 bg-zinc-800/50 rounded-xl mb-8 w-fit">
                    <button
                        onClick={() => setActiveTab("attending")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            activeTab === "attending"
                                ? "bg-[#FF5500] text-white shadow-lg"
                                : "text-zinc-400 hover:text-white"
                        }`}
                    >
                        Attending
                        {attendingEvents.length > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded-md bg-white/20 text-xs">
                                {attendingEvents.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab("created")}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            activeTab === "created"
                                ? "bg-[#FF5500] text-white shadow-lg"
                                : "text-zinc-400 hover:text-white"
                        }`}
                    >
                        Created
                        {events.length > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded-md bg-white/20 text-xs">
                                {events.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Attending Tab */}
                {activeTab === "attending" && (
                    <>
                        {attendingLoading && (
                            <p className="text-zinc-400">Loading…</p>
                        )}
                        {!attendingLoading && attendingEvents.length === 0 && (
                            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
                                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center text-2xl">
                                    🎟️
                                </div>
                                <p className="text-zinc-400 mb-2 font-medium">
                                    No events yet
                                </p>
                                <p className="text-zinc-500 text-sm mb-4">
                                    Browse and register for events to see them
                                    here.
                                </p>
                                <Link
                                    href="/events"
                                    className="inline-flex px-4 py-2 rounded-xl bg-[#FF5500] hover:bg-[#e04d00] text-white text-sm font-medium"
                                >
                                    Browse events
                                </Link>
                            </div>
                        )}
                        {!attendingLoading && attendingEvents.length > 0 && (
                            <ul className="space-y-3">
                                {attendingEvents.map((ev) => (
                                    <li key={ev.id}>
                                        <Link
                                            href={getEventHref(ev)}
                                            className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900/80 transition-all group"
                                        >
                                            {ev.banner_image_url ? (
                                                <img
                                                    src={ev.banner_image_url}
                                                    alt=""
                                                    className="w-full sm:w-24 h-20 object-cover rounded-xl"
                                                />
                                            ) : (
                                                <div className="w-full sm:w-24 h-20 rounded-xl bg-zinc-800 flex items-center justify-center text-2xl">
                                                    {EVENT_TYPE_ICONS[
                                                        ev.event_type
                                                    ] || "📅"}
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-white truncate group-hover:text-[#FF5500] transition-colors">
                                                    {ev.name}
                                                </p>
                                                <p className="text-sm text-zinc-400 mt-0.5">
                                                    {EVENT_TYPE_ICONS[
                                                        ev.event_type
                                                    ]}{" "}
                                                    {new Date(
                                                        ev.event_date,
                                                    ).toLocaleDateString(
                                                        "en-US",
                                                        {
                                                            month: "short",
                                                            day: "numeric",
                                                            year: "numeric",
                                                        },
                                                    )}
                                                    {ev.city && ` · ${ev.city}`}
                                                    {ev.is_virtual &&
                                                        " · Virtual"}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {ev.registration_status ===
                                                "checked_in" ? (
                                                    <span className="px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/40 text-green-400 text-xs font-medium">
                                                        ✓ Checked in
                                                    </span>
                                                ) : (
                                                    <span className="px-3 py-1.5 rounded-lg bg-[#FF5500]/10 border border-[#FF5500]/30 text-[#FF5500] text-xs font-medium">
                                                        🎟️ Registered
                                                    </span>
                                                )}
                                                <svg
                                                    className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M9 5l7 7-7 7"
                                                    />
                                                </svg>
                                            </div>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                )}

                {/* Created Tab */}
                {activeTab === "created" && (
                    <>
                        {loading && (
                            <p className="text-zinc-400">Loading…</p>
                        )}
                        {error && <p className="text-red-400 mb-4">{error}</p>}
                        {!loading && !error && events.length === 0 && (
                            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
                                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center text-2xl">
                                    📅
                                </div>
                                <p className="text-zinc-400 mb-2 font-medium">
                                    No events created
                                </p>
                                <p className="text-zinc-500 text-sm mb-4">
                                    Submit an event to the directory.
                                </p>
                                <Link
                                    href="/events"
                                    className="inline-flex px-4 py-2 rounded-xl bg-[#FF5500] hover:bg-[#e04d00] text-white text-sm font-medium"
                                >
                                    Submit an event
                                </Link>
                            </div>
                        )}
                        {!loading && events.length > 0 && (
                            <ul className="space-y-4">
                                {events.map((ev) => (
                                    <li
                                        key={ev.id}
                                        className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50"
                                    >
                                        {ev.banner_image_url ? (
                                            <img
                                                src={ev.banner_image_url}
                                                alt=""
                                                className="w-full sm:w-24 h-20 object-cover rounded-xl"
                                            />
                                        ) : (
                                            <div className="w-full sm:w-24 h-20 rounded-xl bg-zinc-800 flex items-center justify-center text-2xl">
                                                {EVENT_TYPE_ICONS[
                                                    ev.event_type
                                                ] || "📅"}
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-white truncate">
                                                {ev.name}
                                            </p>
                                            <p className="text-sm text-zinc-400">
                                                {EVENT_TYPE_ICONS[
                                                    ev.event_type
                                                ]}{" "}
                                                {ev.event_type} ·{" "}
                                                {new Date(
                                                    ev.event_date,
                                                ).toLocaleDateString()}{" "}
                                                ·{" "}
                                                <span
                                                    className={
                                                        ev.status ===
                                                        "published"
                                                            ? "text-green-400"
                                                            : ev.status ===
                                                                "cancelled"
                                                              ? "text-red-400"
                                                              : "text-amber-400"
                                                    }
                                                >
                                                    {ev.status}
                                                </span>
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Link
                                                href={`/events/${ev.id}/edit`}
                                                className="px-3 py-1.5 rounded-lg bg-[#FF5500]/20 border border-[#FF5500]/40 text-[#FF5500] hover:bg-[#FF5500]/30 text-sm font-medium"
                                            >
                                                Edit
                                            </Link>
                                            {ev.status === "draft" && (
                                                <button
                                                    onClick={() =>
                                                        handlePublishEvent(
                                                            ev.id,
                                                        )
                                                    }
                                                    disabled={
                                                        publishingId === ev.id
                                                    }
                                                    className="px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/40 text-green-400 hover:bg-green-500/30 text-sm disabled:opacity-50"
                                                >
                                                    {publishingId === ev.id
                                                        ? "Publishing…"
                                                        : "Publish"}
                                                </button>
                                            )}
                                            {ev.status === "published" && (
                                                <Link
                                                    href={getEventHref(ev)}
                                                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white text-sm"
                                                >
                                                    View
                                                </Link>
                                            )}
                                            {ev.status !== "cancelled" && (
                                                <button
                                                    onClick={() =>
                                                        handleCancelEvent(
                                                            ev.id,
                                                        )
                                                    }
                                                    disabled={
                                                        cancellingId === ev.id
                                                    }
                                                    className="px-3 py-1.5 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 text-sm disabled:opacity-50"
                                                >
                                                    {cancellingId === ev.id
                                                        ? "Cancelling…"
                                                        : "Cancel"}
                                                </button>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                )}

                <SpritzFooter className="mt-12" />
            </main>
        </div>
    );
}
