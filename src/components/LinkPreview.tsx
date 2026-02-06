"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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

// Simple in-memory cache for link previews with TTL
const previewCache = new Map<string, { data: PreviewData; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// In-flight requests to prevent duplicate fetches
const pendingRequests = new Map<string, Promise<PreviewData>>();

export function LinkPreview({ url, compact = false }: LinkPreviewProps) {
    const [preview, setPreview] = useState<PreviewData | null>(() => {
        // Initialize from cache if available
        const cached = previewCache.get(url);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
        }
        return null;
    });
    const [loading, setLoading] = useState(!preview);
    const [error, setError] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const mountedRef = useRef(true);
    const currentUrlRef = useRef(url);

    const createFallback = useCallback((targetUrl: string): PreviewData => {
        try {
            const urlObj = new URL(targetUrl);
            const hostname = urlObj.hostname.replace("www.", "");
            const fallback: PreviewData = {
                title: null,
                description: null,
                image: null,
                siteName: hostname,
                favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
            };
            
            // Special handling for YouTube
            if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) {
                fallback.siteName = "YouTube";
                const videoId = extractYouTubeId(targetUrl);
                if (videoId) {
                    fallback.image = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                }
            }
            
            return fallback;
        } catch {
            return {
                title: null,
                description: null,
                image: null,
                siteName: "Unknown",
                favicon: null,
            };
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        currentUrlRef.current = url;
        
        // Check cache first
        const cached = previewCache.get(url);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            setPreview(cached.data);
            setLoading(false);
            setError(false);
            return;
        }

        // Abort any previous request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const fetchPreview = async () => {
            // Check if there's already a pending request for this URL
            const pending = pendingRequests.get(url);
            if (pending) {
                try {
                    const data = await pending;
                    if (mountedRef.current && currentUrlRef.current === url) {
                        setPreview(data);
                        setLoading(false);
                    }
                } catch {
                    if (mountedRef.current && currentUrlRef.current === url) {
                        const fallback = createFallback(url);
                        setPreview(fallback);
                        setLoading(false);
                    }
                }
                return;
            }

            setLoading(true);
            setError(false);

            const controller = new AbortController();
            abortControllerRef.current = controller;

            // Create the fetch promise and store it
            const fetchPromise = (async (): Promise<PreviewData> => {
                try {
                    const response = await fetch(
                        `/api/link-preview?url=${encodeURIComponent(url)}`,
                        { signal: controller.signal }
                    );
                    
                    if (!response.ok) {
                        throw new Error("Failed to fetch preview");
                    }

                    const data: PreviewData = await response.json();
                    
                    // Cache the result
                    previewCache.set(url, { data, timestamp: Date.now() });
                    
                    return data;
                } catch (err) {
                    if ((err as Error).name === "AbortError") {
                        throw err; // Re-throw abort errors
                    }
                    
                    // Create fallback
                    const fallback = createFallback(url);
                    previewCache.set(url, { data: fallback, timestamp: Date.now() });
                    return fallback;
                } finally {
                    pendingRequests.delete(url);
                }
            })();

            pendingRequests.set(url, fetchPromise);

            try {
                const data = await fetchPromise;
                // Only update if still mounted and URL hasn't changed
                if (mountedRef.current && currentUrlRef.current === url) {
                    setPreview(data);
                    setLoading(false);
                }
            } catch (err) {
                if ((err as Error).name !== "AbortError" && mountedRef.current && currentUrlRef.current === url) {
                    setError(true);
                    setLoading(false);
                }
            }
        };

        fetchPreview();

        return () => {
            mountedRef.current = false;
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [url, createFallback]);

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


