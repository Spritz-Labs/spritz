"use client";

type AgentAvatarProps = {
    /** Image URL; when set, image is shown instead of emoji */
    avatarUrl?: string | null;
    /** Emoji fallback when no avatarUrl (e.g. "🤖") */
    avatarEmoji?: string;
    /** Agent name, used for img alt */
    name: string;
    /** Size preset */
    size?: "sm" | "md" | "lg";
    /** Visual variant for the fallback container */
    variant?: "default" | "favorite";
    className?: string;
};

const sizeClasses = {
    sm: "w-8 h-8 sm:w-9 sm:h-9 text-base sm:text-lg",
    md: "w-9 h-9 sm:w-10 sm:h-10 text-lg sm:text-xl",
    lg: "w-12 h-12 text-2xl",
};

const variantClasses = {
    default: "bg-gradient-to-br from-purple-500/30 to-pink-500/30 ring-1 ring-purple-500/50",
    favorite: "bg-gradient-to-br from-yellow-500/20 to-orange-500/20",
};

export function AgentAvatar({
    avatarUrl,
    avatarEmoji = "🤖",
    name,
    size = "md",
    variant = "default",
    className = "",
}: AgentAvatarProps) {
    const sizeCls = sizeClasses[size];
    const variantCls = variantClasses[variant];

    if (avatarUrl) {
        return (
            <img
                src={avatarUrl}
                alt={name}
                className={`rounded-xl object-cover shrink-0 ${sizeCls} ${className}`}
            />
        );
    }

    return (
        <div
            className={`rounded-xl flex items-center justify-center shrink-0 ${sizeCls} ${variantCls} ${className}`}
            aria-hidden
        >
            {avatarEmoji}
        </div>
    );
}
