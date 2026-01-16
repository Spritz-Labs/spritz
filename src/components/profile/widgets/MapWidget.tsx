"use client";

import { useState } from "react";
import { MapWidgetConfig } from "../ProfileWidgetTypes";

interface MapWidgetProps {
    config: MapWidgetConfig;
    size: string;
}

export function MapWidget({ config, size }: MapWidgetProps) {
    const { latitude, longitude, city, country, zoom = 12, label } = config;
    const [mapError, setMapError] = useState(false);
    
    // Use OpenStreetMap static map service (free, no API key needed)
    // Using staticmap.openstreetmap.de which is a free static map tile service
    const mapZoom = Math.min(Math.max(zoom, 1), 18); // Clamp zoom to valid range
    const mapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=${mapZoom}&size=600x400&maptype=osm&markers=${latitude},${longitude},red-pushpin`;
    
    // Alternative: Use CartoDB dark tiles as background (looks nicer)
    const tileUrl = `https://a.basemaps.cartocdn.com/dark_all/${mapZoom}/${Math.floor((longitude + 180) / 360 * Math.pow(2, mapZoom))}/${Math.floor((1 - Math.log(Math.tan(latitude * Math.PI / 180) + 1 / Math.cos(latitude * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, mapZoom))}.png`;
    
    const isSmall = size === '1x1';
    const hasLocation = latitude !== 0 || longitude !== 0;
    
    return (
        <div className="w-full h-full relative overflow-hidden rounded-2xl bg-zinc-800">
            {hasLocation && !mapError ? (
                <>
                    {/* Map Background using iframe for interactive feel */}
                    <iframe
                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.02},${latitude - 0.015},${longitude + 0.02},${latitude + 0.015}&layer=mapnik&marker=${latitude},${longitude}`}
                        className="absolute inset-0 w-full h-full border-0"
                        style={{ filter: 'brightness(0.8) saturate(0.9) hue-rotate(10deg)' }}
                        loading="lazy"
                        onError={() => setMapError(true)}
                    />
                    
                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                </>
            ) : (
                /* Fallback when no location or map fails */
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                    <div className="text-center">
                        <span className="text-4xl mb-2 block">📍</span>
                        {!hasLocation && (
                            <p className="text-zinc-500 text-sm">Set a location</p>
                        )}
                    </div>
                </div>
            )}
            
            {/* Location Info */}
            {(city || country) && (
                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 pointer-events-none">
                    {label && (
                        <p className="text-white/60 text-xs uppercase tracking-wider mb-0.5">
                            {label}
                        </p>
                    )}
                    <p className={`text-white font-semibold drop-shadow-lg ${isSmall ? 'text-sm' : 'text-lg'}`}>
                        {city}
                        {country && !isSmall && (
                            <span className="text-white/70 font-normal">, {country}</span>
                        )}
                    </p>
                </div>
            )}
        </div>
    );
}
