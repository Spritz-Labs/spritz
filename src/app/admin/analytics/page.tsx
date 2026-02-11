"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { AdminLayout, AdminAuthWrapper, AdminLoading } from "@/components/AdminLayout";
import {
    LineChart,
    Line,
    AreaChart,
    Area,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";
import {
    KPICard,
    TrendBadge,
    Sparkline,
    ChartCard,
    SectionHeader,
    AnalyticsSkeleton,
    EmptyState,
    FunnelChart,
    RetentionHeatmap,
    PeakHoursHeatmap,
    SegmentDonut,
} from "@/components/admin/analytics/KPICard";

// V2 analytics data types
type V2OverviewData = {
    section: string;
    activeUsers: { dau: number; wau: number; mau: number; prev_dau: number; prev_wau: number; prev_mau: number } | null;
    dauSparkline: { date: string; value: number }[] | null;
    segments: { total: number; power: number; active: number; casual: number; dormant: number; churned: number } | null;
    funnel: { signed_up: number; sent_message: number; used_ai: number; used_wallet: number; repeat_users: number } | null;
    comparison: {
        current: { new_users: number; active_users: number; messages: number; dm_messages: number; channel_messages: number; alpha_messages: number; ai_prompts: number; friendships: number; agents_created: number };
        previous: { new_users: number; active_users: number; messages: number; dm_messages: number; channel_messages: number; alpha_messages: number; ai_prompts: number; friendships: number; agents_created: number };
    } | null;
    totals: { users: number; agents: number; messages: number; dmMessages: number; channelMessages: number; alphaMessages: number } | null;
};

type V2UsersData = {
    section: string;
    signupCurve: { date: string; new_users: number; cumulative: number }[] | null;
    retention: { cohort: string; size: number; d1: number; d3: number; d7: number; d14: number; d30: number }[] | null;
    segments: { total: number; power: number; active: number; casual: number; dormant: number; churned: number } | null;
    funnel: { signed_up: number; sent_message: number; used_ai: number; used_wallet: number; repeat_users: number } | null;
    peakHours: { day: number; hour: number; count: number }[] | null;
    topUsers: {
        byMessages: { wallet_address: string; username: string | null; ens_name: string | null; messages_sent: number; last_login: string }[];
        byPoints: { wallet_address: string; username: string | null; ens_name: string | null; points: number; last_login: string }[];
        byFriends: { wallet_address: string; username: string | null; ens_name: string | null; friends_count: number; last_login: string }[];
    };
};

type V2ChatData = {
    section: string;
    messageVolume: { date: string; dms: number; channels: number; alpha: number; ai_prompts: number; ai_responses: number; total: number }[] | null;
    peakHours: { day: number; hour: number; count: number }[] | null;
    comparison: V2OverviewData["comparison"];
    topChannels: { id: string; name: string; emoji: string; member_count: number; message_count: number }[];
};

type V2AgentData = {
    section: string;
    agentLeaderboard: { id: string; name: string; emoji: string; visibility: string; owner: string; total_messages: number; period_prompts: number; unique_users: number; errors: number }[] | null;
    messageVolume: V2ChatData["messageVolume"];
    comparison: V2OverviewData["comparison"];
    totals: { totalAiMessages: number; totalAgents: number };
};

type Period = "24h" | "7d" | "30d" | "90d" | "365d";
type SectionTab = "overview" | "users" | "wallets" | "communication" | "chats" | "agents";

type TimeSeriesItem = {
    date: string;
    label: string;
    newUsers: number;
    logins: number;
    messages: number;
    points: number;
    friendRequests: number;
    groups: number;
    invites: number;
    agents: number;
    agentChats: number;
    agentChatsDirect?: number;
    agentChatsPublic?: number;
    agentChatsChannel?: number;
};

type AgentMessagesBySource = { direct: number; public: number; channel: number };

type TopChannelByAgentUsage = { channelId: string | null; channelType: string; channelName: string; count: number };

type TopUser = {
    address: string;
    username: string | null;
    ensName: string | null;
    value: number;
};

type PointsBreakdown = {
    reason: string;
    points: number;
};

type TopAgent = {
    id: string;
    name: string;
    emoji: string;
    ownerAddress: string;
    visibility: string;
    value: number;
};

type AgentVisibility = {
    visibility: string;
    count: number;
};

type WalletTypeBreakdown = {
    type: string;
    count: number;
};

type SmartWalletUser = {
    address: string;
    username: string | null;
    ensName: string | null;
    walletType: string;
    smartWalletAddress: string;
    createdAt: string;
};

type NetworkStat = {
    chainId: number;
    chainName: string;
    transactions: number;
    volumeUsd: number;
};

type OfficialAgent = {
    id: string;
    name: string;
    avatar_emoji: string;
    avatar_url: string | null;
    personality: string | null;
    x402_enabled: boolean;
    x402_price_cents: number;
    message_count: number;
    created_at: string;
};

type AnalyticsData = {
    summary: {
        totalUsers: number;
        newUsersCount: number;
        activeUsers: number;
        totalMessages: number;
        messagesInPeriod: number;
        totalCalls: number;
        totalVoiceMinutes: number;
        totalVideoMinutes: number;
        totalPoints: number;
        pointsInPeriod: number;
        friendRequestsCount: number;
        acceptedFriendships: number;
        newFriendshipsInPeriod: number;
        groupsCreated: number;
        invitesUsed: number;
        // Public profile stats
        publicProfilesCount: number;
        // Message breakdown
        dmMessagesInPeriod: number;
        channelMessagesInPeriod: number;
        alphaMessagesInPeriod: number;
        totalDmMessages: number;
        totalChannelMessages: number;
        totalAlphaMessages: number;
        totalAgents: number;
        newAgentsCount: number;
        publicAgents: number;
        friendsAgents: number;
        privateAgents: number;
        officialAgents: number;
        totalAgentMessages: number;
        agentMessagesInPeriod: number;
        uniqueAgentUsers: number;
        knowledgeItemsCount: number;
        indexedKnowledgeItems: number;
        streamsCreated: number;
        streamsStarted: number;
        streamsEnded: number;
        totalStreamsCreated: number;
        totalStreamsStarted: number;
        totalStreamsEnded: number;
        totalStreamingMinutes: number;
        totalStreamsViewed: number;
        roomsCreated: number;
        totalRoomsCreated: number;
        totalRoomsJoined: number;
        schedulesCreated: number;
        schedulesJoined: number;
        totalSchedulesCreated: number;
        totalSchedulesJoined: number;
        usersWithSmartWallet: number;
        walletTypeBreakdown: {
            wallet: number;
            passkey: number;
            email: number;
            worldId: number;
            solana: number;
        };
        totalPasskeys: number;
        passkeysWithSafeSigners: number;
        passkeysInPeriod: number;
        embeddedWallets: number;
        deployedSmartWallets: number;
        walletsCreatedInPeriod: number;
        betaApplicantsCount: number;
        betaApprovedCount: number;
        betaPendingCount: number;
        totalWalletTransactions: number;
        walletTxInPeriod: number;
        confirmedTransactions: number;
        totalVolumeUsd: number;
        volumeInPeriod: number;
        uniqueTxUsers: number;
        usersWithTxHistory: number;
        totalUserVolumeUsd: number;
        agentMessagesBySource?: AgentMessagesBySource;
        agentFailedInPeriod?: number;
    };
    timeSeries: TimeSeriesItem[];
    topUsers: {
        byPoints: TopUser[];
        byMessages: TopUser[];
        byFriends: TopUser[];
    };
    topAgents: {
        byMessages: TopAgent[];
    };
    topChannelsByAgentUsage?: TopChannelByAgentUsage[];
    agentVisibilityBreakdown: AgentVisibility[];
    officialAgentsList: OfficialAgent[];
    pointsBreakdown: PointsBreakdown[];
    walletTypeBreakdown: WalletTypeBreakdown[];
    networkStats: NetworkStat[];
    recentSmartWalletUsers: SmartWalletUser[];
    period: string;
    startDate: string;
    endDate: string;
};

const PERIODS: { value: Period; label: string }[] = [
    { value: "24h", label: "24h" },
    { value: "7d", label: "7d" },
    { value: "30d", label: "30d" },
    { value: "90d", label: "90d" },
    { value: "365d", label: "1y" },
];

const SECTION_TABS: { value: SectionTab; label: string; icon: string }[] = [
    { value: "overview", label: "Overview", icon: "📊" },
    { value: "users", label: "Users", icon: "👥" },
    { value: "wallets", label: "Wallets", icon: "💳" },
    { value: "communication", label: "Communication", icon: "📞" },
    { value: "chats", label: "Chats", icon: "💬" },
    { value: "agents", label: "AI Agents", icon: "🤖" },
];

const PIE_COLORS = ["#FF5500", "#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EC4899"];

export default function AnalyticsPage() {
    const {
        isAdmin,
        isAuthenticated,
        isReady,
        isLoading,
        error,
        isConnected,
        signIn,
        getAuthHeaders,
    } = useAdmin();

    const [data, setData] = useState<AnalyticsData | null>(null);
    const [v2Data, setV2Data] = useState<V2OverviewData | V2UsersData | V2ChatData | V2AgentData | null>(null);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [isLoadingV2, setIsLoadingV2] = useState(false);
    const [selectedPeriod, setSelectedPeriod] = useState<Period>("7d");
    const [activeSection, setActiveSection] = useState<SectionTab>("overview");

    const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    const getDisplayName = (user: TopUser) => {
        if (user.username) return `@${user.username}`;
        if (user.ensName) return user.ensName;
        return formatAddress(user.address);
    };

    // Fetch v2 data for the active section (uses RPC functions for richer insights)
    const fetchV2Data = useCallback(async (section: string) => {
        if (!isReady) return;
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;

        setIsLoadingV2(true);
        try {
            const res = await fetch(`/api/admin/analytics/v2?section=${section}&period=${selectedPeriod}`, {
                headers: authHeaders,
            });
            if (res.ok) {
                const result = await res.json();
                setV2Data(result);
            }
        } catch (err) {
            console.error("[Analytics v2] Error:", err);
        } finally {
            setIsLoadingV2(false);
        }
    }, [isReady, getAuthHeaders, selectedPeriod]);

    const fetchAnalytics = useCallback(async () => {
        if (!isReady) return;
        const authHeaders = getAuthHeaders();
        if (!authHeaders) return;

        setIsLoadingData(true);
        try {
            const res = await fetch(`/api/admin/analytics?period=${selectedPeriod}`, {
                headers: authHeaders,
            });
            if (res.ok) {
                const analyticsData = await res.json();
                setData(analyticsData);
            }
        } catch (err) {
            console.error("[Analytics] Error fetching data:", err);
        } finally {
            setIsLoadingData(false);
        }
    }, [isReady, getAuthHeaders, selectedPeriod]);

    useEffect(() => {
        if (isAuthenticated && isAdmin) {
            fetchAnalytics();
        }
    }, [isAuthenticated, isAdmin, fetchAnalytics]);

    // Fetch v2 data when section changes
    useEffect(() => {
        if (isAuthenticated && isAdmin) {
            const sectionMap: Record<SectionTab, string> = {
                overview: "overview",
                users: "users",
                chats: "chat",
                agents: "agents",
                wallets: "wallets",
                communication: "overview", // reuse overview data
            };
            fetchV2Data(sectionMap[activeSection]);
        }
    }, [isAuthenticated, isAdmin, activeSection, fetchV2Data]);

    // Loading state
    if (isLoading) {
        return <AdminLoading />;
    }

    // Auth states
    if (!isAuthenticated) {
        return (
            <AdminAuthWrapper title="Analytics Dashboard">
                {!isConnected ? (
                    <>
                        <p className="text-zinc-400 mb-6">Connect your wallet to view analytics.</p>
                        <div className="mb-4"><appkit-button /></div>
                    </>
                ) : (
                    <>
                        <p className="text-zinc-400 mb-6">Sign in to view analytics.</p>
                        <button onClick={signIn} className="w-full py-3 px-4 bg-[#FF5500] hover:bg-[#E04D00] text-white font-semibold rounded-xl transition-colors mb-4">
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
                <p className="text-zinc-400 mb-6">{!isAdmin ? "You do not have permission to view analytics." : "Please wait..."}</p>
                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            </AdminAuthWrapper>
        );
    }

    return (
        <AdminLayout title="Analytics">
            {/* Period & Section Controls */}
            <div className="max-w-7xl mx-auto px-4 py-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    {/* Period Selector */}
                    <div className="flex bg-zinc-800 rounded-lg p-0.5 w-fit">
                        {PERIODS.map((period) => (
                            <button
                                key={period.value}
                                onClick={() => setSelectedPeriod(period.value)}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                    selectedPeriod === period.value
                                        ? "bg-[#FF5500] text-white"
                                        : "text-zinc-400 hover:text-white"
                                }`}
                            >
                                {period.label}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={fetchAnalytics}
                        disabled={isLoadingData}
                        className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50 w-fit"
                    >
                        {isLoadingData ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        )}
                    </button>
                </div>

                {/* Section Tabs */}
                <div className="flex gap-1 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
                    {SECTION_TABS.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => setActiveSection(tab.value)}
                            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                                activeSection === tab.value
                                    ? "bg-zinc-800 text-white"
                                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                            }`}
                        >
                            <span>{tab.icon}</span>
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Loading State */}
            {isLoadingData && !data && (
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <AnalyticsSkeleton rows={3} />
                </div>
            )}

            {/* Content */}
            {data && (
                <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeSection}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            {activeSection === "overview" && <OverviewSection data={data} period={selectedPeriod} v2={v2Data as V2OverviewData} isLoadingV2={isLoadingV2} />}
                            {activeSection === "users" && <UsersSection data={data} period={selectedPeriod} getDisplayName={getDisplayName} v2={v2Data as V2UsersData} isLoadingV2={isLoadingV2} />}
                            {activeSection === "wallets" && <WalletsSection data={data} period={selectedPeriod} />}
                            {activeSection === "communication" && <CommunicationSection data={data} period={selectedPeriod} />}
                            {activeSection === "chats" && <ChatsSection period={selectedPeriod} v2={v2Data as V2ChatData} isLoadingV2={isLoadingV2} />}
                            {activeSection === "agents" && <AgentsSection data={data} period={selectedPeriod} v2={v2Data as V2AgentData} isLoadingV2={isLoadingV2} />}
                        </motion.div>
                    </AnimatePresence>
                </div>
            )}
        </AdminLayout>
    );
}

// ============================================
// SECTION COMPONENTS
// ============================================

function OverviewSection({ data, period, v2, isLoadingV2 }: { data: AnalyticsData; period: Period; v2: V2OverviewData | null; isLoadingV2: boolean }) {
    const comp = v2?.comparison;
    const curr = comp?.current;
    const prev = comp?.previous;
    const activeUsers = v2?.activeUsers;
    const segments = v2?.segments;
    const funnel = v2?.funnel;
    const dauSparkline = v2?.dauSparkline;

    return (
        <div className="space-y-6">
            {/* DAU / WAU / MAU — headline metrics */}
            {activeUsers && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <KPICard
                        label="Daily Active Users"
                        value={activeUsers.dau}
                        icon="🔥"
                        size="large"
                        current={activeUsers.dau}
                        previous={activeUsers.prev_dau}
                        trendLabel="vs yesterday"
                        sparklineData={dauSparkline || undefined}
                        sparklineKey="value"
                        sparklineColor="#FF5500"
                    />
                    <KPICard
                        label="Weekly Active Users"
                        value={activeUsers.wau}
                        icon="📈"
                        size="large"
                        current={activeUsers.wau}
                        previous={activeUsers.prev_wau}
                        trendLabel="vs prev week"
                        sparklineColor="#3B82F6"
                    />
                    <KPICard
                        label="Monthly Active Users"
                        value={activeUsers.mau}
                        icon="📊"
                        size="large"
                        current={activeUsers.mau}
                        previous={activeUsers.prev_mau}
                        trendLabel="vs prev month"
                        sparklineColor="#10B981"
                    />
                </div>
            )}

            {/* Key Metrics with period comparison */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <KPICard
                    label="Total Users"
                    value={data.summary.totalUsers}
                    icon="👥"
                    current={curr?.new_users}
                    previous={prev?.new_users}
                    trendLabel="signups"
                    subtext={`+${data.summary.newUsersCount} new`}
                />
                <KPICard
                    label="Messages"
                    value={data.summary.totalMessages}
                    icon="💬"
                    current={curr?.messages}
                    previous={prev?.messages}
                    trendLabel="vs prev"
                />
                <KPICard
                    label="Smart Wallets"
                    value={data.summary.usersWithSmartWallet}
                    icon="💳"
                    subtext={`+${data.summary.walletsCreatedInPeriod} new`}
                />
                <KPICard
                    label="Transactions"
                    value={data.summary.totalWalletTransactions}
                    icon="📊"
                    subtext={`${data.summary.walletTxInPeriod} in period`}
                />
                <KPICard
                    label="Volume"
                    value={`$${Math.round(data.summary.totalVolumeUsd).toLocaleString()}`}
                    icon="💰"
                />
                <KPICard
                    label="AI Agents"
                    value={data.summary.totalAgents}
                    icon="🤖"
                    current={curr?.agents_created}
                    previous={prev?.agents_created}
                    trendLabel="created"
                    subtext={`+${data.summary.newAgentsCount} new`}
                />
            </div>

            {/* User Segments */}
            {segments && (
                <ChartCard title="User Segments" description="Users segmented by recent activity level">
                    <SegmentDonut
                        segments={[
                            { name: "Power Users", value: segments.power, color: "#FF5500" },
                            { name: "Active (7d)", value: segments.active, color: "#3B82F6" },
                            { name: "Casual (30d)", value: segments.casual, color: "#10B981" },
                            { name: "Dormant (90d)", value: segments.dormant, color: "#F59E0B" },
                            { name: "Churned", value: segments.churned, color: "#6B7280" },
                        ]}
                    />
                </ChartCard>
            )}

            {/* Message Breakdown with comparison */}
            <ChartCard title={`Message Breakdown (in ${period})`} description="Messages by type with period comparison">
                <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
                        <p className="text-2xl font-bold text-blue-400">{data.summary.dmMessagesInPeriod.toLocaleString()}</p>
                        <p className="text-xs text-zinc-500 mt-1">DMs ({data.summary.totalDmMessages.toLocaleString()} total)</p>
                        {curr && prev && (
                            <div className="mt-1">
                                <TrendBadge current={curr.dm_messages} previous={prev.dm_messages} label="vs prev" />
                            </div>
                        )}
                    </div>
                    <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
                        <p className="text-2xl font-bold text-purple-400">{data.summary.channelMessagesInPeriod.toLocaleString()}</p>
                        <p className="text-xs text-zinc-500 mt-1">Channels ({data.summary.totalChannelMessages.toLocaleString()} total)</p>
                        {curr && prev && (
                            <div className="mt-1">
                                <TrendBadge current={curr.channel_messages} previous={prev.channel_messages} label="vs prev" />
                            </div>
                        )}
                    </div>
                    <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
                        <p className="text-2xl font-bold text-orange-400">{data.summary.alphaMessagesInPeriod.toLocaleString()}</p>
                        <p className="text-xs text-zinc-500 mt-1">Alpha ({data.summary.totalAlphaMessages.toLocaleString()} total)</p>
                        {curr && prev && (
                            <div className="mt-1">
                                <TrendBadge current={curr.alpha_messages} previous={prev.alpha_messages} label="vs prev" />
                            </div>
                        )}
                    </div>
                </div>
            </ChartCard>

            {/* User Journey Funnel */}
            {funnel && (
                <ChartCard title="User Journey Funnel" description="Conversion from signup through key milestones">
                    <FunnelChart
                        steps={[
                            { label: "Signed Up", value: funnel.signed_up, color: "#3B82F6" },
                            { label: "Sent Message", value: funnel.sent_message, color: "#8B5CF6" },
                            { label: "Used AI Agent", value: funnel.used_ai, color: "#10B981" },
                            { label: "Used Wallet", value: funnel.used_wallet, color: "#F59E0B" },
                            { label: "Repeat Users", value: funnel.repeat_users, color: "#FF5500" },
                        ]}
                    />
                </ChartCard>
            )}

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* User Growth Chart */}
                <ChartCard title="User Growth" description="New signups and active users over time">
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.timeSeries}>
                                <defs>
                                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#FF5500" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#FF5500" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis dataKey="label" stroke="#666" tick={{ fill: "#999", fontSize: 10 }} />
                                <YAxis stroke="#666" tick={{ fill: "#999", fontSize: 10 }} />
                                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: "8px" }} />
                                <Legend />
                                <Area type="monotone" dataKey="newUsers" name="New Users" stroke="#FF5500" fill="url(#colorUsers)" strokeWidth={2} />
                                <Area type="monotone" dataKey="logins" name="Active" stroke="#3B82F6" fill="url(#colorActive)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>

                {/* Auth Method Breakdown */}
                <ChartCard title="Auth Methods" description="How users authenticate">
                    <div className="h-48 flex items-center">
                        {data.walletTypeBreakdown && data.walletTypeBreakdown.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={data.walletTypeBreakdown} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="count" nameKey="type">
                                        {data.walletTypeBreakdown.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: "8px" }} />
                                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <EmptyState icon="🔐" title="No auth data" />
                        )}
                    </div>
                </ChartCard>
            </div>

            {/* Secondary Metrics */}
            <SectionHeader title="Platform Totals" description="All-time cumulative metrics" />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <SmallMetric label="Passkeys" value={data.summary.totalPasskeys} />
                <SmallMetric label="Calls" value={data.summary.totalCalls} />
                <SmallMetric label="Streams" value={data.summary.totalStreamsCreated} />
                <SmallMetric label="Rooms" value={data.summary.totalRoomsCreated} />
                <SmallMetric label="Messages" value={data.summary.totalMessages} />
                <SmallMetric label="Points" value={data.summary.totalPoints} />
                <SmallMetric label="Friendships" value={data.summary.acceptedFriendships} />
                <SmallMetric label="Public Profiles" value={data.summary.publicProfilesCount} />
            </div>

            {/* Beta Access */}
            <ChartCard title="Wallet Beta Access">
                <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                        <p className="text-2xl font-bold text-amber-400">{data.summary.betaApplicantsCount}</p>
                        <p className="text-xs text-zinc-500">Applications</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold text-green-400">{data.summary.betaApprovedCount}</p>
                        <p className="text-xs text-zinc-500">Approved</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-bold text-orange-400">{data.summary.betaPendingCount}</p>
                        <p className="text-xs text-zinc-500">Pending</p>
                    </div>
                </div>
            </ChartCard>
        </div>
    );
}

