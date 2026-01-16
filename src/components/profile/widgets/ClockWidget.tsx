"use client";

import { useState, useEffect } from "react";
import { ClockWidgetConfig } from "../ProfileWidgetTypes";

interface ClockWidgetProps {
    config: ClockWidgetConfig;
    size: string;
}

export function ClockWidget({ config, size }: ClockWidgetProps) {
    const { timezone, label, format = '12h' } = config;
    
    const [time, setTime] = useState<string>('');
    const [date, setDate] = useState<string>('');
    
    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            const options: Intl.DateTimeFormatOptions = {
                timeZone: timezone,
                hour: '2-digit',
                minute: '2-digit',
                hour12: format === '12h',
            };
            
            const dateOptions: Intl.DateTimeFormatOptions = {
                timeZone: timezone,
                weekday: 'short',
                month: 'short',
                day: 'numeric',
            };
            
            setTime(now.toLocaleTimeString('en-US', options));
            setDate(now.toLocaleDateString('en-US', dateOptions));
        };
        
        updateTime();
        const interval = setInterval(updateTime, 1000);
        
        return () => clearInterval(interval);
    }, [timezone, format]);
    
    const isSmall = size === '1x1';
    
    // Get timezone abbreviation
    const tzAbbr = (() => {
        try {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                timeZoneName: 'short',
            });
            const parts = formatter.formatToParts(new Date());
            return parts.find(p => p.type === 'timeZoneName')?.value || '';
        } catch {
            return timezone.split('/').pop() || timezone;
        }
    })();
    
    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl bg-zinc-900 border border-zinc-800">
            <span className={`${isSmall ? 'text-2xl mb-1' : 'text-3xl mb-2'}`}>🕐</span>
            
            <p className={`text-white font-bold ${isSmall ? 'text-xl' : 'text-2xl sm:text-3xl'} font-mono`}>
                {time}
            </p>
            
            {!isSmall && (
                <p className="text-zinc-400 text-sm mt-1">{date}</p>
            )}
            
            <p className="text-zinc-500 text-xs mt-1">
                {label || tzAbbr}
            </p>
        </div>
    );
}
