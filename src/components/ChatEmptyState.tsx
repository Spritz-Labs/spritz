"use client";

import type { ReactNode } from "react";

export type ChatEmptyStateProps = {
    /** Icon: emoji string (e.g. "💬") or ReactNode (e.g. <svg>) */
    icon: ReactNode;
    title: string;
    subtitle: string;
    /** Optional CTA button or link */
    cta?: ReactNode;
    /** Optional extra class for the container */
    className?: string;
};

/**
 * Unified empty state for chat modals (no messages yet).
 * Use in Channel, Group, DM, Global chat.
 */
export function ChatEmptyState({
    icon,
    title,
    subtitle,
    cta,
    className = "",
}: ChatEmptyStateProps) {
    return (
        <div
            className={`flex flex-col items-center justify-center h-full text-center ${className}`}
        >
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                {typeof icon === "string" ? (
                    <span className="text-3xl">{icon}</span>
                ) : (
                    icon
                )}
            </div>
            <p className="text-zinc-400 mb-1">{title}</p>
            <p className="text-zinc-500 text-sm">{subtitle}</p>
            {cta && <div className="mt-4">{cta}</div>}
        </div>
    );
}
