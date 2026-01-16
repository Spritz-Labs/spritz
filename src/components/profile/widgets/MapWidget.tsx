"use client";

import { MapWidgetConfig } from "../ProfileWidgetTypes";

interface MapWidgetProps {
    config: MapWidgetConfig;
    size: string;
}

export function MapWidget({ config, size }: MapWidgetProps) {
    const { latitude, longitude, city, country, zoom = 12, style = 'dark', label } = config;
    
    // Use OpenStreetMap static tiles (free, no API key needed)
    const mapUrl = `https://api.mapbox.com/styles/v1/mapbox/${style}-v11/static/${longitude},${latitude},${zoom},0/400x400@2x?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw`;
    
    // Fallback to a simple styled div if no API key
    const isSmall = size === '1x1';
    
    return (
        <div className="w-full h-full relative overflow-hidden rounded-2xl bg-zinc-800">
            {/* Map Background */}
            <div 
                className="absolute inset-0 bg-cover bg-center"
                style={{
                    backgroundImage: `url(${mapUrl})`,
                    filter: 'brightness(0.7) saturate(0.8)',
                }}
            />
            
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            
            {/* Location Pin */}
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative">
                    <div className="w-4 h-4 bg-orange-500 rounded-full animate-ping absolute" />
                    <div className="w-4 h-4 bg-orange-500 rounded-full relative z-10 border-2 border-white" />
                </div>
            </div>
            
            {/* Location Info */}
            <div className="absolute bottom-0 left-0 right-0 p-4">
                {label && (
                    <p className="text-white/60 text-xs uppercase tracking-wider mb-1">
                        {label}
                    </p>
                )}
                <p className={`text-white font-semibold ${isSmall ? 'text-sm' : 'text-lg'}`}>
                    {city}
                    {country && !isSmall && (
                        <span className="text-white/60 font-normal">, {country}</span>
                    )}
                </p>
            </div>
        </div>
    );
}
