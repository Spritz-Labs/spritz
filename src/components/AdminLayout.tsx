"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

interface AdminLayoutProps {
    children: ReactNode;
    title: string;
    subtitle?: string;
    address?: string;
    isSuperAdmin?: boolean;
    onSignOut?: () => void;
}

const NAV_ITEMS = [
    { href: "/admin", label: "Invites", icon: "🎟️", mobileLabel: "Invites" },
    { href: "/admin/users", label: "Users", icon: "👥", mobileLabel: "Users" },
    {
        href: "/admin/chats",
        label: "Chats",
        icon: "💬",
        mobileLabel: "Chats",
    },
    {
        href: "/admin/events",
        label: "Events",
        icon: "📅",
        mobileLabel: "Events",
    },
    {
        href: "/admin/analytics",
        label: "Analytics",
        icon: "📊",
        mobileLabel: "Stats",
    },
    {
        href: "/admin/agent-chats",
        label: "Agent Chats",
        icon: "🤖",
        mobileLabel: "AI Chats",
    },
    {
        href: "/admin/agents",
        label: "Agent Knowledge",
        icon: "📚",
        mobileLabel: "RAG",
    },
    {
        href: "/admin/broadcast",
        label: "Broadcast",
        icon: "📢",
        mobileLabel: "Blast",
    },
    {
        href: "/admin/bug-reports",
        label: "Bug Reports",
        icon: "🐛",
        mobileLabel: "Bugs",
    },
    {
        href: "/admin/ens",
        label: "ENS Subnames",
        icon: "🔗",
        mobileLabel: "ENS",
    },
    {
        href: "/admin/performance",
        label: "Performance",
        icon: "📈",
        mobileLabel: "Perf",
    },
];

export function AdminLayout({
    children,
    title,
    subtitle,
    address,
    isSuperAdmin,
    onSignOut,
}: AdminLayoutProps) {
    const pathname = usePathname();

    const formatAddress = (addr: string) =>
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    return (
        <div className="h-[100dvh] bg-zinc-950 text-white flex flex-col overflow-hidden">
            {/* Top Header — row 1: title/actions; row 2 (md+): full-width scrollable nav (no overlap/cutoff) */}
            <header className="border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-lg shrink-0 pt-[env(safe-area-inset-top)]">
                <div className="w-full px-3 sm:px-4 lg:px-6 xl:px-8 py-2 sm:py-3">
                    <div className="flex items-center justify-between gap-3 min-w-0">
                        {/* Left: Back + Title */}
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                            <Link
                                href="/"
                                className="flex items-center gap-1 text-[#FF5500] hover:text-[#FF7733] transition-colors shrink-0"
                            >
                                <svg
                                    className="w-4 h-4 sm:w-5 sm:h-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M10 19l-7-7m0 0l7-7m-7 7h18"
                                    />
                                </svg>
                                <span className="hidden sm:inline text-sm font-medium">
                                    Home
                                </span>
                            </Link>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 min-w-0">
                                    <h1 className="text-base sm:text-lg font-bold truncate">
                                        {title}
                                    </h1>
                                    {isSuperAdmin && (
                                        <span className="shrink-0 px-1.5 py-0.5 bg-[#FF5500]/20 text-[#FF5500] text-[10px] sm:text-xs rounded-full whitespace-nowrap">
                                            Super
                                        </span>
                                    )}
                                </div>
                                {subtitle && (
                                    <p className="text-[10px] sm:text-xs text-zinc-500 truncate">
                                        {subtitle}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Right: Address + Sign Out */}
                        <div className="flex items-center gap-2 shrink-0">
                            {address && (
                                <span className="text-zinc-500 text-xs font-mono hidden sm:block max-w-[7rem] truncate">
                                    {formatAddress(address)}
                                </span>
                            )}
                            {onSignOut && (
                                <button
                                    type="button"
                                    onClick={onSignOut}
                                    className="px-2 py-1 sm:px-2.5 sm:py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors whitespace-nowrap"
                                >
                                    Sign Out
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Desktop / tablet: horizontal scroll — avoids overlapping title and clipping labels */}
                    <nav
                        className="hidden md:flex mt-2 -mx-1 px-1 pb-1 items-center gap-1 overflow-x-auto overscroll-x-contain scrollbar-thin touch-pan-x"
                        aria-label="Admin sections"
                    >
                        {NAV_ITEMS.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`relative shrink-0 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                                        isActive
                                            ? "text-white bg-zinc-800"
                                            : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                                    }`}
                                >
                                    <span className="flex items-center gap-1.5">
                                        <span aria-hidden className="text-sm">
                                            {item.icon}
                                        </span>
                                        <span>{item.label}</span>
                                    </span>
                                    {isActive && (
                                        <motion.div
                                            layoutId="admin-nav-indicator"
                                            className="absolute inset-0 bg-zinc-800 rounded-lg -z-10"
                                            transition={{
                                                type: "spring",
                                                bounce: 0.2,
                                                duration: 0.4,
                                            }}
                                        />
                                    )}
                                </Link>
                            );
                        })}
                    </nav>
                </div>
            </header>

            {/* Main Content - fills remaining space and scrolls when content overflows */}
            <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                <div className="w-full">{children}</div>
            </main>

            {/* Mobile Bottom Navigation — scroll when many items (no squeezed/cut-off labels) */}
            <nav
                className="md:hidden shrink-0 bg-zinc-900/95 backdrop-blur-lg border-t border-zinc-800 pb-[env(safe-area-inset-bottom)]"
                aria-label="Admin sections"
            >
                <div className="flex items-stretch gap-1 overflow-x-auto overscroll-x-contain px-2 py-1.5 scrollbar-thin touch-pan-x">
                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex flex-col items-center justify-center shrink-0 min-w-[4.25rem] max-w-[5.5rem] py-1.5 px-1.5 rounded-xl transition-all ${
                                    isActive
                                        ? "text-[#FF5500] bg-[#FF5500]/10"
                                        : "text-zinc-400 active:bg-zinc-800"
                                }`}
                            >
                                <span className="text-lg mb-0.5" aria-hidden>
                                    {item.icon}
                                </span>
                                <span className="text-[9px] font-medium text-center leading-tight line-clamp-2">
                                    {item.mobileLabel}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}

// Wrapper for non-authenticated/non-admin states
export function AdminAuthWrapper({
    children,
    title = "Admin Access",
}: {
    children: ReactNode;
    title?: string;
}) {
    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 pt-[env(safe-area-inset-top)]">
            <div className="bg-zinc-900 rounded-2xl p-6 sm:p-8 max-w-md w-full text-center border border-zinc-800">
                <h1 className="text-xl sm:text-2xl font-bold text-white mb-4">
                    {title}
                </h1>
                {children}
                <Link
                    href="/"
                    className="block mt-4 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                >
                    ← Back to Home
                </Link>
            </div>
        </div>
    );
}

// Loading state
export function AdminLoading() {
    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center pt-[env(safe-area-inset-top)]">
            <div className="text-center max-w-sm px-4">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#FF5500] mx-auto mb-4" />
                <p className="text-zinc-500 text-sm">Checking credentials...</p>
                <p className="text-zinc-600 text-xs mt-2">
                    Connect your wallet and sign in as admin if prompted.
                </p>
            </div>
        </div>
    );
}
