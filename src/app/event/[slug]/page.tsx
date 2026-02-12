"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthProvider";
import { useAdmin } from "@/hooks/useAdmin";
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

function formatTime(time: string | null): string {
    if (!time) return "";
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
}

function formatDateRange(
    eventDate: string,
    endDate: string | null,
    startTime: string | null,
    endTime: string | null,
): string {
    const start = new Date(eventDate);
    const end = endDate ? new Date(endDate) : start;
    const parts: string[] = [];

    if (end.getTime() !== start.getTime()) {
        parts.push(
            `${start.getDate()} ${start.toLocaleDateString("en-US", { month: "short" })} - ${end.getDate()} ${end.toLocaleDateString("en-US", { month: "short" })} ${start.getFullYear()}`,
        );
    } else {
        parts.push(
            `${start.getDate()} ${start.toLocaleDateString("en-US", { month: "short" })} ${start.getFullYear()}`,
        );
    }
    if (startTime) {
        parts.push(formatTime(startTime));
        if (endTime) parts.push(`- ${formatTime(endTime)}`);
    }
    return parts.join(" • ");
}

interface EventDetail {
    id: string;
    slug?: string | null;
    name: string;
    description: string | null;
    event_type: string;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    end_date: string | null;
    venue: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
    is_virtual: boolean;
    virtual_url: string | null;
    organizer: string | null;
    event_url: string | null;
    rsvp_url: string | null;
    ticket_url: string | null;
    banner_image_url: string | null;
    blockchain_focus: string[] | null;
    is_featured: boolean;
    registration_enabled: boolean;
    max_attendees: number | null;
    current_registrations: number;
}

