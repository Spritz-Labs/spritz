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
    // Firecrawl fields
    scrape_method?: "basic" | "firecrawl";
    crawl_depth?: number;
    auto_sync?: boolean;
    sync_interval_hours?: number;
    last_synced_at?: string | null;
    exclude_patterns?: string[];
    infinite_scroll?: boolean;
    scroll_count?: number;
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

// Firecrawl advanced options state
type FirecrawlOptions = {
    scrapeMethod: "basic" | "firecrawl";
    crawlDepth: number;
    autoSync: boolean;
    syncIntervalHours: number;
    excludePatterns: string;
    infiniteScroll: boolean;
    scrollCount: number;
};

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

// Helper to format time ago
function formatTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

export function AgentKnowledgeModal({ isOpen, onClose, agent, userAddress, knowledgeGraphQuery, }: AgentKnowledgeModalProps) {
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
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [syncingItemId, setSyncingItemId] = useState<string | null>(null);
    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [editOptions, setEditOptions] = useState<FirecrawlOptions | null>(null);
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    
    // Firecrawl options (only for official agents)
    const [firecrawlOptions, setFirecrawlOptions] = useState<FirecrawlOptions>({
        scrapeMethod: "basic",
        crawlDepth: 1,
        autoSync: false,
        syncIntervalHours: 24,
        excludePatterns: "",
        infiniteScroll: false,
        scrollCount: 5,
    });
    
    // Check if this is an official agent
    const isOfficialAgent = agent?.visibility === "official";

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
            // Build request body with Firecrawl options for official agents
            const requestBody: Record<string, unknown> = { 
                userAddress, 
                url: newUrl.trim() 
            };
            
            // Add Firecrawl options if enabled and official agent
            if (isOfficialAgent && firecrawlOptions.scrapeMethod === "firecrawl") {
                requestBody.scrapeMethod = firecrawlOptions.scrapeMethod;
                requestBody.crawlDepth = firecrawlOptions.crawlDepth;
                requestBody.autoSync = firecrawlOptions.autoSync;
                requestBody.syncIntervalHours = firecrawlOptions.syncIntervalHours;
                requestBody.infiniteScroll = firecrawlOptions.infiniteScroll;
                requestBody.scrollCount = firecrawlOptions.scrollCount;
                
                // Parse exclude patterns
                const patterns = firecrawlOptions.excludePatterns
                    .split("\n")
                    .map(p => p.trim())
                    .filter(Boolean);
                if (patterns.length > 0) {
                    requestBody.excludePatterns = patterns;
                }
            }
            
            const res = await fetch(`/api/agents/${agent.id}/knowledge`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to add URL");
            }

            setItems((prev) => [data.item, ...prev]);
            setNewUrl("");
            
            // Reset Firecrawl options after successful add
            setFirecrawlOptions({
                scrapeMethod: "basic",
                crawlDepth: 1,
                autoSync: false,
                syncIntervalHours: 24,
                excludePatterns: "",
                infiniteScroll: false,
                scrollCount: 5,
            });
            setShowAdvanced(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to add URL");
        } finally {
            setIsAdding(false);
        }
    };
    
    // Manual sync trigger for a knowledge item
    const handleManualSync = async (itemId: string) => {
        if (!agent || syncingItemId) return;

        setSyncingItemId(itemId);
        setError(null);

        try {
            const res = await fetch(`/api/cron/sync-knowledge`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    userAddress,
                    knowledgeId: itemId,
                    agentId: agent.id,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to sync");
            }

            // Refresh items to get updated status
            await fetchItems();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to sync");
        } finally {
            setSyncingItemId(null);
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

    // Start editing a knowledge item
    const handleStartEdit = (item: KnowledgeItem) => {
        setEditingItemId(item.id);
        setEditOptions({
            scrapeMethod: item.scrape_method || "basic",
            crawlDepth: item.crawl_depth || 1,
            autoSync: item.auto_sync || false,
            syncIntervalHours: item.sync_interval_hours || 24,
            excludePatterns: (item.exclude_patterns || []).join("\n"),
            infiniteScroll: item.infinite_scroll || false,
            scrollCount: item.scroll_count || 5,
        });
    };

    // Save edit changes
    const handleSaveEdit = async () => {
        if (!agent || !editingItemId || !editOptions) return;

        setIsSavingEdit(true);
        setError(null);

        try {
            const res = await fetch(`/api/agents/${agent.id}/knowledge/${editingItemId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAddress,
                    scrape_method: editOptions.scrapeMethod,
                    crawl_depth: editOptions.crawlDepth,
                    auto_sync: editOptions.autoSync,
                    sync_interval_hours: editOptions.syncIntervalHours,
                    exclude_patterns: editOptions.excludePatterns
                        .split("\n")
                        .map(p => p.trim())
                        .filter(p => p),
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to update");
            }

            // Refresh items to get updated data
            await fetchItems();
            setEditingItemId(null);
            setEditOptions(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to update");
        } finally {
            setIsSavingEdit(false);
        }
    };

    // Cancel edit
    const handleCancelEdit = () => {
        setEditingItemId(null);
        setEditOptions(null);
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
                            {/* Add URL Input */}
                            <div className="mt-4">
                                <div className="flex gap-2">
                                    <input
                                        type="url"
                                        value={newUrl}
                                        onChange={(e) => setNewUrl(e.target.value)}
                                        placeholder="Add URL (GitHub, docs, webpage...)"
                                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !showAdvanced) handleAddUrl();
                                        }}
                                    />
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
                                <p className="text-xs text-zinc-500 mt-2">
                                    Add URLs to help your agent learn. Supports GitHub repos, documentation sites, and web pages.
                                </p>
                                
                                {/* Advanced Options (Official Agents Only) */}
                                {isOfficialAgent && (
                                    <div className="mt-3">
                                        <button
                                            onClick={() => setShowAdvanced(!showAdvanced)}
                                            className="flex items-center gap-2 text-xs text-orange-400 hover:text-orange-300 transition-colors"
                                        >
                                            <svg 
                                                className={`w-4 h-4 transition-transform ${showAdvanced ? "rotate-90" : ""}`} 
                                                fill="none" 
                                                stroke="currentColor" 
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                            <span className="flex items-center gap-1">
                                                🔥 Firecrawl Options
                                                <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded text-[10px] font-medium">
                                                    Official
                                                </span>
                                            </span>
                                        </button>
                                        
                                        <AnimatePresence>
                                            {showAdvanced && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: "auto" }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="mt-3 p-4 bg-zinc-800/50 border border-orange-500/30 rounded-xl space-y-4">
                                                        {/* Scrape Method Toggle */}
                                                        <div>
                                                            <label className="text-xs font-medium text-zinc-300 mb-2 block">
                                                                Scrape Method
                                                            </label>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => setFirecrawlOptions(prev => ({ ...prev, scrapeMethod: "basic" }))}
                                                                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-all ${
                                                                        firecrawlOptions.scrapeMethod === "basic"
                                                                            ? "bg-zinc-700 border-zinc-600 text-white"
                                                                            : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                                                                    }`}
                                                                >
                                                                    Basic (HTML)
                                                                </button>
                                                                <button
                                                                    onClick={() => setFirecrawlOptions(prev => ({ ...prev, scrapeMethod: "firecrawl" }))}
                                                                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-all ${
                                                                        firecrawlOptions.scrapeMethod === "firecrawl"
                                                                            ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
                                                                            : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                                                                    }`}
                                                                >
                                                                    🔥 Firecrawl
                                                                </button>
                                                            </div>
                                                            <p className="text-[10px] text-zinc-500 mt-1">
                                                                Firecrawl provides better content extraction and can crawl multiple pages.
                                                            </p>
                                                        </div>
                                                        
                                                        {firecrawlOptions.scrapeMethod === "firecrawl" && (
                                                            <>
                                                                {/* Crawl Depth */}
                                                                <div>
                                                                    <label className="text-xs font-medium text-zinc-300 mb-2 block">
                                                                        Crawl Depth: {firecrawlOptions.crawlDepth} page{firecrawlOptions.crawlDepth > 1 ? "s" : ""}
                                                                    </label>
                                                                    <input
                                                                        type="range"
                                                                        min={1}
                                                                        max={5}
                                                                        value={firecrawlOptions.crawlDepth}
                                                                        onChange={(e) => setFirecrawlOptions(prev => ({ 
                                                                            ...prev, 
                                                                            crawlDepth: parseInt(e.target.value) 
                                                                        }))}
                                                                        className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                                                    />
                                                                    <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                                                                        <span>1 (single page)</span>
                                                                        <span>5 (deep crawl)</span>
                                                                    </div>
                                                                </div>

                                                                {/* Infinite Scroll */}
                                                                <div className="flex items-center justify-between">
                                                                    <div>
                                                                        <label className="text-xs font-medium text-zinc-300 block">
                                                                            Infinite Scroll
                                                                        </label>
                                                                        <p className="text-[10px] text-zinc-500">
                                                                            For pages that lazy-load content on scroll
                                                                        </p>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => setFirecrawlOptions(prev => ({ 
                                                                            ...prev, 
                                                                            infiniteScroll: !prev.infiniteScroll 
                                                                        }))}
                                                                        className={`w-12 h-6 rounded-full transition-colors relative ${
                                                                            firecrawlOptions.infiniteScroll 
                                                                                ? "bg-orange-500" 
                                                                                : "bg-zinc-700"
                                                                        }`}
                                                                    >
                                                                        <span 
                                                                            className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                                                                                firecrawlOptions.infiniteScroll 
                                                                                    ? "translate-x-7" 
                                                                                    : "translate-x-1"
                                                                            }`}
                                                                        />
                                                                    </button>
                                                                </div>

                                                                {/* Scroll Count (only if infinite scroll enabled) */}
                                                                {firecrawlOptions.infiniteScroll && (
                                                                    <div>
                                                                        <label className="text-xs font-medium text-zinc-300 mb-2 block">
                                                                            Scroll Iterations: {firecrawlOptions.scrollCount}x
                                                                        </label>
                                                                        <div className="flex flex-wrap gap-1">
                                                                            {[5, 10, 25, 50, 100].map((count) => (
                                                                                <button
                                                                                    key={count}
                                                                                    type="button"
                                                                                    onClick={() => setFirecrawlOptions(prev => ({ 
                                                                                        ...prev, 
                                                                                        scrollCount: count 
                                                                                    }))}
                                                                                    className={`px-2 py-1.5 text-xs rounded transition-colors ${
                                                                                        firecrawlOptions.scrollCount === count
                                                                                            ? "bg-orange-500 text-white"
                                                                                            : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                                                                                    }`}
                                                                                >
                                                                                    {count}x
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                        <p className="text-[10px] text-zinc-500 mt-1">
                                                                            ~{Math.round(firecrawlOptions.scrollCount * 1.5)}s • No auto-detect, use higher for long feeds
                                                                        </p>
                                                                    </div>
                                                                )}
                                                                
                                                                {/* Auto Sync */}
                                                                <div className="flex items-center justify-between">
                                                                    <div>
                                                                        <label className="text-xs font-medium text-zinc-300 block">
                                                                            Auto Sync
                                                                        </label>
                                                                        <p className="text-[10px] text-zinc-500">
                                                                            Automatically re-crawl on a schedule
                                                                        </p>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => setFirecrawlOptions(prev => ({ 
                                                                            ...prev, 
                                                                            autoSync: !prev.autoSync 
                                                                        }))}
                                                                        className={`w-12 h-6 rounded-full transition-colors relative ${
                                                                            firecrawlOptions.autoSync 
                                                                                ? "bg-orange-500" 
                                                                                : "bg-zinc-700"
                                                                        }`}
                                                                    >
                                                                        <span 
                                                                            className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                                                                                firecrawlOptions.autoSync 
                                                                                    ? "translate-x-7" 
                                                                                    : "translate-x-1"
                                                                            }`}
                                                                        />
                                                                    </button>
                                                                </div>
                                                                
                                                                {/* Sync Interval (only if auto sync enabled) */}
                                                                {firecrawlOptions.autoSync && (
                                                                    <div>
                                                                        <label className="text-xs font-medium text-zinc-300 mb-2 block">
                                                                            Sync Interval
                                                                        </label>
                                                                        <select
                                                                            value={firecrawlOptions.syncIntervalHours}
                                                                            onChange={(e) => setFirecrawlOptions(prev => ({ 
                                                                                ...prev, 
                                                                                syncIntervalHours: parseInt(e.target.value) 
                                                                            }))}
                                                                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
                                                                        >
                                                                            <option value={6}>Every 6 hours</option>
                                                                            <option value={12}>Every 12 hours</option>
                                                                            <option value={24}>Every 24 hours (daily)</option>
                                                                            <option value={48}>Every 2 days</option>
                                                                            <option value={168}>Every 7 days (weekly)</option>
                                                                        </select>
                                                                    </div>
                                                                )}
                                                                
                                                                {/* Exclude Patterns */}
                                                                <div>
                                                                    <label className="text-xs font-medium text-zinc-300 mb-2 block">
                                                                        Exclude Patterns (optional)
                                                                    </label>
                                                                    <textarea
                                                                        value={firecrawlOptions.excludePatterns}
                                                                        onChange={(e) => setFirecrawlOptions(prev => ({ 
                                                                            ...prev, 
                                                                            excludePatterns: e.target.value 
                                                                        }))}
                                                                        placeholder={"/blog/*\n/pricing\n/login"}
                                                                        rows={3}
                                                                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-orange-500 resize-none"
                                                                    />
                                                                    <p className="text-[10px] text-zinc-500 mt-1">
                                                                        One pattern per line. Use * for wildcards.
                                                                    </p>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}
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
                        <div className="flex-1 overflow-y-auto p-6">
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
                                        const isFirecrawl = item.scrape_method === "firecrawl";
                                        const isSyncing = syncingItemId === item.id;
                                        
                                        return (
                                            <motion.div
                                                key={item.id}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className={`group p-4 bg-zinc-800/50 border rounded-xl hover:border-zinc-600 transition-all ${
                                                    isFirecrawl ? "border-orange-500/30" : "border-zinc-700/50"
                                                }`}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl shrink-0 ${
                                                        isFirecrawl ? "bg-orange-500/20" : "bg-zinc-700/50"
                                                    }`}>
                                                        {isFirecrawl ? "🔥" : CONTENT_TYPE_ICONS[item.content_type]}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h4 className="font-medium text-white truncate">{item.title}</h4>
                                                            <span className={`text-xs px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>
                                                                {status.icon} {status.label}
                                                            </span>
                                                            {isFirecrawl && (
                                                                <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded font-medium">
                                                                    Firecrawl
                                                                </span>
                                                            )}
                                                            {item.auto_sync && (
                                                                <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded font-medium">
                                                                    Auto-sync
                                                                </span>
                                                            )}
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
                                                        <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                                                            {item.status === "indexed" && item.chunk_count > 0 && (
                                                                <span>{item.chunk_count} chunks</span>
                                                            )}
                                                            {item.crawl_depth && item.crawl_depth > 1 && (
                                                                <span>Depth: {item.crawl_depth}</span>
                                                            )}
                                                            {item.last_synced_at && (
                                                                <span title={new Date(item.last_synced_at).toLocaleString()}>
                                                                    Synced: {formatTimeAgo(item.last_synced_at)}
                                                                </span>
                                                            )}
                                                            {item.auto_sync && item.sync_interval_hours && (
                                                                <span>
                                                                    Every {item.sync_interval_hours}h
                                                                </span>
                                                            )}
                                                        </div>
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
                                                        {/* Edit button - show for official agents */}
                                                        {isOfficialAgent && (
                                                            <button
                                                                onClick={() => handleStartEdit(item)}
                                                                className="px-2 py-1.5 text-xs bg-zinc-700/50 hover:bg-zinc-600/50 text-zinc-300 rounded-lg transition-colors flex items-center gap-1"
                                                                title="Edit sync settings"
                                                            >
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                        {/* Manual Sync button - show for indexed Firecrawl items */}
                                                        {item.status === "indexed" && isFirecrawl && isOfficialAgent && (
                                                            <button
                                                                onClick={() => handleManualSync(item.id)}
                                                                disabled={isSyncing}
                                                                className="px-2 py-1.5 text-xs bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded-lg transition-colors flex items-center gap-1"
                                                                title="Manually re-sync this source"
                                                            >
                                                                {isSyncing ? (
                                                                    <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                    </svg>
                                                                )}
                                                                Sync
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
                                                
                                                {/* Edit Form - Expandable */}
                                                <AnimatePresence>
                                                    {editingItemId === item.id && editOptions && (
                                                        <motion.div
                                                            initial={{ opacity: 0, height: 0 }}
                                                            animate={{ opacity: 1, height: "auto" }}
                                                            exit={{ opacity: 0, height: 0 }}
                                                            className="overflow-hidden border-t border-zinc-700/50"
                                                        >
                                                            <div className="p-4 bg-zinc-800/30 space-y-4">
                                                                <div className="text-xs font-medium text-zinc-300 flex items-center gap-2">
                                                                    <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    </svg>
                                                                    Sync Settings
                                                                </div>

                                                                {/* Scrape Method */}
                                                                <div>
                                                                    <label className="text-xs text-zinc-400 mb-1.5 block">Scrape Method</label>
                                                                    <div className="flex gap-2">
                                                                        <button
                                                                            onClick={() => setEditOptions(prev => prev ? { ...prev, scrapeMethod: "basic" } : null)}
                                                                            className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-all ${
                                                                                editOptions.scrapeMethod === "basic"
                                                                                    ? "bg-zinc-700 border-zinc-600 text-white"
                                                                                    : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                                                                            }`}
                                                                        >
                                                                            Basic
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setEditOptions(prev => prev ? { ...prev, scrapeMethod: "firecrawl" } : null)}
                                                                            className={`flex-1 px-3 py-2 text-xs rounded-lg border transition-all ${
                                                                                editOptions.scrapeMethod === "firecrawl"
                                                                                    ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
                                                                                    : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                                                                            }`}
                                                                        >
                                                                            🔥 Firecrawl
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                {editOptions.scrapeMethod === "firecrawl" && (
                                                                    <>
                                                                        {/* Crawl Depth */}
                                                                        <div>
                                                                            <label className="text-xs text-zinc-400 mb-1.5 block">
                                                                                Crawl Depth: {editOptions.crawlDepth} page{editOptions.crawlDepth > 1 ? "s" : ""}
                                                                            </label>
                                                                            <input
                                                                                type="range"
                                                                                min={1}
                                                                                max={5}
                                                                                value={editOptions.crawlDepth}
                                                                                onChange={(e) => setEditOptions(prev => prev ? { 
                                                                                    ...prev, 
                                                                                    crawlDepth: parseInt(e.target.value) 
                                                                                } : null)}
                                                                                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                                                            />
                                                                        </div>

                                                                        {/* Auto Sync Toggle */}
                                                                        <div className="flex items-center justify-between">
                                                                            <div>
                                                                                <label className="text-xs text-zinc-300 block">Auto Sync</label>
                                                                                <p className="text-[10px] text-zinc-500">Re-crawl automatically on schedule</p>
                                                                            </div>
                                                                            <button
                                                                                onClick={() => setEditOptions(prev => prev ? { 
                                                                                    ...prev, 
                                                                                    autoSync: !prev.autoSync 
                                                                                } : null)}
                                                                                className={`w-10 h-5 rounded-full transition-colors relative ${
                                                                                    editOptions.autoSync 
                                                                                        ? "bg-orange-500" 
                                                                                        : "bg-zinc-700"
                                                                                }`}
                                                                            >
                                                                                <span 
                                                                                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                                                                                        editOptions.autoSync 
                                                                                            ? "translate-x-5" 
                                                                                            : "translate-x-0.5"
                                                                                    }`}
                                                                                />
                                                                            </button>
                                                                        </div>

                                                                        {/* Sync Interval */}
                                                                        {editOptions.autoSync && (
                                                                            <div>
                                                                                <label className="text-xs text-zinc-400 mb-1.5 block">Sync Interval</label>
                                                                                <select
                                                                                    value={editOptions.syncIntervalHours}
                                                                                    onChange={(e) => setEditOptions(prev => prev ? { 
                                                                                        ...prev, 
                                                                                        syncIntervalHours: parseInt(e.target.value) 
                                                                                    } : null)}
                                                                                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs focus:outline-none focus:border-orange-500"
                                                                                >
                                                                                    <option value={1}>Every 1 hour</option>
                                                                                    <option value={6}>Every 6 hours</option>
                                                                                    <option value={12}>Every 12 hours</option>
                                                                                    <option value={24}>Every 24 hours (daily)</option>
                                                                                    <option value={48}>Every 2 days</option>
                                                                                    <option value={168}>Every 7 days (weekly)</option>
                                                                                </select>
                                                                            </div>
                                                                        )}

                                                                        {/* Exclude Patterns */}
                                                                        <div>
                                                                            <label className="text-xs text-zinc-400 mb-1.5 block">Exclude Patterns</label>
                                                                            <textarea
                                                                                value={editOptions.excludePatterns}
                                                                                onChange={(e) => setEditOptions(prev => prev ? { 
                                                                                    ...prev, 
                                                                                    excludePatterns: e.target.value 
                                                                                } : null)}
                                                                                placeholder={"/blog/*\n/login"}
                                                                                rows={2}
                                                                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-orange-500 resize-none"
                                                                            />
                                                                        </div>
                                                                    </>
                                                                )}

                                                                {/* Action Buttons */}
                                                                <div className="flex gap-2 pt-2">
                                                                    <button
                                                                        onClick={handleCancelEdit}
                                                                        className="flex-1 px-3 py-2 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg transition-colors"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                    <button
                                                                        onClick={handleSaveEdit}
                                                                        disabled={isSavingEdit}
                                                                        className="flex-1 px-3 py-2 text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-1"
                                                                    >
                                                                        {isSavingEdit ? (
                                                                            <>
                                                                                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                                                </svg>
                                                                                Saving...
                                                                            </>
                                                                        ) : (
                                                                            "Save Changes"
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </motion.div>
                                        );
                                    })}
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
                        <div className="p-4 border-t border-zinc-800 bg-zinc-900/50">
                            <div className="flex items-center justify-between text-xs text-zinc-500">
                                <span>
                                    {items.length}/{isOfficialAgent ? 50 : 10} knowledge sources
                                    {isOfficialAgent && (
                                        <span className="ml-2 text-orange-400">🔥 Official</span>
                                    )}
                                </span>
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
                                    {isOfficialAgent && items.filter(i => i.auto_sync).length > 0 && (
                                        <span className="text-orange-400">
                                            🔄 {items.filter(i => i.auto_sync).length} auto-sync
                                        </span>
                                    )}
                                </span>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

export default AgentKnowledgeModal;

