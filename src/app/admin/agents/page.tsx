"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { AdminLayout } from "@/components/AdminLayout";
import { formatDistanceToNow } from "date-fns";

type AgentKnowledgeStats = {
    totalSources: number;
    indexedSources: number;
    totalChunks: number;
    failedSources: number;
};

type AgentWithKnowledge = {
    id: string;
    name: string;
    avatar_emoji: string | null;
    avatar_url: string | null;
    owner_address: string;
    use_knowledge_base: boolean;
    visibility: string;
    stats: AgentKnowledgeStats;
};

type KnowledgeSource = {
    id: string;
    agent_id: string;
    title: string;
    url: string;
    content_type: string;
    status: string;
    error_message: string | null;
    chunk_count: number;
    created_at: string;
    indexed_at: string | null;
    scrape_method: string | null;
    auto_sync: boolean;
    last_synced_at: string | null;
};

type KnowledgeChunk = {
    id: string;
    chunk_index: number;
    content: string;
    token_count: number;
    created_at: string;
};

export default function AdminAgentsPage() {
    const { isAdmin, isReady, getAuthHeaders } = useAdmin();
    const [agents, setAgents] = useState<AgentWithKnowledge[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Selected agent for detail view
    const [selectedAgent, setSelectedAgent] = useState<AgentWithKnowledge | null>(null);
    const [sources, setSources] = useState<KnowledgeSource[]>([]);
    const [sourcesLoading, setSourcesLoading] = useState(false);

    // Selected source for chunk explorer
    const [selectedSource, setSelectedSource] = useState<KnowledgeSource | null>(null);
    const [chunks, setChunks] = useState<KnowledgeChunk[]>([]);
    const [chunksTotal, setChunksTotal] = useState(0);
    const [chunksLoading, setChunksLoading] = useState(false);
    const [chunkSearch, setChunkSearch] = useState("");
    const [chunkOffset, setChunkOffset] = useState(0);
    const CHUNK_PAGE_SIZE = 20;

    // Expanded chunk for full content view
    const [expandedChunk, setExpandedChunk] = useState<string | null>(null);

    // Fetch agents list
    const fetchAgents = useCallback(async () => {
        const headers = getAuthHeaders();
        if (!headers) return;

        setIsLoading(true);
        try {
            const res = await fetch("/api/admin/agents/knowledge", { headers });
            if (res.ok) {
                const data = await res.json();
                setAgents(data.agents || []);
            }
        } catch (err) {
            console.error("[AdminAgents] Error:", err);
        } finally {
            setIsLoading(false);
        }
    }, [getAuthHeaders]);

    // Fetch sources for selected agent
    const fetchSources = useCallback(
        async (agentId: string) => {
            const headers = getAuthHeaders();
            if (!headers) return;

            setSourcesLoading(true);
            try {
                const res = await fetch(
                    `/api/admin/agents/knowledge?agentId=${agentId}`,
                    { headers },
                );
                if (res.ok) {
                    const data = await res.json();
                    setSources(data.sources || []);
                }
            } catch (err) {
                console.error("[AdminAgents] Error:", err);
            } finally {
                setSourcesLoading(false);
            }
        },
        [getAuthHeaders],
    );

    // Fetch chunks for selected source
    const fetchChunks = useCallback(
        async (knowledgeId: string, offset = 0, search = "") => {
            const headers = getAuthHeaders();
            if (!headers) return;

            setChunksLoading(true);
            try {
                const params = new URLSearchParams({
                    knowledgeId,
                    includeChunks: "true",
                    offset: offset.toString(),
                    limit: CHUNK_PAGE_SIZE.toString(),
                });
                if (search) params.set("search", search);

                const res = await fetch(
                    `/api/admin/agents/knowledge?${params}`,
                    { headers },
                );
                if (res.ok) {
                    const data = await res.json();
                    setChunks(data.chunks || []);
                    setChunksTotal(data.total || 0);
                }
            } catch (err) {
                console.error("[AdminAgents] Error:", err);
            } finally {
                setChunksLoading(false);
            }
        },
        [getAuthHeaders],
    );

    useEffect(() => {
        if (isReady && isAdmin) {
            fetchAgents();
        }
    }, [isReady, isAdmin, fetchAgents]);

    // When selecting an agent
    const handleSelectAgent = (agent: AgentWithKnowledge) => {
        setSelectedAgent(agent);
        setSelectedSource(null);
        setChunks([]);
        setChunkSearch("");
        setChunkOffset(0);
        fetchSources(agent.id);
    };

    // When selecting a source
    const handleSelectSource = (source: KnowledgeSource) => {
        setSelectedSource(source);
        setChunkSearch("");
        setChunkOffset(0);
        fetchChunks(source.id, 0, "");
    };

    // Search chunks
    const handleChunkSearch = (search: string) => {
        setChunkSearch(search);
        setChunkOffset(0);
        if (selectedSource) {
            fetchChunks(selectedSource.id, 0, search);
        }
    };

    // Paginate chunks
    const handleChunkPage = (newOffset: number) => {
        setChunkOffset(newOffset);
        if (selectedSource) {
            fetchChunks(selectedSource.id, newOffset, chunkSearch);
        }
    };

    const statusColors: Record<string, string> = {
        indexed: "text-green-400 bg-green-400/10 border-green-500/30",
        pending: "text-yellow-400 bg-yellow-400/10 border-yellow-500/30",
        processing: "text-blue-400 bg-blue-400/10 border-blue-500/30",
        failed: "text-red-400 bg-red-400/10 border-red-500/30",
    };

    const contentTypeIcons: Record<string, string> = {
        webpage: "🌐",
        github: "🐙",
        docs: "📚",
    };

    if (!isReady || !isAdmin) {
        return (
            <AdminLayout title="Agent Knowledge">
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="text-zinc-500">Loading...</div>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout title="Agent Knowledge">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center gap-3 mb-6">
                    <h1 className="text-2xl font-bold text-white">
                        Agent Knowledge Explorer
                    </h1>
                    <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30">
                        RAG Data
                    </span>
                </div>

                {/* Breadcrumb */}
                <div className="flex items-center gap-2 text-sm mb-6">
                    <button
                        onClick={() => {
                            setSelectedAgent(null);
                            setSelectedSource(null);
                            setChunks([]);
                        }}
                        className={`transition-colors ${
                            !selectedAgent
                                ? "text-white font-medium"
                                : "text-zinc-400 hover:text-white"
                        }`}
                    >
                        All Agents
                    </button>
                    {selectedAgent && (
                        <>
                            <span className="text-zinc-600">/</span>
                            <button
                                onClick={() => {
                                    setSelectedSource(null);
                                    setChunks([]);
                                }}
                                className={`transition-colors ${
                                    !selectedSource
                                        ? "text-white font-medium"
                                        : "text-zinc-400 hover:text-white"
                                }`}
                            >
                                {selectedAgent.avatar_emoji || "🤖"}{" "}
                                {selectedAgent.name}
                            </button>
                        </>
                    )}
                    {selectedSource && (
                        <>
                            <span className="text-zinc-600">/</span>
                            <span className="text-white font-medium">
                                {selectedSource.title}
                            </span>
                        </>
                    )}
                </div>

                {/* Level 1: Agents List */}
                {!selectedAgent && (
                    <div>
                        {isLoading ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {[1, 2, 3].map((i) => (
                                    <div
                                        key={i}
                                        className="h-32 bg-zinc-800/50 rounded-xl animate-pulse"
                                    />
                                ))}
                            </div>
                        ) : agents.length === 0 ? (
                            <div className="text-center py-16 text-zinc-500">
                                <div className="text-4xl mb-3">📚</div>
                                <p>No agents with knowledge bases found</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {agents.map((agent) => (
                                    <button
                                        key={agent.id}
                                        onClick={() =>
                                            handleSelectAgent(agent)
                                        }
                                        className="text-left p-4 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 hover:border-purple-500/30 rounded-xl transition-all group"
                                    >
                                        <div className="flex items-center gap-3 mb-3">
                                            {agent.avatar_url ? (
                                                <img
                                                    src={agent.avatar_url}
                                                    alt=""
                                                    className="w-10 h-10 rounded-lg object-cover"
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-lg bg-purple-900/30 flex items-center justify-center text-lg">
                                                    {agent.avatar_emoji || "🤖"}
                                                </div>
                                            )}
                                            <div>
                                                <h3 className="font-medium text-white group-hover:text-purple-200 transition-colors">
                                                    {agent.name}
                                                </h3>
                                                <span className="text-xs text-zinc-500">
                                                    {agent.visibility === "official" ? "Official" : "User"} agent
                                                </span>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <div className="bg-zinc-900/50 rounded-lg py-2">
                                                <div className="text-lg font-semibold text-white">
                                                    {agent.stats.totalSources}
                                                </div>
                                                <div className="text-[10px] text-zinc-500">
                                                    Sources
                                                </div>
                                            </div>
                                            <div className="bg-zinc-900/50 rounded-lg py-2">
                                                <div className="text-lg font-semibold text-purple-300">
                                                    {agent.stats.totalChunks}
                                                </div>
                                                <div className="text-[10px] text-zinc-500">
                                                    Chunks
                                                </div>
                                            </div>
                                            <div className="bg-zinc-900/50 rounded-lg py-2">
                                                <div className={`text-lg font-semibold ${agent.stats.failedSources > 0 ? "text-red-400" : "text-green-400"}`}>
                                                    {agent.stats.failedSources > 0 ? agent.stats.failedSources : agent.stats.indexedSources}
                                                </div>
                                                <div className="text-[10px] text-zinc-500">
                                                    {agent.stats.failedSources > 0 ? "Failed" : "Indexed"}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Level 2: Knowledge Sources */}
                {selectedAgent && !selectedSource && (
                    <div>
                        {sourcesLoading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map((i) => (
                                    <div
                                        key={i}
                                        className="h-20 bg-zinc-800/50 rounded-xl animate-pulse"
                                    />
                                ))}
                            </div>
                        ) : sources.length === 0 ? (
                            <div className="text-center py-16 text-zinc-500">
                                <div className="text-4xl mb-3">🔍</div>
                                <p>No knowledge sources for this agent</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {/* Stats summary */}
                                <div className="flex gap-3 mb-4">
                                    <div className="px-4 py-2 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                                        <span className="text-zinc-400 text-sm">
                                            {sources.length} source{sources.length !== 1 ? "s" : ""}
                                        </span>
                                    </div>
                                    <div className="px-4 py-2 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                                        <span className="text-purple-300 text-sm">
                                            {sources.reduce((sum, s) => sum + (s.chunk_count || 0), 0)} total chunks
                                        </span>
                                    </div>
                                </div>

                                {sources.map((source) => (
                                    <button
                                        key={source.id}
                                        onClick={() =>
                                            source.status === "indexed"
                                                ? handleSelectSource(source)
                                                : undefined
                                        }
                                        disabled={source.status !== "indexed"}
                                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                                            source.status === "indexed"
                                                ? "bg-zinc-800/50 hover:bg-zinc-800 border-zinc-700/50 hover:border-purple-500/30 cursor-pointer"
                                                : "bg-zinc-800/30 border-zinc-700/30 cursor-default opacity-70"
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span>
                                                        {contentTypeIcons[source.content_type] || "📄"}
                                                    </span>
                                                    <h4 className="font-medium text-white truncate">
                                                        {source.title}
                                                    </h4>
                                                    <span
                                                        className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColors[source.status] || "text-zinc-400"}`}
                                                    >
                                                        {source.status}
                                                    </span>
                                                    {source.auto_sync && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                                                            auto-sync
                                                        </span>
                                                    )}
                                                </div>
                                                <a
                                                    href={source.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-zinc-500 hover:text-purple-400 truncate block"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {source.url}
                                                </a>
                                                {source.error_message && (
                                                    <p className="text-xs text-red-400 mt-1 line-clamp-2">
                                                        {source.error_message}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                                <div className="text-lg font-semibold text-purple-300">
                                                    {source.chunk_count}
                                                </div>
                                                <div className="text-[10px] text-zinc-500">
                                                    chunks
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 mt-2 text-[10px] text-zinc-600">
                                            <span>
                                                Added{" "}
                                                {formatDistanceToNow(new Date(source.created_at), { addSuffix: true })}
                                            </span>
                                            {source.indexed_at && (
                                                <span>
                                                    Indexed{" "}
                                                    {formatDistanceToNow(new Date(source.indexed_at), { addSuffix: true })}
                                                </span>
                                            )}
                                            {source.last_synced_at && (
                                                <span>
                                                    Synced{" "}
                                                    {formatDistanceToNow(new Date(source.last_synced_at), { addSuffix: true })}
                                                </span>
                                            )}
                                            {source.scrape_method && (
                                                <span className="uppercase">
                                                    {source.scrape_method}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Level 3: Chunk Explorer */}
                {selectedSource && (
                    <div>
                        {/* Search bar */}
                        <div className="flex items-center gap-3 mb-4">
                            <div className="relative flex-1">
                                <svg
                                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
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
                                <input
                                    type="text"
                                    placeholder="Search chunks..."
                                    value={chunkSearch}
                                    onChange={(e) => handleChunkSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50"
                                />
                            </div>
                            <div className="text-sm text-zinc-400 flex-shrink-0">
                                {chunksTotal} chunk{chunksTotal !== 1 ? "s" : ""}
                            </div>
                        </div>

                        {chunksLoading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map((i) => (
                                    <div
                                        key={i}
                                        className="h-24 bg-zinc-800/50 rounded-xl animate-pulse"
                                    />
                                ))}
                            </div>
                        ) : chunks.length === 0 ? (
                            <div className="text-center py-16 text-zinc-500">
                                <div className="text-4xl mb-3">📭</div>
                                <p>
                                    {chunkSearch
                                        ? "No chunks match your search"
                                        : "No chunks found"}
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    {chunks.map((chunk) => {
                                        const isExpanded = expandedChunk === chunk.id;
                                        return (
                                            <button
                                                key={chunk.id}
                                                onClick={() =>
                                                    setExpandedChunk(
                                                        isExpanded ? null : chunk.id,
                                                    )
                                                }
                                                className="w-full text-left p-4 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 rounded-xl transition-all"
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs px-2 py-0.5 bg-purple-500/10 text-purple-300 rounded-full border border-purple-500/30 font-mono">
                                                            #{chunk.chunk_index}
                                                        </span>
                                                        <span className="text-[10px] text-zinc-500">
                                                            {chunk.token_count} tokens
                                                        </span>
                                                    </div>
                                                    <svg
                                                        className={`w-4 h-4 text-zinc-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M19 9l-7 7-7-7"
                                                        />
                                                    </svg>
                                                </div>
                                                <div
                                                    className={`text-sm text-zinc-300 whitespace-pre-wrap ${
                                                        isExpanded
                                                            ? ""
                                                            : "line-clamp-3"
                                                    }`}
                                                >
                                                    {chunk.content}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Pagination */}
                                {chunksTotal > CHUNK_PAGE_SIZE && (
                                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-zinc-800">
                                        <button
                                            onClick={() =>
                                                handleChunkPage(
                                                    Math.max(0, chunkOffset - CHUNK_PAGE_SIZE),
                                                )
                                            }
                                            disabled={chunkOffset === 0}
                                            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-300 transition-colors"
                                        >
                                            Previous
                                        </button>
                                        <span className="text-sm text-zinc-500">
                                            {chunkOffset + 1}-
                                            {Math.min(chunkOffset + CHUNK_PAGE_SIZE, chunksTotal)}{" "}
                                            of {chunksTotal}
                                        </span>
                                        <button
                                            onClick={() =>
                                                handleChunkPage(chunkOffset + CHUNK_PAGE_SIZE)
                                            }
                                            disabled={
                                                chunkOffset + CHUNK_PAGE_SIZE >= chunksTotal
                                            }
                                            className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-zinc-300 transition-colors"
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
