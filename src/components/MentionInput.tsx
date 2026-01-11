"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";

// Common emoji shortcodes (name -> emoji)
const EMOJI_SHORTCODES: Record<string, string> = {
    // Smileys
    smile: "😊", grin: "😀", joy: "😂", rofl: "🤣", wink: "😉",
    heart_eyes: "😍", kiss: "😘", yum: "😋", stuck_out_tongue: "😛",
    thinking: "🤔", shush: "🤫", raised_eyebrow: "🤨", neutral: "😐",
    expressionless: "😑", unamused: "😒", rolling_eyes: "🙄", grimacing: "😬",
    relieved: "😌", pensive: "😔", sleepy: "😪", drooling: "🤤", sleeping: "😴",
    mask: "😷", nerd: "🤓", sunglasses: "😎", cowboy: "🤠", party: "🥳",
    smirk: "😏", relaxed: "☺️", blush: "😊", innocent: "😇",
    // Gestures
    wave: "👋", ok: "👌", pinched: "🤌", peace: "✌️", crossed_fingers: "🤞",
    love_you: "🤟", rock: "🤤", call_me: "🤙", shaka: "🤙🏼", point_up: "☝️",
    thumbsup: "👍", thumbs_up: "👍", "+1": "👍", thumbsdown: "👎", thumbs_down: "👎", "-1": "👎",
    fist: "✊", punch: "👊", clap: "👏", raised_hands: "🙌", pray: "🙏",
    handshake: "🤝", muscle: "💪", flex: "💪",
    // Hearts
    heart: "❤️", red_heart: "❤️", orange_heart: "🧡", yellow_heart: "💛",
    green_heart: "💚", blue_heart: "💙", purple_heart: "💜", black_heart: "🖤",
    white_heart: "🤍", broken_heart: "💔", sparkling_heart: "💖",
    // Symbols
    fire: "🔥", lit: "🔥", star: "⭐", sparkles: "✨", zap: "⚡", boom: "💥",
    100: "💯", check: "✅", x: "❌", question: "❓", exclamation: "❗",
    eyes: "👀", eye: "👁️", brain: "🧠", skull: "💀", ghost: "👻",
    // Objects
    rocket: "🚀", moon: "🌙", sun: "☀️", rainbow: "🌈", cloud: "☁️",
    money: "💰", gem: "💎", crown: "👑", trophy: "🏆", medal: "🏅",
    gift: "🎁", balloon: "🎈", tada: "🎉", confetti: "🎊",
    // Food & Drink
    pizza: "🍕", burger: "🍔", fries: "🍟", taco: "🌮", sushi: "🍣",
    coffee: "☕", beer: "🍺", wine: "🍷", cocktail: "🍸", cake: "🎂",
    // Animals
    dog: "🐶", cat: "🐱", unicorn: "🦄", bear: "🐻", panda: "🐼",
    monkey: "🐵", chicken: "🐔", penguin: "🐧", butterfly: "🦋", bee: "🐝",
    // Misc
    poop: "💩", angry: "😠", rage: "🤬", cry: "😢", sob: "😭",
    scream: "😱", cold_sweat: "😰", triumph: "😤", disappointed: "😞",
    worried: "😟", confused: "😕", upside_down: "🙃", money_mouth: "🤑",
    zipper_mouth: "🤐", nauseated: "🤢", sneezing: "🤧", hot: "🥵", cold: "🥶",
    woozy: "🥴", dizzy: "😵", exploding_head: "🤯", pleading: "🥺",
};

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
    const [suggestionType, setSuggestionType] = useState<"mention" | "emoji">("mention");
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

    // Filter emojis based on input
    const filteredEmojis = Object.entries(EMOJI_SHORTCODES)
        .filter(([name]) => name.toLowerCase().includes(suggestionFilter.toLowerCase()))
        .slice(0, 8); // Limit to 8 suggestions

    // Format address for display
    const formatAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    // Get display name (strip leading @ if present to avoid @@username)
    const getDisplayName = (user: MentionUser) => {
        const name = user.name || formatAddress(user.address);
        return name.startsWith("@") ? name.slice(1) : name;
    };

    // Handle input change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        const cursorPosition = e.target.selectionStart || 0;
        
        onChange(newValue);

        const textBeforeCursor = newValue.slice(0, cursorPosition);

        // Check for emoji shortcode trigger (:)
        const lastColonIndex = textBeforeCursor.lastIndexOf(":");
        if (lastColonIndex !== -1) {
            const charBeforeColon = lastColonIndex > 0 ? textBeforeCursor[lastColonIndex - 1] : " ";
            if (charBeforeColon === " " || lastColonIndex === 0) {
                const textAfterColon = textBeforeCursor.slice(lastColonIndex + 1);
                // Only show if user has typed at least 1 character and no space
                if (textAfterColon.length >= 1 && !textAfterColon.includes(" ")) {
                    setMentionStartIndex(lastColonIndex);
                    setSuggestionFilter(textAfterColon);
                    setSuggestionType("emoji");
                    setShowSuggestions(true);
                    setSelectedIndex(0);
                    return;
                }
            }
        }

        // Check for mention trigger (@)
        const lastAtIndex = textBeforeCursor.lastIndexOf("@");
        if (lastAtIndex !== -1) {
            const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : " ";
            if (charBeforeAt === " " || lastAtIndex === 0) {
                const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
                if (!textAfterAt.includes(" ")) {
                    setMentionStartIndex(lastAtIndex);
                    setSuggestionFilter(textAfterAt);
                    setSuggestionType("mention");
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

    // Handle selecting an emoji
    const selectEmoji = useCallback((emoji: string) => {
        if (mentionStartIndex === null) return;

        const input = inputRef.current;
        const cursorPosition = input?.selectionStart || value.length;
        
        // Replace :filter with emoji
        const beforeEmoji = value.slice(0, mentionStartIndex);
        const afterCursor = value.slice(cursorPosition);
        const emojiText = emoji + " ";
        
        const newValue = beforeEmoji + emojiText + afterCursor;
        onChange(newValue);
        
        setShowSuggestions(false);
        setMentionStartIndex(null);
        setSuggestionFilter("");
        
        // Focus and set cursor position
        setTimeout(() => {
            if (input) {
                const newCursorPos = beforeEmoji.length + emojiText.length;
                input.focus();
                input.setSelectionRange(newCursorPos, newCursorPos);
            }
        }, 0);
    }, [mentionStartIndex, value, onChange, inputRef]);

    // Handle keyboard navigation in suggestions
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const items = suggestionType === "emoji" ? filteredEmojis : filteredUsers;
        
        if (showSuggestions && items.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((prev) => 
                    prev < items.length - 1 ? prev + 1 : 0
                );
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex((prev) => 
                    prev > 0 ? prev - 1 : items.length - 1
                );
                return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                if (suggestionType === "emoji") {
                    selectEmoji(filteredEmojis[selectedIndex][1]);
                } else {
                    selectMention(filteredUsers[selectedIndex]);
                }
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
            
            {/* Suggestions Popup (Mentions or Emojis) */}
            <AnimatePresence>
                {showSuggestions && (
                    (suggestionType === "emoji" && filteredEmojis.length > 0) ||
                    (suggestionType === "mention" && filteredUsers.length > 0)
                ) && (
                    <motion.div
                        ref={suggestionsRef}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute bottom-full left-0 right-0 mb-2 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50"
                    >
                        <div className="p-2">
                            {suggestionType === "emoji" ? (
                                <>
                                    <p className="text-xs text-zinc-500 px-2 mb-1">
                                        Emojis — type <code className="bg-zinc-700 px-1 rounded">:{suggestionFilter}</code>
                                    </p>
                                    {filteredEmojis.map(([name, emoji], index) => (
                                        <button
                                            key={name}
                                            onClick={() => selectEmoji(emoji)}
                                            className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg transition-colors ${
                                                index === selectedIndex
                                                    ? "bg-orange-500/20 text-white"
                                                    : "hover:bg-zinc-700 text-zinc-300"
                                            }`}
                                        >
                                            <span className="text-2xl">{emoji}</span>
                                            <span className="text-sm text-zinc-400">:{name}:</span>
                                        </button>
                                    ))}
                                </>
                            ) : (
                                <>
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
                                </>
                            )}
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
