"use client";

import { SpotifyWidgetConfig } from "../ProfileWidgetTypes";
import { sanitizeSpotifyUrl } from "@/lib/urlSecurity";

interface SpotifyWidgetProps {
    config: SpotifyWidgetConfig;
    size: string;
}

export function SpotifyWidget({ config, size }: SpotifyWidgetProps) {
    const { spotifyUri, type, theme = 'dark' } = config;
    
    // Sanitize and validate Spotify URL
    const safeEmbedUrl = sanitizeSpotifyUrl(spotifyUri);
    
    const isCompact = size === '2x1' || size === '4x1';
    const height = isCompact ? '80' : '352';
    
    // If URL is invalid, show placeholder
    if (!safeEmbedUrl) {
        return (
            <div className="w-full h-full flex items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800">
                <div className="text-center">
                    <span className="text-3xl">🎵</span>
                    <p className="text-zinc-500 text-sm mt-2">Invalid Spotify link</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="w-full h-full rounded-2xl overflow-hidden bg-zinc-900">
            <iframe
                src={`${safeEmbedUrl}?utm_source=generator&theme=${theme === 'dark' ? '0' : '1'}`}
                width="100%"
                height="100%"
                style={{ minHeight: `${height}px` }}
                frameBorder="0"
                allowFullScreen
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                className="rounded-2xl"
            />
        </div>
    );
}
