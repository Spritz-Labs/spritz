"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { ProfileWidgetRenderer } from "@/components/profile/ProfileWidgetRenderer";
import { BaseWidget, DEFAULT_THEMES, ProfileTheme } from "@/components/profile/ProfileWidgetTypes";

// Demo widgets showcasing all widget types
const DEMO_WIDGETS: BaseWidget[] = [
    // Row 1: Hero widgets
    {
        id: "demo-message",
        widget_type: "message_me",
        config: {
            address: "0x1234567890123456789012345678901234567890",
            title: "Message me",
            subtitle: "Chat on Spritz",
        },
        size: "2x1",
        position: 0,
        is_visible: true,
    },
    {
        id: "demo-wallet",
        widget_type: "wallet",
        config: {
            address: "0x1234567890123456789012345678901234567890",
            label: "Wallet",
        },
        size: "2x1",
        position: 1,
        is_visible: true,
    },
    
    // Row 2: Map and Weather
    {
        id: "demo-map",
        widget_type: "map",
        config: {
            location: "San Francisco, CA",
            latitude: 37.7749,
            longitude: -122.4194,
            zoom: 12,
        },
        size: "2x2",
        position: 2,
        is_visible: true,
    },
    {
        id: "demo-weather",
        widget_type: "weather",
        config: {
            city: "San Francisco",
            country: "US",
            units: "fahrenheit",
        },
        size: "1x1",
        position: 3,
        is_visible: true,
    },
    {
        id: "demo-clock",
        widget_type: "clock",
        config: {
            timezone: "America/Los_Angeles",
            label: "SF Time",
            format: "12h",
        },
        size: "1x1",
        position: 4,
        is_visible: true,
    },
    
    // Row 3: Currently & Stats
    {
        id: "demo-currently",
        widget_type: "currently",
        config: {
            type: "building",
            title: "Spritz Chat",
            subtitle: "Web3 messaging app",
            imageUrl: "https://app.spritz.chat/og-image.png",
        },
        size: "2x1",
        position: 5,
        is_visible: true,
    },
    {
        id: "demo-stats",
        widget_type: "stats",
        config: {
            stats: [
                { label: "Projects", value: 42, emoji: "🚀" },
                { label: "Commits", value: "5.2K", emoji: "💻" },
                { label: "Coffee", value: "∞", emoji: "☕" },
            ],
            layout: "row",
        },
        size: "2x1",
        position: 6,
        is_visible: true,
    },
    
    // Row 4: Text widgets
    {
        id: "demo-text-quote",
        widget_type: "text",
        config: {
            text: "The best way to predict the future is to create it.",
            style: "quote",
            alignment: "center",
            fontSize: "lg",
        },
        size: "2x2",
        position: 7,
        is_visible: true,
    },
    {
        id: "demo-github",
        widget_type: "github",
        config: {
            username: "vbuterin",
            type: "contributions",
            showStats: true,
        },
        size: "2x2",
        position: 8,
        is_visible: true,
    },
    
    // Row 5: Tech Stack
    {
        id: "demo-tech",
        widget_type: "tech_stack",
        config: {
            label: "Tech Stack",
            technologies: [
                { name: "React", icon: "⚛️" },
                { name: "TypeScript", icon: "🔷" },
                { name: "Next.js", icon: "▲" },
                { name: "Solidity", icon: "💎" },
                { name: "Node.js", icon: "💚" },
                { name: "Tailwind", icon: "🎨" },
                { name: "PostgreSQL", icon: "🐘" },
                { name: "Redis", icon: "🔴" },
            ],
        },
        size: "2x2",
        position: 9,
        is_visible: true,
    },
    {
        id: "demo-countdown",
        widget_type: "countdown",
        config: {
            targetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
            label: "Next Launch",
            emoji: "🚀",
        },
        size: "2x1",
        position: 10,
        is_visible: true,
    },
    
    // Interactive widgets
    {
        id: "demo-poll",
        widget_type: "poll",
        config: {
            question: "Favorite blockchain?",
            options: [
                { id: "1", text: "Ethereum", votes: 42 },
                { id: "2", text: "Base", votes: 38 },
                { id: "3", text: "Optimism", votes: 20 },
            ],
            allowMultiple: false,
        },
        size: "2x2",
        position: 11,
        is_visible: true,
    },
    {
        id: "demo-reaction",
        widget_type: "reaction_wall",
        config: {
            emojis: ["❤️", "🔥", "👏", "🚀", "💎"],
            reactions: { "❤️": 156, "🔥": 89, "👏": 67, "🚀": 234, "💎": 45 },
        },
        size: "2x1",
        position: 12,
        is_visible: true,
    },
    
    // Pet widget
    {
        id: "demo-pet",
        widget_type: "pet",
        config: {
            name: "Pixel",
            species: "cat",
            mood: "happy",
            color: "#f97316",
        },
        size: "1x1",
        position: 13,
        is_visible: true,
    },
    {
        id: "demo-fortune",
        widget_type: "fortune_cookie",
        config: {
            fortunes: [
                "A great opportunity awaits you.",
                "Your code will compile on the first try.",
                "Gas fees will be low today.",
            ],
        },
        size: "1x1",
        position: 14,
        is_visible: true,
    },
    
    // Aesthetic widgets
    {
        id: "demo-vinyl",
        widget_type: "vinyl_record",
        config: {
            albumArt: "https://i.scdn.co/image/ab67616d0000b273d9985092cd88bffd97653b58",
            albumName: "After Hours",
            artistName: "The Weeknd",
            isSpinning: true,
        },
        size: "2x2",
        position: 15,
        is_visible: true,
    },
    {
        id: "demo-color",
        widget_type: "color_palette",
        config: {
            name: "Sunset Vibes",
            colors: ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7"],
        },
        size: "2x1",
        position: 16,
        is_visible: true,
    },
    
    // Zodiac
    {
        id: "demo-zodiac",
        widget_type: "zodiac",
        config: {
            sign: "leo",
            showTraits: true,
        },
        size: "1x1",
        position: 17,
        is_visible: true,
    },
    {
        id: "demo-availability",
        widget_type: "availability_status",
        config: {
            status: "available",
            message: "Open to collaborate!",
            showCalendarLink: false,
        },
        size: "1x1",
        position: 18,
        is_visible: true,
    },
    
    // Entertainment widgets
    {
        id: "demo-bookshelf",
        widget_type: "bookshelf",
        config: {
            books: [
                { title: "Zero to One", author: "Peter Thiel", coverUrl: "https://images-na.ssl-images-amazon.com/images/I/71m-MxdJ2WL.jpg" },
                { title: "The Lean Startup", author: "Eric Ries", coverUrl: "https://images-na.ssl-images-amazon.com/images/I/81-QB7nDh4L.jpg" },
                { title: "Atomic Habits", author: "James Clear", coverUrl: "https://images-na.ssl-images-amazon.com/images/I/81wgcld4wxL.jpg" },
            ],
            displayStyle: "shelf",
        },
        size: "2x2",
        position: 19,
        is_visible: true,
    },
    {
        id: "demo-game",
        widget_type: "game_now_playing",
        config: {
            gameName: "Elden Ring",
            platform: "PC",
            hoursPlayed: 120,
            achievement: "Reached Mountaintops",
        },
        size: "2x1",
        position: 20,
        is_visible: true,
    },
    
    // Productivity widgets
    {
        id: "demo-streak",
        widget_type: "streak_counter",
        config: {
            label: "Coding Streak",
            currentStreak: 45,
            longestStreak: 90,
            emoji: "🔥",
        },
        size: "1x1",
        position: 21,
        is_visible: true,
    },
    {
        id: "demo-goals",
        widget_type: "goals_checklist",
        config: {
            title: "2024 Goals",
            goals: [
                { id: "1", text: "Ship 3 products", completed: true },
                { id: "2", text: "Learn Rust", completed: false },
                { id: "3", text: "100 GitHub commits", completed: true },
            ],
        },
        size: "1x1",
        position: 22,
        is_visible: true,
    },
    
    // Fun widgets
    {
        id: "demo-counter",
        widget_type: "fun_counter",
        config: {
            label: "Bugs Squashed",
            count: 1337,
            emoji: "🐛",
            incrementOnClick: true,
        },
        size: "1x1",
        position: 23,
        is_visible: true,
    },
    {
        id: "demo-visitor",
        widget_type: "visitor_counter",
        config: {
            count: 42069,
            label: "Profile Views",
            style: "retro",
        },
        size: "1x1",
        position: 24,
        is_visible: true,
    },
    
    // Languages
    {
        id: "demo-languages",
        widget_type: "languages",
        config: {
            languages: [
                { code: "en", name: "English", proficiency: "native" },
                { code: "es", name: "Spanish", proficiency: "fluent" },
                { code: "ja", name: "Japanese", proficiency: "learning" },
            ],
        },
        size: "2x1",
        position: 25,
        is_visible: true,
    },
    
    // Timezone
    {
        id: "demo-timezone",
        widget_type: "timezone_overlap",
        config: {
            myTimezone: "America/Los_Angeles",
            theirTimezone: "Europe/London",
            theirLabel: "London",
        },
        size: "2x1",
        position: 26,
        is_visible: true,
    },
    
    // Random fact
    {
        id: "demo-fact",
        widget_type: "random_fact",
        config: {
            facts: [
                "I've visited 23 countries",
                "My first computer was a Commodore 64",
                "I can solve a Rubik's cube in under 2 minutes",
                "I've been coding since age 12",
            ],
            category: "about_me",
        },
        size: "2x1",
        position: 27,
        is_visible: true,
    },
    
    // Link widget
    {
        id: "demo-link",
        widget_type: "link",
        config: {
            url: "https://spritz.chat",
            title: "Spritz Chat",
            description: "Web3 messaging & payments",
            icon: "🍊",
        },
        size: "2x1",
        position: 28,
        is_visible: true,
    },
    
    // Tip jar
    {
        id: "demo-tipjar",
        widget_type: "tip_jar",
        config: {
            address: "0x1234567890123456789012345678901234567890",
            tokens: ["ETH", "USDC"],
            message: "Buy me a coffee!",
            amounts: [0.001, 0.005, 0.01],
        },
        size: "2x2",
        position: 29,
        is_visible: true,
    },
    
    // Guestbook
    {
        id: "demo-guestbook",
        widget_type: "guestbook",
        config: {
            title: "Sign my guestbook!",
            messages: [
                { id: "1", author: "Alice", content: "Great profile! 🚀", timestamp: new Date(Date.now() - 86400000).toISOString() },
                { id: "2", author: "Bob", content: "Love the widgets!", timestamp: new Date(Date.now() - 3600000).toISOString() },
            ],
            maxMessages: 5,
        },
        size: "2x2",
        position: 30,
        is_visible: true,
    },
    
    // Mood board
    {
        id: "demo-moodboard",
        widget_type: "mood_board",
        config: {
            images: [
                { url: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=300", size: "large" },
                { url: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=300", size: "medium" },
                { url: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=300", size: "small" },
                { url: "https://images.unsplash.com/photo-1535016120720-40c646be5580?w=300", size: "medium" },
            ],
            title: "Aesthetic",
        },
        size: "2x2",
        position: 31,
        is_visible: true,
    },
    
    // Photo carousel
    {
        id: "demo-carousel",
        widget_type: "photo_carousel",
        config: {
            images: [
                { url: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=600", caption: "City vibes" },
                { url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600", caption: "Mountains" },
                { url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600", caption: "Beach day" },
            ],
            autoPlay: true,
            interval: 5,
        },
        size: "2x2",
        position: 32,
        is_visible: true,
    },
    
    // Polaroid stack
    {
        id: "demo-polaroid",
        widget_type: "polaroid_stack",
        config: {
            photos: [
                { url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400", caption: "Portrait" },
                { url: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400", caption: "Style" },
                { url: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400", caption: "Mood" },
            ],
        },
        size: "2x2",
        position: 33,
        is_visible: true,
    },
    
    // Movie queue
    {
        id: "demo-movies",
        widget_type: "movie_queue",
        config: {
            items: [
                { title: "Dune: Part Two", type: "movie", posterUrl: "https://image.tmdb.org/t/p/w300/8b8R8l88Qje9dn9OE8PY05Nxl1X.jpg", status: "watching" },
                { title: "Oppenheimer", type: "movie", posterUrl: "https://image.tmdb.org/t/p/w300/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", status: "want_to_watch" },
            ],
            title: "Watchlist",
        },
        size: "2x2",
        position: 34,
        is_visible: true,
    },
    
    // Podcast favorites
    {
        id: "demo-podcasts",
        widget_type: "podcast_favorites",
        config: {
            podcasts: [
                { name: "Lex Fridman Podcast", coverUrl: "https://i.scdn.co/image/ab6765630000ba8a563ebb538d297875b10114b7", latestEpisode: "AI & Future" },
                { name: "Bankless", coverUrl: "https://i.scdn.co/image/ab6765630000ba8a38f8d0b60c3c2c06ed37e667", latestEpisode: "ETH Roadmap" },
            ],
        },
        size: "2x2",
        position: 35,
        is_visible: true,
    },
];

export default function DemoUserPage() {
    const activeTheme = DEFAULT_THEMES.dark as ProfileTheme;
    
    return (
        <div 
            className="min-h-screen text-white"
            style={{
                backgroundColor: activeTheme.background_value,
                color: activeTheme.text_color,
            }}
        >
            <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-8"
                >
                    {/* Demo Badge */}
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/20 border border-orange-500/30 rounded-full mb-6">
                        <span className="text-orange-400 text-sm font-medium">Demo Profile</span>
                        <span className="text-orange-400/60 text-xs">All widgets showcase</span>
                    </div>
                    
                    {/* Avatar */}
                    <div className="mb-4">
                        <div 
                            className="w-28 h-28 sm:w-32 sm:h-32 rounded-full mx-auto flex items-center justify-center text-5xl sm:text-6xl font-bold border-4 shadow-2xl"
                            style={{ 
                                background: `linear-gradient(135deg, ${activeTheme.accent_color}, ${activeTheme.secondary_color || activeTheme.accent_color})`,
                                borderColor: activeTheme.accent_color + '40',
                            }}
                        >
                            🍊
                        </div>
                    </div>

                    {/* Name */}
                    <h1 className="text-2xl sm:text-3xl font-bold mb-1">
                        Demo User
                    </h1>

                    {/* Username */}
                    <p className="text-sm mb-2 flex items-center justify-center gap-1.5" style={{ color: activeTheme.text_color + 'aa' }}>
                        <span>@demo</span>
                    </p>

                    {/* Bio */}
                    <p 
                        className="text-sm sm:text-base max-w-md mx-auto mt-3 leading-relaxed"
                        style={{ color: activeTheme.text_color + 'cc' }}
                    >
                        This demo profile showcases all available Spritz profile widgets. 
                        Click around to see them in action!
                    </p>
                    
                    {/* Widget count */}
                    <div className="mt-4 flex items-center justify-center gap-4 text-sm">
                        <div className="px-3 py-1 bg-zinc-800/50 rounded-full">
                            <span className="text-zinc-400">{DEMO_WIDGETS.length} widgets</span>
                        </div>
                        <Link 
                            href="/user/demo/edit"
                            className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded-full hover:bg-orange-500/30 transition-colors"
                        >
                            Try the editor →
                        </Link>
                    </div>
                </motion.div>

                {/* Widgets */}
                <ProfileWidgetRenderer widgets={DEMO_WIDGETS} />

                {/* Footer */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-center mt-12 pt-8 border-t border-zinc-800"
                >
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-orange-500 hover:bg-orange-600 text-white transition-colors text-sm font-medium"
                    >
                        Create your own Spritz profile
                    </Link>
                </motion.div>
            </div>
        </div>
    );
}
