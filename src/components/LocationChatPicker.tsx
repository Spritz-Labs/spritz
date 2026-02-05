"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import type { PlaceResult } from "@/app/api/places/search/route";
import type { LocationChat } from "@/hooks/useLocationChat";

type LocationChatPickerProps = {
    isOpen: boolean;
    onClose: () => void;
    onChatCreated?: (chat: LocationChat) => void;
};

// Place type to emoji mapping
const placeTypeEmojis: Record<string, string> = {
    restaurant: "🍽️",
    cafe: "☕",
    coffee_shop: "☕",
    bar: "🍺",
    night_club: "🎉",
    park: "🌳",
    museum: "🏛️",
    shopping_mall: "🛍️",
    gym: "💪",
    movie_theater: "🎬",
    bowling_alley: "🎳",
    spa: "💆",
    hotel: "🏨",
    airport: "✈️",
    train_station: "🚂",
    library: "📚",
    university: "🎓",
    hospital: "🏥",
    pharmacy: "💊",
    supermarket: "🛒",
    bakery: "🥐",
    art_gallery: "🎨",
    zoo: "🦁",
    aquarium: "🐠",
    casino: "🎰",
    stadium: "🏟️",
    beach: "🏖️",
};

function getPlaceEmoji(types: string[]): string {
    for (const type of types) {
        if (placeTypeEmojis[type]) {
            return placeTypeEmojis[type];
        }
    }
    return "📍";
}

function formatPlaceType(types: string[]): string {
    const readable = types[0]?.replace(/_/g, " ");
    return readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : "Place";
}

