"use client";

import { motion } from "framer-motion";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatDateInTimezone } from "@/lib/timezone";

type UnreadDividerProps = {
    count: number;
    className?: string;
};

export function UnreadDivider({ count, className = "" }: UnreadDividerProps) {
    if (count <= 0) return null;

    return (
        <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            className={`flex items-center gap-3 py-3 ${className}`}
        >
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[#FF5500]/50 to-[#FF5500]" />

            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="flex items-center gap-1.5 px-3 py-1 bg-[#FF5500]/10 border border-[#FF5500]/30 rounded-full"
            >
                <span className="text-xs font-medium text-[#FF5500]">
                    {count === 1 ? "1 new message" : `${count} new messages`}
                </span>
                <motion.span
                    animate={{ y: [0, -2, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="text-[#FF5500]"
                >
                    ↓
                </motion.span>
            </motion.div>

            <div className="flex-1 h-px bg-gradient-to-l from-transparent via-[#FF5500]/50 to-[#FF5500]" />
        </motion.div>
    );
}

// Simpler date divider for separating messages by day
export function DateDivider({
    date,
    className = "",
}: {
    date: Date;
    className?: string;
}) {
    const userTimezone = useUserTimezone();
    const formatDate = (d: Date) => {
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        const days = Math.floor(diff / 86400000);

        if (days === 0) return "Today";
        if (days === 1) return "Yesterday";
        if (days < 7) {
            return formatDateInTimezone(d, userTimezone, "weekday");
        }
        const str = formatDateInTimezone(d, userTimezone, "monthDay");
        const year = new Date(d).getFullYear();
        const currentYear = new Date().getFullYear();
        return year !== currentYear ? `${str}, ${year}` : str;
    };

    return (
        <div className={`flex items-center gap-3 py-3 ${className}`}>
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-xs text-zinc-500 font-medium px-2">
                {formatDate(date)}
            </span>
            <div className="flex-1 h-px bg-zinc-800" />
        </div>
    );
}
