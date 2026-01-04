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

const SOCIAL_ICONS: Record<string, string> = {
    twitter: "𝕏",
    x: "𝕏",
    github: "💻",
    linkedin: "💼",
    website: "🌐",
    telegram: "✈️",
    discord: "💬",
    email: "📧",
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

    // Generate structured data for SEO
    const structuredData = profile
        ? {
              "@context": "https://schema.org",
              "@type": "ProfilePage",
              mainEntity: {
                  "@type": "Person",
                  name: profile.user.name || profile.user.ensName || formatAddress(profile.user.address),
                  identifier: profile.user.address,
                  url: `https://app.spritz.chat/user/${address}`,
                  image: profile.user.avatarUrl || undefined,
                  sameAs: profile.socials.map((s) => s.url),
              },
          }
        : null;

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            {structuredData && (
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify(structuredData),
                    }}
                />
            )}
            <div className="max-w-4xl mx-auto px-4 py-12">
                {/* Header */}
                <div className="text-center mb-12">
                    <div className="mb-6">
                        {profile.user.avatarUrl ? (
                            <img
                                src={profile.user.avatarUrl}
                                alt={profile.user.name || "User"}
                                className="w-24 h-24 rounded-full mx-auto border-2 border-zinc-800"
                            />
                        ) : (
                            <div className="w-24 h-24 rounded-full mx-auto bg-zinc-800 flex items-center justify-center text-4xl">
                                {profile.user.name?.[0]?.toUpperCase() || "?"}
                            </div>
                        )}
                    </div>
                    <h1 className="text-3xl font-bold mb-2">
                        {profile.user.name ||
                            profile.user.ensName ||
                            formatAddress(profile.user.address)}
                    </h1>
                    {profile.user.ensName && profile.user.name && (
                        <p className="text-zinc-400 text-sm mb-2">
                            {profile.user.ensName}
                        </p>
                    )}
                    <p className="text-zinc-500 text-sm font-mono">
                        {formatAddress(profile.user.address)}
                    </p>
                </div>

                {/* Socials */}
                {profile.socials.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-8"
                    >
                        <h2 className="text-xl font-bold mb-4">Social Links</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {profile.socials.map((social) => (
                                <a
                                    key={social.platform}
                                    href={social.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 px-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors"
                                >
                                    <span className="text-2xl">
                                        {SOCIAL_ICONS[social.platform.toLowerCase()] ||
                                            "🔗"}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-medium text-sm capitalize">
                                            {social.platform}
                                        </p>
                                        <p className="text-zinc-500 text-xs truncate">
                                            {social.handle}
                                        </p>
                                    </div>
                                </a>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* Scheduling Link */}
                {profile.scheduling && profile.scheduling.slug && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="mb-8"
                    >
                        <h2 className="text-xl font-bold mb-4">Schedule a Call</h2>
                        <Link
                            href={`/schedule/${profile.scheduling.slug}`}
                            className="block px-6 py-4 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:border-orange-500/50 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">📅</span>
                                <div className="flex-1">
                                    <p className="text-white font-medium">
                                        {profile.scheduling.title ||
                                            "Book a call"}
                                    </p>
                                    {profile.scheduling.bio && (
                                        <p className="text-zinc-400 text-sm mt-1">
                                            {profile.scheduling.bio}
                                        </p>
                                    )}
                                </div>
                                <svg
                                    className="w-5 h-5 text-zinc-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 5l7 7-7 7"
                                    />
                                </svg>
                            </div>
                        </Link>
                    </motion.div>
                )}

                {/* Public Agents */}
                {profile.agents.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="mb-8"
                    >
                        <h2 className="text-xl font-bold mb-4">AI Agents</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {profile.agents.map((agent) => (
                                <Link
                                    key={agent.id}
                                    href={`/agent/${agent.id}`}
                                    className="block px-6 py-4 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:border-orange-500/50 transition-colors"
                                >
                                    <div className="flex items-start gap-3">
                                        <span className="text-3xl">
                                            {agent.avatar_emoji || "🤖"}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white font-medium mb-1">
                                                {agent.name}
                                            </p>
                                            {agent.personality && (
                                                <p className="text-zinc-400 text-sm line-clamp-2">
                                                    {agent.personality}
                                                </p>
                                            )}
                                        </div>
                                        <svg
                                            className="w-5 h-5 text-zinc-500 shrink-0"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M9 5l7 7-7 7"
                                            />
                                        </svg>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* CTA */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="text-center mt-12 pt-8 border-t border-zinc-800"
                >
                    <p className="text-zinc-400 mb-4">Want your own profile?</p>
                    <Link
                        href="/"
                        className="inline-block px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all"
                    >
                        Join Spritz
                    </Link>
                </motion.div>
            </div>
        </div>
    );
}

