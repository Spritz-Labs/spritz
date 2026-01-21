"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Agent } from "@/hooks/useAgents";
import { KnowledgeCollectionToggle } from "./KnowledgeCollectionToggle";
import { CategoriesTab } from "./CategoriesTab";
import { KnowledgeGraphList } from "./KnowledgeGraphList";
import { EpisodeTimelinePanel } from "./EpisodeTimelineModal";
import {
    fetchDelveSettings,
    getRegistrationStatusInfo,
} from "@/lib/delve/settings";
import type { DelveSettingsResponse } from "@/lib/delve/types";

type KnowledgeItem = {
    id: string;
    agent_id: string;
    title: string;
    url: string;
    content_type: "webpage" | "github" | "docs";
    status: "pending" | "processing" | "indexed" | "failed";
    error_message: string | null;
    chunk_count: number;
    created_at: string;
    indexed_at: string | null;
    isIndexing?: boolean; // Client-side loading state
};

export type KnowledgeTab = "knowledge" | "categories" | "timeline" | "graph";

interface AgentKnowledgeModalProps {
    isOpen: boolean;
    onClose: () => void;
    agent: Agent | null;
    userAddress: string;
    initialTab?: KnowledgeTab;
    knowledgeGraphQuery?: string | null;
}

const STATUS_CONFIG = {
    pending: { label: "Pending", color: "text-yellow-400", bg: "bg-yellow-500/10", icon: "⏳" },
    processing: { label: "Processing", color: "text-blue-400", bg: "bg-blue-500/10", icon: "⚙️" },
    indexed: { label: "Indexed", color: "text-green-400", bg: "bg-green-500/10", icon: "✓" },
    failed: { label: "Failed", color: "text-red-400", bg: "bg-red-500/10", icon: "✗" },
};

const CONTENT_TYPE_ICONS = {
    github: "📂",
    docs: "📚",
    webpage: "🌐",
};

