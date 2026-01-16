"use client";

import { useState, useEffect } from "react";
import { RandomFactWidgetConfig } from "../ProfileWidgetTypes";
import { motion, AnimatePresence } from "motion/react";

interface RandomFactWidgetProps {
    config: RandomFactWidgetConfig;
    size: string;
}

export function RandomFactWidget({ config, size }: RandomFactWidgetProps) {
    const { facts, title = "Fun Fact", refreshable = true } = config;
    const [currentFact, setCurrentFact] = useState('');
    const [factIndex, setFactIndex] = useState(0);
    
    const isSmall = size === '2x1';
    
    useEffect(() => {
        if (facts.length > 0) {
            setCurrentFact(facts[0]);
        }
    }, [facts]);
    
    const nextFact = () => {
        if (!refreshable || facts.length <= 1) return;
        const newIndex = (factIndex + 1) % facts.length;
        setFactIndex(newIndex);
        setCurrentFact(facts[newIndex]);
    };
    
    if (facts.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-zinc-800/50 rounded-2xl">
                <span className="text-zinc-500 text-sm">Add some facts!</span>
            </div>
        );
    }
    
    return (
        <div 
            className={`w-full h-full p-4 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 rounded-2xl flex flex-col ${
                refreshable ? 'cursor-pointer' : ''
            }`}
            onClick={nextFact}
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-bold text-sm flex items-center gap-2">
                    <span>💡</span> {title}
                </h3>
                {refreshable && facts.length > 1 && (
                    <span className="text-zinc-500 text-xs">
                        {factIndex + 1}/{facts.length}
                    </span>
                )}
            </div>
            
            {/* Fact */}
            <div className="flex-1 flex items-center justify-center">
                <AnimatePresence mode="wait">
                    <motion.p
                        key={factIndex}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`text-white text-center ${isSmall ? 'text-sm' : 'text-base'} leading-relaxed`}
                    >
                        "{currentFact}"
                    </motion.p>
                </AnimatePresence>
            </div>
            
            {/* Refresh hint */}
            {refreshable && facts.length > 1 && !isSmall && (
                <p className="text-zinc-500 text-[10px] text-center mt-2">
                    Click for another fact
                </p>
            )}
        </div>
    );
}
