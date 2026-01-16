"use client";

import { useState, useEffect } from "react";
import { FortuneCookieWidgetConfig } from "../ProfileWidgetTypes";
import { motion, AnimatePresence } from "motion/react";

interface FortuneCookieWidgetProps {
    config: FortuneCookieWidgetConfig;
    size: string;
}

const DEFAULT_FORTUNES: Record<string, string[]> = {
    wisdom: [
        "The best time to plant a tree was 20 years ago. The second best time is now.",
        "What you seek is seeking you.",
        "The obstacle is the path.",
        "Be the change you wish to see.",
        "Every expert was once a beginner.",
    ],
    funny: [
        "You will receive a fortune cookie.",
        "Error 404: Fortune not found.",
        "Help! I'm trapped in a fortune cookie factory!",
        "A conclusion is where you got tired of thinking.",
        "You're not lazy, you're on energy-saving mode.",
    ],
    motivation: [
        "Your potential is limitless.",
        "Today is your day to shine.",
        "Great things never came from comfort zones.",
        "You're closer than you think.",
        "Progress, not perfection.",
    ],
    tech: [
        "git commit -m 'best decision ever'",
        "There are no bugs, only undocumented features.",
        "May your code compile on the first try.",
        "Ctrl+Z can't fix everything, but it helps.",
        "Ship it! ™",
    ],
};

export function FortuneCookieWidget({ config, size }: FortuneCookieWidgetProps) {
    const { fortunes, category = 'wisdom', showDaily = true } = config;
    const [isOpened, setIsOpened] = useState(false);
    const [currentFortune, setCurrentFortune] = useState('');
    
    const isSmall = size === '1x1';
    const fortuneList = fortunes || DEFAULT_FORTUNES[category] || DEFAULT_FORTUNES.wisdom;
    
    // Get daily fortune based on date
    useEffect(() => {
        if (showDaily) {
            const today = new Date().toDateString();
            const hash = today.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
            setCurrentFortune(fortuneList[hash % fortuneList.length]);
        } else {
            setCurrentFortune(fortuneList[Math.floor(Math.random() * fortuneList.length)]);
        }
    }, [fortuneList, showDaily]);
    
    const handleClick = () => {
        if (isOpened) {
            // Get new fortune
            setIsOpened(false);
            setTimeout(() => {
                setCurrentFortune(fortuneList[Math.floor(Math.random() * fortuneList.length)]);
            }, 300);
        } else {
            setIsOpened(true);
        }
    };
    
    return (
        <div 
            className="w-full h-full p-4 flex flex-col items-center justify-center bg-gradient-to-br from-yellow-500/10 to-amber-500/10 rounded-2xl cursor-pointer overflow-hidden"
            onClick={handleClick}
        >
            <AnimatePresence mode="wait">
                {!isOpened ? (
                    <motion.div
                        key="cookie"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0, rotate: 45 }}
                        className="flex flex-col items-center"
                    >
                        <motion.span 
                            className={`${isSmall ? 'text-4xl' : 'text-6xl'}`}
                            animate={{ rotate: [-5, 5, -5] }}
                            transition={{ duration: 2, repeat: Infinity }}
                        >
                            🥠
                        </motion.span>
                        {!isSmall && (
                            <p className="text-zinc-400 text-xs mt-2">Click to open</p>
                        )}
                    </motion.div>
                ) : (
                    <motion.div
                        key="fortune"
                        initial={{ scale: 0.5, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        className="flex flex-col items-center text-center px-2"
                    >
                        <span className={`${isSmall ? 'text-xl' : 'text-2xl'} mb-2`}>✨</span>
                        <p className={`text-white font-medium ${isSmall ? 'text-xs' : 'text-sm'} leading-relaxed`}>
                            "{currentFortune}"
                        </p>
                        {!isSmall && (
                            <p className="text-zinc-500 text-xs mt-3">Click for another</p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
