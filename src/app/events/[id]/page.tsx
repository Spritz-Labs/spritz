"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthProvider";
import { useAdmin } from "@/hooks/useAdmin";
import { QRCodeSVG } from "qrcode.react";
import { Html5Qrcode } from "html5-qrcode";

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
    created_by?: string | null;
}

/* ---------- QR Scanner Inline Component ---------- */
function CheckinScanner({
    eventId,
    onClose,
}: {
    eventId: string;
    onClose: () => void;
}) {
    const [error, setError] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(true);
    const [result, setResult] = useState<{
        success: boolean;
        message: string;
        username?: string | null;
        alreadyCheckedIn?: boolean;
    } | null>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const isRunningRef = useRef(false);
    const hasScannedRef = useRef(false);

    const stopScanner = useCallback(async () => {
        if (scannerRef.current && isRunningRef.current) {
            try {
                isRunningRef.current = false;
                await scannerRef.current.stop();
            } catch {
                // ignore
            }
        }
    }, []);

    const handleCheckin = useCallback(
        async (walletAddress: string) => {
            try {
                const res = await fetch(`/api/events/${eventId}/checkin`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ walletAddress }),
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    setResult({
                        success: true,
                        message: data.alreadyCheckedIn
                            ? "Already checked in"
                            : "Checked in!",
                        username: data.attendee?.username,
                        alreadyCheckedIn: data.alreadyCheckedIn,
                    });
                } else {
                    setResult({
                        success: false,
                        message: data.error || "Check-in failed",
                    });
                }
            } catch {
                setResult({ success: false, message: "Network error" });
            }
        },
        [eventId],
    );

    useEffect(() => {
        const startScanner = async () => {
            setIsStarting(true);
            setError(null);
            hasScannedRef.current = false;

            try {
                const scanner = new Html5Qrcode("checkin-scanner");
                scannerRef.current = scanner;

                const devices = await Html5Qrcode.getCameras();
                if (devices.length === 0) throw new Error("No camera found");

                const backCamera = devices.find(
                    (d) =>
                        d.label.toLowerCase().includes("back") ||
                        d.label.toLowerCase().includes("rear"),
                );
                const cameraId = backCamera?.id || devices[0].id;

                await scanner.start(
                    cameraId,
                    { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
                    async (decodedText) => {
                        if (hasScannedRef.current) return;
                        hasScannedRef.current = true;

                        try {
                            isRunningRef.current = false;
                            await scanner.stop();
                        } catch {
                            // ignore
                        }

                        // Parse QR data
                        try {
                            const data = JSON.parse(decodedText);
                            if (
                                data.type === "spritz-checkin" &&
                                data.wallet
                            ) {
                                await handleCheckin(data.wallet);
                            } else {
                                setResult({
                                    success: false,
                                    message:
                                        "Invalid QR code — not a Spritz check-in code",
                                });
                            }
                        } catch {
                            // Maybe raw wallet address?
                            if (
                                decodedText.startsWith("0x") &&
                                decodedText.length === 42
                            ) {
                                await handleCheckin(decodedText);
                            } else {
                                setResult({
                                    success: false,
                                    message: "Unrecognized QR code",
                                });
                            }
                        }
                    },
                    () => {
                        // scan failure, ignore
                    },
                );
                isRunningRef.current = true;
            } catch (err: unknown) {
                const e = err as { name?: string; message?: string };
                if (e.name === "NotAllowedError") {
                    setError("Camera permission denied.");
                } else if (e.message?.includes("No camera")) {
                    setError("No camera found on this device.");
                } else {
                    setError("Failed to start camera.");
                }
            } finally {
                setIsStarting(false);
            }
        };

        const timer = setTimeout(startScanner, 150);
        return () => {
            clearTimeout(timer);
            stopScanner();
            scannerRef.current = null;
        };
    }, [stopScanner, handleCheckin]);

    const scanAgain = () => {
        setResult(null);
        hasScannedRef.current = false;
        // Re-mount by toggling
        const el = document.getElementById("checkin-scanner");
        if (el) el.innerHTML = "";
        const startScanner = async () => {
            try {
                const scanner = new Html5Qrcode("checkin-scanner");
                scannerRef.current = scanner;
                const devices = await Html5Qrcode.getCameras();
                const backCamera = devices.find(
                    (d) =>
                        d.label.toLowerCase().includes("back") ||
                        d.label.toLowerCase().includes("rear"),
                );
                const cameraId = backCamera?.id || devices[0].id;
                await scanner.start(
                    cameraId,
                    { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1 },
                    async (decodedText) => {
                        if (hasScannedRef.current) return;
                        hasScannedRef.current = true;
                        try {
                            isRunningRef.current = false;
                            await scanner.stop();
                        } catch {}
                        try {
                            const data = JSON.parse(decodedText);
                            if (data.type === "spritz-checkin" && data.wallet) {
                                await handleCheckin(data.wallet);
                            } else {
                                setResult({
                                    success: false,
                                    message: "Invalid QR code",
                                });
                            }
                        } catch {
                            if (
                                decodedText.startsWith("0x") &&
                                decodedText.length === 42
                            ) {
                                await handleCheckin(decodedText);
                            } else {
                                setResult({
                                    success: false,
                                    message: "Unrecognized QR code",
                                });
                            }
                        }
                    },
                    () => {},
                );
                isRunningRef.current = true;
            } catch {}
        };
        setTimeout(startScanner, 150);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
            <div
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white">
                        Check In Attendee
                    </h2>
                    <button
                        onClick={() => {
                            stopScanner();
                            onClose();
                        }}
                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
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
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>

                {result ? (
                    <div className="text-center py-6">
                        <div
                            className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center text-3xl mb-4 ${
                                result.success
                                    ? result.alreadyCheckedIn
                                        ? "bg-amber-500/20"
                                        : "bg-green-500/20"
                                    : "bg-red-500/20"
                            }`}
                        >
                            {result.success
                                ? result.alreadyCheckedIn
                                    ? "⚠️"
                                    : "✅"
                                : "❌"}
                        </div>
                        <p
                            className={`font-semibold text-lg mb-1 ${
                                result.success
                                    ? "text-green-400"
                                    : "text-red-400"
                            }`}
                        >
                            {result.message}
                        </p>
                        {result.username && (
                            <p className="text-zinc-400 text-sm">
                                {result.username}
                            </p>
                        )}
                        <button
                            onClick={scanAgain}
                            className="mt-6 px-6 py-2.5 rounded-xl bg-[#FF5500] hover:bg-[#e04d00] text-white font-medium transition-colors"
                        >
                            Scan next
                        </button>
                    </div>
                ) : (
                    <>
                        {error ? (
                            <div className="bg-zinc-800 rounded-xl p-8 text-center">
                                <p className="text-red-400 text-sm mb-4">
                                    {error}
                                </p>
                                <button
                                    onClick={() => {
                                        stopScanner();
                                        onClose();
                                    }}
                                    className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm"
                                >
                                    Close
                                </button>
                            </div>
                        ) : (
                            <>
                                {isStarting && (
                                    <div className="flex flex-col items-center gap-3 py-8">
                                        <div className="w-8 h-8 border-2 border-[#FF5500] border-t-transparent rounded-full animate-spin" />
                                        <p className="text-zinc-400 text-sm">
                                            Starting camera...
                                        </p>
                                    </div>
                                )}
                                <div
                                    id="checkin-scanner"
                                    className="rounded-xl overflow-hidden bg-zinc-800"
                                    style={{
                                        width: "100%",
                                        minHeight: isStarting ? "0px" : "300px",
                                    }}
                                />
                            </>
                        )}
                        <p className="text-zinc-500 text-sm text-center mt-4">
                            Point camera at attendee&apos;s QR code
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}

/* ---------- My QR Modal ---------- */
function MyQRModal({
    eventId,
    eventName,
    walletAddress,
    registrationStatus,
    onClose,
}: {
    eventId: string;
    eventName: string;
    walletAddress: string;
    registrationStatus: string | null;
    onClose: () => void;
}) {
    const qrData = JSON.stringify({
        type: "spritz-checkin",
        event: eventId,
        wallet: walletAddress,
    });

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white">
                        My QR Code
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
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
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>

                <div className="flex flex-col items-center">
                    <div className="bg-white p-4 rounded-2xl mb-4">
                        <QRCodeSVG
                            value={qrData}
                            size={220}
                            level="M"
                            bgColor="#ffffff"
                            fgColor="#09090b"
                        />
                    </div>
                    <p className="text-white font-medium text-center mb-1">
                        {eventName}
                    </p>
                    <p className="text-zinc-500 text-xs text-center mb-4">
                        Show this to the event host to check in
                    </p>
                    {registrationStatus === "checked_in" && (
                        <div className="px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-medium">
                            ✓ Already checked in
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ---------- Main Page ---------- */
export default function EventDetailPage() {
    const params = useParams();
    const id = params?.id as string;
    const { isAuthenticated, user } = useAuth();
    const [event, setEvent] = useState<EventDetail | null>(null);
    const [isRegistered, setIsRegistered] = useState(false);
    const [registrationStatus, setRegistrationStatus] = useState<string | null>(
        null,
    );
    const [isCreator, setIsCreator] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [registering, setRegistering] = useState(false);
    const [registerError, setRegisterError] = useState<string | null>(null);
    const [userInterest, setUserInterest] = useState<string | null>(null);
    const [interestedCount, setInterestedCount] = useState(0);
    const [goingCount, setGoingCount] = useState(0);
    const [isLoadingInterest, setIsLoadingInterest] = useState(false);
    const { isAdmin, getAuthHeaders } = useAdmin();
    const [refreshing, setRefreshing] = useState(false);
    const [refreshError, setRefreshError] = useState<string | null>(null);

    // Modals
    const [showMyQR, setShowMyQR] = useState(false);
    const [showCheckinScanner, setShowCheckinScanner] = useState(false);

    useEffect(() => {
        if (!id) return;
        async function fetchEvent() {
            try {
                const res = await fetch(`/api/events/${id}`, {
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
                setRegistrationStatus(data.registrationStatus ?? null);
                setIsCreator(data.isCreator ?? false);
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
            const alreadyThis =
                type === "going"
                    ? userInterest === "going" || isRegistered
                    : userInterest === type;
            if (alreadyThis) {
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
            // Refetch so UI matches server
            const refetch = await fetch(`/api/events/${id}/interest`, {
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
        } catch (error) {
            console.error("Failed to update interest:", error);
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
                setRegistrationStatus("registered");
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
    const canCheckin = isCreator || isAdmin;
    const walletAddress = user?.walletAddress ?? null;

    return (
        <div className="min-h-screen bg-[#09090b] text-white">
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-[600px] bg-[radial-gradient(ellipse_at_top,rgba(255,85,0,0.12)_0%,transparent_60%)]" />
            </div>

            <header className="sticky top-0 z-50 bg-[#09090b]/80 backdrop-blur-xl border-b border-zinc-800/50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
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
                        <div className="aspect-square max-h-[420px] w-full bg-zinc-800 overflow-hidden flex items-center justify-center">
                            <img
                                src={event.banner_image_url}
                                alt=""
                                className="w-full h-full object-contain"
                            />
                        </div>
                    ) : (
                        <div className="aspect-square max-h-[420px] w-full bg-gradient-to-br from-[#FF5500]/20 via-zinc-900 to-zinc-900 flex items-center justify-center border-b border-zinc-800">
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
                            {registrationStatus === "checked_in" && (
                                <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">
                                    ✓ Checked in
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

                        {/* Interested / Going */}
                        <div className="flex gap-2 mb-4">
                            <button
                                onClick={() => handleInterest("interested")}
                                disabled={isLoadingInterest}
                                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
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
                                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                                    userInterest === "going"
                                        ? "bg-green-500/20 text-green-400 border border-green-500/40"
                                        : "bg-zinc-800/50 text-zinc-400 border border-zinc-700 hover:bg-zinc-800 hover:border-zinc-600"
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

                        {/* Actions */}
                        <div className="flex flex-col gap-3 pt-4 border-t border-zinc-800">
                            {/* Spritz Registration (primary when enabled) */}
                            {event.registration_enabled && (
                                <>
                                    {isRegistered ? (
                                        <div className="py-3 px-4 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-medium flex items-center justify-between">
                                            <span>✓ You&apos;re registered</span>
                                            {walletAddress && (
                                                <button
                                                    onClick={() =>
                                                        setShowMyQR(true)
                                                    }
                                                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors flex items-center gap-1.5"
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
                                                            d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                                                        />
                                                    </svg>
                                                    My QR
                                                </button>
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
                                                    : "Register with Spritz"}
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
                            {/* External RSVP: primary if Spritz registration is off, secondary if on */}
                            {hasExternalRsvp && (
                                <a
                                    href={event.rsvp_url!}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={
                                        event.registration_enabled
                                            ? "w-full text-center py-2.5 px-4 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-800 hover:border-zinc-600 transition-all"
                                            : "w-full text-center py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white font-semibold hover:shadow-lg hover:shadow-[#FF5500]/20 transition-all"
                                    }
                                >
                                    {event.registration_enabled
                                        ? "Also RSVP on event site ↗"
                                        : "RSVP / Register ↗"}
                                </a>
                            )}

                            {/* Check-in scanner for creator / admin */}
                            {canCheckin && (
                                <button
                                    onClick={() =>
                                        setShowCheckinScanner(true)
                                    }
                                    className="w-full text-center py-3 px-4 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 font-semibold hover:bg-purple-500/30 transition-all flex items-center justify-center gap-2"
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
                                            d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                                        />
                                    </svg>
                                    Check In Attendees
                                </button>
                            )}

                            {/* Event website */}
                            {event.event_url && (
                                <a
                                    href={event.event_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full text-center py-2.5 px-4 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-medium hover:bg-zinc-800 hover:border-zinc-600 transition-all"
                                >
                                    Event website ↗
                                </a>
                            )}

                            {/* Spritz App button */}
                            <Link
                                href="/"
                                className="w-full text-center py-2.5 px-4 rounded-xl bg-[#FF5500]/10 border border-[#FF5500]/30 text-[#FF5500] text-sm font-medium hover:bg-[#FF5500]/20 transition-all flex items-center justify-center gap-2"
                            >
                                <span>🍊</span>
                                Open Spritz App
                            </Link>

                            {/* Admin refresh */}
                            {isAdmin && (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (!id) return;
                                        setRefreshError(null);
                                        setRefreshing(true);
                                        try {
                                            const res = await fetch(
                                                `/api/admin/events/${id}/refresh`,
                                                {
                                                    method: "POST",
                                                    headers:
                                                        getAuthHeaders() || {},
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

            {/* My QR Modal */}
            {showMyQR && walletAddress && (
                <MyQRModal
                    eventId={event.id}
                    eventName={event.name}
                    walletAddress={walletAddress}
                    registrationStatus={registrationStatus}
                    onClose={() => setShowMyQR(false)}
                />
            )}

            {/* Check-in Scanner */}
            {showCheckinScanner && (
                <CheckinScanner
                    eventId={event.id}
                    onClose={() => setShowCheckinScanner(false)}
                />
            )}
        </div>
    );
}
