"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useAgents, useFavoriteAgents, Agent, DiscoveredAgent, MCPServer, APITool } from "@/hooks/useAgents";
import { CreateAgentModal } from "./CreateAgentModal";
import { AgentChatModal } from "./AgentChatModal";
import { EditAgentModal } from "./EditAgentModal";
import { AgentKnowledgeModal } from "./AgentKnowledgeModal";
import { ExploreAgentsModal } from "./ExploreAgentsModal";

interface AgentsSectionProps {
    userAddress: string;
    hasBetaAccess: boolean;
    isBetaAccessLoading?: boolean;
    isAdmin?: boolean;
}

export function AgentsSection({ userAddress, hasBetaAccess, isBetaAccessLoading = false, isAdmin = false }: AgentsSectionProps) {
    const { agents, isLoading, error, createAgent, updateAgent, deleteAgent } = useAgents(userAddress, isAdmin);
    const { favorites, removeFavorite, refresh: refreshFavorites } = useFavoriteAgents(userAddress);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isKnowledgeModalOpen, setIsKnowledgeModalOpen] = useState(false);
    const [isExploreModalOpen, setIsExploreModalOpen] = useState(false);
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
    const [selectedDiscoveredAgent, setSelectedDiscoveredAgent] = useState<DiscoveredAgent | null>(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);
    const [embedTabForAgent, setEmbedTabForAgent] = useState<Record<string, "iframe" | "js" | "react" | "nextjs">>({});
    const [isApplying, setIsApplying] = useState(false);
    const [hasApplied, setHasApplied] = useState(false);
    const [appliedAt, setAppliedAt] = useState<string | null>(null);
    const [isCheckingBetaStatus, setIsCheckingBetaStatus] = useState(true); // Start true to prevent flash
    
    // Use ref to track if we've initiated the check (prevents re-triggering)
    const hasCheckedBetaStatus = useRef(false);

    // Check beta status on mount ONCE if user doesn't have access
    useEffect(() => {
        // Skip if user already has beta access or we've already checked
        if (hasBetaAccess || hasCheckedBetaStatus.current) {
            setIsCheckingBetaStatus(false);
            return;
        }
        
        hasCheckedBetaStatus.current = true;
        
        fetch("/api/beta-access/apply", {
            method: "GET",
            credentials: "include",
        })
            .then((res) => res.json())
            .then((data) => {
                if (data.hasApplied) {
                    setHasApplied(true);
                    setAppliedAt(data.appliedAt);
                }
                // If user already has beta access, reload to show agents
                if (data.hasBetaAccess) {
                    window.location.reload();
                }
            })
            .catch((err) => {
                console.error("[AgentsSection] Error checking beta status:", err);
            })
            .finally(() => {
                setIsCheckingBetaStatus(false);
            });
    }, [hasBetaAccess]); // Only depend on hasBetaAccess prop

    const handleCreateAgent = async (
        name: string,
        personality: string,
        emoji: string,
        visibility: "private" | "friends" | "public" | "official",
        tags: string[]
    ) => {
        await createAgent(name, personality, emoji, visibility, tags);
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
        avatarUrl?: string | null;
        visibility?: "private" | "friends" | "public" | "official";
        tags?: string[];
        webSearchEnabled?: boolean;
        useKnowledgeBase?: boolean;
        mcpEnabled?: boolean;
        apiEnabled?: boolean;
        x402Enabled?: boolean;
        x402PriceCents?: number;
        x402Network?: "base" | "base-sepolia";
        x402WalletAddress?: string;
        x402PricingMode?: "global" | "per_tool";
        mcpServers?: MCPServer[];
        apiTools?: APITool[];
    }) => {
        await updateAgent(agentId, updates);
    };

    const handleApplyForBetaAccess = async () => {
        setIsApplying(true);
        try {
            const response = await fetch("/api/beta-access/apply", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ walletAddress: userAddress }),
            });
            const data = await response.json();
            if (response.ok && data.success) {
                setHasApplied(true);
                setAppliedAt(new Date().toISOString());
                if (data.hasBetaAccess) {
                    // User already had access, refresh the page to show agents
                    window.location.reload();
                }
            } else {
                alert(data.error || "Failed to submit application");
            }
        } catch (error) {
            console.error("[AgentsSection] Error applying for beta access:", error);
            alert("Failed to submit application. Please try again.");
        } finally {
            setIsApplying(false);
        }
    };

    return (
        <div>
            {/* Section Header */}
            <div 
                className="flex items-center justify-between mb-2 sm:mb-3 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-1.5 sm:gap-2">
                    <h2 className="text-sm sm:text-lg font-semibold text-white flex items-center gap-1.5 sm:gap-2">
                        <span className="text-purple-400">✨</span>
                        AI Agents
                        <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">
                            Beta
                        </span>
                    </h2>
                    <span className="text-[10px] sm:text-xs text-zinc-500">
                        {isAdmin ? agents.length : `${agents.length}/5`}
                        {favorites.length > 0 && (
                            <span className="ml-1 text-yellow-400">⭐{favorites.length}</span>
                        )}
                    </span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                    {/* Explore Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsExploreModalOpen(true);
                        }}
                        className="p-1 sm:p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors"
                        title="Explore Agents"
                    >
                        <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                            className="p-1 sm:p-1.5 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors"
                            title="Create Agent"
                        >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                    )}
                    <motion.svg
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-400"
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
                        {/* Show loading while checking beta status OR loading agents */}
                        {(isLoading || isCheckingBetaStatus || isBetaAccessLoading) ? (
                            <div className="flex items-center justify-center py-6 sm:py-8">
                                <svg className="animate-spin w-5 h-5 sm:w-6 sm:h-6 text-purple-400" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                            </div>
                        ) : error ? (
                            <div className="p-3 sm:p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs sm:text-sm">
                                {error}
                            </div>
                        ) : !hasBetaAccess ? (
                            <div
                                className="p-4 sm:p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl text-center"
                            >
                                <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                                    <span className="text-xl sm:text-2xl">{hasApplied ? "⏳" : "✨"}</span>
                                </div>
                                <h3 className="text-sm sm:text-base text-white font-medium mb-1">
                                    {hasApplied ? "Application Pending" : "AI Agents (Beta)"}
                                </h3>
                                {hasApplied ? (
                                    <div className="space-y-2 sm:space-y-3 mb-3 sm:mb-4">
                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 sm:p-4">
                                            <p className="text-amber-400 text-xs sm:text-sm font-medium mb-1">Application Submitted</p>
                                            <p className="text-zinc-400 text-[10px] sm:text-xs">
                                                {appliedAt
                                                    ? `Applied on ${new Date(appliedAt).toLocaleDateString("en-US", {
                                                          month: "long",
                                                          day: "numeric",
                                                          year: "numeric",
                                                      })}`
                                                    : "Your application is being reviewed"}
                                            </p>
                                        </div>
                                        <p className="text-xs sm:text-sm text-zinc-400">
                                            We&apos;re reviewing applications and granting access in batches. You&apos;ll be notified when your access is approved!
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-xs sm:text-sm text-zinc-400 mb-3 sm:mb-4">
                                        Apply for beta access to create and interact with AI agents
                                    </p>
                                )}
                                {!hasApplied && (
                                    <button
                                        onClick={handleApplyForBetaAccess}
                                        disabled={isApplying}
                                        className="px-4 sm:px-6 py-1.5 sm:py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isApplying ? "Applying..." : "Apply for Beta Access"}
                                    </button>
                                )}
                            </div>
                        ) : agents.length === 0 && favorites.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-4 sm:p-6 bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl text-center"
                            >
                                <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                                    <span className="text-xl sm:text-2xl">🤖</span>
                                </div>
                                <h3 className="text-sm sm:text-base text-white font-medium mb-1">Create Your First AI Agent</h3>
                                <p className="text-xs sm:text-sm text-zinc-400 mb-3 sm:mb-4">
                                    Build custom AI assistants with unique personalities
                                </p>
                                <div className="flex gap-2 justify-center">
                                    <button
                                        onClick={() => setIsCreateModalOpen(true)}
                                        className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white text-sm font-medium rounded-xl transition-all"
                                    >
                                        Create Agent
                                    </button>
                                    <button
                                        onClick={() => setIsExploreModalOpen(true)}
                                        className="px-3 sm:px-4 py-1.5 sm:py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-xl transition-all"
                                    >
                                        Explore Agents
                                    </button>
                                </div>
                            </motion.div>
                        ) : (
                            <div className="space-y-1.5 sm:space-y-2">
                                {/* User's own agents */}
                                {agents.map((agent) => (
                                    <motion.div
                                        key={agent.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="group p-2.5 sm:p-3 bg-zinc-800/30 sm:bg-zinc-800/50 hover:bg-zinc-800 border border-transparent sm:border-zinc-700/50 hover:border-zinc-600 rounded-xl transition-all cursor-pointer"
                                        onClick={() => handleOpenChat(agent)}
                                    >
                                        <div className="flex items-center gap-2.5 sm:gap-3">
                                            {agent.avatar_url ? (
                                                <img
                                                    src={agent.avatar_url}
                                                    alt={agent.name}
                                                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-cover shrink-0"
                                                />
                                            ) : (
                                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center text-lg sm:text-xl shrink-0">
                                                    {agent.avatar_emoji}
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 sm:gap-2">
                                                    <h3 className="text-sm sm:text-base font-medium text-white truncate">{agent.name}</h3>
                                                    {agent.visibility !== "private" && (
                                                        <span className={`text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded ${
                                                            agent.visibility === "official" 
                                                                ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" 
                                                                : "bg-zinc-700 text-zinc-400"
                                                        }`}>
                                                            {agent.visibility === "friends" ? "👥" : agent.visibility === "official" ? "⭐" : "🌍"}
                                                        </span>
                                                    )}
                                                    {agent.x402_enabled && (
                                                        <span className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 bg-emerald-500/20 rounded text-emerald-400 font-medium" title={`x402 API: $${((agent.x402_price_cents || 1) / 100).toFixed(2)}/msg`}>
                                                            💰
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[10px] sm:text-xs text-zinc-500 truncate">
                                                    {agent.personality || "AI Assistant"}
                                                </p>
                                            </div>
                                            {/* Action buttons - always visible on mobile, hover on desktop */}
                                            <div className="flex items-center gap-0.5 sm:gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenChat(agent);
                                                    }}
                                                    className="p-1.5 sm:p-2 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors"
                                                    title="Chat"
                                                >
                                                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenKnowledge(agent);
                                                    }}
                                                    className="hidden sm:block p-1.5 sm:p-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-lg transition-colors"
                                                    title="Knowledge Base"
                                                >
                                                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleEditAgent(agent);
                                                    }}
                                                    className="p-1.5 sm:p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors"
                                                    title="Edit"
                                                >
                                                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteAgent(agent);
                                                    }}
                                                    className="hidden sm:block p-1.5 sm:p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                                                    title="Delete"
                                                >
                                                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                        {/* Stats - hidden on mobile for compactness */}
                                        <div className="hidden sm:flex items-center gap-3 mt-2 text-xs text-zinc-500">
                                            <span>{agent.message_count} messages</span>
                                            <span>•</span>
                                            <span>Created {new Date(agent.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </motion.div>
                                ))}

                                {/* Favorite agents from others */}
                                {favorites.length > 0 && (
                                    <>
                                        <div className="flex items-center gap-1.5 sm:gap-2 mt-3 sm:mt-4 mb-1.5 sm:mb-2">
                                            <span className="text-yellow-400 text-sm">⭐</span>
                                            <span className="text-[10px] sm:text-xs font-medium text-zinc-400 uppercase tracking-wide">
                                                Favorites ({favorites.length})
                                            </span>
                                        </div>
                                        {favorites.map((fav) => (
                                            <motion.div
                                                key={fav.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className="group p-2.5 sm:p-3 bg-zinc-800/20 sm:bg-zinc-800/30 hover:bg-zinc-800/50 border border-yellow-500/10 sm:border-yellow-500/20 hover:border-yellow-500/40 rounded-xl transition-all cursor-pointer"
                                                onClick={() => handleOpenFavoriteChat(fav.agent)}
                                            >
                                                <div className="flex items-center gap-2.5 sm:gap-3">
                                                    {fav.agent.avatar_url ? (
                                                        <img
                                                            src={fav.agent.avatar_url}
                                                            alt={fav.agent.name}
                                                            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-cover shrink-0"
                                                        />
                                                    ) : (
                                                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center text-lg sm:text-xl shrink-0">
                                                            {fav.agent.avatar_emoji}
                                                        </div>
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-1.5 sm:gap-2">
                                                            <h3 className="text-sm sm:text-base font-medium text-white truncate">{fav.agent.name}</h3>
                                                            {fav.agent.isFriendsAgent && (
                                                                <span className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                                                    👥
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-[10px] sm:text-xs text-zinc-500 truncate">
                                                            by {fav.agent.owner?.username ? `@${fav.agent.owner.username}` : fav.agent.owner_address.slice(0, 10) + "..."}
                                                        </p>
                                                        {/* Tags - hidden on mobile */}
                                                        {fav.agent.tags && fav.agent.tags.length > 0 && (
                                                            <div className="hidden sm:flex flex-wrap gap-1 mt-1">
                                                                {fav.agent.tags.slice(0, 3).map(tag => (
                                                                    <span
                                                                        key={tag}
                                                                        className="px-1 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] rounded"
                                                                    >
                                                                        #{tag}
                                                                    </span>
                                                                ))}
                                                                {fav.agent.tags.length > 3 && (
                                                                    <span className="text-[10px] text-zinc-500">+{fav.agent.tags.length - 3}</span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-0.5 sm:gap-1">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleOpenFavoriteChat(fav.agent);
                                                            }}
                                                            className="p-1.5 sm:p-2 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                                                            title="Chat"
                                                        >
                                                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={(e) => handleRemoveFavorite(e, fav.agent.id)}
                                                            className="p-1.5 sm:p-2 text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 rounded-lg transition-colors"
                                                            title="Remove from favorites"
                                                        >
                                                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                                                            </svg>
                                                        </button>
                                                    </div>
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
                isAdmin={isAdmin}
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
                isAdmin={isAdmin}
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
                onClose={() => {
                    setIsExploreModalOpen(false);
                    // Refresh favorites to sync any changes made in the modal
                    refreshFavorites();
                }}
                userAddress={userAddress}
                onSelectAgent={handleSelectDiscoveredAgent}
            />

            {/* Metrics & Public URLs Section - Desktop only or collapsible on mobile */}
            {agents.length > 0 && (
                <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-zinc-800">
                    <h3 className="text-xs sm:text-sm font-semibold text-zinc-300 mb-3 sm:mb-4 flex items-center gap-2">
                        <span>📊</span>
                        Agent Metrics & Integration
                    </h3>
                    
                    {/* Overall Metrics - Compact on mobile */}
                    <div className="grid grid-cols-4 gap-1.5 sm:gap-3 mb-4 sm:mb-6">
                        <div className="p-2 sm:p-3 bg-zinc-800/50 rounded-lg sm:rounded-xl border border-zinc-700/50">
                            <p className="text-[10px] sm:text-xs text-zinc-400 mb-0.5 sm:mb-1">Agents</p>
                            <p className="text-sm sm:text-lg font-bold text-white">{agents.length}</p>
                        </div>
                        <div className="p-2 sm:p-3 bg-zinc-800/50 rounded-lg sm:rounded-xl border border-zinc-700/50">
                            <p className="text-[10px] sm:text-xs text-zinc-400 mb-0.5 sm:mb-1">Messages</p>
                            <p className="text-sm sm:text-lg font-bold text-white">
                                {agents.reduce((sum, a) => sum + (a.message_count || 0), 0).toLocaleString()}
                            </p>
                        </div>
                        <div className="p-2 sm:p-3 bg-zinc-800/50 rounded-lg sm:rounded-xl border border-zinc-700/50">
                            <p className="text-[10px] sm:text-xs text-zinc-400 mb-0.5 sm:mb-1">Public</p>
                            <p className="text-sm sm:text-lg font-bold text-emerald-400">
                                {agents.filter(a => a.visibility === "public" || a.visibility === "official").length}
                            </p>
                        </div>
                        <div className="p-2 sm:p-3 bg-zinc-800/50 rounded-lg sm:rounded-xl border border-zinc-700/50">
                            <p className="text-[10px] sm:text-xs text-zinc-400 mb-0.5 sm:mb-1">API</p>
                            <p className="text-sm sm:text-lg font-bold text-purple-400">
                                {agents.filter(a => a.api_enabled).length}
                            </p>
                        </div>
                    </div>

                    {/* x402 Earnings (if any) - Compact on mobile */}
                    {agents.some(a => a.x402_enabled && (a.x402_total_earnings_cents || 0) > 0) && (
                        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/20 rounded-xl">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] sm:text-xs text-emerald-400 mb-0.5 sm:mb-1">💰 x402 Earnings</p>
                                    <p className="text-base sm:text-xl font-bold text-emerald-400">
                                        ${(agents.reduce((sum, a) => sum + ((a.x402_total_earnings_cents || 0) / 100), 0)).toFixed(2)}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] sm:text-xs text-zinc-400 mb-0.5 sm:mb-1">Paid Msgs</p>
                                    <p className="text-sm sm:text-lg font-semibold text-white">
                                        {agents.reduce((sum, a) => sum + (a.x402_message_count_paid || 0), 0).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Public Agent URLs & Embed Code - Hidden on mobile, too detailed */}
                    {agents.filter(a => a.visibility === "public" || a.visibility === "official").length > 0 && (
                        <div className="hidden sm:block space-y-4">
                            <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                                <span>🔗</span>
                                Public Agent URLs & Embed Code
                            </h4>
                            {agents
                                .filter(a => a.visibility === "public" || a.visibility === "official")
                                .map((agent) => {
                                    const publicUrl = `${typeof window !== "undefined" ? window.location.origin : "https://app.spritz.chat"}/agent/${agent.id}`;
                                    const embedCode = `<iframe 
  src="${publicUrl}"
  width="100%"
  height="600"
  frameborder="0"
  allow="clipboard-read; clipboard-write"
  style="border-radius: 12px; border: 1px solid #3f3f46;">
</iframe>`;
                                    
                                    return (
                                        <div
                                            key={agent.id}
                                            className="p-4 bg-zinc-800/30 border border-zinc-700/50 rounded-xl"
                                        >
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="text-xl">{agent.avatar_emoji}</span>
                                                <h5 className="font-medium text-white">{agent.name}</h5>
                                                {agent.x402_enabled && (
                                                    <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">
                                                        💰 Paid
                                                    </span>
                                                )}
                                            </div>
                                            
                                            {/* Public URL */}
                                            <div className="mb-3">
                                                <label className="block text-xs text-zinc-400 mb-1.5">Public URL</label>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={publicUrl}
                                                        readOnly
                                                        className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm font-mono"
                                                    />
                                                    <button
                                                        onClick={async () => {
                                                            try {
                                                                await navigator.clipboard.writeText(publicUrl);
                                                                // Brief feedback
                                                                const btn = document.activeElement as HTMLElement;
                                                                const original = btn?.textContent;
                                                                if (btn) {
                                                                    btn.textContent = "Copied!";
                                                                    setTimeout(() => {
                                                                        if (btn) btn.textContent = original || "Copy";
                                                                    }, 2000);
                                                                }
                                                            } catch (err) {
                                                                console.error("Copy failed:", err);
                                                            }
                                                        }}
                                                        className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg transition-colors"
                                                    >
                                                        Copy
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Embed Code - Tabs for iframe, JS, React, Next.js */}
                                            <div>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <label className="block text-xs text-zinc-400">Embed Code</label>
                                                    <div className="flex flex-wrap gap-1 bg-zinc-900 rounded-lg p-0.5">
                                                        <button
                                                            onClick={() => setEmbedTabForAgent(prev => ({ ...prev, [agent.id]: "iframe" }))}
                                                            className={`px-2 py-1 text-xs rounded transition-colors ${
                                                                (embedTabForAgent[agent.id] || "iframe") === "iframe"
                                                                    ? "bg-zinc-800 text-zinc-300"
                                                                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                                                            }`}
                                                        >
                                                            iframe
                                                        </button>
                                                        <button
                                                            onClick={() => setEmbedTabForAgent(prev => ({ ...prev, [agent.id]: "js" }))}
                                                            className={`px-2 py-1 text-xs rounded transition-colors ${
                                                                embedTabForAgent[agent.id] === "js"
                                                                    ? "bg-zinc-800 text-zinc-300"
                                                                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                                                            }`}
                                                        >
                                                            JavaScript
                                                        </button>
                                                        <button
                                                            onClick={() => setEmbedTabForAgent(prev => ({ ...prev, [agent.id]: "react" }))}
                                                            className={`px-2 py-1 text-xs rounded transition-colors ${
                                                                embedTabForAgent[agent.id] === "react"
                                                                    ? "bg-zinc-800 text-zinc-300"
                                                                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                                                            }`}
                                                        >
                                                            React
                                                        </button>
                                                        <button
                                                            onClick={() => setEmbedTabForAgent(prev => ({ ...prev, [agent.id]: "nextjs" }))}
                                                            className={`px-2 py-1 text-xs rounded transition-colors ${
                                                                embedTabForAgent[agent.id] === "nextjs"
                                                                    ? "bg-zinc-800 text-zinc-300"
                                                                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                                                            }`}
                                                        >
                                                            Next.js
                                                        </button>
                                                    </div>
                                                </div>
                                                
                                                {/* iframe Embed */}
                                                {(embedTabForAgent[agent.id] || "iframe") === "iframe" && (
                                                    <div>
                                                        <div className="relative">
                                                            <textarea
                                                                value={embedCode}
                                                                readOnly
                                                                rows={6}
                                                                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-xs font-mono resize-none"
                                                            />
                                                            <button
                                                                onClick={async () => {
                                                                    try {
                                                                        await navigator.clipboard.writeText(embedCode);
                                                                        const btn = document.activeElement as HTMLElement;
                                                                        const original = btn?.textContent;
                                                                        if (btn) {
                                                                            btn.textContent = "Copied!";
                                                                            setTimeout(() => {
                                                                                if (btn) btn.textContent = original || "Copy";
                                                                            }, 2000);
                                                                        }
                                                                    } catch (err) {
                                                                        console.error("Copy failed:", err);
                                                                    }
                                                                }}
                                                                className="absolute top-2 right-2 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded transition-colors"
                                                            >
                                                                Copy
                                                            </button>
                                                        </div>
                                                        <p className="text-xs text-zinc-500 mt-1.5">
                                                            Paste this iframe code into your HTML
                                                        </p>
                                                    </div>
                                                )}

                                                {/* JavaScript SDK Embed */}
                                                {embedTabForAgent[agent.id] === "js" && (
                                                    <div>
                                                        <div className="relative">
                                                            <textarea
                                                                value={`<!-- Add this to your HTML -->
<div id="spritz-agent-${agent.id}"></div>
<script>
  (function() {
    const iframe = document.createElement('iframe');
    iframe.src = '${publicUrl}';
    iframe.width = '100%';
    iframe.height = '600';
    iframe.frameBorder = '0';
    iframe.allow = 'clipboard-read; clipboard-write';
    iframe.style.borderRadius = '12px';
    iframe.style.border = '1px solid #3f3f46';
    document.getElementById('spritz-agent-${agent.id}').appendChild(iframe);
  })();
</script>`}
                                                                readOnly
                                                                rows={10}
                                                                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-xs font-mono resize-none"
                                                            />
                                                            <button
                                                                onClick={async () => {
                                                                    try {
                                                                        const jsCode = `<!-- Add this to your HTML -->
<div id="spritz-agent-${agent.id}"></div>
<script>
  (function() {
    const iframe = document.createElement('iframe');
    iframe.src = '${publicUrl}';
    iframe.width = '100%';
    iframe.height = '600';
    iframe.frameBorder = '0';
    iframe.allow = 'clipboard-read; clipboard-write';
    iframe.style.borderRadius = '12px';
    iframe.style.border = '1px solid #3f3f46';
    document.getElementById('spritz-agent-${agent.id}').appendChild(iframe);
  })();
</script>`;
                                                                        await navigator.clipboard.writeText(jsCode);
                                                                        const btn = document.activeElement as HTMLElement;
                                                                        const original = btn?.textContent;
                                                                        if (btn) {
                                                                            btn.textContent = "Copied!";
                                                                            setTimeout(() => {
                                                                                if (btn) btn.textContent = original || "Copy";
                                                                            }, 2000);
                                                                        }
                                                                    } catch (err) {
                                                                        console.error("Copy failed:", err);
                                                                    }
                                                                }}
                                                                className="absolute top-2 right-2 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded transition-colors"
                                                            >
                                                                Copy
                                                            </button>
                                                        </div>
                                                        <p className="text-xs text-zinc-500 mt-1.5">
                                                            Use this JavaScript code for dynamic embedding
                                                        </p>
                                                    </div>
                                                )}

                                                {/* React Component Embed */}
                                                {embedTabForAgent[agent.id] === "react" && (
                                                    <div>
                                                        <div className="relative">
                                                            <textarea
                                                                value={`import React, { useState } from 'react';

export function SpritzAgent() {
  const [messages, setMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const agentId = '${agent.id}';
  const apiUrl = 'https://app.spritz.chat/api/public/agents';

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      // Note: If agent has x402 enabled, add payment header:
      // 'X-Payment': JSON.stringify({ from: walletAddress, amount: price, ... })
      const response = await fetch(\`\${apiUrl}/\${agentId}/chat\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          sessionId: 'session-' + Date.now(), // Optional: persist sessionId
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.' 
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '600px',
      border: '1px solid #3f3f46',
      borderRadius: '12px',
      backgroundColor: '#18181b'
    }}>
      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#a1a1aa', marginTop: '40px' }}>
            <p>Start a conversation with ${agent.name}</p>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              padding: '12px 16px',
              borderRadius: '12px',
              backgroundColor: msg.role === 'user' ? '#3b82f6' : '#27272a',
              color: '#fff'
            }}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', color: '#a1a1aa' }}>
            Thinking...
          </div>
        )}
      </div>
      <div style={{ 
        padding: '16px', 
        borderTop: '1px solid #3f3f46',
        display: 'flex',
        gap: '8px'
      }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type your message..."
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #3f3f46',
            backgroundColor: '#27272a',
            color: '#fff',
            outline: 'none'
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            padding: '12px 24px',
            borderRadius: '8px',
            backgroundColor: '#f97316',
            color: '#fff',
            border: 'none',
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !input.trim() ? 0.5 : 1
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}`}
                                                                readOnly
                                                                rows={80}
                                                                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-xs font-mono resize-none"
                                                            />
                                                            <button
                                                                onClick={async () => {
                                                                    try {
                                                                        const reactCode = `import React, { useState } from 'react';

export function SpritzAgent() {
  const [messages, setMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const agentId = '${agent.id}';
  const apiUrl = 'https://app.spritz.chat/api/public/agents';

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch(\`\${apiUrl}/\${agentId}/chat\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          sessionId: 'session-' + Date.now(), // Optional: persist sessionId
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.' 
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '600px',
      border: '1px solid #3f3f46',
      borderRadius: '12px',
      backgroundColor: '#18181b'
    }}>
      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#a1a1aa', marginTop: '40px' }}>
            <p>Start a conversation with ${agent.name}</p>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              padding: '12px 16px',
              borderRadius: '12px',
              backgroundColor: msg.role === 'user' ? '#3b82f6' : '#27272a',
              color: '#fff'
            }}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', color: '#a1a1aa' }}>
            Thinking...
          </div>
        )}
      </div>
      <div style={{ 
        padding: '16px', 
        borderTop: '1px solid #3f3f46',
        display: 'flex',
        gap: '8px'
      }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type your message..."
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #3f3f46',
            backgroundColor: '#27272a',
            color: '#fff',
            outline: 'none'
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            padding: '12px 24px',
            borderRadius: '8px',
            backgroundColor: '#f97316',
            color: '#fff',
            border: 'none',
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !input.trim() ? 0.5 : 1
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}`;
                                                                        await navigator.clipboard.writeText(reactCode);
                                                                        const btn = document.activeElement as HTMLElement;
                                                                        const original = btn?.textContent;
                                                                        if (btn) {
                                                                            btn.textContent = "Copied!";
                                                                            setTimeout(() => {
                                                                                if (btn) btn.textContent = original || "Copy";
                                                                            }, 2000);
                                                                        }
                                                                    } catch (err) {
                                                                        console.error("Copy failed:", err);
                                                                    }
                                                                }}
                                                                className="absolute top-2 right-2 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded transition-colors"
                                                            >
                                                                Copy
                                                            </button>
                                                        </div>
                                                        <p className="text-xs text-zinc-500 mt-1.5">
                                                            Native React component that calls the agent API directly
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Next.js Component Embed */}
                                                {embedTabForAgent[agent.id] === "nextjs" && (
                                                    <div>
                                                        <div className="relative">
                                                            <textarea
                                                                value={`'use client';

import { useState } from 'react';

export default function SpritzAgent() {
  const [messages, setMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const agentId = '${agent.id}';
  const apiUrl = 'https://app.spritz.chat/api/public/agents';

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      // Note: If agent has x402 enabled, add payment header:
      // 'X-Payment': JSON.stringify({ from: walletAddress, amount: price, ... })
      const response = await fetch(\`\${apiUrl}/\${agentId}/chat\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          sessionId: typeof window !== 'undefined' 
            ? localStorage.getItem('spritz-session-id') || 'session-' + Date.now()
            : 'session-' + Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.' 
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] border border-zinc-700 rounded-xl bg-zinc-950">
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="text-center text-zinc-400 mt-10">
            <p>Start a conversation with ${agent.name}</p>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={\`max-w-[80%] px-4 py-3 rounded-xl \${msg.role === 'user' 
              ? 'bg-blue-500 text-white self-end' 
              : 'bg-zinc-800 text-white self-start'}\`}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="text-zinc-400 self-start">
            Thinking...
          </div>
        )}
      </div>
      <div className="p-4 border-t border-zinc-700 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type your message..."
          className="flex-1 px-4 py-3 rounded-lg border border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="px-6 py-3 rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}`}
                                                                readOnly
                                                                rows={85}
                                                                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-xs font-mono resize-none"
                                                            />
                                                            <button
                                                                onClick={async () => {
                                                                    try {
                                                                        const nextjsCode = `'use client';

import { useState } from 'react';

export default function SpritzAgent() {
  const [messages, setMessages] = useState<Array<{role: 'user' | 'assistant', content: string}>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const agentId = '${agent.id}';
  const apiUrl = 'https://app.spritz.chat/api/public/agents';

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const response = await fetch(\`\${apiUrl}/\${agentId}/chat\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          sessionId: typeof window !== 'undefined' 
            ? localStorage.getItem('spritz-session-id') || 'session-' + Date.now()
            : 'session-' + Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.' 
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px] border border-zinc-700 rounded-xl bg-zinc-950">
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="text-center text-zinc-400 mt-10">
            <p>Start a conversation with ${agent.name}</p>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={\`max-w-[80%] px-4 py-3 rounded-xl \${msg.role === 'user' 
              ? 'bg-blue-500 text-white self-end' 
              : 'bg-zinc-800 text-white self-start'}\`}
          >
            {msg.content}
          </div>
        ))}
        {loading && (
          <div className="text-zinc-400 self-start">
            Thinking...
          </div>
        )}
      </div>
      <div className="p-4 border-t border-zinc-700 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type your message..."
          className="flex-1 px-4 py-3 rounded-lg border border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="px-6 py-3 rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}`;
                                                                        await navigator.clipboard.writeText(nextjsCode);
                                                                        const btn = document.activeElement as HTMLElement;
                                                                        const original = btn?.textContent;
                                                                        if (btn) {
                                                                            btn.textContent = "Copied!";
                                                                            setTimeout(() => {
                                                                                if (btn) btn.textContent = original || "Copy";
                                                                            }, 2000);
                                                                        }
                                                                    } catch (err) {
                                                                        console.error("Copy failed:", err);
                                                                    }
                                                                }}
                                                                className="absolute top-2 right-2 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded transition-colors"
                                                            >
                                                                Copy
                                                            </button>
                                                        </div>
                                                        <p className="text-xs text-zinc-500 mt-1.5">
                                                            Native Next.js component with Tailwind CSS styling
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* API Documentation Section */}
                                            <div className="mt-4 pt-4 border-t border-zinc-700/50">
                                                <h6 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                                                    <span>📡</span>
                                                    API Documentation
                                                </h6>
                                                
                                                <div className="space-y-3 text-xs">
                                                    {/* Endpoint */}
                                                    <div>
                                                        <p className="text-zinc-400 mb-1 font-medium">Endpoint</p>
                                                        <code className="block px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-orange-400 font-mono break-all">
                                                            POST https://app.spritz.chat/api/public/agents/{agent.id}/chat
                                                        </code>
                                                    </div>

                                                    {/* Request */}
                                                    <div>
                                                        <p className="text-zinc-400 mb-1 font-medium">Request Body</p>
                                                        <div className="relative">
                                                            <textarea
                                                                value={JSON.stringify({
                                                                    message: "Your message here",
                                                                    sessionId: "optional-session-id"
                                                                }, null, 2)}
                                                                readOnly
                                                                rows={4}
                                                                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-green-400 font-mono text-xs resize-none"
                                                            />
                                                            <button
                                                                onClick={async () => {
                                                                    try {
                                                                        const requestBody = JSON.stringify({
                                                                            message: "Your message here",
                                                                            sessionId: "optional-session-id"
                                                                        }, null, 2);
                                                                        await navigator.clipboard.writeText(requestBody);
                                                                        const btn = document.activeElement as HTMLElement;
                                                                        const original = btn?.textContent;
                                                                        if (btn) {
                                                                            btn.textContent = "Copied!";
                                                                            setTimeout(() => {
                                                                                if (btn) btn.textContent = original || "Copy";
                                                                            }, 2000);
                                                                        }
                                                                    } catch (err) {
                                                                        console.error("Copy failed:", err);
                                                                    }
                                                                }}
                                                                className="absolute top-2 right-2 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded transition-colors"
                                                            >
                                                                Copy
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Response */}
                                                    <div>
                                                        <p className="text-zinc-400 mb-1 font-medium">Response</p>
                                                        <div className="relative">
                                                            <textarea
                                                                value={JSON.stringify({
                                                                    response: "Agent's response text here"
                                                                }, null, 2)}
                                                                readOnly
                                                                rows={3}
                                                                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-blue-400 font-mono text-xs resize-none"
                                                            />
                                                            <button
                                                                onClick={async () => {
                                                                    try {
                                                                        const responseBody = JSON.stringify({
                                                                            response: "Agent's response text here"
                                                                        }, null, 2);
                                                                        await navigator.clipboard.writeText(responseBody);
                                                                        const btn = document.activeElement as HTMLElement;
                                                                        const original = btn?.textContent;
                                                                        if (btn) {
                                                                            btn.textContent = "Copied!";
                                                                            setTimeout(() => {
                                                                                if (btn) btn.textContent = original || "Copy";
                                                                            }, 2000);
                                                                        }
                                                                    } catch (err) {
                                                                        console.error("Copy failed:", err);
                                                                    }
                                                                }}
                                                                className="absolute top-2 right-2 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded transition-colors"
                                                            >
                                                                Copy
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* cURL Example */}
                                                    <div>
                                                        <p className="text-zinc-400 mb-1 font-medium">cURL Example</p>
                                                        <div className="relative">
                                                            <textarea
                                                                value={`curl -X POST https://app.spritz.chat/api/public/agents/${agent.id}/chat \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "Hello!",
    "sessionId": "my-session-id"
  }'`}
                                                                readOnly
                                                                rows={6}
                                                                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-cyan-400 font-mono text-xs resize-none"
                                                            />
                                                            <button
                                                                onClick={async () => {
                                                                    try {
                                                                        const curlExample = `curl -X POST https://app.spritz.chat/api/public/agents/${agent.id}/chat \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "Hello!",
    "sessionId": "my-session-id"
  }'`;
                                                                        await navigator.clipboard.writeText(curlExample);
                                                                        const btn = document.activeElement as HTMLElement;
                                                                        const original = btn?.textContent;
                                                                        if (btn) {
                                                                            btn.textContent = "Copied!";
                                                                            setTimeout(() => {
                                                                                if (btn) btn.textContent = original || "Copy";
                                                                            }, 2000);
                                                                        }
                                                                    } catch (err) {
                                                                        console.error("Copy failed:", err);
                                                                    }
                                                                }}
                                                                className="absolute top-2 right-2 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded transition-colors"
                                                            >
                                                                Copy
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Payment Info */}
                                                    {agent.x402_enabled && (
                                                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                                                            <p className="text-yellow-400 font-medium mb-1">💰 Payment Required</p>
                                                            <p className="text-zinc-400 text-xs">
                                                                This agent requires payment. Add the <code className="text-yellow-400">X-Payment</code> header with payment details.
                                                                Price: <span className="text-yellow-400 font-mono">${((agent.x402_price_cents || 0) / 100).toFixed(2)}</span> per message
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* Notes */}
                                                    <div className="p-3 bg-zinc-800/50 rounded-lg">
                                                        <p className="text-zinc-300 font-medium mb-2">Notes:</p>
                                                        <ul className="text-zinc-400 space-y-1 text-xs list-disc list-inside">
                                                            <li><code className="text-zinc-300">sessionId</code> is optional but recommended for conversation context</li>
                                                            <li>Responses are streamed in real-time</li>
                                                            <li>Rate limits may apply for high-volume usage</li>
                                                            {agent.x402_enabled && (
                                                                <li>Payment must be included in <code className="text-zinc-300">X-Payment</code> header for each request</li>
                                                            )}
                                                        </ul>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}

                    {/* No Public Agents Message - Desktop only */}
                    {agents.filter(a => a.visibility === "public" || a.visibility === "official").length === 0 && (
                        <div className="hidden sm:block p-4 bg-zinc-800/30 border border-zinc-700/50 rounded-xl text-center">
                            <p className="text-sm text-zinc-400">
                                Make an agent public to get a shareable URL and embed code
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default AgentsSection;

