"use client";

import { AvailabilityStatusWidgetConfig } from "../ProfileWidgetTypes";
import { motion } from "motion/react";

interface AvailabilityStatusWidgetProps {
    config: AvailabilityStatusWidgetConfig;
    size: string;
}

const STATUS_STYLES: Record<AvailabilityStatusWidgetConfig['status'], {
    color: string;
    bgColor: string;
    label: string;
    icon: string;
}> = {
    available: { color: '#22c55e', bgColor: 'bg-green-500/20', label: 'Available', icon: '✓' },
    busy: { color: '#ef4444', bgColor: 'bg-red-500/20', label: 'Busy', icon: '⛔' },
    away: { color: '#eab308', bgColor: 'bg-yellow-500/20', label: 'Away', icon: '🌙' },
    dnd: { color: '#ef4444', bgColor: 'bg-red-500/20', label: 'Do Not Disturb', icon: '🔕' },
    offline: { color: '#6b7280', bgColor: 'bg-zinc-500/20', label: 'Offline', icon: '💤' },
};

export function AvailabilityStatusWidget({ config, size }: AvailabilityStatusWidgetProps) {
    const { status, customMessage, showSchedule = false, schedule } = config;
    const style = STATUS_STYLES[status];
    
    const isSmall = size === '1x1';
    
    // Get current time in user's timezone
    const getCurrentTimeInZone = () => {
        if (!schedule?.timezone) return null;
        try {
            return new Date().toLocaleTimeString('en-US', {
                timeZone: schedule.timezone,
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
            });
        } catch {
            return null;
        }
    };
    
    const currentTime = getCurrentTimeInZone();
    
    return (
        <div className={`w-full h-full p-3 ${style.bgColor} rounded-2xl flex flex-col items-center justify-center`}>
            {/* Status indicator */}
            <div className="relative">
                <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-4 h-4 rounded-full absolute -top-1 -right-1"
                    style={{ backgroundColor: style.color }}
                />
                <span className={`${isSmall ? 'text-3xl' : 'text-4xl'}`}>{style.icon}</span>
            </div>
            
            {/* Status label */}
            <div className="mt-2 text-center">
                <h3 
                    className={`font-bold ${isSmall ? 'text-sm' : 'text-base'}`}
                    style={{ color: style.color }}
                >
                    {style.label}
                </h3>
                
                {/* Custom message */}
                {customMessage && !isSmall && (
                    <p className="text-zinc-400 text-xs mt-1 line-clamp-2">
                        {customMessage}
                    </p>
                )}
                
                {/* Schedule info */}
                {showSchedule && schedule && !isSmall && (
                    <div className="mt-2 text-xs text-zinc-500">
                        {currentTime && (
                            <p>Local time: {currentTime}</p>
                        )}
                        {schedule.workHours && (
                            <p className="mt-0.5">
                                Work hours: {schedule.workHours.start} - {schedule.workHours.end}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
