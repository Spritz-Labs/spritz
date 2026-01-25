"use client";

import { useState } from "react";
import { motion } from "motion/react";

export type LocationData = {
    lat: number;
    lng: number;
    name?: string;
    address?: string;
    accuracy?: number;
    timestamp?: number;
};

type LocationMessageProps = {
    location: LocationData;
    isOwn?: boolean;
    className?: string;
};

// Display a location message with a static map preview
export function LocationMessage({ location, isOwn = false, className = "" }: LocationMessageProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    // Create OpenStreetMap static map URL
    const mapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${location.lat},${location.lng}&zoom=15&size=300x200&markers=${location.lat},${location.lng},orange`;

    // Create link to open in maps app
    const mapsLink = `https://www.google.com/maps?q=${location.lat},${location.lng}`;

    return (
        <div className={`rounded-2xl overflow-hidden ${isOwn ? "rounded-br-md" : "rounded-bl-md"} ${className}`}>
            {/* Map Preview */}
            <a
                href={mapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block relative group"
            >
                <img
                    src={mapUrl}
                    alt="Location"
                    className="w-full h-[150px] object-cover"
                    onError={(e) => {
                        // Fallback if static map fails
                        (e.target as HTMLImageElement).style.display = "none";
                    }}
                />
                {/* Overlay with pin icon */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                    <div className="w-12 h-12 rounded-full bg-[#FF5500] flex items-center justify-center shadow-lg">
                        <span className="text-2xl">📍</span>
                    </div>
                </div>
                {/* Open in Maps indicator */}
                <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-lg text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open in Maps
                </div>
            </a>

            {/* Location Details */}
            <div className={`px-3 py-2 ${isOwn ? "bg-[#FF5500]" : "bg-zinc-800"}`}>
                <div className="flex items-center gap-2">
                    <span className="text-lg">📍</span>
                    <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm ${isOwn ? "text-white" : "text-white"}`}>
                            {location.name || "Shared Location"}
                        </p>
                        {location.address ? (
                            <p className={`text-xs ${isOwn ? "text-white/70" : "text-zinc-400"} truncate`}>
                                {location.address}
                            </p>
                        ) : (
                            <p className={`text-xs ${isOwn ? "text-white/70" : "text-zinc-500"}`}>
                                {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// Button to share current location
type ShareLocationButtonProps = {
    onShare: (location: LocationData) => void;
    disabled?: boolean;
    className?: string;
};

export function ShareLocationButton({ onShare, disabled = false, className = "" }: ShareLocationButtonProps) {
    const [isGettingLocation, setIsGettingLocation] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleShareLocation = async () => {
        if (!navigator.geolocation) {
            setError("Geolocation not supported");
            return;
        }

        setIsGettingLocation(true);
        setError(null);

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const locationData: LocationData = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp,
                };

                // Try to get address from coordinates (reverse geocoding)
                try {
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${locationData.lat}&lon=${locationData.lng}`
                    );
                    const data = await res.json();
                    if (data.display_name) {
                        locationData.address = data.display_name;
                        // Extract a short name
                        if (data.address) {
                            const { road, city, town, village, suburb } = data.address;
                            locationData.name = [road, city || town || village || suburb].filter(Boolean).join(", ");
                        }
                    }
                } catch {
                    // Geocoding failed, continue without address
                }

                onShare(locationData);
                setIsGettingLocation(false);
            },
            (err) => {
                console.error("[Location] Error:", err);
                switch (err.code) {
                    case err.PERMISSION_DENIED:
                        setError("Location permission denied");
                        break;
                    case err.POSITION_UNAVAILABLE:
                        setError("Location unavailable");
                        break;
                    case err.TIMEOUT:
                        setError("Location request timed out");
                        break;
                    default:
                        setError("Failed to get location");
                }
                setIsGettingLocation(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000,
            }
        );
    };

    return (
        <div className={className}>
            <button
                onClick={handleShareLocation}
                disabled={disabled || isGettingLocation}
                className="flex items-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full"
            >
                {isGettingLocation ? (
                    <>
                        <div className="w-5 h-5 border-2 border-zinc-500 border-t-white rounded-full animate-spin" />
                        <span className="text-white">Getting location...</span>
                    </>
                ) : (
                    <>
                        <span className="text-xl">📍</span>
                        <div className="text-left">
                            <p className="text-white font-medium">Share Location</p>
                            <p className="text-xs text-zinc-500">Drop a pin at your current location</p>
                        </div>
                    </>
                )}
            </button>
            {error && (
                <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-red-400 text-xs mt-2 px-1"
                >
                    {error}
                </motion.p>
            )}
        </div>
    );
}

// Detect if content is a location message
export function isLocationMessage(content: string): boolean {
    return content.startsWith("[LOCATION]");
}

// Parse location from message content
export function parseLocationMessage(content: string): LocationData | null {
    if (!isLocationMessage(content)) return null;

    try {
        const json = content.replace("[LOCATION]", "");
        return JSON.parse(json);
    } catch {
        return null;
    }
}

// Format location data for sending
export function formatLocationMessage(location: LocationData): string {
    return `[LOCATION]${JSON.stringify(location)}`;
}
