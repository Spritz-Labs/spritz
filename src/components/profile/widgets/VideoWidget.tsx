"use client";

import { VideoWidgetConfig } from "../ProfileWidgetTypes";

interface VideoWidgetProps {
    config: VideoWidgetConfig;
    size: string;
}

// Validate video ID format for each platform
function isValidVideoId(platform: string, videoId: string): boolean {
    if (!videoId) return false;
    
    switch (platform) {
        case 'youtube':
            // YouTube IDs are 11 characters, alphanumeric with - and _
            return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
        case 'vimeo':
            // Vimeo IDs are numeric
            return /^\d+$/.test(videoId);
        case 'loom':
            // Loom IDs are hex strings
            return /^[a-f0-9]{32}$/.test(videoId);
        default:
            return false;
    }
}

export function VideoWidget({ config, size }: VideoWidgetProps) {
    const { platform, videoId, autoplay = false, muted = true } = config;
    
    // Validate video ID
    if (!isValidVideoId(platform, videoId)) {
        return (
            <div className="w-full h-full flex items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800">
                <div className="text-center">
                    <span className="text-3xl">🎬</span>
                    <p className="text-zinc-500 text-sm mt-2">Invalid video</p>
                </div>
            </div>
        );
    }
    
    const getEmbedUrl = () => {
        switch (platform) {
            case 'youtube':
                // Use youtube-nocookie.com for better privacy
                return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${autoplay ? 1 : 0}&mute=${muted ? 1 : 0}&rel=0&modestbranding=1`;
            case 'vimeo':
                return `https://player.vimeo.com/video/${videoId}?autoplay=${autoplay ? 1 : 0}&muted=${muted ? 1 : 0}&title=0&byline=0&portrait=0`;
            case 'loom':
                return `https://www.loom.com/embed/${videoId}?autoplay=${autoplay ? 1 : 0}`;
            default:
                return '';
        }
    };
    
    return (
        <div className="w-full h-full rounded-2xl overflow-hidden bg-zinc-900">
            <iframe
                src={getEmbedUrl()}
                width="100%"
                height="100%"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                loading="lazy"
                className="rounded-2xl"
            />
        </div>
    );
}
