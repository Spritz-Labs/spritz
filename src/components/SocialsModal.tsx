"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { type SocialLinks, SOCIAL_PLATFORMS } from "@/hooks/useSocials";

interface SocialsModalProps {
    isOpen: boolean;
    onClose: () => void;
    socials: SocialLinks;
    onSave: (socials: SocialLinks) => Promise<boolean>;
    isLoading?: boolean;
}

export function SocialsModal({
    isOpen,
    onClose,
    socials,
    onSave,
    isLoading,
}: SocialsModalProps) {
    const [formData, setFormData] = useState<SocialLinks>({});
    const [isSaving, setIsSaving] = useState(false);

    // Initialize form data when modal opens
    useEffect(() => {
        if (isOpen) {
            setFormData({ ...socials });
        }
    }, [isOpen, socials]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        // Clean up empty strings
        const cleanedData: SocialLinks = {};
        Object.entries(formData).forEach(([key, value]) => {
            if (value && value.trim()) {
                // Remove @ prefix if user added it
                cleanedData[key as keyof SocialLinks] = value
                    .trim()
                    .replace(/^@/, "");
            }
        });

        const success = await onSave(cleanedData);
        setIsSaving(false);

        if (success) {
            onClose();
        }
    };

    const handleChange = (key: keyof SocialLinks, value: string) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
    };

    // Close on escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (isOpen) {
            document.addEventListener("keydown", handleEscape);
        }
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isOpen, onClose]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-semibold text-white">
                                    Social Links
                                </h2>
                                <p className="text-zinc-500 text-sm mt-1">
                                    Add your socials so friends can find you
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={2}
                                    stroke="currentColor"
                                    className="w-5 h-5"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {SOCIAL_PLATFORMS.map((platform) => (
                                <div key={platform.key}>
                                    <label className="flex items-center gap-2 text-sm font-medium text-zinc-400 mb-2">
                                        <span className="text-base">
                                            {platform.icon}
                                        </span>
                                        {platform.name}
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">
                                            @
                                        </span>
                                        <input
                                            type="text"
                                            value={formData[platform.key] || ""}
                                            onChange={(e) =>
                                                handleChange(
                                                    platform.key,
                                                    e.target.value
                                                )
                                            }
                                            placeholder={platform.placeholder}
                                            className="w-full py-2.5 pl-8 pr-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#FB8D22]/50 focus:ring-2 focus:ring-[#FB8D22]/20 transition-all text-sm"
                                        />
                                    </div>
                                </div>
                            ))}

                            {/* Actions */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving || isLoading}
                                    className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF5500] text-white font-medium transition-all hover:shadow-lg hover:shadow-[#FB8D22]/25 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <svg
                                                className="animate-spin h-4 w-4"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                            >
                                                <circle
                                                    className="opacity-25"
                                                    cx="12"
                                                    cy="12"
                                                    r="10"
                                                    stroke="currentColor"
                                                    strokeWidth="4"
                                                />
                                                <path
                                                    className="opacity-75"
                                                    fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                />
                                            </svg>
                                            Saving...
                                        </span>
                                    ) : (
                                        "Save"
                                    )}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// Component to display social links (for viewing)
export function SocialLinksDisplay({
    socials,
    compact = false,
}: {
    socials: SocialLinks;
    compact?: boolean;
}) {
    const activeSocials = SOCIAL_PLATFORMS.filter(
        (platform) => socials[platform.key]
    );

    if (activeSocials.length === 0) return null;

    if (compact) {
        return (
            <div className="flex items-center gap-1.5 flex-wrap">
                {activeSocials.map((platform) => (
                    <a
                        key={platform.key}
                        href={`${platform.urlPrefix}${socials[platform.key]}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-sm transition-colors"
                        title={`${platform.name}: @${socials[platform.key]}`}
                    >
                        {platform.icon}
                    </a>
                ))}
            </div>
        );
    }

    return (
        <div className="flex flex-wrap gap-2">
            {activeSocials.map((platform) => (
                <a
                    key={platform.key}
                    href={`${platform.urlPrefix}${socials[platform.key]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs transition-colors"
                >
                    <span>{platform.icon}</span>
                    <span>@{socials[platform.key]}</span>
                </a>
            ))}
        </div>
    );
}






