"use client";

import { parseMentions, parsePoaps, hasPoap } from "./MentionInput";
import { PoapBadge } from "./PoapBadge";

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
    // First pass: parse mentions
    const mentionParts = parseMentions(text);
    
    return (
        <span className={className}>
            {mentionParts.map((part, index) => {
                if (part.type === "mention" && part.address) {
                    const isSelf = currentUserAddress && 
                        part.address.toLowerCase() === currentUserAddress.toLowerCase();
                    
                    // Strip leading @ from content if present (to avoid @@username)
                    const displayName = part.content.startsWith("@") 
                        ? part.content.slice(1) 
                        : part.content;
                    
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
                            @{displayName}
                        </button>
                    );
                }
                
                // Second pass: check text parts for POAP embeds
                if (hasPoap(part.content)) {
                    const poapParts = parsePoaps(part.content);
                    return (
                        <span key={index}>
                            {poapParts.map((pp, ppIdx) => {
                                if (pp.type === "poap" && pp.poap) {
                                    return <PoapBadge key={ppIdx} poap={pp.poap} />;
                                }
                                return <span key={ppIdx}>{pp.content}</span>;
                            })}
                        </span>
                    );
                }
                
                return <span key={index}>{part.content}</span>;
            })}
        </span>
    );
}

// Simple text version for notifications or previews
export function getMentionDisplayText(text: string): string {
    let result = text.replace(/@\[([^\]]+)\]\([^)]+\)/g, (_, name) => {
        // Strip leading @ from name if present (to avoid @@username)
        const displayName = name.startsWith("@") ? name.slice(1) : name;
        return `@${displayName}`;
    });
    // Also strip POAP embeds to plain text
    result = result.replace(/\[poap:\d+:([^:\]]+):[^\]]*\]/g, (_, name) => `🏆 ${name}`);
    return result;
}
