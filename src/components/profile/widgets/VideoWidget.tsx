"use client";

import { VideoWidgetConfig } from "../ProfileWidgetTypes";

interface VideoWidgetProps {
    config: VideoWidgetConfig;
    size: string;
}

export function VideoWidget({ config, size }: VideoWidgetProps) {
    const { platform, videoId, autoplay = false, muted = true } = config;
    
    const getEmbedUrl = () => {
        switch (platform) {
            case 'youtube':
                return `https://www.youtube.com/embed/${videoId}?autoplay=${autoplay ? 1 : 0}&mute=${muted ? 1 : 0}&rel=0&modestbranding=1`;
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
