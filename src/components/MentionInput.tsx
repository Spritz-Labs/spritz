"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";

export type MentionUser = {
    address: string;
    name: string | null;
    avatar: string | null;
};

type MentionInputProps = {
    value: string;
    onChange: (value: string) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    placeholder?: string;
    disabled?: boolean;
    users: MentionUser[];
    className?: string;
    inputRef?: React.RefObject<HTMLInputElement | null>;
};

export function MentionInput({
    value,
    onChange,
    onKeyDown,
    placeholder,
    disabled,
    users,
    className,
    inputRef: externalInputRef,
}: MentionInputProps) {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionFilter, setSuggestionFilter] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
    const internalInputRef = useRef<HTMLInputElement>(null);
    const inputRef = externalInputRef || internalInputRef;
    const suggestionsRef = useRef<HTMLDivElement>(null);

    // Filter users based on input
    const filteredUsers = users.filter((user) => {
        const searchTerm = suggestionFilter.toLowerCase();
        const name = user.name?.toLowerCase() || "";
        const address = user.address.toLowerCase();
        return name.includes(searchTerm) || address.includes(searchTerm);
    }).slice(0, 6); // Limit to 6 suggestions

    // Format address for display
    const formatAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    // Get display name
    const getDisplayName = (user: MentionUser) => {
        return user.name || formatAddress(user.address);
    };

    // Handle input change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        const cursorPosition = e.target.selectionStart || 0;
        
        onChange(newValue);

        // Check if we should show mention suggestions
        // Look backward from cursor to find @
        const textBeforeCursor = newValue.slice(0, cursorPosition);
        const lastAtIndex = textBeforeCursor.lastIndexOf("@");
        
        if (lastAtIndex !== -1) {
            // Check if @ is at start or preceded by space
            const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : " ";
            if (charBeforeAt === " " || lastAtIndex === 0) {
                // Check if there's no space after @ (user is still typing)
                const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
                if (!textAfterAt.includes(" ")) {
                    setMentionStartIndex(lastAtIndex);
                    setSuggestionFilter(textAfterAt);
                    setShowSuggestions(true);
                    setSelectedIndex(0);
                    return;
                }
            }
        }
        
        setShowSuggestions(false);
        setMentionStartIndex(null);
    };

    // Handle selecting a mention
    const selectMention = useCallback((user: MentionUser) => {
        if (mentionStartIndex === null) return;

        const input = inputRef.current;
        const cursorPosition = input?.selectionStart || value.length;
        
        // Replace @filter with @[name](address)
        const beforeMention = value.slice(0, mentionStartIndex);
        const afterCursor = value.slice(cursorPosition);
        const mentionText = `@[${getDisplayName(user)}](${user.address}) `;
        
        const newValue = beforeMention + mentionText + afterCursor;
        onChange(newValue);
        
        setShowSuggestions(false);
        setMentionStartIndex(null);
        setSuggestionFilter("");
        
        // Focus and set cursor position
        setTimeout(() => {
            if (input) {
                const newCursorPos = beforeMention.length + mentionText.length;
                input.focus();
                input.setSelectionRange(newCursorPos, newCursorPos);
            }
        }, 0);
    }, [mentionStartIndex, value, onChange, inputRef]);

    // Handle keyboard navigation in suggestions
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (showSuggestions && filteredUsers.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((prev) => 
                    prev < filteredUsers.length - 1 ? prev + 1 : 0
                );
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex((prev) => 
                    prev > 0 ? prev - 1 : filteredUsers.length - 1
                );
                return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                selectMention(filteredUsers[selectedIndex]);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                setShowSuggestions(false);
                return;
            }
        }
        
        // Pass through to parent handler
        onKeyDown?.(e);
    };

    // Close suggestions on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                suggestionsRef.current && 
                !suggestionsRef.current.contains(e.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(e.target as Node)
            ) {
                setShowSuggestions(false);
            }
        };
        
        if (showSuggestions) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [showSuggestions, inputRef]);

    return (
        <div className="relative flex-1">
            <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type="text"
                inputMode="text"
                enterKeyHint="send"
                autoComplete="off"
                autoCorrect="on"
                autoCapitalize="sentences"
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                className={className}
            />
            
            {/* Mention Suggestions Popup */}
            <AnimatePresence>
                {showSuggestions && filteredUsers.length > 0 && (
                    <motion.div
                        ref={suggestionsRef}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-full left-0 right-0 mb-2 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50"
                    >
                        <div className="p-2">
                            <p className="text-xs text-zinc-500 px-2 mb-1">
                                Mention someone
                            </p>
                            {filteredUsers.map((user, index) => (
                                <button
                                    key={user.address}
                                    onClick={() => selectMention(user)}
                                    className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${
                                        index === selectedIndex
                                            ? "bg-orange-500/20 text-white"
                                            : "hover:bg-zinc-700 text-zinc-300"
                                    }`}
                                >
                                    {user.avatar ? (
                                        <img
                                            src={user.avatar}
                                            alt=""
                                            className="w-8 h-8 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white text-xs font-bold">
                                            {getDisplayName(user).slice(0, 2).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="flex-1 text-left min-w-0">
                                        <p className="font-medium truncate">
                                            {getDisplayName(user)}
                                        </p>
                                        <p className="text-xs text-zinc-500 truncate">
                                            {formatAddress(user.address)}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Regex to match mentions in the format @[name](address)
const MENTION_REGEX = /@\[([^\]]+)\]\(([^)]+)\)/g;

// Parse mentions from text
export function parseMentions(text: string): Array<{
    type: "text" | "mention";
    content: string;
    address?: string;
}> {
    const parts: Array<{
        type: "text" | "mention";
        content: string;
        address?: string;
    }> = [];
    
    let lastIndex = 0;
    let match;
    
    while ((match = MENTION_REGEX.exec(text)) !== null) {
        // Add text before mention
        if (match.index > lastIndex) {
            parts.push({
                type: "text",
                content: text.slice(lastIndex, match.index),
            });
        }
        
        // Add mention
        parts.push({
            type: "mention",
            content: match[1], // The display name
            address: match[2], // The address
        });
        
        lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
        parts.push({
            type: "text",
            content: text.slice(lastIndex),
        });
    }
    
    // Reset regex state
    MENTION_REGEX.lastIndex = 0;
    
    return parts.length > 0 ? parts : [{ type: "text", content: text }];
}

// Check if a message mentions a specific address
export function hasMention(text: string, address: string): boolean {
    const lowerAddress = address.toLowerCase();
    let match;
    
    while ((match = MENTION_REGEX.exec(text)) !== null) {
        if (match[2].toLowerCase() === lowerAddress) {
            MENTION_REGEX.lastIndex = 0;
            return true;
        }
    }
    
    MENTION_REGEX.lastIndex = 0;
    return false;
}

// Get all mentioned addresses from text
export function getMentionedAddresses(text: string): string[] {
    const addresses: string[] = [];
    let match;
    
    while ((match = MENTION_REGEX.exec(text)) !== null) {
        addresses.push(match[2].toLowerCase());
    }
    
    MENTION_REGEX.lastIndex = 0;
    return addresses;
}
