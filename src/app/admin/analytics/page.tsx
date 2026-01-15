"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/hooks/useAdmin";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
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
        groupsCreated: number;
        invitesUsed: number;
        // Agent stats
        totalAgents: number;
        newAgentsCount: number;
        publicAgents: number;
        friendsAgents: number;
        privateAgents: number;
        totalAgentMessages: number;
        agentMessagesInPeriod: number;
        uniqueAgentUsers: number;
        knowledgeItemsCount: number;
        indexedKnowledgeItems: number;
        // Streaming stats
        streamsCreated: number;
        streamsStarted: number;
        streamsEnded: number;
        totalStreamsCreated: number;
        totalStreamsStarted: number;
        totalStreamsEnded: number;
        totalStreamingMinutes: number;
        totalStreamsViewed: number;
        // Room stats
        roomsCreated: number;
        totalRoomsCreated: number;
        totalRoomsJoined: number;
        // Scheduling stats
                schedulesCreated: number;
                schedulesJoined: number;
                totalSchedulesCreated: number;
                totalSchedulesJoined: number;
                // Wallet stats
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
                // Beta access stats
                betaApplicantsCount: number;
                betaApprovedCount: number;
                betaPendingCount: number;
                // Wallet transaction stats
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
    { value: "24h", label: "Last 24 Hours" },
    { value: "7d", label: "Last 7 Days" },
    { value: "30d", label: "Last 30 Days" },
    { value: "90d", label: "Last 90 Days" },
    { value: "365d", label: "Last Year" },
];

const CHART_COLORS = {
    primary: "#FF5500",
    secondary: "#3B82F6",
    tertiary: "#10B981",
    quaternary: "#8B5CF6",
    quinary: "#F59E0B",
    senary: "#EC4899",
};

