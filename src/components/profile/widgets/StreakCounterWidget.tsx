"use client";

import { StreakCounterWidgetConfig } from "../ProfileWidgetTypes";
import { motion } from "motion/react";

interface StreakCounterWidgetProps {
    config: StreakCounterWidgetConfig;
    size: string;
}

export function StreakCounterWidget({ config, size }: StreakCounterWidgetProps) {
    const { label, currentStreak, longestStreak, unit = 'days', emoji = '🔥', startDate } = config;
    
    const isSmall = size === '1x1';
    
    // Format large numbers
    const formatNumber = (num: number) => {
        if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
        return num.toString();
    };
    
    return (
        <div className="w-full h-full p-3 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden">
            {/* Background fire effects */}
            {currentStreak > 0 && (
                <>
                    <motion.div
                        animate={{ y: [0, -10, 0], opacity: [0.3, 0.5, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute bottom-0 left-1/4 text-4xl opacity-20"
                    >
                        🔥
                    </motion.div>
                    <motion.div
                        animate={{ y: [0, -15, 0], opacity: [0.2, 0.4, 0.2] }}
                        transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }}
                        className="absolute bottom-0 right-1/4 text-3xl opacity-20"
                    >
                        🔥
                    </motion.div>
                </>
            )}
            
            {/* Main content */}
            <div className="relative z-10 text-center">
                {/* Emoji with animation */}
                <motion.span
                    animate={{ scale: [1, 1.1, 1], rotate: [-5, 5, -5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className={`${isSmall ? 'text-3xl' : 'text-4xl'} block`}
                >
                    {emoji}
                </motion.span>
                
                {/* Streak count */}
                <div className={`font-bold text-white mt-1 ${isSmall ? 'text-2xl' : 'text-4xl'}`}>
                    {formatNumber(currentStreak)}
                </div>
                
                {/* Unit */}
                <p className={`text-orange-300 font-medium ${isSmall ? 'text-xs' : 'text-sm'}`}>
                    {unit}
                </p>
                
                {/* Label */}
                <p className={`text-zinc-400 mt-1 ${isSmall ? 'text-[10px]' : 'text-xs'}`}>
                    {label}
                </p>
                
                {/* Longest streak */}
                {longestStreak !== undefined && !isSmall && (
                    <div className="mt-2 text-xs text-zinc-500">
                        Best: {formatNumber(longestStreak)} {unit}
                    </div>
                )}
                
                {/* Start date */}
                {startDate && !isSmall && (
                    <div className="text-[10px] text-zinc-600 mt-1">
                        Since {new Date(startDate).toLocaleDateString()}
                    </div>
                )}
            </div>
        </div>
    );
}
