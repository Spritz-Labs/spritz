"use client";

import { SpotifyWidgetConfig } from "../ProfileWidgetTypes";

interface SpotifyWidgetProps {
    config: SpotifyWidgetConfig;
    size: string;
}

export function SpotifyWidget({ config, size }: SpotifyWidgetProps) {
    const { spotifyUri, type, theme = 'dark' } = config;
    
    // Convert Spotify URI to embed URL
    // spotify:track:6rqhFgbbKwnb9MLmUQDhG6 -> https://open.spotify.com/embed/track/6rqhFgbbKwnb9MLmUQDhG6
    const embedUrl = (() => {
        if (spotifyUri.startsWith('https://open.spotify.com/embed/')) {
            return spotifyUri;
        }
        if (spotifyUri.startsWith('https://open.spotify.com/')) {
            return spotifyUri.replace('open.spotify.com/', 'open.spotify.com/embed/');
        }
        if (spotifyUri.startsWith('spotify:')) {
            const [, type, id] = spotifyUri.split(':');
            return `https://open.spotify.com/embed/${type}/${id}`;
        }
        return spotifyUri;
    })();
    
    const isCompact = size === '2x1' || size === '4x1';
    const height = isCompact ? '80' : '352';
    
    return (
        <div className="w-full h-full rounded-2xl overflow-hidden bg-zinc-900">
            <iframe
                src={`${embedUrl}?utm_source=generator&theme=${theme === 'dark' ? '0' : '1'}`}
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
