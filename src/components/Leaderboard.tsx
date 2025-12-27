"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "motion/react";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

type LeaderboardEntry = {
    rank: number;
    address: string;
    username: string | null;
    ensName: string | null;
    points: number;
};

interface LeaderboardProps {
    userAddress?: string;
    limit?: number;
}

// ENS cache with 24-hour TTL
const ENS_CACHE_KEY = "leaderboard_ens_cache";
const ENS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

type ENSCacheEntry = {
    ensName: string | null;
    timestamp: number;
};

type ENSCache = Record<string, ENSCacheEntry>;

function getENSCache(): ENSCache {
    if (typeof window === "undefined") return {};
    try {
        const cached = localStorage.getItem(ENS_CACHE_KEY);
        return cached ? JSON.parse(cached) : {};
    } catch {
        return {};
    }
}

function setENSCache(cache: ENSCache) {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(ENS_CACHE_KEY, JSON.stringify(cache));
    } catch {
        // Ignore storage errors
    }
}

const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(),
});

export function Leaderboard({ userAddress, limit = 10 }: LeaderboardProps) {
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [resolvedNames, setResolvedNames] = useState<Record<string, string | null>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const resolveQueueRef = useRef<Set<string>>(new Set());

    // Resolve ENS for addresses that don't have cached names
    const resolveENS = useCallback(async (address: string): Promise<string | null> => {
        const cache = getENSCache();
        const cached = cache[address.toLowerCase()];
        
        // Return cached value if still valid
        if (cached && Date.now() - cached.timestamp < ENS_CACHE_TTL) {
            return cached.ensName;
        }

        try {
            const ensName = await publicClient.getEnsName({
                address: address as `0x${string}`,
            });
            
            // Cache the result
            cache[address.toLowerCase()] = {
                ensName: ensName || null,
                timestamp: Date.now(),
            };
            setENSCache(cache);
            
            return ensName || null;
        } catch {
            // ENS resolution can fail for many reasons (no reverse record, network issues, etc.)
            // Silently cache null to prevent repeated failed lookups
            cache[address.toLowerCase()] = {
                ensName: null,
                timestamp: Date.now(),
            };
            setENSCache(cache);
            return null;
        }
    }, []);

    // Batch resolve ENS names for entries without username/ensName
    useEffect(() => {
        const resolveAll = async () => {
            const toResolve = entries.filter(
                e => !e.username && !e.ensName && !resolveQueueRef.current.has(e.address.toLowerCase())
            );
            
            if (toResolve.length === 0) return;

            // Check cache first
            const cache = getENSCache();
            const newResolved: Record<string, string | null> = {};
            const needsResolving: LeaderboardEntry[] = [];

            for (const entry of toResolve) {
                const addr = entry.address.toLowerCase();
                
                const cached = cache[addr];
                if (cached && Date.now() - cached.timestamp < ENS_CACHE_TTL) {
                    newResolved[addr] = cached.ensName;
                    resolveQueueRef.current.add(addr); // Mark as processed
                } else {
                    needsResolving.push(entry);
                    resolveQueueRef.current.add(addr);
                }
            }

            // Update with cached values immediately
            if (Object.keys(newResolved).length > 0) {
                setResolvedNames(prev => ({ ...prev, ...newResolved }));
            }

            // Resolve remaining (limit to 5 at a time to avoid rate limiting)
            const batch = needsResolving.slice(0, 5);
            for (const entry of batch) {
                const addr = entry.address.toLowerCase();
                const ensName = await resolveENS(entry.address);
                setResolvedNames(prev => ({ ...prev, [addr]: ensName }));
            }
        };

        resolveAll();
    }, [entries, resolveENS]);

    const fetchLeaderboard = useCallback(async () => {
        try {
            const response = await fetch(`/api/leaderboard?limit=${limit}`);
            const data = await response.json();

            if (!response.ok) {
                setError(data.error || "Failed to load leaderboard");
                return;
            }

            setEntries(data.leaderboard || []);
            setError(null);
        } catch (err) {
            console.error("[Leaderboard] Fetch error:", err);
            setError("Failed to load leaderboard");
        } finally {
            setIsLoading(false);
        }
    }, [limit]);

    useEffect(() => {
        fetchLeaderboard();
        // Refresh every 60 seconds
        const interval = setInterval(fetchLeaderboard, 60000);
        return () => clearInterval(interval);
    }, [fetchLeaderboard]);

    const formatAddress = (address: string) =>
        `${address.slice(0, 6)}...${address.slice(-4)}`;

    const getDisplayName = (entry: LeaderboardEntry) => {
        // Priority: username > ENS from DB > resolved ENS > formatted address
        if (entry.username) return entry.username;
        if (entry.ensName) return entry.ensName;
        const resolved = resolvedNames[entry.address.toLowerCase()];
        if (resolved) return resolved;
        return formatAddress(entry.address);
    };

    const displayedEntries = isExpanded ? entries : entries.slice(0, 5);

    if (isLoading) {
        return (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-[#FF5500] border-t-transparent rounded-full animate-spin" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                <p className="text-red-400 text-center">{error}</p>
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
                <div className="text-center py-4">
                    <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                        <span className="text-2xl">🏆</span>
                    </div>
                    <p className="text-zinc-400">No rankings yet</p>
                    <p className="text-zinc-500 text-sm mt-1">
                        Earn points to appear on the leaderboard!
                    </p>
                </div>
            </div>
        );
    }

    const displayList = displayedEntries;

    return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-zinc-800 bg-gradient-to-r from-yellow-500/5 via-amber-500/5 to-orange-500/5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                            <span className="text-lg">🏆</span>
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">
                                Leaderboard
                            </h2>
                            <p className="text-zinc-500 text-xs">
                                Top {entries.length} by points
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={fetchLeaderboard}
                        className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                        title="Refresh"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Leaderboard List */}
            {displayList.length > 0 && (
                <div className="p-3 space-y-2">
                    {displayList.map((entry, index) => {
                        const isCurrentUser =
                            userAddress &&
                            entry.address.toLowerCase() === userAddress.toLowerCase();

                        const getRankDisplay = (rank: number) => {
                            if (rank === 1) return "🥇";
                            if (rank === 2) return "🥈";
                            if (rank === 3) return "🥉";
                            return rank.toString();
                        };

                        return (
                            <motion.div
                                key={entry.address}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: index * 0.02 }}
                                className={`px-4 py-3 flex items-center gap-3 rounded-xl transition-colors ${
                                    isCurrentUser
                                        ? "bg-[#FF5500]/10 border border-[#FF5500]/20"
                                        : "bg-zinc-800/50 border border-zinc-700/50 hover:bg-zinc-800"
                                }`}
                            >
                                {/* Rank */}
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                    entry.rank <= 3 ? "bg-zinc-900" : "bg-zinc-900"
                                }`}>
                                    <span className={`text-sm font-bold ${
                                        entry.rank === 1 ? "text-yellow-400" :
                                        entry.rank === 2 ? "text-slate-300" :
                                        entry.rank === 3 ? "text-amber-500" :
                                        "text-zinc-400"
                                    }`}>
                                        {getRankDisplay(entry.rank)}
                                    </span>
                                </div>

                                {/* User Info */}
                                <div className="flex-1 min-w-0">
                                    <p
                                        className={`font-medium text-sm truncate ${
                                            isCurrentUser
                                                ? "text-[#FFBBA7]"
                                                : "text-white"
                                        }`}
                                    >
                                        {getDisplayName(entry)}
                                        {isCurrentUser && (
                                            <span className="ml-1.5 text-[10px] text-[#FF5500] bg-[#FF5500]/20 px-1.5 py-0.5 rounded">
                                                YOU
                                            </span>
                                        )}
                                    </p>
                                </div>

                                {/* Points */}
                                <div className="text-right">
                                    <p className={`font-semibold text-sm ${
                                        entry.rank === 1 ? "text-yellow-400" :
                                        entry.rank === 2 ? "text-slate-300" :
                                        entry.rank === 3 ? "text-amber-500" :
                                        "text-zinc-300"
                                    }`}>
                                        {entry.points.toLocaleString()}
                                    </p>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* Show More/Less Button */}
            {entries.length > 5 && (
                <div className="p-3 border-t border-zinc-800">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="w-full py-2 text-sm text-zinc-400 hover:text-white transition-colors flex items-center justify-center gap-2"
                    >
                        {isExpanded ? (
                            <>
                                Show Less
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                            </>
                        ) : (
                            <>
                                Show All {entries.length}
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
