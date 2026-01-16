"use client";

import { TechStackWidgetConfig } from "../ProfileWidgetTypes";

interface TechStackWidgetProps {
    config: TechStackWidgetConfig;
    size: string;
}

// Common tech icons (emoji fallbacks)
const TECH_ICONS: Record<string, string> = {
    react: '⚛️',
    nextjs: '▲',
    typescript: '🔷',
    javascript: '🟨',
    python: '🐍',
    rust: '🦀',
    go: '🔵',
    solidity: '💎',
    node: '💚',
    tailwind: '🎨',
    postgresql: '🐘',
    mongodb: '🍃',
    redis: '🔴',
    docker: '🐳',
    kubernetes: '☸️',
    aws: '☁️',
    firebase: '🔥',
    graphql: '◼️',
    figma: '🎨',
    git: '📦',
};

export function TechStackWidget({ config, size }: TechStackWidgetProps) {
    const { technologies, label } = config;
    
    const isSmall = size === '2x1';
    const maxShow = isSmall ? 6 : 12;
    const displayTechs = technologies.slice(0, maxShow);
    const remaining = technologies.length - maxShow;
    
    return (
        <div className="w-full h-full flex flex-col p-4 sm:p-6 rounded-2xl bg-zinc-900 border border-zinc-800">
            {label && (
                <p className="text-zinc-400 text-xs uppercase tracking-wider mb-3">
                    {label}
                </p>
            )}
            
            <div className="flex-1 flex flex-wrap gap-2 content-start">
                {displayTechs.map((tech, index) => (
                    <div
                        key={index}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 hover:border-zinc-600 transition-colors"
                        style={tech.color ? { borderColor: `${tech.color}40` } : undefined}
                    >
                        {tech.icon ? (
                            tech.icon.startsWith('http') ? (
                                <img src={tech.icon} alt="" className="w-4 h-4" />
                            ) : (
                                <span className="text-sm">{tech.icon}</span>
                            )
                        ) : (
                            <span className="text-sm">
                                {TECH_ICONS[tech.name.toLowerCase()] || '💻'}
                            </span>
                        )}
                        <span className="text-white text-sm">{tech.name}</span>
                    </div>
                ))}
                
                {remaining > 0 && (
                    <div className="flex items-center px-3 py-1.5 rounded-lg bg-zinc-800/30 text-zinc-500 text-sm">
                        +{remaining} more
                    </div>
                )}
            </div>
        </div>
    );
}
