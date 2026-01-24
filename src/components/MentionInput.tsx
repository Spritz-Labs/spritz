"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";

// Regex to match mentions in the format @[name](address) - needs to be defined early
const MENTION_REGEX_GLOBAL = /@\[([^\]]+)\]\(([^)]+)\)/g;

// Convert raw value (with full mention format) to display value (clean @Name)
function toDisplayValue(value: string): string {
    return value.replace(MENTION_REGEX_GLOBAL, "@$1");
}

// Convert cursor position from display value to raw value
function displayToRawCursorPos(displayPos: number, rawValue: string): number {
    let displayIndex = 0;
    let rawIndex = 0;
    
    while (displayIndex < displayPos && rawIndex < rawValue.length) {
        // Check if we're at a mention start
        const remaining = rawValue.slice(rawIndex);
        const mentionMatch = remaining.match(/^@\[([^\]]+)\]\(([^)]+)\)/);
        
        if (mentionMatch) {
            const displayMentionLen = mentionMatch[1].length + 1; // +1 for @
            const rawMentionLen = mentionMatch[0].length;
            
            if (displayIndex + displayMentionLen <= displayPos) {
                displayIndex += displayMentionLen;
                rawIndex += rawMentionLen;
            } else {
                // Cursor is within the mention display text
                rawIndex += (displayPos - displayIndex);
                displayIndex = displayPos;
            }
        } else {
            displayIndex++;
            rawIndex++;
        }
    }
    
    return rawIndex;
}

// Convert cursor position from raw value to display value  
function rawToDisplayCursorPos(rawPos: number, rawValue: string): number {
    let displayIndex = 0;
    let rawIndex = 0;
    
    while (rawIndex < rawPos && rawIndex < rawValue.length) {
        const remaining = rawValue.slice(rawIndex);
        const mentionMatch = remaining.match(/^@\[([^\]]+)\]\(([^)]+)\)/);
        
        if (mentionMatch) {
            const displayMentionLen = mentionMatch[1].length + 1;
            const rawMentionLen = mentionMatch[0].length;
            
            if (rawIndex + rawMentionLen <= rawPos) {
                displayIndex += displayMentionLen;
                rawIndex += rawMentionLen;
            } else {
                // Cursor is within the raw mention - put it at end of display mention
                displayIndex += displayMentionLen;
                rawIndex = rawPos;
            }
        } else {
            displayIndex++;
            rawIndex++;
        }
    }
    
    return displayIndex;
}

