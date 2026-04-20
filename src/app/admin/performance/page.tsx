"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { motion, AnimatePresence } from "motion/react";
import {
    AdminLayout,
    AdminAuthWrapper,
    AdminLoading,
} from "@/components/AdminLayout";

// -----------------------------------------------------------------------------
// Types (mirror /api/admin/health response)
// -----------------------------------------------------------------------------
type Status = "up" | "degraded" | "down" | "unknown" | "unconfigured";

type Probe = {
    id: string;
    name: string;
    category: string;
    status: Status;
    latencyMs: number | null;
    httpStatus: number | null;
    message: string;
    critical: boolean;
    docUrl?: string;
    probedUrl?: string;
    skipped?: boolean;
};

type TableProbe = {
    table: string;
    status: Status;
    latencyMs: number | null;
    rows: number | null;
    error: string | null;
};

type Runtime = {
    node: string;
    region: string;
    env: string;
    commit: string | null;
    commitShort: string | null;
    branch: string | null;
    deployedAt: string | null;
    uptimeSec: number;
    memoryMb: number | null;
};

type PoolProbe = {
    status: Status;
    latencyMs: number | null;
    successRate: number;
    p95Ms: number | null;
    maxMs: number | null;
    poolExhausted: boolean;
    errors: string[];
};

type HealthResponse = {
    generatedAt: string;
    totalProbeDurationMs: number;
    overall: Status;
    summary: {
        up: number;
        degraded: number;
        down: number;
        unknown: number;
        unconfigured: number;
        total: number;
        criticalDown: boolean;
        latency: { p50: number | null; p95: number | null; max: number | null };
    };
    runtime: Runtime;
    probes: Probe[];
    tables: TableProbe[];
    pool: PoolProbe | null;
};

// -----------------------------------------------------------------------------
// Client-side self-checks (browser APIs)
// -----------------------------------------------------------------------------
type ClientCheck = {
    id: string;
    name: string;
    status: Status;
    detail: string;
};

