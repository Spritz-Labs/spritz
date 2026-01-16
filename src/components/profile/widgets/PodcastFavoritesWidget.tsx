"use client";

import { PodcastFavoritesWidgetConfig } from "../ProfileWidgetTypes";

interface PodcastFavoritesWidgetProps {
    config: PodcastFavoritesWidgetConfig;
    size: string;
}

export function PodcastFavoritesWidget({ config, size }: PodcastFavoritesWidgetProps) {
    const { podcasts } = config;
    
    const isSmall = size === '2x1';
    const isWide = size === '4x1';
    const displayPodcasts = podcasts.slice(0, isWide ? 5 : isSmall ? 3 : 4);
    
    if (podcasts.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-rose-900/20 to-red-900/20 rounded-2xl">
                <div className="text-center">
                    <span className="text-4xl">🎙️</span>
                    <p className="text-zinc-500 text-sm mt-2">Add podcasts</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="w-full h-full p-3 bg-gradient-to-br from-rose-900/20 to-red-900/20 rounded-2xl flex flex-col">
            <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-2">
                <span>🎙️</span> Podcasts I Love
            </h3>
            
            <div className={`flex-1 flex ${isWide ? 'flex-row' : 'flex-row'} gap-2`}>
                {displayPodcasts.map((podcast, index) => (
                    <a
                        key={index}
                        href={podcast.spotifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 group cursor-pointer"
                    >
                        {/* Cover */}
                        <div className="relative aspect-square rounded-xl overflow-hidden shadow-lg">
                            {podcast.coverUrl ? (
                                <img
                                    src={podcast.coverUrl}
                                    alt={podcast.name}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center">
                                    <span className="text-3xl">🎙️</span>
                                </div>
                            )}
                            
                            {/* Play button overlay */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center shadow-lg">
                                    <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z"/>
                                    </svg>
                                </div>
                            </div>
                        </div>
                        
                        {/* Info */}
                        {!isSmall && (
                            <div className="mt-1.5 text-center">
                                <p className="text-xs text-white font-medium truncate">{podcast.name}</p>
                                {podcast.latestEpisode && (
                                    <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                                        Latest: {podcast.latestEpisode}
                                    </p>
                                )}
                            </div>
                        )}
                    </a>
                ))}
            </div>
        </div>
    );
}
