"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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

type EventForm = {
    name: string;
    description: string;
    event_type: string;
    event_date: string;
    start_time: string;
    end_time: string;
    venue: string;
    city: string;
    country: string;
    organizer: string;
    event_url: string;
    rsvp_url: string;
    banner_image_url: string;
};

export default function EditEventPage() {
    const params = useParams();
    const router = useRouter();
    const { isAuthenticated } = useAuth();
    const id = params?.id as string;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState<EventForm>({
        name: "",
        description: "",
        event_type: "conference",
        event_date: "",
        start_time: "",
        end_time: "",
        venue: "",
        city: "",
        country: "",
        organizer: "",
        event_url: "",
        rsvp_url: "",
        banner_image_url: "",
    });
    const [bannerFile, setBannerFile] = useState<File | null>(null);

    useEffect(() => {
        if (!id || !isAuthenticated) {
            setLoading(false);
            return;
        }
        async function load() {
            try {
                const res = await fetch(`/api/events/${id}`, {
                    credentials: "include",
                });
                const data = await res.json();
                if (!res.ok) {
                    setError(data.error || "Event not found");
                    return;
                }
                const e = data.event;
                setForm({
                    name: e.name || "",
                    description: e.description || "",
                    event_type: e.event_type || "conference",
                    event_date: e.event_date || "",
                    start_time: e.start_time?.slice(0, 5) || "",
                    end_time: e.end_time?.slice(0, 5) || "",
                    venue: e.venue || "",
                    city: e.city || "",
                    country: e.country || "",
                    organizer: e.organizer || "",
                    event_url: e.event_url || "",
                    rsvp_url: e.rsvp_url || "",
                    banner_image_url: e.banner_image_url || "",
                });
            } catch {
                setError("Failed to load event");
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [id, isAuthenticated]);

    const handleSave = async () => {
        if (!form.name?.trim() || !form.event_type || !form.event_date) {
            setError("Name, event type, and date are required.");
            return;
        }
        setError(null);
        setSaving(true);
        try {
            let bannerUrl = form.banner_image_url;
            if (bannerFile) {
                const fd = new FormData();
                fd.append("file", bannerFile);
                fd.append("context", "event");
                const uploadRes = await fetch("/api/upload", {
                    method: "POST",
                    credentials: "include",
                    body: fd,
                });
                const uploadData = await uploadRes.json();
                if (!uploadRes.ok || !uploadData.url) {
                    setError(uploadData.error || "Image upload failed");
                    setSaving(false);
                    return;
                }
                bannerUrl = uploadData.url;
            }
            const res = await fetch(`/api/events/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    name: form.name.trim(),
                    description: form.description || null,
                    event_type: form.event_type,
                    event_date: form.event_date,
                    start_time: form.start_time || null,
                    end_time: form.end_time || null,
                    venue: form.venue || null,
                    city: form.city || null,
                    country: form.country || null,
                    organizer: form.organizer || null,
                    event_url: form.event_url || null,
                    rsvp_url: form.rsvp_url || null,
                    banner_image_url: bannerUrl || null,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                router.push("/events/manage");
            } else {
                setError(data.error || "Failed to save");
            }
        } catch {
            setError("Failed to save event");
        } finally {
            setSaving(false);
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center px-4">
                <p className="text-zinc-400 mb-4">
                    Sign in to edit your events.
                </p>
                <Link
                    href={`/?login=true&redirect=/events/${id}/edit`}
                    className="px-4 py-2 bg-[#FF5500] hover:bg-[#e04d00] text-white rounded-xl font-medium"
                >
                    Sign in
                </Link>
                <Link
                    href="/events/manage"
                    className="mt-4 text-zinc-400 hover:text-white text-sm"
                >
                    ← Back to my events
                </Link>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center">
                <p className="text-zinc-400">Loading…</p>
            </div>
        );
    }

    if (error && !form.name) {
        return (
            <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center px-4">
                <p className="text-red-400 mb-4">{error}</p>
                <Link
                    href="/events/manage"
                    className="text-[#FF5500] hover:underline"
                >
                    ← Back to my events
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#09090b] text-white">
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-full h-[400px] bg-[radial-gradient(ellipse_at_top,rgba(255,85,0,0.08)_0%,transparent_60%)]" />
            </div>

            <header className="sticky top-0 z-50 bg-[#09090b]/80 backdrop-blur-xl border-b border-zinc-800/50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
                <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
                    <Link
                        href="/events/manage"
                        className="text-zinc-400 hover:text-white text-sm flex items-center gap-2"
                    >
                        ← My events
                    </Link>
                </div>
            </header>

            <main className="relative max-w-2xl mx-auto px-4 sm:px-6 py-8">
                <h1 className="text-2xl font-bold text-white mb-2">
                    Edit event
                </h1>
                <p className="text-zinc-400 text-sm mb-6">
                    Update your event details. Only you can edit events you
                    created.
                </p>

                {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Event name *
                        </label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) =>
                                setForm({ ...form, name: e.target.value })
                            }
                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Description
                        </label>
                        <textarea
                            value={form.description}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    description: e.target.value,
                                })
                            }
                            rows={3}
                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                                Event type *
                            </label>
                            <select
                                value={form.event_type}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        event_type: e.target.value,
                                    })
                                }
                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                            >
                                {Object.entries(EVENT_TYPE_ICONS).map(
                                    ([type]) => (
                                        <option key={type} value={type}>
                                            {EVENT_TYPE_ICONS[type]} {type}
                                        </option>
                                    ),
                                )}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                                Event date *
                            </label>
                            <input
                                type="date"
                                value={form.event_date}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        event_date: e.target.value,
                                    })
                                }
                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                                Start time
                            </label>
                            <input
                                type="time"
                                value={form.start_time}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        start_time: e.target.value,
                                    })
                                }
                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                                End time
                            </label>
                            <input
                                type="time"
                                value={form.end_time}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        end_time: e.target.value,
                                    })
                                }
                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Venue
                        </label>
                        <input
                            type="text"
                            value={form.venue}
                            onChange={(e) =>
                                setForm({ ...form, venue: e.target.value })
                            }
                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                                City
                            </label>
                            <input
                                type="text"
                                value={form.city}
                                onChange={(e) =>
                                    setForm({ ...form, city: e.target.value })
                                }
                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                                Country
                            </label>
                            <input
                                type="text"
                                value={form.country}
                                onChange={(e) =>
                                    setForm({
                                        ...form,
                                        country: e.target.value,
                                    })
                                }
                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Organizer
                        </label>
                        <input
                            type="text"
                            value={form.organizer}
                            onChange={(e) =>
                                setForm({ ...form, organizer: e.target.value })
                            }
                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Event URL
                        </label>
                        <input
                            type="url"
                            value={form.event_url}
                            onChange={(e) =>
                                setForm({ ...form, event_url: e.target.value })
                            }
                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                            RSVP URL
                        </label>
                        <input
                            type="url"
                            value={form.rsvp_url}
                            onChange={(e) =>
                                setForm({ ...form, rsvp_url: e.target.value })
                            }
                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Banner image (optional)
                        </label>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(e) =>
                                setBannerFile(e.target.files?.[0] || null)
                            }
                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-[#FF5500]/50 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-zinc-700 file:text-white"
                        />
                        {form.banner_image_url && !bannerFile && (
                            <p className="mt-1 text-xs text-zinc-500">
                                Current image in use. Choose a new file to
                                replace.
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex gap-3 mt-8">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 px-4 py-2.5 bg-[#FF5500] hover:bg-[#e04d00] text-white rounded-xl font-semibold transition-colors disabled:opacity-50"
                    >
                        {saving ? "Saving…" : "Save changes"}
                    </button>
                    <Link
                        href="/events/manage"
                        className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium text-center transition-colors"
                    >
                        Cancel
                    </Link>
                </div>

                <SpritzFooter className="mt-12" />
            </main>
        </div>
    );
}
