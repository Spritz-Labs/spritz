"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { ProfileWidgetRenderer } from "@/components/profile/ProfileWidgetRenderer";
import { BaseWidget, ProfileTheme, DEFAULT_THEMES } from "@/components/profile/ProfileWidgetTypes";

// Check if current user is the profile owner
function useIsProfileOwner(profileAddress: string | null) {
    const [isOwner, setIsOwner] = useState(false);
    
    useEffect(() => {
        if (!profileAddress) return;
        
        // Check session to see if logged-in user matches profile
        fetch('/api/auth/session', { credentials: 'include' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                // Session API returns userAddress in data.session.userAddress
                // or wallet_address in data.user.wallet_address
                const sessionAddress = data?.session?.userAddress || data?.user?.wallet_address;
                if (sessionAddress) {
                    setIsOwner(sessionAddress.toLowerCase() === profileAddress.toLowerCase());
                }
            })
            .catch(() => setIsOwner(false));
    }, [profileAddress]);
    
    return isOwner;
}

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
        avatar_url?: string | null;
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
    const [widgets, setWidgets] = useState<BaseWidget[]>([]);
    const [theme, setTheme] = useState<ProfileTheme | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const isOwner = useIsProfileOwner(profile?.user.address || null);

    useEffect(() => {
        if (!address) return;

        const fetchData = async () => {
            setIsLoading(true);
            setError(null);

            try {
                // Fetch profile and widgets in parallel
                const [profileRes, widgetsRes] = await Promise.all([
                    fetch(`/api/public/user/${address}`),
                    fetch(`/api/profile/widgets?address=${address}`),
                ]);

                if (!profileRes.ok) {
                    if (profileRes.status === 404) {
                        setError("This user has not enabled a public profile");
                    } else {
                        setError("Failed to load profile");
                    }
                    return;
                }

                const profileData = await profileRes.json();
                setProfile(profileData);

                if (widgetsRes.ok) {
                    const widgetsData = await widgetsRes.json();
                    setWidgets(widgetsData.widgets || []);
                    if (widgetsData.theme) {
                        setTheme(widgetsData.theme);
                    }
                }
            } catch (err) {
                console.error("[Public Profile] Error:", err);
                setError("Failed to load profile");
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
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
    const hasCustomWidgets = widgets.length > 0;

    // Apply theme
    const activeTheme = theme || DEFAULT_THEMES.dark as ProfileTheme;
    const backgroundStyle = activeTheme.background_type === 'gradient' || activeTheme.background_type === 'image'
        ? { background: activeTheme.background_value }
        : { backgroundColor: activeTheme.background_value };

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
        <div 
            className="min-h-screen text-white"
            style={{
                ...backgroundStyle,
                color: activeTheme.text_color,
            }}
        >
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(structuredData),
                }}
            />
            
            {/* Sticky Header - with safe area for iPhone notch */}
            <div className="sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
                <div className="bg-black/30 backdrop-blur-lg border-b border-white/10">
                    <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
                        <Link
                            href="/"
                            className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            <span className="text-sm font-medium">Spritz</span>
                        </Link>
                        
                        <div className="flex items-center gap-2">
                            {/* Message Button */}
                            <Link
                                href={`/?chat=${profile.user.address}`}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                                style={{ 
                                    backgroundColor: activeTheme.accent_color + '30',
                                    color: activeTheme.accent_color,
                                }}
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                <span className="hidden sm:inline">Message</span>
                            </Link>
                            
                            {/* Edit Button (only for profile owner) */}
                            {isOwner && (
                                <Link
                                    href={`/user/${address}/edit`}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium text-white transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    <span className="hidden sm:inline">Edit</span>
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Main Content */}
            <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
                {/* Header */}
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
                                className="w-28 h-28 sm:w-32 sm:h-32 rounded-full mx-auto border-4 shadow-2xl"
                                style={{ borderColor: activeTheme.accent_color + '40' }}
                            />
                        ) : (
                            <div 
                                className="w-28 h-28 sm:w-32 sm:h-32 rounded-full mx-auto flex items-center justify-center text-5xl sm:text-6xl font-bold border-4 shadow-2xl"
                                style={{ 
                                    background: `linear-gradient(135deg, ${activeTheme.accent_color}, ${activeTheme.secondary_color || activeTheme.accent_color})`,
                                    borderColor: activeTheme.accent_color + '40',
                                }}
                            >
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
                        <p className="text-sm mb-2 flex items-center justify-center gap-1.5" style={{ color: activeTheme.text_color + 'aa' }}>
                            {profile.user.ensName && (
                                <span 
                                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                                    style={{ 
                                        backgroundColor: '#10b98120',
                                        color: '#10b981',
                                    }}
                                >
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
                        <p 
                            className="text-sm sm:text-base max-w-md mx-auto mt-3 leading-relaxed"
                            style={{ color: activeTheme.text_color + 'cc' }}
                        >
                            {profile.user.bio}
                        </p>
                    )}
                </motion.div>

                {/* Custom Widgets or Default Grid */}
                {hasCustomWidgets ? (
                    <ProfileWidgetRenderer widgets={widgets} />
                ) : (
                    /* Default Bento Grid */
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                        {/* Message Card */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 }}
                            className="col-span-2"
                        >
                            <Link
                                href={`/?chat=${profile.user.address}`}
                                className="block h-full p-5 sm:p-6 rounded-2xl hover:shadow-xl hover:scale-[1.02] transition-all group"
                                style={{ 
                                    background: `linear-gradient(135deg, ${activeTheme.accent_color}, ${activeTheme.secondary_color || activeTheme.accent_color}dd)`,
                                }}
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
                                className="w-full h-full p-5 sm:p-6 rounded-2xl transition-all text-left group"
                                style={{
                                    backgroundColor: activeTheme.card_background,
                                    borderWidth: '1px',
                                    borderColor: activeTheme.card_border || 'transparent',
                                }}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center">
                                        <span className="text-2xl">💎</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold" style={{ color: activeTheme.text_color }}>Wallet</p>
                                        <p className="text-sm font-mono truncate" style={{ color: activeTheme.text_color + '88' }}>
                                            {formatAddress(profile.user.address)}
                                        </p>
                                    </div>
                                    <svg className="w-5 h-5 group-hover:text-white transition-colors" style={{ color: activeTheme.text_color + '66' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </div>
                            </button>
                        </motion.div>

                        {/* Scheduling Card */}
                        {profile.scheduling && profile.scheduling.slug && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.15 }}
                                className="col-span-2"
                            >
                                <Link
                                    href={`/book/${profile.scheduling.slug}`}
                                    className="block h-full p-5 sm:p-6 rounded-2xl transition-all group"
                                    style={{
                                        backgroundColor: activeTheme.card_background,
                                        borderWidth: '1px',
                                        borderColor: activeTheme.card_border || 'transparent',
                                    }}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                            <span className="text-2xl">📅</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold" style={{ color: activeTheme.text_color }}>
                                                {profile.scheduling.title || "Book a call"}
                                            </p>
                                            <p className="text-sm truncate" style={{ color: activeTheme.text_color + '88' }}>
                                                {profile.scheduling.bio || "Schedule a meeting"}
                                            </p>
                                        </div>
                                        <svg className="w-5 h-5 group-hover:translate-x-1 transition-all" style={{ color: '#10b981' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </Link>
                            </motion.div>
                        )}

                        {/* Social Links */}
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
                                        className="flex flex-col items-center justify-center aspect-square p-4 rounded-2xl hover:scale-[1.05] hover:shadow-lg transition-all group"
                                        style={{
                                            backgroundColor: activeTheme.card_background,
                                            borderWidth: '1px',
                                            borderColor: activeTheme.card_border || 'transparent',
                                        }}
                                    >
                                        <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl ${socialStyle.bg} flex items-center justify-center mb-2 group-hover:scale-110 transition-transform`}>
                                            <span className={`text-xl sm:text-2xl ${socialStyle.color} font-bold`}>
                                                {socialStyle.icon}
                                            </span>
                                        </div>
                                        <p className="text-sm font-medium capitalize" style={{ color: activeTheme.text_color }}>
                                            {social.platform}
                                        </p>
                                        <p className="text-xs truncate max-w-full" style={{ color: activeTheme.text_color + '66' }}>
                                            {social.handle}
                                        </p>
                                    </a>
                                </motion.div>
                            );
                        })}

                        {/* AI Agents */}
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
                                    className="flex flex-col items-center justify-center aspect-square p-4 rounded-2xl hover:scale-[1.05] hover:shadow-lg transition-all group"
                                    style={{
                                        backgroundColor: activeTheme.card_background,
                                        borderWidth: '1px',
                                        borderColor: activeTheme.card_border || 'transparent',
                                    }}
                                >
                                    {agent.avatar_url ? (
                                        <img
                                            src={agent.avatar_url}
                                            alt={agent.name}
                                            className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover mb-2 group-hover:scale-110 transition-transform"
                                        />
                                    ) : (
                                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-purple-500/20 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                            <span className="text-2xl sm:text-3xl">
                                                {agent.avatar_emoji || "🤖"}
                                            </span>
                                        </div>
                                    )}
                                    <p className="text-sm font-medium text-center line-clamp-1" style={{ color: activeTheme.text_color }}>
                                        {agent.name}
                                    </p>
                                    <p className="text-xs" style={{ color: activeTheme.text_color + '66' }}>AI Agent</p>
                                </Link>
                            </motion.div>
                        ))}
                    </div>
                )}

                {/* Footer CTA */}
                {activeTheme.show_spritz_badge !== false && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="text-center mt-12 pt-8"
                        style={{ borderTopWidth: '1px', borderColor: activeTheme.card_border || 'transparent' }}
                    >
                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full hover:scale-105 transition-all text-sm"
                            style={{
                                backgroundColor: activeTheme.card_background,
                                borderWidth: '1px',
                                borderColor: activeTheme.card_border || 'transparent',
                                color: activeTheme.text_color + '88',
                            }}
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                            </svg>
                            Create your Spritz profile
                        </Link>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