export function LocationChatPicker({ isOpen, onClose, onChatCreated }: LocationChatPickerProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [places, setPlaces] = useState<PlaceResult[]>([]);
    const [existingChats, setExistingChats] = useState<LocationChat[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isCreating, setIsCreating] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [locationErrorCode, setLocationErrorCode] = useState<number | null>(null);
    const [isRequestingLocation, setIsRequestingLocation] = useState(false);
    const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);
    
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Function to request location with better error handling
    const requestLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setLocationError("Geolocation is not supported by your browser");
            setLocationErrorCode(-1);
            return;
        }

        setIsRequestingLocation(true);
        setLocationError(null);
        setLocationErrorCode(null);

        // Try with high accuracy first, then fall back to lower accuracy
        const tryGetLocation = (highAccuracy: boolean, timeout: number) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    console.log("[LocationChatPicker] Got location:", position.coords);
                    setUserLocation({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                    });
                    setLocationError(null);
                    setLocationErrorCode(null);
                    setIsRequestingLocation(false);
                },
                (err) => {
                    console.error("[LocationChatPicker] Geolocation error:", err.code, err.message);
                    
                    // If high accuracy failed due to timeout, try with low accuracy
                    if (highAccuracy && err.code === 3) {
                        console.log("[LocationChatPicker] Retrying with low accuracy...");
                        tryGetLocation(false, 30000);
                        return;
                    }

                    setIsRequestingLocation(false);
                    setLocationErrorCode(err.code);
                    
                    switch (err.code) {
                        case 1: // PERMISSION_DENIED
                            setLocationError("Location access was denied. Please enable it in your browser settings.");
                            break;
                        case 2: // POSITION_UNAVAILABLE
                            setLocationError("Unable to determine your location. Please try again.");
                            break;
                        case 3: // TIMEOUT
                            setLocationError("Location request timed out. Please check your connection and try again.");
                            break;
                        default:
                            setLocationError("An error occurred while getting your location.");
                    }
                },
                { 
                    enableHighAccuracy: highAccuracy, 
                    timeout: timeout,
                    maximumAge: 60000 // Accept cached position up to 1 minute old
                }
            );
        };

        tryGetLocation(true, 15000);
    }, []);

    // Get user's location on mount
    useEffect(() => {
        if (isOpen && !userLocation && !isRequestingLocation && !locationError) {
            requestLocation();
        }
    }, [isOpen, userLocation, isRequestingLocation, locationError, requestLocation]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Search for places
    const searchPlaces = useCallback(async (query: string) => {
        if (!userLocation) return;

        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/places/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: query || undefined,
                    lat: userLocation.lat,
                    lng: userLocation.lng,
                    radius: 2000, // 2km radius
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to search places");
            }

            const data = await response.json();
            setPlaces(data.places || []);
        } catch (err) {
            console.error("[LocationChatPicker] Search error:", err);
            setError("Failed to search places. Try again.");
        } finally {
            setIsLoading(false);
        }
    }, [userLocation]);

    // Fetch existing location chats nearby
    const fetchExistingChats = useCallback(async () => {
        if (!userLocation) return;

        try {
            const response = await fetch(
                `/api/location-chats?lat=${userLocation.lat}&lng=${userLocation.lng}&radius=5000`
            );

            if (response.ok) {
                const data = await response.json();
                setExistingChats(data.chats || []);
            }
        } catch (err) {
            console.error("[LocationChatPicker] Fetch chats error:", err);
        }
    }, [userLocation]);

    // Initial search when location is available
    useEffect(() => {
        if (userLocation && isOpen) {
            searchPlaces("");
            fetchExistingChats();
        }
    }, [userLocation, isOpen, searchPlaces, fetchExistingChats]);

    // Debounced search
    useEffect(() => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        if (userLocation) {
            searchTimeoutRef.current = setTimeout(() => {
                searchPlaces(searchQuery);
            }, 300);
        }

        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, [searchQuery, userLocation, searchPlaces]);

    // Create a location chat
    const handleCreateChat = async (place: PlaceResult) => {
        setIsCreating(place.placeId);
        setError(null);

        try {
            const response = await fetch("/api/location-chats", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    placeId: place.placeId,
                    name: place.name,
                    emoji: getPlaceEmoji(place.types),
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to create chat");
            }

            const data = await response.json();
            
            if (data.existing) {
                // Chat already exists, navigate to it
                onChatCreated?.(data.chat);
            } else {
                // New chat created
                onChatCreated?.(data.chat);
            }
            
            onClose();
        } catch (err) {
            console.error("[LocationChatPicker] Create error:", err);
            setError("Failed to create chat. Try again.");
        } finally {
            setIsCreating(null);
        }
    };

    // Join an existing chat
    const handleJoinChat = async (chat: LocationChat) => {
        setIsCreating(chat.id);
        setError(null);

        try {
            const response = await fetch(`/api/location-chats/${chat.id}/join`, {
                method: "POST",
            });

            if (!response.ok) {
                throw new Error("Failed to join chat");
            }

            onChatCreated?.(chat);
            onClose();
        } catch (err) {
            console.error("[LocationChatPicker] Join error:", err);
            setError("Failed to join chat. Try again.");
        } finally {
            setIsCreating(null);
        }
    };

    if (!isOpen || typeof document === "undefined") return null;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[60] bg-black/80 flex items-end sm:items-center justify-center"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ y: "100%", opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: "100%", opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        className="w-full max-w-lg bg-zinc-900 rounded-t-3xl sm:rounded-2xl max-h-[85vh] flex flex-col overflow-hidden"
                        style={{
                            paddingBottom: "env(safe-area-inset-bottom, 0px)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                            <div>
                                <h2 className="text-lg font-semibold text-white">Location Chats</h2>
                                <p className="text-xs text-zinc-500">Find or create public chat rooms for nearby places</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 -mr-2 text-zinc-400 hover:text-white transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Search Input */}
                        <div className="p-4 border-b border-zinc-800">
                            <div className="relative">
                                <svg
                                    className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    placeholder="Search for a place..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF5500]/50 focus:border-[#FF5500]"
                                />
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto">
                            {/* Location Loading */}
                            {isRequestingLocation && !userLocation && (
                                <div className="p-4 m-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                                    <div className="flex items-center gap-3">
                                        <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                                        <div>
                                            <p className="text-blue-400 text-sm font-medium">Getting your location...</p>
                                            <p className="text-blue-400/70 text-xs mt-1">
                                                This may take a few seconds
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Location Error */}
                            {locationError && !isRequestingLocation && (
                                <div className="p-4 m-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                                    <div className="flex items-start gap-3">
                                        <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        </svg>
                                        <div className="flex-1">
                                            <p className="text-amber-400 text-sm font-medium">{locationError}</p>
                                            <p className="text-amber-400/70 text-xs mt-1">
                                                {locationErrorCode === 1 
                                                    ? "Check your browser's address bar for the location icon, or go to Settings > Privacy > Location Services"
                                                    : "Location is needed to find nearby places"}
                                            </p>
                                            <button
                                                onClick={requestLocation}
                                                className="mt-3 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-sm font-medium rounded-lg transition-colors"
                                            >
                                                Try Again
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="p-4 m-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                                    <p className="text-red-400 text-sm">{error}</p>
                                </div>
                            )}

                            {/* Existing Nearby Chats */}
                            {existingChats.length > 0 && !searchQuery && (
                                <div className="p-4">
                                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                                        Active Nearby Chats
                                    </h3>
                                    <div className="space-y-2">
                                        {existingChats.map((chat) => (
                                            <button
                                                key={chat.id}
                                                onClick={() => handleJoinChat(chat)}
                                                disabled={isCreating === chat.id}
                                                className="w-full p-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors text-left flex items-center gap-3 disabled:opacity-50"
                                            >
                                                <div className="w-12 h-12 rounded-xl bg-[#FF5500]/20 flex items-center justify-center text-2xl">
                                                    {chat.emoji}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-white truncate">{chat.name}</p>
                                                    <p className="text-xs text-zinc-500 truncate">
                                                        {chat.google_place_address}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-xs text-zinc-500">
                                                            {chat.member_count} members
                                                        </span>
                                                        {chat.google_place_rating && (
                                                            <span className="text-xs text-amber-400 flex items-center gap-0.5">
                                                                ⭐ {chat.google_place_rating.toFixed(1)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {isCreating === chat.id ? (
                                                    <div className="w-5 h-5 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Loading */}
                            {isLoading && (
                                <div className="flex items-center justify-center py-12">
                                    <div className="w-8 h-8 border-2 border-zinc-600 border-t-[#FF5500] rounded-full animate-spin" />
                                </div>
                            )}

                            {/* Search Results */}
                            {!isLoading && places.length > 0 && (
                                <div className="p-4">
                                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                                        {searchQuery ? "Search Results" : "Nearby Places"}
                                    </h3>
                                    <div className="space-y-2">
                                        {places.map((place) => {
                                            const existingChat = existingChats.find(
                                                (c) => c.google_place_name === place.name
                                            );
                                            
                                            return (
                                                <button
                                                    key={place.placeId}
                                                    onClick={() => existingChat 
                                                        ? handleJoinChat(existingChat) 
                                                        : handleCreateChat(place)
                                                    }
                                                    disabled={isCreating === place.placeId}
                                                    className="w-full p-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors text-left flex items-center gap-3 disabled:opacity-50"
                                                >
                                                    <div className="w-12 h-12 rounded-xl bg-zinc-700 flex items-center justify-center text-2xl">
                                                        {getPlaceEmoji(place.types)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-white truncate">{place.name}</p>
                                                        <p className="text-xs text-zinc-500 truncate">
                                                            {place.vicinity || place.address}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-xs text-zinc-400">
                                                                {formatPlaceType(place.types)}
                                                            </span>
                                                            {place.rating && (
                                                                <span className="text-xs text-amber-400 flex items-center gap-0.5">
                                                                    ⭐ {place.rating.toFixed(1)}
                                                                </span>
                                                            )}
                                                            {place.openNow !== undefined && (
                                                                <span className={`text-xs ${place.openNow ? "text-green-400" : "text-red-400"}`}>
                                                                    {place.openNow ? "Open" : "Closed"}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {isCreating === place.placeId ? (
                                                        <div className="w-5 h-5 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                                                    ) : existingChat ? (
                                                        <span className="text-xs text-[#FF5500] font-medium">Join</span>
                                                    ) : (
                                                        <span className="text-xs text-zinc-400">Create</span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Empty State */}
                            {!isLoading && places.length === 0 && userLocation && (
                                <div className="flex flex-col items-center justify-center py-12 px-4">
                                    <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                                        <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        </svg>
                                    </div>
                                    <p className="text-zinc-400 text-center">
                                        No places found nearby.
                                        <br />
                                        Try searching for a specific place.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Footer info */}
                        <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                                <svg className="w-4 h-4 text-[#FF5500]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                <span>Location chats are public and decentralized via Logos</span>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
