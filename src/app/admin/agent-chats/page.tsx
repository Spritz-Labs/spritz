"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { AdminLayout } from "@/components/AdminLayout";

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
};

type AgentOption = {
    id: string;
    name: string;
    avatar_emoji: string | null;
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
    const [offset, setOffset] = useState(0);
    const limit = 50;

    const fetchChats = useCallback(async () => {
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            params.set("period", period);
            params.set("limit", limit.toString());
            params.set("offset", offset.toString());
            if (agentId) params.set("agent_id", agentId);
            if (source) params.set("source", source);

            const res = await fetch(`/api/admin/agent-chats?${params}`, {
                headers: authHeaders,
            });
            if (res.ok) {
                const data = await res.json();
                setChats(data.chats ?? []);
                setAgents(data.agents ?? []);
                setTotal(data.total ?? 0);
            }
        } catch (err) {
            console.error("Failed to fetch agent chats:", err);
        } finally {
            setIsLoading(false);
        }
    }, [getAuthHeaders, period, agentId, source, offset]);

    useEffect(() => {
        if (isAdmin && isReady) {
            fetchChats();
        }
    }, [isAdmin, isReady, fetchChats]);

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
                            setOffset(0);
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
                            setOffset(0);
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
                            setOffset(0);
                        }}
                        className="bg-zinc-800 text-white px-3 py-2 rounded-lg border border-zinc-700"
                    >
                        <option value="">All sources</option>
                        <option value="direct">Direct (1:1)</option>
                        <option value="public">Public page</option>
                        <option value="channel">Channel</option>
                    </select>
                    <button
                        onClick={() => fetchChats()}
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
                    <span className="text-zinc-500 text-sm ml-auto">
                        {total} message{total !== 1 ? "s" : ""} in period
                    </span>
                </div>

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