export function AgentKnowledgeModal({
    isOpen,
    onClose,
    agent,
    userAddress,
    initialTab,
    knowledgeGraphQuery,
}: AgentKnowledgeModalProps) {
    const [items, setItems] = useState<KnowledgeItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newUrl, setNewUrl] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [delveSettings, setDelveSettings] = useState<DelveSettingsResponse | null>(null);
    const [isDelveLoading, setIsDelveLoading] = useState(false);
    const [delveError, setDelveError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<KnowledgeTab>("knowledge");
    const contentScrollRef = useRef<HTMLDivElement>(null);
    const agentId = agent?.id ?? null;

    // Fetch knowledge items
    const fetchItems = useCallback(async () => {
        if (!agentId || !userAddress) return;

        setIsLoading(true);
        try {
            const res = await fetch(
                `/api/agents/${agentId}/knowledge?userAddress=${encodeURIComponent(userAddress)}`
            );
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch knowledge items");
            }

            setItems(data.items || []);
        } catch (err) {
            console.error("[Knowledge] Error:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch knowledge items");
        } finally {
            setIsLoading(false);
        }
    }, [agentId, userAddress]);

    const loadDelveSettings = useCallback(
        async (signal?: AbortSignal) => {
            if (!agentId || !userAddress) return;

            setIsDelveLoading(true);
            setDelveError(null);

            try {
                const settings = await fetchDelveSettings(agentId, userAddress, { signal });
                setDelveSettings(settings);
            } catch (err) {
                console.error("[Delve Settings] Error:", err);
                if (!(err instanceof DOMException && err.name === "AbortError")) {
                    setDelveError(err instanceof Error ? err.message : "Failed to load Delve settings");
                }
            } finally {
                setIsDelveLoading(false);
            }
        },
        [agentId, userAddress],
    );

    const registrationInfo = useMemo(
        () =>
            getRegistrationStatusInfo(
                delveSettings?.registration_status ?? null,
                delveSettings?.registration_error ?? null,
            ),
        [delveSettings],
    );

    const failedRegistrationMessage = useMemo(() => {
        if (registrationInfo.status !== "failed") return null;
        if (registrationInfo.description === "Registration failed.") {
            return registrationInfo.description;
        }
        return `Registration failed: ${registrationInfo.description}`;
    }, [registrationInfo]);

    useEffect(() => {
        if (isOpen && agentId) {
            const controller = new AbortController();
            fetchItems();
            loadDelveSettings(controller.signal);
            setError(null);
            setNewUrl("");
            return () => controller.abort();
        }

        if (!isOpen) {
            setDelveSettings(null);
            setDelveError(null);
        }
    }, [isOpen, agentId, fetchItems, loadDelveSettings]);

    useEffect(() => {
        if (!isOpen) {
            setActiveTab("knowledge");
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !initialTab) return;
        setActiveTab(initialTab);
    }, [initialTab, isOpen]);

    const handleAddUrl = async () => {
        if (!agentId || !newUrl.trim()) return;

        // Basic URL validation
        try {
            new URL(newUrl);
        } catch {
            setError("Please enter a valid URL");
            return;
        }

        setIsAdding(true);
        setError(null);

        try {
            const res = await fetch(`/api/agents/${agentId}/knowledge`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userAddress, url: newUrl.trim() }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to add URL");
            }

            setItems((prev) => [data.item, ...prev]);
            setNewUrl("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to add URL");
        } finally {
            setIsAdding(false);
        }
    };

    const handleDeleteItem = async (itemId: string) => {
        if (!agentId || !confirm("Remove this knowledge source?")) return;

        try {
            const res = await fetch(
                `/api/agents/${agentId}/knowledge?userAddress=${encodeURIComponent(userAddress)}&itemId=${itemId}`,
                { method: "DELETE" }
            );

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to delete item");
            }

            setItems((prev) => prev.filter((item) => item.id !== itemId));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete item");
        }
    };

    const handleIndexItem = async (itemId: string) => {
        if (!agentId) return;

        // Update local state to show processing
        setItems(prev => prev.map(item => 
            item.id === itemId ? { ...item, isIndexing: true, status: "processing" as const } : item
        ));

        try {
            const res = await fetch(`/api/agents/${agentId}/knowledge/index`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userAddress, knowledgeId: itemId }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to index");
            }

            // Refresh to get updated status
            await fetchItems();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to index");
            // Refresh to get actual status
            await fetchItems();
        }
    };

    if (!agent) return null;

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
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-xl">
                                        📚
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-white">Knowledge Base</h2>
                                        <p className="text-sm text-zinc-400">{agent.name}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="mt-4 space-y-3">
                                <KnowledgeCollectionToggle
                                    agentId={agent.id}
                                    userAddress={userAddress}
                                    settings={delveSettings}
                                    isLoading={isDelveLoading}
                                    onSettingsChange={setDelveSettings}
                                />
                                {delveError && (
                                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs">
                                        {delveError}
                                    </div>
                                )}
                                {registrationInfo.status === "failed" && failedRegistrationMessage && (
                                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-xs">
                                        <p>{failedRegistrationMessage}</p>
                                        {registrationInfo.retryHint && (
                                            <p className="mt-1 text-red-400/80">{registrationInfo.retryHint}</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-2">
                                {(["knowledge", "categories", "timeline", "graph"] as KnowledgeTab[]).map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                            activeTab === tab
                                                ? "bg-zinc-800 text-white"
                                                : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                                        }`}
                                    >
                                        {tab === "knowledge"
                                            ? "Knowledge"
                                            : tab === "categories"
                                              ? "Categories"
                                              : tab === "timeline"
                                                ? "Timeline"
                                                : "🔗 Knowledge Graph"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Error */}
                        {activeTab === "knowledge" && error && (
                            <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Content */}
                        <div ref={contentScrollRef} className="flex-1 overflow-y-auto p-6">
                            {activeTab === "knowledge" && (
                                <div className="space-y-6">
                                    <div>
                                        <div className="flex gap-2">
                                            <input
                                                type="url"
                                                value={newUrl}
                                                onChange={(e) => setNewUrl(e.target.value)}
                                                placeholder="Add URL (GitHub, docs, webpage...)"
                                                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") handleAddUrl();
                                                }}
                                            />
                                            <button
                                                onClick={handleAddUrl}
                                                disabled={isAdding || !newUrl.trim()}
                                                className="px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all flex items-center gap-2"
                                            >
                                                {isAdding ? (
                                                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                    </svg>
                                                ) : (
                                                    <>
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                        </svg>
                                                        Add
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                        <p className="text-xs text-zinc-500 mt-2">
                                            Add URLs to help your agent learn. Supports GitHub repos, documentation sites, and web pages.
                                        </p>
                                    </div>

                                    {isLoading ? (
                                        <div className="flex items-center justify-center py-12">
                                            <svg className="animate-spin w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                        </div>
                                    ) : items.length === 0 ? (
                                        <div className="text-center py-12">
                                            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-zinc-800 flex items-center justify-center">
                                                <span className="text-3xl">📭</span>
                                            </div>
                                            <h3 className="text-white font-medium mb-1">No knowledge sources yet</h3>
                                            <p className="text-sm text-zinc-400">
                                                Add URLs to give your agent context about specific topics
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {items.map((item) => {
                                                const status = STATUS_CONFIG[item.status];
                                                return (
                                                    <motion.div
                                                        key={item.id}
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className="group p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-xl hover:border-zinc-600 transition-all"
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <div className="w-10 h-10 rounded-lg bg-zinc-700/50 flex items-center justify-center text-xl shrink-0">
                                                                {CONTENT_TYPE_ICONS[item.content_type]}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <h4 className="font-medium text-white truncate">{item.title}</h4>
                                                                    <span className={`text-xs px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>
                                                                        {status.icon} {status.label}
                                                                    </span>
                                                                </div>
                                                                <a
                                                                    href={item.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-xs text-zinc-400 hover:text-blue-400 truncate block mt-1"
                                                                >
                                                                    {item.url}
                                                                </a>
                                                                {item.status === "failed" && item.error_message && (
                                                                    <p className="text-xs text-red-400 mt-1">{item.error_message}</p>
                                                                )}
                                                                {item.status === "indexed" && item.chunk_count > 0 && (
                                                                    <p className="text-xs text-zinc-500 mt-1">
                                                                        {item.chunk_count} chunks indexed
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                {/* Index button - show for pending or failed */}
                                                                {(item.status === "pending" || item.status === "failed") && (
                                                                    <button
                                                                        onClick={() => handleIndexItem(item.id)}
                                                                        disabled={item.isIndexing}
                                                                        className="px-2 py-1.5 text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors flex items-center gap-1"
                                                                        title="Index this URL"
                                                                    >
                                                                        {item.isIndexing ? (
                                                                            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                                            </svg>
                                                                        ) : (
                                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                                            </svg>
                                                                        )}
                                                                        Index
                                                                    </button>
                                                                )}
                                                                {/* Processing indicator */}
                                                                {item.status === "processing" && !item.isIndexing && (
                                                                    <span className="px-2 py-1.5 text-xs bg-blue-500/10 text-blue-400 rounded-lg flex items-center gap-1">
                                                                        <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                                        </svg>
                                                                        Indexing...
                                                                    </span>
                                                                )}
                                                                {/* Delete button */}
                                                                <button
                                                                    onClick={() => handleDeleteItem(item.id)}
                                                                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                                    title="Remove"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === "categories" && (
                                <CategoriesTab
                                    agentId={agent.id}
                                    userAddress={userAddress}
                                    isActive={isOpen && activeTab === "categories"}
                                />
                            )}

                            {activeTab === "timeline" && (
                                <EpisodeTimelinePanel
                                    agentId={agent.id}
                                    userAddress={userAddress}
                                    isActive={isOpen && activeTab === "timeline"}
                                    scrollRootRef={contentScrollRef}
                                />
                            )}

                            {activeTab === "graph" && (
                                <KnowledgeGraphList
                                    agentId={agent.id}
                                    userAddress={userAddress}
                                    isActive={isOpen && activeTab === "graph"}
                                    initialQuery={knowledgeGraphQuery}
                                    onShowTimeline={() => setActiveTab("timeline")}
                                />
                            )}
                        </div>

                        {/* Footer */}
                        {activeTab === "knowledge" && (
                            <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
                                <div className="flex items-center justify-between text-xs text-zinc-500">
                                    <span>{items.length}/10 knowledge sources</span>
                                    <span className="flex items-center gap-2">
                                        {items.filter(i => i.status === "indexed").length > 0 && (
                                            <span className="text-green-400">
                                                ✓ {items.filter(i => i.status === "indexed").length} indexed
                                            </span>
                                        )}
                                        {items.filter(i => i.status === "pending").length > 0 && (
                                            <span className="text-yellow-400">
                                                ⏳ {items.filter(i => i.status === "pending").length} pending
                                            </span>
                                        )}
                                    </span>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default AgentKnowledgeModal;

