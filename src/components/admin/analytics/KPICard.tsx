"use client";

import { cn } from "@/lib/utils";
import {
    AreaChart,
    Area,
    ResponsiveContainer,
    Tooltip,
} from "recharts";

// ============= Trend helpers =============

function formatPercent(value: number): string {
    if (!isFinite(value)) return "N/A";
    const abs = Math.abs(value);
    return abs >= 100 ? `${Math.round(abs)}%` : `${abs.toFixed(1)}%`;
}

function calcChange(current: number, previous: number): number | null {
    if (previous === 0 && current === 0) return null;
    if (previous === 0) return 100;
    return ((current - previous) / previous) * 100;
}

// ============= TrendBadge =============

export function TrendBadge({
    current,
    previous,
    label,
    invertColor = false,
}: {
    current: number;
    previous: number;
    label?: string;
    invertColor?: boolean;
}) {
    const change = calcChange(current, previous);
    if (change === null) return null;

    const isPositive = change > 0;
    const isGood = invertColor ? !isPositive : isPositive;

    return (
        <span
            className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                isGood ? "text-emerald-400" : change === 0 ? "text-zinc-500" : "text-red-400",
            )}
        >
            {change > 0 ? (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
            ) : change < 0 ? (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            ) : null}
            {formatPercent(change)}
            {label && <span className="text-zinc-500 ml-0.5">{label}</span>}
        </span>
    );
}

// ============= Sparkline =============

export function Sparkline({
    data,
    dataKey = "value",
    color = "#FF5500",
    height = 32,
    className,
}: {
    data: Record<string, unknown>[];
    dataKey?: string;
    color?: string;
    height?: number;
    className?: string;
}) {
    if (!data || data.length === 0) return null;

    return (
        <div className={cn("w-full", className)} style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="100%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Tooltip
                        contentStyle={{
                            backgroundColor: "#18181b",
                            border: "1px solid #333",
                            borderRadius: "8px",
                            fontSize: "12px",
                        }}
                        labelFormatter={(label) => String(label)}
                        formatter={(value) => [typeof value === "number" ? value.toLocaleString() : String(value ?? ""), ""]}
                    />
                    <Area
                        type="monotone"
                        dataKey={dataKey}
                        stroke={color}
                        strokeWidth={1.5}
                        fill={`url(#spark-${color.replace("#", "")})`}
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}

// ============= KPICard =============

export type KPICardProps = {
    label: string;
    value: number | string;
    icon: string;
    subtext?: string;
    current?: number;
    previous?: number;
    trendLabel?: string;
    invertTrend?: boolean;
    sparklineData?: Record<string, unknown>[];
    sparklineKey?: string;
    sparklineColor?: string;
    onClick?: () => void;
    className?: string;
    size?: "default" | "large";
};

export function KPICard({
    label,
    value,
    icon,
    subtext,
    current,
    previous,
    trendLabel,
    invertTrend = false,
    sparklineData,
    sparklineKey,
    sparklineColor,
    onClick,
    className,
    size = "default",
}: KPICardProps) {
    const isLarge = size === "large";

    return (
        <div
            className={cn(
                "bg-zinc-900/50 rounded-xl border border-zinc-800 transition-all",
                isLarge ? "p-5" : "p-4",
                onClick && "cursor-pointer hover:border-zinc-700 hover:bg-zinc-900/70",
                className,
            )}
            onClick={onClick}
        >
            <div className="flex items-center gap-2 mb-1">
                <span className={isLarge ? "text-xl" : "text-lg"}>{icon}</span>
                <span className="text-xs text-zinc-400 uppercase tracking-wider">{label}</span>
            </div>

            <div className="flex items-end justify-between gap-2">
                <div>
                    <p className={cn("font-bold", isLarge ? "text-3xl" : "text-2xl")}>
                        {typeof value === "number" ? value.toLocaleString() : value}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                        {current !== undefined && previous !== undefined && (
                            <TrendBadge
                                current={current}
                                previous={previous}
                                label={trendLabel}
                                invertColor={invertTrend}
                            />
                        )}
                        {subtext && (
                            <span className="text-xs text-zinc-500">{subtext}</span>
                        )}
                    </div>
                </div>

                {sparklineData && sparklineData.length > 0 && (
                    <div className="w-24 flex-shrink-0">
                        <Sparkline
                            data={sparklineData}
                            dataKey={sparklineKey}
                            color={sparklineColor || "#FF5500"}
                            height={isLarge ? 40 : 32}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

// ============= KPI Section Header =============

export function SectionHeader({
    title,
    description,
    action,
}: {
    title: string;
    description?: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between mb-4">
            <div>
                <h2 className="text-lg font-semibold text-white">{title}</h2>
                {description && (
                    <p className="text-sm text-zinc-500 mt-0.5">{description}</p>
                )}
            </div>
            {action}
        </div>
    );
}

// ============= Chart Card =============

export function ChartCard({
    title,
    description,
    children,
    className,
    action,
}: {
    title: string;
    description?: string;
    children: React.ReactNode;
    className?: string;
    action?: React.ReactNode;
}) {
    return (
        <div
            className={cn(
                "bg-zinc-900/50 rounded-xl p-4 border border-zinc-800",
                className,
            )}
        >
            <div className="flex items-center justify-between mb-3">
                <div>
                    <h3 className="text-sm font-semibold text-zinc-400">{title}</h3>
                    {description && (
                        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
                    )}
                </div>
                {action}
            </div>
            {children}
        </div>
    );
}

// ============= Loading Skeleton =============

export function AnalyticsSkeleton({ rows = 3 }: { rows?: number }) {
    return (
        <div className="space-y-6 animate-pulse">
            {/* KPI cards skeleton */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 rounded bg-zinc-800" />
                            <div className="h-3 w-16 rounded bg-zinc-800" />
                        </div>
                        <div className="h-7 w-20 rounded bg-zinc-800 mb-2" />
                        <div className="h-3 w-12 rounded bg-zinc-800" />
                    </div>
                ))}
            </div>
            {/* Chart skeletons */}
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                    <div className="h-4 w-32 rounded bg-zinc-800 mb-4" />
                    <div className="h-48 rounded bg-zinc-800/50" />
                </div>
            ))}
        </div>
    );
}

