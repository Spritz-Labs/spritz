"use client";

import { StatsWidgetConfig } from "../ProfileWidgetTypes";

interface StatsWidgetProps {
    config: StatsWidgetConfig;
    size: string;
}

export function StatsWidget({ config, size }: StatsWidgetProps) {
    const { stats, layout = 'row' } = config;
    
    const isWide = size === '4x1' || size === '2x1';
    const useRow = layout === 'row' || isWide;
    
    return (
        <div className={`w-full h-full flex ${useRow ? 'flex-row items-center justify-around' : 'flex-col justify-center'} p-4 sm:p-6 rounded-2xl bg-zinc-900 border border-zinc-800`}>
            {stats.map((stat, index) => (
                <div
                    key={index}
                    className={`text-center ${useRow ? '' : 'py-2'} ${
                        index < stats.length - 1 && useRow ? 'border-r border-zinc-800 pr-4 sm:pr-6' : ''
                    }`}
                >
                    {stat.emoji && (
                        <span className="text-xl mb-1 block">{stat.emoji}</span>
                    )}
                    <p className="text-white font-bold text-xl sm:text-2xl">
                        {typeof stat.value === 'number' 
                            ? stat.value.toLocaleString()
                            : stat.value
                        }
                    </p>
                    <p className="text-zinc-500 text-xs sm:text-sm">{stat.label}</p>
                </div>
            ))}
        </div>
    );
}
