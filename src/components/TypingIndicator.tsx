"use client";

import { motion } from "framer-motion";

type TypingIndicatorProps = {
    users?: string[]; // Array of user names who are typing
    showAvatar?: boolean;
    avatarUrl?: string;
    className?: string;
};

export function TypingIndicator({
    users = [],
    showAvatar = true,
    avatarUrl,
    className = "",
}: TypingIndicatorProps) {
    if (users.length === 0) return null;

    const typingText = users.length === 1
        ? `${users[0]} is typing`
        : users.length === 2
        ? `${users[0]} and ${users[1]} are typing`
        : users.length === 3
        ? `${users[0]}, ${users[1]}, and ${users[2]} are typing`
        : `${users[0]} and ${users.length - 1} others are typing`;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`flex items-center gap-2 px-4 py-2 ${className}`}
        >
            {showAvatar && (
                <div className="flex -space-x-2">
                    {users.slice(0, 3).map((user, index) => (
                        avatarUrl ? (
                            <img
                                key={user}
                                src={avatarUrl}
                                alt=""
                                className="w-6 h-6 rounded-full border-2 border-zinc-900"
                                style={{ zIndex: 3 - index }}
                            />
                        ) : (
                            <div
                                key={user}
                                className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white text-[10px] font-bold border-2 border-zinc-900"
                                style={{ zIndex: 3 - index }}
                            >
                                {user.slice(0, 1).toUpperCase()}
                            </div>
                        )
                    ))}
                </div>
            )}
            
            <div className="flex items-center gap-2">
                {/* Animated dots */}
                <div className="flex items-center gap-0.5 bg-zinc-800 rounded-full px-3 py-2">
                    {[0, 1, 2].map((i) => (
                        <motion.span
                            key={i}
                            className="w-2 h-2 bg-zinc-400 rounded-full"
                            animate={{
                                y: [0, -4, 0],
                                opacity: [0.4, 1, 0.4],
                            }}
                            transition={{
                                duration: 0.8,
                                repeat: Infinity,
                                delay: i * 0.15,
                                ease: "easeInOut",
                            }}
                        />
                    ))}
                </div>
                
                {/* Typing text - hidden on mobile for space */}
                <span className="hidden sm:inline text-xs text-zinc-500">
                    {typingText}
                </span>
            </div>
        </motion.div>
    );
}

// Simpler inline version for tighter spaces
export function TypingDots({ className = "" }: { className?: string }) {
    return (
        <div className={`flex items-center gap-0.5 ${className}`}>
            {[0, 1, 2].map((i) => (
                <motion.span
                    key={i}
                    className="w-1.5 h-1.5 bg-zinc-400 rounded-full"
                    animate={{
                        y: [0, -3, 0],
                        opacity: [0.4, 1, 0.4],
                    }}
                    transition={{
                        duration: 0.8,
                        repeat: Infinity,
                        delay: i * 0.15,
                        ease: "easeInOut",
                    }}
                />
            ))}
        </div>
    );
}