// ============= Empty State =============

export function EmptyState({
    icon = "📊",
    title = "No data yet",
    description = "Data will appear here once there is activity.",
}: {
    icon?: string;
    title?: string;
    description?: string;
}) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-4xl mb-3">{icon}</span>
            <h3 className="text-lg font-semibold text-zinc-300 mb-1">{title}</h3>
            <p className="text-sm text-zinc-500 max-w-sm">{description}</p>
        </div>
    );
}

// ============= Funnel Chart =============

export function FunnelChart({
    steps,
    className,
}: {
    steps: { label: string; value: number; color: string }[];
    className?: string;
}) {
    if (!steps || steps.length === 0) return null;
    const maxValue = steps[0]?.value || 1;

    return (
        <div className={cn("space-y-2", className)}>
            {steps.map((step, i) => {
                const pct = maxValue > 0 ? (step.value / maxValue) * 100 : 0;
                const convRate =
                    i > 0 && steps[i - 1].value > 0
                        ? ((step.value / steps[i - 1].value) * 100).toFixed(1)
                        : null;

                return (
                    <div key={step.label} className="flex items-center gap-3">
                        <div className="w-32 text-right">
                            <p className="text-sm text-zinc-300 font-medium">{step.label}</p>
                            {convRate && (
                                <p className="text-xs text-zinc-500">{convRate}% from prev</p>
                            )}
                        </div>
                        <div className="flex-1 h-8 bg-zinc-800/50 rounded-lg overflow-hidden relative">
                            <div
                                className="h-full rounded-lg transition-all duration-500"
                                style={{
                                    width: `${Math.max(pct, 2)}%`,
                                    backgroundColor: step.color,
                                    opacity: 0.7,
                                }}
                            />
                            <span className="absolute inset-0 flex items-center px-3 text-sm font-medium text-white">
                                {step.value.toLocaleString()}
                            </span>
                        </div>
                        <div className="w-14 text-right text-xs text-zinc-500">
                            {pct.toFixed(0)}%
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ============= Retention Heatmap =============

export function RetentionHeatmap({
    cohorts,
    className,
}: {
    cohorts: {
        cohort: string;
        size: number;
        d1: number;
        d3: number;
        d7: number;
        d14: number;
        d30: number;
    }[];
    className?: string;
}) {
    if (!cohorts || cohorts.length === 0) {
        return <EmptyState icon="📅" title="No retention data" description="Retention cohorts will appear as users return." />;
    }

    const periods = ["d1", "d3", "d7", "d14", "d30"] as const;
    const periodLabels = { d1: "Day 1", d3: "Day 3", d7: "Day 7", d14: "Day 14", d30: "Day 30" };

    function getColor(rate: number): string {
        if (rate >= 0.5) return "bg-emerald-500/80";
        if (rate >= 0.3) return "bg-emerald-500/50";
        if (rate >= 0.15) return "bg-amber-500/50";
        if (rate >= 0.05) return "bg-amber-500/30";
        if (rate > 0) return "bg-red-500/30";
        return "bg-zinc-800/50";
    }

    return (
        <div className={cn("overflow-x-auto", className)}>
            <table className="w-full text-xs">
                <thead>
                    <tr>
                        <th className="text-left text-zinc-500 font-medium px-2 py-1.5">Cohort</th>
                        <th className="text-center text-zinc-500 font-medium px-2 py-1.5">Size</th>
                        {periods.map((p) => (
                            <th key={p} className="text-center text-zinc-500 font-medium px-2 py-1.5">
                                {periodLabels[p]}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {cohorts.map((c) => (
                        <tr key={c.cohort}>
                            <td className="text-zinc-300 px-2 py-1.5 whitespace-nowrap">
                                {new Date(c.cohort).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </td>
                            <td className="text-center text-zinc-300 px-2 py-1.5 font-medium">{c.size}</td>
                            {periods.map((p) => {
                                const rate = c.size > 0 ? c[p] / c.size : 0;
                                return (
                                    <td key={p} className="px-1 py-1">
                                        <div
                                            className={cn(
                                                "rounded px-2 py-1 text-center font-medium",
                                                getColor(rate),
                                            )}
                                            title={`${c[p]} of ${c.size} users returned`}
                                        >
                                            {c.size > 0 ? `${(rate * 100).toFixed(0)}%` : "–"}
                                        </div>
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ============= Segment Donut =============

export function SegmentDonut({
    segments,
    className,
}: {
    segments: { name: string; value: number; color: string }[];
    className?: string;
}) {
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    if (total === 0) return null;

    return (
        <div className={cn("flex items-center gap-6", className)}>
            <div className="w-32 h-32 flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChartMini data={segments} />
                </ResponsiveContainer>
            </div>
            <div className="space-y-2 flex-1">
                {segments.map((s) => (
                    <div key={s.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: s.color }}
                            />
                            <span className="text-sm text-zinc-300">{s.name}</span>
                        </div>
                        <div className="text-right">
                            <span className="text-sm font-medium text-white">{s.value.toLocaleString()}</span>
                            <span className="text-xs text-zinc-500 ml-1.5">
                                {total > 0 ? ((s.value / total) * 100).toFixed(0) : 0}%
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Mini pie chart (no imports from recharts to avoid SSR issues in the same component)
import { PieChart as RechartsPie, Pie, Cell } from "recharts";

function PieChartMini({ data }: { data: { name: string; value: number; color: string }[] }) {
    return (
        <RechartsPie>
            <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={55}
                dataKey="value"
                strokeWidth={0}
            >
                {data.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                ))}
            </Pie>
        </RechartsPie>
    );
}

// ============= Peak Hours Heatmap =============

export function PeakHoursHeatmap({
    data,
    className,
}: {
    data: { day: number; hour: number; count: number }[];
    className?: string;
}) {
    if (!data || data.length === 0) {
        return <EmptyState icon="🕐" title="No activity data" />;
    }

    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const maxCount = Math.max(...data.map((d) => d.count), 1);

    // Build a grid
    const grid: Record<string, number> = {};
    data.forEach((d) => {
        grid[`${d.day}-${d.hour}`] = d.count;
    });

    function getIntensity(count: number): string {
        const ratio = count / maxCount;
        if (ratio >= 0.8) return "bg-orange-500/90";
        if (ratio >= 0.6) return "bg-orange-500/60";
        if (ratio >= 0.4) return "bg-orange-500/40";
        if (ratio >= 0.2) return "bg-orange-500/20";
        if (ratio > 0) return "bg-orange-500/10";
        return "bg-zinc-800/30";
    }

    return (
        <div className={cn("overflow-x-auto", className)}>
            <div className="min-w-[600px]">
                {/* Hour labels */}
                <div className="flex ml-10 mb-1">
                    {Array.from({ length: 24 }, (_, h) => (
                        <div key={h} className="flex-1 text-center text-[10px] text-zinc-500">
                            {h % 3 === 0 ? `${h}h` : ""}
                        </div>
                    ))}
                </div>
                {/* Day rows */}
                {days.map((dayLabel, dayIndex) => (
                    <div key={dayIndex} className="flex items-center gap-1 mb-0.5">
                        <div className="w-9 text-right text-[10px] text-zinc-500">{dayLabel}</div>
                        {Array.from({ length: 24 }, (_, hour) => {
                            const count = grid[`${dayIndex}-${hour}`] || 0;
                            return (
                                <div
                                    key={hour}
                                    className={cn(
                                        "flex-1 h-4 rounded-sm transition-colors",
                                        getIntensity(count),
                                    )}
                                    title={`${dayLabel} ${hour}:00 — ${count} messages`}
                                />
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
