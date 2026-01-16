"use client";

import Link from "next/link";
import { WidgetSize, AgentWidgetConfig } from "../ProfileWidgetTypes";

interface AgentWidgetProps {
    config: AgentWidgetConfig;
    size: WidgetSize;
}

export function AgentWidget({ config, size }: AgentWidgetProps) {
    const { agentId, name, avatarEmoji = "🤖", avatarUrl } = config;
    
    const isCompact = size === '1x1';
    
    return (
        <Link
            href={`/agent/${agentId}`}
            className="flex flex-col items-center justify-center w-full h-full p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:bg-zinc-800/80 hover:border-purple-500/50 hover:scale-[1.02] transition-all group"
        >
            {avatarUrl ? (
                <img
                    src={avatarUrl}
                    alt={name}
                    className={`${isCompact ? 'w-10 h-10' : 'w-14 h-14'} rounded-xl object-cover mb-2 group-hover:scale-110 transition-transform`}
                />
            ) : (
                <div className={`${isCompact ? 'w-10 h-10' : 'w-14 h-14'} rounded-xl bg-purple-500/20 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform`}>
                    <span className={`${isCompact ? 'text-xl' : 'text-3xl'}`}>
                        {avatarEmoji}
                    </span>
                </div>
            )}
            <p className={`text-white font-medium text-center line-clamp-1 ${isCompact ? 'text-xs' : 'text-sm'}`}>
                {name || "AI Agent"}
            </p>
            <p className="text-purple-400 text-xs">AI Agent</p>
        </Link>
    );
}
