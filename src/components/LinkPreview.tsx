"use client";

import { useState, useEffect } from "react";

type LinkPreviewProps = {
    url: string;
    compact?: boolean;
};

type PreviewData = {
    title: string | null;
    description: string | null;
    image: string | null;
    siteName: string;
    favicon: string | null;
};

export function LinkPreview({ url, compact = false }: LinkPreviewProps) {
    const [preview, setPreview] = useState<PreviewData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        const fetchPreview = async () => {
            try {
                setLoading(true);
                setError(false);

                // Parse URL for basic info
                const urlObj = new URL(url);
                const hostname = urlObj.hostname.replace("www.", "");

                // For now, just show basic info from URL
                // In production, you'd call an API to fetch metadata
                const basicPreview: PreviewData = {
                    title: null,
                    description: null,
                    image: null,
                    siteName: hostname,
                    favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
                };

                // Try to get better preview data for known sites
                if (hostname.includes("twitter.com") || hostname.includes("x.com")) {
                    basicPreview.siteName = "X (Twitter)";
                } else if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
                    basicPreview.siteName = "YouTube";
                    // Extract video ID and use thumbnail
                    const videoId = extractYouTubeId(url);
                    if (videoId) {
                        basicPreview.image = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                    }
                } else if (hostname.includes("github.com")) {
                    basicPreview.siteName = "GitHub";
                } else if (hostname.includes("linkedin.com")) {
                    basicPreview.siteName = "LinkedIn";
                } else if (hostname.includes("instagram.com")) {
                    basicPreview.siteName = "Instagram";
                }

                setPreview(basicPreview);
            } catch {
                setError(true);
            } finally {
                setLoading(false);
            }
        };

        fetchPreview();
    }, [url]);

    // Minimal loading placeholder to avoid layout shift / flashing in chat
    if (loading) {
        return (
            <div
                className={`mt-2 rounded-lg overflow-hidden bg-zinc-800/50 border border-zinc-700/50 ${
                    compact ? "p-2 h-[52px]" : "p-3"
                }`}
                style={{ minHeight: compact ? undefined : 56 }}
            >
                {compact ? (
                    <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded bg-zinc-700 animate-pulse" />
                        <div className="h-3 flex-1 max-w-[120px] rounded bg-zinc-700 animate-pulse" />
                    </div>
                ) : (
                    <>
                        <div className="h-4 bg-zinc-700 rounded w-3/4 mb-2 animate-pulse" />
                        <div className="h-3 bg-zinc-700 rounded w-1/2 animate-pulse" />
                    </>
                )}
            </div>
        );
    }

    if (error || !preview) {
        return null;
    }

    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`block mt-2 max-w-full w-full bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 rounded-lg overflow-hidden transition-colors ${
                compact ? "p-2" : "p-3"
            }`}
            style={{ maxWidth: "min(100%, 280px)" }}
        >
            {preview.image && !compact && (
                <div className="relative w-full max-h-20 mb-2 rounded-lg overflow-hidden bg-zinc-700 aspect-video max-w-full">
                    <img
                        src={preview.image}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                        }}
                    />
                </div>
            )}

            <div className="flex items-start gap-2 min-w-0">
                {preview.favicon && (
                    <img
                        src={preview.favicon}
                        alt=""
                        className="w-4 h-4 mt-0.5 rounded shrink-0"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                        }}
                    />
                )}
                <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-zinc-500 truncate">
                            {preview.siteName}
                        </span>
                        <svg
                            className="w-3 h-3 text-zinc-500 shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                        </svg>
                    </div>
                    {preview.title && (
                        <p className="text-sm text-white font-medium truncate">
                            {preview.title}
                        </p>
                    )}
                    {preview.description && !compact && (
                        <p className="text-xs text-zinc-400 line-clamp-2 mt-0.5">
                            {preview.description}
                        </p>
                    )}
                    <p className="text-xs text-zinc-500 truncate mt-0.5">
                        {url.length > 50 ? url.substring(0, 50) + "..." : url}
                    </p>
                </div>
            </div>
        </a>
    );
}

// Helper to extract YouTube video ID
function extractYouTubeId(url: string): string | null {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /youtube\.com\/shorts\/([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }

    return null;
}

// URL detection helper
export function detectUrls(text: string): string[] {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.match(urlRegex) || [];
}


