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

type Period = "24h" | "7d" | "30d" | "90d" | "365d";
type SectionTab = "overview" | "users" | "wallets" | "communication" | "agents";

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
};

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
    agentVisibilityBreakdown: AgentVisibility[];
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
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [selectedPeriod, setSelectedPeriod] = useState<Period>("7d");
    const [activeSection, setActiveSection] = useState<SectionTab>("overview");

    const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

    const getDisplayName = (user: TopUser) => {
        if (user.username) return `@${user.username}`;
        if (user.ensName) return user.ensName;
        return formatAddress(user.address);
    };

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
                <div className="max-w-7xl mx-auto px-4 py-20 flex justify-center">
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-[#FF5500] border-t-transparent rounded-full animate-spin" />
                        <p className="text-zinc-400">Loading analytics...</p>
                    </div>
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
                            {activeSection === "overview" && <OverviewSection data={data} period={selectedPeriod} />}
                            {activeSection === "users" && <UsersSection data={data} period={selectedPeriod} getDisplayName={getDisplayName} />}
                            {activeSection === "wallets" && <WalletsSection data={data} period={selectedPeriod} />}
                            {activeSection === "communication" && <CommunicationSection data={data} period={selectedPeriod} />}
                            {activeSection === "agents" && <AgentsSection data={data} period={selectedPeriod} />}
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

function OverviewSection({ data, period }: { data: AnalyticsData; period: Period }) {
    return (
        <div className="space-y-6">
            {/* Key Metrics Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <MetricCard label="Total Users" value={data.summary.totalUsers} icon="👥" trend={data.summary.newUsersCount} trendLabel="new" />
                <MetricCard label="Active Users" value={data.summary.activeUsers} icon="🔥" subtext={`in ${period}`} />
                <MetricCard label="Smart Wallets" value={data.summary.usersWithSmartWallet} icon="💳" trend={data.summary.walletsCreatedInPeriod} trendLabel="new" />
                <MetricCard label="Transactions" value={data.summary.totalWalletTransactions} icon="📊" trend={data.summary.walletTxInPeriod} trendLabel="in period" />
                <MetricCard label="Volume" value={`$${Math.round(data.summary.totalVolumeUsd).toLocaleString()}`} icon="💰" isString />
                <MetricCard label="AI Agents" value={data.summary.totalAgents} icon="🤖" trend={data.summary.newAgentsCount} trendLabel="new" />
            </div>

            {/* Secondary Metrics */}
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
            
            {/* Message Breakdown */}
            <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-400 mb-3">Message Breakdown (in {period})</h3>
                <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
                        <p className="text-2xl font-bold text-blue-400">{data.summary.dmMessagesInPeriod}</p>
                        <p className="text-xs text-zinc-500 mt-1">DMs ({data.summary.totalDmMessages} total)</p>
                    </div>
                    <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
                        <p className="text-2xl font-bold text-purple-400">{data.summary.channelMessagesInPeriod}</p>
                        <p className="text-xs text-zinc-500 mt-1">Channels ({data.summary.totalChannelMessages} total)</p>
                    </div>
                    <div className="text-center p-3 bg-zinc-800/50 rounded-lg">
                        <p className="text-2xl font-bold text-orange-400">{data.summary.alphaMessagesInPeriod}</p>
                        <p className="text-xs text-zinc-500 mt-1">Alpha ({data.summary.totalAlphaMessages} total)</p>
                    </div>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* User Growth Chart */}
                <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-400 mb-3">User Growth</h3>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.timeSeries}>
                                <defs>
                                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#FF5500" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#FF5500" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis dataKey="label" stroke="#666" tick={{ fill: "#999", fontSize: 10 }} />
                                <YAxis stroke="#666" tick={{ fill: "#999", fontSize: 10 }} />
                                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: "8px" }} />
                                <Area type="monotone" dataKey="newUsers" name="New Users" stroke="#FF5500" fill="url(#colorUsers)" strokeWidth={2} />
                                <Area type="monotone" dataKey="logins" name="Active" stroke="#3B82F6" fill="transparent" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Auth Method Breakdown */}
                <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-400 mb-3">Auth Methods</h3>
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
                            <p className="text-zinc-500 text-center w-full">No data</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Beta Access */}
            <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-400 mb-3">Wallet Beta Access</h3>
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
            </div>
        </div>
    );
}

