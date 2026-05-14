"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { toast } from "sonner";
import {
    AdminLayout,
    AdminAuthWrapper,
    AdminLoading,
} from "@/components/AdminLayout";

type DeveloperKeyRow = {
    id: string;
    developer_address: string;
    name: string;
    scopes: string[];
    rate_limit_per_minute: number;
    is_active: boolean;
    approved_at: string | null;
    revoked_at: string | null;
    created_at: string;
    last_used_at: string | null;
    status: "pending" | "approved" | "revoked";
};

export default function AdminDeveloperKeysPage() {
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

    const [keys, setKeys] = useState<DeveloperKeyRow[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const [pendingOnly, setPendingOnly] = useState(true);
    const [approvingId, setApprovingId] = useState<string | null>(null);

    const formatAddress = (addr: string) =>
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    const formatDate = (d: string | null) =>
        d ? new Date(d).toLocaleString() : "—";

    const fetchKeys = useCallback(async () => {
        if (!isReady || !getAuthHeaders()) return;
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;

        setIsLoadingData(true);
        setListError(null);
        try {
            const q = pendingOnly ? "?pending=true" : "";
            const res = await fetch(`/api/admin/developer-keys${q}`, {
                headers: authHeaders,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || `Failed to load keys (${res.status})`);
            }
            setKeys(Array.isArray(data.keys) ? data.keys : []);
        } catch (e) {
            const msg =
                e instanceof Error ? e.message : "Failed to load developer keys";
            setListError(msg);
            setKeys([]);
        } finally {
            setIsLoadingData(false);
        }
    }, [isReady, getAuthHeaders, pendingOnly]);

    useEffect(() => {
        if (isReady && isAuthenticated && isAdmin) {
            fetchKeys();
        }
    }, [isReady, isAuthenticated, isAdmin, fetchKeys]);

    const pendingCount = useMemo(
        () => keys.filter((k) => k.status === "pending").length,
        [keys],
    );

    const approveKey = async (id: string) => {
        const authHeaders = getAuthHeaders();
        if (!authHeaders) {
            toast.error("Sign in again to approve keys.");
            return;
        }
        setApprovingId(id);
        try {
            const res = await fetch(`/api/admin/developer-keys/${id}/approve`, {
                method: "POST",
                headers: authHeaders,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || "Approval failed");
            }
            toast.success(data.message || "API key approved");
            await fetchKeys();
        } catch (e) {
            toast.error(
                e instanceof Error ? e.message : "Could not approve this key",
            );
        } finally {
            setApprovingId(null);
        }
    };

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
                            Connect your wallet and sign to access the admin panel.
                        </p>
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-6">
                                <p className="text-red-400 text-sm">{error}</p>
                            </div>
                        )}
                        <div className="mb-4">
                            <appkit-button />
                        </div>
                    </>
                ) : (
                    <>
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
                            type="button"
                            onClick={signIn}
                            className="w-full py-3 px-4 bg-[#FF5500] hover:bg-[#E04D00] text-white font-semibold rounded-xl transition-colors"
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
            title="Developer API keys"
            subtitle="Approve keys so the Spritz SDK can authenticate for non-admin developers"
            address={address || undefined}
            isSuperAdmin={isSuperAdmin}
            onSignOut={signOut}
        >
            <div className="max-w-5xl mx-auto px-4 py-4 sm:py-6 pb-24 md:pb-6">
                <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 sm:p-5 mb-6">
                    <h2 className="text-sm font-semibold text-white mb-2">
                        How approval works
                    </h2>
                    <ul className="text-sm text-zinc-400 space-y-1 list-disc list-inside">
                        <li>
                            Keys created from Settings by a{" "}
                            <strong className="text-zinc-300">non-admin</strong>{" "}
                            wallet stay <strong className="text-amber-400">pending</strong>{" "}
                            until you approve them here. Pending keys cannot call APIs
                            that require <code className="text-zinc-500">x-api-key</code>.
                        </li>
                        <li>
                            If the creator is already in{" "}
                            <code className="text-zinc-500">shout_admins</code>, their new
                            key is approved automatically.
                        </li>
                    </ul>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <div className="flex rounded-xl border border-zinc-800 p-1 bg-zinc-900/50 w-fit">
                        <button
                            type="button"
                            onClick={() => setPendingOnly(true)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                pendingOnly
                                    ? "bg-[#FF5500] text-white"
                                    : "text-zinc-400 hover:text-white"
                            }`}
                        >
                            Pending
                            {pendingOnly && pendingCount > 0 && (
                                <span className="ml-1.5 tabular-nums opacity-90">
                                    ({pendingCount})
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setPendingOnly(false)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                !pendingOnly
                                    ? "bg-[#FF5500] text-white"
                                    : "text-zinc-400 hover:text-white"
                            }`}
                        >
                            All keys
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => fetchKeys()}
                        disabled={isLoadingData}
                        className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm text-zinc-200 disabled:opacity-50 w-fit"
                    >
                        {isLoadingData ? "Refreshing…" : "Refresh"}
                    </button>
                </div>

                {listError && (
                    <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
                        {listError}
                    </div>
                )}

                <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
                    <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-2">
                        <h2 className="text-lg font-semibold">
                            {pendingOnly ? "Pending approval" : "All keys"} (
                            {keys.length})
                        </h2>
                    </div>

                    {isLoadingData && keys.length === 0 ? (
                        <div className="p-10 text-center text-zinc-500 text-sm">
                            Loading…
                        </div>
                    ) : keys.length === 0 ? (
                        <div className="p-10 text-center text-zinc-500 text-sm">
                            {pendingOnly
                                ? "No keys waiting for approval."
                                : "No developer keys found."}
                        </div>
                    ) : (
                        <div className="divide-y divide-zinc-800 overflow-x-auto">
                            <table className="w-full text-left text-sm min-w-[640px]">
                                <thead>
                                    <tr className="text-zinc-500 border-b border-zinc-800">
                                        <th className="px-4 py-3 font-medium">
                                            Status
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                            Name
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                            Developer
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                            Scopes
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                            Created
                                        </th>
                                        <th className="px-4 py-3 font-medium text-right">
                                            Action
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {keys.map((k) => (
                                        <tr
                                            key={k.id}
                                            className="hover:bg-zinc-800/40"
                                        >
                                            <td className="px-4 py-3 align-middle">
                                                <span
                                                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                                                        k.status === "approved"
                                                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                                            : k.status === "pending"
                                                              ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                                                              : "bg-zinc-600/20 text-zinc-400 border-zinc-600/40"
                                                    }`}
                                                >
                                                    {k.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 align-middle text-white font-medium">
                                                {k.name}
                                            </td>
                                            <td className="px-4 py-3 align-middle font-mono text-zinc-300 text-xs">
                                                {formatAddress(k.developer_address)}
                                                <span
                                                    className="block text-zinc-600 truncate max-w-[180px]"
                                                    title={k.developer_address}
                                                >
                                                    {k.developer_address}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 align-middle text-zinc-400 text-xs max-w-[140px]">
                                                {(k.scopes || []).join(", ") ||
                                                    "—"}
                                            </td>
                                            <td className="px-4 py-3 align-middle text-zinc-500 text-xs whitespace-nowrap">
                                                {formatDate(k.created_at)}
                                                {k.last_used_at && (
                                                    <span className="block text-zinc-600">
                                                        Last used:{" "}
                                                        {formatDate(
                                                            k.last_used_at,
                                                        )}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 align-middle text-right">
                                                {k.status === "pending" ? (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            approveKey(k.id)
                                                        }
                                                        disabled={
                                                            approvingId === k.id
                                                        }
                                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50"
                                                    >
                                                        {approvingId === k.id
                                                            ? "Approving…"
                                                            : "Approve"}
                                                    </button>
                                                ) : (
                                                    <span className="text-zinc-600 text-xs">
                                                        —
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
}
