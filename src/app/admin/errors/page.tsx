"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";

interface ErrorLog {
    id: string;
    error_type: string;
    error_code: string | null;
    error_message: string;
    user_address: string | null;
    user_email: string | null;
    stack_trace: string | null;
    request_path: string | null;
    user_agent: string | null;
    context: Record<string, unknown>;
    is_resolved: boolean;
    resolved_by: string | null;
    resolution_notes: string | null;
    created_at: string;
}

const ERROR_TYPE_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
    safe_transaction: { label: "Safe Transaction", color: "bg-red-500/20 text-red-400", emoji: "🔐" },
    passkey_signing: { label: "Passkey Signing", color: "bg-orange-500/20 text-orange-400", emoji: "🔑" },
    passkey_registration: { label: "Passkey Registration", color: "bg-yellow-500/20 text-yellow-400", emoji: "📝" },
    wallet_connect: { label: "Wallet Connect", color: "bg-purple-500/20 text-purple-400", emoji: "🔗" },
    wallet_send: { label: "Wallet Send", color: "bg-blue-500/20 text-blue-400", emoji: "💸" },
    vault_transaction: { label: "Vault Transaction", color: "bg-pink-500/20 text-pink-400", emoji: "🏦" },
    api_error: { label: "API Error", color: "bg-gray-500/20 text-gray-400", emoji: "⚡" },
    other: { label: "Other", color: "bg-zinc-500/20 text-zinc-400", emoji: "❓" },
};

// Safe error code descriptions
const SAFE_ERROR_CODES: Record<string, string> = {
    GS000: "Could not finish initialization",
    GS001: "Threshold needs to be defined",
    GS010: "Not enough gas to execute Safe transaction",
    GS013: "Safe transaction failed when gasPrice and safeTxGas were 0",
    GS020: "Signatures data too short",
    GS021: "Invalid contract signature location: inside static part",
    GS022: "Invalid contract signature location: length not present",
    GS023: "Invalid contract signature location: data not complete",
    GS024: "Invalid contract signature provided",
    GS025: "Hash has not been approved",
    GS026: "Invalid contract signature provided",
    GS027: "Invalid owner provided",
};