async function runClientChecks(): Promise<ClientCheck[]> {
    const results: ClientCheck[] = [];

    // Service worker
    if ("serviceWorker" in navigator) {
        try {
            const regs = await navigator.serviceWorker.getRegistrations();
            const active = regs.find((r) => r.active);
            results.push({
                id: "sw",
                name: "Service Worker",
                status: active ? "up" : regs.length > 0 ? "degraded" : "down",
                detail: active
                    ? `active — ${active.scope}`
                    : regs.length > 0
                      ? `${regs.length} registration(s), none active`
                      : "not registered",
            });
        } catch (e) {
            results.push({
                id: "sw",
                name: "Service Worker",
                status: "down",
                detail: (e as Error).message,
            });
        }
    } else {
        results.push({
            id: "sw",
            name: "Service Worker",
            status: "unconfigured",
            detail: "not supported",
        });
    }

    // Push subscription
    try {
        const reg = await navigator.serviceWorker?.getRegistration();
        const sub = await reg?.pushManager?.getSubscription?.();
        results.push({
            id: "push",
            name: "Push Subscription",
            status: sub ? "up" : "unconfigured",
            detail: sub ? "subscribed" : "not subscribed",
        });
    } catch {
        results.push({
            id: "push",
            name: "Push Subscription",
            status: "unknown",
            detail: "unavailable",
        });
    }

    // Notification permission
    if ("Notification" in window) {
        results.push({
            id: "notif-perm",
            name: "Notifications Permission",
            status:
                Notification.permission === "granted"
                    ? "up"
                    : Notification.permission === "denied"
                      ? "down"
                      : "unconfigured",
            detail: Notification.permission,
        });
    }

    // Online
    results.push({
        id: "online",
        name: "Network Online",
        status: navigator.onLine ? "up" : "down",
        detail: navigator.onLine ? "connected" : "offline",
    });

    // localStorage
    try {
        const k = `__health_${Date.now()}`;
        localStorage.setItem(k, "1");
        localStorage.removeItem(k);
        results.push({
            id: "ls",
            name: "localStorage",
            status: "up",
            detail: "read/write ok",
        });
    } catch (e) {
        results.push({
            id: "ls",
            name: "localStorage",
            status: "down",
            detail: (e as Error).message,
        });
    }

    // IndexedDB
    if ("indexedDB" in window) {
        results.push({
            id: "idb",
            name: "IndexedDB",
            status: "up",
            detail: "available",
        });
    } else {
        results.push({
            id: "idb",
            name: "IndexedDB",
            status: "down",
            detail: "not supported",
        });
    }

    // Storage quota
    if (navigator.storage?.estimate) {
        try {
            const est = await navigator.storage.estimate();
            const usageMb = Math.round((est.usage ?? 0) / 1024 / 1024);
            const quotaMb = Math.round((est.quota ?? 0) / 1024 / 1024);
            const pct = est.quota ? ((est.usage ?? 0) / est.quota) * 100 : 0;
            results.push({
                id: "quota",
                name: "Storage Quota",
                status: pct > 85 ? "degraded" : "up",
                detail: `${usageMb} MB used / ${quotaMb} MB (${pct.toFixed(1)}%)`,
            });
        } catch {
            results.push({
                id: "quota",
                name: "Storage Quota",
                status: "unknown",
                detail: "estimate failed",
            });
        }
    }

    // Connection info
    // deno-lint-ignore no-explicit-any
    const conn = (navigator as unknown as {
        connection?: {
            effectiveType?: string;
            downlink?: number;
            rtt?: number;
            saveData?: boolean;
        };
    }).connection;
    if (conn) {
        const down = conn.effectiveType === "slow-2g" || conn.effectiveType === "2g";
        results.push({
            id: "conn",
            name: "Network Quality",
            status: down ? "degraded" : "up",
            detail: `${conn.effectiveType ?? "unknown"}, ${conn.downlink ?? "?"} Mbps, rtt ${conn.rtt ?? "?"} ms`,
        });
    }

    // WebRTC support
    results.push({
        id: "webrtc",
        name: "WebRTC",
        status:
            typeof RTCPeerConnection !== "undefined" ? "up" : "unconfigured",
        detail:
            typeof RTCPeerConnection !== "undefined" ? "supported" : "missing",
    });

    // getUserMedia (camera/mic) — do not prompt, just feature-detect
    const gumAvailable =
        typeof navigator !== "undefined" &&
        "mediaDevices" in navigator &&
        typeof navigator.mediaDevices?.getUserMedia === "function";
    results.push({
        id: "gum",
        name: "Camera/Mic API",
        status: gumAvailable ? "up" : "down",
        detail: gumAvailable
            ? "available (permission not requested)"
            : "unavailable",
    });

    // Performance Memory (Chromium only)
    // deno-lint-ignore no-explicit-any
    const perf = performance as unknown as {
        memory?: {
            usedJSHeapSize: number;
            totalJSHeapSize: number;
            jsHeapSizeLimit: number;
        };
    };
    if (perf.memory) {
        const usedMb = Math.round(perf.memory.usedJSHeapSize / 1024 / 1024);
        const limitMb = Math.round(perf.memory.jsHeapSizeLimit / 1024 / 1024);
        const pct = (perf.memory.usedJSHeapSize / perf.memory.jsHeapSizeLimit) * 100;
        results.push({
            id: "js-heap",
            name: "JS Heap",
            status: pct > 85 ? "degraded" : "up",
            detail: `${usedMb} MB used / ${limitMb} MB (${pct.toFixed(1)}%)`,
        });
    }

    return results;
}

// -----------------------------------------------------------------------------
// Status styling helpers
// -----------------------------------------------------------------------------
const STATUS_COLOR: Record<
    Status,
    { dot: string; text: string; bg: string; border: string; label: string }
