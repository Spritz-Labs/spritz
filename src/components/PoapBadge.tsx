"use client";

import { type ParsedPoap } from "./MentionInput";

type PoapBadgeProps = {
    poap: ParsedPoap;
    compact?: boolean;
};

/**
 * Renders an inline POAP badge in chat messages.
 * Shows the POAP image + name as a clickable badge that
 * links to the POAP gallery page.
 */
export function PoapBadge({ poap, compact = false }: PoapBadgeProps) {
    const poapUrl = `https://collectors.poap.xyz/token/${poap.eventId}`;

    if (compact) {
        return (
            <a
                href={poapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/15 hover:bg-purple-500/25 rounded-full transition-colors cursor-pointer"
                onClick={(e) => e.stopPropagation()}
            >
                {poap.imageUrl ? (
                    <img
                        src={poap.imageUrl}
                        alt=""
                        className="w-4 h-4 rounded-full object-cover"
                    />
                ) : (
                    <span className="text-xs">🏆</span>
                )}
                <span className="text-xs font-medium text-purple-300 truncate max-w-[150px]">
                    {poap.eventName}
                </span>
            </a>
        );
    }

    return (
        <a
            href={poapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 px-3 py-2 my-1 bg-gradient-to-r from-purple-500/15 to-pink-500/10 hover:from-purple-500/25 hover:to-pink-500/20 border border-purple-500/20 rounded-xl transition-all cursor-pointer group"
            onClick={(e) => e.stopPropagation()}
        >
            {poap.imageUrl ? (
                <img
                    src={poap.imageUrl}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-purple-500/30 group-hover:ring-purple-500/50 transition-all"
                />
            ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold ring-2 ring-purple-500/30">
                    🏆
                </div>
            )}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate group-hover:text-purple-200 transition-colors">
                    {poap.eventName}
                </p>
                <p className="text-[10px] text-purple-400/70 uppercase tracking-wider font-medium">
                    POAP
                </p>
            </div>
            <svg
                className="w-4 h-4 text-purple-400/50 group-hover:text-purple-300 shrink-0 transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
            </svg>
        </a>
    );
}
