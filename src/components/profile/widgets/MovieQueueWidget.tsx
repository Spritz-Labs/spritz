"use client";

import { MovieQueueWidgetConfig } from "../ProfileWidgetTypes";

interface MovieQueueWidgetProps {
    config: MovieQueueWidgetConfig;
    size: string;
}

const STATUS_STYLES = {
    watching: { badge: 'bg-green-500/20 text-green-400', icon: '▶️' },
    finished: { badge: 'bg-blue-500/20 text-blue-400', icon: '✓' },
    want_to_watch: { badge: 'bg-amber-500/20 text-amber-400', icon: '📋' },
};

export function MovieQueueWidget({ config, size }: MovieQueueWidgetProps) {
    const { items, title = "Watch List" } = config;
    
    const isSmall = size === '2x1';
    const isLarge = size === '4x2';
    const displayItems = items.slice(0, isLarge ? 8 : isSmall ? 4 : 6);
    
    if (items.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/20 to-pink-900/20 rounded-2xl">
                <div className="text-center">
                    <span className="text-4xl">🎬</span>
                    <p className="text-zinc-500 text-sm mt-2">Add movies/shows</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="w-full h-full p-3 bg-gradient-to-br from-purple-900/20 to-pink-900/20 rounded-2xl flex flex-col">
            <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-2">
                <span>🎬</span> {title}
            </h3>
            
            <div className={`flex-1 grid gap-2 ${isSmall ? 'grid-cols-4' : isLarge ? 'grid-cols-4' : 'grid-cols-3'}`}>
                {displayItems.map((item, index) => (
                    <div
                        key={index}
                        className="group cursor-pointer relative"
                    >
                        {/* Poster */}
                        <div className="relative aspect-[2/3] rounded-lg overflow-hidden shadow-lg">
                            {item.posterUrl ? (
                                <img
                                    src={item.posterUrl}
                                    alt={item.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center">
                                    <span className="text-2xl">{item.type === 'movie' ? '🎬' : '📺'}</span>
                                </div>
                            )}
                            
                            {/* Overlay on hover */}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-1">
                                <p className="text-white text-[10px] font-medium text-center line-clamp-2">{item.title}</p>
                                {item.rating && (
                                    <p className="text-yellow-400 text-[10px] mt-1">
                                        {'★'.repeat(item.rating)}
                                    </p>
                                )}
                            </div>
                            
                            {/* Status badge */}
                            {item.status && (
                                <div className={`absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${STATUS_STYLES[item.status].badge}`}>
                                    {STATUS_STYLES[item.status].icon}
                                </div>
                            )}
                            
                            {/* Type badge */}
                            <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[8px] text-white">
                                {item.type === 'movie' ? '🎬' : '📺'}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