function UsersSection({ data, period, getDisplayName, v2, isLoadingV2 }: { data: AnalyticsData; period: Period; getDisplayName: (user: TopUser) => string; v2: V2UsersData | null; isLoadingV2: boolean }) {
    const segments = v2?.segments;
    const funnel = v2?.funnel;
    const signupCurve = v2?.signupCurve;
    const retention = v2?.retention;
    const peakHours = v2?.peakHours;

    return (
        <div className="space-y-6">
            {/* User Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <KPICard label="Total Users" value={data.summary.totalUsers} icon="👥" />
                <KPICard label="New Users" value={data.summary.newUsersCount} icon="✨" subtext={`in ${period}`} />
                <KPICard label="Active Users" value={data.summary.activeUsers} icon="🔥" subtext={`in ${period}`} />
                <KPICard label="Messages Sent" value={data.summary.messagesInPeriod} icon="💬" subtext={`in ${period}`} />
                <KPICard label="Friend Requests" value={data.summary.friendRequestsCount} icon="🤝" />
                <KPICard label="Invites Used" value={data.summary.invitesUsed} icon="🎟️" />
            </div>

            {/* User Segments */}
            {segments && (
                <ChartCard title="User Segmentation" description="Users grouped by activity level">
                    <SegmentDonut
                        segments={[
                            { name: "Power Users", value: segments.power, color: "#FF5500" },
                            { name: "Active (7d)", value: segments.active, color: "#3B82F6" },
                            { name: "Casual (30d)", value: segments.casual, color: "#10B981" },
                            { name: "Dormant (90d)", value: segments.dormant, color: "#F59E0B" },
                            { name: "Churned (90d+)", value: segments.churned, color: "#6B7280" },
                        ]}
                    />
                </ChartCard>
            )}

            {/* User Journey Funnel */}
            {funnel && (
                <ChartCard title="User Journey Funnel" description="Conversion from signup through key milestones">
                    <FunnelChart
                        steps={[
                            { label: "Signed Up", value: funnel.signed_up, color: "#3B82F6" },
                            { label: "Sent Message", value: funnel.sent_message, color: "#8B5CF6" },
                            { label: "Used AI Agent", value: funnel.used_ai, color: "#10B981" },
                            { label: "Used Wallet", value: funnel.used_wallet, color: "#F59E0B" },
                            { label: "Repeat Users", value: funnel.repeat_users, color: "#FF5500" },
                        ]}
                    />
                </ChartCard>
            )}

            {/* User Growth Curve (Cumulative) */}
            {signupCurve && signupCurve.length > 0 && (
                <ChartCard title="User Growth Curve" description="Cumulative signups with daily new user overlay">
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={signupCurve}>
                                <defs>
                                    <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis
                                    dataKey="date"
                                    stroke="#666"
                                    tick={{ fill: "#999", fontSize: 10 }}
                                    tickFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                />
                                <YAxis yAxisId="left" stroke="#666" tick={{ fill: "#999", fontSize: 10 }} />
                                <YAxis yAxisId="right" orientation="right" stroke="#666" tick={{ fill: "#999", fontSize: 10 }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: "8px" }}
                                    labelFormatter={(d) => new Date(d as string).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                                />
                                <Legend />
                                <Area yAxisId="left" type="monotone" dataKey="cumulative" name="Total Users" stroke="#3B82F6" fill="url(#colorCumulative)" strokeWidth={2} />
                                <Bar yAxisId="right" dataKey="new_users" name="New Users" fill="#FF5500" radius={[2, 2, 0, 0]} opacity={0.7} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>
            )}

            {/* Retention Cohort Heatmap */}
            {retention && retention.length > 0 && (
                <ChartCard title="Retention Cohorts" description="Percentage of users returning by cohort week">
                    <RetentionHeatmap cohorts={retention} />
                </ChartCard>
            )}

            {/* Peak Hours Heatmap */}
            {peakHours && peakHours.length > 0 && (
                <ChartCard title="Peak Activity Hours" description="When your users are most active (hour x day of week)">
                    <PeakHoursHeatmap data={peakHours} />
                </ChartCard>
            )}

            {/* User Activity Timeline */}
            <ChartCard title="User Activity Over Time" description="Daily new users and active users">
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.timeSeries}>
                            <defs>
                                <linearGradient id="colorNewUsers" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#FF5500" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#FF5500" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorLogins" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                            <XAxis dataKey="label" stroke="#666" tick={{ fill: "#999", fontSize: 11 }} />
                            <YAxis stroke="#666" tick={{ fill: "#999", fontSize: 11 }} />
                            <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: "8px" }} />
                            <Legend />
                            <Area type="monotone" dataKey="newUsers" name="New Users" stroke="#FF5500" fill="url(#colorNewUsers)" strokeWidth={2} />
                            <Area type="monotone" dataKey="logins" name="Active Users" stroke="#3B82F6" fill="url(#colorLogins)" strokeWidth={2} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </ChartCard>

            {/* Top Users */}
            <SectionHeader title="Top Users" description="Leaderboards across key engagement metrics" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TopUsersList title="Top by Points" icon="⭐" users={data.topUsers.byPoints} getDisplayName={getDisplayName} color="text-yellow-400" />
                <TopUsersList title="Top by Messages" icon="💬" users={data.topUsers.byMessages} getDisplayName={getDisplayName} color="text-purple-400" />
                <TopUsersList title="Top by Friends" icon="🤝" users={data.topUsers.byFriends} getDisplayName={getDisplayName} color="text-pink-400" />
            </div>

            {/* Points Breakdown */}
            {data.pointsBreakdown.length > 0 && (
                <ChartCard title="Points Distribution" description="Points earned by activity type">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {data.pointsBreakdown.slice(0, 8).map((item, index) => (
                            <div key={item.reason} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                                    <span className="text-xs text-zinc-400 truncate">{item.reason}</span>
                                </div>
                                <span className="text-sm font-medium">{item.points.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </ChartCard>
            )}
        </div>
    );
}

function WalletsSection({ data, period }: { data: AnalyticsData; period: Period }) {
    return (
        <div className="space-y-6">
            {/* Wallet Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <KPICard label="Smart Wallets" value={data.summary.usersWithSmartWallet} icon="💳" subtext={`of ${data.summary.totalUsers} users`} />
                <KPICard label="Deployed" value={data.summary.deployedSmartWallets} icon="✅" subtext="on-chain" />
                <KPICard label="New Wallets" value={data.summary.walletsCreatedInPeriod} icon="✨" subtext={`in ${period}`} />
                <KPICard label="Passkeys" value={data.summary.totalPasskeys} icon="🔑" subtext={`${data.summary.passkeysWithSafeSigners} with signers`} />
                <KPICard label="New Passkeys" value={data.summary.passkeysInPeriod} icon="🆕" subtext={`in ${period}`} />
                <KPICard label="Embedded" value={data.summary.embeddedWallets} icon="🔐" subtext="wallets" />
            </div>

            {/* Transaction Stats */}
            <SectionHeader title="Transactions" description="On-chain transaction activity" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <KPICard label="Total Tx" value={data.summary.totalWalletTransactions} icon="📊" subtext={`${data.summary.confirmedTransactions} confirmed`} />
                <KPICard label="Tx in Period" value={data.summary.walletTxInPeriod} icon="📈" subtext={`in ${period}`} />
                <KPICard label="Total Volume" value={`$${Math.round(data.summary.totalVolumeUsd).toLocaleString()}`} icon="💰" />
                <KPICard label="Period Volume" value={`$${Math.round(data.summary.volumeInPeriod).toLocaleString()}`} icon="💵" subtext={`in ${period}`} />
                <KPICard label="Unique Tx Users" value={data.summary.uniqueTxUsers} icon="👥" />
                <KPICard label="Active Wallets" value={data.summary.usersWithTxHistory} icon="🔥" subtext="with tx history" />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Auth Method Breakdown */}
                <ChartCard title="Auth Method Breakdown" description="Distribution of wallet authentication types">
                    <div className="h-56">
                        {data.walletTypeBreakdown && data.walletTypeBreakdown.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={data.walletTypeBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="count" nameKey="type" label={(props) => {
                                        const { name, percent } = props as { name?: string; percent?: number };
                                        return `${name} (${((percent || 0) * 100).toFixed(0)}%)`;
                                    }}>
                                        {data.walletTypeBreakdown.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: "8px" }} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <EmptyState icon="💳" title="No wallet data yet" />
                        )}
                    </div>
                </ChartCard>

                {/* Network Usage */}
                <ChartCard title="Network Usage" description="Transaction count by blockchain network">
                    <div className="h-56">
                        {data.networkStats && data.networkStats.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.networkStats} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                    <XAxis type="number" stroke="#666" tick={{ fill: "#999", fontSize: 10 }} />
                                    <YAxis type="category" dataKey="chainName" stroke="#666" tick={{ fill: "#999", fontSize: 10 }} width={70} />
                                    <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: "8px" }} />
                                    <Bar dataKey="transactions" fill="#3B82F6" radius={[0, 4, 4, 0]} name="Transactions" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <EmptyState icon="🔗" title="No transaction data yet" />
                        )}
                    </div>
                </ChartCard>
            </div>

            {/* Beta Access & Recent Users */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Beta Access */}
                <ChartCard title="Wallet Beta Access">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-4 bg-zinc-800/50 rounded-lg">
                            <p className="text-3xl font-bold text-amber-400">{data.summary.betaApplicantsCount}</p>
                            <p className="text-xs text-zinc-500 mt-1">Applications</p>
                        </div>
                        <div className="text-center p-4 bg-zinc-800/50 rounded-lg">
                            <p className="text-3xl font-bold text-green-400">{data.summary.betaApprovedCount}</p>
                            <p className="text-xs text-zinc-500 mt-1">Approved</p>
                        </div>
                        <div className="text-center p-4 bg-zinc-800/50 rounded-lg">
                            <p className="text-3xl font-bold text-orange-400">{data.summary.betaPendingCount}</p>
                            <p className="text-xs text-zinc-500 mt-1">Pending</p>
                        </div>
                    </div>
                </ChartCard>

                {/* Recent Smart Wallet Users */}
                <ChartCard title="Recent Smart Wallet Users">
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {data.recentSmartWalletUsers?.length > 0 ? (
                            data.recentSmartWalletUsers.slice(0, 5).map((user) => (
                                <div key={user.address} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <span>{user.walletType === "passkey" ? "🔑" : user.walletType === "email" ? "📧" : "🔗"}</span>
                                        <span className="text-sm truncate max-w-[150px]">
                                            {user.username ? `@${user.username}` : `${user.address.slice(0, 8)}...`}
                                        </span>
                                    </div>
                                    <span className="text-xs text-zinc-500">{new Date(user.createdAt).toLocaleDateString()}</span>
                                </div>
                            ))
                        ) : (
                            <EmptyState icon="💳" title="No smart wallet users yet" />
                        )}
                    </div>
                </ChartCard>
            </div>
        </div>
    );
}

