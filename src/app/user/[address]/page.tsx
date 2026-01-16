"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";

type PublicProfile = {
    user: {
        address: string;
        name: string | null;
        username: string | null;
        ensName: string | null;
        avatarUrl: string | null;
        bio: string | null;
    };
    socials: Array<{
        platform: string;
        handle: string;
        url: string;
    }>;
    agents: Array<{
        id: string;
        name: string;
        personality: string | null;
        avatar_emoji: string;
    }>;
    scheduling: {
        slug: string;
        title: string | null;
        bio: string | null;
    } | null;
};

const SOCIAL_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
    twitter: { icon: "𝕏", color: "text-white", bg: "bg-black" },
    x: { icon: "𝕏", color: "text-white", bg: "bg-black" },
    github: { icon: "⌘", color: "text-white", bg: "bg-zinc-800" },
    linkedin: { icon: "in", color: "text-white", bg: "bg-blue-600" },
    website: { icon: "🌐", color: "text-white", bg: "bg-emerald-600" },
    telegram: { icon: "✈️", color: "text-white", bg: "bg-sky-500" },
    discord: { icon: "💬", color: "text-white", bg: "bg-indigo-600" },
    email: { icon: "✉️", color: "text-white", bg: "bg-rose-500" },
    instagram: { icon: "📷", color: "text-white", bg: "bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400" },
    youtube: { icon: "▶️", color: "text-white", bg: "bg-red-600" },
    tiktok: { icon: "♪", color: "text-white", bg: "bg-black" },
};

