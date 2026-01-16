"use client";

import { GameNowPlayingWidgetConfig } from "../ProfileWidgetTypes";
import { motion } from "motion/react";

interface GameNowPlayingWidgetProps {
    config: GameNowPlayingWidgetConfig;
    size: string;
}

const PLATFORM_ICONS: Record<string, string> = {
    pc: '🖥️',
    playstation: '🎮',
    xbox: '🎮',
    nintendo: '🕹️',
    mobile: '📱',
};

const PLATFORM_COLORS: Record<string, string> = {
    pc: '#6366f1',
    playstation: '#003087',
    xbox: '#107c10',
    nintendo: '#e60012',
    mobile: '#64748b',
};

export function GameNowPlayingWidget({ config, size }: GameNowPlayingWidgetProps) {
    const { gameName, coverUrl, platform = 'pc', hoursPlayed, achievement } = config;
    
    const isSmall = size === '2x1';
    const platformColor = PLATFORM_COLORS[platform] || PLATFORM_COLORS.pc;
    
    return (
        <div className="w-full h-full relative overflow-hidden rounded-2xl bg-zinc-900">
            {/* Background cover art with blur */}
            {coverUrl && (
                <div className="absolute inset-0">
                    <img
                        src={coverUrl}
                        alt=""
                        className="w-full h-full object-cover opacity-30 blur-xl scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-transparent" />
                </div>
            )}
            
            <div className="relative z-10 w-full h-full p-3 flex gap-3">
                {/* Cover art */}
                <motion.div 
                    className={`${isSmall ? 'w-16' : 'w-20'} flex-shrink-0 rounded-lg overflow-hidden shadow-xl`}
                    whileHover={{ scale: 1.05 }}
                >
                    {coverUrl ? (
                        <img
                            src={coverUrl}
                            alt={gameName}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center">
                            <span className="text-3xl">🎮</span>
                        </div>
                    )}
                </motion.div>
                
                {/* Info */}
                <div className="flex-1 flex flex-col justify-center min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: `${platformColor}30`, color: platformColor }}>
                            {PLATFORM_ICONS[platform]} {platform.toUpperCase()}
                        </span>
                    </div>
                    
                    <h3 className={`font-bold text-white truncate ${isSmall ? 'text-sm' : 'text-base'}`}>
                        {gameName}
                    </h3>
                    
                    {/* Stats */}
                    <div className="flex items-center gap-3 mt-1">
                        {hoursPlayed !== undefined && (
                            <span className="text-xs text-zinc-400 flex items-center gap-1">
                                <span>⏱️</span> {hoursPlayed}h played
                            </span>
                        )}
                    </div>
                    
                    {/* Achievement */}
                    {achievement && !isSmall && (
                        <div className="mt-2 flex items-center gap-1.5 px-2 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded-lg w-fit">
                            <span className="text-yellow-400 text-sm">🏆</span>
                            <span className="text-xs text-yellow-300 truncate">{achievement}</span>
                        </div>
                    )}
                </div>
                
                {/* Now Playing indicator */}
                <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-1 bg-green-500/20 rounded-full">
                    <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="w-2 h-2 bg-green-500 rounded-full"
                    />
                    <span className="text-[10px] text-green-400 font-medium">PLAYING</span>
                </div>
            </div>
        </div>
    );
}
