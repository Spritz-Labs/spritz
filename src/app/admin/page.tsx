"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";

const INVITE_BASE_URL = "https://app.spritz.chat";
const MARKETING_BLURB = `🚀 You're invited to Spritz - the censorship resistant chat app for Web3!

✨ Features:
• End-to-end encrypted messaging
• Voice & video calls
• Connect with your wallet
• No phone number required
• Truly decentralized & unstoppable

Join now:`;

type InviteCode = {
    id: string;
    code: string;
    created_by: string;
    max_uses: number;
    current_uses: number;
    expires_at: string | null;
    is_active: boolean;
    note: string | null;
    created_at: string;
    usedBy: { used_by: string; used_at: string }[];
};

type Admin = {
    id: string;
    wallet_address: string;
    added_by: string | null;
    is_super_admin: boolean;
    created_at: string;
};

export default function AdminPage() {
    const {
        isAdmin,
        isSuperAdmin,
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

    const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
    const [admins, setAdmins] = useState<Admin[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [activeTab, setActiveTab] = useState<"invites" | "admins">("invites");
    const [copiedCode, setCopiedCode] = useState<string | null>(null);

    // Generate invite link with marketing blurb
    const getInviteLink = (code: string) => `${INVITE_BASE_URL}?invite=${code}`;

    const getInviteMessage = (code: string) =>
        `${MARKETING_BLURB}\n${getInviteLink(code)}`;

    const copyInviteLink = async (code: string, withBlurb: boolean = false) => {
        const text = withBlurb ? getInviteMessage(code) : getInviteLink(code);
        await navigator.clipboard.writeText(text);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    // Invite code form
    const [newCodeMaxUses, setNewCodeMaxUses] = useState(1);
    const [newCodeNote, setNewCodeNote] = useState("");
    const [newCodeCustom, setNewCodeCustom] = useState("");
    const [isCreatingCode, setIsCreatingCode] = useState(false);

    // Add admin form
    const [newAdminAddress, setNewAdminAddress] = useState("");
    const [newAdminSuper, setNewAdminSuper] = useState(false);
    const [isAddingAdmin, setIsAddingAdmin] = useState(false);

    const formatAddress = (addr: string) =>
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    const formatDate = (date: string) => new Date(date).toLocaleString();

    // Fetch data
    const fetchData = useCallback(async () => {
        if (!isReady) {
            console.log("[Admin Page] Not ready to fetch");
            return;
        }

        const authHeaders = getAuthHeaders();

        // Don't fetch if we don't have valid auth headers
        if (!authHeaders) {
            console.log("[Admin Page] No valid auth headers");
            return;
        }

        setIsLoadingData(true);

        try {
            // Fetch invite codes
            const codesRes = await fetch("/api/admin/invite-codes", {
                headers: authHeaders,
            });
            const codesData = await codesRes.json();
            if (codesData.codes) setInviteCodes(codesData.codes);

            // Fetch admins
            const adminsRes = await fetch("/api/admin/admins", {
                headers: authHeaders,
            });
            const adminsData = await adminsRes.json();
            if (adminsData.admins) setAdmins(adminsData.admins);
        } catch (err) {
            console.error("Error fetching data:", err);
        } finally {
            setIsLoadingData(false);
        }
    }, [isReady, getAuthHeaders]);

    useEffect(() => {
        if (isReady) {
            fetchData();
        }
    }, [isReady, fetchData]);

    // Create invite code
    const createInviteCode = async () => {
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;

        setIsCreatingCode(true);
        try {
            const res = await fetch("/api/admin/invite-codes", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders,
                },
                body: JSON.stringify({
                    maxUses: newCodeMaxUses,
                    note: newCodeNote || null,
                    customCode: newCodeCustom || null,
                }),
            });

            if (res.ok) {
                setNewCodeMaxUses(1);
                setNewCodeNote("");
                setNewCodeCustom("");
                fetchData();
            }
        } catch (err) {
            console.error("Error creating code:", err);
        } finally {
            setIsCreatingCode(false);
        }
    };

    // Deactivate invite code
    const deactivateCode = async (code: string) => {
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;

        try {
            await fetch("/api/admin/invite-codes", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders,
                },
                body: JSON.stringify({ code, isActive: false }),
            });
            fetchData();
        } catch (err) {
            console.error("Error deactivating code:", err);
        }
    };

    // Add admin
    const addAdmin = async () => {
        if (!newAdminAddress) return;
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;

        setIsAddingAdmin(true);
        try {
            const res = await fetch("/api/admin/admins", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders,
                },
                body: JSON.stringify({
                    walletAddress: newAdminAddress,
                    makeSuperAdmin: newAdminSuper,
                }),
            });

            if (res.ok) {
                setNewAdminAddress("");
                setNewAdminSuper(false);
                fetchData();
            }
        } catch (err) {
            console.error("Error adding admin:", err);
        } finally {
            setIsAddingAdmin(false);
        }
    };

    // Remove admin
    const removeAdmin = async (walletAddress: string) => {
        if (!confirm(`Remove ${formatAddress(walletAddress)} as admin?`))
            return;
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;

        try {
            await fetch(`/api/admin/admins?address=${walletAddress}`, {
                method: "DELETE",
                headers: authHeaders,
            });
            fetchData();
        } catch (err) {
            console.error("Error removing admin:", err);
        }
    };

    // Loading - show this first to give credentials time to load
    if (isLoading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#FF5500] mx-auto mb-4"></div>
                    <p className="text-zinc-500 text-sm">Checking credentials...</p>
                </div>
            </div>
        );
    }

    // Not connected and no cached credentials
    if (!isConnected) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="bg-zinc-900 rounded-2xl p-8 max-w-md w-full text-center border border-zinc-800">
                    <h1 className="text-2xl font-bold text-white mb-4">
                        Admin Access
                    </h1>
                    <p className="text-zinc-400 mb-6">
                        Connect your wallet to access the admin panel.
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

    // Not authenticated - show sign in
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
                        Your wallet ({formatAddress(address || "")}) is not
                        authorized as an admin.
                    </p>
                    <Link href="/" className="text-[#FF5500] hover:underline">
                        ← Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    // Admin dashboard
    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            {/* Header - with safe area padding for iPhone notch */}
            <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-lg sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    {/* Desktop layout */}
                    <div className="hidden sm:flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Link
                                href="/"
                                className="text-[#FF5500] hover:text-[#FF7733]"
                            >
                                ← Back
                            </Link>
                            <h1 className="text-xl font-bold">Admin Panel</h1>
                            {isSuperAdmin && (
                                <span className="px-2 py-1 bg-[#FF5500]/20 text-[#FF5500] text-xs rounded-full">
                                    Super Admin
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            <Link
                                href="/admin/users"
                                className="text-zinc-400 hover:text-white transition-colors"
                            >
                                Users
                            </Link>
                            <Link
                                href="/admin/analytics"
                                className="text-zinc-400 hover:text-white transition-colors"
                            >
                                Analytics
                            </Link>
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

                    {/* Mobile layout */}
                    <div className="sm:hidden space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Link
                                    href="/"
                                    className="text-[#FF5500] hover:text-[#FF7733]"
                                >
                                    ←
                                </Link>
                                <h1 className="text-lg font-bold">Admin</h1>
                                {isSuperAdmin && (
                                    <span className="px-2 py-0.5 bg-[#FF5500]/20 text-[#FF5500] text-xs rounded-full">
                                        Super
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={signOut}
                                className="text-zinc-400 hover:text-white text-sm"
                            >
                                Sign Out
                            </button>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-zinc-500">
                                {formatAddress(address || "")}
                            </span>
                            <div className="flex gap-2">
                                <Link
                                    href="/admin/analytics"
                                    className="px-3 py-1.5 bg-zinc-800 text-white rounded-lg font-medium"
                                >
                                    📊
                                </Link>
                                <Link
                                    href="/admin/users"
                                    className="px-3 py-1.5 bg-[#FF5500] text-white rounded-lg font-medium"
                                >
                                    👥
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Tabs */}
            <div className="max-w-7xl mx-auto px-4 py-6">
                <div className="flex gap-2 mb-6">
                    <button
                        onClick={() => setActiveTab("invites")}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                            activeTab === "invites"
                                ? "bg-[#FF5500] text-white"
                                : "bg-zinc-800 text-zinc-400 hover:text-white"
                        }`}
                    >
                        Invite Codes
                    </button>
                    <button
                        onClick={() => setActiveTab("admins")}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                            activeTab === "admins"
                                ? "bg-[#FF5500] text-white"
                                : "bg-zinc-800 text-zinc-400 hover:text-white"
                        }`}
                    >
                        Manage Admins
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    {activeTab === "invites" && (
                        <motion.div
                            key="invites"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            {/* Create Invite Code */}
                            <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 mb-6">
                                <h2 className="text-lg font-semibold mb-4">
                                    Create Invite Code
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">
                                            Max Uses (0 = unlimited)
                                        </label>
                                        <input
                                            type="number"
                                            value={newCodeMaxUses}
                                            onChange={(e) =>
                                                setNewCodeMaxUses(
                                                    parseInt(e.target.value) ||
                                                        0
                                                )
                                            }
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
                                            min="0"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">
                                            Custom Code (optional)
                                        </label>
                                        <input
                                            type="text"
                                            value={newCodeCustom}
                                            onChange={(e) =>
                                                setNewCodeCustom(
                                                    e.target.value.toUpperCase()
                                                )
                                            }
                                            placeholder="AUTO-GENERATED"
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-600"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-zinc-400 mb-1">
                                            Note
                                        </label>
                                        <input
                                            type="text"
                                            value={newCodeNote}
                                            onChange={(e) =>
                                                setNewCodeNote(e.target.value)
                                            }
                                            placeholder="e.g., Twitter giveaway"
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-600"
                                        />
                                    </div>
                                    <div className="flex items-end">
                                        <button
                                            onClick={createInviteCode}
                                            disabled={isCreatingCode}
                                            className="w-full py-2 bg-[#FF5500] hover:bg-[#E04D00] disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
                                        >
                                            {isCreatingCode
                                                ? "Creating..."
                                                : "Create Code"}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Invite Codes List */}
                            <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
                                <div className="p-4 border-b border-zinc-800">
                                    <h2 className="text-lg font-semibold">
                                        Invite Codes ({inviteCodes.length})
                                    </h2>
                                </div>
                                {isLoadingData ? (
                                    <div className="p-8 text-center text-zinc-500">
                                        Loading...
                                    </div>
                                ) : inviteCodes.length === 0 ? (
                                    <div className="p-8 text-center text-zinc-500">
                                        No invite codes yet
                                    </div>
                                ) : (
                                    <div className="divide-y divide-zinc-800">
                                        {inviteCodes.map((code) => (
                                            <div
                                                key={code.id}
                                                className="p-4 hover:bg-zinc-800/30"
                                            >
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <code className="bg-zinc-800 px-3 py-1.5 rounded-lg text-[#FF5500] font-bold text-lg">
                                                                {code.code}
                                                            </code>
                                                            <span
                                                                className={`px-2 py-1 rounded-full text-xs ${
                                                                    code.max_uses > 0 && code.current_uses >= code.max_uses
                                                                        ? "bg-amber-500/20 text-amber-400"
                                                                        : code.is_active
                                                                        ? "bg-green-500/20 text-green-400"
                                                                        : "bg-red-500/20 text-red-400"
                                                                }`}
                                                            >
                                                                {code.max_uses > 0 && code.current_uses >= code.max_uses
                                                                    ? "Redeemed"
                                                                    : code.is_active
                                                                    ? "Active"
                                                                    : "Inactive"}
                                                            </span>
                                                            <span className="text-sm text-zinc-500">
                                                                {
                                                                    code.current_uses
                                                                }{" "}
                                                                /{" "}
                                                                {code.max_uses ===
                                                                0
                                                                    ? "∞"
                                                                    : code.max_uses}{" "}
                                                                uses
                                                            </span>
                                                        </div>

                                                        {/* Invite Link */}
                                                        <div className="bg-zinc-800/50 rounded-lg p-3 mb-3">
                                                            <p className="text-xs text-zinc-500 mb-1">
                                                                Invite Link
                                                            </p>
                                                            <code className="text-sm text-zinc-300 block truncate mb-2">
                                                                {getInviteLink(
                                                                    code.code
                                                                )}
                                                            </code>
                                                            <div className="flex flex-wrap gap-2">
                                                                <button
                                                                    onClick={() =>
                                                                        copyInviteLink(
                                                                            code.code,
                                                                            false
                                                                        )
                                                                    }
                                                                    className={`px-3 py-1.5 rounded text-xs transition-colors flex-1 sm:flex-none ${
                                                                        copiedCode ===
                                                                        code.code
                                                                            ? "bg-green-500/20 text-green-400"
                                                                            : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                                                                    }`}
                                                                >
                                                                    {copiedCode ===
                                                                    code.code
                                                                        ? "✓ Copied!"
                                                                        : "📋 Copy Link"}
                                                                </button>
                                                                <button
                                                                    onClick={() =>
                                                                        copyInviteLink(
                                                                            code.code,
                                                                            true
                                                                        )
                                                                    }
                                                                    className="px-3 py-1.5 bg-[#FF5500] text-white hover:bg-[#E04D00] rounded text-xs transition-colors flex-1 sm:flex-none font-medium"
                                                                >
                                                                    🚀 Copy with
                                                                    Blurb
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-4 text-xs text-zinc-500">
                                                            <span>
                                                                Created by{" "}
                                                                {formatAddress(
                                                                    code.created_by
                                                                )}
                                                            </span>
                                                            {code.note && (
                                                                <span>
                                                                    •{" "}
                                                                    {code.note}
                                                                </span>
                                                            )}
                                                            <span>
                                                                •{" "}
                                                                {new Date(
                                                                    code.created_at
                                                                ).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col gap-2">
                                                        {code.is_active && (
                                                            <button
                                                                onClick={() =>
                                                                    deactivateCode(
                                                                        code.code
                                                                    )
                                                                }
                                                                className="px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm transition-colors"
                                                            >
                                                                Deactivate
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Used By */}
                                                {code.usedBy &&
                                                    code.usedBy.length > 0 && (
                                                        <div className="mt-3 pt-3 border-t border-zinc-800">
                                                            <p className="text-xs text-zinc-500 mb-2">
                                                                Used by:
                                                            </p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {code.usedBy.map(
                                                                    (
                                                                        usage,
                                                                        idx
                                                                    ) => (
                                                                        <span
                                                                            key={
                                                                                idx
                                                                            }
                                                                            className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-400"
                                                                        >
                                                                            {formatAddress(
                                                                                usage.used_by
                                                                            )}
                                                                        </span>
                                                                    )
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {activeTab === "admins" && (
                        <motion.div
                            key="admins"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            {/* Add Admin (super admin only) */}
                            {isSuperAdmin && (
                                <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 mb-6">
                                    <h2 className="text-lg font-semibold mb-4">
                                        Add New Admin
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="md:col-span-2">
                                            <label className="block text-sm text-zinc-400 mb-1">
                                                Wallet Address
                                            </label>
                                            <input
                                                type="text"
                                                value={newAdminAddress}
                                                onChange={(e) =>
                                                    setNewAdminAddress(
                                                        e.target.value
                                                    )
                                                }
                                                placeholder="0x..."
                                                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-600 font-mono"
                                            />
                                        </div>
                                        <div className="flex items-end gap-4">
                                            <label className="flex items-center gap-2 text-sm text-zinc-400">
                                                <input
                                                    type="checkbox"
                                                    checked={newAdminSuper}
                                                    onChange={(e) =>
                                                        setNewAdminSuper(
                                                            e.target.checked
                                                        )
                                                    }
                                                    className="rounded bg-zinc-800 border-zinc-600"
                                                />
                                                Super Admin
                                            </label>
                                            <button
                                                onClick={addAdmin}
                                                disabled={
                                                    isAddingAdmin ||
                                                    !newAdminAddress
                                                }
                                                className="px-4 py-2 bg-[#FF5500] hover:bg-[#E04D00] disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
                                            >
                                                {isAddingAdmin
                                                    ? "Adding..."
                                                    : "Add Admin"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Admins List */}
                            <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
                                <div className="p-4 border-b border-zinc-800">
                                    <h2 className="text-lg font-semibold">
                                        Admins ({admins.length})
                                    </h2>
                                </div>
                                {isLoadingData ? (
                                    <div className="p-8 text-center text-zinc-500">
                                        Loading...
                                    </div>
                                ) : (
                                    <div className="divide-y divide-zinc-800">
                                        {admins.map((admin) => (
                                            <div
                                                key={admin.id}
                                                className="p-4 flex items-center justify-between hover:bg-zinc-800/30"
                                            >
                                                <div>
                                                    <p className="font-mono text-white">
                                                        {admin.wallet_address}
                                                    </p>
                                                    <p className="text-sm text-zinc-500">
                                                        Added{" "}
                                                        {formatDate(
                                                            admin.created_at
                                                        )}
                                                        {admin.added_by &&
                                                            ` by ${formatAddress(
                                                                admin.added_by
                                                            )}`}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    {admin.is_super_admin && (
                                                        <span className="px-2 py-1 bg-[#FF5500]/20 text-[#FF5500] text-xs rounded-full">
                                                            Super Admin
                                                        </span>
                                                    )}
                                                    {isSuperAdmin &&
                                                        admin.wallet_address !==
                                                            address?.toLowerCase() && (
                                                            <button
                                                                onClick={() =>
                                                                    removeAdmin(
                                                                        admin.wallet_address
                                                                    )
                                                                }
                                                                className="text-red-400 hover:text-red-300 text-sm"
                                                            >
                                                                Remove
                                                            </button>
                                                        )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