export default function EventBySlugPage() {
    const params = useParams();
    const slug = params?.slug as string;
    const { isAuthenticated } = useAuth();
    const [event, setEvent] = useState<EventDetail | null>(null);
    const [isRegistered, setIsRegistered] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [registering, setRegistering] = useState(false);
    const [registerError, setRegisterError] = useState<string | null>(null);
    const [userInterest, setUserInterest] = useState<string | null>(null);
    const [interestedCount, setInterestedCount] = useState(0);
    const [goingCount, setGoingCount] = useState(0);
    const [isLoadingInterest, setIsLoadingInterest] = useState(false);
    const [showUpdateRegistration, setShowUpdateRegistration] = useState(false);
    const [registrationData, setRegistrationData] = useState<{
        email?: string;
        name?: string;
    }>({});
    const [updatingRegistration, setUpdatingRegistration] = useState(false);
    const { isAdmin, getAuthHeaders } = useAdmin();
    const [refreshing, setRefreshing] = useState(false);
    const [refreshError, setRefreshError] = useState<string | null>(null);

    useEffect(() => {
        if (!slug) return;
        async function fetchEvent() {
            try {
                const res = await fetch(`/api/events/by-slug/${slug}`, {
                    credentials: "include",
                });
                if (!res.ok) {
                    if (res.status === 404) setError("Event not found");
                    else setError("Failed to load event");
                    return;
                }
                const data = await res.json();
                setEvent(data.event);
                setIsRegistered(data.isRegistered ?? false);
            } catch {
                setError("Failed to load event");
            } finally {
                setLoading(false);
            }
        }
        fetchEvent();
    }, [slug]);

    useEffect(() => {
        const eventId = event?.id;
        if (!eventId) return;
        async function fetchInterest() {
            try {
                const res = await fetch(`/api/events/${eventId}/interest`, {
                    credentials: "include",
                });
                const data = await res.json();
                if (data) {
                    setUserInterest(data.user_interest || null);
                    setIsRegistered((prev) => prev || !!data.is_registered);
                    setInterestedCount(data.interested_count || 0);
                    setGoingCount(data.going_count || 0);
                }
            } catch {
                // ignore
            }
        }
        fetchInterest();
    }, [event?.id]);

    const handleInterest = async (type: "interested" | "going") => {
        if (!event?.id) return;
        if (!isAuthenticated) {
            window.location.href = `/?login=true&redirect=${encodeURIComponent(`/event/${slug}`)}`;
            return;
        }
        setIsLoadingInterest(true);
        try {
            const alreadyThis =
                type === "going"
                    ? userInterest === "going" || isRegistered
                    : userInterest === type;
            if (alreadyThis) {
                const res = await fetch(
                    `/api/events/${event.id}/interest?type=${type}`,
                    { method: "DELETE", credentials: "include" },
                );
                if (res.ok) {
                    setUserInterest(null);
                    if (type === "interested")
                        setInterestedCount((c) => Math.max(0, c - 1));
                    else setGoingCount((c) => Math.max(0, c - 1));
                }
            } else {
                const res = await fetch(`/api/events/${event.id}/interest`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ interest_type: type }),
                });
                const data = await res.json();
                if (data.success) {
                    const old = userInterest;
                    setUserInterest(type);
                    if (old === "interested")
                        setInterestedCount((c) => Math.max(0, c - 1));
                    else if (old === "going")
                        setGoingCount((c) => Math.max(0, c - 1));
                    if (type === "interested") setInterestedCount((c) => c + 1);
                    else setGoingCount((c) => c + 1);
                }
            }
            const refetch = await fetch(`/api/events/${event.id}/interest`, {
                credentials: "include",
            });
            const refetchData = await refetch.json();
            if (refetchData.user_interest !== undefined)
                setUserInterest(refetchData.user_interest ?? null);
            if (refetchData.interested_count !== undefined)
                setInterestedCount(refetchData.interested_count ?? 0);
            if (refetchData.going_count !== undefined)
                setGoingCount(refetchData.going_count ?? 0);
            if (refetchData.is_registered !== undefined)
                setIsRegistered(!!refetchData.is_registered);
        } finally {
            setIsLoadingInterest(false);
        }
    };

    const handleRegister = async () => {
        if (!event?.id) return;
        setRegisterError(null);
        setRegistering(true);
        try {
            const res = await fetch(`/api/events/${event.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    registration_data: registrationData || {},
                }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setIsRegistered(true);
                setUserInterest("going");
                setGoingCount((c) => c + 1);
            } else {
                if (res.status === 401) {
                    window.location.href = `/?login=true&redirect=${encodeURIComponent(`/event/${slug}`)}`;
                    return;
                }
                setRegisterError(data.error || "Registration failed");
            }
        } catch {
            setRegisterError("Registration failed");
        } finally {
            setRegistering(false);
        }
    };

    const handleUpdateRegistration = async () => {
        if (!event?.id) return;
        setUpdatingRegistration(true);
        try {
            const res = await fetch(`/api/events/${event.id}/register`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ registration_data: registrationData }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setShowUpdateRegistration(false);
            } else {
                alert(data.error || "Failed to update registration");
            }
        } catch {
            alert("Failed to update registration");
        } finally {
            setUpdatingRegistration(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center">
                <div className="animate-pulse text-zinc-400">
                    Loading event…
                </div>
            </div>
        );
    }

    if (error || !event) {
        return (
            <div className="min-h-screen bg-[#09090b] text-white">
                <div className="max-w-2xl mx-auto px-4 py-16 text-center">
                    <p className="text-zinc-400 mb-6">
                        {error || "Event not found"}
                    </p>
                    <Link
                        href="/events"
                        className="px-4 py-2 bg-[#FF5500] hover:bg-[#e04d00] text-white rounded-xl font-medium transition-colors"
                    >
                        ← Back to events
                    </Link>
                </div>
            </div>
        );
    }

    const typeIcon = EVENT_TYPE_ICONS[event.event_type] || "📅";
    const locationStr = [event.venue, event.address, event.city, event.country]
        .filter(Boolean)
        .join(", ");
    const hasExternalRsvp = !!event.rsvp_url;

    return (
        <div className="min-h-screen bg-[#09090b] text-white">
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-[400px] bg-[radial-gradient(ellipse_at_top,rgba(255,85,0,0.08)_0%,transparent_60%)]" />
            </div>

            <header className="sticky top-0 z-50 bg-[#09090b]/90 backdrop-blur-xl border-b border-zinc-800/50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
                <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
                    <Link
                        href="/events"
                        className="flex items-center justify-center w-10 h-10 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                        title="Back to events"
                    >
                        <svg
                            className="w-5 h-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 19l-7-7 7-7"
                            />
                        </svg>
                    </Link>
                    <span className="text-zinc-500 text-sm">Event</span>
                </div>
            </header>

            {/* Luma-style: square banner that fits inside the frame */}
            <div className="w-full max-w-2xl mx-auto aspect-square max-h-[420px] bg-zinc-900 overflow-hidden flex items-center justify-center">
                {event.banner_image_url ? (
                    <img
                        src={event.banner_image_url}
                        alt=""
                        className="w-full h-full object-contain"
                    />
                ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#FF5500]/15 via-zinc-900 to-zinc-900 flex items-center justify-center">
                        <span className="text-6xl opacity-40">{typeIcon}</span>
                    </div>
                )}
            </div>

            <main className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main content */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#FF5500]/10 text-[#FF5500] border border-[#FF5500]/20">
                                {typeIcon} {event.event_type}
                            </span>
                            {event.is_featured && (
                                <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#FF5500] text-white">
                                    Featured
                                </span>
                            )}
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
                            {event.name}
                        </h1>
                        {event.organizer && (
                            <p className="text-zinc-400 text-sm flex items-center gap-2">
                                <span className="text-[#FF5500]">
                                    Hosted by
                                </span>
                                <span>{event.organizer}</span>
                            </p>
                        )}
                        {event.description && (
                            <div className="prose prose-invert prose-sm max-w-none text-zinc-300 pt-2">
                                <p className="whitespace-pre-wrap leading-relaxed">
                                    {event.description}
                                </p>
                            </div>
                        )}
                        {event.blockchain_focus &&
                            event.blockchain_focus.length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-2">
                                    {event.blockchain_focus.map((chain) => (
                                        <span
                                            key={chain}
                                            className="px-2.5 py-1 text-xs rounded-lg bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 capitalize"
                                        >
                                            {chain}
                                        </span>
                                    ))}
                                </div>
                            )}

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => handleInterest("interested")}
                                disabled={isLoadingInterest}
                                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                                    userInterest === "interested"
                                        ? "bg-amber-500/30 text-amber-300 border-2 border-amber-400/60"
                                        : "bg-zinc-800/50 text-zinc-400 border border-zinc-700 hover:bg-zinc-800"
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
                                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                                    userInterest === "going"
                                        ? "bg-green-500/20 text-green-400 border border-green-500/40"
                                        : "bg-zinc-800/50 text-zinc-400 border border-zinc-700 hover:bg-zinc-800"
                                } disabled:opacity-50`}
                            >
                                <span>✓</span>
                                <span>
                                    {userInterest === "going"
                                        ? "Going ✓"
                                        : "Going"}
                                </span>
                                {goingCount > 0 && (
                                    <span className="text-xs opacity-75">
                                        ({goingCount})
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Sidebar: date, location, CTA (Luma-style) */}
                    <aside className="lg:col-span-1">
                        <div className="sticky top-24 space-y-4">
                            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
                                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                                    Date & time
                                </p>
                                <p className="text-white font-medium">
                                    {formatDateRange(
                                        event.event_date,
                                        event.end_date,
                                        event.start_time,
                                        event.end_time,
                                    )}
                                </p>
                            </div>
                            {locationStr && (
                                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
                                    <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                                        Location
                                    </p>
                                    <p className="text-zinc-300 text-sm">
                                        {locationStr}
                                    </p>
                                </div>
                            )}
                            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 space-y-3">
                                {/* Actions */}
                                {!hasExternalRsvp && (
                                    <>
                                        {isRegistered ? (
                                            <div className="space-y-2">
                                                <div className="py-3 px-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-medium">
                                                    ✓ You&apos;re registered
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setShowUpdateRegistration(
                                                            (v) => !v,
                                                        )
                                                    }
                                                    className="w-full py-2 px-4 rounded-xl border border-zinc-600 text-zinc-300 text-sm font-medium hover:bg-zinc-800 transition-colors"
                                                >
                                                    {showUpdateRegistration
                                                        ? "Cancel"
                                                        : "Update registration"}
                                                </button>
                                                {showUpdateRegistration && (
                                                    <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 space-y-3">
                                                        <input
                                                            type="email"
                                                            placeholder="Email"
                                                            value={
                                                                registrationData.email ??
                                                                ""
                                                            }
                                                            onChange={(e) =>
                                                                setRegistrationData(
                                                                    (p) => ({
                                                                        ...p,
                                                                        email: e
                                                                            .target
                                                                            .value,
                                                                    }),
                                                                )
                                                            }
                                                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-[#FF5500]/50"
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder="Name"
                                                            value={
                                                                registrationData.name ??
                                                                ""
                                                            }
                                                            onChange={(e) =>
                                                                setRegistrationData(
                                                                    (p) => ({
                                                                        ...p,
                                                                        name: e
                                                                            .target
                                                                            .value,
                                                                    }),
                                                                )
                                                            }
                                                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-[#FF5500]/50"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={
                                                                handleUpdateRegistration
                                                            }
                                                            disabled={
                                                                updatingRegistration
                                                            }
                                                            className="w-full py-2 px-4 rounded-xl bg-[#FF5500] hover:bg-[#e04d00] text-white text-sm font-medium disabled:opacity-50"
                                                        >
                                                            {updatingRegistration
                                                                ? "Saving…"
                                                                : "Save"}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={handleRegister}
                                                    disabled={registering}
                                                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white font-semibold hover:shadow-lg hover:shadow-[#FF5500]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {registering
                                                        ? "Registering…"
                                                        : "Register"}
                                                </button>
                                                {registerError && (
                                                    <p className="text-sm text-red-400">
                                                        {registerError}
                                                    </p>
                                                )}
                                            </>
                                        )}
                                    </>
                                )}
                                {hasExternalRsvp && (
                                    <a
                                        href={event.rsvp_url!}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full text-center py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white font-semibold hover:shadow-lg hover:shadow-[#FF5500]/20 transition-all"
                                    >
                                        RSVP / Register
                                    </a>
                                )}
                                {event.event_url && (
                                    <a
                                        href={event.event_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full text-center py-2.5 px-4 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-800 hover:border-zinc-600 transition-all"
                                    >
                                        Event website
                                    </a>
                                )}
                                {isAdmin && event?.id && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (!event?.id) return;
                                            setRefreshError(null);
                                            setRefreshing(true);
                                            try {
                                                const res = await fetch(
                                                    `/api/admin/events/${event.id}/refresh`,
                                                    {
                                                        method: "POST",
                                                        headers:
                                                            getAuthHeaders() ||
                                                            {},
                                                        credentials: "include",
                                                    },
                                                );
                                                const data = await res.json();
                                                if (!res.ok) {
                                                    setRefreshError(
                                                        data.error ||
                                                            data.hint ||
                                                            "Refresh failed",
                                                    );
                                                    return;
                                                }
                                                if (data.event) {
                                                    setEvent((prev) =>
                                                        prev
                                                            ? {
                                                                  ...prev,
                                                                  ...data.event,
                                                              }
                                                            : null,
                                                    );
                                                }
                                            } catch (e) {
                                                setRefreshError(
                                                    e instanceof Error
                                                        ? e.message
                                                        : "Refresh failed",
                                                );
                                            } finally {
                                                setRefreshing(false);
                                            }
                                        }}
                                        disabled={refreshing}
                                        className="w-full text-center py-2.5 px-4 rounded-xl border border-zinc-600 text-zinc-400 text-sm font-medium hover:bg-zinc-800 hover:border-zinc-500 transition-all disabled:opacity-50"
                                    >
                                        {refreshing
                                            ? "Refreshing…"
                                            : "Refresh from source"}
                                    </button>
                                )}
                                {refreshError && (
                                    <p className="text-sm text-amber-400">
                                        {refreshError}
                                    </p>
                                )}
                            </div>
                        </div>
                    </aside>
                </div>

                <div className="mt-8 text-center">
                    <Link
                        href="/events"
                        className="text-zinc-400 hover:text-white text-sm transition-colors"
                    >
                        ← All events
                    </Link>
                </div>

                <SpritzFooter className="mt-12" />
            </main>
        </div>
    );
}
