"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type SpotifyResult = {
    id: string;
    name: string;
    artist: string;
    image: string;
    url: string;
    type: string;
};

interface SpotifySearchFieldsProps {
    spotifyUri: string;
    onSelect: (url: string) => void;
    onManualInput: (value: string) => void;
}

export function SpotifySearchFields({
    spotifyUri,
    onSelect,
    onManualInput,
}: SpotifySearchFieldsProps) {
    const [mode, setMode] = useState<"paste" | "search">("paste");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchType, setSearchType] = useState<"track" | "album" | "playlist">("track");
    const [results, setResults] = useState<SpotifyResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchAvailable, setSearchAvailable] = useState<boolean | null>(null); // null = unknown
    const [preview, setPreview] = useState<{ title: string; thumbnail: string } | null>(null);
    const [previewError, setPreviewError] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Check if search is available (one-time probe)
    useEffect(() => {
        if (searchAvailable !== null) return;
        fetch("/api/spotify/search?q=test&type=track")
            .then((r) => {
                if (r.status === 503) {
                    setSearchAvailable(false);
                } else {
                    setSearchAvailable(true);
                }
            })
            .catch(() => setSearchAvailable(false));
    }, [searchAvailable]);

    // oEmbed preview for pasted URLs
    useEffect(() => {
        if (!spotifyUri) {
            setPreview(null);
            setPreviewError(false);
            return;
        }

        const isUrl = spotifyUri.startsWith("https://open.spotify.com/");
        const isUri = spotifyUri.startsWith("spotify:");
        if (!isUrl && !isUri) {
            setPreview(null);
            setPreviewError(false);
            return;
        }

        let oembedTarget = spotifyUri;
        if (isUri) {
            const parts = spotifyUri.split(":");
            if (parts.length === 3) {
                oembedTarget = `https://open.spotify.com/${parts[1]}/${parts[2]}`;
            } else {
                setPreviewError(true);
                return;
            }
        }

        let cancelled = false;
        setPreviewLoading(true);
        setPreviewError(false);

        fetch(
            `https://open.spotify.com/oembed?url=${encodeURIComponent(oembedTarget)}`,
        )
            .then((r) => {
                if (!r.ok) throw new Error("not found");
                return r.json();
            })
            .then((data) => {
                if (cancelled) return;
                setPreview({
                    title: data.title || "",
                    thumbnail: data.thumbnail_url || "",
                });
                setPreviewError(false);
            })
            .catch(() => {
                if (!cancelled) {
                    setPreview(null);
                    setPreviewError(true);
                }
            })
            .finally(() => {
                if (!cancelled) setPreviewLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [spotifyUri]);

    // Debounced search
    const doSearch = useCallback(
        (q: string, type: string) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (q.trim().length < 2) {
                setResults([]);
                return;
            }

            debounceRef.current = setTimeout(async () => {
                setIsSearching(true);
                try {
                    const res = await fetch(
                        `/api/spotify/search?q=${encodeURIComponent(q.trim())}&type=${type}`,
                    );
                    const data = await res.json();
                    if (data.results) {
                        setResults(data.results);
                    }
                } catch {
                    /* ignore */
                } finally {
                    setIsSearching(false);
                }
            }, 350);
        },
        [],
    );

    const handleSearchInput = (value: string) => {
        setSearchQuery(value);
        doSearch(value, searchType);
    };

    const handleTypeChange = (type: "track" | "album" | "playlist") => {
        setSearchType(type);
        if (searchQuery.trim().length >= 2) {
            doSearch(searchQuery, type);
        }
    };

    const handleSelectResult = (result: SpotifyResult) => {
        onSelect(result.url);
        setMode("paste"); // Switch back to show the selected link
        setResults([]);
        setSearchQuery("");
    };

    return (
        <div className="space-y-3">
            {/* Mode toggle (only show search tab if available) */}
            {searchAvailable && (
                <div className="flex gap-1 bg-zinc-800/50 rounded-lg p-1">
                    <button
                        type="button"
                        onClick={() => setMode("paste")}
                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            mode === "paste"
                                ? "bg-zinc-700 text-white"
                                : "text-zinc-400 hover:text-zinc-300"
                        }`}
                    >
                        Paste Link
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode("search")}
                        className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            mode === "search"
                                ? "bg-zinc-700 text-white"
                                : "text-zinc-400 hover:text-zinc-300"
                        }`}
                    >
                        Search Spotify
                    </button>
                </div>
            )}

            {mode === "paste" && (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">
                            Spotify Link or URI
                        </label>
                        <input
                            type="text"
                            value={spotifyUri}
                            onChange={(e) => onManualInput(e.target.value)}
                            placeholder="https://open.spotify.com/track/... or spotify:track:..."
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                        <p className="text-zinc-500 text-xs mt-1">
                            Paste a Spotify link for a track, album, or playlist
                        </p>
                    </div>

                    {/* Preview / feedback */}
                    {previewLoading && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 rounded-lg">
                            <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs text-zinc-400">
                                Loading preview...
                            </span>
                        </div>
                    )}

                    {preview && !previewLoading && (
                        <div className="flex items-center gap-3 px-3 py-2 bg-zinc-800/50 rounded-lg border border-green-500/20">
                            {preview.thumbnail && (
                                <img
                                    src={preview.thumbnail}
                                    alt=""
                                    className="w-10 h-10 rounded object-cover"
                                />
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-white truncate">
                                    {preview.title}
                                </p>
                                <p className="text-xs text-green-400">
                                    Valid Spotify link
                                </p>
                            </div>
                        </div>
                    )}

                    {previewError && !previewLoading && spotifyUri && (
                        <div className="px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-xs text-red-400">
                                Could not load this Spotify link. Make sure
                                it&apos;s a valid track, album, or playlist URL.
                            </p>
                        </div>
                    )}
                </>
            )}

            {mode === "search" && (
                <>
                    {/* Type selector */}
                    <div className="flex gap-2">
                        {(
                            ["track", "album", "playlist"] as const
                        ).map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => handleTypeChange(t)}
                                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                    searchType === t
                                        ? "bg-green-600 text-white"
                                        : "bg-zinc-800 text-zinc-400 hover:text-white"
                                }`}
                            >
                                {t === "track"
                                    ? "Tracks"
                                    : t === "album"
                                      ? "Albums"
                                      : "Playlists"}
                            </button>
                        ))}
                    </div>

                    {/* Search input */}
                    <div className="relative">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => handleSearchInput(e.target.value)}
                            placeholder={`Search for a ${searchType}...`}
                            autoFocus
                            className="w-full px-3 py-2 pl-9 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500"
                        />
                        <svg
                            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                        </svg>
                        {isSearching && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                        )}
                    </div>

                    {/* Results */}
                    {results.length > 0 && (
                        <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-700 divide-y divide-zinc-800">
                            {results.map((result) => (
                                <button
                                    key={`${result.type}-${result.id}`}
                                    type="button"
                                    onClick={() => handleSelectResult(result)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800/80 transition-colors text-left"
                                >
                                    {result.image ? (
                                        <img
                                            src={result.image}
                                            alt=""
                                            className={`w-10 h-10 object-cover ${result.type === "artist" ? "rounded-full" : "rounded"}`}
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center text-zinc-600">
                                            🎵
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-white truncate">
                                            {result.name}
                                        </p>
                                        {result.artist && (
                                            <p className="text-xs text-zinc-400 truncate">
                                                {result.artist}
                                            </p>
                                        )}
                                    </div>
                                    <span className="text-[10px] uppercase tracking-wider text-zinc-600 shrink-0">
                                        {result.type}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    {searchQuery.trim().length >= 2 &&
                        !isSearching &&
                        results.length === 0 && (
                            <p className="text-xs text-zinc-500 text-center py-4">
                                No results found
                            </p>
                        )}

                    {/* Currently selected */}
                    {spotifyUri && (
                        <div className="flex items-center gap-3 px-3 py-2 bg-zinc-800/50 rounded-lg border border-green-500/20">
                            <span className="text-green-500 text-lg">✓</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-zinc-400 truncate">
                                    {spotifyUri}
                                </p>
                                <p className="text-xs text-green-400">
                                    Selected
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => onManualInput("")}
                                className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                            >
                                Clear
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
