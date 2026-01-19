"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { ProfileWidgetRenderer } from "@/components/profile/ProfileWidgetRenderer";
import { BaseWidget, ProfileTheme } from "@/components/profile/ProfileWidgetTypes";

// Elon Musk demo profile with curated widgets
const ELON_WIDGETS: BaseWidget[] = [
    // Row 1: Hero - Message + Social (X)
    {
        id: "em-message",
        widget_type: "message_me",
        config: {
            address: "0xElonMuskOfficial",
            title: "Let's build the future",
            subtitle: "DM me your ideas",
        },
        size: "2x1",
        position: 0,
        is_visible: true,
    },
    {
        id: "em-social-x",
        widget_type: "social_link",
        config: {
            platform: "x",
            handle: "@elonmusk",
            url: "https://x.com/elonmusk",
        },
        size: "1x1",
        position: 1,
        is_visible: true,
    },
    {
        id: "em-availability",
        widget_type: "availability_status",
        config: {
            status: "busy",
            message: "Building rockets 🚀",
            showCalendarLink: false,
        },
        size: "1x1",
        position: 2,
        is_visible: true,
    },
    
    // Row 2: Stats + Currently Building
    {
        id: "em-stats",
        widget_type: "stats",
        config: {
            stats: [
                { label: "Companies", value: "6", emoji: "🏢" },
                { label: "Rockets Landed", value: "287", emoji: "🚀" },
                { label: "X Posts", value: "42K", emoji: "𝕏" },
            ],
            layout: "row",
        },
        size: "2x1",
        position: 3,
        is_visible: true,
    },
    {
        id: "em-currently",
        widget_type: "currently",
        config: {
            type: "building",
            title: "Starship",
            subtitle: "Making life multiplanetary",
            imageUrl: "https://www.spacex.com/static/images/starship/STARSHIP_RENDER_STACKED.webp",
        },
        size: "2x1",
        position: 4,
        is_visible: true,
    },
    
    // Row 3: Quote + Countdown to Mars
    {
        id: "em-quote",
        widget_type: "text",
        config: {
            text: "When something is important enough, you do it even if the odds are not in your favor.",
            style: "quote",
            alignment: "center",
            fontSize: "lg",
        },
        size: "2x2",
        position: 5,
        is_visible: true,
    },
    {
        id: "em-countdown",
        widget_type: "countdown",
        config: {
            targetDate: "2029-01-01T00:00:00Z",
            label: "Mars Mission",
            emoji: "🔴",
        },
        size: "2x1",
        position: 6,
        is_visible: true,
    },
    {
        id: "em-clock",
        widget_type: "clock",
        config: {
            timezone: "America/Los_Angeles",
            label: "Texas Time",
            format: "12h",
        },
        size: "1x1",
        position: 7,
        is_visible: true,
    },
    {
        id: "em-weather",
        widget_type: "weather",
        config: {
            city: "Austin",
            country: "US",
            units: "fahrenheit",
        },
        size: "1x1",
        position: 8,
        is_visible: true,
    },
    
    // Row 4: Tech Stack + Poll
    {
        id: "em-tech",
        widget_type: "tech_stack",
        config: {
            label: "Ventures",
            technologies: [
                { name: "Tesla", icon: "🚗" },
                { name: "SpaceX", icon: "🚀" },
                { name: "X", icon: "𝕏" },
                { name: "Neuralink", icon: "🧠" },
                { name: "Boring Co", icon: "🕳️" },
                { name: "xAI", icon: "🤖" },
            ],
        },
        size: "2x2",
        position: 9,
        is_visible: true,
    },
    {
        id: "em-poll",
        widget_type: "poll",
        config: {
            question: "Which company excites you most?",
            options: [
                { id: "1", text: "SpaceX", votes: 8234 },
                { id: "2", text: "Tesla", votes: 6521 },
                { id: "3", text: "Neuralink", votes: 4892 },
                { id: "4", text: "xAI", votes: 7156 },
            ],
            allowMultiple: false,
        },
        size: "2x2",
        position: 10,
        is_visible: true,
    },
    
    // Row 5: Goals + Fun Counters
    {
        id: "em-goals",
        widget_type: "goals_checklist",
        config: {
            title: "Mission Objectives",
            goals: [
                { id: "1", text: "Land humans on Mars", completed: false, emoji: "🔴" },
                { id: "2", text: "Full Self-Driving achieved", completed: false, emoji: "🚗" },
                { id: "3", text: "Acquire Twitter", completed: true, emoji: "𝕏" },
                { id: "4", text: "Starship orbital flight", completed: true, emoji: "🚀" },
                { id: "5", text: "Neuralink human trial", completed: true, emoji: "🧠" },
            ],
            showProgress: true,
        },
        size: "2x2",
        position: 11,
        is_visible: true,
    },
    {
        id: "em-rockets",
        widget_type: "fun_counter",
        config: {
            label: "Rockets Launched",
            count: 287,
            emoji: "🚀",
            unit: "missions",
            incrementable: true,
        },
        size: "1x1",
        position: 12,
        is_visible: true,
    },
    {
        id: "em-streak",
        widget_type: "streak_counter",
        config: {
            label: "Days Posting",
            currentStreak: 1337,
            longestStreak: 1337,
            emoji: "𝕏",
        },
        size: "1x1",
        position: 13,
        is_visible: true,
    },
    
    // Row 6: Map (Starbase) + Random Facts
    {
        id: "em-map",
        widget_type: "map",
        config: {
            location: "Starbase, Texas",
            latitude: 25.9970,
            longitude: -97.1553,
            zoom: 13,
            label: "Starbase HQ",
        },
        size: "2x2",
        position: 14,
        is_visible: true,
    },
    {
        id: "em-facts",
        widget_type: "random_fact",
        config: {
            facts: [
                "I taught myself to code at age 12",
                "I sold my first game, Blastar, for $500",
                "I've worked 100+ hour weeks for years",
                "My favorite anime is Neon Genesis Evangelion",
                "I named my AI company after the answer to everything: xAI",
            ],
            category: "about_me",
        },
        size: "2x1",
        position: 15,
        is_visible: true,
    },
    {
        id: "em-fortune",
        widget_type: "fortune_cookie",
        config: {
            fortunes: [
                "The future is electric ⚡",
                "Mars awaits 🔴",
                "Persistence is key 🔑",
                "Think big, start small, scale fast 📈",
                "The best part is no part 🔧",
            ],
            category: "custom",
        },
        size: "2x1",
        position: 16,
        is_visible: true,
    },
    
    // Row 7: Reactions + Zodiac
    {
        id: "em-reactions",
        widget_type: "reaction_wall",
        config: {
            emojis: ["🚀", "⚡", "🔴", "🧠", "𝕏"],
            reactions: { "🚀": 45234, "⚡": 38921, "🔴": 29156, "🧠": 21543, "𝕏": 52891 },
        },
        size: "2x1",
        position: 17,
        is_visible: true,
    },
    {
        id: "em-zodiac",
        widget_type: "zodiac",
        config: {
            sign: "cancer",
            showTraits: true,
        },
        size: "1x1",
        position: 18,
        is_visible: true,
    },
    {
        id: "em-pet",
        widget_type: "pet",
        config: {
            petType: "dog",
            name: "Floki",
            mood: "playful",
            color: "#fbbf24",
        },
        size: "1x1",
        position: 19,
        is_visible: true,
    },
    
    // Row 8: Guestbook + Visitor Counter
    {
        id: "em-guestbook",
        widget_type: "guestbook",
        config: {
            title: "Leave your mark 📝",
            messages: [
                { id: "1", author: "SpaceEnthusiast", content: "Take us to Mars! 🚀", timestamp: new Date(Date.now() - 1800000).toISOString() },
                { id: "2", author: "TeslaOwner", content: "FSD is amazing! Thank you!", timestamp: new Date(Date.now() - 7200000).toISOString() },
                { id: "3", author: "AIResearcher", content: "xAI is the future of AI safety", timestamp: new Date(Date.now() - 86400000).toISOString() },
            ],
            maxMessages: 5,
        },
        size: "2x2",
        position: 20,
        is_visible: true,
    },
    {
        id: "em-visitors",
        widget_type: "visitor_counter",
        config: {
            count: 42069420,
            label: "Profile Visitors",
            style: "retro",
        },
        size: "2x1",
        position: 21,
        is_visible: true,
    },
];

