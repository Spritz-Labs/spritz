"use client";

import { motion } from "framer-motion";

type OnlineStatusProps = {
    status: "online" | "offline" | "away" | "busy";
    size?: "sm" | "md" | "lg";
    showPulse?: boolean;
    className?: string;
};

const statusColors = {
    online: "bg-emerald-500",
    offline: "bg-zinc-500",
    away: "bg-amber-500",
    busy: "bg-red-500",
};

const sizeClasses = {
    sm: "w-2 h-2",
    md: "w-3 h-3",
    lg: "w-4 h-4",
};

export function OnlineStatus({
    status,
    size = "md",
    showPulse = true,
    className = "",
}: OnlineStatusProps) {
    const isOnline = status === "online";

    return (
        <div className={`relative ${sizeClasses[size]} ${className}`}>
            {/* Pulse animation for online status */}
            {isOnline && showPulse && (
                <motion.span
                    className={`absolute inset-0 rounded-full ${statusColors[status]} opacity-50`}
                    animate={{
                        scale: [1, 1.5, 1.5],
                        opacity: [0.5, 0, 0],
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeOut",
                    }}
                />
            )}
            
            {/* Main status dot */}
            <span
                className={`absolute inset-0 rounded-full ${statusColors[status]} border-2 border-zinc-900`}
            />
        </div>
    );
}

// Avatar with online status indicator
type AvatarWithStatusProps = {
    src?: string | null;
    name: string;
    status?: OnlineStatusProps["status"];
    size?: "sm" | "md" | "lg" | "xl";
    className?: string;
};

const avatarSizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
    xl: "w-16 h-16 text-lg",
};

const statusPositionClasses = {
    sm: "-bottom-0.5 -right-0.5",
    md: "-bottom-0.5 -right-0.5",
    lg: "bottom-0 right-0",
    xl: "bottom-0.5 right-0.5",
};

export function AvatarWithStatus({
    src,
    name,
    status,
    size = "md",
    className = "",
}: AvatarWithStatusProps) {
    const initials = name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    return (
        <div className={`relative inline-block ${className}`}>
            {src ? (
                <img
                    src={src}
                    alt={name}
                    className={`${avatarSizeClasses[size]} rounded-full object-cover`}
                />
            ) : (
                <div
                    className={`${avatarSizeClasses[size]} rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white font-bold`}
                >
                    {initials}
                </div>
            )}
            
            {status && (
                <div className={`absolute ${statusPositionClasses[size]}`}>
                    <OnlineStatus
                        status={status}
                        size={size === "xl" || size === "lg" ? "md" : "sm"}
                    />
                </div>
            )}
        </div>
    );
}

// Last seen text formatter
export function formatLastSeen(lastSeen: Date | null): string {
    if (!lastSeen) return "Never";
    
    const now = new Date();
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return lastSeen.toLocaleDateString();
}

// Status text with icon
export function StatusText({
    status,
    lastSeen,
    className = "",
}: {
    status: OnlineStatusProps["status"];
    lastSeen?: Date | null;
    className?: string;
}) {
    const statusText = {
        online: "Online",
        offline: lastSeen ? `Last seen ${formatLastSeen(lastSeen)}` : "Offline",
        away: "Away",
        busy: "Do not disturb",
    };

    return (
        <div className={`flex items-center gap-1.5 ${className}`}>
            <OnlineStatus status={status} size="sm" showPulse={false} />
            <span className="text-xs text-zinc-500">{statusText[status]}</span>
        </div>
    );
}
