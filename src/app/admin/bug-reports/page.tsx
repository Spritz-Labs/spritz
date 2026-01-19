"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { AdminLayout, AdminAuthWrapper, AdminLoading } from "@/components/AdminLayout";

type BugReport = {
    id: string;
    user_address: string;
    category: string;
    description: string;
    replication_steps: string | null;
    media_urls: string[] | null;
    status: "open" | "in_progress" | "resolved" | "closed";
    admin_notes: string | null;
    resolved_by: string | null;
    resolved_at: string | null;
    github_issue_url: string | null;
    github_issue_number: number | null;
    created_at: string;
    updated_at: string;
};

const STATUS_COLORS = {
    open: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    in_progress: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    resolved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    closed: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

export default function BugReportsPage() {
    const {
        isAdmin,
        isAuthenticated,
        isReady,
        isLoading,
        error,
        address,
        isConnected,
        signIn,
        getAuthHeaders,
    } = useAdmin();

    const [bugReports, setBugReports] = useState<BugReport[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [selectedReport, setSelectedReport] = useState<BugReport | null>(null);
    const [adminNotes, setAdminNotes] = useState("");
    const [status, setStatus] = useState<BugReport["status"]>("open");
    const [githubComment, setGithubComment] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isCreatingIssue, setIsCreatingIssue] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [filterCategory, setFilterCategory] = useState<string>("all");

    const formatAddress = (addr: string) =>
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    const formatDate = (date: string) => new Date(date).toLocaleString();

    const fetchBugReports = useCallback(async () => {
        if (!isReady || !getAuthHeaders()) return;

        setIsLoadingData(true);
        try {
            const authHeaders = getAuthHeaders();
            if (!authHeaders) {
                throw new Error("Not authenticated");
            }
            const response = await fetch("/api/admin/bug-reports", {
                headers: authHeaders,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
                throw new Error(errorData.error || `Failed to fetch bug reports (${response.status})`);
            }

            const data = await response.json();
            setBugReports(data.bugReports || []);
        } catch (err) {
            console.error("[Bug Reports] Fetch error:", err);
            // Error is already logged, just set loading to false
        } finally {
            setIsLoadingData(false);
        }
    }, [isReady, getAuthHeaders]);

    useEffect(() => {
        if (isReady && isAuthenticated && isAdmin) {
            fetchBugReports();
        }
    }, [isReady, isAuthenticated, isAdmin, fetchBugReports]);

    const handleCreateGitHubIssue = async () => {
        if (!selectedReport) return;

        const authHeaders = getAuthHeaders();
        if (!authHeaders) {
            alert("Not authenticated");
            return;
        }

        setIsCreatingIssue(true);
        try {
            const response = await fetch(
                `/api/admin/bug-reports/${selectedReport.id}/github`,
                {
                    method: "POST",
                    headers: authHeaders,
                }
            );

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to create GitHub issue");
            }

            await fetchBugReports();
            // Update selected report with new GitHub issue info
            const data = await response.json();
            setSelectedReport(data.bugReport);
        } catch (err) {
            console.error("[Bug Reports] Create GitHub issue error:", err);
            alert(err instanceof Error ? err.message : "Failed to create GitHub issue");
        } finally {
            setIsCreatingIssue(false);
        }
    };

    const handleUpdateStatus = async () => {
        if (!selectedReport) return;

        const authHeaders = getAuthHeaders();
        if (!authHeaders) {
            alert("Not authenticated");
            return;
        }

        setIsSaving(true);
        try {
            const response = await fetch(
                `/api/admin/bug-reports/${selectedReport.id}`,
                {
                    method: "PATCH",
                    headers: {
                        ...authHeaders,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        status,
                        adminNotes: adminNotes.trim() || null,
                        githubComment: status === "resolved" ? githubComment.trim() || null : null,
                    }),
                }
            );

            if (!response.ok) {
                throw new Error("Failed to update bug report");
            }

            await fetchBugReports();
            setSelectedReport(null);
            setAdminNotes("");
            setGithubComment("");
            setStatus("open");
        } catch (err) {
            console.error("[Bug Reports] Update error:", err);
            alert("Failed to update bug report");
        } finally {
            setIsSaving(false);
        }
    };

    const filteredReports = bugReports.filter((report) => {
        if (filterStatus !== "all" && report.status !== filterStatus) {
            return false;
        }
        if (filterCategory !== "all" && report.category !== filterCategory) {
            return false;
        }
        return true;
    });

    const categories = Array.from(
        new Set(bugReports.map((r) => r.category))
    ).sort();

    if (!isReady || isLoading) {
        return <AdminLoading />;
    }

    if (!isAuthenticated || !isAdmin) {
        const needsWalletConnection = !isConnected;
        
        return (
            <AdminAuthWrapper title="Admin Access Required">
                {needsWalletConnection ? (
                    <>
                        <p className="text-zinc-400 mb-6">
                            Connect your wallet and sign to view bug reports.
                        </p>
                        <div className="mb-4">
                            <appkit-button />
                        </div>
                    </>
                ) : (
                    <>
                        <p className="text-zinc-400 mb-6">
                            Sign in to view bug reports.
                        </p>
                        <button
                            onClick={signIn}
                            className="w-full py-3 px-4 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-colors mb-4"
                        >
                            Sign In with Ethereum
                        </button>
                    </>
                )}
            </AdminAuthWrapper>
        );
    }

    return (
        <AdminLayout
            title="Bug Reports"
            subtitle={`${filteredReports.length} of ${bugReports.length} reports`}
        >
            <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
                {/* Filters */}
                <div className="flex flex-wrap gap-3 mb-4 sm:mb-6">
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                    >
                        <option value="all">All Statuses</option>
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="resolved">Resolved</option>
                        <option value="closed">Closed</option>
                    </select>
                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                    >
                        <option value="all">All Categories</option>
                        {categories.map((cat) => (
                            <option key={cat} value={cat}>
                                {cat}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Bug Reports List */}
                {isLoadingData ? (
                    <div className="text-center py-12">
                        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    </div>
                ) : filteredReports.length === 0 ? (
                    <div className="text-center py-12 text-zinc-400">
                        No bug reports found
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredReports.map((report) => (
                            <motion.div
                                key={report.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors cursor-pointer"
                                onClick={() => {
                                    setSelectedReport(report);
                                    setAdminNotes(report.admin_notes || "");
                                    setStatus(report.status);
                                    setGithubComment("");
                                }}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span
                                                className={`px-2 py-1 rounded-lg text-xs font-medium border ${STATUS_COLORS[report.status]}`}
                                            >
                                                {report.status.replace("_", " ")}
                                            </span>
                                            <span className="px-2 py-1 bg-zinc-800 rounded-lg text-xs text-zinc-400">
                                                {report.category}
                                            </span>
                                        </div>
                                        <p className="text-white font-medium mb-1">
                                            {report.description.length > 100
                                                ? `${report.description.slice(0, 100)}...`
                                                : report.description}
                                        </p>
                                        <div className="flex items-center gap-4 text-xs text-zinc-500 mt-2">
                                            <span>
                                                By: {formatAddress(report.user_address)}
                                            </span>
                                            <span>
                                                {formatDate(report.created_at)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            <AnimatePresence>
                {selectedReport && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => {
                            setSelectedReport(null);
                            setAdminNotes("");
                            setGithubComment("");
                            setStatus("open");
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-zinc-900 rounded-2xl p-6 max-w-2xl w-full border border-zinc-800 max-h-[90vh] overflow-y-auto"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h2 className="text-xl font-bold text-white">
                                        Bug Report Details
                                    </h2>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span
                                            className={`px-2 py-1 rounded-lg text-xs font-medium border ${STATUS_COLORS[selectedReport.status]}`}
                                        >
                                            {selectedReport.status.replace("_", " ")}
                                        </span>
                                        <span className="px-2 py-1 bg-zinc-800 rounded-lg text-xs text-zinc-400">
                                            {selectedReport.category}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setSelectedReport(null);
                                        setAdminNotes("");
                                        setStatus("open");
                                    }}
                                    className="text-zinc-500 hover:text-white transition-colors"
                                >
                                    <svg
                                        className="w-6 h-6"
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

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1">
                                        User
                                    </label>
                                    <p className="text-white">
                                        {formatAddress(selectedReport.user_address)}
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-1">
                                        Description
                                    </label>
                                    <p className="text-white whitespace-pre-wrap">
                                        {selectedReport.description}
                                    </p>
                                </div>

                                {selectedReport.replication_steps && (
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-1">
                                            Replication Steps
                                        </label>
                                        <p className="text-white whitespace-pre-wrap">
                                            {selectedReport.replication_steps}
                                        </p>
                                    </div>
                                )}

                                {/* Media Files */}
                                {selectedReport.media_urls && selectedReport.media_urls.length > 0 && (
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-2">
                                            Screenshots / Videos
                                        </label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {selectedReport.media_urls.map((url, index) => {
                                                const isVideo = url.match(/\.(mp4|webm|mov)$/i) || url.includes('video');
                                                return (
                                                    <div
                                                        key={index}
                                                        className="relative rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700"
                                                    >
                                                        {isVideo ? (
                                                            <video
                                                                src={url}
                                                                className="w-full h-48 object-cover"
                                                                controls
                                                            />
                                                        ) : (
                                                            <img
                                                                src={url}
                                                                alt={`Screenshot ${index + 1}`}
                                                                className="w-full h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                                                onClick={() => window.open(url, '_blank')}
                                                            />
                                                        )}
                                                        <a
                                                            href={url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="absolute bottom-2 right-2 px-2 py-1 bg-black/60 hover:bg-black/80 rounded text-white text-xs flex items-center gap-1 transition-colors"
                                                        >
                                                            <svg
                                                                className="w-3 h-3"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                stroke="currentColor"
                                                            >
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={2}
                                                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                                                />
                                                            </svg>
                                                            Open
                                                        </a>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* GitHub Issue */}
                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                                        GitHub Issue
                                    </label>
                                    {selectedReport.github_issue_url ? (
                                        <div className="flex items-center gap-2">
                                            <a
                                                href={selectedReport.github_issue_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white text-sm flex items-center gap-2 transition-colors"
                                            >
                                                <svg
                                                    className="w-4 h-4"
                                                    fill="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                                </svg>
                                                Issue #{selectedReport.github_issue_number}
                                            </a>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleCreateGitHubIssue();
                                            }}
                                            disabled={isCreatingIssue}
                                            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white text-sm flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isCreatingIssue ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    Creating...
                                                </>
                                            ) : (
                                                <>
                                                    <svg
                                                        className="w-4 h-4"
                                                        fill="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                                    </svg>
                                                    Create GitHub Issue
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                                        Status
                                    </label>
                                    <select
                                        value={status}
                                        onChange={(e) =>
                                            setStatus(
                                                e.target.value as BugReport["status"]
                                            )
                                        }
                                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                                    >
                                        <option value="open">Open</option>
                                        <option value="in_progress">
                                            In Progress
                                        </option>
                                        <option value="resolved">Resolved</option>
                                        <option value="closed">Closed</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                                        Admin Notes
                                    </label>
                                    <textarea
                                        value={adminNotes}
                                        onChange={(e) =>
                                            setAdminNotes(e.target.value)
                                        }
                                        placeholder="Add notes about this bug report..."
                                        rows={4}
                                        className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                                    />
                                </div>

                                {status === "resolved" && selectedReport.github_issue_url && (
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-2">
                                            GitHub Resolution Comment (Optional)
                                        </label>
                                        <textarea
                                            value={githubComment}
                                            onChange={(e) =>
                                                setGithubComment(e.target.value)
                                            }
                                            placeholder="Add a comment when closing the GitHub issue..."
                                            rows={3}
                                            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                                        />
                                        <p className="text-zinc-500 text-xs mt-1">
                                            This comment will be added to the GitHub issue when marking as resolved
                                        </p>
                                    </div>
                                )}

                                {selectedReport.resolved_by && (
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-1">
                                            Resolved By
                                        </label>
                                        <p className="text-white">
                                            {formatAddress(selectedReport.resolved_by)}
                                        </p>
                                        {selectedReport.resolved_at && (
                                            <p className="text-zinc-400 text-sm mt-1">
                                                {formatDate(selectedReport.resolved_at)}
                                            </p>
                                        )}
                                    </div>
                                )}

                                <div className="flex gap-3 pt-4">
                                    <button
                                        onClick={() => {
                                            setSelectedReport(null);
                                            setAdminNotes("");
                                            setGithubComment("");
                                            setStatus("open");
                                        }}
                                        className="flex-1 py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleUpdateStatus}
                                        disabled={isSaving}
                                        className="flex-1 py-3 px-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl hover:shadow-lg hover:shadow-orange-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isSaving ? (
                                            <>
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            "Update Status"
                                        )}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </AdminLayout>
    );
}

