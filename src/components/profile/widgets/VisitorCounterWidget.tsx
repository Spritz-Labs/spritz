"use client";

import { useState, useEffect } from "react";
import { VisitorCounterWidgetConfig } from "../ProfileWidgetTypes";

interface VisitorCounterWidgetProps {
    config: VisitorCounterWidgetConfig;
    size: string;
}

export function VisitorCounterWidget({ config, size }: VisitorCounterWidgetProps) {
    const { style = 'retro', count = 0, label = 'visitors' } = config;
    const [displayCount, setDisplayCount] = useState(count);
    
    const isSmall = size === '1x1';
    
    // Animate count on mount
    useEffect(() => {
        if (count <= 0) return;
        
        let current = 0;
        const increment = Math.ceil(count / 20);
        const interval = setInterval(() => {
            current = Math.min(current + increment, count);
            setDisplayCount(current);
            if (current >= count) clearInterval(interval);
        }, 50);
        
        return () => clearInterval(interval);
    }, [count]);
    
    // Format number with leading zeros for retro style
    const formatRetro = (num: number) => {
        return num.toString().padStart(6, '0');
    };
    
    if (style === 'retro') {
        const digits = formatRetro(displayCount).split('');
        
        return (
            <div className="w-full h-full p-3 bg-zinc-900 rounded-2xl flex flex-col items-center justify-center border border-zinc-700">
                {/* Classic retro counter */}
                <div className="flex items-center justify-center gap-0.5">
                    {digits.map((digit, i) => (
                        <div
                            key={i}
                            className={`bg-zinc-800 border border-zinc-600 rounded flex items-center justify-center font-mono font-bold text-green-400 ${
                                isSmall ? 'w-4 h-6 text-sm' : 'w-6 h-8 text-lg'
                            }`}
                            style={{ textShadow: '0 0 10px rgba(34, 197, 94, 0.5)' }}
                        >
                            {digit}
                        </div>
                    ))}
                </div>
                
                <p className={`text-zinc-400 mt-2 uppercase tracking-wider ${isSmall ? 'text-[8px]' : 'text-[10px]'}`}>
                    {label}
                </p>
                
                {/* Classic web badge style */}
                {!isSmall && (
                    <div className="mt-2 px-2 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-[8px] text-zinc-500">
                        EST. 2024
                    </div>
                )}
            </div>
        );
    }
    
    if (style === 'modern') {
        return (
            <div className="w-full h-full p-3 bg-gradient-to-br from-violet-500/20 to-purple-500/20 rounded-2xl flex flex-col items-center justify-center">
                <span className={`${isSmall ? 'text-2xl' : 'text-3xl'}`}>👀</span>
                <div className={`font-bold text-white mt-1 ${isSmall ? 'text-xl' : 'text-2xl'}`}>
                    {displayCount.toLocaleString()}
                </div>
                <p className="text-violet-300 text-xs">{label}</p>
            </div>
        );
    }
    
    // Minimal style
    return (
        <div className="w-full h-full p-3 bg-zinc-800/50 rounded-2xl flex items-center justify-center gap-2">
            <span className="text-xl">👁️</span>
            <div>
                <span className={`font-bold text-white ${isSmall ? 'text-lg' : 'text-xl'}`}>
                    {displayCount.toLocaleString()}
                </span>
                <span className="text-zinc-400 text-sm ml-1">{label}</span>
            </div>
        </div>
    );
}
