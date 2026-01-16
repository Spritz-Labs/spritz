"use client";

import Link from "next/link";
import { WidgetSize, MessageMeWidgetConfig } from "../ProfileWidgetTypes";

interface MessageMeWidgetProps {
    config: MessageMeWidgetConfig;
    size: WidgetSize;
}

export function MessageMeWidget({ config, size }: MessageMeWidgetProps) {
    const { address, title = "Message me", subtitle = "Chat on Spritz" } = config;
    
    const isCompact = size === '1x1';
    
    return (
        <Link
            href={`/?chat=${address}`}
            className="block w-full h-full p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 hover:shadow-xl hover:scale-[1.02] transition-all group"
        >
            <div className={`flex ${isCompact ? 'flex-col items-center justify-center h-full' : 'items-center gap-3'}`}>
                <div className={`${isCompact ? 'w-10 h-10 mb-2' : 'w-12 h-12'} rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0`}>
                    <svg className={`${isCompact ? 'w-5 h-5' : 'w-6 h-6'} text-white`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                </div>
                <div className={`${isCompact ? 'text-center' : 'flex-1'}`}>
                    <p className={`text-white font-semibold ${isCompact ? 'text-sm' : 'text-lg'}`}>{title}</p>
                    {!isCompact && subtitle && (
                        <p className="text-white/70 text-sm">{subtitle}</p>
                    )}
                </div>
                {!isCompact && (
                    <svg className="w-5 h-5 text-white/70 group-hover:translate-x-1 transition-transform flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                )}
            </div>
        </Link>
    );
}
