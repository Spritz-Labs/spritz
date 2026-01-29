"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthProvider";

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

export default function EventDetailPage() {
    const params = useParams();
    const id = params?.id as string;
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

    useEffect(() => {
        if (!id) return;
        async function fetchEvent() {
            try {
                const res = await fetch(`/api/events/${id}`);
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
    }, [id]);

    useEffect(() => {
        if (!id) return;
        async function fetchInterest() {
            try {
                const res = await fetch(`/api/events/${id}/interest`);
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
    }, [id]);

    const handleInterest = async (type: "interested" | "going") => {
        if (!isAuthenticated) {
            window.location.href = `/?login=true&redirect=${encodeURIComponent(`/events/${id}`)}`;
            return;
        }
        setIsLoadingInterest(true);
        try {
            if (userInterest === type) {
                const res = await fetch(
                    `/api/events/${id}/interest?type=${type}`,
                    { method: "DELETE", credentials: "include" },
                );
                if (res.ok) {
                    setUserInterest(null);
                    if (type === "interested")
                        setInterestedCount((c) => Math.max(0, c - 1));
                    else setGoingCount((c) => Math.max(0, c - 1));
                }
            } else {
                const res = await fetch(`/api/events/${id}/interest`, {
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
        } finally {
            setIsLoadingInterest(false);
        }
    };

    const handleRegister = async () => {
        if (!event) return;
        setRegisterError(null);
        setRegistering(true);
        try {
            const res = await fetch(`/api/events/${id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ registration_data: {} }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setIsRegistered(true);
                setUserInterest("going");
                setGoingCount((c) => c + 1);
            } else {
                if (res.status === 401) {
                    window.location.href = `/?login=true&redirect=${encodeURIComponent(`/events/${id}`)}`;
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
                <div className="absolute top-0 left-0 w-full h-[600px] bg-[radial-gradient(ellipse_at_top,rgba(255,85,0,0.12)_0%,transparent_60%)]" />
            </div>

            <header className="sticky top-0 z-50 bg-[#09090b]/80 backdrop-blur-xl border-b border-zinc-800/50">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
                    <Link
                        href="/events"
                        className="flex items-center justify-center w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
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
                    <span className="text-zinc-400 text-sm truncate">
                        Event
                    </span>
                </div>
            </header>

            <main className="relative max-w-3xl mx-auto px-4 sm:px-6 py-8">
                <article className="bg-zinc-900/60 backdrop-blur-sm rounded-2xl border border-zinc-800 overflow-hidden">
                    {event.banner_image_url ? (
                        <div className="aspect-video bg-zinc-800 overflow-hidden">
                            <img
                                src={event.banner_image_url}
                                alt=""
                                className="w-full h-full object-cover"
                            />
                        </div>
                    ) : (
                        <div className="h-32 bg-gradient-to-br from-[#FF5500]/20 via-zinc-900 to-zinc-900 flex items-center justify-center border-b border-zinc-800">
                            <span className="text-5xl opacity-50">
                                {typeIcon}
                            </span>
                        </div>
                    )}

                    <div className="p-6 sm:p-8">
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-[#FF5500]/10 text-[#FF5500] border border-[#FF5500]/20">
                                {typeIcon} {event.event_type}
                            </span>
                            {event.is_featured && (
                                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white">
                                    ⭐ Featured
                                </span>
                            )}
                        </div>

                        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                            {event.name}
                        </h1>

                        <div className="text-sm text-zinc-400 mb-4">
                            {formatDateRange(
                                event.event_date,
                                event.end_date,
                                event.start_time,
                                event.end_time,
                            )}
                        </div>

                        {locationStr && (
                            <div className="flex items-start gap-2 text-sm text-zinc-400 mb-4">
                                <span className="text-[#FF5500] mt-0.5">
                                    📍
                                </span>
                                <span>{locationStr}</span>
                            </div>
                        )}

                        {event.organizer && (
                            <div className="flex items-center gap-2 text-sm text-zinc-400 mb-4">
                                <span className="text-[#FF5500]">🏢</span>
                                <span>{event.organizer}</span>
                            </div>
                        )}

                        {event.description && (
                            <div className="prose prose-invert prose-sm max-w-none text-zinc-300 mb-6">
                                <p className="whitespace-pre-wrap">
                                    {event.description}
                                </p>
                            </div>
                        )}

                        {event.blockchain_focus &&
                            event.blockchain_focus.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-6">
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

                        {/* Interested / Going (counts only, toggle one or the other) */}
                        <div className="flex gap-2 mb-4">
                            <button
                                onClick={() => handleInterest("interested")}
                                disabled={isLoadingInterest}
                                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                                    userInterest === "interested"
                                        ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
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
                                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                                    userInterest === "going" || isRegistered
                                        ? "bg-green-500/20 text-green-400 border border-green-500/40"
                                        : "bg-zinc-800/50 text-zinc-400 border border-zinc-700 hover:bg-zinc-800 hover:border-zinc-600"
                                } disabled:opacity-50`}
                            >
                                <span>✓</span>
                                <span>
                                    {userInterest === "going" || isRegistered
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

                        {/* Actions */}
                        <div className="flex flex-col gap-3 pt-4 border-t border-zinc-800">
                            {event.registration_enabled && !hasExternalRsvp && (
                                <>
                                    {isRegistered ? (
                                        <div className="py-3 px-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-medium">
                                            ✓ You&apos;re registered
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
                        </div>
                    </div>
                </article>

                <div className="mt-6 text-center">
                    <Link
                        href="/events"
                        className="text-zinc-400 hover:text-white text-sm transition-colors"
                    >
                        ← All events
                    </Link>
                </div>
            </main>
        </div>
    );
}
