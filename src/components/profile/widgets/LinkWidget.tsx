"use client";

import { LinkWidgetConfig } from "../ProfileWidgetTypes";
import { sanitizeUrl, sanitizeImageUrl } from "@/lib/urlSecurity";

interface LinkWidgetProps {
    config: LinkWidgetConfig;
    size: string;
}

export function LinkWidget({ config, size }: LinkWidgetProps) {
    const { url, title, description, icon } = config;
    
    const isSmall = size === '1x1';
    const isEmoji = icon && /\p{Emoji}/u.test(icon);
    
    // Sanitize the URL
    const safeUrl = sanitizeUrl(url);
    const safeIconUrl = icon && !isEmoji ? sanitizeImageUrl(icon) : null;
    
    // Extract domain for display
    const domain = (() => {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch {
            return url;
        }
    })();
    
    // If URL is unsafe, render without link
    if (!safeUrl) {
        return (
            <div className="w-full h-full flex flex-col justify-center p-5 sm:p-6 rounded-2xl bg-zinc-900 border border-zinc-800">
                <p className="text-zinc-500 text-sm">Invalid link</p>
            </div>
        );
    }
    
    return (
        <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="w-full h-full flex flex-col justify-center p-5 sm:p-6 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50 transition-all group"
        >
            <div className={`flex ${isSmall ? 'flex-col items-center text-center' : 'items-start gap-4'}`}>
                {/* Icon */}
                <div className={`
                    ${isSmall ? 'w-12 h-12 mb-2' : 'w-14 h-14'}
                    rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0
                    group-hover:scale-110 transition-transform
                `}>
                    {isEmoji ? (
                        <span className="text-2xl">{icon}</span>
                    ) : safeIconUrl ? (
                        <img src={safeIconUrl} alt="" className="w-8 h-8 rounded" />
                    ) : (
                        <svg className="w-6 h-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                    )}
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                    <p className={`text-white font-semibold ${isSmall ? 'text-sm' : 'text-base'} truncate`}>
                        {title}
                    </p>
                    {description && !isSmall && (
                        <p className="text-zinc-400 text-sm mt-1 line-clamp-2">
                            {description}
                        </p>
                    )}
                    <p className="text-zinc-500 text-xs mt-1 truncate">
                        {domain}
                    </p>
                </div>
                
                {/* Arrow */}
                {!isSmall && (
                    <svg className="w-5 h-5 text-zinc-500 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                )}
            </div>
        </a>
    );
}