function CommunicationSection({ data, period }: { data: AnalyticsData; period: Period }) {
    return (
        <div className="space-y-6">
            {/* Calls Stats */}
            <SectionHeader title="Video & Voice Calls" description="Real-time communication metrics" />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <KPICard label="Total Calls" value={data.summary.totalCalls} icon="📞" />
                <KPICard label="Voice Minutes" value={data.summary.totalVoiceMinutes} icon="🎤" />
                <KPICard label="Video Minutes" value={data.summary.totalVideoMinutes} icon="🎥" />
            </div>

            {/* Streaming Stats */}
            <SectionHeader title="Live Streaming" description="Streaming activity and engagement" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <KPICard label="Streams Created" value={data.summary.streamsCreated} icon="📹" subtext={`(${data.summary.totalStreamsCreated} total)`} />
                <KPICard label="Streams Started" value={data.summary.streamsStarted} icon="🔴" subtext={`(${data.summary.totalStreamsStarted} total)`} />
                <KPICard label="Streams Ended" value={data.summary.streamsEnded} icon="⏹️" />
                <KPICard label="Streaming Min" value={data.summary.totalStreamingMinutes} icon="⏱️" />
                <KPICard label="Views" value={data.summary.totalStreamsViewed} icon="👁️" />
            </div>

            {/* Rooms & Scheduling */}
            <SectionHeader title="Rooms & Scheduling" description="Instant rooms and scheduled calls" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KPICard label="Rooms Created" value={data.summary.roomsCreated} icon="🏠" subtext={`(${data.summary.totalRoomsCreated} total)`} />
                <KPICard label="Rooms Joined" value={data.summary.totalRoomsJoined} icon="🚪" />
                <KPICard label="Schedules Created" value={data.summary.schedulesCreated} icon="📅" subtext={`(${data.summary.totalSchedulesCreated} total)`} />
                <KPICard label="Schedules Joined" value={data.summary.schedulesJoined} icon="✅" subtext={`(${data.summary.totalSchedulesJoined} total)`} />
            </div>

            {/* Engagement Chart */}
            <ChartCard title="Engagement Over Time" description="Daily messages, friend requests, and groups created">
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.timeSeries}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                            <XAxis dataKey="label" stroke="#666" tick={{ fill: "#999", fontSize: 11 }} />
                            <YAxis stroke="#666" tick={{ fill: "#999", fontSize: 11 }} />
                            <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: "8px" }} />
                            <Legend />
                            <Bar dataKey="messages" name="Messages" fill="#10B981" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="friendRequests" name="Friend Requests" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="groups" name="Groups" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </ChartCard>
        </div>
    );
}