> = {
    up: {
        dot: "bg-emerald-500",
        text: "text-emerald-400",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/30",
        label: "Operational",
    },
    degraded: {
        dot: "bg-amber-500",
        text: "text-amber-400",
        bg: "bg-amber-500/10",
        border: "border-amber-500/30",
        label: "Degraded",
    },
    down: {
        dot: "bg-red-500",
        text: "text-red-400",
        bg: "bg-red-500/10",
        border: "border-red-500/30",
        label: "Down",
    },
    unknown: {
        dot: "bg-zinc-500",
        text: "text-zinc-400",
        bg: "bg-zinc-500/10",
        border: "border-zinc-700",
        label: "Unknown",
    },
    unconfigured: {
        dot: "bg-zinc-600",
        text: "text-zinc-500",
        bg: "bg-zinc-800/40",
        border: "border-zinc-800",
        label: "Not configured",
    },
};

const OVERALL_BANNER: Record<Status, { bg: string; text: string; title: string; icon: string }> = {
    up: {
        bg: "from-emerald-500/20 via-emerald-600/10 to-transparent border-emerald-500/30",
        text: "text-emerald-400",
        title: "All Systems Operational",
        icon: "✓",
    },
    degraded: {
        bg: "from-amber-500/20 via-amber-600/10 to-transparent border-amber-500/40",
        text: "text-amber-400",
        title: "Partial Service Disruption",
        icon: "⚠",
    },
    down: {
        bg: "from-red-500/25 via-red-600/10 to-transparent border-red-500/50",
        text: "text-red-400",
        title: "Major Outage — Critical Service Down",
        icon: "✕",
    },
    unknown: {
        bg: "from-zinc-500/10 to-transparent border-zinc-700",
        text: "text-zinc-400",
        title: "Status Unknown",
        icon: "?",
    },
    unconfigured: {
        bg: "from-zinc-500/10 to-transparent border-zinc-700",
        text: "text-zinc-400",
        title: "No Services Configured",
        icon: "—",
    },
};