// Detect if text looks like code
function looksLikeCode(text: string): { isCode: boolean; language: string } {
    const lines = text.split('\n');
    if (lines.length < 3) return { isCode: false, language: '' };
    
    // Check for common code patterns
    const codePatterns = [
        // Python
        { pattern: /^(import |from .+ import |def |class |if __name__)/, lang: 'python' },
        // JavaScript/TypeScript
        { pattern: /^(import |export |const |let |var |function |async |await |require\(|module\.exports)/, lang: 'javascript' },
        // TypeScript specific
        { pattern: /^(interface |type |namespace |enum |declare )/, lang: 'typescript' },
        // Shell/Bash (shebang starts with #!)
        { pattern: /^(#!\/|if \[|for .* in|while |echo |export |source )/, lang: 'bash' },
        // SQL
        { pattern: /^(SELECT |INSERT |UPDATE |DELETE |CREATE |ALTER |DROP |FROM |WHERE )/i, lang: 'sql' },
        // HTML
        { pattern: /^(<\!DOCTYPE|<html|<head|<body|<div|<span|<p |<script)/i, lang: 'html' },
        // CSS
        { pattern: /^(\.|#|@media|@import|body\s*\{|html\s*\{)/, lang: 'css' },
        // JSON
        { pattern: /^\s*[\{\[]/, lang: 'json' },
        // Rust
        { pattern: /^(fn |let mut |impl |struct |enum |use |mod |pub )/, lang: 'rust' },
        // Go
        { pattern: /^(package |import |func |type |var |const )/, lang: 'go' },
        // Solidity
        { pattern: /^(pragma solidity|contract |function |mapping|uint|address|bytes)/, lang: 'solidity' },
    ];
    
    // Check first few non-empty lines for patterns
    let matchedLang = '';
    for (const line of lines.slice(0, 10)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        for (const { pattern, lang } of codePatterns) {
            if (pattern.test(trimmed)) {
                matchedLang = lang;
                break;
            }
        }
        if (matchedLang) break;
    }
    
    // Also check for general code indicators
    const codeIndicators = [
        /[;{}()\[\]]+/, // Brackets and semicolons
        /=>|->|::/, // Arrows
        /\$\{|\$\(/, // Template strings / shell vars
        /^\s{2,}(if|for|while|return|const|let|var|def|func|fn)\b/, // Indented keywords
    ];
    
    let codeScore = 0;
    for (const line of lines) {
        for (const indicator of codeIndicators) {
            if (indicator.test(line)) codeScore++;
        }
    }
    
    // If matched a language or high code score, it's probably code
    const isCode = matchedLang !== '' || (codeScore >= lines.length * 0.3 && lines.length >= 5);
    
    return { isCode, language: matchedLang || 'text' };
}

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
    isAgent?: boolean; // For AI agents in channels
    avatarEmoji?: string; // Emoji fallback for agents
};

type MentionInputProps = {
    value: string;
    onChange: (value: string) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    placeholder?: string;
    disabled?: boolean;
    users: MentionUser[];
    className?: string;
    inputRef?: React.RefObject<HTMLTextAreaElement | null>;
    multiline?: boolean; // Enable Shift+Enter for new lines
    maxRows?: number; // Max height in rows (default 6)
    onSubmit?: () => void; // Called when Enter is pressed (without Shift)
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
    multiline = true,
    maxRows = 6,
    onSubmit,
}: MentionInputProps) {
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionFilter, setSuggestionFilter] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
    const [suggestionType, setSuggestionType] = useState<"mention" | "emoji">("mention");
    const internalInputRef = useRef<HTMLTextAreaElement>(null);
    const inputRef = externalInputRef || internalInputRef;
    const suggestionsRef = useRef<HTMLDivElement>(null);
    
    // Display value shows @Name instead of @[Name](address)
    const displayValue = useMemo(() => toDisplayValue(value), [value]);
    
    // Auto-resize textarea based on content
    useEffect(() => {
        const textarea = inputRef.current;
        if (textarea && multiline) {
            // Reset height to get accurate scrollHeight
            textarea.style.height = 'auto';
            // Calculate line height (roughly 24px per line)
            const lineHeight = 24;
            const maxHeight = lineHeight * maxRows;
            const newHeight = Math.min(textarea.scrollHeight, maxHeight);
            textarea.style.height = `${newHeight}px`;
        }
    }, [displayValue, multiline, maxRows, inputRef]);

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

    // Handle paste to detect code
    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const pastedText = e.clipboardData.getData('text');
        
        // Check if it looks like code (multi-line with code patterns)
        const { isCode, language } = looksLikeCode(pastedText);
        
        if (isCode && pastedText.includes('\n')) {
            e.preventDefault();
            
            // Wrap in code block
            const textarea = inputRef.current;
            const cursorPos = textarea?.selectionStart || 0;
            const beforeCursor = displayValue.slice(0, cursorPos);
            const afterCursor = displayValue.slice(textarea?.selectionEnd || cursorPos);
            
            // Add newlines if not at line start/end
            const needsNewlineBefore = beforeCursor.length > 0 && !beforeCursor.endsWith('\n');
            const needsNewlineAfter = afterCursor.length > 0 && !afterCursor.startsWith('\n');
            
            const codeBlock = `${needsNewlineBefore ? '\n' : ''}\`\`\`${language}\n${pastedText}\n\`\`\`${needsNewlineAfter ? '\n' : ''}`;
            
            const newDisplayValue = beforeCursor + codeBlock + afterCursor;
            
            // Calculate raw value equivalent
            const rawCursorPos = displayToRawCursorPos(cursorPos, value);
            const rawEndPos = displayToRawCursorPos(textarea?.selectionEnd || cursorPos, value);
            const newRawValue = value.slice(0, rawCursorPos) + codeBlock + value.slice(rawEndPos);
            
            onChange(newRawValue);
            
            // Set cursor after code block
            setTimeout(() => {
                if (textarea) {
                    const newCursorPos = beforeCursor.length + codeBlock.length;
                    textarea.focus();
                    textarea.setSelectionRange(newCursorPos, newCursorPos);
                }
            }, 0);
        }
        // Otherwise, let the default paste behavior happen
    }, [displayValue, value, onChange, inputRef]);

    // Handle input change
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newDisplayValue = e.target.value;
        const displayCursorPos = e.target.selectionStart || 0;
        
        // Calculate the diff between old and new display values
        const oldDisplayValue = displayValue;
        
        // Figure out what changed
        // Find the point where they diverge from the start
        let commonPrefixLen = 0;
        while (commonPrefixLen < oldDisplayValue.length && 
               commonPrefixLen < newDisplayValue.length && 
               oldDisplayValue[commonPrefixLen] === newDisplayValue[commonPrefixLen]) {
            commonPrefixLen++;
        }
        
        // Find common suffix
        let commonSuffixLen = 0;
        while (commonSuffixLen < (oldDisplayValue.length - commonPrefixLen) && 
               commonSuffixLen < (newDisplayValue.length - commonPrefixLen) &&
               oldDisplayValue[oldDisplayValue.length - 1 - commonSuffixLen] === 
               newDisplayValue[newDisplayValue.length - 1 - commonSuffixLen]) {
            commonSuffixLen++;
        }
        
        // Calculate what was deleted/inserted
        const deletedInDisplay = oldDisplayValue.slice(commonPrefixLen, oldDisplayValue.length - commonSuffixLen);
        const insertedInDisplay = newDisplayValue.slice(commonPrefixLen, newDisplayValue.length - commonSuffixLen);
        
        // Map positions to raw value
        const rawPrefixPos = displayToRawCursorPos(commonPrefixLen, value);
        const rawSuffixPos = displayToRawCursorPos(oldDisplayValue.length - commonSuffixLen, value);
        
        // Build new raw value
        const newRawValue = value.slice(0, rawPrefixPos) + insertedInDisplay + value.slice(rawSuffixPos);
        
        onChange(newRawValue);

        const textBeforeCursor = newDisplayValue.slice(0, displayCursorPos);

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
        const displayCursorPos = input?.selectionStart || displayValue.length;
        
        // mentionStartIndex is in display coordinates - convert to raw
        const rawMentionStart = displayToRawCursorPos(mentionStartIndex, value);
        const rawCursorPos = displayToRawCursorPos(displayCursorPos, value);
        
        // Replace @filter with @[name](address) in raw value
        const beforeMention = value.slice(0, rawMentionStart);
        const afterCursor = value.slice(rawCursorPos);
        const mentionText = `@[${getDisplayName(user)}](${user.address}) `;
        
        const newValue = beforeMention + mentionText + afterCursor;
        onChange(newValue);
        
        setShowSuggestions(false);
        setMentionStartIndex(null);
        setSuggestionFilter("");
        
        // Focus and set cursor position in display coordinates
        setTimeout(() => {
            if (input) {
                // Display version will show @Name (name.length + 1 for @, + 1 for space)
                const displayMentionLen = getDisplayName(user).length + 2; // @Name + space
                const newDisplayCursorPos = mentionStartIndex + displayMentionLen;
                input.focus();
                input.setSelectionRange(newDisplayCursorPos, newDisplayCursorPos);
            }
        }, 0);
    }, [mentionStartIndex, value, displayValue, onChange, inputRef]);

    // Handle selecting an emoji
    const selectEmoji = useCallback((emoji: string) => {
        if (mentionStartIndex === null) return;

        const input = inputRef.current;
        const displayCursorPos = input?.selectionStart || displayValue.length;
        
        // mentionStartIndex is in display coordinates - convert to raw
        const rawMentionStart = displayToRawCursorPos(mentionStartIndex, value);
        const rawCursorPos = displayToRawCursorPos(displayCursorPos, value);
        
        // Replace :filter with emoji in raw value
        const beforeEmoji = value.slice(0, rawMentionStart);
        const afterCursor = value.slice(rawCursorPos);
        const emojiText = emoji + " ";
        
        const newValue = beforeEmoji + emojiText + afterCursor;
        onChange(newValue);
        
        setShowSuggestions(false);
        setMentionStartIndex(null);
        setSuggestionFilter("");
        
        // Focus and set cursor position in display coordinates
        setTimeout(() => {
            if (input) {
                const newDisplayCursorPos = mentionStartIndex + emojiText.length;
                input.focus();
                input.setSelectionRange(newDisplayCursorPos, newDisplayCursorPos);
            }
        }, 0);
    }, [mentionStartIndex, value, displayValue, onChange, inputRef]);

    // Handle keyboard navigation in suggestions
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
        
        // Handle Shift+Enter for new line (multiline mode)
        if (multiline && e.key === "Enter" && e.shiftKey) {
            // Explicitly insert newline at cursor position
            e.preventDefault();
            const textarea = inputRef.current;
            if (textarea) {
                const start = textarea.selectionStart || 0;
                const end = textarea.selectionEnd || 0;
                const currentDisplayValue = displayValue;
                const newDisplayValue = currentDisplayValue.slice(0, start) + "\n" + currentDisplayValue.slice(end);
                
                // Convert to raw value
                const rawStart = displayToRawCursorPos(start, value);
                const rawEnd = displayToRawCursorPos(end, value);
                const newRawValue = value.slice(0, rawStart) + "\n" + value.slice(rawEnd);
                
                onChange(newRawValue);
                
                // Set cursor after newline
                setTimeout(() => {
                    textarea.selectionStart = start + 1;
                    textarea.selectionEnd = start + 1;
                }, 0);
            }
            return;
        }
        
        // Handle Enter to submit (without Shift in multiline mode)
        if (e.key === "Enter" && !e.shiftKey) {
            if (onSubmit) {
                e.preventDefault();
                onSubmit();
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
        <div className="relative flex-1 min-w-0">
            <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                inputMode="text"
                enterKeyHint="send"
                autoComplete="off"
                autoCorrect="on"
                autoCapitalize="sentences"
                value={displayValue}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={placeholder}
                disabled={disabled}
                rows={1}
                className={`w-full resize-none overflow-y-auto ${className || ""}`}
                style={{ minHeight: '24px', maxHeight: `${24 * maxRows}px` }}
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
                                            {user.isAgent ? (
                                                // Agent avatar - show image, emoji, or fallback
                                                user.avatar ? (
                                                    <img
                                                        src={user.avatar}
                                                        alt=""
                                                        className="w-8 h-8 rounded-lg object-cover ring-1 ring-purple-500/50"
                                                    />
                                                ) : user.avatarEmoji ? (
                                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-lg ring-1 ring-purple-500/50">
                                                        {user.avatarEmoji}
                                                    </div>
                                                ) : (
                                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold ring-1 ring-purple-500/50">
                                                        🤖
                                                    </div>
                                                )
                                            ) : user.avatar ? (
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
                                                <div className="flex items-center gap-1.5">
                                                    <p className="font-medium truncate">
                                                        {getDisplayName(user)}
                                                    </p>
                                                    {user.isAgent && (
                                                        <span className="shrink-0 text-[9px] px-1 py-0.5 bg-purple-500/20 text-purple-400 rounded font-medium">
                                                            AI
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-zinc-500 truncate">
                                                    {user.isAgent ? "AI Agent" : formatAddress(user.address)}
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
// Note: MENTION_REGEX_GLOBAL is defined at the top of the file for toDisplayValue()

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