// Custom theme for Elon - dark space theme with electric blue accents
const ELON_THEME: ProfileTheme = {
    background_type: 'gradient',
    background_value: 'linear-gradient(135deg, #0a0a0f 0%, #0d1117 25%, #161b22 50%, #0d1117 75%, #0a0a0f 100%)',
    accent_color: '#3B82F6',
    secondary_color: '#10B981',
    text_color: '#ffffff',
    card_style: 'rounded',
    card_background: 'rgba(22, 27, 34, 0.8)',
    card_border: 'rgba(59, 130, 246, 0.2)',
    font_family: 'mono',
    show_spritz_badge: true,
};

export default function ElonMuskDemoPage() {
    return (
        <div 
            className="min-h-screen text-white"
            style={{
                background: ELON_THEME.background_value,
                color: ELON_THEME.text_color,
            }}
        >
            {/* Starfield overlay effect */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-10 left-20 w-1 h-1 bg-blue-400 rounded-full animate-pulse opacity-40" />
                <div className="absolute top-32 right-32 w-0.5 h-0.5 bg-white rounded-full animate-pulse opacity-30" style={{ animationDelay: '0.3s' }} />
                <div className="absolute top-48 left-1/3 w-1 h-1 bg-blue-300 rounded-full animate-pulse opacity-35" style={{ animationDelay: '0.6s' }} />
                <div className="absolute top-72 right-1/4 w-0.5 h-0.5 bg-emerald-400 rounded-full animate-pulse opacity-40" style={{ animationDelay: '0.9s' }} />
                <div className="absolute bottom-60 left-1/4 w-1 h-1 bg-white rounded-full animate-pulse opacity-25" style={{ animationDelay: '1.2s' }} />
                <div className="absolute bottom-32 right-1/3 w-0.5 h-0.5 bg-blue-400 rounded-full animate-pulse opacity-35" style={{ animationDelay: '1.5s' }} />
                <div className="absolute bottom-48 left-10 w-1 h-1 bg-emerald-300 rounded-full animate-pulse opacity-30" style={{ animationDelay: '1.8s' }} />
            </div>

            {/* Sticky Header */}
            <div className="sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
                <div className="bg-zinc-950/70 backdrop-blur-xl border-b border-blue-500/20">
                    <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
                        <Link
                            href="/"
                            className="flex items-center gap-2 text-blue-400 hover:text-white transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            <span className="text-sm font-medium font-mono">Spritz</span>
                        </Link>
                        
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 border border-blue-500/30 rounded-full">
                            <span className="text-blue-300 text-xs font-medium font-mono">🚀 Demo Profile</span>
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
                            <div className="w-36 h-36 sm:w-40 sm:h-40 rounded-full bg-gradient-to-r from-blue-500 via-emerald-500 to-blue-500 opacity-40 blur-xl animate-pulse" />
                        </div>
                        <img
                            src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Elon_Musk_Royal_Society_%28crop2%29.jpg/440px-Elon_Musk_Royal_Society_%28crop2%29.jpg"
                            alt="Elon Musk"
                            className="w-28 h-28 sm:w-32 sm:h-32 rounded-full mx-auto border-4 shadow-2xl relative z-10 object-cover bg-zinc-800"
                            style={{ borderColor: 'rgba(59, 130, 246, 0.4)' }}
                        />
                    </div>

                    {/* Name */}
                    <h1 className="text-2xl sm:text-3xl font-bold mb-1 font-mono">
                        <span className="bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-400 bg-clip-text text-transparent">
                            Elon Musk
                        </span>
                    </h1>

                    {/* Username */}
                    <p className="text-sm mb-2 flex items-center justify-center gap-1.5 text-blue-300 font-mono">
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                            ✓ Verified
                        </span>
                        <span>@elonmusk</span>
                    </p>

                    {/* Bio */}
                    <p className="text-sm sm:text-base max-w-md mx-auto mt-3 leading-relaxed text-zinc-400 font-mono">
                        CEO of Tesla, SpaceX, X & xAI. 
                        Making life multiplanetary 🚀
                    </p>
                    
                    {/* Widget count */}
                    <div className="mt-4 flex items-center justify-center gap-4 text-sm font-mono">
                        <div className="px-3 py-1 bg-blue-500/20 rounded-full">
                            <span className="text-blue-300">{ELON_WIDGETS.length} widgets</span>
                        </div>
                    </div>
                </motion.div>

                {/* Widgets */}
                <ProfileWidgetRenderer widgets={ELON_WIDGETS} />

                {/* Footer */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-center mt-12 pt-8 border-t border-blue-500/20"
                >
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-700 hover:to-emerald-700 text-white transition-all text-sm font-medium font-mono shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40"
                    >
                        🚀 Create your own Spritz profile
                    </Link>
                </motion.div>
            </div>
        </div>
    );
}
