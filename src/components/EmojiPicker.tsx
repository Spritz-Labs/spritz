"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";

// Categorized emoji data
const EMOJI_CATEGORIES = {
    recent: { icon: "🕐", name: "Recent", emojis: [] as string[] },
    smileys: {
        icon: "😀",
        name: "Smileys",
        emojis: [
            "😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "😇", "🙂",
            "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛",
            "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨",
            "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "😮‍💨", "🤥", "😌",
            "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🥵",
            "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐",
        ],
    },
    gestures: {
        icon: "👋",
        name: "Gestures",
        emojis: [
            "👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞",
            "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍",
            "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝",
            "🙏", "✍️", "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻", "👃",
        ],
    },
    hearts: {
        icon: "❤️",
        name: "Hearts",
        emojis: [
            "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
            "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "♥️",
        ],
    },
    animals: {
        icon: "🐶",
        name: "Animals",
        emojis: [
            "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐻‍❄️", "🐨",
            "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🐤",
            "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🪱",
            "🐛", "🦋", "🐌", "🐞", "🐜", "🪰", "🪲", "🪳", "🦟", "🦗",
        ],
    },
    food: {
        icon: "🍕",
        name: "Food",
        emojis: [
            "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈",
            "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦",
            "🌶️", "🫑", "🥒", "🥬", "🥕", "🧄", "🧅", "🥔", "🍠", "🥐",
            "🍕", "🍔", "🍟", "🌭", "🍿", "🧂", "🥓", "🍳", "🧇", "🥞",
        ],
    },
    activities: {
        icon: "⚽",
        name: "Activities",
        emojis: [
            "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱",
            "🪀", "🏓", "🏸", "🏒", "🏑", "🥍", "🏏", "🪃", "🥅", "⛳",
            "🪁", "🏹", "🎣", "🤿", "🥊", "🥋", "🎽", "🛹", "🛼", "🛷",
            "⛸️", "🥌", "🎿", "⛷️", "🏂", "🪂", "🏋️", "🤸", "🤺", "⛹️",
        ],
    },
    objects: {
        icon: "💡",
        name: "Objects",
        emojis: [
            "⌚", "📱", "💻", "⌨️", "🖥️", "🖨️", "🖱️", "🖲️", "🕹️", "🗜️",
            "💾", "💿", "📀", "📼", "📷", "📸", "📹", "🎥", "📽️", "🎞️",
            "📞", "☎️", "📟", "📠", "📺", "📻", "🎙️", "🎚️", "🎛️", "🧭",
            "⏱️", "⏲️", "⏰", "🕰️", "💡", "🔦", "🕯️", "🪔", "💎", "💰",
        ],
    },
    symbols: {
        icon: "💯",
        name: "Symbols",
        emojis: [
            "💯", "🔥", "⭐", "🌟", "✨", "⚡", "💥", "💫", "💦", "💨",
            "🎯", "💢", "💬", "👁️‍🗨️", "🗨️", "🗯️", "💭", "💤", "✅", "❌",
            "❓", "❗", "‼️", "⁉️", "💲", "♻️", "⚜️", "🔱", "📛", "🔰",
            "⭕", "✔️", "☑️", "✖️", "➕", "➖", "➗", "➰", "➿", "〽️",
        ],
    },
    flags: {
        icon: "🏁",
        name: "Flags",
        emojis: [
            "🏁", "🚩", "🎌", "🏴", "🏳️", "🏳️‍🌈", "🏳️‍⚧️", "🏴‍☠️", "🇺🇸", "🇬🇧",
            "🇨🇦", "🇦🇺", "🇩🇪", "🇫🇷", "🇪🇸", "🇮🇹", "🇯🇵", "🇰🇷", "🇨🇳", "🇮🇳",
            "🇧🇷", "🇲🇽", "🇷🇺", "🇿🇦", "🇳🇬", "🇪🇬", "🇦🇪", "🇸🇬", "🇭🇰", "🇹🇼",
        ],
    },
};

type EmojiPickerProps = {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (emoji: string) => void;
    position?: "top" | "bottom";
};

const RECENT_EMOJIS_KEY = "spritz_recent_emojis";

