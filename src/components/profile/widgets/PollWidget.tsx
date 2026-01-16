"use client";

import { useState } from "react";
import { PollWidgetConfig } from "../ProfileWidgetTypes";
import { motion } from "motion/react";

interface PollWidgetProps {
    config: PollWidgetConfig;
    size: string;
}

export function PollWidget({ config, size }: PollWidgetProps) {
    const { question, options, showResults = true } = config;
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [hasVoted, setHasVoted] = useState(false);
    
    const totalVotes = options.reduce((sum, opt) => sum + (opt.votes || 0), 0);
    const isSmall = size === '2x1';
    
    const handleVote = (optionId: string) => {
        if (hasVoted) return;
        setSelectedOption(optionId);
        setHasVoted(true);
    };
    
    return (
        <div className="w-full h-full p-4 flex flex-col bg-gradient-to-br from-violet-500/10 to-purple-500/10 rounded-2xl">
            <h3 className={`font-bold text-white mb-3 ${isSmall ? 'text-sm' : 'text-base'}`}>
                {question}
            </h3>
            
            <div className={`flex-1 flex flex-col gap-2 ${isSmall ? 'overflow-hidden' : ''}`}>
                {options.slice(0, isSmall ? 3 : options.length).map((option) => {
                    const votes = option.votes || 0;
                    const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
                    const isSelected = selectedOption === option.id;
                    
                    return (
                        <button
                            key={option.id}
                            onClick={() => handleVote(option.id)}
                            disabled={hasVoted}
                            className={`relative overflow-hidden rounded-lg text-left transition-all ${
                                hasVoted 
                                    ? 'cursor-default' 
                                    : 'hover:scale-[1.02] cursor-pointer'
                            } ${isSelected ? 'ring-2 ring-violet-500' : ''}`}
                        >
                            {/* Background bar */}
                            {(hasVoted || showResults) && (
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${percentage}%` }}
                                    transition={{ duration: 0.5, ease: "easeOut" }}
                                    className="absolute inset-0 bg-violet-500/30"
                                />
                            )}
                            
                            <div className={`relative px-3 py-2 flex items-center justify-between bg-zinc-800/50 ${
                                !hasVoted && !showResults ? 'hover:bg-zinc-700/50' : ''
                            }`}>
                                <span className={`text-white ${isSmall ? 'text-xs' : 'text-sm'}`}>
                                    {option.text}
                                </span>
                                {(hasVoted || showResults) && (
                                    <span className={`text-violet-300 font-medium ${isSmall ? 'text-xs' : 'text-sm'}`}>
                                        {percentage}%
                                    </span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
            
            {!isSmall && (
                <div className="mt-2 text-xs text-zinc-500 text-center">
                    {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
                </div>
            )}
        </div>
    );
}
