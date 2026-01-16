"use client";

import { useState, useEffect } from "react";
import { MapWidgetConfig } from "../ProfileWidgetTypes";

interface MapWidgetProps {
    config: MapWidgetConfig;
    size: string;
}

// Calculate tile coordinates from lat/lon
function getTileCoords(lat: number, lon: number, zoom: number) {
    const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const latRad = lat * Math.PI / 180;
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x, y };
}

export function MapWidget({ config, size }: MapWidgetProps) {
    const { latitude, longitude, city, country, zoom = 13, label } = config;
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);
    
    const mapZoom = Math.min(Math.max(zoom, 1), 16);
    const isSmall = size === '1x1';
    const hasLocation = latitude !== 0 || longitude !== 0;
    
    // Get surrounding tiles for a 3x3 grid (better coverage)
    const { x: centerX, y: centerY } = getTileCoords(latitude, longitude, mapZoom);
    
    // Use CartoDB's dark matter tiles for a sleek look
    const tileBaseUrl = 'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all';
    
    // Generate tile URLs for a 3x3 grid around center
    const tiles = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            tiles.push({
                url: `${tileBaseUrl}/${mapZoom}/${centerX + dx}/${centerY + dy}.png`,
                x: dx,
                y: dy
            });
        }
    }
    
    // Calculate the offset within the center tile for the marker
    const tileCount = Math.pow(2, mapZoom);
    const pixelX = ((longitude + 180) / 360 * tileCount - centerX) * 256;
    const latRad = latitude * Math.PI / 180;
    const pixelY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * tileCount - centerY) * 256;
    
    // Adjust for 3x3 grid (marker is relative to center tile which starts at 256,256)
    const markerX = 256 + pixelX;
    const markerY = 256 + pixelY;
    
    useEffect(() => {
        // Reset state when location changes
        setImageLoaded(false);
        setImageError(false);
    }, [latitude, longitude]);
    
    return (
        <div className="w-full h-full relative overflow-hidden rounded-2xl bg-zinc-900">
            {hasLocation && !imageError ? (
                <>
                    {/* Map tiles container */}
                    <div 
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ 
                            transform: `translate(${-(markerX - 128)}px, ${-(markerY - 128)}px)`,
                        }}
                    >
                        <div 
                            className="relative"
                            style={{ 
                                width: '768px', 
                                height: '768px',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, 256px)',
                                gridTemplateRows: 'repeat(3, 256px)'
                            }}
                        >
                            {tiles.map((tile, i) => (
                                <img
                                    key={i}
                                    src={tile.url}
                                    alt=""
                                    className="w-64 h-64 object-cover"
                                    style={{ 
                                        gridColumn: tile.x + 2, 
                                        gridRow: tile.y + 2,
                                        opacity: imageLoaded ? 1 : 0,
                                        transition: 'opacity 0.3s ease'
                                    }}
                                    onLoad={() => i === 4 && setImageLoaded(true)}
                                    onError={() => setImageError(true)}
                                    loading="lazy"
                                    crossOrigin="anonymous"
                                />
                            ))}
                        </div>
                    </div>
                    
                    {/* Custom marker in center of widget */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="relative">
                            {/* Pulse animation */}
                            <div className="absolute inset-0 animate-ping">
                                <div className="w-8 h-8 rounded-full bg-emerald-500/30" />
                            </div>
                            {/* Marker dot */}
                            <div className="relative w-8 h-8 flex items-center justify-center">
                                <div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white shadow-lg shadow-emerald-500/50" />
                            </div>
                        </div>
                    </div>
                    
                    {/* Gradient overlays for depth */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/40 pointer-events-none" />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent pointer-events-none" />
                    
                    {/* Subtle vignette */}
                    <div className="absolute inset-0 shadow-[inset_0_0_60px_rgba(0,0,0,0.5)] pointer-events-none rounded-2xl" />
                </>
            ) : (
                /* Fallback when no location or map fails */
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                    <div className="text-center">
                        <div className="relative inline-block">
                            <div className="absolute inset-0 animate-ping">
                                <span className="text-4xl opacity-30">📍</span>
                            </div>
                            <span className="text-4xl relative">📍</span>
                        </div>
                        {!hasLocation && (
                            <p className="text-zinc-500 text-sm mt-2">Set a location</p>
                        )}
                    </div>
                </div>
            )}
            
            {/* Location Info */}
            <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 pointer-events-none">
                {label && (
                    <p className="text-emerald-400/80 text-xs uppercase tracking-wider mb-0.5 font-medium">
                        {label}
                    </p>
                )}
                {(city || country) ? (
                    <p className={`text-white font-semibold drop-shadow-lg ${isSmall ? 'text-sm' : 'text-lg'}`}>
                        {city}
                        {country && !isSmall && (
                            <span className="text-white/70 font-normal">, {country}</span>
                        )}
                    </p>
                ) : hasLocation && (
                    <p className={`text-white/60 font-medium ${isSmall ? 'text-xs' : 'text-sm'}`}>
                        {latitude.toFixed(4)}, {longitude.toFixed(4)}
                    </p>
                )}
            </div>
        </div>
    );
}
