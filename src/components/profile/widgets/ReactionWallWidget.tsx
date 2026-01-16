"use client";

import { useState } from "react";
import { ReactionWallWidgetConfig } from "../ProfileWidgetTypes";
import { motion, AnimatePresence } from "motion/react";

interface ReactionWallWidgetProps {
    config: ReactionWallWidgetConfig;
    size: string;
}

const DEFAULT_EMOJIS = ['❤️', '🔥', '👏', '🎉', '💯', '🚀', '✨', '🙌'];

export function ReactionWallWidget({ config, size }: ReactionWallWidgetProps) {
    const { allowedEmojis = DEFAULT_EMOJIS, reactions = {} } = config;
    const [localReactions, setLocalReactions] = useState<Record<string, number>>(reactions);
    const [flyingEmojis, setFlyingEmojis] = useState<Array<{ id: number; emoji: string; x: number }>>([]);
    
    const isSmall = size === '1x1';
    const displayEmojis = isSmall ? allowedEmojis.slice(0, 4) : allowedEmojis;
    
    const totalReactions = Object.values(localReactions).reduce((a, b) => a + b, 0);
    
    const handleReaction = (emoji: string) => {
        // Add flying emoji animation
        const id = Date.now();
        const x = Math.random() * 80 + 10; // Random x position
        setFlyingEmojis(prev => [...prev, { id, emoji, x }]);
        
        // Update count
        setLocalReactions(prev => ({
            ...prev,
            [emoji]: (prev[emoji] || 0) + 1
        }));
        
        // Remove flying emoji after animation
        setTimeout(() => {
            setFlyingEmojis(prev => prev.filter(e => e.id !== id));
        }, 1000);
    };
    
    return (
        <div className="w-full h-full p-3 flex flex-col bg-gradient-to-br from-pink-500/10 to-rose-500/10 rounded-2xl relative overflow-hidden">
            {/* Flying emojis */}
            <AnimatePresence>
                {flyingEmojis.map(({ id, emoji, x }) => (
                    <motion.div
                        key={id}
                        initial={{ bottom: 0, left: `${x}%`, opacity: 1, scale: 1 }}
                        animate={{ bottom: '100%', opacity: 0, scale: 1.5 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1, ease: "easeOut" }}
                        className="absolute text-2xl pointer-events-none"
                    >
                        {emoji}
                    </motion.div>
                ))}
            </AnimatePresence>
            
            {!isSmall && (
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-1">
                        <span>🎉</span> React!
                    </h3>
                    <span className="text-xs text-zinc-500">{totalReactions} total</span>
                </div>
            )}
            
            <div className={`flex-1 flex items-center justify-center ${isSmall ? 'gap-1' : 'gap-2'} flex-wrap`}>
                {displayEmojis.map((emoji) => {
                    const count = localReactions[emoji] || 0;
                    return (
                        <motion.button
                            key={emoji}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleReaction(emoji)}
                            className={`relative flex flex-col items-center justify-center bg-zinc-800/50 hover:bg-zinc-700/50 rounded-xl transition-colors ${
                                isSmall ? 'p-2' : 'p-3'
                            }`}
                        >
                            <span className={isSmall ? 'text-xl' : 'text-2xl'}>{emoji}</span>
                            {count > 0 && (
                                <span className={`text-zinc-400 font-medium ${isSmall ? 'text-[10px]' : 'text-xs'}`}>
                                    {count}
                                </span>
                            )}
                        </motion.button>
                    );
                })}
            </div>
        </div>
    );
}
