"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { motion } from "motion/react";
import Link from "next/link";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

// ENS Cache with 24hr TTL
const ENS_CACHE_KEY = "spritz_admin_ens_cache";
const ENS_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

type CachedENS = {
    name: string | null;
    avatar: string | null;
    timestamp: number;
};

// Load ENS cache from localStorage
const loadENSCache = (): Map<string, CachedENS> => {
    if (typeof window === "undefined") return new Map();
    try {
        const stored = localStorage.getItem(ENS_CACHE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            const cache = new Map<string, CachedENS>();
            const now = Date.now();
            for (const [key, value] of Object.entries(parsed)) {
                const entry = value as CachedENS;
                if (now - entry.timestamp < ENS_CACHE_TTL) {
                    cache.set(key, entry);
                }
            }
            return cache;
        }
    } catch (e) {
        console.error("[ENS Cache] Load error:", e);
    }
    return new Map();
};

// Save ENS cache to localStorage
const saveENSCache = (cache: Map<string, CachedENS>) => {
    if (typeof window === "undefined") return;
    try {
        const obj: Record<string, CachedENS> = {};
        cache.forEach((v, k) => {
            obj[k] = v;
        });
        localStorage.setItem(ENS_CACHE_KEY, JSON.stringify(obj));
    } catch (e) {
        console.error("[ENS Cache] Save error:", e);
    }
};

type User = {
    id: string;
    wallet_address: string;
    wallet_type: string | null;
    chain: string | null;
    ens_name: string | null;
    username: string | null;
    email: string | null;
    email_verified: boolean;
    first_login: string;
    last_login: string;
    login_count: number;
    invite_code_used: string | null;
    referred_by: string | null;
    is_banned: boolean;
    ban_reason: string | null;
    notes: string | null;
    // Analytics
    friends_count: number;
    messages_sent: number;
    voice_minutes: number;
    video_minutes: number;
    groups_count: number;
    total_calls: number;
    // Points & Invites
    points: number;
    invite_count: number;
    invites_used: number;
};