export default function PublicUserPage() {
    const params = useParams();
    const address = params.address as string;
    const [profile, setProfile] = useState<PublicProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!address) return;

        const fetchProfile = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/public/user/${address}`);

                if (!response.ok) {
                    if (response.status === 404) {
                        setError("This user has not enabled a public profile");
                    } else {
                        setError("Failed to load profile");
                    }
                    return;
                }

                const data = await response.json();
                setProfile(data);
            } catch (err) {
                console.error("[Public Profile] Error:", err);
                setError("Failed to load profile");
            } finally {
                setIsLoading(false);
            }
        };

        fetchProfile();
    }, [address]);

    const formatAddress = (addr: string) =>
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    const copyAddress = () => {
        navigator.clipboard.writeText(profile?.user.address || "");
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !profile) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center mx-auto mb-6">
                        <span className="text-4xl">🔒</span>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-4">
                        Profile Not Available
                    </h1>
                    <p className="text-zinc-400 mb-6">{error || "User not found"}</p>
                    <Link
                        href="/"
                        className="inline-block px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors"
                    >
                        Go to Spritz
                    </Link>
                </div>
            </div>
        );
    }

    const displayName = profile.user.name || profile.user.ensName || formatAddress(profile.user.address);
    const username = profile.user.username ? `@${profile.user.username}` : profile.user.ensName;

    // Generate structured data for SEO
    const structuredData = {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        mainEntity: {
            "@type": "Person",
            name: displayName,
            identifier: profile.user.address,
            url: `https://app.spritz.chat/user/${address}`,
            image: profile.user.avatarUrl || undefined,
            sameAs: profile.socials.map((s) => s.url),
        },
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(structuredData),
                }}
            />
            
            <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
                {/* Header - Bento style */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-8"
                >
                    {/* Avatar */}
                    <div className="mb-4">
                        {profile.user.avatarUrl ? (
                            <img
                                src={profile.user.avatarUrl}
                                alt={displayName}
                                className="w-28 h-28 sm:w-32 sm:h-32 rounded-full mx-auto border-4 border-zinc-800 shadow-2xl"
                            />
                        ) : (
                            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full mx-auto bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-5xl sm:text-6xl font-bold border-4 border-zinc-800 shadow-2xl">
                                {displayName[0]?.toUpperCase() || "?"}
                            </div>
                        )}
                    </div>

                    {/* Name */}
                    <h1 className="text-2xl sm:text-3xl font-bold mb-1">
                        {displayName}
                    </h1>

                    {/* Username / ENS */}
                    {username && username !== displayName && (
                        <p className="text-zinc-400 text-sm mb-2 flex items-center justify-center gap-1.5">
                            {profile.user.ensName && (
                                <span className="inline-flex items-center gap-1 text-emerald-400 text-xs bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    ENS
                                </span>
                            )}
                            <span>{username}</span>
                        </p>
                    )}

                    {/* Bio */}
                    {profile.user.bio && (
                        <p className="text-zinc-300 text-sm sm:text-base max-w-md mx-auto mt-3 leading-relaxed">
                            {profile.user.bio}
                        </p>
                    )}
                </motion.div>

                {/* Bento Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    {/* Message Card - Full width on mobile, 2 cols on desktop */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="col-span-2"
                    >
                        <Link
                            href={`/?chat=${profile.user.address}`}
                            className="block h-full p-5 sm:p-6 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl hover:shadow-xl hover:shadow-orange-500/20 hover:scale-[1.02] transition-all group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <p className="text-white font-semibold text-lg">Message me</p>
                                    <p className="text-white/70 text-sm">Chat on Spritz</p>
                                </div>
                                <svg className="w-5 h-5 text-white/70 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                        </Link>
                    </motion.div>

                    {/* Wallet Address Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="col-span-2"
                    >
                        <button
                            onClick={copyAddress}
                            className="w-full h-full p-5 sm:p-6 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 hover:bg-zinc-800/50 transition-all text-left group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center">
                                    <span className="text-2xl">💎</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-semibold">Wallet</p>
                                    <p className="text-zinc-400 text-sm font-mono truncate">
                                        {formatAddress(profile.user.address)}
                                    </p>
                                </div>
                                <svg className="w-5 h-5 text-zinc-500 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                            </div>
                        </button>
                    </motion.div>

                    {/* Scheduling Card - 2 cols if exists */}
                    {profile.scheduling && profile.scheduling.slug && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15 }}
                            className="col-span-2"
                        >
                            <Link
                                href={`/schedule/${profile.scheduling.slug}`}
                                className="block h-full p-5 sm:p-6 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-emerald-500/50 hover:bg-zinc-800/50 transition-all group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                        <span className="text-2xl">📅</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-semibold">
                                            {profile.scheduling.title || "Book a call"}
                                        </p>
                                        <p className="text-zinc-400 text-sm truncate">
                                            {profile.scheduling.bio || "Schedule a meeting"}
                                        </p>
                                    </div>
                                    <svg className="w-5 h-5 text-zinc-500 group-hover:translate-x-1 group-hover:text-emerald-400 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </div>
                            </Link>
                        </motion.div>
                    )}

                    {/* Social Links - Individual cards */}
                    {profile.socials.map((social, index) => {
                        const socialStyle = SOCIAL_ICONS[social.platform.toLowerCase()] || { icon: "🔗", color: "text-white", bg: "bg-zinc-700" };
                        return (
                            <motion.div
                                key={social.platform}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 + index * 0.05 }}
                                className="col-span-1"
                            >
                                <a
                                    href={social.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex flex-col items-center justify-center aspect-square p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 hover:scale-[1.05] hover:shadow-lg transition-all group"
                                >
                                    <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl ${socialStyle.bg} flex items-center justify-center mb-2 group-hover:scale-110 transition-transform`}>
                                        <span className={`text-xl sm:text-2xl ${socialStyle.color} font-bold`}>
                                            {socialStyle.icon}
                                        </span>
                                    </div>
                                    <p className="text-white text-sm font-medium capitalize">
                                        {social.platform}
                                    </p>
                                    <p className="text-zinc-500 text-xs truncate max-w-full">
                                        {social.handle}
                                    </p>
                                </a>
                            </motion.div>
                        );
                    })}

                    {/* AI Agents - Individual cards */}
                    {profile.agents.map((agent, index) => (
                        <motion.div
                            key={agent.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 + index * 0.05 }}
                            className="col-span-1"
                        >
                            <Link
                                href={`/agent/${agent.id}`}
                                className="flex flex-col items-center justify-center aspect-square p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-purple-500/50 hover:scale-[1.05] hover:shadow-lg transition-all group"
                            >
                                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-purple-500/20 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                    <span className="text-2xl sm:text-3xl">
                                        {agent.avatar_emoji || "🤖"}
                                    </span>
                                </div>
                                <p className="text-white text-sm font-medium text-center line-clamp-1">
                                    {agent.name}
                                </p>
                                <p className="text-zinc-500 text-xs">AI Agent</p>
                            </Link>
                        </motion.div>
                    ))}
                </div>

                {/* Footer CTA */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-center mt-12 pt-8 border-t border-zinc-800/50"
                >
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-400 rounded-full hover:bg-zinc-800 hover:text-white hover:border-zinc-700 transition-all text-sm"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                        </svg>
                        Create your Spritz profile
                    </Link>
                </motion.div>
            </div>
        </div>
    );
}
