"use client";

import { useState } from "react";

interface ContactFormProps {
    isOpen: boolean;
    onClose: () => void;
    /** Optional source identifier (e.g. "landing") – sent as X-Contact-Source header so the API can tag the submission */
    source?: string;
}

export function ContactForm({ isOpen, onClose, source }: ContactFormProps) {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [inquiry, setInquiry] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            if (source?.trim()) {
                headers["X-Contact-Source"] = source.trim();
            }
            const res = await fetch("/api/contact", {
                method: "POST",
                headers,
                body: JSON.stringify({ name, email, inquiry }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to send message");
            }

            setSuccess(true);
            setName("");
            setEmail("");
            setInquiry("");
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to send message"
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setSuccess(false);
        setError(null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md bg-[#0d0d0f] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-zinc-800">
                    <h2 className="text-xl font-semibold text-white">
                        Contact Us
                    </h2>
                    <button
                        onClick={handleClose}
                        className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
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

                {/* Content */}
                <div className="p-6">
                    {success ? (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 mx-auto mb-4 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center">
                                <svg
                                    className="w-8 h-8 text-green-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 13l4 4L19 7"
                                    />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-white mb-2">
                                Message Sent!
                            </h3>
                            <p className="text-zinc-400 text-sm mb-6">
                                Thanks for reaching out. We'll get back to you
                                soon.
                            </p>
                            <button
                                onClick={handleClose}
                                className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label
                                    htmlFor="name"
                                    className="block text-sm font-medium text-zinc-400 mb-1.5"
                                >
                                    Name
                                </label>
                                <input
                                    type="text"
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    maxLength={100}
                                    className="w-full px-4 py-3 bg-black border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF5500] transition-colors"
                                    placeholder="Your name"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="email"
                                    className="block text-sm font-medium text-zinc-400 mb-1.5"
                                >
                                    Email
                                </label>
                                <input
                                    type="email"
                                    id="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full px-4 py-3 bg-black border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF5500] transition-colors"
                                    placeholder="your@email.com"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="inquiry"
                                    className="block text-sm font-medium text-zinc-400 mb-1.5"
                                >
                                    Inquiry
                                </label>
                                <textarea
                                    id="inquiry"
                                    value={inquiry}
                                    onChange={(e) => setInquiry(e.target.value)}
                                    required
                                    maxLength={5000}
                                    rows={4}
                                    className="w-full px-4 py-3 bg-black border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF5500] transition-colors resize-none"
                                    placeholder="How can we help you?"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full py-3 bg-gradient-to-r from-[#FF5500] to-[#e04d00] text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-[#FF5500]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? "Sending..." : "Send Message"}
                            </button>

                            <p className="text-zinc-500 text-xs text-center">
                                We'll respond to your inquiry at the email
                                provided.
                            </p>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