function UsersSection({ data, period, getDisplayName }: { data: AnalyticsData; period: Period; getDisplayName: (user: TopUser) => string }) {
    return (
        <div className="space-y-6">
            {/* User Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <MetricCard label="Total Users" value={data.summary.totalUsers} icon="👥" />
                <MetricCard label="New Users" value={data.summary.newUsersCount} icon="✨" subtext={`in ${period}`} />
                <MetricCard label="Active Users" value={data.summary.activeUsers} icon="🔥" subtext={`in ${period}`} />
                <MetricCard label="Messages Sent" value={data.summary.messagesInPeriod} icon="💬" subtext={`in ${period}`} />
                <MetricCard label="Friend Requests" value={data.summary.friendRequestsCount} icon="🤝" />
                <MetricCard label="Invites Used" value={data.summary.invitesUsed} icon="🎟️" />
            </div>

            {/* User Growth Chart */}
            <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-400 mb-3">User Activity Over Time</h3>
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
            </div>

            {/* Top Users */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TopUsersList title="Top by Points" icon="⭐" users={data.topUsers.byPoints} getDisplayName={getDisplayName} color="text-yellow-400" />
                <TopUsersList title="Top by Messages" icon="💬" users={data.topUsers.byMessages} getDisplayName={getDisplayName} color="text-purple-400" />
                <TopUsersList title="Top by Friends" icon="🤝" users={data.topUsers.byFriends} getDisplayName={getDisplayName} color="text-pink-400" />
            </div>

            {/* Points Breakdown */}
            {data.pointsBreakdown.length > 0 && (
                <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-400 mb-3">Points Distribution</h3>
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
                </div>
            )}
        </div>
    );
}

function WalletsSection({ data, period }: { data: AnalyticsData; period: Period }) {
    return (
        <div className="space-y-6">
            {/* Wallet Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <MetricCard label="Smart Wallets" value={data.summary.usersWithSmartWallet} icon="💳" subtext={`of ${data.summary.totalUsers} users`} />
                <MetricCard label="Deployed" value={data.summary.deployedSmartWallets} icon="✅" subtext="on-chain" />
                <MetricCard label="New Wallets" value={data.summary.walletsCreatedInPeriod} icon="✨" subtext={`in ${period}`} />
                <MetricCard label="Passkeys" value={data.summary.totalPasskeys} icon="🔑" subtext={`${data.summary.passkeysWithSafeSigners} with signers`} />
                <MetricCard label="New Passkeys" value={data.summary.passkeysInPeriod} icon="🆕" subtext={`in ${period}`} />
                <MetricCard label="Embedded" value={data.summary.embeddedWallets} icon="🔐" subtext="wallets" />
            </div>

            {/* Transaction Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricCard label="Total Tx" value={data.summary.totalWalletTransactions} icon="📊" subtext={`${data.summary.confirmedTransactions} confirmed`} />
                <MetricCard label="Tx in Period" value={data.summary.walletTxInPeriod} icon="📈" subtext={`in ${period}`} />
                <MetricCard label="Total Volume" value={`$${Math.round(data.summary.totalVolumeUsd).toLocaleString()}`} icon="💰" isString />
                <MetricCard label="Period Volume" value={`$${Math.round(data.summary.volumeInPeriod).toLocaleString()}`} icon="💵" isString subtext={`in ${period}`} />
                <MetricCard label="Unique Tx Users" value={data.summary.uniqueTxUsers} icon="👥" />
                <MetricCard label="Active Wallets" value={data.summary.usersWithTxHistory} icon="🔥" subtext="with tx history" />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Auth Method Breakdown */}
                <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-400 mb-3">Auth Method Breakdown</h3>
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
                            <p className="text-zinc-500 text-center py-20">No wallet data yet</p>
                        )}
                    </div>
                </div>

                {/* Network Usage */}
                <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-400 mb-3">Network Usage</h3>
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
                            <p className="text-zinc-500 text-center py-20">No transaction data yet</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Beta Access & Recent Users */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Beta Access */}
                <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-400 mb-3">Wallet Beta Access</h3>
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
                </div>

                {/* Recent Smart Wallet Users */}
                <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-400 mb-3">Recent Smart Wallet Users</h3>
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
                            <p className="text-zinc-500 text-center py-4">No smart wallet users yet</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function CommunicationSection({ data, period }: { data: AnalyticsData; period: Period }) {
    return (
        <div className="space-y-6">
            {/* Calls Stats */}
            <div>
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Video & Voice Calls</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <MetricCard label="Total Calls" value={data.summary.totalCalls} icon="📞" />
                    <MetricCard label="Voice Minutes" value={data.summary.totalVoiceMinutes} icon="🎤" />
                    <MetricCard label="Video Minutes" value={data.summary.totalVideoMinutes} icon="🎥" />
                </div>
            </div>

            {/* Streaming Stats */}
            <div>
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Live Streaming</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <MetricCard label="Streams Created" value={data.summary.streamsCreated} icon="📹" subtext={`(${data.summary.totalStreamsCreated} total)`} />
                    <MetricCard label="Streams Started" value={data.summary.streamsStarted} icon="🔴" subtext={`(${data.summary.totalStreamsStarted} total)`} />
                    <MetricCard label="Streams Ended" value={data.summary.streamsEnded} icon="⏹️" />
                    <MetricCard label="Streaming Min" value={data.summary.totalStreamingMinutes} icon="⏱️" />
                    <MetricCard label="Views" value={data.summary.totalStreamsViewed} icon="👁️" />
                </div>
            </div>

            {/* Rooms & Scheduling */}
            <div>
                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Rooms & Scheduling</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MetricCard label="Rooms Created" value={data.summary.roomsCreated} icon="🏠" subtext={`(${data.summary.totalRoomsCreated} total)`} />
                    <MetricCard label="Rooms Joined" value={data.summary.totalRoomsJoined} icon="🚪" />
                    <MetricCard label="Schedules Created" value={data.summary.schedulesCreated} icon="📅" subtext={`(${data.summary.totalSchedulesCreated} total)`} />
                    <MetricCard label="Schedules Joined" value={data.summary.schedulesJoined} icon="✅" subtext={`(${data.summary.totalSchedulesJoined} total)`} />
                </div>
            </div>

            {/* Engagement Chart */}
            <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-400 mb-3">Engagement Over Time</h3>
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
            </div>
        </div>
    );
}

