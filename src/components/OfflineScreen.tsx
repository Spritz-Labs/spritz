"use client";

import { SpritzLogo } from "@/components/SpritzLogo";

interface OfflineScreenProps {
    /** Called when user taps "Try again" to recheck connection */
    onRetry?: () => void;
}

/**
 * Shown when the app is loaded without internet. Avoids a black screen or
 * confusing redirect to login. Does not grant access; when back online
 * the normal auth flow runs.
 */
export function OfflineScreen({ onRetry }: OfflineScreenProps) {
    return (
        <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
            <div className="flex flex-col items-center justify-center text-center max-w-md">
                <div className="mb-6">
                    <SpritzLogo
                        size="2xl"
                        className="shadow-lg shadow-[#FF5500]/20 opacity-90"
                    />
                </div>
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800/80 text-zinc-500">
                    <svg
                        className="h-7 w-7"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414"
                        />
                    </svg>
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">
                    You&apos;re offline
                </h1>
                <p className="text-zinc-400 text-sm mb-2">
                    Check your internet connection and try again.
                </p>
                <p className="text-zinc-500 text-xs mb-6">
                    We&apos;ll sign you in when you&apos;re back online. Your
                    session is not stored offline for security.
                </p>
                {onRetry && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="px-5 py-2.5 rounded-xl bg-[#FF5500] hover:bg-[#FF5500]/90 text-white font-medium text-sm transition-colors"
                    >
                        Try again
                    </button>
                )}
            </div>
        </main>
    );
}
