"use client";

import { GoalsChecklistWidgetConfig } from "../ProfileWidgetTypes";
import { motion } from "motion/react";

interface GoalsChecklistWidgetProps {
    config: GoalsChecklistWidgetConfig;
    size: string;
}

export function GoalsChecklistWidget({ config, size }: GoalsChecklistWidgetProps) {
    const { title = "Goals", goals, showProgress = true } = config;
    
    const isSmall = size === '2x1';
    const displayGoals = goals.slice(0, isSmall ? 4 : 6);
    const completedCount = goals.filter(g => g.completed).length;
    const progress = goals.length > 0 ? Math.round((completedCount / goals.length) * 100) : 0;
    
    return (
        <div className="w-full h-full p-3 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-white font-bold text-sm flex items-center gap-2">
                    <span>✅</span> {title}
                </h3>
                {showProgress && (
                    <span className="text-xs text-emerald-400 font-medium">
                        {completedCount}/{goals.length}
                    </span>
                )}
            </div>
            
            {/* Progress bar */}
            {showProgress && !isSmall && (
                <div className="h-1.5 bg-zinc-800 rounded-full mb-3 overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                    />
                </div>
            )}
            
            {/* Goals list */}
            <div className="flex-1 space-y-1.5 overflow-hidden">
                {displayGoals.map((goal) => (
                    <div
                        key={goal.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                            goal.completed 
                                ? 'bg-emerald-500/10' 
                                : 'bg-zinc-800/50'
                        }`}
                    >
                        {/* Checkbox */}
                        <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${
                            goal.completed 
                                ? 'bg-emerald-500 text-white' 
                                : 'border border-zinc-600'
                        }`}>
                            {goal.completed && (
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                        </div>
                        
                        {/* Goal text */}
                        <span className={`text-xs flex-1 truncate ${
                            goal.completed 
                                ? 'text-zinc-400 line-through' 
                                : 'text-white'
                        }`}>
                            {goal.emoji && <span className="mr-1">{goal.emoji}</span>}
                            {goal.text}
                        </span>
                    </div>
                ))}
                
                {goals.length > displayGoals.length && (
                    <p className="text-xs text-zinc-500 text-center pt-1">
                        +{goals.length - displayGoals.length} more
                    </p>
                )}
            </div>
        </div>
    );
}
