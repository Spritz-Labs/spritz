"use client";

import { useState } from "react";
import { FunCounterWidgetConfig } from "../ProfileWidgetTypes";
import { motion } from "motion/react";

interface FunCounterWidgetProps {
    config: FunCounterWidgetConfig;
    size: string;
}

export function FunCounterWidget({ config, size }: FunCounterWidgetProps) {
    const { label, count: initialCount, emoji, unit, incrementable = false } = config;
    const [count, setCount] = useState(initialCount);
    const [isAnimating, setIsAnimating] = useState(false);
    
    const isSmall = size === '1x1';
    
    // Format large numbers
    const formatNumber = (num: number) => {
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
        return num.toLocaleString();
    };
    
    const handleIncrement = () => {
        if (!incrementable) return;
        setIsAnimating(true);
        setCount(prev => prev + 1);
        setTimeout(() => setIsAnimating(false), 200);
    };
    
    return (
        <motion.div
            className={`w-full h-full p-3 bg-gradient-to-br from-amber-500/10 to-yellow-500/10 rounded-2xl flex flex-col items-center justify-center ${
                incrementable ? 'cursor-pointer active:scale-95' : ''
            } transition-transform`}
            onClick={handleIncrement}
            whileTap={incrementable ? { scale: 0.95 } : undefined}
        >
            {/* Emoji */}
            <motion.span
                animate={isAnimating ? { scale: [1, 1.3, 1], rotate: [0, 10, -10, 0] } : {}}
                className={`${isSmall ? 'text-3xl' : 'text-4xl'}`}
            >
                {emoji}
            </motion.span>
            
            {/* Count */}
            <motion.div
                key={count}
                initial={isAnimating ? { scale: 1.2 } : false}
                animate={{ scale: 1 }}
                className={`font-bold text-white mt-1 ${isSmall ? 'text-xl' : 'text-3xl'}`}
            >
                {formatNumber(count)}
            </motion.div>
            
            {/* Unit/Label */}
            <p className={`text-amber-300/80 ${isSmall ? 'text-[10px]' : 'text-xs'}`}>
                {unit || label}
            </p>
            
            {/* Full label if not small */}
            {!isSmall && unit && (
                <p className="text-zinc-500 text-[10px] mt-1">{label}</p>
            )}
            
            {/* Increment hint */}
            {incrementable && !isSmall && (
                <p className="text-zinc-600 text-[10px] mt-2">Click to add</p>
            )}
        </motion.div>
    );
}
