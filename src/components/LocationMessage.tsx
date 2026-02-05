"use client";

import { useState, useEffect, useCallback } from "react";
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

// 5 minute walking distance is approximately 400 meters (average walking speed ~4.8 km/h)
const WALKING_RADIUS_METERS = 400;
const WALKING_RADIUS_DEGREES = WALKING_RADIUS_METERS / 111320; // Approximate conversion at equator

// Display a location message with a useful map preview
export function LocationMessage({ location, isOwn = false, className = "" }: LocationMessageProps) {
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapError, setMapError] = useState(false);

    // Calculate bounding box for ~5 minute walking distance (~400m radius)
    // Adjust for latitude (longitude degrees are smaller at higher latitudes)
    const latRadiusDeg = WALKING_RADIUS_DEGREES;
    const lngRadiusDeg = WALKING_RADIUS_DEGREES / Math.cos(location.lat * Math.PI / 180);
    
    // Create OpenStreetMap embed with 5-minute walking radius view
    // bbox format: left,bottom,right,top (minLng, minLat, maxLng, maxLat)
    const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${
        location.lng - lngRadiusDeg
    },${
        location.lat - latRadiusDeg
    },${
        location.lng + lngRadiusDeg
    },${
        location.lat + latRadiusDeg
    }&layer=mapnik&marker=${location.lat},${location.lng}`;
    
    // Fallback static image from OSM with appropriate zoom for ~400m radius (zoom 15-16)
    const staticMapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${location.lat},${location.lng}&zoom=15&size=400x200&maptype=mapnik&markers=${location.lat},${location.lng},red`;
    
    // Smart routing link - detects platform and opens appropriate native app
    // iOS: Apple Maps via maps:// scheme, Android/Desktop: Google Maps
    const getNavigationUrl = useCallback(() => {
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const isAndroid = /Android/.test(navigator.userAgent);
        
        if (isIOS) {
            // Apple Maps URL scheme - opens in Apple Maps app
            return `maps://maps.apple.com/?daddr=${location.lat},${location.lng}&dirflg=w`;
        } else if (isAndroid) {
            // Google Maps intent for Android - opens in Google Maps app
            return `geo:${location.lat},${location.lng}?q=${location.lat},${location.lng}`;
        } else {
            // Desktop/fallback - Google Maps web with directions
            return `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}&travelmode=walking`;
        }
    }, [location.lat, location.lng]);
    
    // Standard map viewing links (not navigation)
    const googleMapsViewUrl = `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`;
    const appleMapsViewUrl = `https://maps.apple.com/?ll=${location.lat},${location.lng}&q=${encodeURIComponent(location.name || "Shared Location")}`;
    
    // Handle opening in native app for navigation
    const handleNavigate = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const url = getNavigationUrl();
        window.open(url, "_blank");
    }, [getNavigationUrl]);
    
    // Handle viewing location (not navigating)
    const handleViewLocation = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const url = isIOS ? appleMapsViewUrl : googleMapsViewUrl;
        window.open(url, "_blank");
    }, [appleMapsViewUrl, googleMapsViewUrl]);

    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`rounded-2xl overflow-hidden shadow-lg ${isOwn ? "rounded-br-md" : "rounded-bl-md"} ${className}`}
            style={{ maxWidth: "320px", minWidth: "260px" }}
        >
            {/* Interactive Map Preview - Shows ~5 min walking radius */}
            <div className="relative bg-zinc-900">
                {/* Map Container */}
                <div className="relative w-full h-[180px] overflow-hidden">
                    {!mapError ? (
                        <>
                            {/* OpenStreetMap Embed - Shows map with ~5 min walking radius */}
                            <iframe
                                src={embedUrl}
                                className={`w-full h-full border-0 pointer-events-none transition-opacity duration-300 ${mapLoaded ? "opacity-100" : "opacity-0"}`}
                                onLoad={() => setMapLoaded(true)}
                                onError={() => setMapError(true)}
                                title="Location Map"
                                loading="lazy"
                            />
                            
                            {/* Loading State */}
                            {!mapLoaded && (
                                <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-8 h-8 border-2 border-zinc-600 border-t-[#FF5500] rounded-full animate-spin" />
                                        <span className="text-xs text-zinc-500">Loading map...</span>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        /* Fallback Static Map */
                        <img
                            src={staticMapUrl}
                            alt="Location map"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                // Ultimate fallback - show coordinates on a styled background
                                (e.target as HTMLImageElement).style.display = "none";
                            }}
                        />
                    )}
                    
                    {/* Walking radius indicator */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 bg-black/60 backdrop-blur-sm rounded-full text-[10px] text-white/80">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                        <span>~5 min walk</span>
                    </div>
                    
                    {/* Clickable Overlay */}
                    <button
                        onClick={handleViewLocation}
                        className="absolute inset-0 z-10 group cursor-pointer"
                    >
                        {/* Subtle gradient for better text readability */}
                        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />
                        
                        {/* Hover indicator */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 group-active:bg-black/30 transition-colors flex items-center justify-center">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-lg flex items-center gap-2">
                                <svg className="w-4 h-4 text-zinc-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                <span className="text-sm font-medium text-zinc-800">View in Maps</span>
                            </div>
                        </div>
                        
                        {/* Custom pin marker overlay (shown when map fails) */}
                        {mapError && (
                            <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
                                <div className="relative">
                                    {/* Pin shadow */}
                                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-4 h-1 bg-black/30 rounded-full blur-sm" />
                                    {/* Pin */}
                                    <div className="w-10 h-10 bg-[#FF5500] rounded-full flex items-center justify-center shadow-lg border-2 border-white relative">
                                        <span className="text-xl">📍</span>
                                        {/* Pin point */}
                                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[10px] border-l-transparent border-r-transparent border-t-[#FF5500]" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </button>
                </div>
            </div>

            {/* Location Details */}
            <div className={`px-4 py-3 ${isOwn ? "bg-[#FF5500]" : "bg-zinc-800"}`}>
                <div className="flex items-start gap-3">
                    {/* Pin Icon */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isOwn ? "bg-white/20" : "bg-zinc-700"}`}>
                        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                        </svg>
                    </div>
                    
                    {/* Location Text */}
                    <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm leading-tight ${isOwn ? "text-white" : "text-white"}`}>
                            {location.name || "Shared Location"}
                        </p>
                        {location.address ? (
                            <p className={`text-xs mt-0.5 leading-snug ${isOwn ? "text-white/80" : "text-zinc-400"}`}>
                                {/* Show truncated address - first 60 chars */}
                                {location.address.length > 60 
                                    ? location.address.substring(0, 60) + "..."
                                    : location.address
                                }
                            </p>
                        ) : (
                            <p className={`text-xs mt-0.5 font-mono ${isOwn ? "text-white/70" : "text-zinc-500"}`}>
                                {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                            </p>
                        )}
                        
                        {/* Accuracy indicator if available */}
                        {location.accuracy && location.accuracy < 100 && (
                            <div className={`flex items-center gap-1 mt-1 ${isOwn ? "text-white/60" : "text-zinc-500"}`}>
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                    <circle cx="12" cy="12" r="3"/>
                                    <path d="M12 2v4m0 12v4M2 12h4m12 0h4" stroke="currentColor" strokeWidth="2" fill="none"/>
                                </svg>
                                <span className="text-[10px]">±{Math.round(location.accuracy)}m accuracy</span>
                            </div>
                        )}
                    </div>
                    
                    {/* Navigate Button - Opens in native maps app with directions */}
                    <button
                        onClick={handleNavigate}
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                            isOwn 
                                ? "bg-white/20 hover:bg-white/30 active:bg-white/40" 
                                : "bg-[#FF5500] hover:bg-[#FF6600] active:bg-[#E64D00]"
                        }`}
                        title="Get directions"
                    >
                        {/* Navigation arrow icon */}
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                    </button>
                </div>
            </div>
        </motion.div>
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
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${locationData.lat}&lon=${locationData.lng}`,
                        {
                            headers: {
                                'User-Agent': 'Spritz Chat App'
                            }
                        }
                    );
                    const data = await res.json();
                    if (data.display_name) {
                        locationData.address = data.display_name;
                        // Extract a short name
                        if (data.address) {
                            const { road, house_number, city, town, village, suburb, neighbourhood } = data.address;
                            const street = house_number ? `${house_number} ${road}` : road;
                            const area = city || town || village || suburb || neighbourhood;
                            locationData.name = [street, area].filter(Boolean).join(", ") || "Dropped Pin";
                        }
                    }
                } catch {
                    // Geocoding failed, continue without address
                    locationData.name = "Dropped Pin";
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
                className="flex items-center gap-3 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full"
            >
                {isGettingLocation ? (
                    <>
                        <div className="w-6 h-6 border-2 border-zinc-500 border-t-[#FF5500] rounded-full animate-spin" />
                        <span className="text-white">Getting location...</span>
                    </>
                ) : (
                    <>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF5500] to-[#FF7733] flex items-center justify-center shadow-lg">
                            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                            </svg>
                        </div>
                        <div className="text-left flex-1">
                            <p className="text-white font-medium">Share Location</p>
                            <p className="text-xs text-zinc-500">Drop a pin at your current spot</p>
                        </div>
                        <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
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
