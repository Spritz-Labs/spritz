"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    useDiscoverAgents,
    useFavoriteAgents,
    DiscoveredAgent,
} from "@/hooks/useAgents";
import { AgentAvatar } from "./AgentAvatar";

interface ExploreAgentsModalProps {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string;
    onSelectAgent: (agent: DiscoveredAgent) => void;
}

export function ExploreAgentsModal({
    isOpen,
    onClose,
    userAddress,
    onSelectAgent,
}: ExploreAgentsModalProps) {
    const { agents, isLoading, error, filter, setFilter, search, setSearch } =
        useDiscoverAgents(isOpen ? userAddress : null);

    const { isFavorite, toggleFavorite } = useFavoriteAgents(userAddress);

    const [searchInput, setSearchInput] = useState("");
    const [togglingFavorite, setTogglingFavorite] = useState<string | null>(
        null
    );

    const handleToggleFavorite = async (
        e: React.MouseEvent,
        agentId: string
    ) => {
        e.stopPropagation();
        setTogglingFavorite(agentId);
        try {
            await toggleFavorite(agentId);
        } catch (err) {
            console.error("Failed to toggle favorite:", err);
        } finally {
            setTogglingFavorite(null);
        }
    };

    const handleSearch = () => {
        setSearch(searchInput);
    };

    // Live debounced search (250ms)
    useEffect(() => {
        const t = setTimeout(() => setSearch(searchInput), 250);
        return () => clearTimeout(t);
    }, [searchInput, setSearch]);

    const formatOwnerName = (agent: DiscoveredAgent) => {
        if (agent.owner.username) return `@${agent.owner.username}`;
        if (agent.owner.ensName) return agent.owner.ensName;
        return `${agent.owner_address.slice(
            0,
            6
        )}...${agent.owner_address.slice(-4)}`;
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="bg-zinc-900 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-zinc-800 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-zinc-800">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-xl">
                                        🔍
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-white">
                                            Explore Agents
                                        </h2>
                                        <p className="text-sm text-zinc-400">
                                            Discover AI agents from the
                                            community
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                                >
                                    <svg
                                        className="w-5 h-5"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
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

                            {/* Search - live debounced; Enter submits immediately */}
                            <div className="flex gap-2 mb-4">
                                <input
                                    type="text"
                                    value={searchInput}
                                    onChange={(e) =>
                                        setSearchInput(e.target.value)
                                    }
                                    onKeyDown={(e) =>
                                        e.key === "Enter" && handleSearch()
                                    }
                                    placeholder="Search agents..."
                                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                                />
                                <button
                                    type="button"
                                    onClick={handleSearch}
                                    className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl transition-colors shrink-0"
                                >
                                    Search
                                </button>
                            </div>

                            {/* Filter Tabs */}
                            <div className="flex gap-2 flex-wrap">
                                {[
                                    { key: "all", label: "All", icon: "🌐" },
                                    {
                                        key: "official",
                                        label: "Official",
                                        icon: "⭐",
                                    },
                                    {
                                        key: "friends",
                                        label: "Friends",
                                        icon: "👥",
                                    },
                                    {
                                        key: "public",
                                        label: "Public",
                                        icon: "🌍",
                                    },
                                ].map((tab) => (
                                    <button
                                        key={tab.key}
                                        onClick={() =>
                                            setFilter(tab.key as typeof filter)
                                        }
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                                            filter === tab.key
                                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                                                : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                                        }`}
                                    >
                                        <span>{tab.icon}</span>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <svg
                                        className="animate-spin w-6 h-6 text-emerald-400"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                    >
                                        <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                        />
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                        />
                                    </svg>
                                </div>
                            ) : error ? (
                                <div className="text-center py-12">
                                    <p className="text-red-400">{error}</p>
                                </div>
                            ) : agents.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-800 flex items-center justify-center">
                                        <span className="text-3xl">🤖</span>
                                    </div>
                                    <h3 className="text-white font-medium mb-1">
                                        No agents found
                                    </h3>
                                    <p className="text-sm text-zinc-400">
                                        {filter === "friends"
                                            ? "Your friends haven't shared any agents yet"
                                            : search
                                            ? "Try a different search term"
                                            : "Be the first to create a public agent!"}
                                    </p>
                                </div>
                            ) : (
                                <div className="grid gap-3">
                                    {agents.map((agent) => (
                                        <motion.div
                                            key={agent.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            onClick={() => onSelectAgent(agent)}
                                            className="w-full p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-xl hover:border-emerald-500/50 hover:bg-zinc-800 transition-all text-left group cursor-pointer"
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) =>
                                                e.key === "Enter" &&
                                                onSelectAgent(agent)
                                            }
                                        >
                                            <div className="flex items-start gap-4">
                                                <AgentAvatar
                                                    avatarUrl={agent.avatar_url}
                                                    avatarEmoji={agent.avatar_emoji}
                                                    name={agent.name}
                                                    size="lg"
                                                    className="group-hover:scale-110 transition-transform ring-1 ring-purple-500/30"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <h4 className="font-semibold text-white truncate">
                                                            {agent.name}
                                                        </h4>
                                                        {agent.visibility ===
                                                            "official" && (
                                                            <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 text-xs rounded-full font-medium">
                                                                ⭐ Official
                                                            </span>
                                                        )}
                                                        {agent.isFriendsAgent && (
                                                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full">
                                                                👥 Friend
                                                            </span>
                                                        )}
                                                        {agent.visibility ===
                                                            "public" &&
                                                            !agent.isFriendsAgent && (
                                                                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">
                                                                    🌍 Public
                                                                </span>
                                                            )}
                                                    </div>
                                                    <p className="text-sm text-zinc-400 line-clamp-2 mb-2">
                                                        {agent.personality ||
                                                            "An AI assistant"}
                                                    </p>
                                                    {/* Tags */}
                                                    {agent.tags &&
                                                        agent.tags.length >
                                                            0 && (
                                                            <div className="flex flex-wrap gap-1 mb-2">
                                                                {agent.tags
                                                                    .slice(0, 5)
                                                                    .map(
                                                                        (
                                                                            tag
                                                                        ) => (
                                                                            <span
                                                                                key={
                                                                                    tag
                                                                                }
                                                                                className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded"
                                                                            >
                                                                                #
                                                                                {
                                                                                    tag
                                                                                }
                                                                            </span>
                                                                        )
                                                                    )}
                                                            </div>
                                                        )}
                                                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                                                        <span>
                                                            by{" "}
                                                            {formatOwnerName(
                                                                agent
                                                            )}
                                                        </span>
                                                        <span>•</span>
                                                        <span>
                                                            {
                                                                agent.message_count
                                                            }{" "}
                                                            messages
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="shrink-0 flex items-center gap-2">
                                                    {/* Favorite button */}
                                                    <button
                                                        onClick={(e) =>
                                                            handleToggleFavorite(
                                                                e,
                                                                agent.id
                                                            )
                                                        }
                                                        disabled={
                                                            togglingFavorite ===
                                                            agent.id
                                                        }
                                                        className={`p-2 rounded-lg transition-all ${
                                                            isFavorite(agent.id)
                                                                ? "text-yellow-400 bg-yellow-500/20"
                                                                : "text-zinc-400 hover:text-yellow-400 hover:bg-yellow-500/10"
                                                        }`}
                                                        title={
                                                            isFavorite(agent.id)
                                                                ? "Remove from favorites"
                                                                : "Add to favorites"
                                                        }
                                                    >
                                                        {togglingFavorite ===
                                                        agent.id ? (
                                                            <svg
                                                                className="w-5 h-5 animate-spin"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                            >
                                                                <circle
                                                                    className="opacity-25"
                                                                    cx="12"
                                                                    cy="12"
                                                                    r="10"
                                                                    stroke="currentColor"
                                                                    strokeWidth="4"
                                                                />
                                                                <path
                                                                    className="opacity-75"
                                                                    fill="currentColor"
                                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                                                />
                                                            </svg>
                                                        ) : (
                                                            <svg
                                                                className="w-5 h-5"
                                                                fill={
                                                                    isFavorite(
                                                                        agent.id
                                                                    )
                                                                        ? "currentColor"
                                                                        : "none"
                                                                }
                                                                stroke="currentColor"
                                                                viewBox="0 0 24 24"
                                                            >
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={
                                                                        2
                                                                    }
                                                                    d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                                                                />
                                                            </svg>
                                                        )}
                                                    </button>
                                                    {/* Chat button - always visible on mobile */}
                                                    <div className="px-3 py-1.5 bg-emerald-500 text-white text-sm font-medium rounded-lg md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                                        Chat
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
                            <p className="text-xs text-zinc-500 text-center">
                                {agents.length} agent
                                {agents.length !== 1 ? "s" : ""} found
                                {search && ` for "${search}"`}
                            </p>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default ExploreAgentsModal;