export function EmojiPicker({
    isOpen,
    onClose,
    onSelect,
    position = "top",
}: EmojiPickerProps) {
    const [activeCategory, setActiveCategory] = useState("smileys");
    const [searchQuery, setSearchQuery] = useState("");
    const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dynamicPosition, setDynamicPosition] = useState<{
        top?: string;
        bottom?: string;
        left?: string;
        right?: string;
        transform?: string;
    }>({});

    // Load recent emojis from localStorage
    useEffect(() => {
        const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
        if (stored) {
            try {
                setRecentEmojis(JSON.parse(stored));
            } catch {
                // Invalid data
            }
        }
    }, []);

    // Handle emoji selection
    const handleSelect = (emoji: string) => {
        // Add to recent
        const newRecent = [emoji, ...recentEmojis.filter((e) => e !== emoji)].slice(
            0,
            20
        );
        setRecentEmojis(newRecent);
        localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(newRecent));

        onSelect(emoji);
        onClose();
    };

    // Calculate position to stay within viewport
    useEffect(() => {
        if (!isOpen || !containerRef.current) return;

        const updatePosition = () => {
            const picker = containerRef.current;
            if (!picker) return;

            const parent = picker.parentElement;
            if (!parent) return;

            const parentRect = parent.getBoundingClientRect();
            const pickerRect = picker.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const padding = 8;

            let newPosition: typeof dynamicPosition = {};

            // Check if we should show above or below
            const spaceAbove = parentRect.top;
            const spaceBelow = viewportHeight - parentRect.bottom;
            const showAbove = position === "top" || (spaceAbove >= pickerRect.height + padding || spaceBelow < spaceAbove);

            // Check horizontal position - default to right-0
            const pickerWidth = 320; // w-80 = 320px
            const rightEdge = parentRect.right;
            const leftEdge = parentRect.left;

            // If going off right edge, align to left
            if (rightEdge + pickerWidth > viewportWidth - padding) {
                newPosition.right = "0";
                newPosition.left = "auto";
            } else {
                newPosition.right = "0";
                newPosition.left = "auto";
            }

            // If going off left edge, align to right
            if (leftEdge - pickerWidth < padding) {
                newPosition.left = "0";
                newPosition.right = "auto";
            }

            if (showAbove) {
                newPosition.bottom = "calc(100% + 8px)";
            } else {
                newPosition.top = "calc(100% + 8px)";
            }

            setDynamicPosition(newPosition);
        };

        const timeout = setTimeout(updatePosition, 10);
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);

        return () => {
            clearTimeout(timeout);
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    }, [isOpen, position]);

    // Close on click outside
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                onClose();
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen, onClose]);

    // Get emojis to display
    const getEmojis = () => {
        if (searchQuery) {
            // Search across all categories
            const all: string[] = [];
            Object.values(EMOJI_CATEGORIES).forEach((cat) => {
                all.push(...cat.emojis);
            });
            return all; // In a real app, you'd filter by emoji name/keywords
        }

        if (activeCategory === "recent") {
            return recentEmojis;
        }

        return (
            EMOJI_CATEGORIES[activeCategory as keyof typeof EMOJI_CATEGORIES]
                ?.emojis || []
        );
    };

    const categories = Object.entries(EMOJI_CATEGORIES).map(([key, value]) => ({
        id: key,
        icon: value.icon,
        name: value.name,
    }));

    // Update recent category with actual recent emojis
    if (recentEmojis.length > 0) {
        EMOJI_CATEGORIES.recent.emojis = recentEmojis;
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    ref={containerRef}
                    initial={{ opacity: 0, scale: 0.95, y: position === "top" ? 10 : -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: position === "top" ? 10 : -10 }}
                    className="absolute w-80 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden"
                    style={dynamicPosition}
                >
                    {/* Search */}
                    <div className="p-2 border-b border-zinc-800">
                        <input
                            type="text"
                            placeholder="Search emojis..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF5500]/50"
                        />
                    </div>

                    {/* Category tabs */}
                    <div className="flex gap-1 p-2 border-b border-zinc-800 overflow-x-auto">
                        {categories.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => {
                                    setActiveCategory(cat.id);
                                    setSearchQuery("");
                                }}
                                className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-colors ${
                                    activeCategory === cat.id
                                        ? "bg-[#FF5500]/20 text-[#FF5500]"
                                        : "hover:bg-zinc-800 text-zinc-400"
                                }`}
                                title={cat.name}
                            >
                                {cat.icon}
                            </button>
                        ))}
                    </div>

                    {/* Emoji grid */}
                    <div className="h-64 overflow-y-auto p-2">
                        <div className="grid grid-cols-8 gap-1">
                            {getEmojis().map((emoji, idx) => (
                                <button
                                    key={`${emoji}-${idx}`}
                                    onClick={() => handleSelect(emoji)}
                                    className="w-8 h-8 flex items-center justify-center text-xl hover:bg-zinc-800 rounded-lg transition-colors"
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>

                        {getEmojis().length === 0 && (
                            <div className="text-center text-zinc-500 py-8">
                                {activeCategory === "recent"
                                    ? "No recent emojis yet"
                                    : "No emojis found"}
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// Quick reaction picker (for message reactions)
type QuickReactionPickerProps = {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (emoji: string) => void;
    emojis?: string[];
    showMoreButton?: boolean;
    onMoreClick?: () => void;
    /** Use bottom sheet style on mobile instead of floating */
    useBottomSheet?: boolean;
};

export function QuickReactionPicker({
    isOpen,
    onClose,
    onSelect,
    emojis = ["👍", "❤️", "🔥", "😂", "🤙", "🤯", "🙏", "💯"],
    showMoreButton = false,
    onMoreClick,
    useBottomSheet = true,
}: QuickReactionPickerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{
        top?: string;
        bottom?: string;
        left?: string;
        right?: string;
        transform?: string;
    }>({});
    const [isMobile, setIsMobile] = useState(false);
    const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);

    // Detect mobile
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640 || 'ontouchstart' in window);
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    // Calculate position to stay within viewport
    useEffect(() => {
        if (!isOpen || !containerRef.current || (isMobile && useBottomSheet)) return;

        const updatePosition = () => {
            const picker = containerRef.current;
            if (!picker) return;

            const parent = picker.parentElement;
            if (!parent) return;

            const parentRect = parent.getBoundingClientRect();
            const pickerRect = picker.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const padding = 16;

            let newPosition: typeof position = {};

            // Check if we should show above or below
            const spaceAbove = parentRect.top;
            const spaceBelow = viewportHeight - parentRect.bottom;
            const showAbove = spaceAbove >= pickerRect.height + padding || spaceBelow < spaceAbove;

            // Desktop positioning
            const pickerWidth = pickerRect.width;
            const centerX = parentRect.left + parentRect.width / 2;
            const leftEdge = centerX - pickerWidth / 2;
            const rightEdge = centerX + pickerWidth / 2;

            let left = "50%";
            let transform = "translateX(-50%)";

            if (leftEdge < padding) {
                left = `${padding - parentRect.left}px`;
                transform = "translateX(0)";
            } else if (rightEdge > viewportWidth - padding) {
                left = "auto";
                const right = `${viewportWidth - parentRect.right - padding}px`;
                newPosition.right = right;
                transform = "translateX(0)";
            }

            newPosition.left = left;
            newPosition.transform = transform;

            if (showAbove) {
                newPosition.bottom = "calc(100% + 8px)";
            } else {
                newPosition.top = "calc(100% + 8px)";
            }

            setPosition(newPosition);
        };

        const timeout = setTimeout(updatePosition, 10);
        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);

        return () => {
            clearTimeout(timeout);
            window.removeEventListener("resize", updatePosition);
            window.removeEventListener("scroll", updatePosition, true);
        };
    }, [isOpen, isMobile, useBottomSheet]);

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target as Node)
            ) {
                onClose();
            }
        };

        // Small delay to prevent immediate close on touch
        const timeout = setTimeout(() => {
            document.addEventListener("mousedown", handleClickOutside);
            document.addEventListener("touchstart", handleClickOutside);
        }, 50);

        return () => {
            clearTimeout(timeout);
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("touchstart", handleClickOutside);
        };
    }, [isOpen, onClose]);

    const handleSelect = (emoji: string) => {
        setSelectedEmoji(emoji);
        // Haptic feedback
        if (navigator.vibrate) {
            navigator.vibrate(15);
        }
        // Small delay for visual feedback before closing
        setTimeout(() => {
            onSelect(emoji);
            onClose();
            setSelectedEmoji(null);
        }, 100);
    };

    // Mobile bottom sheet style
    if (isMobile && useBottomSheet) {
        return (
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="fixed inset-0 bg-black/60 z-[100]"
                            onClick={onClose}
                        />
                        
                        {/* Bottom Sheet */}
                        <motion.div
                            ref={containerRef}
                            initial={{ opacity: 0, y: 100 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 100 }}
                            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                            className="fixed bottom-0 left-0 right-0 z-[101] px-3"
                            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
                        >
                            <div className="bg-zinc-900 border border-zinc-700 rounded-t-3xl shadow-2xl overflow-hidden">
                                {/* Drag handle */}
                                <div className="flex justify-center pt-3 pb-2">
                                    <div className="w-10 h-1 bg-zinc-600 rounded-full" />
                                </div>
                                
                                {/* Emoji Grid */}
                                <div className="px-4 pb-5">
                                    <div className="flex justify-center gap-2 flex-wrap">
                                        {emojis.map((emoji) => (
                                            <button
                                                key={emoji}
                                                onClick={() => handleSelect(emoji)}
                                                className={`w-14 h-14 flex items-center justify-center text-3xl rounded-2xl transition-all duration-100 ${
                                                    selectedEmoji === emoji 
                                                        ? "bg-[#FF5500]/30 scale-110" 
                                                        : "bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 active:scale-105"
                                                }`}
                                            >
                                                <span className={selectedEmoji === emoji ? "animate-bounce" : ""}>
                                                    {emoji}
                                                </span>
                                            </button>
                                        ))}
                                        {showMoreButton && onMoreClick && (
                                            <button
                                                onClick={() => {
                                                    onMoreClick();
                                                    onClose();
                                                }}
                                                className="w-14 h-14 flex items-center justify-center rounded-2xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 transition-colors"
                                            >
                                                <svg 
                                                    className="w-6 h-6 text-zinc-400" 
                                                    fill="none" 
                                                    viewBox="0 0 24 24" 
                                                    stroke="currentColor"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        );
    }

    // Desktop floating style
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    ref={containerRef}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.12, ease: "easeOut" }}
                    className="absolute bg-zinc-900/95 backdrop-blur-sm border border-zinc-700/80 shadow-2xl z-50 rounded-full px-1.5 py-1"
                    style={{ ...position, willChange: "transform, opacity" }}
                >
                    <div className="flex gap-0.5">
                        {emojis.map((emoji) => (
                            <button
                                key={emoji}
                                onClick={() => handleSelect(emoji)}
                                className={`w-9 h-9 flex items-center justify-center text-xl rounded-full transition-all duration-100 ${
                                    selectedEmoji === emoji 
                                        ? "bg-[#FF5500]/30 scale-110" 
                                        : "hover:bg-zinc-800 hover:scale-110 active:bg-zinc-700 active:scale-115"
                                }`}
                            >
                                <span className={selectedEmoji === emoji ? "animate-bounce" : ""}>
                                    {emoji}
                                </span>
                            </button>
                        ))}
                        {showMoreButton && onMoreClick && (
                            <button
                                onClick={() => {
                                    onMoreClick();
                                    onClose();
                                }}
                                className="w-9 h-9 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 transition-colors"
                            >
                                <svg 
                                    className="w-4 h-4 text-zinc-400" 
                                    fill="none" 
                                    viewBox="0 0 24 24" 
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                            </button>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// Mobile-friendly reaction display component
type ReactionDisplayProps = {
    reactions: Array<{
        emoji: string;
        count: number;
        hasReacted: boolean;
    }>;
    onReaction: (emoji: string) => void;
    isOwnMessage?: boolean;
    className?: string;
};

export function ReactionDisplay({
    reactions,
    onReaction,
    isOwnMessage = false,
    className = "",
}: ReactionDisplayProps) {
    if (!reactions?.some(r => r.count > 0)) return null;

    return (
        <div 
            className={`flex flex-wrap gap-1.5 mt-2 ${className}`} 
            onClick={(e) => e.stopPropagation()}
        >
            {reactions
                .filter(r => r.count > 0)
                .map(reaction => (
                    <button
                        key={reaction.emoji}
                        onClick={(e) => {
                            e.stopPropagation();
                            onReaction(reaction.emoji);
                        }}
                        className={`
                            flex items-center gap-1 rounded-full transition-all duration-100
                            min-w-[44px] min-h-[32px] px-2.5 py-1
                            sm:min-w-[36px] sm:min-h-[28px] sm:px-2 sm:py-0.5
                            active:scale-95
                            ${reaction.hasReacted
                                ? isOwnMessage 
                                    ? "bg-white/25 text-white" 
                                    : "bg-[#FF5500]/25 text-[#FF5500]"
                                : isOwnMessage 
                                    ? "bg-white/10 hover:bg-white/20 text-white/80" 
                                    : "bg-zinc-700/60 hover:bg-zinc-600/60 text-zinc-300"
                            }
                        `}
                    >
                        <span className="text-base sm:text-sm">{reaction.emoji}</span>
                        <span className="text-xs font-medium">{reaction.count}</span>
                    </button>
                ))}
        </div>
    );
}

// Mobile-friendly add reaction button
type AddReactionButtonProps = {
    onClick: () => void;
    isOwnMessage?: boolean;
    size?: "sm" | "md";
    className?: string;
};

export function AddReactionButton({
    onClick,
    isOwnMessage = false,
    size = "sm",
    className = "",
}: AddReactionButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`
                flex items-center justify-center rounded-full transition-all duration-100
                active:scale-95
                ${size === "md" 
                    ? "min-w-[44px] min-h-[44px] text-xl" 
                    : "min-w-[36px] min-h-[36px] sm:min-w-[32px] sm:min-h-[32px] text-lg sm:text-base"
                }
                ${isOwnMessage
                    ? "text-white/70 hover:bg-white/10 active:bg-white/20"
                    : "text-zinc-400 hover:bg-zinc-700/50 active:bg-zinc-600/50"
                }
                ${className}
            `}
            title="Add reaction"
        >
            <span className="relative">
                😊
                <span className="absolute -bottom-0.5 -right-0.5 text-[10px]">+</span>
            </span>
        </button>
    );
}

