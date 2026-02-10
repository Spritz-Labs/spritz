"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { AdminLayout, AdminAuthWrapper, AdminLoading } from "@/components/AdminLayout";

type BroadcastHistory = {
    message: string;
    sent: number;
    failed: number;
    total: number;
    sentAt: string;
};

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
    const [isLoadingCount, setIsLoadingCount] = useState(false);
    const [message, setMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [sendResult, setSendResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const [history, setHistory] = useState<BroadcastHistory[]>([]);

    const maxLength = 2000;

    // Fetch friend count
    const fetchFriendCount = useCallback(async () => {
        if (!isReady) return;
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;

        setIsLoadingCount(true);
        try {
            const res = await fetch("/api/admin/broadcast", { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                setFriendCount(data.friendCount);
            }
        } catch (err) {
            console.error("[Broadcast] Error fetching friend count:", err);
        } finally {
            setIsLoadingCount(false);
        }
    }, [isReady, getAuthHeaders]);

    useEffect(() => {
        fetchFriendCount();
    }, [fetchFriendCount]);

    // Load history from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem("admin-broadcast-history");
            if (saved) setHistory(JSON.parse(saved));
        } catch { /* ignore */ }
    }, []);

    const saveHistory = (entry: BroadcastHistory) => {
        const updated = [entry, ...history].slice(0, 20); // Keep last 20
        setHistory(updated);
        try {
            localStorage.setItem("admin-broadcast-history", JSON.stringify(updated));
        } catch { /* ignore */ }
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
                body: JSON.stringify({ message: message.trim() }),
            });

            const data = await res.json();

            if (!res.ok) {
                setSendError(data.error || "Failed to send broadcast");
                return;
            }

            setSendResult({ sent: data.sent, failed: data.failed, total: data.total });
            saveHistory({
                message: message.trim(),
                sent: data.sent,
                failed: data.failed,
                total: data.total,
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
                        <p className="text-zinc-400 mb-6">Connect your wallet to send broadcasts.</p>
                        <div className="mb-4"><appkit-button /></div>
                    </>
                ) : (
                    <>
                        <p className="text-zinc-400 mb-6">Sign in to verify admin access.</p>
                        <button onClick={signIn} className="px-6 py-2.5 bg-[#FF5500] text-white rounded-xl font-medium hover:bg-[#FF5500]/90 transition-colors">
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
        <AdminLayout
            title="Broadcast"
            subtitle="Send DM to all friends"
            address={address || undefined}
            onSignOut={() => window.location.reload()}
        >
            <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
                {/* Header */}
                <div className="mb-6">
                    <h2 className="text-xl font-bold text-white mb-1">Broadcast Message</h2>
                    <p className="text-sm text-zinc-400">
                        Send a direct message to all your friends at once. Great for announcing new features, updates, or events.
                    </p>
                </div>

                {/* Friend Count */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#FF5500]/20 flex items-center justify-center">
                                <span className="text-lg">👥</span>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white">Recipients</p>
                                <p className="text-xs text-zinc-500">Your friends list</p>
                            </div>
                        </div>
                        <div className="text-right">
                            {isLoadingCount ? (
                                <div className="w-8 h-5 bg-zinc-800 rounded animate-pulse" />
                            ) : (
                                <p className="text-2xl font-bold text-[#FF5500]">{friendCount ?? "—"}</p>
                            )}
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">friends</p>
                        </div>
                    </div>
                </div>

                {/* Message Composer */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-4">
                    <div className="p-3 border-b border-zinc-800">
                        <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Message</p>
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
                            rows={6}
                            disabled={isSending}
                        />
                        <div className="flex items-center justify-between mt-2">
                            <p className="text-[10px] text-zinc-600">
                                Messages appear as DMs from your account
                            </p>
                            <p className={`text-xs tabular-nums ${message.length > maxLength * 0.9 ? "text-amber-400" : "text-zinc-500"}`}>
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
                        disabled={!message.trim() || isSending || !friendCount}
                        className="w-full py-3 bg-[#FF5500] text-white font-semibold rounded-xl hover:bg-[#FF5500]/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Send to {friendCount ?? 0} Friends
                    </button>
                ) : (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                        <div className="flex items-start gap-3 mb-3">
                            <span className="text-lg mt-0.5">⚠️</span>
                            <div>
                                <p className="text-sm font-medium text-amber-400">Confirm Broadcast</p>
                                <p className="text-xs text-zinc-400 mt-1">
                                    This will send a DM to <span className="text-white font-medium">{friendCount}</span> people.
                                    This cannot be undone.
                                </p>
                            </div>
                        </div>
                        <div className="bg-zinc-900/50 rounded-lg p-3 mb-3 max-h-24 overflow-y-auto">
                            <p className="text-xs text-zinc-300 whitespace-pre-wrap">{message.trim()}</p>
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
                    <div className={`mt-4 rounded-xl p-4 border ${sendResult.failed > 0 ? "bg-amber-500/10 border-amber-500/30" : "bg-green-500/10 border-green-500/30"}`}>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{sendResult.failed > 0 ? "⚠️" : "✅"}</span>
                            <p className="text-sm font-medium text-white">
                                Broadcast {sendResult.failed > 0 ? "Partially Sent" : "Sent"}
                            </p>
                        </div>
                        <div className="flex gap-4 text-xs">
                            <div>
                                <span className="text-zinc-400">Delivered: </span>
                                <span className="text-green-400 font-medium">{sendResult.sent}</span>
                            </div>
                            {sendResult.failed > 0 && (
                                <div>
                                    <span className="text-zinc-400">Failed: </span>
                                    <span className="text-red-400 font-medium">{sendResult.failed}</span>
                                </div>
                            )}
                            <div>
                                <span className="text-zinc-400">Total: </span>
                                <span className="text-zinc-300 font-medium">{sendResult.total}</span>
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

                {/* History */}
                {history.length > 0 && (
                    <div className="mt-8">
                        <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
                            <span>📋</span> Recent Broadcasts
                        </h3>
                        <div className="space-y-2">
                            {history.map((entry, i) => (
                                <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <p className="text-[10px] text-zinc-500">
                                            {new Date(entry.sentAt).toLocaleString()}
                                        </p>
                                        <div className="flex items-center gap-2 text-[10px]">
                                            <span className="text-green-400">{entry.sent} sent</span>
                                            {entry.failed > 0 && (
                                                <span className="text-red-400">{entry.failed} failed</span>
                                            )}
                                        </div>
                                    </div>
                                    <p className="text-xs text-zinc-300 line-clamp-2 whitespace-pre-wrap">{entry.message}</p>
                                    {/* Re-use button */}
                                    <button
                                        onClick={() => {
                                            setMessage(entry.message);
                                            window.scrollTo({ top: 0, behavior: "smooth" });
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
