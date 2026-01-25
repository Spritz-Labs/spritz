"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";

type GifResult = {
    id: string;
    url: string;
    preview: string;
    width: number;
    height: number;
    title: string;
};

type GifPickerProps = {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (gifUrl: string) => void;
    position?: "top" | "bottom";
};

// GIPHY API key - Get your own at https://developers.giphy.com/
const GIPHY_API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY || "";

export function GifPicker({ isOpen, onClose, onSelect, position = "top" }: GifPickerProps) {
    const [query, setQuery] = useState("");
    const [gifs, setGifs] = useState<GifResult[]>([]);
    const [trending, setTrending] = useState<GifResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Fetch trending GIFs on mount
    useEffect(() => {
        if (isOpen && trending.length === 0) {
            fetchTrending();
        }
    }, [isOpen, trending.length]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [isOpen, onClose]);

    const fetchTrending = async () => {
        if (!GIPHY_API_KEY) {
            setError("GIPHY API key not configured");
            return;
        }
        
        try {
            setLoading(true);
            setError(null);
            const response = await fetch(
                `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=pg-13`
            );
            if (!response.ok) throw new Error("Failed to fetch trending GIFs");
            const data = await response.json();
            setTrending(parseGifResults(data.data));
        } catch (err) {
            console.error("Error fetching trending GIFs:", err);
            setError("Failed to load GIFs. Check API key.");
        } finally {
            setLoading(false);
        }
    };

    const searchGifs = useCallback(async (searchQuery: string) => {
        if (!searchQuery.trim()) {
            setGifs([]);
            return;
        }

        if (!GIPHY_API_KEY) {
            setError("GIPHY API key not configured");
            return;
        }

        try {
            setLoading(true);
            setError(null);
            const response = await fetch(
                `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(searchQuery)}&limit=30&rating=pg-13`
            );
            if (!response.ok) throw new Error("Failed to search GIFs");
            const data = await response.json();
            setGifs(parseGifResults(data.data));
        } catch (err) {
            console.error("Error searching GIFs:", err);
            setError("Failed to search GIFs");
        } finally {
            setLoading(false);
        }
    }, []);

    // Debounced search
    const handleSearch = (value: string) => {
        setQuery(value);
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
            searchGifs(value);
        }, 300);
    };

    // Parse GIPHY API results
    const parseGifResults = (results: any[]): GifResult[] => {
        return results.map((item) => ({
            id: item.id,
            url: item.images?.original?.url || item.images?.fixed_height?.url || "",
            preview: item.images?.fixed_height_small?.url || item.images?.preview_gif?.url || "",
            width: parseInt(item.images?.fixed_height?.width) || 200,
            height: parseInt(item.images?.fixed_height?.height) || 200,
            title: item.title || "",
        }));
    };

    const handleSelect = (gif: GifResult) => {
        onSelect(gif.url);
        onClose();
        setQuery("");
        setGifs([]);
    };

    const displayGifs = query.trim() ? gifs : trending;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    ref={containerRef}
                    initial={{ opacity: 0, y: position === "top" ? 10 : -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: position === "top" ? 10 : -10, scale: 0.95 }}
                    className={`absolute ${position === "top" ? "bottom-full mb-2" : "top-full mt-2"} left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden z-50`}
                    style={{ maxHeight: "400px", minWidth: "300px" }}
                >
                    {/* Header */}
                    <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-3 z-10">
                        <div className="relative">
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
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => handleSearch(e.target.value)}
                                placeholder="Search GIFs..."
                                className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF5500]/50"
                            />
                        </div>
                        <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-zinc-500">
                                {query.trim() ? `Results for "${query}"` : "🔥 Trending"}
                            </span>
                            {/* GIPHY Attribution - Required by GIPHY API Terms */}
                            <a
                                href="https://giphy.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                            >
                                <Image
                                    src="https://giphy.com/static/img/giphy_logo_square_social.png"
                                    alt="Powered by GIPHY"
                                    width={20}
                                    height={20}
                                    className="rounded"
                                    unoptimized
                                />
                                <span className="text-[10px] text-zinc-500 font-medium">Powered by GIPHY</span>
                            </a>
                        </div>
                    </div>

                    {/* GIF Grid */}
                    <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: "320px" }}>
                        {loading && displayGifs.length === 0 ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-8 h-8 border-2 border-zinc-600 border-t-[#FF5500] rounded-full animate-spin" />
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                                <svg className="w-10 h-10 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-sm">{error}</p>
                                {!GIPHY_API_KEY && (
                                    <p className="text-xs text-zinc-600 mt-1 text-center px-4">
                                        Add NEXT_PUBLIC_GIPHY_API_KEY to your .env.local
                                    </p>
                                )}
                                <button
                                    onClick={() => query.trim() ? searchGifs(query) : fetchTrending()}
                                    className="mt-2 text-xs text-[#FF5500] hover:underline"
                                >
                                    Try again
                                </button>
                            </div>
                        ) : displayGifs.length === 0 && query.trim() ? (
                            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                                <span className="text-4xl mb-2">🤷</span>
                                <p className="text-sm">No GIFs found</p>
                                <p className="text-xs text-zinc-600 mt-1">Try a different search</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-1 p-2">
                                {displayGifs.map((gif) => (
                                    <button
                                        key={gif.id}
                                        onClick={() => handleSelect(gif)}
                                        className="relative aspect-square overflow-hidden rounded-lg bg-zinc-800 hover:ring-2 hover:ring-[#FF5500] transition-all group"
                                    >
                                        <img
                                            src={gif.preview}
                                            alt={gif.title}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// Quick categories for GIF suggestions
export const GIF_CATEGORIES = [
    { emoji: "😂", label: "Funny", query: "funny" },
    { emoji: "👍", label: "Thumbs Up", query: "thumbs up" },
    { emoji: "🎉", label: "Celebrate", query: "celebrate" },
    { emoji: "❤️", label: "Love", query: "love" },
    { emoji: "😢", label: "Sad", query: "sad" },
    { emoji: "🤔", label: "Thinking", query: "thinking" },
    { emoji: "🙏", label: "Thanks", query: "thank you" },
    { emoji: "🔥", label: "Fire", query: "fire lit" },
];