const PIE_COLORS = [
    "#FF5500",
    "#3B82F6",
    "#10B981",
    "#8B5CF6",
    "#F59E0B",
    "#EC4899",
    "#14B8A6",
    "#F97316",
];

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
    const [activeChart, setActiveChart] = useState<"users" | "engagement" | "points" | "agents" | "wallets">("users");

    const formatAddress = (addr: string) =>
        `${addr.slice(0, 6)}...${addr.slice(-4)}`;

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

    // Loading
    if (isLoading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-[#FF5500] border-t-transparent rounded-full animate-spin" />
                    <p className="text-zinc-400">Loading...</p>
                </div>
            </div>
        );
    }

    // Not authenticated - need to connect wallet or sign
    if (!isAuthenticated) {
        const needsWalletConnection = !isConnected;
        
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="bg-zinc-900 rounded-2xl p-8 max-w-md w-full text-center border border-zinc-800">
                    <h1 className="text-2xl font-bold mb-4">Analytics Dashboard</h1>
                    
                    {needsWalletConnection ? (
                        <>
                            <p className="text-zinc-400 mb-6">
                                Connect your wallet and sign to view analytics.
                            </p>
                            <div className="mb-4">
                                <appkit-button />
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-zinc-400 mb-6">
                                Sign in to view analytics.
                            </p>
                            <button
                                onClick={signIn}
                                className="w-full py-3 px-4 bg-[#FF5500] hover:bg-[#E04D00] text-white font-semibold rounded-xl transition-colors mb-4"
                            >
                                Sign In with Ethereum
                            </button>
                        </>
                    )}
                    
                    <Link
                        href="/"
                        className="text-zinc-500 hover:text-zinc-300 text-sm"
                    >
                        ← Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    // Still loading after auth
    if (!isReady) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="bg-zinc-900 rounded-2xl p-8 max-w-md w-full text-center border border-zinc-800">
                    <h1 className="text-2xl font-bold mb-4">Analytics Dashboard</h1>
                    <p className="text-zinc-400 mb-6">
                        Please sign in to access analytics.
                    </p>
                    <button
                        onClick={signIn}
                        className="w-full py-3 bg-[#FF5500] hover:bg-[#E04D00] rounded-xl font-medium transition-colors"
                    >
                        Sign In with Wallet
                    </button>
                    <Link
                        href="/"
                        className="block mt-4 text-zinc-500 hover:text-zinc-300 text-sm"
                    >
                        ← Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    // Not admin
    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="bg-zinc-900 rounded-2xl p-8 max-w-md w-full text-center border border-zinc-800">
                    <h1 className="text-2xl font-bold mb-4 text-red-400">
                        Access Denied
                    </h1>
                    <p className="text-zinc-400 mb-6">
                        You do not have permission to view analytics.
                    </p>
                    {error && (
                        <p className="text-red-400 text-sm mb-4">{error}</p>
                    )}
                    <Link
                        href="/"
                        className="text-zinc-500 hover:text-zinc-300 text-sm"
                    >
                        ← Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white pb-20">
            {/* Header */}
            <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border-b border-zinc-800">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                            <Link
                                href="/admin"
                                className="text-zinc-400 hover:text-white transition-colors"
                            >
                                ← Back
                            </Link>
                            <h1 className="text-2xl font-bold">
                                📊 Analytics Dashboard
                            </h1>
                        </div>
                        <button
                            onClick={fetchAnalytics}
                            disabled={isLoadingData}
                            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                            {isLoadingData ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            )}
                            Refresh
                        </button>
                    </div>

                    {/* Period Selector */}
                    <div className="flex flex-wrap gap-2">
                        {PERIODS.map((period) => (
                            <button
                                key={period.value}
                                onClick={() => setSelectedPeriod(period.value)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                    selectedPeriod === period.value
                                        ? "bg-[#FF5500] text-white"
                                        : "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
                                }`}
                            >
                                {period.label}
                            </button>
                        ))}
                    </div>
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

            {/* Analytics Content */}
            {data && (
                <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
                    {/* Overview Section - Key Metrics */}
                    <section>
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <span>📊</span>
                            Overview
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                            <SummaryCard
                                label="Total Users"
                                value={data.summary.totalUsers}
                                icon="👥"
                                color="from-blue-500/20 to-blue-600/10"
                            />
                            <SummaryCard
                                label="New Users"
                                value={data.summary.newUsersCount}
                                subtext={`in ${selectedPeriod}`}
                                icon="✨"
                                color="from-green-500/20 to-green-600/10"
                            />
                            <SummaryCard
                                label="Active Users"
                                value={data.summary.activeUsers}
                                subtext={`in ${selectedPeriod}`}
                                icon="🔥"
                                color="from-orange-500/20 to-orange-600/10"
                            />
                            <SummaryCard
                                label="Messages"
                                value={data.summary.messagesInPeriod}
                                subtext={`(${data.summary.totalMessages.toLocaleString()} total)`}
                                icon="💬"
                                color="from-purple-500/20 to-purple-600/10"
                            />
                            <SummaryCard
                                label="Points Awarded"
                                value={data.summary.pointsInPeriod}
                                subtext={`(${data.summary.totalPoints.toLocaleString()} total)`}
                                icon="⭐"
                                color="from-yellow-500/20 to-yellow-600/10"
                            />
                            <SummaryCard
                                label="Friendships"
                                value={data.summary.acceptedFriendships}
                                subtext={`of ${data.summary.friendRequestsCount} requests`}
                                icon="🤝"
                                color="from-pink-500/20 to-pink-600/10"
                            />
                            <SummaryCard
                                label="Invites Used"
                                value={data.summary.invitesUsed}
                                subtext={`in ${selectedPeriod}`}
                                icon="🎟️"
                                color="from-teal-500/20 to-teal-600/10"
                            />
                        </div>
                    </section>

                    {/* Communication Section - Calls & Streaming */}
                    <section>
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <span>📞</span>
                            Communication
                        </h2>
                        <div className="space-y-4">
                            {/* Video & Voice Calls */}
                            <div>
                                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Video & Voice Calls</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-2xl">📞</span>
                                            <h3 className="text-lg font-semibold text-zinc-300">Total Calls</h3>
                                        </div>
                                        <p className="text-4xl font-bold">{data.summary.totalCalls.toLocaleString()}</p>
                                    </div>
                                    <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-2xl">🎤</span>
                                            <h3 className="text-lg font-semibold text-zinc-300">Voice Minutes</h3>
                                        </div>
                                        <p className="text-4xl font-bold">{data.summary.totalVoiceMinutes.toLocaleString()}</p>
                                    </div>
                                    <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-2xl">🎥</span>
                                            <h3 className="text-lg font-semibold text-zinc-300">Video Minutes</h3>
                                        </div>
                                        <p className="text-4xl font-bold">{data.summary.totalVideoMinutes.toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Live Streaming */}
                            <div>
                                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Live Streaming</h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                    <SummaryCard
                                        label="Streams Created"
                                        value={data.summary.streamsCreated}
                                        subtext={`(${data.summary.totalStreamsCreated.toLocaleString()} total)`}
                                        icon="📹"
                                        color="from-red-500/20 to-red-600/10"
                                    />
                                    <SummaryCard
                                        label="Streams Started"
                                        value={data.summary.streamsStarted}
                                        subtext={`(${data.summary.totalStreamsStarted.toLocaleString()} total)`}
                                        icon="🔴"
                                        color="from-orange-500/20 to-orange-600/10"
                                    />
                                    <SummaryCard
                                        label="Streams Ended"
                                        value={data.summary.streamsEnded}
                                        subtext={`(${data.summary.totalStreamsEnded.toLocaleString()} total)`}
                                        icon="⏹️"
                                        color="from-purple-500/20 to-purple-600/10"
                                    />
                                    <SummaryCard
                                        label="Streaming Minutes"
                                        value={data.summary.totalStreamingMinutes}
                                        subtext="total minutes"
                                        icon="⏱️"
                                        color="from-pink-500/20 to-pink-600/10"
                                    />
                                    <SummaryCard
                                        label="Streams Viewed"
                                        value={data.summary.totalStreamsViewed}
                                        subtext="total views"
                                        icon="👁️"
                                        color="from-cyan-500/20 to-cyan-600/10"
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Collaboration Section - Rooms & Scheduling */}
                    <section>
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <span>🤝</span>
                            Collaboration
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                            <SummaryCard
                                label="Rooms Created"
                                value={data.summary.roomsCreated}
                                subtext={`(${data.summary.totalRoomsCreated.toLocaleString()} total)`}
                                icon="🏠"
                                color="from-indigo-500/20 to-indigo-600/10"
                            />
                            <SummaryCard
                                label="Rooms Joined"
                                value={data.summary.totalRoomsJoined}
                                subtext="total joins"
                                icon="🚪"
                                color="from-blue-500/20 to-blue-600/10"
                            />
                            <SummaryCard
                                label="Schedules Created"
                                value={data.summary.schedulesCreated}
                                subtext={`(${data.summary.totalSchedulesCreated.toLocaleString()} total)`}
                                icon="📅"
                                color="from-green-500/20 to-green-600/10"
                            />
                            <SummaryCard
                                label="Schedules Joined"
                                value={data.summary.schedulesJoined}
                                subtext={`(${data.summary.totalSchedulesJoined.toLocaleString()} total)`}
                                icon="✅"
                                color="from-emerald-500/20 to-emerald-600/10"
                            />
                        </div>
                    </section>

                    {/* Wallet & Smart Accounts Section */}
                    <section>
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <span>💳</span>
                            Wallets & Smart Accounts
                        </h2>
                        <div className="space-y-4">
                            {/* Smart Wallet Overview */}
                            <div>
                                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Smart Wallet Overview</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                    <SummaryCard
                                        label="Smart Wallets"
                                        value={data.summary.usersWithSmartWallet}
                                        subtext={`of ${data.summary.totalUsers} users`}
                                        icon="💳"
                                        color="from-emerald-500/20 to-emerald-600/10"
                                    />
                                    <SummaryCard
                                        label="Deployed"
                                        value={data.summary.deployedSmartWallets}
                                        subtext="on-chain"
                                        icon="✅"
                                        color="from-green-500/20 to-green-600/10"
                                    />
                                    <SummaryCard
                                        label="New Wallets"
                                        value={data.summary.walletsCreatedInPeriod}
                                        subtext={`in ${selectedPeriod}`}
                                        icon="✨"
                                        color="from-blue-500/20 to-blue-600/10"
                                    />
                                    <SummaryCard
                                        label="Total Passkeys"
                                        value={data.summary.totalPasskeys}
                                        subtext={`${data.summary.passkeysWithSafeSigners} with signers`}
                                        icon="🔑"
                                        color="from-purple-500/20 to-purple-600/10"
                                    />
                                    <SummaryCard
                                        label="New Passkeys"
                                        value={data.summary.passkeysInPeriod}
                                        subtext={`in ${selectedPeriod}`}
                                        icon="🆕"
                                        color="from-indigo-500/20 to-indigo-600/10"
                                    />
                                    <SummaryCard
                                        label="Embedded"
                                        value={data.summary.embeddedWallets}
                                        subtext="wallets"
                                        icon="🔐"
                                        color="from-cyan-500/20 to-cyan-600/10"
                                    />
                                </div>
                            </div>

                            {/* Transaction Stats */}
                            <div>
                                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Transactions</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                    <SummaryCard
                                        label="Total Transactions"
                                        value={data.summary.totalWalletTransactions}
                                        subtext={`${data.summary.confirmedTransactions} confirmed`}
                                        icon="📊"
                                        color="from-blue-500/20 to-blue-600/10"
                                    />
                                    <SummaryCard
                                        label="Tx in Period"
                                        value={data.summary.walletTxInPeriod}
                                        subtext={`in ${selectedPeriod}`}
                                        icon="📈"
                                        color="from-green-500/20 to-green-600/10"
                                    />
                                    <SummaryCard
                                        label="Total Volume"
                                        value={Math.round(data.summary.totalVolumeUsd)}
                                        subtext="USD"
                                        icon="💰"
                                        color="from-yellow-500/20 to-yellow-600/10"
                                    />
                                    <SummaryCard
                                        label="Volume in Period"
                                        value={Math.round(data.summary.volumeInPeriod)}
                                        subtext={`USD in ${selectedPeriod}`}
                                        icon="💵"
                                        color="from-emerald-500/20 to-emerald-600/10"
                                    />
                                    <SummaryCard
                                        label="Unique Tx Users"
                                        value={data.summary.uniqueTxUsers}
                                        subtext="users with transactions"
                                        icon="👥"
                                        color="from-purple-500/20 to-purple-600/10"
                                    />
                                    <SummaryCard
                                        label="Active Wallets"
                                        value={data.summary.usersWithTxHistory}
                                        subtext="with tx history"
                                        icon="🔥"
                                        color="from-orange-500/20 to-orange-600/10"
                                    />
                                </div>
                            </div>

                            {/* Beta Access Stats */}
                            <div>
                                <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Wallet Beta Access</h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <SummaryCard
                                        label="Beta Applications"
                                        value={data.summary.betaApplicantsCount}
                                        subtext="total applicants"
                                        icon="📝"
                                        color="from-amber-500/20 to-amber-600/10"
                                    />
                                    <SummaryCard
                                        label="Approved"
                                        value={data.summary.betaApprovedCount}
                                        subtext="beta users"
                                        icon="✅"
                                        color="from-green-500/20 to-green-600/10"
                                    />
                                    <SummaryCard
                                        label="Pending"
                                        value={data.summary.betaPendingCount}
                                        subtext="awaiting review"
                                        icon="⏳"
                                        color="from-orange-500/20 to-orange-600/10"
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* AI Agents Section */}
                    <section>
                        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                            <span>🤖</span>
                            AI Agents
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <SummaryCard
                                label="Total Agents"
                                value={data.summary.totalAgents}
                                icon="🤖"
                                color="from-purple-500/20 to-purple-600/10"
                            />
                            <SummaryCard
                                label="New Agents"
                                value={data.summary.newAgentsCount}
                                subtext={`in ${selectedPeriod}`}
                                icon="✨"
                                color="from-indigo-500/20 to-indigo-600/10"
                            />
                            <SummaryCard
                                label="Agent Messages"
                                value={data.summary.agentMessagesInPeriod}
                                subtext={`(${data.summary.totalAgentMessages.toLocaleString()} total)`}
                                icon="💬"
                                color="from-cyan-500/20 to-cyan-600/10"
                            />
                            <SummaryCard
                                label="Unique Users"
                                value={data.summary.uniqueAgentUsers}
                                subtext="using agents"
                                icon="👤"
                                color="from-emerald-500/20 to-emerald-600/10"
                            />
                            <SummaryCard
                                label="Knowledge Items"
                                value={data.summary.knowledgeItemsCount}
                                subtext={`${data.summary.indexedKnowledgeItems} indexed`}
                                icon="📚"
                                color="from-amber-500/20 to-amber-600/10"
                            />
                        </div>
                    </section>

                    {/* Chart Tabs */}
                    <div className="flex gap-2 mb-4">
                        <button
                            onClick={() => setActiveChart("users")}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                activeChart === "users"
                                    ? "bg-[#FF5500] text-white"
                                    : "bg-zinc-800 text-zinc-400 hover:text-white"
                            }`}
                        >
                            User Growth
                        </button>
                        <button
                            onClick={() => setActiveChart("engagement")}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                activeChart === "engagement"
                                    ? "bg-[#FF5500] text-white"
                                    : "bg-zinc-800 text-zinc-400 hover:text-white"
                            }`}
                        >
                            Engagement
                        </button>
                        <button
                            onClick={() => setActiveChart("points")}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                activeChart === "points"
                                    ? "bg-[#FF5500] text-white"
                                    : "bg-zinc-800 text-zinc-400 hover:text-white"
                            }`}
                        >
                            Points
                        </button>
                        <button
                            onClick={() => setActiveChart("agents")}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                activeChart === "agents"
                                    ? "bg-[#FF5500] text-white"
                                    : "bg-zinc-800 text-zinc-400 hover:text-white"
                            }`}
                        >
                            🤖 AI Agents
                        </button>
                        <button
                            onClick={() => setActiveChart("wallets")}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                activeChart === "wallets"
                                    ? "bg-[#FF5500] text-white"
                                    : "bg-zinc-800 text-zinc-400 hover:text-white"
                            }`}
                        >
                            💳 Wallets
                        </button>
                    </div>

                    {/* Main Chart */}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeChart}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800"
                        >
                            {activeChart === "users" && (
                                <>
                                    <h3 className="text-lg font-semibold mb-4">User Growth & Activity</h3>
                                    <div className="h-80">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={data.timeSeries}>
                                                <defs>
                                                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                                                    </linearGradient>
                                                    <linearGradient id="colorLogins" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={CHART_COLORS.secondary} stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor={CHART_COLORS.secondary} stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                                <XAxis 
                                                    dataKey="label" 
                                                    stroke="#666" 
                                                    tick={{ fill: "#999", fontSize: 12 }}
                                                />
                                                <YAxis stroke="#666" tick={{ fill: "#999", fontSize: 12 }} />
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: "#18181b",
                                                        border: "1px solid #333",
                                                        borderRadius: "8px",
                                                    }}
                                                    labelStyle={{ color: "#fff" }}
                                                />
                                                <Legend />
                                                <Area
                                                    type="monotone"
                                                    dataKey="newUsers"
                                                    name="New Users"
                                                    stroke={CHART_COLORS.primary}
                                                    fill="url(#colorUsers)"
                                                    strokeWidth={2}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="logins"
                                                    name="Active Users"
                                                    stroke={CHART_COLORS.secondary}
                                                    fill="url(#colorLogins)"
                                                    strokeWidth={2}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </>
                            )}

                            {activeChart === "engagement" && (
                                <>
                                    <h3 className="text-lg font-semibold mb-4">Engagement Metrics</h3>
                                    <div className="h-80">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={data.timeSeries}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                                <XAxis 
                                                    dataKey="label" 
                                                    stroke="#666"
                                                    tick={{ fill: "#999", fontSize: 12 }}
                                                />
                                                <YAxis stroke="#666" tick={{ fill: "#999", fontSize: 12 }} />
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: "#18181b",
                                                        border: "1px solid #333",
                                                        borderRadius: "8px",
                                                    }}
                                                    labelStyle={{ color: "#fff" }}
                                                />
                                                <Legend />
                                                <Bar
                                                    dataKey="messages"
                                                    name="Messages"
                                                    fill={CHART_COLORS.tertiary}
                                                    radius={[4, 4, 0, 0]}
                                                />
                                                <Bar
                                                    dataKey="friendRequests"
                                                    name="Friend Requests"
                                                    fill={CHART_COLORS.quaternary}
                                                    radius={[4, 4, 0, 0]}
                                                />
                                                <Bar
                                                    dataKey="groups"
                                                    name="Groups Created"
                                                    fill={CHART_COLORS.quinary}
                                                    radius={[4, 4, 0, 0]}
                                                />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </>
                            )}

                            {activeChart === "points" && (
                                <>
                                    <h3 className="text-lg font-semibold mb-4">Points Distribution</h3>
                                    <div className="h-80">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={data.timeSeries}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                                <XAxis 
                                                    dataKey="label" 
                                                    stroke="#666"
                                                    tick={{ fill: "#999", fontSize: 12 }}
                                                />
                                                <YAxis stroke="#666" tick={{ fill: "#999", fontSize: 12 }} />
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: "#18181b",
                                                        border: "1px solid #333",
                                                        borderRadius: "8px",
                                                    }}
                                                    labelStyle={{ color: "#fff" }}
                                                />
                                                <Legend />
                                                <Line
                                                    type="monotone"
                                                    dataKey="points"
                                                    name="Points Awarded"
                                                    stroke={CHART_COLORS.quinary}
                                                    strokeWidth={3}
                                                    dot={{ fill: CHART_COLORS.quinary, strokeWidth: 2 }}
                                                    activeDot={{ r: 8 }}
                                                />
                                                <Line
                                                    type="monotone"
                                                    dataKey="invites"
                                                    name="Invites Used"
                                                    stroke={CHART_COLORS.senary}
                                                    strokeWidth={3}
                                                    dot={{ fill: CHART_COLORS.senary, strokeWidth: 2 }}
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </>
                            )}

                            {activeChart === "agents" && (
                                <>
                                    <h3 className="text-lg font-semibold mb-4">🤖 AI Agents Activity</h3>
                                    <div className="h-80">
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
                                                <XAxis 
                                                    dataKey="label" 
                                                    stroke="#666"
                                                    tick={{ fill: "#999", fontSize: 12 }}
                                                />
                                                <YAxis stroke="#666" tick={{ fill: "#999", fontSize: 12 }} />
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: "#18181b",
                                                        border: "1px solid #333",
                                                        borderRadius: "8px",
                                                    }}
                                                    labelStyle={{ color: "#fff" }}
                                                />
                                                <Legend />
                                                <Area
                                                    type="monotone"
                                                    dataKey="agents"
                                                    name="New Agents"
                                                    stroke="#8B5CF6"
                                                    fill="url(#colorAgents)"
                                                    strokeWidth={2}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="agentChats"
                                                    name="Agent Chats"
                                                    stroke="#06B6D4"
                                                    fill="url(#colorAgentChats)"
                                                    strokeWidth={2}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    {/* Points Breakdown & Top Users */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Points Breakdown Pie Chart */}
                        {data.pointsBreakdown.length > 0 && (
                            <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
                                <h3 className="text-lg font-semibold mb-4">Points Breakdown</h3>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={data.pointsBreakdown}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                label={(props) => {
                                                    const { name, percent } = props as { name?: string; percent?: number };
                                                    const displayName = (name || "").split(" ").slice(0, 2).join(" ");
                                                    const displayPercent = ((percent || 0) * 100).toFixed(0);
                                                    return `${displayName} (${displayPercent}%)`;
                                                }}
                                                outerRadius={80}
                                                fill="#8884d8"
                                                dataKey="points"
                                                nameKey="reason"
                                            >
                                                {data.pointsBreakdown.map((_, index) => (
                                                    <Cell
                                                        key={`cell-${index}`}
                                                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                                                    />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: "#18181b",
                                                    border: "1px solid #333",
                                                    borderRadius: "8px",
                                                }}
                                                formatter={(value) => [`${value} points`, "Points"]}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="mt-4 space-y-2">
                                    {data.pointsBreakdown.map((item, index) => (
                                        <div key={item.reason} className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-3 h-3 rounded-full"
                                                    style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }}
                                                />
                                                <span className="text-zinc-400">{item.reason}</span>
                                            </div>
                                            <span className="font-medium">{item.points.toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Top Users */}
                        <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
                            <h3 className="text-lg font-semibold mb-4">Top Users</h3>
                            <div className="space-y-6">
                                {/* By Points */}
                                <div>
                                    <h4 className="text-sm text-zinc-400 uppercase tracking-wider mb-2">
                                        ⭐ By Points
                                    </h4>
                                    <div className="space-y-2">
                                        {data.topUsers.byPoints.slice(0, 5).map((user, index) => (
                                            <div
                                                key={user.address}
                                                className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="text-zinc-500 w-5">{index + 1}.</span>
                                                    <span className="font-mono text-sm">
                                                        {getDisplayName(user)}
                                                    </span>
                                                </div>
                                                <span className="text-yellow-400 font-medium">
                                                    {user.value.toLocaleString()}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* By Messages */}
                                <div>
                                    <h4 className="text-sm text-zinc-400 uppercase tracking-wider mb-2">
                                        💬 By Messages
                                    </h4>
                                    <div className="space-y-2">
                                        {data.topUsers.byMessages.slice(0, 5).map((user, index) => (
                                            <div
                                                key={user.address}
                                                className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="text-zinc-500 w-5">{index + 1}.</span>
                                                    <span className="font-mono text-sm">
                                                        {getDisplayName(user)}
                                                    </span>
                                                </div>
                                                <span className="text-purple-400 font-medium">
                                                    {user.value.toLocaleString()}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* By Friends */}
                                <div>
                                    <h4 className="text-sm text-zinc-400 uppercase tracking-wider mb-2">
                                        🤝 By Friends
                                    </h4>
                                    <div className="space-y-2">
                                        {data.topUsers.byFriends.slice(0, 5).map((user, index) => (
                                            <div
                                                key={user.address}
                                                className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="text-zinc-500 w-5">{index + 1}.</span>
                                                    <span className="font-mono text-sm">
                                                        {getDisplayName(user)}
                                                    </span>
                                                </div>
                                                <span className="text-pink-400 font-medium">
                                                    {user.value.toLocaleString()}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Wallet Analytics */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Wallet Type Breakdown */}
                        <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
                            <h3 className="text-lg font-semibold mb-4">💳 Auth Method Breakdown</h3>
                            {data.walletTypeBreakdown && data.walletTypeBreakdown.length > 0 ? (
                                <>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={data.walletTypeBreakdown}
                                                    cx="50%"
                                                    cy="50%"
                                                    labelLine={false}
                                                    label={(props) => {
                                                        const { name, percent } = props as { name?: string; percent?: number };
                                                        const displayPercent = ((percent || 0) * 100).toFixed(0);
                                                        return `${name} (${displayPercent}%)`;
                                                    }}
                                                    outerRadius={80}
                                                    fill="#8884d8"
                                                    dataKey="count"
                                                    nameKey="type"
                                                >
                                                    {data.walletTypeBreakdown.map((_, index) => (
                                                        <Cell
                                                            key={`cell-${index}`}
                                                            fill={["#10B981", "#8B5CF6", "#3B82F6", "#F59E0B", "#EC4899"][index % 5]}
                                                        />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: "#18181b",
                                                        border: "1px solid #333",
                                                        borderRadius: "8px",
                                                    }}
                                                    formatter={(value) => [`${value} users`, "Count"]}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="mt-4 space-y-2">
                                        {data.walletTypeBreakdown.map((item, index) => (
                                            <div key={item.type} className="flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-3 h-3 rounded-full"
                                                        style={{ backgroundColor: ["#10B981", "#8B5CF6", "#3B82F6", "#F59E0B", "#EC4899"][index % 5] }}
                                                    />
                                                    <span className="text-zinc-400">
                                                        {item.type === "EOA Wallet" ? "🔗" : item.type === "Passkey" ? "🔑" : item.type === "Email" ? "📧" : item.type === "World ID" ? "🌍" : "☀️"} {item.type}
                                                    </span>
                                                </div>
                                                <span className="font-medium">{item.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <p className="text-zinc-500 text-center py-16">No wallet data yet</p>
                            )}
                        </div>

                        {/* Network Usage Breakdown */}
                        <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
                            <h3 className="text-lg font-semibold mb-4">🌐 Network Usage</h3>
                            {data.networkStats && data.networkStats.length > 0 ? (
                                <>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={data.networkStats} layout="vertical">
                                                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                                <XAxis type="number" stroke="#666" tick={{ fill: "#999", fontSize: 12 }} />
                                                <YAxis 
                                                    type="category" 
                                                    dataKey="chainName" 
                                                    stroke="#666" 
                                                    tick={{ fill: "#999", fontSize: 12 }}
                                                    width={80}
                                                />
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: "#18181b",
                                                        border: "1px solid #333",
                                                        borderRadius: "8px",
                                                    }}
                                                    formatter={(value, name) => [
                                                        name === "transactions" ? `${value} txs` : `$${Number(value).toLocaleString()}`,
                                                        name === "transactions" ? "Transactions" : "Volume"
                                                    ]}
                                                />
                                                <Bar dataKey="transactions" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="mt-4 space-y-2">
                                        {data.networkStats.map((network) => (
                                            <div key={network.chainId} className="flex items-center justify-between text-sm">
                                                <span className="text-zinc-400">{network.chainName}</span>
                                                <div className="flex items-center gap-4">
                                                    <span className="text-blue-400">{network.transactions} txs</span>
                                                    <span className="text-green-400">${network.volumeUsd.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <p className="text-zinc-500 text-center py-16">No transaction data yet</p>
                            )}
                        </div>
                    </div>

                    {/* Recent Smart Wallet Users */}
                    <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
                        <h3 className="text-lg font-semibold mb-4">🆕 Recent Smart Wallet Users</h3>
                        <div className="space-y-3">
                            {!data.recentSmartWalletUsers || data.recentSmartWalletUsers.length === 0 ? (
                                <p className="text-zinc-500 text-center py-8">No smart wallet users yet</p>
                            ) : (
                                data.recentSmartWalletUsers.slice(0, 10).map((user, index) => (
                                    <div
                                        key={user.address}
                                        className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-4 py-3"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-zinc-500 w-5 text-sm">{index + 1}.</span>
                                            <span className="text-lg">
                                                {user.walletType === "passkey" ? "🔑" : user.walletType === "email" ? "📧" : user.walletType?.includes("world") ? "🌍" : "🔗"}
                                            </span>
                                            <div>
                                                <p className="font-medium">
                                                    {user.username ? `@${user.username}` : user.ensName || `${user.address.slice(0, 6)}...${user.address.slice(-4)}`}
                                                </p>
                                                <p className="text-xs text-zinc-500 font-mono">
                                                    Safe: {user.smartWalletAddress.slice(0, 6)}...{user.smartWalletAddress.slice(-4)}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-xs text-zinc-400">
                                            {new Date(user.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Agent Analytics */}
                    {data.summary.totalAgents > 0 && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Agent Visibility Breakdown */}
                            {data.agentVisibilityBreakdown.length > 0 && (
                                <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
                                    <h3 className="text-lg font-semibold mb-4">🤖 Agent Visibility</h3>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={data.agentVisibilityBreakdown}
                                                    cx="50%"
                                                    cy="50%"
                                                    labelLine={false}
                                                    label={(props) => {
                                                        const { name, percent } = props as { name?: string; percent?: number };
                                                        const displayPercent = ((percent || 0) * 100).toFixed(0);
                                                        return `${name} (${displayPercent}%)`;
                                                    }}
                                                    outerRadius={80}
                                                    fill="#8884d8"
                                                    dataKey="count"
                                                    nameKey="visibility"
                                                >
                                                    {data.agentVisibilityBreakdown.map((_, index) => (
                                                        <Cell
                                                            key={`cell-${index}`}
                                                            fill={["#6B7280", "#3B82F6", "#10B981"][index % 3]}
                                                        />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: "#18181b",
                                                        border: "1px solid #333",
                                                        borderRadius: "8px",
                                                    }}
                                                    formatter={(value) => [`${value} agents`, "Count"]}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                    <div className="mt-4 space-y-2">
                                        {data.agentVisibilityBreakdown.map((item, index) => (
                                            <div key={item.visibility} className="flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-3 h-3 rounded-full"
                                                        style={{ backgroundColor: ["#6B7280", "#3B82F6", "#10B981"][index % 3] }}
                                                    />
                                                    <span className="text-zinc-400">
                                                        {item.visibility === "Private" ? "🔒" : item.visibility === "Friends" ? "👥" : "🌍"} {item.visibility}
                                                    </span>
                                                </div>
                                                <span className="font-medium">{item.count}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Top Agents */}
                            <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
                                <h3 className="text-lg font-semibold mb-4">🏆 Top Agents by Messages</h3>
                                <div className="space-y-3">
                                    {data.topAgents.byMessages.length === 0 ? (
                                        <p className="text-zinc-500 text-center py-8">No agent activity yet</p>
                                    ) : (
                                        data.topAgents.byMessages.slice(0, 10).map((agent, index) => (
                                            <div
                                                key={agent.id}
                                                className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-4 py-3"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="text-zinc-500 w-5 text-sm">{index + 1}.</span>
                                                    <span className="text-2xl">{agent.emoji}</span>
                                                    <div>
                                                        <p className="font-medium">{agent.name}</p>
                                                        <p className="text-xs text-zinc-500">
                                                            {agent.visibility === "private" ? "🔒" : agent.visibility === "friends" ? "👥" : "🌍"} {agent.ownerAddress.slice(0, 6)}...{agent.ownerAddress.slice(-4)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="text-cyan-400 font-medium">
                                                    {agent.value.toLocaleString()} msgs
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Summary Card Component
function SummaryCard({
    label,
    value,
    subtext,
    icon,
    color,
}: {
    label: string;
    value: number;
    subtext?: string;
    icon: string;
    color: string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-gradient-to-br ${color} border border-zinc-800 rounded-2xl p-4`}
        >
            <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{icon}</span>
                <span className="text-xs text-zinc-400 uppercase tracking-wider">{label}</span>
            </div>
            <p className="text-2xl font-bold">{value.toLocaleString()}</p>
            {subtext && (
                <p className="text-xs text-zinc-500 mt-1">{subtext}</p>
            )}
        </motion.div>
    );
}

