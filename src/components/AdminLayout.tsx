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
    { href: "/admin/events", label: "Events", icon: "📅", mobileLabel: "Events" },
    { href: "/admin/analytics", label: "Analytics", icon: "📊", mobileLabel: "Stats" },
    { href: "/admin/bug-reports", label: "Bug Reports", icon: "🐛", mobileLabel: "Bugs" },
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
        <div className="min-h-screen bg-zinc-950 text-white">
            {/* Top Header - sticky with safe area */}
            <header className="border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-lg sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
                <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4">
                    <div className="flex items-center justify-between">
                        {/* Left: Back + Title */}
                        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                            <Link
                                href="/"
                                className="flex items-center gap-1 text-[#FF5500] hover:text-[#FF7733] transition-colors shrink-0"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                                <span className="hidden sm:inline text-sm font-medium">Home</span>
                            </Link>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <h1 className="text-lg sm:text-xl font-bold truncate">{title}</h1>
                                    {isSuperAdmin && (
                                        <span className="px-2 py-0.5 bg-[#FF5500]/20 text-[#FF5500] text-xs rounded-full whitespace-nowrap">
                                            Super
                                        </span>
                                    )}
                                </div>
                                {subtitle && (
                                    <p className="text-xs sm:text-sm text-zinc-500 truncate">{subtitle}</p>
                                )}
                            </div>
                        </div>

                        {/* Right: Address + Sign Out */}
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                            {address && (
                                <span className="text-zinc-500 text-xs sm:text-sm font-mono hidden sm:block">
                                    {formatAddress(address)}
                                </span>
                            )}
                            {onSignOut && (
                                <button
                                    onClick={onSignOut}
                                    className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 text-xs sm:text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                                >
                                    Sign Out
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Desktop Navigation - inline tabs */}
                    <nav className="hidden sm:flex items-center gap-1 mt-4 -mb-px border-t border-zinc-800/50 pt-3">
                        {NAV_ITEMS.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                        isActive
                                            ? "text-white bg-zinc-800"
                                            : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                                    }`}
                                >
                                    <span className="flex items-center gap-2">
                                        <span>{item.icon}</span>
                                        <span>{item.label}</span>
                                    </span>
                                    {isActive && (
                                        <motion.div
                                            layoutId="admin-nav-indicator"
                                            className="absolute inset-0 bg-zinc-800 rounded-lg -z-10"
                                            transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                                        />
                                    )}
                                </Link>
                            );
                        })}
                    </nav>
                </div>
            </header>

            {/* Main Content */}
            <main className="pb-20 sm:pb-6">
                {children}
            </main>

            {/* Mobile Bottom Navigation */}
            <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-900/95 backdrop-blur-lg border-t border-zinc-800 pb-[env(safe-area-inset-bottom)]">
                <div className="flex items-center justify-around px-2 py-2">
                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex flex-col items-center justify-center min-w-[60px] py-1.5 px-2 rounded-xl transition-all ${
                                    isActive
                                        ? "text-[#FF5500] bg-[#FF5500]/10"
                                        : "text-zinc-400 active:bg-zinc-800"
                                }`}
                            >
                                <span className="text-xl mb-0.5">{item.icon}</span>
                                <span className="text-[10px] font-medium">{item.mobileLabel}</span>
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
                <h1 className="text-xl sm:text-2xl font-bold text-white mb-4">{title}</h1>
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
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#FF5500] mx-auto mb-4" />
                <p className="text-zinc-500 text-sm">Checking credentials...</p>
            </div>
        </div>
    );
}
