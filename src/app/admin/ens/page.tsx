"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import {
    AdminLayout,
    AdminAuthWrapper,
    AdminLoading,
} from "@/components/AdminLayout";

type EnsConfig = {
    id: string;
    parent_name: string;
    gateway_url: string;
    signer_address: string | null;
    resolver_address: string | null;
    ttl: number;
    enabled: boolean;
    updated_at: string;
    updated_by: string | null;
};

type RecentClaim = {
    username: string;
    wallet_address: string;
    wallet_type: string;
    ens_subname_claimed_at: string;
    ens_resolve_address: string | null;
};

type ResolveResult = {
    found: boolean;
    name: string;
    username?: string;
    claimed?: boolean;
    eligible?: boolean;
    reason?: string;
    resolveAddress?: string | null;
    walletType?: string;
    displayName?: string;
    enabled?: boolean;
};

export default function AdminEnsPage() {
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
        isSuperAdmin,
        signOut,
    } = useAdmin();

    const [config, setConfig] = useState<EnsConfig | null>(null);
    const [stats, setStats] = useState({ totalClaimed: 0, eligibleCount: 0 });
    const [recentClaims, setRecentClaims] = useState<RecentClaim[]>([]);
    const [loadingData, setLoadingData] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);

    const [testName, setTestName] = useState("");
    const [testResult, setTestResult] = useState<ResolveResult | null>(null);
    const [testing, setTesting] = useState(false);

    const [editEnabled, setEditEnabled] = useState(false);
    const [editGateway, setEditGateway] = useState("");
    const [editResolver, setEditResolver] = useState("");
    const [editParent, setEditParent] = useState("");
    const [editTtl, setEditTtl] = useState(300);

    const fetchData = useCallback(async () => {
        if (!isReady) return;
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;

        setLoadingData(true);
        try {
            const res = await fetch("/api/admin/ens", { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                setConfig(data.config);
                setStats(data.stats);
                setRecentClaims(data.recentClaims || []);
                if (data.config) {
                    setEditEnabled(data.config.enabled);
                    setEditGateway(data.config.gateway_url || "");
                    setEditResolver(data.config.resolver_address || "");
                    setEditParent(data.config.parent_name || "spritz.eth");
                    setEditTtl(data.config.ttl || 300);
                }
            }
        } catch (err) {
            console.error("[ENS Admin] Fetch error:", err);
        } finally {
            setLoadingData(false);
        }
    }, [isReady, getAuthHeaders]);

    useEffect(() => {
        if (isReady && isAdmin) fetchData();
    }, [isReady, isAdmin, fetchData]);

    const saveConfig = async () => {
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;

        setSaving(true);
        setSaveMsg(null);
        try {
            const res = await fetch("/api/admin/ens", {
                method: "PATCH",
                headers: { ...authHeaders, "Content-Type": "application/json" },
                body: JSON.stringify({
                    enabled: editEnabled,
                    gateway_url: editGateway,
                    resolver_address: editResolver,
                    parent_name: editParent,
                    ttl: editTtl,
                }),
            });
            if (res.ok) {
                setSaveMsg("Saved");
                fetchData();
            } else {
                const data = await res.json();
                setSaveMsg(`Error: ${data.error}`);
            }
        } catch {
            setSaveMsg("Network error");
        } finally {
            setSaving(false);
        }
    };

    const runTest = async () => {
        if (!testName) return;
        setTesting(true);
        setTestResult(null);
        try {
            const name = testName.includes(".") ? testName : `${testName}.${editParent || "spritz.eth"}`;
            const res = await fetch(`/api/ens/resolve?name=${encodeURIComponent(name)}`);
            const data = await res.json();
            setTestResult(data);
        } catch {
            setTestResult({ found: false, name: testName });
        } finally {
            setTesting(false);
        }
    };

    if (isLoading) return <AdminLoading />;
    if (!isAuthenticated || !isAdmin) {
        return (
            <AdminAuthWrapper
                isConnected={isConnected}
                isAuthenticated={isAuthenticated}
                isAdmin={isAdmin}
                error={error}
                onSignIn={signIn}
            />
        );
    }

    return (
        <AdminLayout
            title="ENS Subnames"
            subtitle="Manage username.spritz.eth subname resolution"
            address={address}
            isSuperAdmin={isSuperAdmin}
            onSignOut={signOut}
        >
            <div className="space-y-6 max-w-3xl mx-auto">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                        <div className="text-2xl font-bold text-white">{stats.totalClaimed}</div>
                        <div className="text-sm text-zinc-400">Subnames Claimed</div>
                    </div>
                    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                        <div className="text-2xl font-bold text-white">{stats.eligibleCount}</div>
                        <div className="text-sm text-zinc-400">Eligible Users</div>
                    </div>
                </div>

                {/* Configuration */}
                <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 space-y-4">
                    <h2 className="text-lg font-semibold text-white">Configuration</h2>

                    {/* Enable toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-white text-sm font-medium">ENS Subnames Enabled</div>
                            <div className="text-zinc-500 text-xs">Users can claim and names resolve via gateway</div>
                        </div>
                        <button
                            onClick={() => setEditEnabled(!editEnabled)}
                            className={`relative w-12 h-6 rounded-full transition-colors ${editEnabled ? "bg-orange-500" : "bg-zinc-700"}`}
                        >
                            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${editEnabled ? "translate-x-6" : "translate-x-0.5"}`} />
                        </button>
                    </div>

                    {/* Parent name */}
                    <div>
                        <label className="text-sm text-zinc-400 block mb-1">Parent Name</label>
                        <input
                            value={editParent}
                            onChange={(e) => setEditParent(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm"
                            placeholder="spritz.eth"
                        />
                    </div>

                    {/* Gateway URL */}
                    <div>
                        <label className="text-sm text-zinc-400 block mb-1">Gateway URL</label>
                        <input
                            value={editGateway}
                            onChange={(e) => setEditGateway(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm font-mono"
                            placeholder="https://app.spritz.chat/api/ens/ccip-gateway"
                        />
                        <div className="text-xs text-zinc-500 mt-1">
                            This URL goes in the on-chain resolver&apos;s constructor. Point it at your deployed gateway.
                        </div>
                    </div>

                    {/* Resolver address */}
                    <div>
                        <label className="text-sm text-zinc-400 block mb-1">Resolver Contract (mainnet)</label>
                        <input
                            value={editResolver}
                            onChange={(e) => setEditResolver(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm font-mono"
                            placeholder="0x..."
                        />
                        <div className="text-xs text-zinc-500 mt-1">
                            After deploying the resolver, paste its address here for reference.
                        </div>
                    </div>

                    {/* TTL */}
                    <div>
                        <label className="text-sm text-zinc-400 block mb-1">TTL (seconds)</label>
                        <input
                            type="number"
                            value={editTtl}
                            onChange={(e) => setEditTtl(parseInt(e.target.value) || 300)}
                            className="w-32 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm"
                        />
                    </div>

                    {/* Save */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={saveConfig}
                            disabled={saving}
                            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
                        >
                            {saving ? "Saving..." : "Save Configuration"}
                        </button>
                        {saveMsg && <span className={`text-sm ${saveMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{saveMsg}</span>}
                    </div>
                </div>

                {/* Setup Checklist */}
                <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 space-y-3">
                    <h2 className="text-lg font-semibold text-white">Setup Checklist</h2>
                    <CheckItem done={!!config?.gateway_url} label="Gateway URL configured" />
                    <CheckItem done={editEnabled} label="Subnames enabled" />
                    <CheckItem done={!!config?.resolver_address} label="Resolver contract deployed and recorded" />
                    <CheckItem done={stats.totalClaimed > 0} label="At least one subname claimed" />
                    <div className="pt-2 text-xs text-zinc-500 space-y-1">
                        <div>1. Deploy the SpritzENSResolver contract on mainnet with the gateway URL</div>
                        <div>2. Set the resolver for spritz.eth in the ENS Manager to the deployed contract</div>
                        <div>3. Enable subnames above and paste the resolver address</div>
                        <div>4. Test resolution below</div>
                    </div>
                    <a
                        href="https://app.ens.domains/spritz.eth"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-orange-400 hover:text-orange-300 text-sm underline"
                    >
                        Open ENS Manager for spritz.eth
                    </a>
                </div>

                {/* Test Resolution */}
                <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 space-y-4">
                    <h2 className="text-lg font-semibold text-white">Test Resolution</h2>
                    <div className="flex gap-2">
                        <input
                            value={testName}
                            onChange={(e) => setTestName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && runTest()}
                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm"
                            placeholder="username or username.spritz.eth"
                        />
                        <button
                            onClick={runTest}
                            disabled={testing || !testName}
                            className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm"
                        >
                            {testing ? "..." : "Resolve"}
                        </button>
                    </div>
                    {testResult && (
                        <div className="bg-zinc-800 rounded-lg p-4 text-sm space-y-1">
                            <div className="text-zinc-400">
                                Name: <span className="text-white">{testResult.name}</span>
                            </div>
                            {testResult.found ? (
                                <>
                                    <div className="text-zinc-400">
                                        Username: <span className="text-white">{testResult.username}</span>
                                    </div>
                                    <div className="text-zinc-400">
                                        Claimed: <span className={testResult.claimed ? "text-green-400" : "text-yellow-400"}>{testResult.claimed ? "Yes" : "No"}</span>
                                    </div>
                                    <div className="text-zinc-400">
                                        Eligible: <span className={testResult.eligible ? "text-green-400" : "text-red-400"}>{testResult.eligible ? "Yes" : `No — ${testResult.reason}`}</span>
                                    </div>
                                    {testResult.resolveAddress && (
                                        <div className="text-zinc-400">
                                            Resolves to: <span className="text-white font-mono text-xs">{testResult.resolveAddress}</span>
                                        </div>
                                    )}
                                    <div className="text-zinc-400">
                                        Wallet type: <span className="text-white">{testResult.walletType}</span>
                                    </div>
                                </>
                            ) : (
                                <div className="text-yellow-400">User not found or no subname claimed</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Recent Claims */}
                {recentClaims.length > 0 && (
                    <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
                        <h2 className="text-lg font-semibold text-white mb-4">Recent Claims</h2>
                        <div className="space-y-2">
                            {recentClaims.map((c) => (
                                <div key={c.wallet_address} className="flex items-center justify-between bg-zinc-800 rounded-lg px-4 py-3">
                                    <div>
                                        <div className="text-white text-sm font-medium">{c.username}.{editParent || "spritz.eth"}</div>
                                        <div className="text-zinc-500 text-xs font-mono">{c.ens_resolve_address || c.wallet_address}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-zinc-400">{c.wallet_type}</div>
                                        <div className="text-xs text-zinc-500">
                                            {new Date(c.ens_subname_claimed_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}

function CheckItem({ done, label }: { done: boolean; label: string }) {
    return (
        <div className="flex items-center gap-2">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${done ? "bg-green-500/20 text-green-400" : "bg-zinc-700 text-zinc-500"}`}>
                {done ? "✓" : "○"}
            </div>
            <span className={`text-sm ${done ? "text-white" : "text-zinc-500"}`}>{label}</span>
        </div>
    );
}
