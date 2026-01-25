"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChannels } from "@/hooks/useChannels";
import type { PublicChannel } from "@/app/api/channels/route";
import { ChannelIcon } from "./ChannelIcon";

type BrowseChannelsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string;
    onJoinChannel: (channel: PublicChannel) => void;
    initialShowCreate?: boolean; // Auto-open the create form
};

const CATEGORIES = [
    { id: "all", name: "All", emoji: "🌐" },
    // Location
    { id: "cities", name: "Cities", emoji: "🏙️" },
    { id: "events", name: "Events", emoji: "🎉" },
    // Tech & Web3
    { id: "crypto", name: "Crypto", emoji: "₿" },
    { id: "nfts", name: "NFTs", emoji: "🖼️" },
    { id: "defi", name: "DeFi", emoji: "🏦" },
    { id: "daos", name: "DAOs", emoji: "🗳️" },
    { id: "tech", name: "Tech", emoji: "💻" },
    { id: "dev", name: "Developers", emoji: "👨‍💻" },
    { id: "ai", name: "AI", emoji: "🤖" },
    // Entertainment
    { id: "gaming", name: "Gaming", emoji: "🎮" },
    { id: "sports", name: "Sports", emoji: "⚽" },
    { id: "music", name: "Music", emoji: "🎵" },
    { id: "art", name: "Art", emoji: "🎨" },
    { id: "entertainment", name: "Entertainment", emoji: "🎬" },
    { id: "memes", name: "Memes", emoji: "😂" },
    // Learning & Growth
    { id: "finance", name: "Finance", emoji: "📈" },
    { id: "science", name: "Science", emoji: "🔬" },
    { id: "education", name: "Education", emoji: "📚" },
    { id: "languages", name: "Languages", emoji: "🗣️" },
    { id: "careers", name: "Careers", emoji: "💼" },
    // Lifestyle
    { id: "lifestyle", name: "Lifestyle", emoji: "🌟" },
    { id: "food", name: "Food", emoji: "🍕" },
    { id: "travel", name: "Travel", emoji: "✈️" },
    { id: "fitness", name: "Fitness", emoji: "💪" },
    { id: "health", name: "Health", emoji: "❤️‍🩹" },
    // Social
    { id: "community", name: "Community", emoji: "👥" },
    { id: "politics", name: "Politics", emoji: "🏛️" },
    { id: "support", name: "Support", emoji: "🤝" },
    { id: "random", name: "Random", emoji: "🎲" },
    { id: "other", name: "Other", emoji: "💬" },
];

