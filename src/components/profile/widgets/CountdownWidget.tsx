"use client";

import { useState, useEffect } from "react";
import { CountdownWidgetConfig } from "../ProfileWidgetTypes";

interface CountdownWidgetProps {
    config: CountdownWidgetConfig;
    size: string;
}

export function CountdownWidget({ config, size }: CountdownWidgetProps) {
    const { targetDate, label, emoji, showDays = true, showHours = true, showMinutes = true } = config;
    
    const [timeLeft, setTimeLeft] = useState({
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        isPast: false,
    });
    
    useEffect(() => {
        const calculateTimeLeft = () => {
            const target = new Date(targetDate).getTime();
            const now = Date.now();
            const diff = target - now;
            
            if (diff <= 0) {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true });
                return;
            }
            
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            
            setTimeLeft({ days, hours, minutes, seconds, isPast: false });
        };
        
        calculateTimeLeft();
        const interval = setInterval(calculateTimeLeft, 1000);
        
        return () => clearInterval(interval);
    }, [targetDate]);
    
    const isSmall = size === '1x1';
    
    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 sm:p-6 rounded-2xl bg-zinc-900 border border-zinc-800">
            {emoji && (
                <span className={`${isSmall ? 'text-2xl mb-2' : 'text-3xl mb-3'}`}>{emoji}</span>
            )}
            
            <p className={`text-zinc-400 ${isSmall ? 'text-xs' : 'text-sm'} mb-2 text-center`}>
                {label}
            </p>
            
            {timeLeft.isPast ? (
                <p className="text-orange-500 font-bold text-lg">Event Started! 🎉</p>
            ) : (
                <div className={`flex items-center ${isSmall ? 'gap-2' : 'gap-3'}`}>
                    {showDays && (
                        <div className="text-center">
                            <p className={`text-white font-bold ${isSmall ? 'text-xl' : 'text-2xl sm:text-3xl'}`}>
                                {timeLeft.days}
                            </p>
                            <p className="text-zinc-500 text-xs">days</p>
                        </div>
                    )}
                    {showDays && showHours && <span className="text-zinc-600">:</span>}
                    {showHours && (
                        <div className="text-center">
                            <p className={`text-white font-bold ${isSmall ? 'text-xl' : 'text-2xl sm:text-3xl'}`}>
                                {String(timeLeft.hours).padStart(2, '0')}
                            </p>
                            <p className="text-zinc-500 text-xs">hrs</p>
                        </div>
                    )}
                    {showHours && showMinutes && <span className="text-zinc-600">:</span>}
                    {showMinutes && (
                        <div className="text-center">
                            <p className={`text-white font-bold ${isSmall ? 'text-xl' : 'text-2xl sm:text-3xl'}`}>
                                {String(timeLeft.minutes).padStart(2, '0')}
                            </p>
                            <p className="text-zinc-500 text-xs">min</p>
                        </div>
                    )}
                    {!isSmall && (
                        <>
                            <span className="text-zinc-600">:</span>
                            <div className="text-center">
                                <p className="text-white font-bold text-2xl sm:text-3xl">
                                    {String(timeLeft.seconds).padStart(2, '0')}
                                </p>
                                <p className="text-zinc-500 text-xs">sec</p>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
