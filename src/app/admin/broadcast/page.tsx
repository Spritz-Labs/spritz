"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import {
    AdminLayout,
    AdminAuthWrapper,
    AdminLoading,
} from "@/components/AdminLayout";

type BroadcastHistory = {
    message: string;
    sent: number;
    failed: number;
    pushSent: number;
    total: number;
    target: "all_users" | "friends";
    sentAt: string;
};

type Target = "all_users" | "friends";

export default function AdminBroadcastPage() {
    const {
        isAdmin,
        isAuthenticated,
        isReady,
        isLoading,
        error,
        isConnected,
        address,
        signIn,
        getAuthHeaders,
    } = useAdmin();

    const [friendCount, setFriendCount] = useState<number | null>(null);
    const [allUsersCount, setAllUsersCount] = useState<number | null>(null);
    const [pushSubscribedCount, setPushSubscribedCount] = useState<number | null>(null);
    const [senderName, setSenderName] = useState<string | null>(null);
    const [isLoadingCount, setIsLoadingCount] = useState(false);
    const [message, setMessage] = useState("");
    const [target, setTarget] = useState<Target>("all_users");
    const [isSending, setIsSending] = useState(false);
    const [sendResult, setSendResult] = useState<{
        sent: number;
        failed: number;
        pushSent: number;
        total: number;
    } | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const [history, setHistory] = useState<BroadcastHistory[]>([]);

    const maxLength = 2000;
    const recipientCount =
        target === "all_users" ? allUsersCount : friendCount;

    // Fetch recipient counts
    const fetchCounts = useCallback(async () => {
        if (!isReady) return;
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;

        setIsLoadingCount(true);
        try {
            const res = await fetch("/api/admin/broadcast", {
                headers: authHeaders,
            });
            if (res.ok) {
                const data = await res.json();
                setFriendCount(data.friendCount);
                setAllUsersCount(data.allUsersCount);
                setPushSubscribedCount(data.pushSubscribedCount);
                setSenderName(data.senderName);
            }
        } catch (err) {
            console.error("[Broadcast] Error fetching counts:", err);
        } finally {
            setIsLoadingCount(false);
        }
    }, [isReady, getAuthHeaders]);

    useEffect(() => {
        fetchCounts();
    }, [fetchCounts]);

    // Load history from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem("admin-broadcast-history-v2");
            if (saved) setHistory(JSON.parse(saved));
        } catch {
            /* ignore */
        }
    }, []);

    const saveHistory = (entry: BroadcastHistory) => {
        const updated = [entry, ...history].slice(0, 20);
        setHistory(updated);
        try {
            localStorage.setItem(
                "admin-broadcast-history-v2",
                JSON.stringify(updated),
            );
        } catch {
            /* ignore */
        }
    };

    // Send broadcast
    const handleSend = async () => {
        if (!message.trim() || isSending) return;
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;

        setIsSending(true);
        setSendResult(null);
        setSendError(null);
        setShowConfirm(false);

        try {
            const res = await fetch("/api/admin/broadcast", {
                method: "POST",
                headers: {
                    ...authHeaders,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ message: message.trim(), target }),
            });

            const data = await res.json();

            if (!res.ok) {
                setSendError(data.error || "Failed to send broadcast");
                return;
            }

            setSendResult({
                sent: data.sent,
                failed: data.failed,
                pushSent: data.pushSent,
                total: data.total,
            });
            saveHistory({
                message: message.trim(),
                sent: data.sent,
                failed: data.failed,
                pushSent: data.pushSent,
                total: data.total,
                target,
                sentAt: new Date().toISOString(),
            });
            setMessage("");
        } catch (err) {
            console.error("[Broadcast] Send error:", err);
            setSendError("Network error - please try again");
        } finally {
            setIsSending(false);
        }
    };

    // Loading state
    if (isLoading) {
        return <AdminLoading />;
    }

    // Auth states
    if (!isAuthenticated) {
        return (
            <AdminAuthWrapper title="Broadcast Messages">
                {!isConnected ? (
                    <>
                        <p className="text-zinc-400 mb-6">
                            Connect your wallet to send broadcasts.
                        </p>
                        <div className="mb-4">
                            <appkit-button />
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-zinc-400 mb-6">
                            Sign in to verify admin access.
                        </p>
                        <button
                            onClick={signIn}
                            className="px-6 py-2.5 bg-[#FF5500] text-white rounded-xl font-medium hover:bg-[#FF5500]/90 transition-colors"
                        >
                            Sign In with Ethereum
                        </button>
                    </>
                )}
            </AdminAuthWrapper>
        );
    }

    if (!isReady || !isAdmin) {
        return (
            <AdminAuthWrapper
                title={!isAdmin ? "Access Denied" : "Loading..."}
            >
                <p className="text-zinc-400 mb-6">
                    {!isAdmin
                        ? "You do not have permission."
                        : "Please wait..."}
                </p>
                {error && (
                    <p className="text-red-400 text-sm mb-4">{error}</p>
                )}
            </AdminAuthWrapper>
        );
    }

    return (
        <AdminLayout
            title="Broadcast"
            subtitle="Send DM to users"
            address={address || undefined}
            onSignOut={() => window.location.reload()}
        >
            <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
                {/* Header */}
                <div className="mb-6">
                    <h2 className="text-xl font-bold text-white mb-1">
                        Send a Message
                    </h2>
                    <p className="text-sm text-zinc-400">
                        Send a direct message to users. It will appear as a
                        regular DM from{" "}
                        <span className="text-white font-medium">
                            {senderName || "you"}
                        </span>
                        , with a push notification.
                    </p>
                </div>

                {/* Target Selector */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
                    <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-3">
                        Send to
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setTarget("all_users")}
                            className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                                target === "all_users"
                                    ? "border-[#FF5500] bg-[#FF5500]/10"
                                    : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                            }`}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xl">🌍</span>
                                <span className="text-sm font-semibold text-white">
                                    All Users
                                </span>
                            </div>
                            <div className="text-right">
                                {isLoadingCount ? (
                                    <div className="w-12 h-6 bg-zinc-800 rounded animate-pulse inline-block" />
                                ) : (
                                    <p className="text-2xl font-bold text-[#FF5500]">
                                        {allUsersCount?.toLocaleString() ?? "—"}
                                    </p>
                                )}
                                <p className="text-[10px] text-zinc-500">
                                    users
                                </p>
                            </div>
                        </button>

                        <button
                            onClick={() => setTarget("friends")}
                            className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                                target === "friends"
                                    ? "border-[#FF5500] bg-[#FF5500]/10"
                                    : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                            }`}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xl">👥</span>
                                <span className="text-sm font-semibold text-white">
                                    Friends Only
                                </span>
                            </div>
                            <div className="text-right">
                                {isLoadingCount ? (
                                    <div className="w-12 h-6 bg-zinc-800 rounded animate-pulse inline-block" />
                                ) : (
                                    <p className="text-2xl font-bold text-blue-400">
                                        {friendCount?.toLocaleString() ?? "—"}
                                    </p>
                                )}
                                <p className="text-[10px] text-zinc-500">
                                    friends
                                </p>
                            </div>
                        </button>
                    </div>

                    {/* Push stats */}
                    {pushSubscribedCount !== null && (
                        <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                            <span>🔔</span>
                            <span>
                                {pushSubscribedCount} users have push
                                notifications enabled
                            </span>
                        </div>
                    )}
                </div>

                {/* Preview: how it will look */}
                {message.trim() && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-4">
                        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-3">
                            Preview
                        </p>
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FF5500] to-[#FF7733] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {(senderName || "K").charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-zinc-400 mb-1">
                                    {senderName || "Admin"}
                                </p>
                                <div className="bg-zinc-800 rounded-2xl rounded-tl-sm px-3 py-2 inline-block max-w-full">
                                    <p className="text-sm text-white whitespace-pre-wrap break-words">
                                        {message.trim()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Message Composer */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-4">
                    <div className="p-3 border-b border-zinc-800">
                        <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
                            Message
                        </p>
                    </div>
                    <div className="p-3">
                        <textarea
                            value={message}
                            onChange={(e) => {
                                if (e.target.value.length <= maxLength) {
                                    setMessage(e.target.value);
                                }
                            }}
                            placeholder="Hey everyone! Just shipped a new feature..."
                            className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg p-4 text-white placeholder:text-zinc-600 resize-none focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20 transition-all text-sm leading-relaxed"
                            rows={5}
                            disabled={isSending}
                        />
                        <div className="flex items-center justify-between mt-2">
                            <p className="text-[10px] text-zinc-600">
                                Appears as a DM from {senderName || "you"} with
                                push notification
                            </p>
                            <p
                                className={`text-xs tabular-nums ${message.length > maxLength * 0.9 ? "text-amber-400" : "text-zinc-500"}`}
                            >
                                {message.length}/{maxLength}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Send Button / Confirm */}
                {!showConfirm ? (
                    <button
                        onClick={() => {
                            setSendResult(null);
                            setSendError(null);
                            setShowConfirm(true);
                        }}
                        disabled={
                            !message.trim() || isSending || !recipientCount
                        }
                        className="w-full py-3 bg-[#FF5500] text-white font-semibold rounded-xl hover:bg-[#FF5500]/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Send to{" "}
                        {recipientCount?.toLocaleString() ?? 0}{" "}
                        {target === "all_users" ? "Users" : "Friends"}
                    </button>
                ) : (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                        <div className="flex items-start gap-3 mb-3">
                            <span className="text-lg mt-0.5">⚠️</span>
                            <div>
                                <p className="text-sm font-medium text-amber-400">
                                    Confirm Broadcast
                                </p>
                                <p className="text-xs text-zinc-400 mt-1">
                                    This will send a DM to{" "}
                                    <span className="text-white font-medium">
                                        {recipientCount?.toLocaleString()}
                                    </span>{" "}
                                    {target === "all_users"
                                        ? "users"
                                        : "friends"}
                                    . Each will receive a push notification.
                                    This cannot be undone.
                                </p>
                            </div>
                        </div>
                        <div className="bg-zinc-900/50 rounded-lg p-3 mb-3 max-h-24 overflow-y-auto">
                            <p className="text-xs text-zinc-300 whitespace-pre-wrap">
                                {message.trim()}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowConfirm(false)}
                                disabled={isSending}
                                className="flex-1 py-2.5 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors text-sm font-medium disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSend}
                                disabled={isSending}
                                className="flex-1 py-2.5 bg-[#FF5500] text-white rounded-lg hover:bg-[#FF5500]/90 transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isSending ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    "Confirm & Send"
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* Result */}
                {sendResult && (
                    <div
                        className={`mt-4 rounded-xl p-4 border ${sendResult.failed > 0 ? "bg-amber-500/10 border-amber-500/30" : "bg-green-500/10 border-green-500/30"}`}
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-lg">
                                {sendResult.failed > 0 ? "⚠️" : "✅"}
                            </span>
                            <p className="text-sm font-medium text-white">
                                Broadcast{" "}
                                {sendResult.failed > 0
                                    ? "Partially Sent"
                                    : "Sent Successfully"}
                            </p>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                            <div className="bg-zinc-900/50 rounded-lg p-2">
                                <p className="text-lg font-bold text-green-400">
                                    {sendResult.sent}
                                </p>
                                <p className="text-[10px] text-zinc-500">
                                    Messages Sent
                                </p>
                            </div>
                            <div className="bg-zinc-900/50 rounded-lg p-2">
                                <p className="text-lg font-bold text-blue-400">
                                    {sendResult.pushSent}
                                </p>
                                <p className="text-[10px] text-zinc-500">
                                    Push Delivered
                                </p>
                            </div>
                            <div className="bg-zinc-900/50 rounded-lg p-2">
                                <p
                                    className={`text-lg font-bold ${sendResult.failed > 0 ? "text-red-400" : "text-zinc-500"}`}
                                >
                                    {sendResult.failed}
                                </p>
                                <p className="text-[10px] text-zinc-500">
                                    Failed
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Error */}
                {sendError && (
                    <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                        <p className="text-sm text-red-400">{sendError}</p>
                    </div>
                )}

                {/* How it works */}
                <div className="mt-6 bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <p className="text-xs font-medium text-zinc-400 mb-2">
                        How it works
                    </p>
                    <ul className="space-y-1.5 text-xs text-zinc-500">
                        <li className="flex items-start gap-2">
                            <span className="text-zinc-600 mt-0.5">1.</span>
                            <span>
                                A DM is inserted for each recipient —
                                appears as a regular message from{" "}
                                <span className="text-zinc-300">
                                    {senderName || "you"}
                                </span>
                            </span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-zinc-600 mt-0.5">2.</span>
                            <span>
                                Online users see it instantly via real-time
                                subscription
                            </span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-zinc-600 mt-0.5">3.</span>
                            <span>
                                Push notification is sent to users who have
                                notifications enabled
                            </span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-zinc-600 mt-0.5">4.</span>
                            <span>
                                Offline users see the message when they next
                                open the app
                            </span>
                        </li>
                    </ul>
                </div>

                {/* History */}
                {history.length > 0 && (
                    <div className="mt-8">
                        <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
                            <span>📋</span> Recent Broadcasts
                        </h3>
                        <div className="space-y-2">
                            {history.map((entry, i) => (
                                <div
                                    key={i}
                                    className="bg-zinc-900 border border-zinc-800 rounded-xl p-3"
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="flex items-center gap-2">
                                            <p className="text-[10px] text-zinc-500">
                                                {new Date(
                                                    entry.sentAt,
                                                ).toLocaleString()}
                                            </p>
                                            <span
                                                className={`text-[10px] px-1.5 py-0.5 rounded ${entry.target === "all_users" ? "bg-[#FF5500]/20 text-[#FF5500]" : "bg-blue-500/20 text-blue-400"}`}
                                            >
                                                {entry.target === "all_users"
                                                    ? "All Users"
                                                    : "Friends"}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px]">
                                            <span className="text-green-400">
                                                {entry.sent} sent
                                            </span>
                                            <span className="text-blue-400">
                                                {entry.pushSent || 0} push
                                            </span>
                                            {entry.failed > 0 && (
                                                <span className="text-red-400">
                                                    {entry.failed} failed
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-xs text-zinc-300 line-clamp-2 whitespace-pre-wrap">
                                        {entry.message}
                                    </p>
                                    <button
                                        onClick={() => {
                                            setMessage(entry.message);
                                            window.scrollTo({
                                                top: 0,
                                                behavior: "smooth",
                                            });
                                        }}
                                        className="mt-2 text-[10px] text-[#FF5500] hover:text-[#FF7733] transition-colors"
                                    >
                                        Re-use this message
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
