"use client";

import { ZodiacWidgetConfig } from "../ProfileWidgetTypes";
import { motion } from "motion/react";

interface ZodiacWidgetProps {
    config: ZodiacWidgetConfig;
    size: string;
}

const ZODIAC_DATA: Record<ZodiacWidgetConfig['sign'], {
    symbol: string;
    emoji: string;
    element: string;
    dates: string;
    traits: string[];
    color: string;
}> = {
    aries: { symbol: '♈', emoji: '🐏', element: 'Fire', dates: 'Mar 21 - Apr 19', traits: ['Bold', 'Ambitious', 'Energetic'], color: '#ef4444' },
    taurus: { symbol: '♉', emoji: '🐂', element: 'Earth', dates: 'Apr 20 - May 20', traits: ['Patient', 'Reliable', 'Devoted'], color: '#22c55e' },
    gemini: { symbol: '♊', emoji: '👯', element: 'Air', dates: 'May 21 - Jun 20', traits: ['Curious', 'Adaptable', 'Witty'], color: '#eab308' },
    cancer: { symbol: '♋', emoji: '🦀', element: 'Water', dates: 'Jun 21 - Jul 22', traits: ['Intuitive', 'Loyal', 'Protective'], color: '#6366f1' },
    leo: { symbol: '♌', emoji: '🦁', element: 'Fire', dates: 'Jul 23 - Aug 22', traits: ['Creative', 'Generous', 'Confident'], color: '#f97316' },
    virgo: { symbol: '♍', emoji: '👸', element: 'Earth', dates: 'Aug 23 - Sep 22', traits: ['Analytical', 'Kind', 'Practical'], color: '#84cc16' },
    libra: { symbol: '♎', emoji: '⚖️', element: 'Air', dates: 'Sep 23 - Oct 22', traits: ['Diplomatic', 'Fair', 'Social'], color: '#ec4899' },
    scorpio: { symbol: '♏', emoji: '🦂', element: 'Water', dates: 'Oct 23 - Nov 21', traits: ['Passionate', 'Brave', 'Resourceful'], color: '#dc2626' },
    sagittarius: { symbol: '♐', emoji: '🏹', element: 'Fire', dates: 'Nov 22 - Dec 21', traits: ['Optimistic', 'Adventurous', 'Honest'], color: '#8b5cf6' },
    capricorn: { symbol: '♑', emoji: '🐐', element: 'Earth', dates: 'Dec 22 - Jan 19', traits: ['Disciplined', 'Ambitious', 'Wise'], color: '#475569' },
    aquarius: { symbol: '♒', emoji: '🏺', element: 'Air', dates: 'Jan 20 - Feb 18', traits: ['Progressive', 'Original', 'Independent'], color: '#06b6d4' },
    pisces: { symbol: '♓', emoji: '🐟', element: 'Water', dates: 'Feb 19 - Mar 20', traits: ['Compassionate', 'Artistic', 'Intuitive'], color: '#14b8a6' },
};

export function ZodiacWidget({ config, size }: ZodiacWidgetProps) {
    const { sign, showTraits = true, showDates = true } = config;
    const data = ZODIAC_DATA[sign];
    
    const isSmall = size === '1x1';
    
    return (
        <div 
            className="w-full h-full flex flex-col items-center justify-center rounded-2xl p-3 relative overflow-hidden"
            style={{ 
                background: `linear-gradient(135deg, ${data.color}20 0%, ${data.color}10 50%, transparent 100%)`,
            }}
        >
            {/* Background symbol */}
            <div 
                className="absolute inset-0 flex items-center justify-center opacity-5 text-[150px] font-bold"
                style={{ color: data.color }}
            >
                {data.symbol}
            </div>
            
            {/* Main content */}
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative z-10 flex flex-col items-center"
            >
                {/* Symbol */}
                <motion.span 
                    className={`${isSmall ? 'text-4xl' : 'text-5xl'} font-bold`}
                    style={{ color: data.color }}
                    animate={{ 
                        textShadow: [
                            `0 0 20px ${data.color}40`,
                            `0 0 40px ${data.color}60`,
                            `0 0 20px ${data.color}40`,
                        ]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                >
                    {data.symbol}
                </motion.span>
                
                {/* Sign name */}
                <h3 className={`font-bold text-white capitalize mt-1 ${isSmall ? 'text-sm' : 'text-lg'}`}>
                    {sign}
                </h3>
                
                {/* Element badge */}
                <span 
                    className="text-xs px-2 py-0.5 rounded-full mt-1"
                    style={{ backgroundColor: `${data.color}30`, color: data.color }}
                >
                    {data.element}
                </span>
                
                {/* Dates */}
                {showDates && !isSmall && (
                    <p className="text-zinc-400 text-xs mt-2">{data.dates}</p>
                )}
                
                {/* Traits */}
                {showTraits && !isSmall && (
                    <div className="flex flex-wrap justify-center gap-1 mt-2">
                        {data.traits.map((trait, i) => (
                            <span 
                                key={i}
                                className="text-[10px] px-1.5 py-0.5 bg-zinc-800/50 text-zinc-300 rounded"
                            >
                                {trait}
                            </span>
                        ))}
                    </div>
                )}
            </motion.div>
        </div>
    );
}