function AgentsSection({ data, period, v2, isLoadingV2 }: { data: AnalyticsData; period: Period; v2: V2AgentData | null; isLoadingV2: boolean }) {
    const bySource = data.summary.agentMessagesBySource;
    const failed = data.summary.agentFailedInPeriod ?? 0;
    const topChannels = data.topChannelsByAgentUsage ?? [];
    const leaderboard = v2?.agentLeaderboard;

    return (
        <div className="space-y-6">
            {/* Agent Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <KPICard label="Total Agents" value={data.summary.totalAgents} icon="🤖" />
                <KPICard label="New Agents" value={data.summary.newAgentsCount} icon="✨" subtext={`in ${period}`} />
                <KPICard label="Agent Messages" value={data.summary.agentMessagesInPeriod} icon="💬" subtext={`(${data.summary.totalAgentMessages} total)`} />
                <KPICard label="Unique Users" value={data.summary.uniqueAgentUsers} icon="👤" subtext="using agents" />
                <KPICard label="Knowledge Items" value={data.summary.knowledgeItemsCount} icon="📚" subtext={`${data.summary.indexedKnowledgeItems} indexed`} />
                <KPICard label="Official Agents" value={data.summary.officialAgents} icon="⭐" subtext="platform agents" />
            </div>

            {/* Usage by source + failed */}
            {(bySource || failed > 0) && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {bySource && (
                        <>
                            <MetricCard label="Direct (1:1)" value={bySource.direct} icon="💬" subtext="in-app chat" />
                            <MetricCard label="Public Page" value={bySource.public} icon="🌐" subtext="official / embed" />
                            <MetricCard label="Channel @mentions" value={bySource.channel} icon="📢" subtext="alpha & channels" />
                        </>
                    )}
                    {failed > 0 && (
                        <MetricCard label="Failed responses" value={failed} icon="⚠️" subtext={`in ${period}`} />
                    )}
                </div>
            )}

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Agent Activity Chart */}
                <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-400 mb-3">Agent Activity</h3>
                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.timeSeries}>
                                <defs>
                                    <linearGradient id="colorAgents" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorAgentChats" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorAgentDirect" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorAgentPublic" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorAgentChannel" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis dataKey="label" stroke="#666" tick={{ fill: "#999", fontSize: 10 }} />
                                <YAxis stroke="#666" tick={{ fill: "#999", fontSize: 10 }} />
                                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: "8px" }} />
                                <Legend />
                                <Area type="monotone" dataKey="agents" name="New Agents" stroke="#8B5CF6" fill="url(#colorAgents)" strokeWidth={2} />
                                <Area type="monotone" dataKey="agentChats" name="Agent Chats (total)" stroke="#06B6D4" fill="url(#colorAgentChats)" strokeWidth={2} />
                                {data.timeSeries.some(d => (d.agentChatsDirect ?? 0) + (d.agentChatsPublic ?? 0) + (d.agentChatsChannel ?? 0) > 0) && (
                                    <>
                                        <Area type="monotone" dataKey="agentChatsDirect" name="Direct" stroke="#3B82F6" fill="url(#colorAgentDirect)" strokeWidth={1.5} />
                                        <Area type="monotone" dataKey="agentChatsPublic" name="Public" stroke="#10B981" fill="url(#colorAgentPublic)" strokeWidth={1.5} />
                                        <Area type="monotone" dataKey="agentChatsChannel" name="Channel @mentions" stroke="#F59E0B" fill="url(#colorAgentChannel)" strokeWidth={1.5} />
                                    </>
                                )}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Agent Visibility Breakdown */}
                <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-400 mb-3">Agent Visibility</h3>
                    <div className="h-56">
                        {data.agentVisibilityBreakdown?.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={data.agentVisibilityBreakdown} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="count" nameKey="visibility" label>
                                        {data.agentVisibilityBreakdown.map((entry, index) => {
                                            const colors: Record<string, string> = {
                                                "Private": "#6B7280",
                                                "Friends": "#3B82F6", 
                                                "Public": "#10B981",
                                                "Official": "#F97316"
                                            };
                                            return <Cell key={`cell-${index}`} fill={colors[entry.visibility] || PIE_COLORS[index % PIE_COLORS.length]} />;
                                        })}
                                    </Pie>
                                    <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: "8px" }} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <p className="text-zinc-500 text-center py-20">No agent data yet</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Top channels by agent usage (@mentions) */}
            {topChannels.length > 0 && (
                <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-400 mb-3">Top Channels by Agent @mentions</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {topChannels.map((ch, index) => (
                            <div key={`${ch.channelType}-${ch.channelId ?? "global"}`} className="flex items-center gap-3 bg-zinc-800/50 rounded-lg px-3 py-2">
                                <span className="text-zinc-500 text-sm w-4">{index + 1}.</span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{ch.channelName}</p>
                                    <p className="text-xs text-zinc-500">{ch.channelType === "global" ? "Global" : "Channel"}</p>
                                </div>
                                <span className="text-amber-400 text-sm font-medium">{ch.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Top Agents */}
            <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-400 mb-3">Top Agents by Messages</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {data.topAgents.byMessages?.length > 0 ? (
                        data.topAgents.byMessages.slice(0, 9).map((agent, index) => (
                            <div key={agent.id} className="flex items-center gap-3 bg-zinc-800/50 rounded-lg px-3 py-2">
                                <span className="text-zinc-500 text-sm w-4">{index + 1}.</span>
                                <span className="text-xl">{agent.emoji}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{agent.name}</p>
                                    <p className="text-xs text-zinc-500">
                                        {agent.visibility === "private" ? "🔒" : agent.visibility === "friends" ? "👥" : "🌍"}
                                    </p>
                                </div>
                                <span className="text-cyan-400 text-sm font-medium">{agent.value}</span>
                            </div>
                        ))
                    ) : (
                        <p className="text-zinc-500 text-center py-4 col-span-3">No agent activity yet</p>
                    )}
                </div>
            </div>

            {/* Agent Leaderboard (v2 — richer data) */}
            {leaderboard && leaderboard.length > 0 && (
                <ChartCard title="Agent Leaderboard" description={`Ranked by usage in the last ${period}`}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-800">
                                    <th className="text-left text-zinc-500 font-medium px-3 py-2">#</th>
                                    <th className="text-left text-zinc-500 font-medium px-3 py-2">Agent</th>
                                    <th className="text-right text-zinc-500 font-medium px-3 py-2">Prompts</th>
                                    <th className="text-right text-zinc-500 font-medium px-3 py-2">Users</th>
                                    <th className="text-right text-zinc-500 font-medium px-3 py-2">Total Msgs</th>
                                    <th className="text-right text-zinc-500 font-medium px-3 py-2">Errors</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaderboard.map((agent, i) => (
                                    <tr key={agent.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                                        <td className="text-zinc-500 px-3 py-2">{i + 1}</td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">{agent.emoji}</span>
                                                <div>
                                                    <p className="font-medium text-zinc-200">{agent.name}</p>
                                                    <p className="text-xs text-zinc-500">
                                                        {agent.visibility === "private" ? "🔒 Private" : agent.visibility === "friends" ? "👥 Friends" : agent.visibility === "official" ? "⭐ Official" : "🌍 Public"}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="text-right text-cyan-400 font-medium px-3 py-2">{agent.period_prompts.toLocaleString()}</td>
                                        <td className="text-right text-blue-400 px-3 py-2">{agent.unique_users}</td>
                                        <td className="text-right text-zinc-300 px-3 py-2">{agent.total_messages.toLocaleString()}</td>
                                        <td className={`text-right px-3 py-2 ${agent.errors > 0 ? "text-red-400" : "text-zinc-600"}`}>{agent.errors}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ChartCard>
            )}

            {/* Official Agents Integration */}
            {data.officialAgentsList?.length > 0 && (
                <OfficialAgentsIntegration agents={data.officialAgentsList} />
            )}
        </div>
    );
}

// ============================================
// CHATS SECTION
// ============================================

type ChatStats = {
    totalChannels: number;
    totalLocationChats: number;
    standardChannels: number;
    wakuChannels: number;
    poapEventChannels: number;
    poapCollectionChannels: number;
    officialChannels: number;
    totalMembers: number;
    totalMessages: number;
    activeChannels: number;
    activeLocationChats: number;
    topChannels: { id: string; name: string; emoji: string; type: string; member_count: number; message_count: number }[];
    topLocationChats: { id: string; name: string; emoji: string; google_place_name: string; member_count: number; message_count: number }[];
};

function ChatsSection({ period, v2, isLoadingV2 }: { period: Period; v2: V2ChatData | null; isLoadingV2: boolean }) {
    const { getAuthHeaders, isReady } = useAdmin();
    const [stats, setStats] = useState<ChatStats | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        async function fetchChatStats() {
            if (!isReady) return;
            const authHeaders = getAuthHeaders();
            if (!authHeaders) return;

            setIsLoading(true);
            try {
                const res = await fetch("/api/admin/chats", { headers: authHeaders });
                if (res.ok) {
                    const data = await res.json();
                    setStats({
                        ...data.summary,
                        topChannels: data.channels.slice(0, 10).map((c: { id: string; name: string; emoji: string; type: string; member_count: number; message_count: number }) => ({
                            id: c.id,
                            name: c.name,
                            emoji: c.emoji,
                            type: c.type,
                            member_count: c.member_count,
                            message_count: c.message_count,
                        })),
                        topLocationChats: data.locationChats.slice(0, 10).map((c: { id: string; name: string; emoji: string; google_place_name: string; member_count: number; message_count: number }) => ({
                            id: c.id,
                            name: c.name,
                            emoji: c.emoji,
                            google_place_name: c.google_place_name,
                            member_count: c.member_count,
                            message_count: c.message_count,
                        })),
                    });
                }
            } catch (err) {
                console.error("[ChatsSection] Error:", err);
            } finally {
                setIsLoading(false);
            }
        }
        fetchChatStats();
    }, [isReady, getAuthHeaders]);

    if (isLoading || !stats) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-[#FF5500] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const channelTypeData = [
        { name: "Standard", value: stats.standardChannels, color: "#3B82F6" },
        { name: "Decentralized", value: stats.wakuChannels, color: "#8B5CF6" },
        { name: "POAP Event", value: stats.poapEventChannels, color: "#EC4899" },
        { name: "POAP Collection", value: stats.poapCollectionChannels, color: "#F59E0B" },
        { name: "Location", value: stats.totalLocationChats, color: "#EF4444" },
    ].filter(d => d.value > 0);

    return (
        <div className="space-y-6">
            {/* Chat Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricCard label="Total Channels" value={stats.totalChannels} icon="💬" />
                <MetricCard label="Location Chats" value={stats.totalLocationChats} icon="📍" />
                <MetricCard label="Standard" value={stats.standardChannels} icon="☁️" />
                <MetricCard label="Decentralized" value={stats.wakuChannels} icon="🌐" />
                <MetricCard label="POAP Channels" value={stats.poapEventChannels + stats.poapCollectionChannels} icon="🎫" />
                <MetricCard label="Official" value={stats.officialChannels} icon="⭐" />
            </div>

            {/* Engagement Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="Total Members" value={stats.totalMembers} icon="👥" subtext="across all chats" />
                <MetricCard label="Total Messages" value={stats.totalMessages} icon="📊" subtext="in public chats" />
                <MetricCard label="Active Channels" value={stats.activeChannels} icon="✅" subtext={`of ${stats.totalChannels}`} />
                <MetricCard label="Active Locations" value={stats.activeLocationChats} icon="📍" subtext={`of ${stats.totalLocationChats}`} />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Channel Type Breakdown */}
                <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-400 mb-3">Chat Type Distribution</h3>
                    <div className="h-56">
                        {channelTypeData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie 
                                        data={channelTypeData} 
                                        cx="50%" 
                                        cy="50%" 
                                        innerRadius={50} 
                                        outerRadius={80} 
                                        dataKey="value" 
                                        nameKey="name"
                                        label={(props) => {
                                            const { name, percent } = props as { name?: string; percent?: number };
                                            return `${name} (${((percent || 0) * 100).toFixed(0)}%)`;
                                        }}
                                    >
                                        {channelTypeData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: "8px" }} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <p className="text-zinc-500 text-center py-20">No chat data yet</p>
                        )}
                    </div>
                </div>

                {/* Activity Comparison */}
                <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-400 mb-3">Top Chats by Activity</h3>
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                        {stats.topChannels.slice(0, 5).map((ch, index) => (
                            <div key={ch.id} className="flex items-center gap-3 bg-zinc-800/50 rounded-lg px-3 py-2">
                                <span className="text-zinc-500 text-sm w-4">{index + 1}.</span>
                                <span className="text-xl">{ch.emoji}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate text-sm">{ch.name}</p>
                                    <p className="text-xs text-zinc-500">{ch.type}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-blue-400">{ch.member_count} 👥</p>
                                    <p className="text-xs text-zinc-500">{ch.message_count} msgs</p>
                                </div>
                            </div>
                        ))}
                        {stats.topChannels.length === 0 && (
                            <p className="text-zinc-500 text-center py-4">No channels yet</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Top Location Chats */}
            {stats.topLocationChats.length > 0 && (
                <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-400 mb-3">📍 Top Location Chats</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {stats.topLocationChats.slice(0, 6).map((lc, index) => (
                            <div key={lc.id} className="flex items-center gap-3 bg-zinc-800/50 rounded-lg px-3 py-2">
                                <span className="text-zinc-500 text-sm w-4">{index + 1}.</span>
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center text-lg">
                                    {lc.emoji}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate text-sm">{lc.name}</p>
                                    <p className="text-xs text-zinc-500 truncate">{lc.google_place_name}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm text-red-400">{lc.member_count} 👥</p>
                                    <p className="text-xs text-zinc-500">{lc.message_count} msgs</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Message Volume Over Time (v2) */}
            {v2?.messageVolume && v2.messageVolume.length > 0 && (
                <ChartCard title="Message Volume Over Time" description="Daily messages by type (DMs, Channels, Alpha, AI)">
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={v2.messageVolume}>
                                <defs>
                                    <linearGradient id="colorDms" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorChannels" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorAlpha" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#FF5500" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#FF5500" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorAi" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis
                                    dataKey="date"
                                    stroke="#666"
                                    tick={{ fill: "#999", fontSize: 10 }}
                                    tickFormatter={(d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                />
                                <YAxis stroke="#666" tick={{ fill: "#999", fontSize: 10 }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: "8px" }}
                                    labelFormatter={(d) => new Date(d as string).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                                />
                                <Legend />
                                <Area type="monotone" dataKey="dms" name="DMs" stroke="#3B82F6" fill="url(#colorDms)" strokeWidth={2} stackId="1" />
                                <Area type="monotone" dataKey="channels" name="Channels" stroke="#8B5CF6" fill="url(#colorChannels)" strokeWidth={2} stackId="1" />
                                <Area type="monotone" dataKey="alpha" name="Alpha" stroke="#FF5500" fill="url(#colorAlpha)" strokeWidth={2} stackId="1" />
                                <Area type="monotone" dataKey="ai_prompts" name="AI Prompts" stroke="#10B981" fill="url(#colorAi)" strokeWidth={2} stackId="1" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </ChartCard>
            )}

            {/* Peak Hours Heatmap (v2) */}
            {v2?.peakHours && v2.peakHours.length > 0 && (
                <ChartCard title="Peak Activity Hours" description="When messages are sent (UTC, hour x day of week)">
                    <PeakHoursHeatmap data={v2.peakHours} />
                </ChartCard>
            )}

            {/* Quick Link to Chats Admin */}
            <div className="bg-zinc-800/30 rounded-xl p-4 border border-zinc-700/50 flex items-center justify-between">
                <div>
                    <h3 className="font-medium text-white">Manage Public Chats</h3>
                    <p className="text-sm text-zinc-400">View all channels and location chats, toggle official status, or deactivate</p>
                </div>
                <a
                    href="/admin/chats"
                    className="px-4 py-2 bg-[#FF5500] hover:bg-[#E04D00] text-white text-sm font-medium rounded-lg transition-colors"
                >
                    Go to Chats →
                </a>
            </div>
        </div>
    );
}

// ============================================
// OFFICIAL AGENTS INTEGRATION
// ============================================

function OfficialAgentsIntegration({ agents }: { agents: OfficialAgent[] }) {
    const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
    const [embedTab, setEmbedTab] = useState<Record<string, "iframe" | "js" | "react" | "nextjs">>({});
    const [copiedField, setCopiedField] = useState<string | null>(null);

    const copyToClipboard = async (text: string, fieldId: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedField(fieldId);
            setTimeout(() => setCopiedField(null), 2000);
        } catch (err) {
            console.error("Copy failed:", err);
        }
    };

    const getPublicUrl = (agentId: string) => 
        `${typeof window !== "undefined" ? window.location.origin : "https://app.spritz.chat"}/agent/${agentId}`;

    const getEmbedCode = (agentId: string, type: "iframe" | "js" | "react" | "nextjs") => {
        const publicUrl = getPublicUrl(agentId);
        
        switch (type) {
            case "iframe":
                return `<iframe 
  src="${publicUrl}"
  width="100%"
  height="600"
  frameborder="0"
  allow="clipboard-read; clipboard-write"
  style="border-radius: 12px; border: 1px solid #3f3f46;">
</iframe>`;
            case "js":
                return `<!-- Add this to your HTML -->
<div id="spritz-agent-${agentId}"></div>
<script>
  (function() {
    const iframe = document.createElement('iframe');
    iframe.src = '${publicUrl}';
    iframe.width = '100%';
    iframe.height = '600';
    iframe.frameBorder = '0';
    iframe.allow = 'clipboard-read; clipboard-write';
    iframe.style.borderRadius = '12px';
    iframe.style.border = '1px solid #3f3f46';
    document.getElementById('spritz-agent-${agentId}').appendChild(iframe);
  })();
</script>`;
            case "react":
                return `// SpritzAgent.tsx
export function SpritzAgent() {
  return (
    <iframe
      src="${publicUrl}"
      width="100%"
      height="600"
      frameBorder="0"
      allow="clipboard-read; clipboard-write"
      style={{
        borderRadius: '12px',
        border: '1px solid #3f3f46',
      }}
    />
  );
}`;
            case "nextjs":
                return `// app/components/SpritzAgent.tsx
'use client';

export function SpritzAgent() {
  return (
    <iframe
      src="${publicUrl}"
      width="100%"
      height={600}
      frameBorder={0}
      allow="clipboard-read; clipboard-write"
      className="rounded-xl border border-zinc-700"
    />
  );
}`;
        }
    };

    return (
        <div className="bg-zinc-900/50 rounded-xl p-4 border border-orange-500/30">
            <h3 className="text-sm font-semibold text-orange-400 mb-4 flex items-center gap-2">
                <span>⭐</span>
                Official Agents - Public URLs & Integration
            </h3>
            <p className="text-xs text-zinc-400 mb-4">
                Manage public URLs and embed codes for all official platform agents.
            </p>
            
            <div className="space-y-3">
                {agents.map((agent) => {
                    const isExpanded = expandedAgent === agent.id;
                    const publicUrl = getPublicUrl(agent.id);
                    const currentTab = embedTab[agent.id] || "iframe";
                    
                    return (
                        <div 
                            key={agent.id}
                            className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl overflow-hidden"
                        >
                            {/* Agent Header */}
                            <button
                                onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                                className="w-full flex items-center gap-3 p-4 hover:bg-zinc-800/80 transition-colors"
                            >
                                {agent.avatar_url ? (
                                    <img 
                                        src={agent.avatar_url} 
                                        alt={agent.name} 
                                        className="w-10 h-10 rounded-xl object-cover"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/30 to-amber-500/30 flex items-center justify-center text-xl">
                                        {agent.avatar_emoji}
                                    </div>
                                )}
                                <div className="flex-1 text-left">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-medium text-white">{agent.name}</h4>
                                        <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">
                                            ⭐ Official
                                        </span>
                                        {agent.x402_enabled && (
                                            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">
                                                💰 ${(agent.x402_price_cents / 100).toFixed(2)}/msg
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-zinc-500 truncate">
                                        {agent.personality || "AI Assistant"} • {agent.message_count} messages
                                    </p>
                                </div>
                                <svg 
                                    className={`w-5 h-5 text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                    fill="none" 
                                    viewBox="0 0 24 24" 
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {/* Expanded Content */}
                            {isExpanded && (
                                <div className="px-4 pb-4 space-y-4 border-t border-zinc-700/50">
                                    {/* Public URL */}
                                    <div className="pt-4">
                                        <label className="block text-xs text-zinc-400 mb-2 font-medium">
                                            🔗 Public Chat URL
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={publicUrl}
                                                readOnly
                                                className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm font-mono"
                                            />
                                            <button
                                                onClick={() => copyToClipboard(publicUrl, `url-${agent.id}`)}
                                                className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm rounded-lg transition-colors min-w-[70px]"
                                            >
                                                {copiedField === `url-${agent.id}` ? "Copied!" : "Copy"}
                                            </button>
                                            <a
                                                href={publicUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-3 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 text-sm rounded-lg transition-colors flex items-center gap-1"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                </svg>
                                                Open
                                            </a>
                                        </div>
                                    </div>

                                    {/* Embed Code */}
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <label className="text-xs text-zinc-400 font-medium">📦 Embed Code</label>
                                            <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
                                                {(["iframe", "js", "react", "nextjs"] as const).map((tab) => (
                                                    <button
                                                        key={tab}
                                                        onClick={() => setEmbedTab(prev => ({ ...prev, [agent.id]: tab }))}
                                                        className={`px-2 py-1 text-xs rounded transition-colors ${
                                                            currentTab === tab
                                                                ? "bg-zinc-800 text-zinc-300"
                                                                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                                                        }`}
                                                    >
                                                        {tab === "iframe" ? "iframe" : tab === "js" ? "JavaScript" : tab === "react" ? "React" : "Next.js"}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="relative">
                                            <textarea
                                                value={getEmbedCode(agent.id, currentTab)}
                                                readOnly
                                                rows={currentTab === "iframe" ? 7 : 12}
                                                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-xs font-mono resize-none"
                                            />
                                            <button
                                                onClick={() => copyToClipboard(getEmbedCode(agent.id, currentTab), `embed-${agent.id}-${currentTab}`)}
                                                className="absolute top-2 right-2 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded transition-colors"
                                            >
                                                {copiedField === `embed-${agent.id}-${currentTab}` ? "Copied!" : "Copy"}
                                            </button>
                                        </div>
                                        <p className="text-xs text-zinc-500 mt-1.5">
                                            {currentTab === "iframe" && "Paste this iframe code directly into your HTML"}
                                            {currentTab === "js" && "Add this script to dynamically load the agent"}
                                            {currentTab === "react" && "Use this React component in your app"}
                                            {currentTab === "nextjs" && "Client component for Next.js App Router"}
                                        </p>
                                    </div>

                                    {/* Quick Stats */}
                                    <div className="flex items-center gap-4 pt-2 border-t border-zinc-700/50 text-xs text-zinc-500">
                                        <span>ID: <code className="text-zinc-400">{agent.id}</code></span>
                                        <span>Messages: <span className="text-cyan-400">{agent.message_count}</span></span>
                                        <span>Created: {new Date(agent.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ============================================
// REUSABLE COMPONENTS
// ============================================

function MetricCard({ 
    label, 
    value, 
    icon, 
    subtext, 
    trend, 
    trendLabel,
    isString = false 
}: { 
    label: string; 
    value: number | string; 
    icon: string; 
    subtext?: string; 
    trend?: number; 
    trendLabel?: string;
    isString?: boolean;
}) {
    return (
        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
            <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{icon}</span>
                <span className="text-xs text-zinc-400 uppercase tracking-wider">{label}</span>
            </div>
            <p className="text-2xl font-bold">{isString ? value : (value as number).toLocaleString()}</p>
            {(subtext || trend !== undefined) && (
                <p className="text-xs text-zinc-500 mt-1">
                    {trend !== undefined && <span className="text-green-400">+{trend}</span>}
                    {trend !== undefined && trendLabel && ` ${trendLabel}`}
                    {trend !== undefined && subtext && " · "}
                    {subtext}
                </p>
            )}
        </div>
    );
}

function SmallMetric({ label, value }: { label: string; value: number }) {
    return (
        <div className="bg-zinc-800/50 rounded-lg px-3 py-2 text-center">
            <p className="text-lg font-bold">{value.toLocaleString()}</p>
            <p className="text-xs text-zinc-500">{label}</p>
        </div>
    );
}

function TopUsersList({ 
    title, 
    icon, 
    users, 
    getDisplayName, 
    color 
}: { 
    title: string; 
    icon: string; 
    users: TopUser[]; 
    getDisplayName: (user: TopUser) => string; 
    color: string;
}) {
    return (
        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
            <h4 className="text-sm font-semibold text-zinc-400 mb-3">{icon} {title}</h4>
            <div className="space-y-2">
                {users.slice(0, 5).map((user, index) => (
                    <div key={user.address} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                            <span className="text-zinc-500 text-sm w-4">{index + 1}.</span>
                            <span className="text-sm truncate max-w-[120px]">{getDisplayName(user)}</span>
                        </div>
                        <span className={`text-sm font-medium ${color}`}>{user.value.toLocaleString()}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
