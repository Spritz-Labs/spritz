"use client";

import { WidgetSize, SocialLinkWidgetConfig } from "../ProfileWidgetTypes";

interface SocialLinkWidgetProps {
    config: SocialLinkWidgetConfig;
    size: WidgetSize;
}

const SOCIAL_STYLES: Record<string, { icon: string; color: string; bg: string; hoverBg: string }> = {
    twitter: { icon: "𝕏", color: "text-white", bg: "bg-black", hoverBg: "hover:bg-zinc-800" },
    x: { icon: "𝕏", color: "text-white", bg: "bg-black", hoverBg: "hover:bg-zinc-800" },
    github: { icon: "⌘", color: "text-white", bg: "bg-zinc-800", hoverBg: "hover:bg-zinc-700" },
    linkedin: { icon: "in", color: "text-white", bg: "bg-blue-600", hoverBg: "hover:bg-blue-700" },
    instagram: { icon: "📷", color: "text-white", bg: "bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400", hoverBg: "" },
    youtube: { icon: "▶️", color: "text-white", bg: "bg-red-600", hoverBg: "hover:bg-red-700" },
    tiktok: { icon: "♪", color: "text-white", bg: "bg-black", hoverBg: "hover:bg-zinc-800" },
    discord: { icon: "💬", color: "text-white", bg: "bg-indigo-600", hoverBg: "hover:bg-indigo-700" },
    telegram: { icon: "✈️", color: "text-white", bg: "bg-sky-500", hoverBg: "hover:bg-sky-600" },
    farcaster: { icon: "🟣", color: "text-white", bg: "bg-purple-600", hoverBg: "hover:bg-purple-700" },
    website: { icon: "🌐", color: "text-white", bg: "bg-emerald-600", hoverBg: "hover:bg-emerald-700" },
};

export function SocialLinkWidget({ config, size }: SocialLinkWidgetProps) {
    const { platform, handle, url } = config;
    
    const isCompact = size === '1x1';
    const style = SOCIAL_STYLES[platform] || SOCIAL_STYLES.website;
    
    const platformName = platform === 'x' ? 'Twitter' : platform.charAt(0).toUpperCase() + platform.slice(1);
    
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex flex-col items-center justify-center w-full h-full p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:scale-[1.05] hover:shadow-lg transition-all group`}
        >
            <div className={`${isCompact ? 'w-10 h-10' : 'w-14 h-14'} rounded-xl ${style.bg} ${style.hoverBg} flex items-center justify-center mb-2 group-hover:scale-110 transition-transform`}>
                <span className={`${isCompact ? 'text-lg' : 'text-2xl'} ${style.color} font-bold`}>
                    {style.icon}
                </span>
            </div>
            <p className={`text-white font-medium capitalize ${isCompact ? 'text-xs' : 'text-sm'}`}>
                {platformName}
            </p>
            {handle && !isCompact && (
                <p className="text-zinc-500 text-xs truncate max-w-full">
                    {handle.startsWith('@') ? handle : `@${handle}`}
                </p>
            )}
        </a>
    );
}
