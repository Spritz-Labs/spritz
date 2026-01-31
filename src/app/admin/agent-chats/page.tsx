"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { AdminLayout } from "@/components/AdminLayout";

type ToolCallEntry = {
    server: string;
    toolName: string;
    args?: Record<string, unknown>;
};

type ToolErrorEntry = {
    server: string;
    toolName: string;
    error?: string;
};

type AgentChat = {
    id: string;
    agent_id: string;
    agent_name: string | null;
    agent_emoji: string | null;
    user_address: string;
    role: string;
    content: string;
    source: string | null;
    channel_id: string | null;
    channel_type: string | null;
    session_id: string | null;
    created_at: string;
    tool_calls: ToolCallEntry[] | null;
    tool_errors: ToolErrorEntry[] | null;
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
    model: string | null;
    latency_ms: number | null;
    estimated_cost_usd: number | null;
    error_code: string | null;
    error_message: string | null;
    feedback_type: "up" | "down" | null;
    feedback_at: string | null;
    feedback_by: string | null;
};

type AgentOption = {
    id: string;
    name: string;
    avatar_emoji: string | null;
};

type AgentSummary = {
    agent_id: string;
    agent_name: string | null;
    agent_emoji: string | null;
    message_count: number;
    total_tokens: number;
    avg_latency_ms: number | null;
    tool_call_count: number;
    estimated_cost_usd: number;
    conversation_count: number;
};

const SOURCE_LABELS: Record<string, string> = {
    direct: "Direct (1:1)",
    public: "Public page",
    channel: "Channel (@mention)",
};

const CONTENT_PREVIEW_LEN = 80;

function truncate(str: string, len: number): string {
    if (str.length <= len) return str;
    return str.slice(0, len).trim() + "…";
}

