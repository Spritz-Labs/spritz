"use client";

import { CurrentlyWidgetConfig } from "../ProfileWidgetTypes";

interface CurrentlyWidgetProps {
    config: CurrentlyWidgetConfig;
    size: string;
}

const TYPE_ICONS: Record<string, string> = {
    reading: '📚',
    playing: '🎮',
    watching: '📺',
    building: '🛠️',
    learning: '🧠',
    listening: '🎧',
};

const TYPE_LABELS: Record<string, string> = {
    reading: 'Currently Reading',
    playing: 'Currently Playing',
    watching: 'Currently Watching',
    building: 'Currently Building',
    learning: 'Currently Learning',
    listening: 'Currently Listening',
};

export function CurrentlyWidget({ config, size }: CurrentlyWidgetProps) {
    const { type, title, subtitle, imageUrl, link } = config;
    
    const isSmall = size === '1x1';
    const icon = TYPE_ICONS[type] || '🎯';
    const label = TYPE_LABELS[type] || 'Currently';
    
    const content = (
        <div className={`w-full h-full flex ${isSmall ? 'flex-col items-center justify-center text-center' : 'items-center gap-4'} p-4 sm:p-5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all group`}>
            {/* Image or Icon */}
            {imageUrl && !isSmall ? (
                <img
                    src={imageUrl}
                    alt={title}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover flex-shrink-0"
                />
            ) : (
                <div className={`${isSmall ? 'w-12 h-12 mb-2' : 'w-14 h-14'} rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}>
                    <span className="text-2xl">{icon}</span>
                </div>
            )}
            
            {/* Content */}
            <div className="flex-1 min-w-0">
                <p className="text-zinc-400 text-xs uppercase tracking-wider mb-1">
                    {isSmall ? icon : label}
                </p>
                <p className={`text-white font-semibold ${isSmall ? 'text-sm' : 'text-base'} truncate`}>
                    {title}
                </p>
                {subtitle && !isSmall && (
                    <p className="text-zinc-500 text-sm truncate">{subtitle}</p>
                )}
            </div>
            
            {/* Link indicator */}
            {link && !isSmall && (
                <svg className="w-5 h-5 text-zinc-500 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
            )}
        </div>
    );
    
    if (link) {
        return (
            <a href={link} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                {content}
            </a>
        );
    }
    
    return content;
}
