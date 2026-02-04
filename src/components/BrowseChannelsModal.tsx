"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChannels } from "@/hooks/useChannels";
import type { PublicChannel } from "@/app/api/channels/route";
import { ChannelIcon } from "./ChannelIcon";
import { ImageViewerModal } from "./ImageViewerModal";
import type { PoapEventWithChannel } from "@/app/api/poap/events-with-channels/route";
import type { PoapCollectionForUser } from "@/app/api/poap/collections-for-user/route";

function showToast(message: string, type: "success" | "neutral" = "success") {
    const toast = document.createElement("div");
    toast.className =
        type === "success"
            ? "fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-xl shadow-lg z-[100] animate-in fade-in slide-in-from-bottom-2"
            : "fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-zinc-700 text-white text-sm font-medium rounded-xl shadow-lg z-[100] animate-in fade-in slide-in-from-bottom-2";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

type BrowseChannelsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string;
    /** Addresses to scan for POAPs (e.g. Smart Wallet + identity). If not set, uses userAddress only. */
    poapAddresses?: string[];
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
    poapAddresses,
    onJoinChannel,
    initialShowCreate = false,
}: BrowseChannelsModalProps) {
    const { channels, isLoading, joinChannel, leaveChannel, createChannel } =
        useChannels(userAddress);
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [joiningChannel, setJoiningChannel] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(initialShowCreate);
    const [view, setView] = useState<"all" | "poap">("all");
    const [poapEvents, setPoapEvents] = useState<PoapEventWithChannel[]>([]);
    const [poapLoading, setPoapLoading] = useState(false);
    const [poapError, setPoapError] = useState<string | null>(null);
    const [creatingPoapEventId, setCreatingPoapEventId] = useState<
        number | null
    >(null);
    const [poapCollections, setPoapCollections] = useState<
        PoapCollectionForUser[]
    >([]);
    const [poapCollectionsLoading, setPoapCollectionsLoading] = useState(false);
    const [creatingPoapCollectionId, setCreatingPoapCollectionId] = useState<
        number | null
    >(null);
    const [viewerImage, setViewerImage] = useState<string | null>(null);
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounce search (250ms) for smoother filtering
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(
            () => setDebouncedSearch(searchQuery),
            250
        );
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [searchQuery]);

    // Esc to close modal
    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [isOpen, onClose]);

    // Lock body scroll when modal is open so background doesn't scroll
    useEffect(() => {
        if (!isOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [isOpen]);

    // Reset showCreateModal when the modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setShowCreateModal(initialShowCreate);
        }
    }, [isOpen, initialShowCreate]);

    // Fetch POAP events with channel status when "From my POAPs" is selected
    const addressesForPoap = useMemo(
        () =>
            poapAddresses?.length
                ? poapAddresses
                : userAddress
                ? [userAddress]
                : [],
        [poapAddresses, userAddress]
    );
    const fetchPoapEvents = useCallback(async () => {
        if (addressesForPoap.length === 0) return;
        setPoapLoading(true);
        setPoapError(null);
        try {
            const params = new URLSearchParams();
            if (addressesForPoap.length === 1) {
                params.set("address", addressesForPoap[0]);
            } else {
                params.set("addresses", addressesForPoap.join(","));
            }
            params.set("memberAddress", userAddress);
            const res = await fetch(
                `/api/poap/events-with-channels?${params.toString()}`
            );
            const data = await res.json();
            if (!res.ok) {
                setPoapError(data.error || "Failed to load POAPs");
                setPoapEvents([]);
                return;
            }
            setPoapEvents(data.events ?? []);
        } catch (e) {
            setPoapError("Failed to load POAPs");
            setPoapEvents([]);
        } finally {
            setPoapLoading(false);
        }
    }, [userAddress, addressesForPoap]);

    const fetchPoapCollections = useCallback(async () => {
        if (!addressesForPoap.length || !userAddress) {
            setPoapCollections([]);
            return;
        }
        setPoapCollectionsLoading(true);
        try {
            const params = new URLSearchParams();
            params.set("addresses", addressesForPoap.join(","));
            params.set("memberAddress", userAddress);
            const res = await fetch(
                `/api/poap/collections-for-user?${params.toString()}`
            );
            const data = await res.json();
            if (res.ok) {
                setPoapCollections(data.collections ?? []);
            } else {
                setPoapCollections([]);
            }
        } catch {
            setPoapCollections([]);
        } finally {
            setPoapCollectionsLoading(false);
        }
    }, [userAddress, addressesForPoap]);

    useEffect(() => {
        if (isOpen && view === "poap") {
            fetchPoapEvents();
            fetchPoapCollections();
        }
    }, [isOpen, view, fetchPoapEvents, fetchPoapCollections]);

    const filteredPoapEvents = useMemo(() => {
        if (!debouncedSearch.trim()) return poapEvents;
        const q = debouncedSearch.trim().toLowerCase();
        return poapEvents.filter((e) => e.eventName.toLowerCase().includes(q));
    }, [poapEvents, debouncedSearch]);

    const [newChannel, setNewChannel] = useState({
        name: "",
        description: "",
        emoji: "💬",
        category: "other",
        messagingType: "standard" as "standard" | "waku",
    });
    const [createError, setCreateError] = useState<string | null>(null);

    const filteredChannels = useMemo(
        () =>
            channels.filter((channel) => {
                const matchesCategory =
                    selectedCategory === "all" ||
                    channel.category === selectedCategory;
                const matchesSearch =
                    debouncedSearch === "" ||
                    channel.name
                        .toLowerCase()
                        .includes(debouncedSearch.toLowerCase()) ||
                    channel.description
                        ?.toLowerCase()
                        .includes(debouncedSearch.toLowerCase());
                return matchesCategory && matchesSearch;
            }),
        [channels, selectedCategory, debouncedSearch]
    );

    const handleJoin = async (channel: PublicChannel) => {
        setJoiningChannel(channel.id);
        const success = await joinChannel(channel.id);
        setJoiningChannel(null);
        if (success) {
            showToast(`✓ Joined #${channel.name}`);
            onJoinChannel(channel);
        }
    };

    const handleLeave = async (channelId: string) => {
        setJoiningChannel(channelId);
        const success = await leaveChannel(channelId);
        setJoiningChannel(null);
        if (success) showToast("Left channel", "neutral");
    };

    const handleCreatePoapChannel = async (event: PoapEventWithChannel) => {
        setCreatingPoapEventId(event.eventId);
        setPoapError(null);
        try {
            const channel = await createChannel({
                name: event.eventName,
                poapEventId: event.eventId,
                poapEventName: event.eventName,
                poapImageUrl: event.imageUrl ?? undefined,
            });
            if (channel) {
                showToast("✓ Channel created");
                onJoinChannel(channel as PublicChannel);
                setPoapEvents((prev) =>
                    prev.map((e) =>
                        e.eventId === event.eventId
                            ? { ...e, channel: { ...channel, is_member: true } }
                            : e
                    )
                );
            }
        } catch (e) {
            setPoapError(
                e instanceof Error ? e.message : "Failed to create channel"
            );
        } finally {
            setCreatingPoapEventId(null);
        }
    };

    const handleCreatePoapCollectionChannel = async (
        col: PoapCollectionForUser
    ) => {
        setCreatingPoapCollectionId(col.id);
        setPoapError(null);
        try {
            const channel = await createChannel({
                name: col.title,
                poapCollectionId: col.id,
                poapCollectionName: col.title,
                poapCollectionImageUrl:
                    col.logoImageUrl ?? col.bannerImageUrl ?? undefined,
            });
            if (channel) {
                showToast("✓ Channel created");
                onJoinChannel(channel as PublicChannel);
                setPoapCollections((prev) =>
                    prev.map((c) =>
                        c.id === col.id
                            ? { ...c, channel: { ...channel, is_member: true } }
                            : c
                    )
                );
            }
        } catch (e) {
            setPoapError(
                e instanceof Error ? e.message : "Failed to create channel"
            );
        } finally {
            setCreatingPoapCollectionId(null);
        }
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
                setNewChannel({
                    name: "",
                    description: "",
                    emoji: "💬",
                    category: "community",
                    messagingType: "standard",
                });
                onJoinChannel(channel);
            }
        } catch (e) {
            setCreateError(
                e instanceof Error ? e.message : "Failed to create channel"
            );
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl h-[90vh] max-h-[90vh] overflow-hidden flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header - compact: one row title + actions, one row search + category */}
                    <div className="p-3 sm:p-4 border-b border-zinc-800 space-y-3 shrink-0">
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-base sm:text-lg font-bold text-white truncate">
                                Browse Channels
                            </h2>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                    onClick={() => setShowCreateModal(true)}
                                    className="px-2.5 py-1.5 sm:px-3 sm:py-2 bg-gradient-to-r from-[#FF5500] to-[#FF7700] rounded-lg text-white text-xs sm:text-sm font-medium hover:shadow-lg hover:shadow-orange-500/25 transition-all flex items-center gap-1"
                                >
                                    <span>+</span>
                                    <span className="hidden sm:inline">
                                        Create
                                    </span>
                                </button>
                                <button
                                    onClick={onClose}
                                    className="p-1.5 sm:p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
                                    aria-label="Close"
                                >
                                    <svg
                                        className="w-5 h-5"
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

                        {/* Search + Category on one row - compact */}
                        <div className="flex flex-col sm:flex-row gap-2">
                            <div className="relative flex-1 min-w-0">
                                <svg
                                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
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
                                    placeholder={
                                        view === "poap"
                                            ? "Search POAPs..."
                                            : "Search channels..."
                                    }
                                    value={searchQuery}
                                    onChange={(e) =>
                                        setSearchQuery(e.target.value)
                                    }
                                    className="w-full pl-8 pr-3 py-2 sm:py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF5500]/40 focus:border-[#FF5500] text-sm"
                                />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <label
                                    htmlFor="browse-category"
                                    className="text-xs text-zinc-500 whitespace-nowrap sm:sr-only"
                                >
                                    Category
                                </label>
                                <select
                                    id="browse-category"
                                    value={selectedCategory}
                                    onChange={(e) =>
                                        setSelectedCategory(e.target.value)
                                    }
                                    className="px-3 py-2 sm:py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5500]/40 focus:border-[#FF5500] cursor-pointer min-w-[120px] sm:min-w-[140px]"
                                >
                                    {CATEGORIES.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.emoji} {cat.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* View tabs: All channels | From my POAPs */}
                        <div className="flex gap-1 p-1 bg-zinc-800/50 rounded-lg">
                            <button
                                type="button"
                                onClick={() => setView("all")}
                                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                    view === "all"
                                        ? "bg-zinc-700 text-white"
                                        : "text-zinc-400 hover:text-white"
                                }`}
                            >
                                All channels
                            </button>
                            <button
                                type="button"
                                onClick={() => setView("poap")}
                                className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                                    view === "poap"
                                        ? "bg-zinc-700 text-white"
                                        : "text-zinc-400 hover:text-white"
                                }`}
                            >
                                <span aria-hidden>🎫</span>
                                From my POAPs
                            </button>
                        </div>
                    </div>

                    {/* Channel List or POAP List */}
                    <div className="flex flex-col min-h-0 flex-1">
                        <p className="px-3 py-1.5 text-xs text-zinc-500 border-b border-zinc-800/50 shrink-0">
                            {view === "poap"
                                ? poapLoading
                                    ? "Loading your POAPs..."
                                    : `${filteredPoapEvents.length} POAP${
                                          filteredPoapEvents.length !== 1
                                              ? "s"
                                              : ""
                                      }${
                                          searchQuery.trim()
                                              ? " (filtered)"
                                              : " you hold"
                                      }`
                                : isLoading
                                ? "Loading..."
                                : `${filteredChannels.length} channel${
                                      filteredChannels.length !== 1 ? "s" : ""
                                  }`}
                        </p>
                        <div className="p-3 sm:p-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0 overscroll-contain">
                            {view === "poap" ? (
                                <>
                                    {/* Collections (user holds at least one POAP in collection) */}
                                    {(poapCollectionsLoading ||
                                        poapCollections.length > 0) && (
                                        <div className="mb-4">
                                            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                                                Collections you can join
                                            </p>
                                            {poapCollectionsLoading ? (
                                                <div className="grid gap-2">
                                                    {[1, 2].map((i) => (
                                                        <div
                                                            key={i}
                                                            className="p-2.5 sm:p-4 bg-zinc-800/50 rounded-xl flex flex-row items-start gap-2 sm:gap-3 min-w-0"
                                                        >
                                                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-zinc-700 animate-pulse shrink-0" />
                                                            <div className="flex-1 min-w-0 space-y-2">
                                                                <div className="h-4 bg-zinc-700 rounded animate-pulse w-3/4" />
                                                                <div className="h-3 bg-zinc-700/80 rounded animate-pulse w-1/2" />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="grid gap-3 min-w-0">
                                                    {poapCollections.map(
                                                        (col) => (
                                                            <motion.div
                                                                key={col.id}
                                                                initial={{
                                                                    opacity: 0,
                                                                    y: 10,
                                                                }}
                                                                animate={{
                                                                    opacity: 1,
                                                                    y: 0,
                                                                }}
                                                                className="p-2.5 sm:p-4 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors min-w-0 overflow-hidden"
                                                            >
                                                                <div className="flex flex-row items-start gap-2 sm:gap-3 min-w-0">
                                                                    {col.logoImageUrl ||
                                                                    col.bannerImageUrl ? (
                                                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl overflow-hidden shrink-0 ring-1 ring-zinc-600 mt-0.5">
                                                                            <img
                                                                                src={
                                                                                    (col.logoImageUrl ??
                                                                                        col.bannerImageUrl) +
                                                                                    "?size=small"
                                                                                }
                                                                                alt=""
                                                                                className="w-full h-full object-cover"
                                                                            />
                                                                        </div>
                                                                    ) : (
                                                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-zinc-700 flex items-center justify-center text-xl sm:text-2xl shrink-0 mt-0.5">
                                                                            📚
                                                                        </div>
                                                                    )}
                                                                    <div className="flex-1 min-w-0 pr-2">
                                                                        <p
                                                                            className="text-white font-medium truncate text-sm sm:text-base leading-tight"
                                                                            title={
                                                                                col.title
                                                                            }
                                                                        >
                                                                            {
                                                                                col.title
                                                                            }
                                                                        </p>
                                                                        <p className="text-zinc-500 text-[11px] sm:text-xs mt-0.5 truncate">
                                                                            {
                                                                                col.dropsCount
                                                                            }{" "}
                                                                            POAPs
                                                                            in
                                                                            collection
                                                                            {col.channel
                                                                                ? ` • ${Number(
                                                                                      (
                                                                                          col.channel as {
                                                                                              member_count?: number;
                                                                                          }
                                                                                      )
                                                                                          .member_count ??
                                                                                          0
                                                                                  )} members${
                                                                                      col
                                                                                          .channel
                                                                                          .is_member
                                                                                          ? " • You're in"
                                                                                          : ""
                                                                                  }`
                                                                                : " • No channel yet"}
                                                                        </p>
                                                                    </div>
                                                                    {col.channel ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                col.channel!
                                                                                    .is_member
                                                                                    ? onJoinChannel(
                                                                                          col.channel as PublicChannel
                                                                                      )
                                                                                    : handleJoin(
                                                                                          col.channel as PublicChannel
                                                                                      )
                                                                            }
                                                                            disabled={
                                                                                joiningChannel ===
                                                                                col.channel!
                                                                                    .id
                                                                            }
                                                                            className={`shrink-0 self-start py-1.5 px-2.5 sm:py-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium transition-all disabled:opacity-50 ${
                                                                                col.channel!
                                                                                    .is_member
                                                                                    ? "bg-zinc-700 text-zinc-300 hover:bg-orange-500/20 hover:text-orange-400"
                                                                                    : "bg-[#FF5500] text-white hover:bg-[#FF6600]"
                                                                            }`}
                                                                        >
                                                                            {joiningChannel ===
                                                                            col.channel!
                                                                                .id ? (
                                                                                <span className="animate-pulse">
                                                                                    ...
                                                                                </span>
                                                                            ) : col.channel!
                                                                                  .is_member ? (
                                                                                "Open"
                                                                            ) : (
                                                                                "Join"
                                                                            )}
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                handleCreatePoapCollectionChannel(
                                                                                    col
                                                                                )
                                                                            }
                                                                            disabled={
                                                                                creatingPoapCollectionId ===
                                                                                col.id
                                                                            }
                                                                            className="shrink-0 self-start py-1.5 px-2.5 sm:py-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-50"
                                                                        >
                                                                            {creatingPoapCollectionId ===
                                                                            col.id ? (
                                                                                <span className="animate-pulse">
                                                                                    Creating...
                                                                                </span>
                                                                            ) : (
                                                                                <>
                                                                                    <span className="sm:hidden">
                                                                                        Create
                                                                                    </span>
                                                                                    <span className="hidden sm:inline">
                                                                                        Create
                                                                                        channel
                                                                                    </span>
                                                                                </>
                                                                            )}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </motion.div>
                                                        )
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {poapCollections.length > 0 &&
                                        !poapCollectionsLoading && (
                                            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 mt-2">
                                                POAPs you hold
                                            </p>
                                        )}
                                    {poapLoading ? (
                                        <div className="grid gap-3 min-w-0">
                                            {[1, 2, 3, 4].map((i) => (
                                                <div
                                                    key={i}
                                                    className="p-2.5 sm:p-4 bg-zinc-800/50 rounded-xl flex flex-row items-start gap-2 sm:gap-3 min-w-0"
                                                >
                                                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-zinc-700 animate-pulse shrink-0" />
                                                    <div className="flex-1 min-w-0 space-y-2">
                                                        <div className="h-4 bg-zinc-700 rounded animate-pulse w-3/4" />
                                                        <div className="h-3 bg-zinc-700/80 rounded animate-pulse w-1/2" />
                                                    </div>
                                                    <div className="h-8 w-16 sm:w-20 bg-zinc-700 rounded-lg animate-pulse shrink-0" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : poapError ? (
                                        <div className="text-center py-8">
                                            <p className="text-zinc-400 text-sm mb-2">
                                                {poapError}
                                            </p>
                                            <p className="text-zinc-500 text-xs mb-4">
                                                Add POAP_API_KEY to enable POAP
                                                channels.{" "}
                                                <a
                                                    href="https://documentation.poap.tech/docs/getting-started"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-orange-400 hover:underline"
                                                >
                                                    POAP API docs
                                                </a>
                                            </p>
                                            <button
                                                type="button"
                                                onClick={fetchPoapEvents}
                                                className="text-sm text-orange-400 hover:underline"
                                            >
                                                Retry
                                            </button>
                                        </div>
                                    ) : filteredPoapEvents.length === 0 ? (
                                        <div className="text-center py-12 px-4">
                                            <p className="text-zinc-500 text-sm">
                                                {poapEvents.length === 0
                                                    ? "No POAPs found for your wallet."
                                                    : "No POAPs match your search."}
                                            </p>
                                            {poapEvents.length === 0 && (
                                                <>
                                                    <p className="text-zinc-600 text-xs mt-2">
                                                        Attend events and claim
                                                        POAPs to unlock channels
                                                        on Logos.
                                                    </p>
                                                    <a
                                                        href="https://poap.xyz"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-block mt-3 text-xs text-orange-400 hover:text-orange-300"
                                                    >
                                                        Learn about POAPs →
                                                    </a>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="grid gap-3 min-w-0">
                                            {filteredPoapEvents.map((event) => (
                                                <motion.div
                                                    key={event.eventId}
                                                    initial={{
                                                        opacity: 0,
                                                        y: 10,
                                                    }}
                                                    animate={{
                                                        opacity: 1,
                                                        y: 0,
                                                    }}
                                                    className="p-2.5 sm:p-4 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors min-w-0 overflow-hidden"
                                                >
                                                    <div className="flex flex-row items-start gap-2 sm:gap-3 min-w-0">
                                                        {event.imageUrl ? (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setViewerImage(
                                                                        event.imageUrl!
                                                                    )
                                                                }
                                                                className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl overflow-hidden shrink-0 ring-1 ring-zinc-600 focus:ring-2 focus:ring-orange-500 focus:outline-none mt-0.5"
                                                            >
                                                                <img
                                                                    src={`${event.imageUrl}?size=small`}
                                                                    alt=""
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            </button>
                                                        ) : (
                                                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-zinc-700 flex items-center justify-center text-xl sm:text-2xl shrink-0 mt-0.5">
                                                                🎫
                                                            </div>
                                                        )}
                                                        <div className="flex-1 min-w-0 pr-2">
                                                            <p
                                                                className="text-white font-medium truncate text-sm sm:text-base leading-tight"
                                                                title={
                                                                    event.eventName
                                                                }
                                                            >
                                                                {
                                                                    event.eventName
                                                                }
                                                            </p>
                                                            {event.channel ? (
                                                                <p className="text-zinc-500 text-[11px] sm:text-xs mt-0.5 truncate">
                                                                    {Number(
                                                                        (
                                                                            event.channel as {
                                                                                member_count?: number;
                                                                            }
                                                                        )
                                                                            .member_count ??
                                                                            0
                                                                    )}{" "}
                                                                    members
                                                                    {event
                                                                        .channel
                                                                        .is_member &&
                                                                        " • You're in"}
                                                                </p>
                                                            ) : (
                                                                <p className="text-zinc-500 text-[11px] sm:text-xs mt-0.5">
                                                                    No channel
                                                                    yet • Logos
                                                                </p>
                                                            )}
                                                        </div>
                                                        {event.channel ? (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    event.channel!
                                                                        .is_member
                                                                        ? onJoinChannel(
                                                                              event.channel as PublicChannel
                                                                          )
                                                                        : handleJoin(
                                                                              event.channel as PublicChannel
                                                                          )
                                                                }
                                                                disabled={
                                                                    joiningChannel ===
                                                                    event.channel!
                                                                        .id
                                                                }
                                                                className={`shrink-0 self-start py-1.5 px-2.5 sm:py-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium transition-all disabled:opacity-50 ${
                                                                    event.channel!
                                                                        .is_member
                                                                        ? "bg-zinc-700 text-zinc-300 hover:bg-orange-500/20 hover:text-orange-400"
                                                                        : "bg-[#FF5500] text-white hover:bg-[#FF6600]"
                                                                }`}
                                                            >
                                                                {joiningChannel ===
                                                                event.channel!
                                                                    .id ? (
                                                                    <span className="animate-pulse">
                                                                        ...
                                                                    </span>
                                                                ) : event.channel!
                                                                      .is_member ? (
                                                                    "Open"
                                                                ) : (
                                                                    "Join"
                                                                )}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    handleCreatePoapChannel(
                                                                        event
                                                                    )
                                                                }
                                                                disabled={
                                                                    creatingPoapEventId ===
                                                                    event.eventId
                                                                }
                                                                className="shrink-0 self-start py-1.5 px-2.5 sm:py-2 sm:px-3 rounded-lg text-xs sm:text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-50"
                                                            >
                                                                {creatingPoapEventId ===
                                                                event.eventId ? (
                                                                    <span className="animate-pulse">
                                                                        Creating...
                                                                    </span>
                                                                ) : (
                                                                    <>
                                                                        <span className="sm:hidden">
                                                                            Create
                                                                        </span>
                                                                        <span className="hidden sm:inline">
                                                                            Create
                                                                            channel
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : isLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-600 border-t-orange-500" />
                                </div>
                            ) : filteredChannels.length === 0 ? (
                                <div className="text-center py-12">
                                    <p className="text-zinc-500">
                                        No channels found
                                    </p>
                                </div>
                            ) : (
                                <div className="grid gap-3 min-w-0">
                                    {filteredChannels.map((channel) => (
                                        <motion.div
                                            key={channel.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="p-2.5 sm:p-4 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-colors min-w-0 overflow-hidden"
                                        >
                                            <div className="flex flex-row items-start gap-2 sm:gap-3 min-w-0">
                                                {channel.poap_image_url ??
                                                channel.icon_url ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const url =
                                                                channel.poap_image_url ??
                                                                channel.icon_url;
                                                            if (url)
                                                                setViewerImage(
                                                                    url
                                                                );
                                                        }}
                                                        className="shrink-0 focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-zinc-900 rounded-xl focus:outline-none"
                                                    >
                                                        <ChannelIcon
                                                            emoji={
                                                                channel.emoji
                                                            }
                                                            iconUrl={
                                                                channel.poap_image_url ??
                                                                channel.icon_url
                                                            }
                                                            name={channel.name}
                                                            size="md"
                                                            className="shrink-0"
                                                        />
                                                    </button>
                                                ) : (
                                                    <ChannelIcon
                                                        emoji={channel.emoji}
                                                        iconUrl={
                                                            channel.poap_image_url ??
                                                            channel.icon_url
                                                        }
                                                        name={channel.name}
                                                        size="md"
                                                        className="shrink-0"
                                                    />
                                                )}
                                                <div className="flex-1 min-w-0 pr-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <p className="text-white font-medium truncate text-sm sm:text-base">
                                                            {channel.name}
                                                        </p>
                                                        {channel.is_official && (
                                                            <span className="shrink-0 px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-[10px] sm:text-xs rounded">
                                                                Official
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-zinc-500 text-xs sm:text-sm line-clamp-1 truncate">
                                                        {channel.description ||
                                                            "No description"}
                                                    </p>
                                                    <p className="text-zinc-600 text-[10px] sm:text-xs mt-0.5 truncate">
                                                        {channel.member_count}{" "}
                                                        members •{" "}
                                                        {channel.message_count}{" "}
                                                        msgs
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() =>
                                                        channel.is_member
                                                            ? handleLeave(
                                                                  channel.id
                                                              )
                                                            : handleJoin(
                                                                  channel
                                                              )
                                                    }
                                                    disabled={
                                                        joiningChannel ===
                                                        channel.id
                                                    }
                                                    className={`shrink-0 self-start px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all disabled:opacity-50 ${
                                                        channel.is_member
                                                            ? "bg-zinc-700 text-zinc-300 hover:bg-red-500/20 hover:text-red-400"
                                                            : "bg-[#FF5500] text-white hover:bg-[#FF6600]"
                                                    }`}
                                                >
                                                    {joiningChannel ===
                                                    channel.id ? (
                                                        <span className="animate-pulse">
                                                            ...
                                                        </span>
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
                                <h3 className="text-lg font-bold text-white mb-4">
                                    Create Channel
                                </h3>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">
                                            Channel Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={newChannel.name}
                                            onChange={(e) =>
                                                setNewChannel({
                                                    ...newChannel,
                                                    name: e.target.value,
                                                })
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
                                                setNewChannel({
                                                    ...newChannel,
                                                    description: e.target.value,
                                                })
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
                                                    setNewChannel({
                                                        ...newChannel,
                                                        emoji: e.target.value,
                                                    })
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
                                                    setNewChannel({
                                                        ...newChannel,
                                                        category:
                                                            e.target.value,
                                                    })
                                                }
                                                className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                                            >
                                                <option value="community">
                                                    Community
                                                </option>
                                                <option value="crypto">
                                                    Crypto
                                                </option>
                                                <option value="tech">
                                                    Tech
                                                </option>
                                                <option value="finance">
                                                    Finance
                                                </option>
                                                <option value="science">
                                                    Science
                                                </option>
                                                <option value="lifestyle">
                                                    Lifestyle
                                                </option>
                                                <option value="entertainment">
                                                    Entertainment
                                                </option>
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
                                                onClick={() =>
                                                    setNewChannel({
                                                        ...newChannel,
                                                        messagingType:
                                                            "standard",
                                                    })
                                                }
                                                className={`p-3 rounded-xl border-2 transition-all text-left ${
                                                    newChannel.messagingType ===
                                                    "standard"
                                                        ? "border-[#FF5500] bg-[#FF5500]/10"
                                                        : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-lg">
                                                        ☁️
                                                    </span>
                                                    <span className="text-white font-medium text-sm">
                                                        Standard
                                                    </span>
                                                </div>
                                                <p className="text-zinc-500 text-xs">
                                                    Fast & reliable cloud
                                                    storage
                                                </p>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setNewChannel({
                                                        ...newChannel,
                                                        messagingType: "waku",
                                                    })
                                                }
                                                className={`p-3 rounded-xl border-2 transition-all text-left ${
                                                    newChannel.messagingType ===
                                                    "waku"
                                                        ? "border-purple-500 bg-purple-500/10"
                                                        : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-lg">
                                                        🌐
                                                    </span>
                                                    <span className="text-white font-medium text-sm">
                                                        Decentralized
                                                    </span>
                                                </div>
                                                <p className="text-zinc-500 text-xs">
                                                    Censorship-resistant
                                                    messaging
                                                </p>
                                            </button>
                                        </div>
                                        {newChannel.messagingType ===
                                            "waku" && (
                                            <p className="text-purple-400 text-xs mt-2 flex items-center gap-1">
                                                <svg
                                                    className="w-3 h-3"
                                                    fill="currentColor"
                                                    viewBox="0 0 20 20"
                                                >
                                                    <path
                                                        fillRule="evenodd"
                                                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                                        clipRule="evenodd"
                                                    />
                                                </svg>
                                                Messages are stored on a
                                                decentralized network
                                            </p>
                                        )}
                                    </div>

                                    {createError && (
                                        <p className="text-red-400 text-sm">
                                            {createError}
                                        </p>
                                    )}

                                    <div className="flex gap-3 pt-2">
                                        <button
                                            onClick={() =>
                                                setShowCreateModal(false)
                                            }
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
            <ImageViewerModal
                isOpen={!!viewerImage}
                onClose={() => setViewerImage(null)}
                imageUrl={viewerImage ?? ""}
                alt="Channel or POAP art"
            />
        </AnimatePresence>
    );
}
