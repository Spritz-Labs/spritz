"use client";

import { motion } from "framer-motion";

type ChatSkeletonProps = {
    messageCount?: number;
    className?: string;
};

// Individual message skeleton
function MessageSkeleton({ isOwn, index }: { isOwn: boolean; index: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`flex ${isOwn ? "justify-end" : "justify-start"} px-4`}
        >
            <div className={`flex items-end gap-2 max-w-[75%] ${isOwn ? "flex-row-reverse" : ""}`}>
                {/* Avatar skeleton (only for received messages) */}
                {!isOwn && (
                    <div className="w-8 h-8 rounded-full bg-zinc-800 animate-pulse shrink-0" />
                )}
                
                {/* Message bubble skeleton */}
                <div
                    className={`rounded-2xl px-4 py-3 animate-pulse ${
                        isOwn ? "bg-[#FF5500]/20 rounded-br-md" : "bg-zinc-800 rounded-bl-md"
                    }`}
                >
                    {/* Random width lines to simulate text */}
                    <div className="space-y-2">
                        <div 
                            className={`h-3 rounded ${isOwn ? "bg-[#FF5500]/30" : "bg-zinc-700"}`} 
                            style={{ width: `${Math.random() * 100 + 80}px` }}
                        />
                        {Math.random() > 0.5 && (
                            <div 
                                className={`h-3 rounded ${isOwn ? "bg-[#FF5500]/30" : "bg-zinc-700"}`} 
                                style={{ width: `${Math.random() * 60 + 40}px` }}
                            />
                        )}
                    </div>
                    
                    {/* Time skeleton */}
                    <div 
                        className={`h-2 rounded mt-2 ${isOwn ? "bg-[#FF5500]/20" : "bg-zinc-700/50"}`} 
                        style={{ width: "40px" }}
                    />
                </div>
            </div>
        </motion.div>
    );
}

// Image message skeleton
function ImageMessageSkeleton({ isOwn, index }: { isOwn: boolean; index: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`flex ${isOwn ? "justify-end" : "justify-start"} px-4`}
        >
            <div className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
                {!isOwn && (
                    <div className="w-8 h-8 rounded-full bg-zinc-800 animate-pulse shrink-0" />
                )}
                
                <div
                    className={`rounded-2xl overflow-hidden animate-pulse ${
                        isOwn ? "bg-[#FF5500]/20" : "bg-zinc-800"
                    }`}
                >
                    <div className="w-48 h-36 bg-zinc-700/50" />
                </div>
            </div>
        </motion.div>
    );
}

export function ChatSkeleton({ messageCount = 8, className = "" }: ChatSkeletonProps) {
    // Generate a mix of message types
    const messages = Array.from({ length: messageCount }, (_, i) => ({
        isOwn: Math.random() > 0.5,
        isImage: Math.random() > 0.85,
        index: i,
    }));

    return (
        <div className={`flex flex-col gap-3 py-4 ${className}`}>
            {messages.map((msg, i) => (
                msg.isImage ? (
                    <ImageMessageSkeleton key={i} isOwn={msg.isOwn} index={i} />
                ) : (
                    <MessageSkeleton key={i} isOwn={msg.isOwn} index={i} />
                )
            ))}
        </div>
    );
}

// Compact skeleton for chat list items - matches actual ChatRow layout
export function ChatListItemSkeleton({ count = 5 }: { count?: number }) {
    // Varied widths for realistic shimmer
    const nameWidths = [96, 120, 80, 140, 104, 88, 132, 72];
    const msgWidths = [160, 120, 200, 100, 180, 140, 150, 110];

    return (
        <div className="space-y-1.5">
            {Array.from({ length: count }).map((_, i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-2.5 sm:gap-3 px-3 py-2.5 sm:p-3 rounded-xl"
                >
                    {/* Avatar - matches w-11 h-11 sm:w-12 sm:h-12 */}
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-zinc-800/70 animate-pulse shrink-0" />
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <div
                                className="h-3.5 rounded-md bg-zinc-800/80 animate-pulse"
                                style={{ width: `${nameWidths[i % nameWidths.length]}px` }}
                            />
                            <div className="h-2.5 w-8 rounded bg-zinc-800/40 animate-pulse shrink-0" />
                        </div>
                        <div
                            className="h-3 rounded-md bg-zinc-800/50 animate-pulse"
                            style={{ width: `${msgWidths[i % msgWidths.length]}px`, maxWidth: "80%" }}
                        />
                    </div>
                </motion.div>
            ))}
        </div>
    );
}

// Header skeleton for chat modal
export function ChatHeaderSkeleton() {
    return (
        <div className="flex items-center gap-3 p-4 border-b border-zinc-800">
            <div className="w-10 h-10 rounded-full bg-zinc-800 animate-pulse" />
            <div className="flex-1 space-y-2">
                <div className="h-4 w-28 rounded bg-zinc-800 animate-pulse" />
                <div className="h-3 w-16 rounded bg-zinc-800/60 animate-pulse" />
            </div>
        </div>
    );
}

// Typing indicator skeleton
export function TypingSkeleton() {
    return (
        <div className="flex items-center gap-2 px-4 py-2">
            <div className="w-6 h-6 rounded-full bg-zinc-800 animate-pulse" />
            <div className="flex items-center gap-1 px-3 py-2 bg-zinc-800 rounded-full">
                <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.4, repeat: Infinity, delay: 0 }}
                    className="w-2 h-2 rounded-full bg-zinc-500"
                />
                <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.4, repeat: Infinity, delay: 0.2 }}
                    className="w-2 h-2 rounded-full bg-zinc-500"
                />
                <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.4, repeat: Infinity, delay: 0.4 }}
                    className="w-2 h-2 rounded-full bg-zinc-500"
                />
            </div>
        </div>
    );
}
