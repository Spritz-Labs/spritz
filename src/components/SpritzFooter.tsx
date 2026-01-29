"use client";

import Link from "next/link";

const SPRITZ_LINKS = [
    { label: "App", href: "/" },
    { label: "Events", href: "/events" },
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/tos" },
];

const SOCIAL_LINKS = [
    { label: "Twitter / X", href: "https://x.com/spritzchat", icon: "𝕏" },
];

type SpritzFooterProps = {
    className?: string;
};

export function SpritzFooter({ className = "" }: SpritzFooterProps) {
    return (
        <footer
            className={`border-t border-zinc-800/80 py-8 ${className}`}
            role="contentinfo"
        >
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-6">
                        <Link
                            href="/"
                            className="text-[#FF5500] font-semibold text-lg hover:opacity-90 transition-opacity"
                        >
                            Spritz
                        </Link>
                        <nav className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                            {SPRITZ_LINKS.map(({ label, href }) => (
                                <Link
                                    key={href}
                                    href={href}
                                    className="text-zinc-400 hover:text-white transition-colors"
                                >
                                    {label}
                                </Link>
                            ))}
                        </nav>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                        {SOCIAL_LINKS.map(({ label, href, icon }) => (
                            <a
                                key={href}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-zinc-400 hover:text-white transition-colors"
                                title={label}
                            >
                                {icon}
                            </a>
                        ))}
                    </div>
                </div>
                <p className="mt-4 text-center sm:text-left text-zinc-500 text-xs">
                    Censorship-resistant chat for Web3 · Powered by Spritz
                </p>
            </div>
        </footer>
    );
}