function formatLatency(ms: number | null): string {
    if (ms === null) return "—";
    if (ms < 1) return "<1ms";
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${ms}ms`;
}

function timeAgo(iso: string): string {
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 5) return "just now";
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
}

// -----------------------------------------------------------------------------
// Sparkline (SVG, no deps)
// -----------------------------------------------------------------------------
function Sparkline({
    data,
    width = 120,
    height = 32,
    color = "#52525b",
    thresholdMs = 1500,
}: {
    data: (number | null)[];
    width?: number;
    height?: number;
    color?: string;
    thresholdMs?: number;
}) {
    const clean = data.map((d) => (d === null ? 0 : d));
    if (clean.length === 0) {
        return (
            <div
                style={{ width, height }}
                className="flex items-center justify-center text-zinc-700 text-[10px]"
            >
                no data
            </div>
        );
    }
    const max = Math.max(...clean, thresholdMs);
    const step = clean.length > 1 ? width / (clean.length - 1) : width;
    const points = clean
        .map((v, i) => {
            const x = i * step;
            const y = height - (v / max) * (height - 2) - 1;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");

    const thresholdY = height - (thresholdMs / max) * (height - 2) - 1;

    return (
        <svg width={width} height={height} className="overflow-visible">
            <line
                x1={0}
                x2={width}
                y1={thresholdY}
                y2={thresholdY}
                stroke="currentColor"
                className="text-amber-500/30"
                strokeDasharray="2 2"
            />
            <polyline
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points}
            />
            {clean.length > 0 && (
                <circle
                    cx={(clean.length - 1) * step}
                    cy={height - (clean[clean.length - 1] / max) * (height - 2) - 1}
                    r={2.5}
                    fill={color}
                />
            )}
        </svg>
    );
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------
const HISTORY_DEPTH = 30; // number of samples to keep per service
const POLL_INTERVAL_MS = 15_000;

export default function PerformancePage() {
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
        isSuperAdmin,
        getAuthHeaders,
    } = useAdmin();

    const [health, setHealth] = useState<HealthResponse | null>(null);
    const [clientChecks, setClientChecks] = useState<ClientCheck[]>([]);
    const [isFetching, setIsFetching] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
        new Set(),
    );
    const historyRef = useRef<Record<string, (number | null)[]>>({});
    const intervalRef = useRef<number | null>(null);
    const lastFetchDurationRef = useRef<number>(0);
    const [, forceTick] = useState(0);

    // Keep relative timestamps live.
    useEffect(() => {
        const id = window.setInterval(() => forceTick((t) => t + 1), 1000);
        return () => window.clearInterval(id);
    }, []);

    const fetchHealth = useCallback(async () => {
        const headers = getAuthHeaders();
        if (!headers) return;
        setIsFetching(true);
        setFetchError(null);
        const start = performance.now();
        try {
            const res = await fetch("/api/admin/health", { headers });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const data: HealthResponse = await res.json();
            setHealth(data);
            lastFetchDurationRef.current = Math.round(
                performance.now() - start,
            );

            // Update rolling history per probe.
            for (const p of data.probes) {
                const existing = historyRef.current[p.id] ?? [];
                existing.push(p.latencyMs);
                if (existing.length > HISTORY_DEPTH) existing.shift();
                historyRef.current[p.id] = existing;
            }
        } catch (e) {
            setFetchError((e as Error).message);
        } finally {
            setIsFetching(false);
        }
    }, [getAuthHeaders]);

    const refreshClientChecks = useCallback(async () => {
        const checks = await runClientChecks();
        setClientChecks(checks);
    }, []);

    // Initial + polling
    useEffect(() => {
        if (!isReady) return;
        fetchHealth();
        refreshClientChecks();
    }, [isReady, fetchHealth, refreshClientChecks]);

    useEffect(() => {
        if (!isReady || !autoRefresh) {
            if (intervalRef.current) window.clearInterval(intervalRef.current);
            return;
        }
        intervalRef.current = window.setInterval(() => {
            fetchHealth();
            refreshClientChecks();
        }, POLL_INTERVAL_MS);
        return () => {
            if (intervalRef.current) window.clearInterval(intervalRef.current);
        };
    }, [isReady, autoRefresh, fetchHealth, refreshClientChecks]);

    const formatAddress = (addr: string) =>
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    const grouped = useMemo(() => {
        if (!health) return [] as [string, Probe[]][];
        const map = new Map<string, Probe[]>();
        for (const p of health.probes) {
            const arr = map.get(p.category) ?? [];
            arr.push(p);
            map.set(p.category, arr);
        }
        // Stable category order
        const order = [
            "Database",
            "Infrastructure",
            "Blockchain",
            "AI",
            "Media",
            "Communications",
            "Integrations",
            "Payments",
        ];
        return Array.from(map.entries()).sort(
            ([a], [b]) =>
                (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) -
                (order.indexOf(b) === -1 ? 99 : order.indexOf(b)),
        );
    }, [health]);

    const toggleCategory = (cat: string) => {
        setExpandedCategories((prev) => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    // --------- Auth gates ---------
    if (isLoading) return <AdminLoading />;
    if (!isAuthenticated) {
        return (
            <AdminAuthWrapper>
                {!isConnected ? (
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
    if (!isAdmin) {
        return (
            <AdminAuthWrapper title="Access Denied">
                <p className="text-zinc-400 mb-6">
                    Your wallet ({formatAddress(address || "")}) is not
                    authorized as an admin.
                </p>
            </AdminAuthWrapper>
        );
    }

    // --------- Dashboard ---------
    const banner = health ? OVERALL_BANNER[health.overall] : OVERALL_BANNER.unknown;

    return (
        <AdminLayout
            title="Performance & Uptime"
            subtitle="Service availability • Real-time health probes"
            address={address || undefined}
            isSuperAdmin={isSuperAdmin}
            onSignOut={signOut}
        >
            <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6 space-y-6">
                {/* Overall banner */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-2xl border bg-gradient-to-br ${banner.bg} p-5 sm:p-6`}
                >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div
                                className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold bg-zinc-950/40 ${banner.text}`}
                            >
                                {banner.icon}
                            </div>
                            <div>
                                <h2 className={`text-xl sm:text-2xl font-bold ${banner.text}`}>
                                    {banner.title}
                                </h2>
                                <p className="text-zinc-400 text-sm mt-0.5">
                                    {health
                                        ? `Last checked ${timeAgo(health.generatedAt)} · ${health.probes.filter((p) => !p.skipped).length} services probed in ${health.totalProbeDurationMs}ms`
                                        : "Fetching…"}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={autoRefresh}
                                    onChange={(e) => setAutoRefresh(e.target.checked)}
                                    className="accent-[#FF5500]"
                                />
                                Auto-refresh ({POLL_INTERVAL_MS / 1000}s)
                            </label>
                            <button
                                onClick={() => {
                                    fetchHealth();
                                    refreshClientChecks();
                                }}
                                disabled={isFetching}
                                className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 rounded-lg transition-colors"
                            >
                                {isFetching ? "Probing…" : "Probe now"}
                            </button>
                        </div>
                    </div>
                </motion.div>

                {fetchError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
                        Failed to fetch health: {fetchError}
                    </div>
                )}

                {!health ? (
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-zinc-500">
                        Running first probe…
                    </div>
                ) : (
                    <>
                        {/* KPI row */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            <KPI
                                label="Operational"
                                value={health.summary.up}
                                total={health.summary.total - health.summary.unconfigured}
                                tone="up"
                            />
                            <KPI
                                label="Degraded"
                                value={health.summary.degraded}
                                total={health.summary.total - health.summary.unconfigured}
                                tone="degraded"
                            />
                            <KPI
                                label="Down"
                                value={health.summary.down}
                                total={health.summary.total - health.summary.unconfigured}
                                tone="down"
                            />
                            <KPI
                                label="Not configured"
                                value={health.summary.unconfigured}
                                total={health.summary.total}
                                tone="unconfigured"
                            />
                            <KPI
                                label="p50 latency"
                                value={formatLatency(health.summary.latency.p50)}
                            />
                            <KPI
                                label="p95 latency"
                                value={formatLatency(health.summary.latency.p95)}
                            />
                        </div>

                        {/* Runtime */}
                        <RuntimeCard runtime={health.runtime} />

                        {/* Grouped services */}
                        <div className="space-y-4">
                            {grouped.map(([category, probes]) => {
                                const catStats = probes.reduce(
                                    (acc, p) => {
                                        acc[p.status] = (acc[p.status] ?? 0) + 1;
                                        return acc;
                                    },
                                    {} as Record<Status, number>,
                                );
                                const collapsed = expandedCategories.has(category);
                                return (
                                    <div
                                        key={category}
                                        className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden"
                                    >
                                        <button
                                            onClick={() => toggleCategory(category)}
                                            className="w-full flex items-center justify-between px-5 py-3 border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-base font-semibold">
                                                    {category}
                                                </h3>
                                                <span className="text-xs text-zinc-500">
                                                    {probes.length} service
                                                    {probes.length === 1 ? "" : "s"}
                                                </span>
                                                <div className="flex items-center gap-1.5 text-xs">
                                                    {(
                                                        [
                                                            "up",
                                                            "degraded",
                                                            "down",
                                                            "unconfigured",
                                                        ] as Status[]
                                                    ).map((s) =>
                                                        catStats[s] ? (
                                                            <span
                                                                key={s}
                                                                className={`flex items-center gap-1 ${STATUS_COLOR[s].text}`}
                                                            >
                                                                <span
                                                                    className={`w-1.5 h-1.5 rounded-full ${STATUS_COLOR[s].dot}`}
                                                                />
                                                                {catStats[s]}
                                                            </span>
                                                        ) : null,
                                                    )}
                                                </div>
                                            </div>
                                            <span className="text-zinc-500 text-xs">
                                                {collapsed ? "▸ expand" : "▾ collapse"}
                                            </span>
                                        </button>
                                        <AnimatePresence initial={false}>
                                            {!collapsed && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: "auto", opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="divide-y divide-zinc-800 overflow-hidden"
                                                >
                                                    {probes.map((p) => (
                                                        <ProbeRow
                                                            key={p.id}
                                                            probe={p}
                                                            history={
                                                                historyRef.current[p.id] ?? []
                                                            }
                                                        />
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Supabase connection pool health */}
                        {health.pool && (
                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                                <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-base font-semibold">
                                            Supabase Connection Pool
                                        </h3>
                                        <StatusPill status={health.pool.status} />
                                        {health.pool.poolExhausted && (
                                            <span className="text-[11px] px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30 uppercase tracking-wide">
                                                Pool Exhausted
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-xs text-zinc-500">
                                        Burst of 6 concurrent reads
                                    </span>
                                </div>
                                <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                                    <div>
                                        <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                                            Success
                                        </div>
                                        <div className="mt-1 font-semibold tabular-nums">
                                            {Math.round(health.pool.successRate * 100)}%
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                                            p95 Latency
                                        </div>
                                        <div className="mt-1 font-semibold tabular-nums">
                                            {health.pool.p95Ms === null
                                                ? "—"
                                                : `${health.pool.p95Ms} ms`}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                                            Max Latency
                                        </div>
                                        <div className="mt-1 font-semibold tabular-nums">
                                            {health.pool.maxMs === null
                                                ? "—"
                                                : `${health.pool.maxMs} ms`}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                                            Errors
                                        </div>
                                        <div
                                            className="mt-1 text-xs text-zinc-400 truncate"
                                            title={health.pool.errors.join("\n")}
                                        >
                                            {health.pool.errors.length === 0
                                                ? "none"
                                                : health.pool.errors[0]}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Supabase tables */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                            <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
                                <h3 className="text-base font-semibold">
                                    Supabase Critical Tables
                                </h3>
                                <span className="text-xs text-zinc-500">
                                    {health.tables.length} tables
                                </span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-zinc-800/30 text-zinc-500">
                                        <tr>
                                            <th className="text-left px-5 py-2 font-normal">
                                                Table
                                            </th>
                                            <th className="text-left px-5 py-2 font-normal">
                                                Status
                                            </th>
                                            <th className="text-right px-5 py-2 font-normal">
                                                Rows
                                            </th>
                                            <th className="text-right px-5 py-2 font-normal">
                                                Latency
                                            </th>
                                            <th className="text-left px-5 py-2 font-normal">
                                                Error
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800/70">
                                        {health.tables.map((t) => (
                                            <tr key={t.table} className="hover:bg-zinc-800/20">
                                                <td className="px-5 py-2 font-mono text-zinc-300">
                                                    {t.table}
                                                </td>
                                                <td className="px-5 py-2">
                                                    <StatusPill status={t.status} />
                                                </td>
                                                <td className="px-5 py-2 text-right tabular-nums text-zinc-400">
                                                    {t.rows === null
                                                        ? "—"
                                                        : t.rows.toLocaleString()}
                                                </td>
                                                <td className="px-5 py-2 text-right tabular-nums text-zinc-400">
                                                    {formatLatency(t.latencyMs)}
                                                </td>
                                                <td className="px-5 py-2 text-xs text-red-400 font-mono truncate max-w-[220px]">
                                                    {t.error || ""}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Client checks */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                            <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
                                <h3 className="text-base font-semibold">
                                    Browser / Client Checks
                                </h3>
                                <span className="text-xs text-zinc-500">
                                    this session
                                </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/70">
                                {clientChecks.map((c) => (
                                    <div
                                        key={c.id}
                                        className="p-4 flex items-start gap-3"
                                    >
                                        <span
                                            className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${STATUS_COLOR[c.status].dot}`}
                                        />
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium">
                                                {c.name}
                                            </div>
                                            <div className="text-xs text-zinc-500 break-words">
                                                {c.detail}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                <div className="text-center text-xs text-zinc-600 pb-4">
                    Client fetch: {lastFetchDurationRef.current}ms · Built-in
                    probes only — see the Monitoring Recap for production
                    extensions.
                </div>
            </div>
        </AdminLayout>
    );
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------
function KPI({
    label,
    value,
    total,
    tone,
}: {
    label: string;
    value: number | string;
    total?: number;
    tone?: Status;
}) {
    const color = tone ? STATUS_COLOR[tone] : STATUS_COLOR.unknown;
    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
                {label}
            </div>
            <div className="flex items-baseline gap-2">
                <div
                    className={`text-xl font-bold tabular-nums ${tone ? color.text : "text-white"}`}
                >
                    {value}
                </div>
                {total !== undefined && (
                    <div className="text-xs text-zinc-600">/ {total}</div>
                )}
            </div>
        </div>
    );
}