function AgentsSection({ data, period }: { data: AnalyticsData; period: Period }) {
    return (
        <div className="space-y-6">
            {/* Agent Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricCard label="Total Agents" value={data.summary.totalAgents} icon="🤖" />
                <MetricCard label="New Agents" value={data.summary.newAgentsCount} icon="✨" subtext={`in ${period}`} />
                <MetricCard label="Agent Messages" value={data.summary.agentMessagesInPeriod} icon="💬" subtext={`(${data.summary.totalAgentMessages} total)`} />
                <MetricCard label="Unique Users" value={data.summary.uniqueAgentUsers} icon="👤" subtext="using agents" />
                <MetricCard label="Knowledge Items" value={data.summary.knowledgeItemsCount} icon="📚" subtext={`${data.summary.indexedKnowledgeItems} indexed`} />
                <MetricCard label="Official Agents" value={data.summary.officialAgents} icon="⭐" subtext="platform agents" />
            </div>

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
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                <XAxis dataKey="label" stroke="#666" tick={{ fill: "#999", fontSize: 10 }} />
                                <YAxis stroke="#666" tick={{ fill: "#999", fontSize: 10 }} />
                                <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #333", borderRadius: "8px" }} />
                                <Legend />
                                <Area type="monotone" dataKey="agents" name="New Agents" stroke="#8B5CF6" fill="url(#colorAgents)" strokeWidth={2} />
                                <Area type="monotone" dataKey="agentChats" name="Agent Chats" stroke="#06B6D4" fill="url(#colorAgentChats)" strokeWidth={2} />
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