export default function UsersPage() {
    const {
        isAdmin,
        isAuthenticated,
        isReady,
        isLoading,
        error,
        address,
        isConnected,
        signIn,
        signOut,
        getAuthHeaders,
    } = useAdmin();

    const [users, setUsers] = useState<User[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [search, setSearch] = useState("");
    const [sortBy, setSortBy] = useState("last_login");
    const [sortOrder, setSortOrder] = useState("desc");

    // Edit user modal
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [editNotes, setEditNotes] = useState("");
    const [editBanned, setEditBanned] = useState(false);
    const [editBanReason, setEditBanReason] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    // ENS resolution
    const [resolvedENS, setResolvedENS] = useState<Map<string, CachedENS>>(() =>
        loadENSCache()
    );
    const pendingResolutions = useRef<Set<string>>(new Set());
    const isResolvingRef = useRef(false);

    const formatAddress = (addr: string) =>
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    const formatDate = (date: string) => new Date(date).toLocaleString();

    // Resolve ENS when users change
    useEffect(() => {
        if (users.length === 0 || isResolvingRef.current) return;

        const resolveENS = async () => {
            isResolvingRef.current = true;

            const client = createPublicClient({
                chain: mainnet,
                transport: http(),
            });

            const addressesToResolve = users
                .filter((u) => !u.ens_name) // Only resolve if not already in DB
                .map((u) => u.wallet_address.toLowerCase())
                .filter((addr) => {
                    // Skip if already resolved or pending
                    if (resolvedENS.has(addr)) return false;
                    if (pendingResolutions.current.has(addr)) return false;
                    return true;
                });

            if (addressesToResolve.length === 0) {
                isResolvingRef.current = false;
                return;
            }

            // Mark as pending
            addressesToResolve.forEach((addr) =>
                pendingResolutions.current.add(addr)
            );

            // Resolve in batches of 5 to avoid rate limits
            const batchSize = 5;
            const newResolutions = new Map<string, CachedENS>();

            for (let i = 0; i < addressesToResolve.length; i += batchSize) {
                const batch = addressesToResolve.slice(i, i + batchSize);

                await Promise.all(
                    batch.map(async (addr) => {
                        try {
                            const name = await client.getEnsName({
                                address: addr as `0x${string}`,
                            });
                            let avatar: string | null = null;

                            if (name) {
                                try {
                                    avatar = await client.getEnsAvatar({
                                        name: normalize(name),
                                    });
                                } catch {
                                    // Avatar fetch failed, continue without it
                                }
                            }

                            const cached: CachedENS = {
                                name,
                                avatar,
                                timestamp: Date.now(),
                            };
                            newResolutions.set(addr, cached);
                        } catch {
                            // Cache null result to avoid repeated failures
                            const cached: CachedENS = {
                                name: null,
                                avatar: null,
                                timestamp: Date.now(),
                            };
                            newResolutions.set(addr, cached);
                        } finally {
                            pendingResolutions.current.delete(addr);
                        }
                    })
                );

                // Small delay between batches
                if (i + batchSize < addressesToResolve.length) {
                    await new Promise((r) => setTimeout(r, 200));
                }
            }

            // Batch update state once
            if (newResolutions.size > 0) {
                setResolvedENS((prev) => {
                    const updated = new Map(prev);
                    newResolutions.forEach((v, k) => updated.set(k, v));
                    // Save to localStorage
                    saveENSCache(updated);
                    return updated;
                });
            }

            isResolvingRef.current = false;
        };

        resolveENS();
    }, [users]); // Only depend on users, not resolvedENS

    // Helper to get display name for a user
    const getUserDisplayName = (
        user: User
    ): { name: string | null; avatar: string | null } => {
        // Priority: username > ens from DB > resolved ENS
        if (user.username) {
            return { name: `@${user.username}`, avatar: null };
        }
        if (user.ens_name) {
            return { name: user.ens_name, avatar: null };
        }
        const resolved = resolvedENS.get(user.wallet_address.toLowerCase());
        if (resolved?.name) {
            return { name: resolved.name, avatar: resolved.avatar };
        }
        return { name: null, avatar: null };
    };

    // Fetch users
    const fetchUsers = useCallback(async () => {
        if (!isReady) {
            console.log("[Users Page] Not ready to fetch");
            return;
        }

        const authHeaders = getAuthHeaders();

        // Don't fetch if we don't have valid auth headers
        if (!authHeaders) {
            console.log("[Users Page] No valid auth headers");
            return;
        }

        setIsLoadingData(true);

        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: "25",
                sortBy,
                sortOrder,
            });
            if (search) params.set("search", search);

            const res = await fetch(`/api/admin/users?${params}`, {
                headers: authHeaders,
            });
            const data = await res.json();

            if (data.users) {
                setUsers(data.users);
                setTotal(data.total);
                setTotalPages(data.totalPages);
            }
        } catch (err) {
            console.error("Error fetching users:", err);
        } finally {
            setIsLoadingData(false);
        }
    }, [isReady, getAuthHeaders, page, search, sortBy, sortOrder]);

    useEffect(() => {
        if (isReady) {
            fetchUsers();
        }
    }, [isReady, fetchUsers]);

    // Save user edits
    const saveUserEdits = async () => {
        if (!editingUser) return;
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;

        setIsSaving(true);

        try {
            const res = await fetch("/api/admin/users", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders,
                },
                body: JSON.stringify({
                    userAddress: editingUser.wallet_address,
                    updates: {
                        notes: editNotes,
                        is_banned: editBanned,
                        ban_reason: editBanned ? editBanReason : null,
                    },
                }),
            });

            if (res.ok) {
                setEditingUser(null);
                fetchUsers();
            }
        } catch (err) {
            console.error("Error saving user:", err);
        } finally {
            setIsSaving(false);
        }
    };

    // Grant additional invites to a user
    const handleGrantInvites = async (walletAddress: string) => {
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;

        try {
            const res = await fetch("/api/admin/grant-invites", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders,
                },
                body: JSON.stringify({
                    walletAddress,
                    additionalInvites: 5,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                // Update the editing user's invite count locally
                if (editingUser) {
                    setEditingUser({
                        ...editingUser,
                        invite_count: data.newTotal,
                    });
                }
                // Refresh the users list
                fetchUsers();
            }
        } catch (err) {
            console.error("Error granting invites:", err);
        }
    };

    // Open edit modal
    const openEditModal = (user: User) => {
        setEditingUser(user);
        setEditNotes(user.notes || "");
        setEditBanned(user.is_banned);
        setEditBanReason(user.ban_reason || "");
    };

    // Not connected
    if (!isConnected) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="bg-zinc-900 rounded-2xl p-8 max-w-md w-full text-center border border-zinc-800">
                    <h1 className="text-2xl font-bold text-white mb-4">
                        Admin Access
                    </h1>
                    <p className="text-zinc-400 mb-6">
                        Connect your wallet to view users.
                    </p>

                    {/* AppKit Button - renders the WalletConnect modal */}
                    <div className="mb-4">
                        <appkit-button />
                    </div>

                    <Link
                        href="/"
                        className="text-zinc-500 hover:text-zinc-300 text-sm"
                    >
                        ← Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    // Loading
    if (isLoading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#FF5500]"></div>
            </div>
        );
    }

    // Not authenticated
    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="bg-zinc-900 rounded-2xl p-8 max-w-md w-full text-center border border-zinc-800">
                    <h1 className="text-2xl font-bold text-white mb-4">
                        Admin Access
                    </h1>
                    <p className="text-zinc-400 mb-2">Connected as:</p>
                    <p className="text-white font-mono mb-6">
                        {formatAddress(address || "")}
                    </p>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-6">
                            <p className="text-red-400 text-sm">{error}</p>
                        </div>
                    )}

                    <button
                        onClick={signIn}
                        className="w-full py-3 px-4 bg-[#FF5500] hover:bg-[#E04D00] text-white font-semibold rounded-xl transition-colors"
                    >
                        Sign In with Ethereum
                    </button>

                    <Link
                        href="/"
                        className="block mt-4 text-zinc-500 hover:text-zinc-300 text-sm"
                    >
                        ← Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    // Not an admin
    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="bg-zinc-900 rounded-2xl p-8 max-w-md w-full text-center border border-zinc-800">
                    <h1 className="text-2xl font-bold text-white mb-4">
                        Access Denied
                    </h1>
                    <p className="text-zinc-400 mb-6">
                        Your wallet is not authorized as an admin.
                    </p>
                    <Link href="/" className="text-[#FF5500] hover:underline">
                        ← Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            {/* Header */}
            <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-lg sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/admin"
                            className="text-[#FF5500] hover:text-[#FF7733]"
                        >
                            ← Admin Panel
                        </Link>
                        <h1 className="text-xl font-bold">Users ({total})</h1>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-zinc-500 text-sm">
                            {formatAddress(address || "")}
                        </span>
                        <button
                            onClick={signOut}
                            className="text-zinc-400 hover:text-white text-sm"
                        >
                            Sign Out
                        </button>
                    </div>
                </div>
            </header>

            {/* Filters */}
            <div className="max-w-7xl mx-auto px-4 py-6">
                <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 mb-6">
                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex-1 min-w-[200px]">
                            <input
                                type="text"
                                placeholder="Search by address, ENS, or username..."
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setPage(1);
                                }}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500"
                            />
                        </div>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
                        >
                            <option value="last_login">Last Login</option>
                            <option value="first_login">First Login</option>
                            <option value="login_count">Login Count</option>
                            <option value="points">Points</option>
                            <option value="friends_count">Friends</option>
                            <option value="messages_sent">Messages</option>
                            <option value="voice_minutes">Voice Minutes</option>
                            <option value="video_minutes">Video Minutes</option>
                            <option value="total_calls">Total Calls</option>
                            <option value="invite_count">Invites</option>
                            <option value="wallet_address">Address</option>
                        </select>
                        <select
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
                        >
                            <option value="desc">Descending</option>
                            <option value="asc">Ascending</option>
                        </select>
                        <button
                            onClick={fetchUsers}
                            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Users Table */}
                <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
                    {isLoadingData ? (
                        <div className="p-8 text-center text-zinc-500">
                            Loading...
                        </div>
                    ) : users.length === 0 ? (
                        <div className="p-8 text-center text-zinc-500">
                            No users found
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-zinc-800/50">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-sm text-zinc-400">
                                            User
                                        </th>
                                        <th className="text-left px-4 py-3 text-sm text-zinc-400">
                                            Last Active
                                        </th>
                                        <th className="text-center px-4 py-3 text-sm text-zinc-400">
                                            Points
                                        </th>
                                        <th className="text-center px-4 py-3 text-sm text-zinc-400">
                                            Invites
                                        </th>
                                        <th className="text-center px-4 py-3 text-sm text-zinc-400">
                                            Friends
                                        </th>
                                        <th className="text-center px-4 py-3 text-sm text-zinc-400">
                                            Messages
                                        </th>
                                        <th className="text-center px-4 py-3 text-sm text-zinc-400">
                                            Calls
                                        </th>
                                        <th className="text-left px-4 py-3 text-sm text-zinc-400">
                                            Status
                                        </th>
                                        <th className="text-left px-4 py-3 text-sm text-zinc-400">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800">
                                    {users.map((user) => {
                                        const displayInfo =
                                            getUserDisplayName(user);
                                        const resolvedData = resolvedENS.get(
                                            user.wallet_address.toLowerCase()
                                        );
                                        return (
                                            <tr
                                                key={user.id}
                                                className="hover:bg-zinc-800/30"
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        {/* Avatar */}
                                                        {resolvedData?.avatar ? (
                                                            <img
                                                                src={
                                                                    resolvedData.avatar
                                                                }
                                                                alt=""
                                                                className="w-10 h-10 rounded-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 text-sm">
                                                                {user.wallet_address
                                                                    .slice(2, 4)
                                                                    .toUpperCase()}
                                                            </div>
                                                        )}
                                                        <div>
                                                            {/* Username (Spritz) */}
                                                            {user.username && (
                                                                <p className="text-white font-medium">
                                                                    @
                                                                    {
                                                                        user.username
                                                                    }
                                                                </p>
                                                            )}
                                                            {/* ENS Name */}
                                                            {(user.ens_name ||
                                                                resolvedData?.name) && (
                                                                <p className="text-[#FF5500] text-sm">
                                                                    {user.ens_name ||
                                                                        resolvedData?.name}
                                                                </p>
                                                            )}
                                                            {/* Address */}
                                                            <p className="font-mono text-xs text-zinc-500">
                                                                {formatAddress(
                                                                    user.wallet_address
                                                                )}
                                                            </p>
                                                            <p className="text-zinc-600 text-xs">
                                                                {user.wallet_type ||
                                                                    "unknown"}{" "}
                                                                ·{" "}
                                                                {
                                                                    user.login_count
                                                                }{" "}
                                                                logins
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-zinc-400">
                                                    <div>
                                                        <p>
                                                            {new Date(
                                                                user.last_login
                                                            ).toLocaleDateString()}
                                                        </p>
                                                        <p className="text-zinc-600 text-xs">
                                                            {new Date(
                                                                user.last_login
                                                            ).toLocaleTimeString()}
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-center">
                                                    <span className="inline-flex items-center justify-center px-2 h-8 rounded-lg bg-amber-500/20 text-amber-400 font-medium">
                                                        {(
                                                            user.points || 0
                                                        ).toLocaleString()}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-center">
                                                    <span className="inline-flex items-center justify-center px-2 h-8 rounded-full bg-[#FF5500]/20 text-[#FFBBA7] font-medium text-xs">
                                                        {user.invites_used || 0}/{user.invite_count || 5}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-center">
                                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 font-medium">
                                                        {user.friends_count ||
                                                            0}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-center">
                                                    <span className="inline-flex items-center justify-center w-10 h-8 rounded-lg bg-purple-500/20 text-purple-400 font-medium">
                                                        {user.messages_sent ||
                                                            0}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-center">
                                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-500/20 text-green-400 font-medium">
                                                        {user.total_calls || 0}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    {user.is_banned ? (
                                                        <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded-full text-xs">
                                                            Banned
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs">
                                                            Active
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() =>
                                                            openEditModal(user)
                                                        }
                                                        className="text-[#FF5500] hover:text-[#FF7733] text-sm"
                                                    >
                                                        Details
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="border-t border-zinc-800 p-4 flex items-center justify-between">
                            <p className="text-sm text-zinc-500">
                                Showing {(page - 1) * 25 + 1} -{" "}
                                {Math.min(page * 25, total)} of {total}
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() =>
                                        setPage((p) => Math.max(1, p - 1))
                                    }
                                    disabled={page === 1}
                                    className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded transition-colors"
                                >
                                    Previous
                                </button>
                                <span className="px-3 py-1 text-zinc-400">
                                    {page} / {totalPages}
                                </span>
                                <button
                                    onClick={() =>
                                        setPage((p) =>
                                            Math.min(totalPages, p + 1)
                                        )
                                    }
                                    disabled={page === totalPages}
                                    className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Edit User Modal */}
            {editingUser && (
                <div 
                    className="fixed inset-0 bg-black/70 flex items-start justify-center p-4 z-50 overflow-y-auto"
                    onClick={(e) => {
                        // Close when clicking the backdrop (not the modal content)
                        if (e.target === e.currentTarget) {
                            setEditingUser(null);
                        }
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") {
                            setEditingUser(null);
                        }
                    }}
                    tabIndex={-1}
                    ref={(el) => el?.focus()}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-zinc-900 rounded-2xl p-6 max-w-2xl w-full border border-zinc-800 my-8 max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-bold">
                                    User Details
                                </h2>
                                <p className="font-mono text-sm text-zinc-400 mt-1">
                                    {editingUser.wallet_address}
                                </p>
                                {editingUser.ens_name && (
                                    <p className="text-[#FF5500] text-sm">
                                        {editingUser.ens_name}
                                    </p>
                                )}
                                {editingUser.username && (
                                    <p className="text-zinc-400 text-sm">
                                        @{editingUser.username}
                                    </p>
                                )}
                            </div>
                            {editingUser.is_banned ? (
                                <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm">
                                    Banned
                                </span>
                            ) : (
                                <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
                                    Active
                                </span>
                            )}
                        </div>

                        {/* User Info */}
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-zinc-800/50 rounded-lg p-3">
                                <p className="text-xs text-zinc-500 uppercase">
                                    Wallet Type
                                </p>
                                <p className="text-white">
                                    {editingUser.wallet_type || "Unknown"}
                                </p>
                            </div>
                            <div className="bg-zinc-800/50 rounded-lg p-3">
                                <p className="text-xs text-zinc-500 uppercase">
                                    Chain
                                </p>
                                <p className="text-white">
                                    {editingUser.chain || "Ethereum"}
                                </p>
                            </div>
                            <div className="bg-zinc-800/50 rounded-lg p-3">
                                <p className="text-xs text-zinc-500 uppercase">
                                    First Login
                                </p>
                                <p className="text-white">
                                    {formatDate(editingUser.first_login)}
                                </p>
                            </div>
                            <div className="bg-zinc-800/50 rounded-lg p-3">
                                <p className="text-xs text-zinc-500 uppercase">
                                    Last Login
                                </p>
                                <p className="text-white">
                                    {formatDate(editingUser.last_login)}
                                </p>
                            </div>
                            <div className="bg-zinc-800/50 rounded-lg p-3">
                                <p className="text-xs text-zinc-500 uppercase">
                                    Total Logins
                                </p>
                                <p className="text-white text-xl font-bold">
                                    {editingUser.login_count}
                                </p>
                            </div>
                            <div className="bg-zinc-800/50 rounded-lg p-3">
                                <p className="text-xs text-zinc-500 uppercase">
                                    Invite Code Used
                                </p>
                                <p className="text-white">
                                    {editingUser.invite_code_used ? (
                                        <code className="bg-zinc-700 px-2 py-1 rounded text-sm">
                                            {editingUser.invite_code_used}
                                        </code>
                                    ) : (
                                        <span className="text-zinc-600">
                                            None
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Analytics */}
                        <div className="mb-6">
                            <h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase">
                                Activity Analytics
                            </h3>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-center">
                                    <p className="text-3xl font-bold text-blue-400">
                                        {editingUser.friends_count || 0}
                                    </p>
                                    <p className="text-xs text-blue-400/70 uppercase mt-1">
                                        Friends
                                    </p>
                                </div>
                                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 text-center">
                                    <p className="text-3xl font-bold text-purple-400">
                                        {editingUser.messages_sent || 0}
                                    </p>
                                    <p className="text-xs text-purple-400/70 uppercase mt-1">
                                        Messages Sent
                                    </p>
                                </div>
                                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
                                    <p className="text-3xl font-bold text-green-400">
                                        {editingUser.total_calls || 0}
                                    </p>
                                    <p className="text-xs text-green-400/70 uppercase mt-1">
                                        Total Calls
                                    </p>
                                </div>
                                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4 text-center">
                                    <p className="text-3xl font-bold text-cyan-400">
                                        {editingUser.voice_minutes || 0}
                                    </p>
                                    <p className="text-xs text-cyan-400/70 uppercase mt-1">
                                        Voice Minutes
                                    </p>
                                </div>
                                <div className="bg-pink-500/10 border border-pink-500/30 rounded-lg p-4 text-center">
                                    <p className="text-3xl font-bold text-pink-400">
                                        {editingUser.video_minutes || 0}
                                    </p>
                                    <p className="text-xs text-pink-400/70 uppercase mt-1">
                                        Video Minutes
                                    </p>
                                </div>
                                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-center">
                                    <p className="text-3xl font-bold text-amber-400">
                                        {editingUser.groups_count || 0}
                                    </p>
                                    <p className="text-xs text-amber-400/70 uppercase mt-1">
                                        Groups
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Points & Invites */}
                        <div className="mb-6">
                            <h3 className="text-sm font-semibold text-zinc-400 mb-3 uppercase">
                                Points & Invites
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs text-yellow-400/70 uppercase">
                                                Total Points
                                            </p>
                                            <p className="text-3xl font-bold text-yellow-400">
                                                {(
                                                    editingUser.points || 0
                                                ).toLocaleString()}
                                            </p>
                                        </div>
                                        <svg
                                            className="w-8 h-8 text-yellow-400/50"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                        </svg>
                                    </div>
                                </div>
                                <div className="bg-[#FF5500]/10 border border-[#FF5500]/30 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-xs text-[#FFBBA7]/70 uppercase">
                                                Invites Used
                                            </p>
                                            <p className="text-3xl font-bold text-[#FFBBA7]">
                                                {editingUser.invites_used || 0}/{editingUser.invite_count || 5}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() =>
                                                handleGrantInvites(
                                                    editingUser.wallet_address
                                                )
                                            }
                                            className="px-3 py-1.5 bg-[#FF5500] hover:bg-[#E04D00] text-white text-sm rounded-lg transition-colors"
                                        >
                                            +5 Invites
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {editingUser.email && (
                                <div className="mt-4 bg-zinc-800/50 rounded-lg p-3 flex items-center gap-3">
                                    <svg
                                        className={`w-5 h-5 ${
                                            editingUser.email_verified
                                                ? "text-emerald-400"
                                                : "text-zinc-500"
                                        }`}
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                        />
                                    </svg>
                                    <div>
                                        <p className="text-white text-sm">
                                            {editingUser.email}
                                        </p>
                                        <p
                                            className={`text-xs ${
                                                editingUser.email_verified
                                                    ? "text-emerald-400"
                                                    : "text-zinc-500"
                                            }`}
                                        >
                                            {editingUser.email_verified
                                                ? "Verified"
                                                : "Not verified"}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Admin Controls */}
                        <div className="border-t border-zinc-800 pt-6 space-y-4">
                            <h3 className="text-sm font-semibold text-zinc-400 uppercase">
                                Admin Controls
                            </h3>

                            <div>
                                <label className="block text-sm text-zinc-400 mb-1">
                                    Admin Notes
                                </label>
                                <textarea
                                    value={editNotes}
                                    onChange={(e) =>
                                        setEditNotes(e.target.value)
                                    }
                                    placeholder="Admin notes about this user..."
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-600 h-20"
                                />
                            </div>

                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="banned"
                                    checked={editBanned}
                                    onChange={(e) =>
                                        setEditBanned(e.target.checked)
                                    }
                                    className="rounded bg-zinc-800 border-zinc-600"
                                />
                                <label
                                    htmlFor="banned"
                                    className="text-sm text-zinc-400"
                                >
                                    Ban this user
                                </label>
                            </div>

                            {editBanned && (
                                <div>
                                    <label className="block text-sm text-zinc-400 mb-1">
                                        Ban Reason
                                    </label>
                                    <input
                                        type="text"
                                        value={editBanReason}
                                        onChange={(e) =>
                                            setEditBanReason(e.target.value)
                                        }
                                        placeholder="Reason for ban..."
                                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-600"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => setEditingUser(null)}
                                className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveUserEdits}
                                disabled={isSaving}
                                className="flex-1 py-2 bg-[#FF5500] hover:bg-[#E04D00] disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
                            >
                                {isSaving ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