export default function AdminErrorsPage() {
    const { isAdmin, isLoading: authLoading, isReady } = useAdmin();
    const [errors, setErrors] = useState<ErrorLog[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedError, setSelectedError] = useState<ErrorLog | null>(null);
    
    // Filters
    const [errorType, setErrorType] = useState<string>("");
    const [unresolvedOnly, setUnresolvedOnly] = useState(false);
    const [errorCode, setErrorCode] = useState("");
    const [page, setPage] = useState(0);
    const limit = 20;

    const fetchErrors = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            params.set("limit", limit.toString());
            params.set("offset", (page * limit).toString());
            if (errorType) params.set("type", errorType);
            if (unresolvedOnly) params.set("unresolved", "true");
            if (errorCode) params.set("code", errorCode);

            const response = await fetch(`/api/admin/error-log?${params}`, {
                credentials: "include",
            });

            if (response.ok) {
                const data = await response.json();
                setErrors(data.errors || []);
                setTotal(data.total || 0);
            }
        } catch (err) {
            console.error("Failed to fetch errors:", err);
        } finally {
            setIsLoading(false);
        }
    }, [page, errorType, unresolvedOnly, errorCode]);

    useEffect(() => {
        if (isAdmin) {
            fetchErrors();
        }
    }, [isAdmin, fetchErrors]);

    const toggleResolved = async (errorId: string, isResolved: boolean) => {
        try {
            const response = await fetch("/api/admin/error-log", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ id: errorId, isResolved }),
            });

            if (response.ok) {
                setErrors(prev => prev.map(e => 
                    e.id === errorId ? { ...e, is_resolved: isResolved } : e
                ));
            }
        } catch (err) {
            console.error("Failed to update error:", err);
        }
    };

    if (authLoading || !isReady) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
                    <p className="text-zinc-400">Admin access required</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                            🔴 Error Logs
                        </h1>
                        <p className="text-zinc-400 mt-1">
                            {total} total errors • {errors.filter(e => !e.is_resolved).length} unresolved
                        </p>
                    </div>
                    <button
                        onClick={fetchErrors}
                        className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh
                    </button>
                </div>

                {/* Filters */}
                <div className="bg-zinc-900 rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-center">
                    <select
                        value={errorType}
                        onChange={(e) => { setErrorType(e.target.value); setPage(0); }}
                        className="bg-zinc-800 text-white px-3 py-2 rounded-lg border border-zinc-700"
                    >
                        <option value="">All Types</option>
                        {Object.entries(ERROR_TYPE_LABELS).map(([key, { label, emoji }]) => (
                            <option key={key} value={key}>{emoji} {label}</option>
                        ))}
                    </select>

                    <input
                        type="text"
                        value={errorCode}
                        onChange={(e) => { setErrorCode(e.target.value); setPage(0); }}
                        placeholder="Error code (e.g., GS026)"
                        className="bg-zinc-800 text-white px-3 py-2 rounded-lg border border-zinc-700 w-48"
                    />

                    <label className="flex items-center gap-2 text-white cursor-pointer">
                        <input
                            type="checkbox"
                            checked={unresolvedOnly}
                            onChange={(e) => { setUnresolvedOnly(e.target.checked); setPage(0); }}
                            className="w-4 h-4 rounded"
                        />
                        Unresolved only
                    </label>
                </div>

                {/* Error List */}
                <div className="space-y-3">
                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full" />
                        </div>
                    ) : errors.length === 0 ? (
                        <div className="text-center py-12 text-zinc-500">
                            No errors found
                        </div>
                    ) : (
                        errors.map((error) => {
                            const typeInfo = ERROR_TYPE_LABELS[error.error_type] || ERROR_TYPE_LABELS.other;
                            const safeErrorDesc = error.error_code ? SAFE_ERROR_CODES[error.error_code] : null;
                            
                            return (
                                <motion.div
                                    key={error.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`bg-zinc-900 rounded-xl p-4 border ${
                                        error.is_resolved ? "border-zinc-800 opacity-60" : "border-zinc-700"
                                    } cursor-pointer hover:border-zinc-600 transition-colors`}
                                    onClick={() => setSelectedError(error)}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                                                <span className={`px-2 py-1 rounded text-xs font-medium ${typeInfo.color}`}>
                                                    {typeInfo.emoji} {typeInfo.label}
                                                </span>
                                                {error.error_code && (
                                                    <span className="px-2 py-1 rounded text-xs font-mono bg-red-900/30 text-red-400">
                                                        {error.error_code}
                                                    </span>
                                                )}
                                                {error.is_resolved && (
                                                    <span className="px-2 py-1 rounded text-xs bg-green-900/30 text-green-400">
                                                        ✓ Resolved
                                                    </span>
                                                )}
                                            </div>
                                            
                                            <p className="text-white font-medium truncate mb-1">
                                                {error.error_message.slice(0, 150)}
                                                {error.error_message.length > 150 && "..."}
                                            </p>
                                            
                                            {safeErrorDesc && (
                                                <p className="text-orange-400 text-sm mb-2">
                                                    💡 {safeErrorDesc}
                                                </p>
                                            )}
                                            
                                            <div className="flex items-center gap-4 text-sm text-zinc-500">
                                                {error.user_address && (
                                                    <span title={error.user_address}>
                                                        👤 {error.user_address.slice(0, 6)}...{error.user_address.slice(-4)}
                                                    </span>
                                                )}
                                                {error.user_email && (
                                                    <span>📧 {error.user_email}</span>
                                                )}
                                                <span>
                                                    🕒 {formatDistanceToNow(new Date(error.created_at), { addSuffix: true })}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleResolved(error.id, !error.is_resolved);
                                            }}
                                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                                error.is_resolved
                                                    ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                                    : "bg-green-600 text-white hover:bg-green-500"
                                            }`}
                                        >
                                            {error.is_resolved ? "Unresolve" : "Mark Resolved"}
                                        </button>
                                    </div>
                                </motion.div>
                            );
                        })
                    )}
                </div>

                {/* Pagination */}
                {total > limit && (
                    <div className="flex items-center justify-center gap-4 mt-6">
                        <button
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="px-4 py-2 bg-zinc-800 text-white rounded-lg disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <span className="text-zinc-400">
                            Page {page + 1} of {Math.ceil(total / limit)}
                        </span>
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={(page + 1) * limit >= total}
                            className="px-4 py-2 bg-zinc-800 text-white rounded-lg disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>

            {/* Error Detail Modal */}
            <AnimatePresence>
                {selectedError && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
                        onClick={() => setSelectedError(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-zinc-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-white">Error Details</h2>
                                <button
                                    onClick={() => setSelectedError(null)}
                                    className="p-2 hover:bg-zinc-800 rounded-lg"
                                >
                                    <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            
                            <div className="p-6 space-y-6">
                                {/* Error Info */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm text-zinc-500">Type</label>
                                        <p className="text-white">
                                            {ERROR_TYPE_LABELS[selectedError.error_type]?.emoji} {ERROR_TYPE_LABELS[selectedError.error_type]?.label}
                                        </p>
                                    </div>
                                    <div>
                                        <label className="text-sm text-zinc-500">Error Code</label>
                                        <p className="text-white font-mono">{selectedError.error_code || "—"}</p>
                                    </div>
                                    <div>
                                        <label className="text-sm text-zinc-500">User Address</label>
                                        <p className="text-white font-mono text-sm break-all">
                                            {selectedError.user_address || "—"}
                                        </p>
                                    </div>
                                    <div>
                                        <label className="text-sm text-zinc-500">User Email</label>
                                        <p className="text-white">{selectedError.user_email || "—"}</p>
                                    </div>
                                    <div>
                                        <label className="text-sm text-zinc-500">Request Path</label>
                                        <p className="text-white font-mono text-sm">{selectedError.request_path || "—"}</p>
                                    </div>
                                    <div>
                                        <label className="text-sm text-zinc-500">Timestamp</label>
                                        <p className="text-white">{new Date(selectedError.created_at).toLocaleString()}</p>
                                    </div>
                                </div>

                                {/* Error Message */}
                                <div>
                                    <label className="text-sm text-zinc-500">Error Message</label>
                                    <pre className="mt-1 p-4 bg-zinc-800 rounded-lg text-red-400 text-sm overflow-x-auto whitespace-pre-wrap">
                                        {selectedError.error_message}
                                    </pre>
                                </div>

                                {/* Safe Error Description */}
                                {selectedError.error_code && SAFE_ERROR_CODES[selectedError.error_code] && (
                                    <div className="p-4 bg-orange-900/20 border border-orange-500/30 rounded-lg">
                                        <p className="text-orange-400 font-medium">
                                            💡 {selectedError.error_code}: {SAFE_ERROR_CODES[selectedError.error_code]}
                                        </p>
                                    </div>
                                )}

                                {/* Context */}
                                {selectedError.context && Object.keys(selectedError.context).length > 0 && (
                                    <div>
                                        <label className="text-sm text-zinc-500">Context (Debug Data)</label>
                                        <pre className="mt-1 p-4 bg-zinc-800 rounded-lg text-zinc-300 text-xs overflow-x-auto max-h-96">
                                            {JSON.stringify(selectedError.context, null, 2)}
                                        </pre>
                                    </div>
                                )}

                                {/* Stack Trace */}
                                {selectedError.stack_trace && (
                                    <div>
                                        <label className="text-sm text-zinc-500">Stack Trace</label>
                                        <pre className="mt-1 p-4 bg-zinc-800 rounded-lg text-zinc-400 text-xs overflow-x-auto max-h-48">
                                            {selectedError.stack_trace}
                                        </pre>
                                    </div>
                                )}

                                {/* User Agent */}
                                {selectedError.user_agent && (
                                    <div>
                                        <label className="text-sm text-zinc-500">User Agent</label>
                                        <p className="text-zinc-400 text-sm break-all">{selectedError.user_agent}</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
