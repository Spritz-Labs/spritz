"use client";

import { useState } from "react";
import { VinylRecordWidgetConfig } from "../ProfileWidgetTypes";
import { motion } from "motion/react";

interface VinylRecordWidgetProps {
    config: VinylRecordWidgetConfig;
    size: string;
}

export function VinylRecordWidget({ config, size }: VinylRecordWidgetProps) {
    const { albumArt, albumName, artistName, isSpinning = true, spotifyUrl } = config;
    const [isHovered, setIsHovered] = useState(false);
    
    const isSmall = size === '1x1';
    
    const handleClick = () => {
        if (spotifyUrl) {
            window.open(spotifyUrl, '_blank', 'noopener,noreferrer');
        }
    };
    
    return (
        <div 
            className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-2xl overflow-hidden ${spotifyUrl ? 'cursor-pointer' : ''}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={handleClick}
        >
            <div className="relative" style={{ width: isSmall ? '80%' : '70%', aspectRatio: '1' }}>
                {/* Vinyl record (black disc) */}
                <motion.div
                    animate={{ rotate: isSpinning && !isHovered ? 360 : 0 }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 rounded-full bg-zinc-950 shadow-xl"
                    style={{
                        background: `
                            radial-gradient(circle at center,
                                #1a1a1a 0%,
                                #1a1a1a 15%,
                                #0a0a0a 15%,
                                #0a0a0a 20%,
                                #1a1a1a 20%,
                                #1a1a1a 25%,
                                #0f0f0f 25%,
                                #0f0f0f 30%,
                                #1a1a1a 30%,
                                #1a1a1a 35%,
                                #0a0a0a 35%,
                                #0a0a0a 40%,
                                #1a1a1a 40%,
                                #1a1a1a 100%
                            )
                        `,
                    }}
                >
                    {/* Center hole */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[8%] h-[8%] bg-zinc-800 rounded-full" />
                    
                    {/* Shine effect */}
                    <div 
                        className="absolute inset-0 rounded-full opacity-30"
                        style={{
                            background: 'linear-gradient(135deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%)'
                        }}
                    />
                </motion.div>
                
                {/* Album art in center */}
                <motion.div
                    animate={{ rotate: isSpinning && !isHovered ? 360 : 0 }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[45%] h-[45%] rounded-full overflow-hidden shadow-lg"
                >
                    <img
                        src={albumArt}
                        alt={albumName}
                        className="w-full h-full object-cover"
                    />
                </motion.div>
                
                {/* Play indicator on hover */}
                {spotifyUrl && isHovered && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-green-500 rounded-full flex items-center justify-center shadow-lg z-10"
                    >
                        <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                    </motion.div>
                )}
            </div>
            
            {/* Album info */}
            {!isSmall && (
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-white font-semibold text-sm truncate">{albumName}</p>
                    <p className="text-zinc-400 text-xs truncate">{artistName}</p>
                </div>
            )}
        </div>
    );
}
