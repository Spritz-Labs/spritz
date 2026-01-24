"use client";

import { useState, useEffect, use } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { useAuth } from "@/context/AuthProvider";

type ChannelInfo = {
    id: string;
    name: string;
    description: string | null;
    emoji: string;
    category: string;
    is_official: boolean;
    member_count: number;
    message_count: number;
    created_at: string;
};

export default function ChannelInvitePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { user, isLoading: authLoading, isAuthenticated } = useAuth();
    const userAddress = user?.walletAddress || null;
    const [channel, setChannel] = useState<ChannelInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [joining, setJoining] = useState(false);
    const [joined, setJoined] = useState(false);

    useEffect(() => {
        fetchChannel();
    }, [id]);

    // Auto-join if logged in and we have the channel
    useEffect(() => {
        if (channel && userAddress && !joining && !joined) {
            handleJoin();
        }
    }, [channel, userAddress]);

    const fetchChannel = async () => {
        try {
            const res = await fetch(`/api/public/channels/${id}`);
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Channel not found");
                return;
            }

            setChannel(data.channel);
        } catch {
            setError("Failed to load channel");
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async () => {
        if (!userAddress || joining) return;

        setJoining(true);
        try {
            const res = await fetch(`/api/channels/${id}/join`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userAddress }),
            });

            const data = await res.json();

            if (res.ok || data.error === "Already a member of this channel") {
                setJoined(true);
                // Store that we should open this channel after redirect
                localStorage.setItem("spritz_open_channel", id);
                // Redirect to dashboard
                window.location.href = "/";
            } else {
                throw new Error(data.error || "Failed to join channel");
            }
        } catch (err) {
            console.error("Error joining channel:", err);
            setError(err instanceof Error ? err.message : "Failed to join channel");
        } finally {
            setJoining(false);
        }
    };

    const handleLoginAndJoin = () => {
        // Store pending channel join
        localStorage.setItem("spritz_pending_channel_join", id);
        // Redirect to main page for login
        window.location.href = "/";
    };

    if (loading || authLoading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !channel) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-zinc-800 flex items-center justify-center text-4xl">
                        💬
                    </div>
                    <h1 className="text-xl font-bold text-white mb-2">Channel Not Found</h1>
                    <p className="text-zinc-500 mb-6">{error || "This channel doesn't exist or has been removed."}</p>
                    <Link 
                        href="/" 
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all"
                    >
                        Go to Spritz →
                    </Link>
                </div>
            </div>
        );
    }

    // If logged in and joining
    if (userAddress && (joining || joined)) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-8 h-8 mx-auto border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-white">Joining channel...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-[128px]" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-[128px]" />
            </div>

            <div className="relative z-10 max-w-lg mx-auto px-4 py-16">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center"
                >
                    {/* Logo */}
                    <div className="mb-8">
                        <Link href="/" className="inline-block text-3xl font-bold bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
                            Spritz
                        </Link>
                    </div>

                    {/* Channel Card */}
                    <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8">
                        {/* Channel Icon */}
                        <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-5xl shadow-lg">
                            {channel.emoji}
                        </div>

                        {/* Channel Name */}
                        <div className="flex items-center justify-center gap-2 mb-2">
                            <h1 className="text-2xl font-bold text-white">
                                # {channel.name}
                            </h1>
                            {channel.is_official && (
                                <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs font-medium rounded-full">
                                    Official
                                </span>
                            )}
                        </div>

                        {/* Description */}
                        {channel.description && (
                            <p className="text-zinc-400 mb-6 leading-relaxed">
                                {channel.description}
                            </p>
                        )}

                        {/* Stats */}
                        <div className="flex items-center justify-center gap-6 mb-8 text-sm">
                            <div className="flex items-center gap-2 text-zinc-400">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>{channel.member_count.toLocaleString()} members</span>
                            </div>
                            <div className="flex items-center gap-2 text-zinc-400">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                                <span>{channel.message_count.toLocaleString()} messages</span>
                            </div>
                        </div>

                        {/* Category Badge */}
                        <div className="mb-8">
                            <span className="inline-flex items-center px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 text-sm capitalize">
                                {channel.category}
                            </span>
                        </div>

                        {/* Join Button */}
                        {userAddress ? (
                            <button
                                onClick={handleJoin}
                                disabled={joining}
                                className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-lg font-semibold hover:shadow-lg hover:shadow-orange-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {joining ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Joining...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                        </svg>
                                        Join Channel
                                    </>
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={handleLoginAndJoin}
                                className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-lg font-semibold hover:shadow-lg hover:shadow-orange-500/25 transition-all flex items-center justify-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                                </svg>
                                Sign in to Join
                            </button>
                        )}

                        {!userAddress && (
                            <p className="text-zinc-500 text-sm mt-4">
                                Create a free Spritz account to join this channel
                            </p>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="mt-8">
                        <Link 
                            href="/" 
                            className="text-zinc-500 hover:text-white text-sm transition-colors"
                        >
                            Powered by <span className="text-orange-400 font-semibold">Spritz</span>
                        </Link>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
