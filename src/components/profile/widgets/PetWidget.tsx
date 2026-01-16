"use client";

import { useState, useEffect } from "react";
import { PetWidgetConfig } from "../ProfileWidgetTypes";
import { motion } from "motion/react";

interface PetWidgetProps {
    config: PetWidgetConfig;
    size: string;
}

const PET_EMOJIS: Record<PetWidgetConfig['petType'], string> = {
    cat: '🐱',
    dog: '🐶',
    hamster: '🐹',
    bird: '🐦',
    fish: '🐠',
    alien: '👽',
    robot: '🤖',
    ghost: '👻',
};

const MOOD_ANIMATIONS: Record<string, { y: number[]; rotate: number[]; duration: number }> = {
    happy: { y: [0, -5, 0], rotate: [-5, 5, -5], duration: 0.8 },
    sleepy: { y: [0, 2, 0], rotate: [0, 0, 0], duration: 2 },
    hungry: { y: [0, -2, 0], rotate: [-2, 2, -2], duration: 0.5 },
    playful: { y: [0, -10, 0], rotate: [-10, 10, -10], duration: 0.4 },
    excited: { y: [0, -15, 0, -10, 0], rotate: [-15, 15, -15, 10, 0], duration: 0.6 },
};

const MOOD_MESSAGES: Record<string, string[]> = {
    happy: ['*purrs*', '*wags tail*', '♪♫'],
    sleepy: ['zzz...', '*yawn*', '💤'],
    hungry: ['*stomach growls*', 'feed me?', '🍖'],
    playful: ['play with me!', '*bounces*', '🎾'],
    excited: ['!!!!!', '*zooms*', '⚡'],
};

export function PetWidget({ config, size }: PetWidgetProps) {
    const { petType, name, mood = 'happy' } = config;
    const [currentMood, setCurrentMood] = useState(mood);
    const [message, setMessage] = useState('');
    const [showMessage, setShowMessage] = useState(false);
    
    const isSmall = size === '1x1';
    const emoji = PET_EMOJIS[petType];
    const animation = MOOD_ANIMATIONS[currentMood];
    
    const handlePet = () => {
        // Change mood on interaction
        const moods: NonNullable<PetWidgetConfig['mood']>[] = ['happy', 'playful', 'excited'];
        const newMood = moods[Math.floor(Math.random() * moods.length)] ?? 'happy';
        setCurrentMood(newMood);
        
        // Show message
        const messages = MOOD_MESSAGES[newMood];
        setMessage(messages[Math.floor(Math.random() * messages.length)]);
        setShowMessage(true);
        
        setTimeout(() => setShowMessage(false), 2000);
    };
    
    // Occasional mood changes
    useEffect(() => {
        const interval = setInterval(() => {
            const moods: NonNullable<PetWidgetConfig['mood']>[] = ['happy', 'sleepy', 'playful'];
            const newMood = moods[Math.floor(Math.random() * moods.length)] ?? 'happy';
            setCurrentMood(newMood);
        }, 10000);
        
        return () => clearInterval(interval);
    }, []);
    
    return (
        <div 
            className="w-full h-full p-3 flex flex-col items-center justify-center bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-2xl cursor-pointer relative"
            onClick={handlePet}
        >
            {/* Speech bubble */}
            {showMessage && (
                <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute top-2 right-2 px-2 py-1 bg-white rounded-lg text-xs text-zinc-800 shadow-lg"
                >
                    {message}
                </motion.div>
            )}
            
            {/* Pet */}
            <motion.div
                animate={{
                    y: animation.y,
                    rotate: animation.rotate,
                }}
                transition={{
                    duration: animation.duration,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
                className={`${isSmall ? 'text-4xl' : 'text-6xl'} select-none`}
            >
                {emoji}
            </motion.div>
            
            {/* Name */}
            {!isSmall && (
                <div className="mt-2 text-center">
                    <p className="text-white font-medium text-sm">{name}</p>
                    <p className="text-zinc-500 text-xs capitalize">feeling {currentMood}</p>
                </div>
            )}
            
            {isSmall && (
                <p className="text-white font-medium text-xs mt-1">{name}</p>
            )}
        </div>
    );
}
