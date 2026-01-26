"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

interface RegistrationPreferences {
    full_name: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    job_title: string | null;
    twitter_handle: string | null;
    linkedin_url: string | null;
    dietary_restrictions: string | null;
    accessibility_needs: string | null;
    notes: string | null;
}

interface RegistrationPreferencesModalProps {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string;
}

export function RegistrationPreferencesModal({
    isOpen,
    onClose,
    userAddress,
}: RegistrationPreferencesModalProps) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [prefs, setPrefs] = useState<RegistrationPreferences>({
        full_name: null,
        email: null,
        phone: null,
        company: null,
        job_title: null,
        twitter_handle: null,
        linkedin_url: null,
        dietary_restrictions: null,
        accessibility_needs: null,
        notes: null,
    });

    // Fetch existing preferences
    useEffect(() => {
        if (isOpen && userAddress) {
            fetchPreferences();
        }
    }, [isOpen, userAddress]);

    const fetchPreferences = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/user/registration-prefs");
            if (res.ok) {
                const data = await res.json();
                if (data.preferences) {
                    setPrefs(data.preferences);
                }
            }
        } catch (err) {
            console.error("Failed to fetch preferences:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!prefs.full_name || !prefs.email) {
            setError("Name and email are required");
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(false);

        try {
            const res = await fetch("/api/user/registration-prefs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(prefs),
            });

            const data = await res.json();

            if (res.ok) {
                setSuccess(true);
                setTimeout(() => {
                    onClose();
                    setSuccess(false);
                }, 1500);
            } else {
                setError(data.error || "Failed to save preferences");
            }
        } catch (err) {
            setError("Failed to save preferences");
        } finally {
            setSaving(false);
        }
    };

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
                    className="bg-zinc-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-zinc-800 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-white">🎫 Registration Preferences</h2>
                            <p className="text-sm text-zinc-400">Save your info for quick event registration</p>
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

                    {/* Content */}
                    <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Required Fields */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">
                                            Full Name <span className="text-red-400">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={prefs.full_name || ""}
                                            onChange={(e) => setPrefs({ ...prefs, full_name: e.target.value })}
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            placeholder="John Doe"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">
                                            Email <span className="text-red-400">*</span>
                                        </label>
                                        <input
                                            type="email"
                                            value={prefs.email || ""}
                                            onChange={(e) => setPrefs({ ...prefs, email: e.target.value })}
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            placeholder="john@example.com"
                                        />
                                    </div>
                                </div>

                                {/* Optional Contact Info */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">Phone</label>
                                        <input
                                            type="tel"
                                            value={prefs.phone || ""}
                                            onChange={(e) => setPrefs({ ...prefs, phone: e.target.value })}
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            placeholder="+1 (555) 123-4567"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">Company</label>
                                        <input
                                            type="text"
                                            value={prefs.company || ""}
                                            onChange={(e) => setPrefs({ ...prefs, company: e.target.value })}
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            placeholder="Acme Inc."
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">Job Title</label>
                                        <input
                                            type="text"
                                            value={prefs.job_title || ""}
                                            onChange={(e) => setPrefs({ ...prefs, job_title: e.target.value })}
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            placeholder="Software Engineer"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">Twitter Handle</label>
                                        <input
                                            type="text"
                                            value={prefs.twitter_handle || ""}
                                            onChange={(e) => setPrefs({ ...prefs, twitter_handle: e.target.value })}
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            placeholder="@username"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm text-zinc-400 mb-1">LinkedIn URL</label>
                                    <input
                                        type="url"
                                        value={prefs.linkedin_url || ""}
                                        onChange={(e) => setPrefs({ ...prefs, linkedin_url: e.target.value })}
                                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                        placeholder="https://linkedin.com/in/username"
                                    />
                                </div>

                                {/* Special Requirements */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">Dietary Restrictions</label>
                                        <input
                                            type="text"
                                            value={prefs.dietary_restrictions || ""}
                                            onChange={(e) => setPrefs({ ...prefs, dietary_restrictions: e.target.value })}
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            placeholder="Vegetarian, Gluten-free, etc."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">Accessibility Needs</label>
                                        <input
                                            type="text"
                                            value={prefs.accessibility_needs || ""}
                                            onChange={(e) => setPrefs({ ...prefs, accessibility_needs: e.target.value })}
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                            placeholder="Wheelchair access, etc."
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm text-zinc-400 mb-1">Additional Notes</label>
                                    <textarea
                                        value={prefs.notes || ""}
                                        onChange={(e) => setPrefs({ ...prefs, notes: e.target.value })}
                                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white resize-none"
                                        rows={3}
                                        placeholder="Any other information you'd like to include..."
                                    />
                                </div>

                                {error && (
                                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                        {error}
                                    </div>
                                )}

                                {success && (
                                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm">
                                        Preferences saved successfully!
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || !prefs.full_name || !prefs.email}
                            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-purple-500/50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            {saving ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block mr-2" />
                                    Saving...
                                </>
                            ) : (
                                "Save Preferences"
                            )}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
