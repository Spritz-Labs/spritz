"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

type BugReportModalProps = {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string;
};

const CATEGORIES = [
    "Agents",
    "Friends",
    "Calls",
    "Chats",
    "Rooms",
    "Livestream",
    "Settings",
    "Configuration",
    "Other",
] as const;

type Category = typeof CATEGORIES[number];

type MediaFile = {
    url: string;
    type: "image" | "video";
    name: string;
};

export function BugReportModal({
    isOpen,
    onClose,
    userAddress,
}: BugReportModalProps) {
    const [category, setCategory] = useState<Category>("Other");
    const [description, setDescription] = useState("");
    const [replicationSteps, setReplicationSteps] = useState("");
    const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Prevent body scroll when modal is open (fixes PWA scroll bleed-through)
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        const isImage = file.type.startsWith("image/") && 
            ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type);
        const isVideo = file.type.startsWith("video/") && 
            ["video/mp4", "video/webm", "video/quicktime"].includes(file.type);

        if (!isImage && !isVideo) {
            setError("Only images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV) are allowed");
            return;
        }

        // Validate file size
        const maxSize = isImage ? 10 * 1024 * 1024 : 50 * 1024 * 1024; // 10MB images, 50MB videos
        if (file.size > maxSize) {
            const maxSizeMB = maxSize / (1024 * 1024);
            setError(`File size must be less than ${maxSizeMB}MB`);
            return;
        }

        setIsUploading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("userAddress", userAddress);

            const res = await fetch("/api/bug-reports/upload", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to upload file");
            }

            setMediaFiles((prev) => [
                ...prev,
                {
                    url: data.url,
                    type: data.type,
                    name: file.name,
                },
            ]);
        } catch (err) {
            console.error("[BugReport] Upload error:", err);
            setError(
                err instanceof Error ? err.message : "Failed to upload file"
            );
        } finally {
            setIsUploading(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    const handleRemoveMedia = (index: number) => {
        setMediaFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!description.trim()) {
            setError("Please provide a description");
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const mediaUrls = mediaFiles.map((f) => f.url);
            const response = await fetch("/api/bug-reports", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAddress,
                    category,
                    description: description.trim(),
                    replicationSteps: replicationSteps.trim() || null,
                    mediaUrls: mediaUrls.length > 0 ? mediaUrls : null,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to submit bug report");
            }

            setSuccess(true);
            setTimeout(() => {
                handleClose();
            }, 2000);
        } catch (err) {
            console.error("[BugReport] Submit error:", err);
            setError(
                err instanceof Error ? err.message : "Failed to submit bug report"
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (isSubmitting || isUploading) return;
        setCategory("Other");
        setDescription("");
        setReplicationSteps("");
        setMediaFiles([]);
        setError(null);
        setSuccess(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={handleClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-zinc-900 rounded-2xl p-6 max-w-md w-full border border-zinc-800 max-h-[90vh] overflow-y-auto"
                >
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                Submit Bug Report
                            </h2>
                            <p className="text-zinc-500 text-sm mt-1">
                                Help us improve Spritz
                            </p>
                        </div>
                        <button
                            onClick={handleClose}
                            disabled={isSubmitting}
                            className="text-zinc-500 hover:text-white transition-colors disabled:opacity-50"
                        >
                            <svg
                                className="w-6 h-6"
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

                    {success ? (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                <svg
                                    className="w-8 h-8 text-emerald-400"
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
                                Bug Report Submitted!
                            </h3>
                            <p className="text-zinc-400 text-sm">
                                Thank you for helping us improve Spritz.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Category */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    Category *
                                </label>
                                <select
                                    value={category}
                                    onChange={(e) =>
                                        setCategory(e.target.value as Category)
                                    }
                                    disabled={isSubmitting}
                                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-50"
                                >
                                    {CATEGORIES.map((cat) => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    Description *
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) =>
                                        setDescription(e.target.value)
                                    }
                                    disabled={isSubmitting}
                                    placeholder="Describe the bug you encountered..."
                                    rows={4}
                                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none disabled:opacity-50"
                                />
                            </div>

                            {/* Replication Steps */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    How to Replicate (Optional)
                                </label>
                                <textarea
                                    value={replicationSteps}
                                    onChange={(e) =>
                                        setReplicationSteps(e.target.value)
                                    }
                                    disabled={isSubmitting}
                                    placeholder="Steps to reproduce the bug..."
                                    rows={3}
                                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none disabled:opacity-50"
                                />
                            </div>

                            {/* Media Upload */}
                            <div>
                                <label className="block text-sm font-medium text-zinc-400 mb-2">
                                    Screenshots / Videos (Optional)
                                </label>
                                <div className="space-y-2">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
                                        onChange={handleFileSelect}
                                        disabled={isSubmitting || isUploading}
                                        className="hidden"
                                        id="bug-report-media"
                                    />
                                    <label
                                        htmlFor="bug-report-media"
                                        className={`block w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white cursor-pointer hover:bg-zinc-750 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                            isSubmitting || isUploading ? "opacity-50 cursor-not-allowed" : ""
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {isUploading ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    <span className="text-sm">Uploading...</span>
                                                </>
                                            ) : (
                                                <>
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
                                                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                                        />
                                                    </svg>
                                                    <span className="text-sm">Add Screenshot or Video</span>
                                                    <span className="text-xs text-zinc-500 ml-auto">
                                                        Max 10MB images, 50MB videos
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </label>

                                    {/* Media Preview */}
                                    {mediaFiles.length > 0 && (
                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                            {mediaFiles.map((media, index) => (
                                                <div
                                                    key={index}
                                                    className="relative group rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700"
                                                >
                                                    {media.type === "image" ? (
                                                        <img
                                                            src={media.url}
                                                            alt={`Screenshot ${index + 1}`}
                                                            className="w-full h-32 object-cover"
                                                        />
                                                    ) : (
                                                        <video
                                                            src={media.url}
                                                            className="w-full h-32 object-cover"
                                                            controls
                                                        />
                                                    )}
                                                    <button
                                                        onClick={() => handleRemoveMedia(index)}
                                                        disabled={isSubmitting}
                                                        className="absolute top-1 right-1 w-6 h-6 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                                                    >
                                                        <svg
                                                            className="w-4 h-4 text-white"
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
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Error Message */}
                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                                    <p className="text-red-400 text-sm">{error}</p>
                                </div>
                            )}

                            {/* Submit Button */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={handleClose}
                                    disabled={isSubmitting || isUploading}
                                    className="flex-1 py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={
                                        isSubmitting || isUploading || !description.trim()
                                    }
                                    className="flex-1 py-3 px-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        "Submit Report"
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

