"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { motion, AnimatePresence } from "motion/react";
import { AdminLayout, AdminAuthWrapper, AdminLoading } from "@/components/AdminLayout";
import type { AdminChat, AdminChatsResponse } from "@/app/api/admin/chats/route";

type FilterType = "all" | "standard" | "waku" | "poap_event" | "poap_collection" | "location";
type ViewTab = "channels" | "locations" | "official";

const TYPE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
    standard: { label: "Standard", emoji: "☁️", color: "bg-blue-500/20 text-blue-400" },
    waku: { label: "Decentralized", emoji: "🌐", color: "bg-purple-500/20 text-purple-400" },
    poap_event: { label: "POAP Event", emoji: "🎫", color: "bg-pink-500/20 text-pink-400" },
    poap_collection: { label: "POAP Collection", emoji: "📚", color: "bg-amber-500/20 text-amber-400" },
    location: { label: "Location", emoji: "📍", color: "bg-red-500/20 text-red-400" },
};

export default function AdminChatsPage() {
    const {
        isAdmin,
        isAuthenticated,
        isReady,
        isLoading,
        error,
        isConnected,
        signIn,
        getAuthHeaders,
    } = useAdmin();

    const [data, setData] = useState<AdminChatsResponse | null>(null);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [activeTab, setActiveTab] = useState<ViewTab>("channels");
    const [filterType, setFilterType] = useState<FilterType>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [updatingChat, setUpdatingChat] = useState<string | null>(null);
    const [editingSlug, setEditingSlug] = useState<string | null>(null);
    const [slugInput, setSlugInput] = useState("");
    const [slugError, setSlugError] = useState<string | null>(null);
    const [slugSaving, setSlugSaving] = useState(false);
    const [officialSearch, setOfficialSearch] = useState("");

    const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    const formatDate = (date: string) => new Date(date).toLocaleDateString();

    const fetchData = useCallback(async () => {
        if (!isReady) return;
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;

        setIsLoadingData(true);
        try {
            const res = await fetch("/api/admin/chats", { headers: authHeaders });
            if (res.ok) {
                const chatsData = await res.json();
                setData(chatsData);
            }
        } catch (err) {
            console.error("[Admin Chats] Error fetching data:", err);
        } finally {
            setIsLoadingData(false);
        }
    }, [isReady, getAuthHeaders]);

    useEffect(() => {
        if (isAuthenticated && isAdmin) {
            fetchData();
        }
    }, [isAuthenticated, isAdmin, fetchData]);

    const updateChat = async (id: string, type: string, updates: { isActive?: boolean; isOfficial?: boolean }) => {
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;

        setUpdatingChat(id);
        try {
            const res = await fetch("/api/admin/chats", {
                method: "PATCH",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ id, type, ...updates }),
            });

            if (res.ok) {
                fetchData();
            }
        } catch (err) {
            console.error("[Admin Chats] Update error:", err);
        } finally {
            setUpdatingChat(null);
        }
    };

    const updateSlug = async (id: string, slug: string | null) => {
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;

        setSlugSaving(true);
        setSlugError(null);
        try {
            const res = await fetch("/api/admin/chats", {
                method: "PATCH",
                headers: { "Content-Type": "application/json", ...authHeaders },
                body: JSON.stringify({ id, type: "standard", slug: slug || null }),
            });

            const result = await res.json();
            if (res.ok) {
                setEditingSlug(null);
                setSlugInput("");
                fetchData();
            } else {
                setSlugError(result.error || "Failed to update slug");
            }
        } catch (err) {
            console.error("[Admin Chats] Slug update error:", err);
            setSlugError("Failed to update slug");
        } finally {
            setSlugSaving(false);
        }
    };

    // Official channels list (only official channels)
    const officialChannels = data?.channels.filter((ch) => {
        const isOfficial = ch.is_official;
        const matchesSearch = !officialSearch ||
            ch.name.toLowerCase().includes(officialSearch.toLowerCase()) ||
            ch.slug?.toLowerCase().includes(officialSearch.toLowerCase()) ||
            ch.description?.toLowerCase().includes(officialSearch.toLowerCase());
        return isOfficial && matchesSearch;
    }) || [];

    // Filter and search logic
    const filteredChannels = data?.channels.filter((ch) => {
        const matchesType = filterType === "all" || ch.type === filterType;
        const matchesSearch = !searchQuery ||
            ch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            ch.description?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesType && matchesSearch;
    }) || [];

    const filteredLocationChats = data?.locationChats.filter((lc) => {
        const matchesSearch = !searchQuery ||
            lc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            lc.google_place_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            lc.google_place_address?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesSearch;
    }) || [];

    // Loading state
    if (isLoading) {
        return <AdminLoading />;
    }

    // Auth states
    if (!isAuthenticated) {
        return (
            <AdminAuthWrapper title="Public Chats">
                {!isConnected ? (
                    <>
                        <p className="text-zinc-400 mb-6">Connect your wallet to manage public chats.</p>
                        <div className="mb-4"><appkit-button /></div>
                    </>
                ) : (
                    <>
                        <p className="text-zinc-400 mb-6">Sign in to manage public chats.</p>
                        <button onClick={signIn} className="w-full py-3 px-4 bg-[#FF5500] hover:bg-[#E04D00] text-white font-semibold rounded-xl transition-colors mb-4">
                            Sign In with Ethereum
                        </button>
                    </>
                )}
            </AdminAuthWrapper>
        );
    }

    if (!isReady || !isAdmin) {
        return (
            <AdminAuthWrapper title={!isAdmin ? "Access Denied" : "Loading..."}>
                <p className="text-zinc-400 mb-6">{!isAdmin ? "You do not have permission." : "Please wait..."}</p>
                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            </AdminAuthWrapper>
        );
    }

    return (
        <AdminLayout title="Public Chats">
            <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
                {/* Summary Cards */}
                {data && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
                        <SummaryCard label="Total Channels" value={data.summary.totalChannels} icon="💬" />
                        <SummaryCard label="Location Chats" value={data.summary.totalLocationChats} icon="📍" />
                        <SummaryCard label="Standard" value={data.summary.standardChannels} icon="☁️" />
                        <SummaryCard label="Decentralized" value={data.summary.wakuChannels} icon="🌐" />
                        <SummaryCard label="POAP Channels" value={data.summary.poapEventChannels + data.summary.poapCollectionChannels} icon="🎫" />
                        <SummaryCard label="Total Messages" value={data.summary.totalMessages} icon="📊" />
                    </div>
                )}

                {/* Tabs */}
                <div className="flex items-center gap-4 mb-4 flex-wrap">
                    <div className="flex bg-zinc-800 rounded-lg p-0.5">
                        <button
                            onClick={() => setActiveTab("official")}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                activeTab === "official" ? "bg-[#FF5500] text-white" : "text-zinc-400 hover:text-white"
                            }`}
                        >
                            ⭐ Official ({data?.channels.filter(c => c.is_official).length || 0})
                        </button>
                        <button
                            onClick={() => setActiveTab("channels")}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                activeTab === "channels" ? "bg-[#FF5500] text-white" : "text-zinc-400 hover:text-white"
                            }`}
                        >
                            💬 Channels ({data?.channels.length || 0})
                        </button>
                        <button
                            onClick={() => setActiveTab("locations")}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                activeTab === "locations" ? "bg-[#FF5500] text-white" : "text-zinc-400 hover:text-white"
                            }`}
                        >
                            📍 Locations ({data?.locationChats.length || 0})
                        </button>
                    </div>

                    {/* Filter (for channels only) */}
                    {activeTab === "channels" && (
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value as FilterType)}
                            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
                        >
                            <option value="all">All Types</option>
                            <option value="standard">☁️ Standard</option>
                            <option value="waku">🌐 Decentralized</option>
                            <option value="poap_event">🎫 POAP Event</option>
                            <option value="poap_collection">📚 POAP Collection</option>
                        </select>
                    )}

                    {/* Search */}
                    <div className="relative flex-1 max-w-xs">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500"
                        />
                    </div>

                    {/* Refresh */}
                    <button
                        onClick={fetchData}
                        disabled={isLoadingData}
                        className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                        {isLoadingData ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        )}
                    </button>
                </div>

                {/* Content */}
                <AnimatePresence mode="wait">
                    {activeTab === "official" && (
                        <motion.div
                            key="official"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            {/* Description */}
                            <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4 mb-4">
                                <p className="text-sm text-zinc-400">
                                    Manage official channels and assign custom slugs for shareable URLs like{" "}
                                    <code className="text-orange-400 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">app.spritz.chat/channel/alien</code>
                                </p>
                            </div>

                            {/* Search */}
                            <div className="relative max-w-xs mb-4">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search official channels..."
                                    value={officialSearch}
                                    onChange={(e) => setOfficialSearch(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500"
                                />
                            </div>

                            {isLoadingData && !data ? (
                                <div className="text-center py-12 text-zinc-500">Loading...</div>
                            ) : officialChannels.length === 0 ? (
                                <div className="text-center py-12 text-zinc-500">No official channels found</div>
                            ) : (
                                <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500 uppercase tracking-wider">
                                                    <th className="px-4 py-3">Channel</th>
                                                    <th className="px-4 py-3">Category</th>
                                                    <th className="px-4 py-3">Slug / URL</th>
                                                    <th className="px-4 py-3 text-center">Members</th>
                                                    <th className="px-4 py-3 text-center">Messages</th>
                                                    <th className="px-4 py-3">Status</th>
                                                    <th className="px-4 py-3">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-800">
                                                {officialChannels.map((ch) => (
                                                    <tr key={ch.id} className="hover:bg-zinc-800/30 transition-colors">
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-3">
                                                                {ch.poap_image_url ? (
                                                                    <img src={ch.poap_image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                                                                ) : (
                                                                    <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-xl">
                                                                        {ch.emoji}
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <p className="font-medium text-white">{ch.name}</p>
                                                                    {ch.description && (
                                                                        <p className="text-xs text-zinc-500 truncate max-w-[200px]">{ch.description}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className="text-xs px-2 py-1 rounded-full bg-zinc-800 text-zinc-300 capitalize">
                                                                {ch.type === "standard" ? (data?.channels.find(c => c.id === ch.id) as AdminChat & { category?: string })?.type || "general" : ch.type}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 min-w-[280px]">
                                                            {editingSlug === ch.id ? (
                                                                <div className="space-y-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs text-zinc-500 whitespace-nowrap">/channel/</span>
                                                                        <input
                                                                            type="text"
                                                                            value={slugInput}
                                                                            onChange={(e) => {
                                                                                setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                                                                                setSlugError(null);
                                                                            }}
                                                                            placeholder="my-slug"
                                                                            className="flex-1 px-2 py-1 bg-zinc-800 border border-zinc-600 rounded text-sm text-white placeholder-zinc-600 focus:border-orange-500 focus:outline-none"
                                                                            autoFocus
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === "Enter" && slugInput.trim()) {
                                                                                    updateSlug(ch.id, slugInput.trim());
                                                                                } else if (e.key === "Escape") {
                                                                                    setEditingSlug(null);
                                                                                    setSlugError(null);
                                                                                }
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    {slugError && (
                                                                        <p className="text-xs text-red-400">{slugError}</p>
                                                                    )}
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            onClick={() => updateSlug(ch.id, slugInput.trim() || null)}
                                                                            disabled={slugSaving}
                                                                            className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors disabled:opacity-50"
                                                                        >
                                                                            {slugSaving ? "Saving..." : slugInput.trim() ? "Save" : "Remove Slug"}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => { setEditingSlug(null); setSlugError(null); }}
                                                                            className="text-xs px-2 py-1 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600 transition-colors"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div>
                                                                    {ch.slug ? (
                                                                        <div className="space-y-1">
                                                                            <a
                                                                                href={`https://app.spritz.chat/channel/${ch.slug}`}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="text-sm text-orange-400 hover:text-orange-300 transition-colors"
                                                                            >
                                                                                /channel/{ch.slug} ↗
                                                                            </a>
                                                                            <button
                                                                                onClick={() => { setEditingSlug(ch.id); setSlugInput(ch.slug || ""); }}
                                                                                className="block text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                                                                            >
                                                                                Edit slug
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => { setEditingSlug(ch.id); setSlugInput(""); }}
                                                                            className="text-xs px-2 py-1 bg-zinc-800 text-zinc-400 rounded hover:bg-zinc-700 hover:text-zinc-300 transition-colors"
                                                                        >
                                                                            + Add slug
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-sm">{ch.member_count.toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-center text-sm">{ch.message_count.toLocaleString()}</td>
                                                        <td className="px-4 py-3">
                                                            <span className={`text-xs px-2 py-1 rounded-full ${ch.is_active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                                                                {ch.is_active ? "Active" : "Inactive"}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => updateChat(ch.id, ch.type, { isOfficial: false })}
                                                                    disabled={updatingChat === ch.id}
                                                                    className="text-xs px-2 py-1 bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30 transition-colors disabled:opacity-50"
                                                                >
                                                                    Remove Official
                                                                </button>
                                                                <button
                                                                    onClick={() => updateChat(ch.id, ch.type, { isActive: !ch.is_active })}
                                                                    disabled={updatingChat === ch.id}
                                                                    className={`text-xs px-2 py-1 rounded transition-colors ${ch.is_active ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-green-500/10 text-green-400 hover:bg-green-500/20"}`}
                                                                >
                                                                    {ch.is_active ? "Deactivate" : "Activate"}
                                                                </button>
                                                                {ch.slug && (
                                                                    <button
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(`https://app.spritz.chat/channel/${ch.slug}`);
                                                                        }}
                                                                        className="text-xs px-2 py-1 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600 transition-colors"
                                                                        title="Copy link"
                                                                    >
                                                                        📋 Copy URL
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === "channels" && (
                        <motion.div
                            key="channels"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            {isLoadingData && !data ? (
                                <div className="text-center py-12 text-zinc-500">Loading...</div>
                            ) : filteredChannels.length === 0 ? (
                                <div className="text-center py-12 text-zinc-500">No channels found</div>
                            ) : (
                                <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500 uppercase tracking-wider">
                                                    <th className="px-4 py-3">Channel</th>
                                                    <th className="px-4 py-3">Type</th>
                                                    <th className="px-4 py-3 text-center">Members</th>
                                                    <th className="px-4 py-3 text-center">Messages</th>
                                                    <th className="px-4 py-3">Created</th>
                                                    <th className="px-4 py-3">Status</th>
                                                    <th className="px-4 py-3">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-800">
                                                {filteredChannels.map((ch) => (
                                                    <tr key={ch.id} className="hover:bg-zinc-800/30 transition-colors">
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-3">
                                                                {ch.poap_image_url ? (
                                                                    <img src={ch.poap_image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                                                                ) : (
                                                                    <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-xl">
                                                                        {ch.emoji}
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <p className="font-medium text-white flex items-center gap-2">
                                                                        {ch.name}
                                                                        {ch.is_official && (
                                                                            <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">Official</span>
                                                                        )}
                                                                    </p>
                                                                    {ch.description && (
                                                                        <p className="text-xs text-zinc-500 truncate max-w-[200px]">{ch.description}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`text-xs px-2 py-1 rounded-full ${TYPE_LABELS[ch.type]?.color || "bg-zinc-700 text-zinc-300"}`}>
                                                                {TYPE_LABELS[ch.type]?.emoji} {TYPE_LABELS[ch.type]?.label}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-sm">{ch.member_count.toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-center text-sm">{ch.message_count.toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-sm text-zinc-400">
                                                            {formatDate(ch.created_at)}
                                                            {ch.creator_address && (
                                                                <p className="text-xs text-zinc-600">{formatAddress(ch.creator_address)}</p>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`text-xs px-2 py-1 rounded-full ${ch.is_active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                                                                {ch.is_active ? "Active" : "Inactive"}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => updateChat(ch.id, ch.type, { isOfficial: !ch.is_official })}
                                                                    disabled={updatingChat === ch.id}
                                                                    className={`text-xs px-2 py-1 rounded transition-colors ${ch.is_official ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30" : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"}`}
                                                                >
                                                                    {ch.is_official ? "⭐ Official" : "Make Official"}
                                                                </button>
                                                                <button
                                                                    onClick={() => updateChat(ch.id, ch.type, { isActive: !ch.is_active })}
                                                                    disabled={updatingChat === ch.id}
                                                                    className={`text-xs px-2 py-1 rounded transition-colors ${ch.is_active ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-green-500/10 text-green-400 hover:bg-green-500/20"}`}
                                                                >
                                                                    {ch.is_active ? "Deactivate" : "Activate"}
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {activeTab === "locations" && (
                        <motion.div
                            key="locations"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            {isLoadingData && !data ? (
                                <div className="text-center py-12 text-zinc-500">Loading...</div>
                            ) : filteredLocationChats.length === 0 ? (
                                <div className="text-center py-12 text-zinc-500">No location chats found</div>
                            ) : (
                                <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500 uppercase tracking-wider">
                                                    <th className="px-4 py-3">Location</th>
                                                    <th className="px-4 py-3">Place</th>
                                                    <th className="px-4 py-3 text-center">Rating</th>
                                                    <th className="px-4 py-3 text-center">Members</th>
                                                    <th className="px-4 py-3 text-center">Messages</th>
                                                    <th className="px-4 py-3">Creator</th>
                                                    <th className="px-4 py-3">Status</th>
                                                    <th className="px-4 py-3">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-zinc-800">
                                                {filteredLocationChats.map((lc) => (
                                                    <tr key={lc.id} className="hover:bg-zinc-800/30 transition-colors">
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center text-xl">
                                                                    {lc.emoji}
                                                                </div>
                                                                <div>
                                                                    <p className="font-medium text-white">{lc.name}</p>
                                                                    {lc.description && (
                                                                        <p className="text-xs text-zinc-500 truncate max-w-[150px]">{lc.description}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div>
                                                                <p className="text-sm text-zinc-300">{lc.google_place_name}</p>
                                                                <p className="text-xs text-zinc-500 truncate max-w-[200px]">{lc.google_place_address}</p>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            {lc.google_place_rating ? (
                                                                <span className="text-sm text-amber-400">⭐ {lc.google_place_rating.toFixed(1)}</span>
                                                            ) : (
                                                                <span className="text-zinc-600">-</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-sm">{lc.member_count.toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-center text-sm">{lc.message_count.toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-sm text-zinc-400">
                                                            {lc.creator_address ? formatAddress(lc.creator_address) : "-"}
                                                            <p className="text-xs text-zinc-600">{formatDate(lc.created_at)}</p>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`text-xs px-2 py-1 rounded-full ${lc.is_active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                                                                {lc.is_active ? "Active" : "Inactive"}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center gap-2">
                                                                {lc.latitude && lc.longitude && (
                                                                    <a
                                                                        href={`https://www.google.com/maps?q=${lc.latitude},${lc.longitude}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-xs px-2 py-1 bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600 transition-colors"
                                                                    >
                                                                        🗺️ Map
                                                                    </a>
                                                                )}
                                                                <button
                                                                    onClick={() => updateChat(lc.id, "location", { isActive: !lc.is_active })}
                                                                    disabled={updatingChat === lc.id}
                                                                    className={`text-xs px-2 py-1 rounded transition-colors ${lc.is_active ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" : "bg-green-500/10 text-green-400 hover:bg-green-500/20"}`}
                                                                >
                                                                    {lc.is_active ? "Deactivate" : "Activate"}
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </AdminLayout>
    );
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: string }) {
    return (
        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
            <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{icon}</span>
                <span className="text-xs text-zinc-400 uppercase tracking-wider">{label}</span>
            </div>
            <p className="text-2xl font-bold">{value.toLocaleString()}</p>
        </div>
    );
}