export default function AdminAgentChatsPage() {
    const { isAdmin, isReady, getAuthHeaders } = useAdmin();
    const [chats, setChats] = useState<AgentChat[]>([]);
    const [agents, setAgents] = useState<AgentOption[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [period, setPeriod] = useState<"24h" | "7d" | "30d">("7d");
    const [agentId, setAgentId] = useState<string>("");
    const [source, setSource] = useState<string>("");
    const [role, setRole] = useState<string>("");
    const [hasToolCalls, setHasToolCalls] = useState(false);
    const [userAddress, setUserAddress] = useState("");
    const [contentSearch, setContentSearch] = useState("");
    const [limit, setLimit] = useState(50);
    const [offset, setOffset] = useState(0);
    const [isExporting, setIsExporting] = useState(false);
    const [summary, setSummary] = useState<AgentSummary[] | null>(null);
    const [feedbackUpdating, setFeedbackUpdating] = useState<string | null>(
        null,
    );

    const fetchSummary = useCallback(async () => {
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;
        try {
            const params = new URLSearchParams();
            params.set("period", period);
            if (agentId) params.set("agent_id", agentId);
            const res = await fetch(
                `/api/admin/agent-chats/summary?${params}`,
                {
                    headers: authHeaders,
                },
            );
            if (res.ok) {
                const data = await res.json();
                setSummary(data.byAgent ?? []);
            }
        } catch (err) {
            console.error("Failed to fetch summary:", err);
        }
    }, [getAuthHeaders, period, agentId]);

    const fetchChats = useCallback(
        async (exportLimit?: number) => {
            const authHeaders = getAuthHeaders();
            if (!authHeaders) return null;
            if (!exportLimit) setIsLoading(true);
            try {
                const params = new URLSearchParams();
                params.set("period", period);
                params.set("limit", (exportLimit ?? limit).toString());
                params.set("offset", exportLimit ? "0" : offset.toString());
                if (agentId) params.set("agent_id", agentId);
                if (source) params.set("source", source);
                if (role) params.set("role", role);
                if (hasToolCalls) params.set("has_tool_calls", "true");
                if (userAddress.trim())
                    params.set("user_address", userAddress.trim());
                if (contentSearch.trim())
                    params.set("content", contentSearch.trim());

                const res = await fetch(`/api/admin/agent-chats?${params}`, {
                    headers: authHeaders,
                });
                if (res.ok) {
                    const data = await res.json();
                    if (!exportLimit) {
                        setChats(data.chats ?? []);
                        setAgents(data.agents ?? []);
                        setTotal(data.total ?? 0);
                    }
                    return data as { chats: AgentChat[]; total: number };
                }
                return null;
            } catch (err) {
                console.error("Failed to fetch agent chats:", err);
                return null;
            } finally {
                if (!exportLimit) setIsLoading(false);
            }
        },
        [
            getAuthHeaders,
            period,
            agentId,
            source,
            role,
            hasToolCalls,
            userAddress,
            contentSearch,
            limit,
            offset,
        ],
    );

    useEffect(() => {
        if (isAdmin && isReady) {
            void fetchChats();
        }
    }, [isAdmin, isReady, fetchChats]);

    useEffect(() => {
        if (isAdmin && isReady) {
            void fetchSummary();
        }
    }, [isAdmin, isReady, fetchSummary]);

    async function setFeedback(
        chatId: string,
        feedbackType: "up" | "down" | null,
    ) {
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;
        setFeedbackUpdating(chatId);
        try {
            const res = await fetch(
                `/api/admin/agent-chats/${chatId}/feedback`,
                {
                    method: "PATCH",
                    headers: {
                        ...authHeaders,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ feedback_type: feedbackType }),
                },
            );
            if (res.ok) {
                setChats((prev) =>
                    prev.map((c) =>
                        c.id === chatId
                            ? {
                                  ...c,
                                  feedback_type: feedbackType,
                                  feedback_at: feedbackType
                                      ? new Date().toISOString()
                                      : null,
                                  feedback_by: feedbackType ? "admin" : null,
                              }
                            : c,
                    ),
                );
            }
        } finally {
            setFeedbackUpdating(null);
        }
    }

    const resetOffset = () => setOffset(0);

    function downloadBlob(blob: Blob, filename: string) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    async function exportCurrentPage(format: "json" | "csv") {
        const rows = chats;
        if (rows.length === 0) return;
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const base = `agent-chats-page-${ts}`;
        if (format === "json") {
            downloadBlob(
                new Blob([JSON.stringify(rows, null, 2)], {
                    type: "application/json",
                }),
                `${base}.json`,
            );
        } else {
            const headers = [
                "created_at",
                "agent_name",
                "user_address",
                "source",
                "role",
                "content",
                "tool_calls",
                "tool_errors",
                "input_tokens",
                "output_tokens",
                "total_tokens",
                "model",
                "latency_ms",
                "estimated_cost_usd",
                "error_code",
                "error_message",
                "feedback_type",
            ];
            const csvRows = [
                headers.join(","),
                ...rows.map((c) =>
                    headers
                        .map((h) => {
                            const v = (c as Record<string, unknown>)[h];
                            if (v == null) return "";
                            if (typeof v === "object")
                                return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
                            return `"${String(v).replace(/"/g, '""')}"`;
                        })
                        .join(","),
                ),
            ];
            downloadBlob(
                new Blob([csvRows.join("\n")], { type: "text/csv" }),
                `${base}.csv`,
            );
        }
    }

    async function exportAllInPeriod() {
        setIsExporting(true);
        try {
            const data = await fetchChats(500);
            if (!data?.chats?.length) {
                alert("No rows to export.");
                return;
            }
            const ts = new Date()
                .toISOString()
                .replace(/[:.]/g, "-")
                .slice(0, 19);
            downloadBlob(
                new Blob([JSON.stringify(data.chats, null, 2)], {
                    type: "application/json",
                }),
                `agent-chats-all-${ts}.json`,
            );
        } finally {
            setIsExporting(false);
        }
    }

    if (!isReady) {
        return (
            <AdminLayout title="Agent Chats">
                <div className="flex justify-center py-12">
                    <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full" />
                </div>
            </AdminLayout>
        );
    }

    if (!isAdmin) {
        return (
            <AdminLayout title="Agent Chats">
                <div className="text-center py-12 text-zinc-400">
                    Admin access required.
                </div>
            </AdminLayout>
        );
    }

    const totalPages = Math.ceil(total / limit) || 1;
    const currentPage = Math.floor(offset / limit) + 1;

    return (
        <AdminLayout
            title="Official Agent Chats"
            subtitle="Chat interactions for Official Agents only"
        >
            <div className="flex flex-col gap-4">
                {/* Filters */}
                <div className="bg-zinc-900 rounded-xl p-4 flex flex-wrap gap-4 items-center">
                    <select
                        value={period}
                        onChange={(e) => {
                            setPeriod(e.target.value as "24h" | "7d" | "30d");
                            resetOffset();
                        }}
                        className="bg-zinc-800 text-white px-3 py-2 rounded-lg border border-zinc-700"
                    >
                        <option value="24h">Last 24h</option>
                        <option value="7d">Last 7 days</option>
                        <option value="30d">Last 30 days</option>
                    </select>
                    <select
                        value={agentId}
                        onChange={(e) => {
                            setAgentId(e.target.value);
                            resetOffset();
                        }}
                        className="bg-zinc-800 text-white px-3 py-2 rounded-lg border border-zinc-700 min-w-[180px]"
                    >
                        <option value="">All agents</option>
                        {agents.map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.avatar_emoji ?? "🤖"} {a.name}
                            </option>
                        ))}
                    </select>
                    <select
                        value={source}
                        onChange={(e) => {
                            setSource(e.target.value);
                            resetOffset();
                        }}
                        className="bg-zinc-800 text-white px-3 py-2 rounded-lg border border-zinc-700"
                    >
                        <option value="">All sources</option>
                        <option value="direct">Direct (1:1)</option>
                        <option value="public">Public page</option>
                        <option value="channel">Channel</option>
                    </select>
                    <select
                        value={role}
                        onChange={(e) => {
                            setRole(e.target.value);
                            resetOffset();
                        }}
                        className="bg-zinc-800 text-white px-3 py-2 rounded-lg border border-zinc-700"
                    >
                        <option value="">All roles</option>
                        <option value="user">User</option>
                        <option value="assistant">Assistant</option>
                    </select>
                    <label className="flex items-center gap-2 text-zinc-300 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={hasToolCalls}
                            onChange={(e) => {
                                setHasToolCalls(e.target.checked);
                                resetOffset();
                            }}
                            className="rounded border-zinc-600 bg-zinc-800 text-orange-500 focus:ring-orange-500"
                        />
                        With tool calls
                    </label>
                    <input
                        type="text"
                        placeholder="User address…"
                        value={userAddress}
                        onChange={(e) => setUserAddress(e.target.value)}
                        onBlur={() => {
                            resetOffset();
                            void fetchChats();
                        }}
                        onKeyDown={(e) =>
                            e.key === "Enter" &&
                            (resetOffset(), void fetchChats())
                        }
                        className="bg-zinc-800 text-white px-3 py-2 rounded-lg border border-zinc-700 w-40 font-mono text-xs placeholder-zinc-500"
                    />
                    <input
                        type="text"
                        placeholder="Content search…"
                        value={contentSearch}
                        onChange={(e) => setContentSearch(e.target.value)}
                        onBlur={() => {
                            resetOffset();
                            void fetchChats();
                        }}
                        onKeyDown={(e) =>
                            e.key === "Enter" &&
                            (resetOffset(), void fetchChats())
                        }
                        className="bg-zinc-800 text-white px-3 py-2 rounded-lg border border-zinc-700 w-44 placeholder-zinc-500"
                    />
                    <select
                        value={limit}
                        onChange={(e) => {
                            setLimit(Number(e.target.value));
                            resetOffset();
                        }}
                        className="bg-zinc-800 text-white px-3 py-2 rounded-lg border border-zinc-700"
                    >
                        <option value={50}>50 per page</option>
                        <option value={100}>100 per page</option>
                        <option value={200}>200 per page</option>
                        <option value={500}>500 per page</option>
                    </select>
                    <button
                        onClick={() => void fetchChats()}
                        className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg flex items-center gap-2"
                    >
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                        Refresh
                    </button>
                    <span className="text-zinc-500 text-sm">
                        {total} message{total !== 1 ? "s" : ""}
                    </span>
                    <div className="ml-auto flex items-center gap-2 flex-wrap">
                        <span className="text-zinc-500 text-sm mr-1">
                            Export:
                        </span>
                        <button
                            onClick={() => exportCurrentPage("json")}
                            disabled={chats.length === 0}
                            className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white rounded-lg text-sm"
                            title="Download current page as JSON"
                        >
                            Page JSON
                        </button>
                        <button
                            onClick={() => exportCurrentPage("csv")}
                            disabled={chats.length === 0}
                            className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white rounded-lg text-sm"
                            title="Download current page as CSV"
                        >
                            Page CSV
                        </button>
                        <button
                            onClick={() => void exportAllInPeriod()}
                            disabled={isExporting}
                            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-lg text-sm flex items-center gap-1"
                            title="Download all matching rows in period (up to 500) as JSON"
                        >
                            {isExporting ? (
                                <>
                                    <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Exporting…
                                </>
                            ) : (
                                "All (JSON, max 500)"
                            )}
                        </button>
                    </div>
                </div>

                {/* Per-agent summary (dashboard) */}
                {summary && summary.length > 0 && (
                    <div className="bg-zinc-900 rounded-xl p-4">
                        <h3 className="text-sm font-medium text-zinc-400 mb-3">
                            Summary ({period})
                            {agentId ? " — selected agent" : " — all agents"}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {summary.map((s) => (
                                <div
                                    key={s.agent_id}
                                    className="bg-zinc-800 rounded-lg p-3 border border-zinc-700"
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <span>{s.agent_emoji ?? "🤖"}</span>
                                        <span className="font-medium text-white truncate">
                                            {s.agent_name ?? "—"}
                                        </span>
                                    </div>
                                    <dl className="text-xs space-y-1 text-zinc-400">
                                        <div className="flex justify-between">
                                            <span>Messages</span>
                                            <span className="text-zinc-300">
                                                {s.message_count}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Conversations</span>
                                            <span className="text-zinc-300">
                                                {s.conversation_count}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Tokens</span>
                                            <span className="text-zinc-300">
                                                {s.total_tokens.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Tool calls</span>
                                            <span className="text-zinc-300">
                                                {s.tool_call_count}
                                            </span>
                                        </div>
                                        {s.avg_latency_ms != null && (
                                            <div className="flex justify-between">
                                                <span>Avg latency</span>
                                                <span className="text-zinc-300">
                                                    {s.avg_latency_ms}ms
                                                </span>
                                            </div>
                                        )}
                                        {s.estimated_cost_usd > 0 && (
                                            <div className="flex justify-between">
                                                <span>Est. cost</span>
                                                <span className="text-amber-400">
                                                    $
                                                    {s.estimated_cost_usd.toFixed(
                                                        4,
                                                    )}
                                                </span>
                                            </div>
                                        )}
                                    </dl>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="bg-zinc-900 rounded-xl overflow-hidden">
                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full" />
                        </div>
                    ) : chats.length === 0 ? (
                        <div className="text-center py-12 text-zinc-500">
                            No chat messages found for Official Agents in this
                            period.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-zinc-800 text-zinc-400 text-sm">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">
                                            Time
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                            Agent
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                            User
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                            Source
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                            Role
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                            Content
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                            Tools / Tokens
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                            Cost / Error
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                            Feedback
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                            Channel
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800">
                                    {chats.map((c) => (
                                        <motion.tr
                                            key={c.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="text-zinc-300"
                                        >
                                            <td className="px-4 py-2 text-xs whitespace-nowrap">
                                                {formatDistanceToNow(
                                                    new Date(c.created_at),
                                                    { addSuffix: true },
                                                )}
                                            </td>
                                            <td className="px-4 py-2 whitespace-nowrap">
                                                <span className="mr-1">
                                                    {c.agent_emoji ?? "🤖"}
                                                </span>
                                                {c.agent_name ?? "—"}
                                            </td>
                                            <td className="px-4 py-2 font-mono text-xs">
                                                {c.user_address.slice(0, 6)}…
                                                {c.user_address.slice(-4)}
                                            </td>
                                            <td className="px-4 py-2 text-sm">
                                                {c.source
                                                    ? (SOURCE_LABELS[
                                                          c.source
                                                      ] ?? c.source)
                                                    : "—"}
                                            </td>
                                            <td className="px-4 py-2">
                                                <span
                                                    className={
                                                        c.role === "user"
                                                            ? "text-amber-400"
                                                            : "text-blue-400"
                                                    }
                                                >
                                                    {c.role}
                                                </span>
                                            </td>
                                            <td
                                                className="px-4 py-2 max-w-[240px]"
                                                title={c.content}
                                            >
                                                {truncate(
                                                    c.content || "",
                                                    CONTENT_PREVIEW_LEN,
                                                )}
                                            </td>
                                            <td className="px-4 py-2 text-xs max-w-[200px]">
                                                {c.role === "user" && "—"}
                                                {c.role === "assistant" &&
                                                    ((c.tool_calls?.length ??
                                                        0) > 0 ||
                                                    c.total_tokens != null ||
                                                    c.input_tokens != null ||
                                                    c.output_tokens != null ||
                                                    c.latency_ms != null ||
                                                    c.model ? (
                                                        <>
                                                            {(c.tool_calls
                                                                ?.length ?? 0) >
                                                                0 && (
                                                                <span
                                                                    className="text-amber-400"
                                                                    title={JSON.stringify(
                                                                        c.tool_calls,
                                                                    )}
                                                                >
                                                                    🔧{" "}
                                                                    {
                                                                        c
                                                                            .tool_calls!
                                                                            .length
                                                                    }{" "}
                                                                    tool
                                                                    {c
                                                                        .tool_calls!
                                                                        .length !==
                                                                    1
                                                                        ? "s"
                                                                        : ""}
                                                                </span>
                                                            )}
                                                            {(c.total_tokens !=
                                                                null ||
                                                                c.input_tokens !=
                                                                    null ||
                                                                c.output_tokens !=
                                                                    null) && (
                                                                <span
                                                                    className="text-zinc-500 ml-1"
                                                                    title={`in: ${c.input_tokens ?? "—"} out: ${c.output_tokens ?? "—"}`}
                                                                >
                                                                    {c.total_tokens !=
                                                                        null &&
                                                                        `${c.total_tokens} tok`}
                                                                    {c.latency_ms !=
                                                                        null &&
                                                                        ` · ${c.latency_ms}ms`}
                                                                </span>
                                                            )}
                                                            {c.model && (
                                                                <span
                                                                    className="text-zinc-600 ml-1 block truncate"
                                                                    title={
                                                                        c.model
                                                                    }
                                                                >
                                                                    {c.model}
                                                                </span>
                                                            )}
                                                        </>
                                                    ) : (
                                                        "—"
                                                    ))}
                                            </td>
                                            <td className="px-4 py-2 text-xs">
                                                {c.estimated_cost_usd != null &&
                                                    c.estimated_cost_usd >
                                                        0 && (
                                                        <span className="text-amber-400">
                                                            $
                                                            {c.estimated_cost_usd.toFixed(
                                                                4,
                                                            )}
                                                        </span>
                                                    )}
                                                {c.error_code && (
                                                    <span
                                                        className="text-red-400 ml-1"
                                                        title={
                                                            c.error_message ??
                                                            undefined
                                                        }
                                                    >
                                                        {c.error_code}
                                                    </span>
                                                )}
                                                {(c.estimated_cost_usd ==
                                                    null ||
                                                    c.estimated_cost_usd ===
                                                        0) &&
                                                    !c.error_code &&
                                                    "—"}
                                            </td>
                                            <td className="px-4 py-2">
                                                <div className="flex items-center gap-0.5">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            void setFeedback(
                                                                c.id,
                                                                c.feedback_type ===
                                                                    "up"
                                                                    ? null
                                                                    : "up",
                                                            )
                                                        }
                                                        disabled={
                                                            feedbackUpdating ===
                                                            c.id
                                                        }
                                                        title="Thumbs up"
                                                        className={`p-1 rounded ${c.feedback_type === "up" ? "bg-emerald-600 text-white" : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"}`}
                                                    >
                                                        <svg
                                                            className="w-4 h-4"
                                                            fill="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-2V9a2 2 0 00-2-2h-4z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            void setFeedback(
                                                                c.id,
                                                                c.feedback_type ===
                                                                    "down"
                                                                    ? null
                                                                    : "down",
                                                            )
                                                        }
                                                        disabled={
                                                            feedbackUpdating ===
                                                            c.id
                                                        }
                                                        title="Thumbs down"
                                                        className={`p-1 rounded ${c.feedback_type === "down" ? "bg-red-600 text-white" : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"}`}
                                                    >
                                                        <svg
                                                            className="w-4 h-4"
                                                            fill="currentColor"
                                                            viewBox="0 0 24 24"
                                                        >
                                                            <path d="M10 15v4a3 3 0 003 3l4-9V2H6.72a2 2 0 00-2 2v10a2 2 0 002 2h4z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2 text-xs">
                                                {c.source === "channel" &&
                                                c.channel_id
                                                    ? `${c.channel_type ?? "?"}`
                                                    : "—"}
                                            </td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {total > limit && (
                        <div className="flex items-center justify-between px-4 py-3 bg-zinc-800 border-t border-zinc-700">
                            <span className="text-zinc-500 text-sm">
                                Page {currentPage} of {totalPages}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() =>
                                        setOffset((o) => Math.max(0, o - limit))
                                    }
                                    disabled={offset === 0}
                                    className="px-3 py-1 rounded bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm"
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => setOffset((o) => o + limit)}
                                    disabled={offset + limit >= total}
                                    className="px-3 py-1 rounded bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}
