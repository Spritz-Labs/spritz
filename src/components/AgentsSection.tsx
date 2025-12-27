"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useAgents, useFavoriteAgents, Agent, DiscoveredAgent } from "@/hooks/useAgents";
import { CreateAgentModal } from "./CreateAgentModal";
import { AgentChatModal } from "./AgentChatModal";
import { EditAgentModal } from "./EditAgentModal";
import { AgentKnowledgeModal } from "./AgentKnowledgeModal";
import { ExploreAgentsModal } from "./ExploreAgentsModal";

interface AgentsSectionProps {
    userAddress: string;
}

export function AgentsSection({ userAddress }: AgentsSectionProps) {
    const { agents, isLoading, error, createAgent, updateAgent, deleteAgent } = useAgents(userAddress);
    const { favorites, removeFavorite } = useFavoriteAgents(userAddress);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
    const [isExploreModalOpen, setIsExploreModalOpen] = useState(false);
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
    const [selectedDiscoveredAgent, setSelectedDiscoveredAgent] = useState<DiscoveredAgent | null>(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);

    const handleCreateAgent = async (
        name: string,
        personality: string,
        emoji: string,
        visibility: "private" | "friends" | "public"
    ) => {
        await createAgent(name, personality, emoji, visibility);
    };

    const handleDeleteAgent = async (agent: Agent) => {
        if (confirm(`Delete "${agent.name}"? This cannot be undone.`)) {
            await deleteAgent(agent.id);
        }
    };

    const handleOpenChat = (agent: Agent) => {
        setSelectedAgent(agent);
        setIsChatOpen(true);
    };

    const handleEditAgent = (agent: Agent) => {
        setSelectedAgent(agent);
        setIsEditModalOpen(true);
    };

    const handleOpenKnowledge = (agent: Agent) => {
        setSelectedAgent(agent);
        setIsKnowledgeModalOpen(true);
    };

    const handleSelectDiscoveredAgent = (agent: DiscoveredAgent) => {
        setSelectedDiscoveredAgent(agent);
        setIsExploreModalOpen(false);
        setIsChatOpen(true);
    };

    const handleRemoveFavorite = async (e: React.MouseEvent, agentId: string) => {
        e.stopPropagation();
        if (confirm("Remove from favorites?")) {
            await removeFavorite(agentId);
        }
    };

    const handleOpenFavoriteChat = (agent: DiscoveredAgent) => {
        setSelectedDiscoveredAgent(agent);
        setIsChatOpen(true);
    };

    const handleSaveAgent = async (agentId: string, updates: {
        name?: string;
        personality?: string;
        avatarEmoji?: string;
        visibility?: "private" | "friends" | "public";
        webSearchEnabled?: boolean;
        useKnowledgeBase?: boolean;
    }) => {
        await updateAgent(agentId, updates);
    };

    return (
        <div>
            {/* Section Header */}
            <div 
                className="flex items-center justify-between mb-3 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <span className="text-purple-400">✨</span>
                        AI Agents
                        <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">
                            Beta
                        </span>
                    </h2>
                    <span className="text-xs text-zinc-500">
                        ({agents.length}/5)
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {/* Explore Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsExploreModalOpen(true);
                        }}
                        className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors"
                        title="Explore Agents"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </button>
                    {/* Create Button */}
                    {agents.length < 5 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsCreateModalOpen(true);
                            }}
                            className="p-1.5 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors"
                            title="Create Agent"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                    )}
                    <motion.svg
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        className="w-5 h-5 text-zinc-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </motion.svg>
                </div>
            </div>

            {/* Content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <svg className="animate-spin w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            </div>
                        ) : error ? (
                            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                                {error}
                            </div>
                        ) : agents.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl text-center"
                            >
                                <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                                    <span className="text-2xl">🤖</span>
                                </div>
                                <h3 className="text-white font-medium mb-1">Create Your First AI Agent</h3>
                                <p className="text-sm text-zinc-400 mb-4">
                                    Build custom AI assistants with unique personalities
                                </p>
                                <button
                                    onClick={() => setIsCreateModalOpen(true)}
                                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium rounded-xl transition-all"
                                >
                                    Create Agent
                                </button>
                            </motion.div>
                        ) : (
                            <div className="space-y-2">
                                {/* User's own agents */}
                                {agents.map((agent) => (
                                    <motion.div
                                        key={agent.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="group p-3 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 hover:border-zinc-600 rounded-xl transition-all cursor-pointer"
                                        onClick={() => handleOpenChat(agent)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center text-xl shrink-0">
                                                {agent.avatar_emoji}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-medium text-white truncate">{agent.name}</h3>
                                                    {agent.visibility !== "private" && (
                                                        <span className="text-xs px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-400">
                                                            {agent.visibility === "friends" ? "👥" : "🌍"}
                                                        </span>
                                                    )}
                                                    {agent.x402_enabled && (
                                                        <span className="text-xs px-1.5 py-0.5 bg-emerald-500/20 rounded text-emerald-400 font-medium" title={`x402 API: $${((agent.x402_price_cents || 1) / 100).toFixed(2)}/msg`}>
                                                            💰
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-zinc-500 truncate">
                                                    {agent.personality || "AI Assistant"}
                                                </p>
                                            </div>
                                            {/* Action buttons - always visible on mobile, hover on desktop */}
                                            <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenChat(agent);
                                                    }}
                                                    className="p-2 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors"
                                                    title="Chat"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenKnowledge(agent);
                                                    }}
                                                    className="p-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-lg transition-colors"
                                                    title="Knowledge Base"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleEditAgent(agent);
                                                    }}
                                                    className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors"
                                                    title="Edit"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteAgent(agent);
                                                    }}
                                                    className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                                                    title="Delete"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                        {/* Stats */}
                                        <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
                                            <span>{agent.message_count} messages</span>
                                            <span>•</span>
                                            <span>Created {new Date(agent.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </motion.div>
                                ))}

                                {/* Favorite agents from others */}
                                {favorites.length > 0 && (
                                    <>
                                        <div className="flex items-center gap-2 mt-4 mb-2">
                                            <span className="text-yellow-400">⭐</span>
                                            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Favorites</span>
                                        </div>
                                        {favorites.map((fav) => (
                                            <motion.div
                                                key={fav.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="group p-3 bg-zinc-800/30 hover:bg-zinc-800/50 border border-yellow-500/20 hover:border-yellow-500/40 rounded-xl transition-all cursor-pointer"
                                                onClick={() => handleOpenFavoriteChat(fav.agent)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center text-xl shrink-0">
                                                        {fav.agent.avatar_emoji}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="font-medium text-white truncate">{fav.agent.name}</h3>
                                                            {fav.agent.isFriendsAgent && (
                                                                <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                                                    👥
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-zinc-500 truncate">
                                                            by {fav.agent.owner?.username ? `@${fav.agent.owner.username}` : fav.agent.owner_address.slice(0, 10) + "..."}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={(e) => handleRemoveFavorite(e, fav.agent.id)}
                                                        className="p-2 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 rounded-lg transition-colors"
                                                        title="Remove from favorites"
                                                    >
                                                        <svg className="w-4 h-4" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modals */}
            <CreateAgentModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onCreate={handleCreateAgent}
            />
            <AgentChatModal
                isOpen={isChatOpen}
                onClose={() => {
                    setIsChatOpen(false);
                    setSelectedAgent(null);
                    setSelectedDiscoveredAgent(null);
                }}
                agent={selectedAgent || selectedDiscoveredAgent}
                userAddress={userAddress}
            />
            <EditAgentModal
                isOpen={isEditModalOpen}
                onClose={() => {
                    setIsEditModalOpen(false);
                    setSelectedAgent(null);
                }}
                agent={selectedAgent}
                onSave={handleSaveAgent}
                userAddress={userAddress}
            />
            <AgentKnowledgeModal
                isOpen={isKnowledgeModalOpen}
                onClose={() => {
                    setIsKnowledgeModalOpen(false);
                    setSelectedAgent(null);
                }}
                agent={selectedAgent}
                userAddress={userAddress}
            />
            <ExploreAgentsModal
                isOpen={isExploreModalOpen}
                onClose={() => setIsExploreModalOpen(false)}
                userAddress={userAddress}
                onSelectAgent={handleSelectDiscoveredAgent}
            />
        </div>
    );
}

export default AgentsSection;