export function BrowseChannelsModal({
    isOpen,
    onClose,
    userAddress,
    onJoinChannel,
    initialShowCreate = false,
}: BrowseChannelsModalProps) {
    const { channels, isLoading, joinChannel, leaveChannel, createChannel } =
        useChannels(userAddress);
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [joiningChannel, setJoiningChannel] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(initialShowCreate);
    
    // Reset showCreateModal when the modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setShowCreateModal(initialShowCreate);
        }
    }, [isOpen, initialShowCreate]);
    const [newChannel, setNewChannel] = useState({
        name: "",
        description: "",
        emoji: "💬",
        category: "other",
        messagingType: "standard" as "standard" | "waku",
    });
    const [createError, setCreateError] = useState<string | null>(null);

    const filteredChannels = channels.filter((channel) => {
        const matchesCategory =
            selectedCategory === "all" || channel.category === selectedCategory;
        const matchesSearch =
            searchQuery === "" ||
            channel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            channel.description?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const handleJoin = async (channel: PublicChannel) => {
        setJoiningChannel(channel.id);
        const success = await joinChannel(channel.id);
        setJoiningChannel(null);
        if (success) {
            onJoinChannel(channel);
        }
    };

    const handleLeave = async (channelId: string) => {
        setJoiningChannel(channelId);
        await leaveChannel(channelId);
        setJoiningChannel(null);
    };

    const handleCreateChannel = async () => {
        if (!newChannel.name.trim()) {
            setCreateError("Channel name is required");
            return;
        }

        try {
            setCreateError(null);
            const channel = await createChannel({
                name: newChannel.name.trim(),
                description: newChannel.description.trim() || undefined,
                emoji: newChannel.emoji,
                category: newChannel.category,
                messagingType: newChannel.messagingType,
            });

            if (channel) {
                setShowCreateModal(false);
                setNewChannel({ name: "", description: "", emoji: "💬", category: "community", messagingType: "standard" });
                onJoinChannel(channel);
            }
        } catch (e) {
            setCreateError(e instanceof Error ? e.message : "Failed to create channel");
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="p-4 sm:p-6 border-b border-zinc-800">
                        <div className="flex items-center justify-between mb-3 sm:mb-4">
                            <h2 className="text-lg sm:text-xl font-bold text-white">Browse Channels</h2>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowCreateModal(true)}
                                    className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-[#FF5500] to-[#FF7700] rounded-xl text-white text-sm font-medium hover:shadow-lg hover:shadow-orange-500/25 transition-all flex items-center gap-1.5"
                                >
                                    <span>+</span>
                                    <span className="hidden sm:inline">Create</span>
                                </button>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
                                >
                                    <svg
                                        className="w-5 h-5 text-zinc-400"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M6 18L18 6M6 6l12 12"
                                        />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Search */}
                        <div className="relative mb-3 sm:mb-4">
                            <input
                                type="text"
                                placeholder="Search channels..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-4 py-2.5 sm:py-3 pl-10 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#FF5500] text-sm sm:text-base"
                            />
                            <svg
                                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                />
                            </svg>
                        </div>

                        {/* Categories */}
                        <div className="flex flex-wrap gap-1.5 sm:gap-2">
                            {CATEGORIES.map((cat) => (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                                        selectedCategory === cat.id
                                            ? "bg-[#FF5500] text-white"
                                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                    }`}
                                >
                                    {cat.emoji} <span className="hidden sm:inline">{cat.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Channel List */}
                    <div className="p-4 overflow-y-auto max-h-[50vh]">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-orange-500" />
                            </div>
                        ) : filteredChannels.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-zinc-500">No channels found</p>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {filteredChannels.map((channel) => (
                                    <motion.div
                                        key={channel.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="p-3 sm:p-4 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors"
                                    >
                                        <div className="flex items-start gap-3">
                                            <ChannelIcon
                                                emoji={channel.emoji}
                                                iconUrl={channel.icon_url}
                                                name={channel.name}
                                                size="md"
                                                className="flex-shrink-0"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-white font-medium truncate">
                                                        {channel.name}
                                                    </p>
                                                    {channel.is_official && (
                                                        <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-[10px] sm:text-xs rounded">
                                                            Official
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-zinc-500 text-xs sm:text-sm line-clamp-1">
                                                    {channel.description || "No description"}
                                                </p>
                                                <p className="text-zinc-600 text-[10px] sm:text-xs mt-0.5">
                                                    {channel.member_count} members • {channel.message_count} msgs
                                                </p>
                                            </div>
                                            <button
                                                onClick={() =>
                                                    channel.is_member
                                                        ? handleLeave(channel.id)
                                                        : handleJoin(channel)
                                                }
                                                disabled={joiningChannel === channel.id}
                                                className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 flex-shrink-0 ${
                                                    channel.is_member
                                                        ? "bg-zinc-700 text-zinc-300 hover:bg-red-500/20 hover:text-red-400"
                                                        : "bg-[#FF5500] text-white hover:bg-[#FF6600]"
                                                }`}
                                            >
                                                {joiningChannel === channel.id ? (
                                                    <span className="animate-pulse">...</span>
                                                ) : channel.is_member ? (
                                                    "Leave"
                                                ) : (
                                                    "Join"
                                                )}
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Create Channel Modal */}
                <AnimatePresence>
                    {showCreateModal && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/50 flex items-center justify-center z-60"
                            onClick={() => setShowCreateModal(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.95, y: 20 }}
                                className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md mx-4"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3 className="text-lg font-bold text-white mb-4">Create Channel</h3>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">
                                            Channel Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={newChannel.name}
                                            onChange={(e) =>
                                                setNewChannel({ ...newChannel, name: e.target.value })
                                            }
                                            placeholder="My Awesome Channel"
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                                            maxLength={50}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">
                                            Description
                                        </label>
                                        <textarea
                                            value={newChannel.description}
                                            onChange={(e) =>
                                                setNewChannel({ ...newChannel, description: e.target.value })
                                            }
                                            placeholder="What's this channel about?"
                                            className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500 resize-none"
                                            rows={2}
                                            maxLength={200}
                                        />
                                    </div>

                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <label className="block text-sm text-zinc-400 mb-1">
                                                Emoji
                                            </label>
                                            <input
                                                type="text"
                                                value={newChannel.emoji}
                                                onChange={(e) =>
                                                    setNewChannel({ ...newChannel, emoji: e.target.value })
                                                }
                                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-center text-xl focus:outline-none focus:border-orange-500"
                                                maxLength={2}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-sm text-zinc-400 mb-1">
                                                Category
                                            </label>
                                            <select
                                                value={newChannel.category}
                                                onChange={(e) =>
                                                    setNewChannel({ ...newChannel, category: e.target.value })
                                                }
                                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                                            >
                                                <option value="community">Community</option>
                                                <option value="crypto">Crypto</option>
                                                <option value="tech">Tech</option>
                                                <option value="finance">Finance</option>
                                                <option value="science">Science</option>
                                                <option value="lifestyle">Lifestyle</option>
                                                <option value="entertainment">Entertainment</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Messaging Type Selection */}
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-2">
                                            Messaging Type
                                        </label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setNewChannel({ ...newChannel, messagingType: "standard" })}
                                                className={`p-3 rounded-xl border-2 transition-all text-left ${
                                                    newChannel.messagingType === "standard"
                                                        ? "border-[#FF5500] bg-[#FF5500]/10"
                                                        : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-lg">☁️</span>
                                                    <span className="text-white font-medium text-sm">Standard</span>
                                                </div>
                                                <p className="text-zinc-500 text-xs">
                                                    Fast & reliable cloud storage
                                                </p>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNewChannel({ ...newChannel, messagingType: "waku" })}
                                                className={`p-3 rounded-xl border-2 transition-all text-left ${
                                                    newChannel.messagingType === "waku"
                                                        ? "border-purple-500 bg-purple-500/10"
                                                        : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-lg">🌐</span>
                                                    <span className="text-white font-medium text-sm">Decentralized</span>
                                                </div>
                                                <p className="text-zinc-500 text-xs">
                                                    Censorship-resistant messaging
                                                </p>
                                            </button>
                                        </div>
                                        {newChannel.messagingType === "waku" && (
                                            <p className="text-purple-400 text-xs mt-2 flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                                </svg>
                                                Messages are stored on a decentralized network
                                            </p>
                                        )}
                                    </div>

                                    {createError && (
                                        <p className="text-red-400 text-sm">{createError}</p>
                                    )}

                                    <div className="flex gap-3 pt-2">
                                        <button
                                            onClick={() => setShowCreateModal(false)}
                                            className="flex-1 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleCreateChannel}
                                            className="flex-1 py-2 bg-[#FF5500] text-white rounded-lg hover:bg-[#FF6600] transition-colors"
                                        >
                                            Create
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </AnimatePresence>
    );
}

