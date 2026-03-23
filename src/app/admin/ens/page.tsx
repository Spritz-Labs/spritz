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

type SetupMeta = {
    appOrigin: string;
    recommendedGatewayUrl: string;
    ensManagerUrl: string;
    docsUrl: string;
    contractPath: string;
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

function CopyButton({ text, label }: { text: string; label: string }) {
    const [done, setDone] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setDone(true);
            setTimeout(() => setDone(false), 2000);
        } catch {
            /* ignore */
        }
    };
    return (
        <button
            type="button"
            onClick={copy}
            className="shrink-0 px-2.5 py-1 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-medium"
        >
            {done ? "Copied" : label}
        </button>
    );
}

function gatewayHasCcipPlaceholders(url: string): boolean {
    return url.includes("{sender}") && url.includes("{data}");
}

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
    const [setupMeta, setSetupMeta] = useState<SetupMeta | null>(null);
    const [stats, setStats] = useState({ totalClaimed: 0, eligibleCount: 0 });
    const [recentClaims, setRecentClaims] = useState<RecentClaim[]>([]);
    const [loadingData, setLoadingData] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);

    const [testName, setTestName] = useState("");
    const [testResult, setTestResult] = useState<ResolveResult | null>(null);
    const [testing, setTesting] = useState(false);
    const [gatewayPing, setGatewayPing] = useState<"idle" | "loading" | "ok" | "fail">("idle");

    const [editEnabled, setEditEnabled] = useState(false);
    const [editGateway, setEditGateway] = useState("");
    const [editResolver, setEditResolver] = useState("");
    const [editParent, setEditParent] = useState("");
    const [editTtl, setEditTtl] = useState(300);
    const [showAdvanced, setShowAdvanced] = useState(false);

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
                if (data.setup) setSetupMeta(data.setup);
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

    const applyRecommendedGateway = () => {
        if (setupMeta?.recommendedGatewayUrl) {
            setEditGateway(setupMeta.recommendedGatewayUrl);
            setSaveMsg(null);
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

    const pingGateway = async () => {
        const base = setupMeta?.appOrigin || (typeof window !== "undefined" ? window.location.origin : "");
        if (!base) return;
        setGatewayPing("loading");
        try {
            const url = `${base}/api/ens/ccip-gateway?sender=0x0000000000000000000000000000000000000000&data=0x`;
            const res = await fetch(url, { method: "GET" });
            const json = await res.json().catch(() => ({}));
            setGatewayPing(res.ok && typeof (json as { data?: string }).data === "string" ? "ok" : "fail");
        } catch {
            setGatewayPing("fail");
        }
    };

    const deploySnippet = editGateway
        ? `[\n  "${editGateway.replace(/"/g, '\\"')}"\n]`
        : setupMeta?.recommendedGatewayUrl
          ? `[\n  "${setupMeta.recommendedGatewayUrl.replace(/"/g, '\\"')}"\n]`
          : '["https://YOUR_APP/api/ens/ccip-gateway?sender={sender}&data={data}"]';

    const gatewayOk = gatewayHasCcipPlaceholders(editGateway.trim());
    const step1Done = editEnabled && !!editGateway.trim() && gatewayOk;
    const step2Done = !!editResolver.trim();
    const step3Note = "Set in ENS Manager (wallet that controls the name)";

    if (isLoading) return <AdminLoading />;

    if (!isAuthenticated) {
        return (
            <AdminAuthWrapper title="ENS Subnames">
                {!isConnected ? (
                    <>
                        <p className="text-zinc-400 mb-6">Connect your wallet to manage ENS subnames.</p>
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
            title="ENS Subnames"
            subtitle="Connect spritz.eth to Spritz in a few steps"
            address={address}
            isSuperAdmin={isSuperAdmin}
            onSignOut={signOut}
        >
            <div className="space-y-6 max-w-3xl mx-auto px-4 pb-8">
                {loadingData && (
                    <p className="text-zinc-500 text-sm">Loading configuration…</p>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                        <div className="text-2xl font-bold text-white">{stats.totalClaimed}</div>
                        <div className="text-sm text-zinc-400">Subnames claimed</div>
                    </div>
                    <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                        <div className="text-2xl font-bold text-white">{stats.eligibleCount}</div>
                        <div className="text-sm text-zinc-400">Eligible profiles (sample)</div>
                    </div>
                </div>

                {/* Quick setup */}
                <div className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-5 space-y-4">
                    <h2 className="text-lg font-semibold text-white">Quick setup</h2>
                    <p className="text-sm text-zinc-400">
                        This app resolves <span className="text-white font-medium">*.{editParent || "spritz.eth"}</span> via{" "}
                        <a href={setupMeta?.docsUrl} target="_blank" rel="noopener noreferrer" className="text-orange-400 underline">
                            CCIP Read (EIP-3668)
                        </a>
                        . Your on-chain resolver only points wallets at this gateway; Spritz decides addresses after users claim a subname in Settings.
                    </p>

                    {/* Step 1 */}
                    <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-4 space-y-3">
                        <div className="flex items-start gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white text-sm font-bold">1</span>
                            <div className="flex-1 min-w-0 space-y-2">
                                <div className="text-white font-medium">Spritz: gateway + enable</div>
                                <p className="text-xs text-zinc-500">
                                    Use the recommended URL so ENS clients substitute <code className="text-zinc-400">{`{sender}`}</code> and{" "}
                                    <code className="text-zinc-400">{`{data}`}</code> correctly.
                                </p>
                                {setupMeta && (
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={applyRecommendedGateway}
                                            className="text-xs px-3 py-1.5 rounded-lg bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 font-medium"
                                        >
                                            Use recommended URL for this deployment
                                        </button>
                                        <CopyButton text={setupMeta.recommendedGatewayUrl} label="Copy recommended" />
                                    </div>
                                )}
                                <div className="flex gap-2 items-start">
                                    <input
                                        value={editGateway}
                                        onChange={(e) => setEditGateway(e.target.value)}
                                        className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-xs font-mono"
                                        placeholder="https://…/api/ens/ccip-gateway?sender={sender}&data={data}"
                                    />
                                    <CopyButton text={editGateway} label="Copy" />
                                </div>
                                {!gatewayOk && editGateway.trim().length > 0 && (
                                    <p className="text-xs text-amber-400">
                                        URL should include both <code>{`{sender}`}</code> and <code>{`{data}`}</code> for standard ENS CCIP clients.
                                    </p>
                                )}
                                <div className="flex items-center justify-between gap-4 pt-1">
                                    <div>
                                        <div className="text-white text-sm font-medium">Subnames enabled</div>
                                        <div className="text-zinc-500 text-xs">Required for claims + gateway responses</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setEditEnabled(!editEnabled)}
                                        className={`relative w-12 h-6 rounded-full shrink-0 transition-colors ${editEnabled ? "bg-orange-500" : "bg-zinc-700"}`}
                                    >
                                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${editEnabled ? "translate-x-6" : "translate-x-0.5"}`} />
                                    </button>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={saveConfig}
                                        disabled={saving}
                                        className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
                                    >
                                        {saving ? "Saving…" : "Save step 1"}
                                    </button>
                                    {saveMsg && (
                                        <span className={`text-sm ${saveMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{saveMsg}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <CheckRow done={step1Done} label="Gateway saved with CCIP placeholders + enabled" />
                    </div>

                    {/* Step 2 */}
                    <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-4 space-y-3">
                        <div className="flex items-start gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white text-sm font-bold">2</span>
                            <div className="flex-1 min-w-0 space-y-2">
                                <div className="text-white font-medium">Deploy resolver on Ethereum mainnet</div>
                                <p className="text-xs text-zinc-500">
                                    Contract: <code className="text-zinc-400">{setupMeta?.contractPath ?? "contracts/SpritzENSResolver.sol"}</code> in the Spritz repo.
                                    Constructor takes one argument: <code className="text-zinc-400">string[] gatewayUrls</code> — pass a single-element array with the same URL as above.
                                </p>
                                <pre className="text-[11px] leading-relaxed bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-300 overflow-x-auto whitespace-pre-wrap break-all">
                                    {deploySnippet}
                                </pre>
                                <div className="flex flex-wrap gap-2">
                                    <CopyButton text={deploySnippet} label="Copy constructor arg (JSON-like)" />
                                </div>
                                <p className="text-xs text-zinc-500">
                                    Deploy with Remix, Foundry, or Hardhat. Deployer becomes <code className="text-zinc-400">owner</code> and can update URLs via{" "}
                                    <code className="text-zinc-400">setGatewayUrls</code>.
                                </p>
                                <div>
                                    <label className="text-xs text-zinc-500 block mb-1">Deployed resolver address (for your records)</label>
                                    <div className="flex gap-2">
                                        <input
                                            value={editResolver}
                                            onChange={(e) => setEditResolver(e.target.value)}
                                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-xs font-mono"
                                            placeholder="0x…"
                                        />
                                        <CopyButton text={editResolver} label="Copy" />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={saveConfig}
                                        disabled={saving || !editResolver.trim()}
                                        className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-zinc-700 text-white hover:bg-zinc-600 disabled:opacity-40"
                                    >
                                        Save resolver address
                                    </button>
                                </div>
                            </div>
                        </div>
                        <CheckRow done={step2Done} label="Resolver address saved (after deploy)" />
                    </div>

                    {/* Step 3 */}
                    <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-4 space-y-3">
                        <div className="flex items-start gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white text-sm font-bold">3</span>
                            <div className="flex-1 min-w-0 space-y-2">
                                <div className="text-white font-medium">ENS: set resolver on the parent name</div>
                                <p className="text-xs text-zinc-500">{step3Note}</p>
                                <div className="flex flex-wrap gap-2">
                                    <a
                                        href={setupMeta?.ensManagerUrl || `https://app.ens.domains/${encodeURIComponent(editParent || "spritz.eth")}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-sm px-4 py-2 rounded-lg bg-zinc-800 text-orange-400 hover:bg-zinc-700 border border-zinc-700"
                                    >
                                        Open ENS Manager → {editParent || "spritz.eth"}
                                    </a>
                                </div>
                                <p className="text-xs text-zinc-500">
                                    In the ENS app, set <span className="text-zinc-300">Resolver</span> to your deployed <code className="text-zinc-400">SpritzENSResolver</code> address.
                                    No need to create each user subname on-chain.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Verify */}
                <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 space-y-4">
                    <h2 className="text-lg font-semibold text-white">Verify</h2>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={pingGateway}
                            disabled={gatewayPing === "loading"}
                            className="text-sm px-4 py-2 rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700"
                        >
                            {gatewayPing === "loading" ? "Pinging…" : "Ping CCIP gateway endpoint"}
                        </button>
                        {gatewayPing === "ok" && <span className="text-sm text-green-400 self-center">Gateway responded</span>}
                        {gatewayPing === "fail" && <span className="text-sm text-amber-400 self-center">No valid JSON — check URL or deployment</span>}
                    </div>
                    <div className="flex gap-2">
                        <input
                            value={testName}
                            onChange={(e) => setTestName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && runTest()}
                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm"
                            placeholder="username or username.spritz.eth"
                        />
                        <button
                            type="button"
                            onClick={runTest}
                            disabled={testing || !testName}
                            className="bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm"
                        >
                            {testing ? "…" : "Lookup in Spritz DB"}
                        </button>
                    </div>
                    <p className="text-xs text-zinc-500">
                        “Lookup” uses <code className="text-zinc-400">/api/ens/resolve</code> (database). Wallets use CCIP after step 3.
                    </p>
                    {testResult && (
                        <div className="bg-zinc-800 rounded-lg p-4 text-sm space-y-1">
                            <div className="text-zinc-400">
                                Name: <span className="text-white">{testResult.name}</span>
                            </div>
                            {testResult.found ? (
                                <>
                                    <div className="text-zinc-400">
                                        Claimed: <span className={testResult.claimed ? "text-green-400" : "text-yellow-400"}>{testResult.claimed ? "Yes" : "No"}</span>
                                    </div>
                                    <div className="text-zinc-400">
                                        Eligible: <span className={testResult.eligible ? "text-green-400" : "text-red-400"}>{testResult.eligible ? "Yes" : `No — ${testResult.reason}`}</span>
                                    </div>
                                    {testResult.resolveAddress && (
                                        <div className="text-zinc-400 break-all">
                                            Resolves to: <span className="text-white font-mono text-xs">{testResult.resolveAddress}</span>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-yellow-400">No user / not claimed yet</div>
                            )}
                        </div>
                    )}
                </div>

                {/* Advanced */}
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full flex items-center justify-between px-6 py-4 text-left text-white font-medium hover:bg-zinc-800/50"
                    >
                        Advanced
                        <span className="text-zinc-500 text-sm">{showAdvanced ? "Hide" : "Show"}</span>
                    </button>
                    {showAdvanced && (
                        <div className="px-6 pb-6 pt-0 space-y-4 border-t border-zinc-800">
                            <div>
                                <label className="text-sm text-zinc-400 block mb-1">Parent name</label>
                                <input
                                    value={editParent}
                                    onChange={(e) => setEditParent(e.target.value)}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-sm text-zinc-400 block mb-1">TTL (seconds)</label>
                                <input
                                    type="number"
                                    value={editTtl}
                                    onChange={(e) => setEditTtl(parseInt(e.target.value, 10) || 300)}
                                    className="w-32 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={saveConfig}
                                disabled={saving}
                                className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded-lg text-sm"
                            >
                                Save advanced
                            </button>
                        </div>
                    )}
                </div>

                {/* Recent Claims */}
                {recentClaims.length > 0 && (
                    <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
                        <h2 className="text-lg font-semibold text-white mb-4">Recent claims</h2>
                        <div className="space-y-2">
                            {recentClaims.map((c) => (
                                <div key={c.wallet_address} className="flex items-center justify-between bg-zinc-800 rounded-lg px-4 py-3">
                                    <div>
                                        <div className="text-white text-sm font-medium">{c.username}.{editParent || "spritz.eth"}</div>
                                        <div className="text-zinc-500 text-xs font-mono break-all">{c.ens_resolve_address || c.wallet_address}</div>
                                    </div>
                                    <div className="text-right text-xs text-zinc-400">{c.wallet_type}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}

function CheckRow({ done, label }: { done: boolean; label: string }) {
    return (
        <div className="flex items-center gap-2 pl-11 pt-1">
            <span className={`text-sm ${done ? "text-green-400" : "text-zinc-500"}`}>{done ? "✓" : "○"}</span>
            <span className={`text-sm ${done ? "text-zinc-300" : "text-zinc-500"}`}>{label}</span>
        </div>
    );
}
