"use client";

import { parseMentions } from "./MentionInput";

type MentionTextProps = {
    text: string;
    currentUserAddress?: string;
    onMentionClick?: (address: string) => void;
    className?: string;
};

export function MentionText({
    text,
    currentUserAddress,
    onMentionClick,
    className = "",
}: MentionTextProps) {
    const parts = parseMentions(text);
    
    return (
        <span className={className}>
            {parts.map((part, index) => {
                if (part.type === "mention" && part.address) {
                    const isSelf = currentUserAddress && 
                        part.address.toLowerCase() === currentUserAddress.toLowerCase();
                    
                    return (
                        <button
                            key={index}
                            onClick={(e) => {
                                e.stopPropagation();
                                onMentionClick?.(part.address!);
                            }}
                            className={`inline-flex items-center font-medium rounded px-0.5 -mx-0.5 transition-colors ${
                                isSelf
                                    ? "text-orange-400 bg-orange-500/20 hover:bg-orange-500/30"
                                    : "text-blue-400 bg-blue-500/20 hover:bg-blue-500/30"
                            }`}
                        >
                            @{part.content}
                        </button>
                    );
                }
                
                return <span key={index}>{part.content}</span>;
            })}
        </span>
    );
}

// Simple text version for notifications or previews
export function getMentionDisplayText(text: string): string {
    return text.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");
}
