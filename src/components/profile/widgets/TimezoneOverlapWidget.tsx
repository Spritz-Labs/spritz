"use client";

import { useState, useEffect } from "react";
import { TimezoneOverlapWidgetConfig } from "../ProfileWidgetTypes";

interface TimezoneOverlapWidgetProps {
    config: TimezoneOverlapWidgetConfig;
    size: string;
}

export function TimezoneOverlapWidget({ config, size }: TimezoneOverlapWidgetProps) {
    const { timezone, label, showWorkHours = false, workHours = { start: 9, end: 17 } } = config;
    const [times, setTimes] = useState({ their: '', yours: '', diff: 0 });
    
    const isSmall = size === '1x1';
    
    useEffect(() => {
        const updateTimes = () => {
            try {
                const now = new Date();
                
                // Their time
                const theirTime = now.toLocaleTimeString('en-US', {
                    timeZone: timezone,
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                });
                
                // Your (visitor's) time
                const yourTime = now.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                });
                
                // Calculate difference
                const theirOffset = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
                const diff = Math.round((theirOffset.getTime() - now.getTime()) / (1000 * 60 * 60));
                
                setTimes({ their: theirTime, yours: yourTime, diff });
            } catch {
                setTimes({ their: '--:--', yours: '--:--', diff: 0 });
            }
        };
        
        updateTimes();
        const interval = setInterval(updateTimes, 60000); // Update every minute
        
        return () => clearInterval(interval);
    }, [timezone]);
    
    // Check if currently in work hours
    const isInWorkHours = () => {
        if (!showWorkHours) return null;
        try {
            const now = new Date();
            const hour = parseInt(now.toLocaleString('en-US', {
                timeZone: timezone,
                hour: 'numeric',
                hour12: false,
            }));
            return hour >= workHours.start && hour < workHours.end;
        } catch {
            return null;
        }
    };
    
    const inWorkHours = isInWorkHours();
    
    // Get timezone abbreviation
    const tzAbbr = (() => {
        try {
            return new Date().toLocaleTimeString('en-US', {
                timeZone: timezone,
                timeZoneName: 'short',
            }).split(' ').pop() || timezone;
        } catch {
            return timezone;
        }
    })();
    
    return (
        <div className="w-full h-full p-3 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-2xl flex flex-col justify-center">
            {/* Their time (main) */}
            <div className="text-center">
                {label && !isSmall && (
                    <p className="text-zinc-400 text-xs mb-1">{label}</p>
                )}
                
                <div className="flex items-center justify-center gap-2">
                    <span className="text-lg">🌍</span>
                    <span className={`font-bold text-white ${isSmall ? 'text-xl' : 'text-2xl'}`}>
                        {times.their}
                    </span>
                </div>
                
                <p className="text-zinc-400 text-xs mt-0.5">{tzAbbr}</p>
                
                {/* Work hours indicator */}
                {showWorkHours && inWorkHours !== null && !isSmall && (
                    <div className={`mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                        inWorkHours 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-zinc-500/20 text-zinc-400'
                    }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${inWorkHours ? 'bg-green-500' : 'bg-zinc-500'}`} />
                        {inWorkHours ? 'In work hours' : 'Outside work hours'}
                    </div>
                )}
            </div>
            
            {/* Comparison with visitor's time */}
            {!isSmall && (
                <div className="mt-3 pt-3 border-t border-zinc-700/50">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">Your time:</span>
                        <span className="text-zinc-300">{times.yours}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1">
                        <span className="text-zinc-500">Difference:</span>
                        <span className={times.diff === 0 ? 'text-green-400' : 'text-blue-400'}>
                            {times.diff === 0 ? 'Same timezone!' : `${times.diff > 0 ? '+' : ''}${times.diff}h`}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
