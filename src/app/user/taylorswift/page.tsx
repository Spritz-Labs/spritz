"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { ProfileWidgetRenderer } from "@/components/profile/ProfileWidgetRenderer";
import { BaseWidget, ProfileTheme } from "@/components/profile/ProfileWidgetTypes";

// Taylor Swift demo profile with curated widgets
const TAYLOR_WIDGETS: BaseWidget[] = [
    // Row 1: Hero - Message + Social
    {
        id: "ts-message",
        widget_type: "message_me",
        config: {
            address: "0xTaylorSwift13",
            title: "Hey Swifties 💕",
            subtitle: "Chat with me on Spritz",
        },
        size: "2x1",
        position: 0,
        is_visible: true,
    },
    {
        id: "ts-social-x",
        widget_type: "social_link",
        config: {
            platform: "x",
            handle: "@taylorswift13",
            url: "https://twitter.com/taylorswift13",
        },
        size: "1x1",
        position: 1,
        is_visible: true,
    },
    {
        id: "ts-social-instagram",
        widget_type: "social_link",
        config: {
            platform: "instagram",
            handle: "@taylorswift",
            url: "https://instagram.com/taylorswift",
        },
        size: "1x1",
        position: 2,
        is_visible: true,
    },
    
    // Row 2: Vinyl Record (her latest album) + Currently
    {
        id: "ts-vinyl",
        widget_type: "vinyl_record",
        config: {
            albumArt: "https://upload.wikimedia.org/wikipedia/en/d/d5/Taylor_Swift_-_The_Tortured_Poets_Department_%28cover%29.png",
            albumName: "The Tortured Poets Department",
            artistName: "Taylor Swift",
            isSpinning: true,
            spotifyUrl: "https://open.spotify.com/album/5H7ixXZfsNMGbIE5OBSpcb",
        },
        size: "2x2",
        position: 3,
        is_visible: true,
    },
    {
        id: "ts-currently",
        widget_type: "currently",
        config: {
            type: "listening",
            title: "Fortnight",
            subtitle: "feat. Post Malone",
            imageUrl: "https://upload.wikimedia.org/wikipedia/en/d/d5/Taylor_Swift_-_The_Tortured_Poets_Department_%28cover%29.png",
        },
        size: "2x1",
        position: 4,
        is_visible: true,
    },
    {
        id: "ts-zodiac",
        widget_type: "zodiac",
        config: {
            sign: "sagittarius",
            showTraits: true,
        },
        size: "1x1",
        position: 5,
        is_visible: true,
    },
    {
        id: "ts-pet",
        widget_type: "pet",
        config: {
            petType: "cat",
            name: "Meredith",
            mood: "sleepy",
            color: "#f8b4d9",
        },
        size: "1x1",
        position: 6,
        is_visible: true,
    },
    
    // Row 3: Quote + Stats
    {
        id: "ts-quote",
        widget_type: "text",
        config: {
            text: "People haven't always been there for me, but music always has.",
            style: "quote",
            alignment: "center",
            fontSize: "lg",
        },
        size: "2x2",
        position: 7,
        is_visible: true,
    },
    {
        id: "ts-stats",
        widget_type: "stats",
        config: {
            stats: [
                { label: "Albums", value: "14", emoji: "💿" },
                { label: "Grammys", value: "14", emoji: "🏆" },
                { label: "Eras Tour Shows", value: "149", emoji: "🎤" },
            ],
            layout: "row",
        },
        size: "2x1",
        position: 8,
        is_visible: true,
    },
    {
        id: "ts-streak",
        widget_type: "streak_counter",
        config: {
            label: "Days on Tour",
            currentStreak: 365,
            longestStreak: 365,
            emoji: "✨",
        },
        size: "1x1",
        position: 9,
        is_visible: true,
    },
    {
        id: "ts-fortune",
        widget_type: "fortune_cookie",
        config: {
            fortunes: [
                "Long story short, I survived 💪",
                "You belong with me 💕",
                "Shake it off, shake it off! 💃",
                "Fearless is living in spite of fear",
                "We never go out of style ✨",
            ],
            category: "custom",
        },
        size: "1x1",
        position: 10,
        is_visible: true,
    },
    
    // Row 4: Mood Board (aesthetic vibes) + Color Palette
    {
        id: "ts-moodboard",
        widget_type: "mood_board",
        config: {
            images: [
                { url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400", size: "large" }, // Starry mountain
                { url: "https://images.unsplash.com/photo-1507400492013-162706c8c05e?w=300", size: "medium" }, // Purple sunset
                { url: "https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?w=300", size: "small" }, // Purple gradient
                { url: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=300", size: "medium" }, // Ocean waves
            ],
            title: "✨ Aesthetic",
        },
        size: "2x2",
        position: 11,
        is_visible: true,
    },
    {
        id: "ts-colors",
        widget_type: "color_palette",
        config: {
            name: "Eras Palette",
            colors: ["#8B5CF6", "#EC4899", "#F472B6", "#A855F7", "#3B82F6"],
        },
        size: "2x1",
        position: 12,
        is_visible: true,
    },
    
    // Row 5: Goals + Poll
    {
        id: "ts-goals",
        widget_type: "goals_checklist",
        config: {
            title: "2024 Goals",
            goals: [
                { id: "1", text: "Re-record all albums", completed: false, emoji: "🎵" },
                { id: "2", text: "Break Eras Tour records", completed: true, emoji: "🏆" },
                { id: "3", text: "Release TTPD", completed: true, emoji: "📖" },
                { id: "4", text: "Visit every continent", completed: true, emoji: "🌍" },
            ],
            showProgress: true,
        },
        size: "2x1",
        position: 13,
        is_visible: true,
    },
    {
        id: "ts-poll",
        widget_type: "poll",
        config: {
            question: "Favorite Taylor Era?",
            options: [
                { id: "1", text: "1989", votes: 2847 },
                { id: "2", text: "Folklore", votes: 3156 },
                { id: "3", text: "Midnights", votes: 2234 },
                { id: "4", text: "TTPD", votes: 4521 },
            ],
            allowMultiple: false,
        },
        size: "2x2",
        position: 14,
        is_visible: true,
    },
    
    // Row 6: Reaction Wall + Map
    {
        id: "ts-reactions",
        widget_type: "reaction_wall",
        config: {
            emojis: ["💕", "✨", "🦋", "💜", "🎤"],
            reactions: { "💕": 12847, "✨": 9156, "🦋": 7234, "💜": 5521, "🎤": 8932 },
        },
        size: "2x1",
        position: 15,
        is_visible: true,
    },
    {
        id: "ts-map",
        widget_type: "map",
        config: {
            location: "Nashville, Tennessee",
            latitude: 36.1627,
            longitude: -86.7816,
            zoom: 11,
            label: "Where it all began",
        },
        size: "2x2",
        position: 16,
        is_visible: true,
    },
    
    // Row 7: Bookshelf (she loves books!)
    {
        id: "ts-books",
        widget_type: "bookshelf",
        config: {
            books: [
                { title: "The Great Gatsby", author: "F. Scott Fitzgerald", status: "finished", rating: 5 },
                { title: "Rebecca", author: "Daphne du Maurier", status: "finished", rating: 5 },
                { title: "Pride and Prejudice", author: "Jane Austen", status: "reading", rating: 5 },
            ],
            title: "My Reading List 📚",
        },
        size: "2x2",
        position: 17,
        is_visible: true,
    },
    
    // Row 8: Visitor Counter + Guestbook
    {
        id: "ts-visitors",
        widget_type: "visitor_counter",
        config: {
            count: 13131313,
            label: "Swifties Visited",
            style: "modern",
        },
        size: "2x1",
        position: 18,
        is_visible: true,
    },
    {
        id: "ts-guestbook",
        widget_type: "guestbook",
        config: {
            title: "Leave a message! 💌",
            messages: [
                { id: "1", author: "SwiftieForever", content: "You inspire me every day! 💕", timestamp: new Date(Date.now() - 3600000).toISOString() },
                { id: "2", author: "ErasTourFan", content: "Best concert of my life! ✨", timestamp: new Date(Date.now() - 7200000).toISOString() },
                { id: "3", author: "MidnightsDreamer", content: "Can't stop listening to TTPD!", timestamp: new Date(Date.now() - 86400000).toISOString() },
            ],
            maxMessages: 5,
        },
        size: "2x2",
        position: 19,
        is_visible: true,
    },
];

// Custom theme for Taylor - purple/pink gradient
const TAYLOR_THEME: ProfileTheme = {
    background_type: 'gradient',
    background_value: 'linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 25%, #3d1f5e 50%, #2d1b4e 75%, #1a0a2e 100%)',
    accent_color: '#A855F7',
    secondary_color: '#EC4899',
    text_color: '#ffffff',
    card_style: 'rounded',
    card_background: 'rgba(45, 27, 78, 0.6)',
    card_border: 'rgba(168, 85, 247, 0.3)',
    font_family: 'system',
    show_spritz_badge: true,
};

export default function TaylorSwiftDemoPage() {
    return (
        <div 
            className="min-h-screen text-white"
            style={{
                background: TAYLOR_THEME.background_value,
                color: TAYLOR_THEME.text_color,
            }}
        >
            {/* Sparkle overlay effect */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-20 left-10 w-2 h-2 bg-purple-400 rounded-full animate-pulse opacity-60" />
                <div className="absolute top-40 right-20 w-1.5 h-1.5 bg-pink-400 rounded-full animate-pulse opacity-50" style={{ animationDelay: '0.5s' }} />
                <div className="absolute top-60 left-1/4 w-1 h-1 bg-purple-300 rounded-full animate-pulse opacity-40" style={{ animationDelay: '1s' }} />
                <div className="absolute bottom-40 right-1/3 w-2 h-2 bg-pink-300 rounded-full animate-pulse opacity-50" style={{ animationDelay: '1.5s' }} />
                <div className="absolute bottom-20 left-1/3 w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse opacity-60" style={{ animationDelay: '2s' }} />
            </div>

            {/* Sticky Header */}
            <div className="sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
                <div className="bg-purple-950/60 backdrop-blur-xl border-b border-purple-500/20">
                    <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
                        <Link
                            href="/"
                            className="flex items-center gap-2 text-purple-300 hover:text-white transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            <span className="text-sm font-medium">Spritz</span>
                        </Link>
                        
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-500/20 border border-purple-500/30 rounded-full">
                            <span className="text-purple-300 text-xs font-medium">✨ Demo Profile</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10 relative">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-8"
                >
                    {/* Avatar */}
                    <div className="mb-4 relative">
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 opacity-50 blur-xl animate-pulse" />
                        </div>
                        <div 
                            className="w-28 h-28 sm:w-32 sm:h-32 rounded-full mx-auto border-4 shadow-2xl relative z-10 flex items-center justify-center text-4xl sm:text-5xl font-bold text-white"
                            style={{ 
                                background: 'linear-gradient(135deg, #A855F7 0%, #EC4899 50%, #F472B6 100%)',
                                borderColor: 'rgba(168, 85, 247, 0.5)',
                            }}
                        >
                            TS
                        </div>
                    </div>

                    {/* Name */}
                    <h1 className="text-2xl sm:text-3xl font-bold mb-1 bg-gradient-to-r from-purple-300 via-pink-300 to-purple-300 bg-clip-text text-transparent">
                        Taylor Swift
                    </h1>

                    {/* Username */}
                    <p className="text-sm mb-2 flex items-center justify-center gap-1.5 text-purple-300">
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
                            ✓ Verified
                        </span>
                        <span>@taylorswift</span>
                    </p>

                    {/* Bio */}
                    <p className="text-sm sm:text-base max-w-md mx-auto mt-3 leading-relaxed text-purple-100/80">
                        Singer, songwriter, lover of cats & cardigans. 
                        Currently on The Eras Tour 🎤✨
                    </p>
                    
                    {/* Widget count */}
                    <div className="mt-4 flex items-center justify-center gap-4 text-sm">
                        <div className="px-3 py-1 bg-purple-500/20 rounded-full">
                            <span className="text-purple-300">{TAYLOR_WIDGETS.length} widgets</span>
                        </div>
                    </div>
                </motion.div>

                {/* Widgets */}
                <ProfileWidgetRenderer widgets={TAYLOR_WIDGETS} />

                {/* Footer */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-center mt-12 pt-8 border-t border-purple-500/20"
                >
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white transition-all text-sm font-medium shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40"
                    >
                        ✨ Create your own Spritz profile
                    </Link>
                </motion.div>
            </div>
        </div>
    );
}
