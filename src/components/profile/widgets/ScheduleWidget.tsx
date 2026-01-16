"use client";

import Link from "next/link";
import { WidgetSize, ScheduleWidgetConfig } from "../ProfileWidgetTypes";

interface ScheduleWidgetProps {
    config: ScheduleWidgetConfig;
    size: WidgetSize;
}

export function ScheduleWidget({ config, size }: ScheduleWidgetProps) {
    const { slug, title = "Book a call", subtitle = "Schedule a meeting" } = config;
    
    const isCompact = size === '1x1';
    
    return (
        <Link
            href={`/book/${slug}`}
            className="block w-full h-full p-4 sm:p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:bg-zinc-800/80 hover:border-emerald-500/50 transition-all group"
        >
            <div className={`flex ${isCompact ? 'flex-col items-center justify-center h-full' : 'items-center gap-3'}`}>
                <div className={`${isCompact ? 'w-10 h-10 mb-2' : 'w-12 h-12'} rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0`}>
                    <span className={`${isCompact ? 'text-xl' : 'text-2xl'}`}>📅</span>
                </div>
                <div className={`${isCompact ? 'text-center' : 'flex-1 min-w-0'}`}>
                    <p className={`text-white font-semibold ${isCompact ? 'text-sm' : ''}`}>{title}</p>
                    {!isCompact && subtitle && (
                        <p className="text-zinc-500 text-sm truncate">{subtitle}</p>
                    )}
                </div>
                {!isCompact && (
                    <svg className="w-5 h-5 text-emerald-500 group-hover:translate-x-1 transition-transform flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                )}
            </div>
        </Link>
    );
}