function RuntimeCard({ runtime }: { runtime: Runtime }) {
    const items: { label: string; value: string }[] = [
        { label: "Environment", value: runtime.env },
        { label: "Region", value: runtime.region },
        { label: "Node", value: runtime.node },
        {
            label: "Commit",
            value: runtime.commitShort
                ? `${runtime.commitShort}${runtime.branch ? ` (${runtime.branch})` : ""}`
                : "—",
        },
        {
            label: "Uptime",
            value:
                runtime.uptimeSec > 0
                    ? formatUptime(runtime.uptimeSec)
                    : "—",
        },
        {
            label: "Heap",
            value: runtime.memoryMb ? `${runtime.memoryMb} MB` : "—",
        },
    ];
    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500 mb-3">
                Server Runtime
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {items.map((it) => (
                    <div key={it.label}>
                        <div className="text-[10px] uppercase tracking-wide text-zinc-600 mb-0.5">
                            {it.label}
                        </div>
                        <div className="text-sm font-mono text-zinc-200 break-all">
                            {it.value}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function formatUptime(sec: number): string {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
    if (sec < 86400) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        return `${h}h ${m}m`;
    }
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    return `${d}d ${h}h`;
}

function StatusPill({ status }: { status: Status }) {
    const s = STATUS_COLOR[status];
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text} border ${s.border}`}
        >
            <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
            {s.label}
        </span>
    );
}

function ProbeRow({
    probe,
    history,
}: {
    probe: Probe;
    history: (number | null)[];
}) {
    const color = STATUS_COLOR[probe.status];
    const sparkColor =
        probe.status === "down"
            ? "#f87171"
            : probe.status === "degraded"
              ? "#fbbf24"
              : probe.status === "up"
                ? "#34d399"
                : "#52525b";

    return (
        <div className="px-5 py-3 hover:bg-zinc-800/20">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                {/* name + status */}
                <div className="flex items-center gap-3 min-w-0 sm:w-64 shrink-0">
                    <span
                        className={`w-2.5 h-2.5 rounded-full ${color.dot} shrink-0`}
                        title={color.label}
                    />
                    <div className="min-w-0">
                        <div className="text-sm font-medium truncate flex items-center gap-2">
                            {probe.name}
                            {probe.critical && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-red-500/15 text-red-400 rounded uppercase font-semibold">
                                    critical
                                </span>
                            )}
                        </div>
                        <div className="text-xs text-zinc-500 truncate">
                            {probe.probedUrl
                                ? new URL(probe.probedUrl).host
                                : probe.category}
                        </div>
                    </div>
                </div>

                {/* status pill */}
                <div className="sm:w-32 shrink-0">
                    <StatusPill status={probe.status} />
                </div>

                {/* latency + http */}
                <div className="sm:w-28 shrink-0 flex gap-4 sm:gap-0 sm:flex-col">
                    <div>
                        <div className="text-[10px] uppercase text-zinc-600">
                            Latency
                        </div>
                        <div className="text-sm font-mono tabular-nums">
                            {formatLatency(probe.latencyMs)}
                        </div>
                    </div>
                    <div>
                        <div className="text-[10px] uppercase text-zinc-600">
                            HTTP
                        </div>
                        <div className="text-sm font-mono tabular-nums text-zinc-400">
                            {probe.httpStatus ?? "—"}
                        </div>
                    </div>
                </div>

                {/* sparkline */}
                <div className="hidden md:block shrink-0 text-zinc-600">
                    <Sparkline data={history} color={sparkColor} />
                </div>

                {/* message */}
                <div className="flex-1 min-w-0">
                    <div
                        className={`text-xs font-mono break-words ${
                            probe.status === "down"
                                ? "text-red-400"
                                : probe.status === "degraded"
                                  ? "text-amber-400"
                                  : "text-zinc-500"
                        }`}
                    >
                        {probe.message}
                    </div>
                </div>
            </div>
        </div>
    );
}
