"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { type UserSettings } from "@/hooks/useUserSettings";
import { useCalendar } from "@/hooks/useCalendar";
import { AvailabilityWindowsModal } from "./AvailabilityWindowsModal";
import { supabase } from "@/config/supabase";

// Supported payment networks
const PAYMENT_NETWORKS = [
    { value: "base", label: "Base", icon: "🔵" },
    { value: "ethereum", label: "Ethereum", icon: "⟠" },
    { value: "arbitrum", label: "Arbitrum", icon: "🔷" },
    { value: "optimism", label: "Optimism", icon: "🔴" },
    { value: "polygon", label: "Polygon", icon: "🟣" },
    { value: "base-sepolia", label: "Base Sepolia (Testnet)", icon: "🧪" },
];

type SettingsModalProps = {
    isOpen: boolean;
    onClose: () => void;
    settings: UserSettings;
    onToggleSound: () => void;
    // Censorship resistance props
    onToggleDecentralizedCalls: () => void;
    isHuddle01Configured: boolean;
    // Public profile props
    onTogglePublicLanding: () => void;
    // Push notification props
    pushSupported: boolean;
    pushPermission: NotificationPermission;
    pushSubscribed: boolean;
    pushLoading: boolean;
    pushError: string | null;
    onEnablePush: () => Promise<boolean>;
    onDisablePush: () => Promise<boolean>;
    // Calendar props
    userAddress: string | null;
    // Status props
    onOpenStatusModal: () => void;
    // Invites props
    availableInvites: number;
    usedInvites: number;
    onOpenInvitesModal: () => void;
};

export function SettingsModal({
    isOpen,
    onClose,
    settings,
    onToggleSound,
    onToggleDecentralizedCalls,
    isHuddle01Configured,
    onTogglePublicLanding,
    pushSupported,
    pushPermission,
    pushSubscribed,
    pushLoading,
    pushError,
    onEnablePush,
    onDisablePush,
    userAddress,
    onOpenStatusModal,
    availableInvites,
    usedInvites,
    onOpenInvitesModal,
}: SettingsModalProps) {
    const handlePushToggle = async () => {
        // Prevent double-clicks by checking loading state
        if (pushLoading) return;
        
        if (pushSubscribed) {
            await onDisablePush();
        } else {
            await onEnablePush();
        }
    };

    // Calendar hook
    const {
        connection,
        isConnected,
        isLoading: calendarLoading,
        error: calendarError,
        availabilityWindows,
        connect: connectCalendar,
        disconnect: disconnectCalendar,
    } = useCalendar(userAddress);

    const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    
    // Scheduling settings state
    const [schedulingEnabled, setSchedulingEnabled] = useState(false);
    const [schedulingSlug, setSchedulingSlug] = useState("");
    const [schedulingTitle, setSchedulingTitle] = useState("");
    const [schedulingBio, setSchedulingBio] = useState("");
    const [schedulingFreeEnabled, setSchedulingFreeEnabled] = useState(true);
    const [schedulingPaidEnabled, setSchedulingPaidEnabled] = useState(false);
    const [schedulingFreeDuration, setSchedulingFreeDuration] = useState(15);
    const [schedulingPaidDuration, setSchedulingPaidDuration] = useState(30);
    const [schedulingPrice, setSchedulingPrice] = useState(0);
    const [schedulingWallet, setSchedulingWallet] = useState("");
    const [schedulingNetwork, setSchedulingNetwork] = useState("base");
    const [schedulingLoading, setSchedulingLoading] = useState(false);
    const [schedulingError, setSchedulingError] = useState<string | null>(null);
    const [schedulingSaved, setSchedulingSaved] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    
    // Load scheduling settings
    useEffect(() => {
        if (userAddress && isOpen) {
            fetch(`/api/scheduling/settings?userAddress=${encodeURIComponent(userAddress)}`)
                .then((res) => res.json())
                .then((data) => {
                    if (data.scheduling_enabled !== undefined) {
                        setSchedulingEnabled(data.scheduling_enabled);
                        setSchedulingSlug(data.scheduling_slug || "");
                        setSchedulingTitle(data.scheduling_title || "");
                        setSchedulingBio(data.scheduling_bio || "");
                        setSchedulingFreeEnabled(data.scheduling_free_enabled ?? true);
                        setSchedulingPaidEnabled(data.scheduling_paid_enabled ?? false);
                        setSchedulingFreeDuration(data.scheduling_free_duration_minutes || 15);
                        setSchedulingPaidDuration(data.scheduling_paid_duration_minutes || 30);
                        setSchedulingPrice(data.scheduling_price_cents || 0);
                        setSchedulingWallet(data.scheduling_wallet_address || "");
                        setSchedulingNetwork(data.scheduling_network || "base");
                    }
                })
                .catch((err) => console.error("[Settings] Failed to load scheduling settings:", err));
        }
    }, [userAddress, isOpen]);
    
    const handleSaveSchedulingSettings = async () => {
        if (!userAddress) return;
        
        setSchedulingLoading(true);
        setSchedulingError(null);
        setSchedulingSaved(false);
        
        try {
            const res = await fetch("/api/scheduling/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAddress,
                    scheduling_enabled: schedulingEnabled,
                    scheduling_slug: schedulingSlug || null,
                    scheduling_title: schedulingTitle || null,
                    scheduling_bio: schedulingBio || null,
                    scheduling_free_enabled: schedulingFreeEnabled,
                    scheduling_paid_enabled: schedulingPaidEnabled,
                    scheduling_free_duration_minutes: schedulingFreeDuration,
                    scheduling_paid_duration_minutes: schedulingPaidDuration,
                    scheduling_price_cents: schedulingPrice,
                    scheduling_wallet_address: schedulingWallet || null,
                    scheduling_network: schedulingNetwork,
                }),
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || "Failed to save scheduling settings");
            }
            
            setSchedulingSaved(true);
            setTimeout(() => setSchedulingSaved(false), 2000);
        } catch (err) {
            setSchedulingError(err instanceof Error ? err.message : "Failed to save settings");
        } finally {
            setSchedulingLoading(false);
        }
    };
    
    const copySchedulingLink = () => {
        const link = schedulingSlug 
            ? `${window.location.origin}/schedule/${schedulingSlug}`
            : `${window.location.origin}/schedule/${userAddress}`;
        navigator.clipboard.writeText(link);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
    };

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[calc(100%-2rem)] sm:max-w-md sm:max-h-[calc(100vh-4rem)] z-50 flex flex-col"
                    >
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-full sm:max-h-[calc(100vh-4rem)]">
                            {/* Header - Fixed */}
                            <div className="flex items-center justify-between p-6 pb-4 border-b border-zinc-800/50 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center">
                                        <svg
                                            className="w-5 h-5 text-white"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                            />
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                            />
                                        </svg>
                                    </div>
                                    <h2 className="text-xl font-bold text-white">
                                        Settings
                                    </h2>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                                >
                                    <svg
                                        className="w-4 h-4"
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

                            {/* Settings List - Scrollable */}
                            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                                {/* Status & Invites Section */}
                                <div className="mb-4">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
                                        Profile
                                    </h3>

                                    {/* Status */}
                                    <button
                                        onClick={() => {
                                            onClose();
                                            onOpenStatusModal();
                                        }}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-zinc-700/50 flex items-center justify-center text-lg">
                                                {settings.statusEmoji}
                                            </div>
                                            <div className="text-left">
                                                <p className="text-white font-medium">Status</p>
                                                <p className="text-zinc-500 text-xs truncate max-w-[150px]">
                                                    {settings.statusText || "Set your status"}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {settings.isDnd && (
                                                <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                                                    DND
                                                </span>
                                            )}
                                            <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </button>

                                    {/* Invites */}
                                    <button
                                        onClick={() => {
                                            onClose();
                                            onOpenInvitesModal();
                                        }}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors mt-2"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-[#FF5500]/20 flex items-center justify-center">
                                                <svg className="w-4 h-4 text-[#FFBBA7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                                </svg>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-white font-medium">Invites</p>
                                                <p className="text-zinc-500 text-xs">
                                                    Earn 100 pts per referral
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {availableInvites > 0 && (
                                                <span className="text-xs bg-[#FF5500]/20 text-[#FFBBA7] px-2 py-0.5 rounded-full font-medium">
                                                    {availableInvites}
                                                </span>
                                            )}
                                            <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </button>
                                </div>

                                {/* Censorship Resistance Section */}
                                <div className="mb-4">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
                                        Privacy & Security
                                    </h3>

                                    {/* Censorship Resistance Toggle */}
                                    <button
                                        onClick={onToggleDecentralizedCalls}
                                        disabled={!isHuddle01Configured && !settings.decentralizedCalls}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                                settings.decentralizedCalls
                                                    ? "bg-emerald-500/20"
                                                    : "bg-zinc-700/50"
                                            }`}>
                                                <svg
                                                    className={`w-4 h-4 transition-colors ${
                                                        settings.decentralizedCalls
                                                            ? "text-emerald-400"
                                                            : "text-zinc-500"
                                                    }`}
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                                    />
                                                </svg>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-white font-medium">
                                                    Censorship Resistance
                                                </p>
                                                <p className="text-zinc-500 text-xs">
                                                    {settings.decentralizedCalls
                                                        ? "Using Web3 Provider"
                                                        : "Using Centralized Provider"}
                                                </p>
                                            </div>
                                        </div>
                                        <div
                                            className={`w-11 h-6 rounded-full transition-colors relative ${
                                                settings.decentralizedCalls
                                                    ? "bg-emerald-500"
                                                    : "bg-zinc-700"
                                            }`}
                                        >
                                            <div
                                                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                                    settings.decentralizedCalls
                                                        ? "translate-x-5"
                                                        : "translate-x-0.5"
                                                }`}
                                            />
                                        </div>
                                    </button>
                                    {!isHuddle01Configured && (
                                        <p className="text-amber-500/80 text-xs mt-2 px-4">
                                            Set NEXT_PUBLIC_HUDDLE01_PROJECT_ID and NEXT_PUBLIC_HUDDLE01_API_KEY to enable
                                        </p>
                                    )}

                                    {/* Public Profile Toggle */}
                                    <button
                                        onClick={onTogglePublicLanding}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors mt-2"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                                settings.publicLandingEnabled
                                                    ? "bg-blue-500/20"
                                                    : "bg-zinc-700/50"
                                            }`}>
                                                <svg
                                                    className={`w-4 h-4 transition-colors ${
                                                        settings.publicLandingEnabled
                                                            ? "text-blue-400"
                                                            : "text-zinc-500"
                                                    }`}
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                                    />
                                                </svg>
                                            </div>
                                            <div className="text-left">
                                                <p className="text-white font-medium">
                                                    Enable Public Profile
                                                </p>
                                                <p className="text-zinc-500 text-xs">
                                                    {settings.publicLandingEnabled
                                                        ? "Your profile is public at /user/[address]"
                                                        : "Create a public profile page"}
                                                </p>
                                            </div>
                                        </div>
                                        <div
                                            className={`w-11 h-6 rounded-full transition-colors relative ${
                                                settings.publicLandingEnabled
                                                    ? "bg-blue-500"
                                                    : "bg-zinc-700"
                                            }`}
                                        >
                                            <div
                                                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                                    settings.publicLandingEnabled
                                                        ? "translate-x-5"
                                                        : "translate-x-0.5"
                                                }`}
                                            />
                                        </div>
                                    </button>

                                    {/* Copy Profile Link - Only show when enabled */}
                                    {settings.publicLandingEnabled && userAddress && (
                                        <div className="mt-3 px-4">
                                            <button
                                                onClick={async () => {
                                                    if (!userAddress) {
                                                        console.error("[Settings] No user address available");
                                                        return;
                                                    }
                                                    
                                                    // Try to get username or ENS for prettier URL
                                                    let profilePath = userAddress.toLowerCase();
                                                    
                                                    // Fetch username (non-blocking)
                                                    if (supabase) {
                                                        try {
                                                            const { data: usernameData } = await supabase
                                                                .from("shout_usernames")
                                                                .select("username")
                                                                .eq("wallet_address", userAddress.toLowerCase())
                                                                .maybeSingle();
                                                            
                                                            if (usernameData?.username) {
                                                                profilePath = usernameData.username;
                                                            } else {
                                                                // Try ENS
                                                                const { data: userData } = await supabase
                                                                    .from("shout_users")
                                                                    .select("ens_name")
                                                                    .eq("wallet_address", userAddress.toLowerCase())
                                                                    .maybeSingle();
                                                                
                                                                if (userData?.ens_name) {
                                                                    profilePath = userData.ens_name;
                                                                }
                                                            }
                                                        } catch (dbErr) {
                                                            console.error("[Settings] DB error:", dbErr);
                                                            // Continue with wallet address as fallback
                                                        }
                                                    }
                                                    
                                                    // Use exact same method as working scheduling link
                                                    const profileUrl = `${window.location.origin}/user/${profilePath}`;
                                                    navigator.clipboard.writeText(profileUrl);
                                                    setCopiedLink(true);
                                                    setTimeout(() => setCopiedLink(false), 2000);
                                                }}
                                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl hover:bg-blue-500/20 transition-colors text-blue-400"
                                            >
                                                {copiedLink ? (
                                                    <>
                                                        <svg
                                                            className="w-4 h-4"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M5 13l4 4L19 7"
                                                            />
                                                        </svg>
                                                        <span className="text-sm font-medium">Copied!</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg
                                                            className="w-4 h-4"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                                            />
                                                        </svg>
                                                        <span className="text-sm font-medium">Copy Profile Link</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Sound & Notifications Section */}
                                <div className="mb-4">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
                                        Sound & Notifications
                                    </h3>

                                    {/* Sound Effects Toggle */}
                                    <button
                                        onClick={onToggleSound}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl">
                                                {settings.soundEnabled
                                                    ? "🔊"
                                                    : "🔇"}
                                            </span>
                                            <div className="text-left">
                                                <p className="text-white font-medium">
                                                    Sound Effects
                                                </p>
                                                <p className="text-zinc-500 text-xs">
                                                    Message and call sounds
                                                </p>
                                            </div>
                                        </div>
                                        <div
                                            className={`w-11 h-6 rounded-full transition-colors relative ${
                                                settings.soundEnabled
                                                    ? "bg-emerald-500"
                                                    : "bg-zinc-700"
                                            }`}
                                        >
                                            <div
                                                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                                    settings.soundEnabled
                                                        ? "translate-x-5"
                                                        : "translate-x-0.5"
                                                }`}
                                            />
                                        </div>
                                    </button>

                                    {/* Push Notifications Toggle */}
                                    {pushSupported && (
                                        <div className="mt-2">
                                            <button
                                                onClick={handlePushToggle}
                                                disabled={
                                                    pushLoading ||
                                                    pushPermission === "denied"
                                                }
                                                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xl">
                                                        {pushSubscribed
                                                            ? "🔔"
                                                            : "🔕"}
                                                    </span>
                                                    <div className="text-left">
                                                        <p className="text-white font-medium">
                                                            Push Notifications
                                                        </p>
                                                        <p className="text-zinc-500 text-xs">
                                                            {pushPermission ===
                                                            "denied"
                                                                ? "Blocked in browser settings"
                                                                : "Get notified of incoming calls"}
                                                        </p>
                                                    </div>
                                                </div>
                                                {pushLoading ? (
                                                    <div className="w-5 h-5 border-2 border-[#FB8D22] border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <div
                                                        className={`w-11 h-6 rounded-full transition-colors relative ${
                                                            pushSubscribed
                                                                ? "bg-[#FB8D22]"
                                                                : "bg-zinc-700"
                                                        }`}
                                                    >
                                                        <div
                                                            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                                                pushSubscribed
                                                                    ? "translate-x-5"
                                                                    : "translate-x-0.5"
                                                            }`}
                                                        />
                                                    </div>
                                                )}
                                            </button>
                                            {pushError && (
                                                <p className="text-red-400 text-xs mt-2 px-4">
                                                    {pushError}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Availability Section */}
                                <div className="mb-4">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
                                        Availability
                                    </h3>

                                    {/* Set Availability Windows */}
                                    <button
                                        onClick={() => setShowAvailabilityModal(true)}
                                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-xl">🕐</span>
                                            <div className="text-left">
                                                <p className="text-white font-medium">
                                                    Availability Windows
                                                </p>
                                                <p className="text-zinc-500 text-xs">
                                                    {availabilityWindows.length > 0 
                                                        ? `${availabilityWindows.length} time slot${availabilityWindows.length > 1 ? "s" : ""} configured`
                                                        : "Set when you're available for calls"
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {availabilityWindows.length > 0 && (
                                                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
                                                    {availabilityWindows.length}
                                                </span>
                                            )}
                                            <svg
                                                className="w-5 h-5 text-zinc-400"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M9 5l7 7-7 7"
                                                />
                                            </svg>
                                        </div>
                                    </button>
                                </div>

                                {/* Google Calendar Integration Section */}
                                <div className="mb-4">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
                                        Google Calendar Sync
                                    </h3>

                                    {/* Google Calendar Connection */}
                                    <div className="space-y-2">
                                        {isConnected ? (
                                            <div className="px-4 py-3 rounded-xl bg-zinc-800/50 border border-emerald-500/20">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                                            <svg
                                                                className="w-4 h-4 text-emerald-400"
                                                                fill="none"
                                                                viewBox="0 0 24 24"
                                                                stroke="currentColor"
                                                            >
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={2}
                                                                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                                                />
                                                            </svg>
                                                        </div>
                                                        <div className="text-left flex-1">
                                                            <p className="text-white font-medium text-sm">
                                                                Google Calendar
                                                            </p>
                                                            <p className="text-zinc-500 text-xs">
                                                                {connection?.calendar_email || "Connected"}
                                                            </p>
                                                            {connection?.last_sync_at && (
                                                                <p className="text-zinc-600 text-xs mt-0.5">
                                                                    Last synced: {new Date(connection.last_sync_at).toLocaleDateString()}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                        <span className="text-emerald-400 text-xs">Connected</span>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={connectCalendar}
                                                        disabled={calendarLoading}
                                                        className="flex-1 px-3 py-2 text-xs rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 transition-colors disabled:opacity-50"
                                                        title="Reconnect calendar"
                                                    >
                                                        {calendarLoading ? "..." : "Reconnect"}
                                                    </button>
                                                    <button
                                                        onClick={disconnectCalendar}
                                                        disabled={calendarLoading}
                                                        className="flex-1 px-3 py-2 text-xs rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors disabled:opacity-50"
                                                        title="Disconnect calendar"
                                                    >
                                                        {calendarLoading ? "..." : "Disconnect"}
                                                    </button>
                                                </div>
                                                <p className="text-zinc-600 text-xs mt-2">
                                                    Syncs busy times to prevent double-booking
                                                </p>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={connectCalendar}
                                                disabled={calendarLoading}
                                                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-zinc-700/50 flex items-center justify-center">
                                                        <svg
                                                            className="w-4 h-4 text-zinc-500"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                                            />
                                                        </svg>
                                                    </div>
                                                    <div className="text-left">
                                                        <p className="text-white font-medium">
                                                            Connect Google Calendar
                                                        </p>
                                                        <p className="text-zinc-500 text-xs">
                                                            Optional: Sync busy times to prevent conflicts
                                                        </p>
                                                    </div>
                                                </div>
                                                {calendarLoading ? (
                                                    <div className="w-5 h-5 border-2 border-[#FB8D22] border-t-transparent rounded-full animate-spin" />
                                                ) : (
                                                    <svg
                                                        className="w-5 h-5 text-zinc-400"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M9 5l7 7-7 7"
                                                        />
                                                    </svg>
                                                )}
                                            </button>
                                        )}
                                        {calendarError && (
                                            <div className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30">
                                                <p className="text-red-400 text-xs">
                                                    {calendarError}
                                                </p>
                                                {calendarError.includes("Database tables not found") && (
                                                    <p className="text-red-300 text-xs mt-1">
                                                        Please run the <code className="bg-red-500/20 px-1 rounded">google_calendar.sql</code> migration in Supabase.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Scheduling Settings Section */}
                                <div className="mb-4">
                                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">
                                        Scheduling
                                    </h3>

                                    {/* Enable Scheduling Toggle */}
                                    <div className="mb-3">
                                        <button
                                            onClick={() => setSchedulingEnabled(!schedulingEnabled)}
                                            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl">📅</span>
                                                <div className="text-left">
                                                    <p className="text-white font-medium">
                                                        Enable Scheduling
                                                    </p>
                                                    <p className="text-zinc-500 text-xs">
                                                        Get a public booking page
                                                    </p>
                                                </div>
                                            </div>
                                            <div
                                                className={`w-11 h-6 rounded-full transition-colors relative ${
                                                    schedulingEnabled
                                                        ? "bg-emerald-500"
                                                        : "bg-zinc-700"
                                                }`}
                                            >
                                                <div
                                                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                                                        schedulingEnabled
                                                            ? "translate-x-5"
                                                            : "translate-x-0.5"
                                                    }`}
                                                />
                                            </div>
                                        </button>
                                    </div>

                                    {/* Scheduling Configuration */}
                                    {schedulingEnabled && (
                                        <div className="space-y-4 px-4 py-4 rounded-xl bg-zinc-800/30 border border-zinc-700">
                                            {/* Your Scheduling Link */}
                                            <div className="bg-zinc-900/50 rounded-lg p-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs text-zinc-500 mb-1">Your booking link</p>
                                                        <p className="text-sm text-orange-400 font-mono truncate">
                                                            spritz.chat/schedule/{schedulingSlug || (userAddress ? `${userAddress.slice(0, 6)}...` : "you")}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={copySchedulingLink}
                                                        className="shrink-0 px-3 py-1.5 rounded-lg bg-orange-500/20 text-orange-400 text-xs font-medium hover:bg-orange-500/30 transition-colors"
                                                    >
                                                        {linkCopied ? "Copied!" : "Copy"}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Custom Slug */}
                                            <div>
                                                <label className="block text-sm text-zinc-400 mb-1">
                                                    Custom URL (optional)
                                                </label>
                                                <div className="flex items-center gap-0">
                                                    <span className="px-3 py-2 rounded-l-lg bg-zinc-900/50 border border-r-0 border-zinc-700 text-zinc-500 text-sm">
                                                        /schedule/
                                                    </span>
                                                    <input
                                                        type="text"
                                                        value={schedulingSlug}
                                                        onChange={(e) => setSchedulingSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                                                        placeholder="yourname"
                                                        className="flex-1 px-3 py-2 rounded-r-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 text-sm"
                                                    />
                                                </div>
                                            </div>

                                            {/* Page Title */}
                                            <div>
                                                <label className="block text-sm text-zinc-400 mb-1">
                                                    Page Title
                                                </label>
                                                <input
                                                    type="text"
                                                    value={schedulingTitle}
                                                    onChange={(e) => setSchedulingTitle(e.target.value)}
                                                    placeholder="Book a call with me"
                                                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 text-sm"
                                                />
                                            </div>

                                            {/* Bio */}
                                            <div>
                                                <label className="block text-sm text-zinc-400 mb-1">
                                                    Short Bio
                                                </label>
                                                <textarea
                                                    value={schedulingBio}
                                                    onChange={(e) => setSchedulingBio(e.target.value)}
                                                    placeholder="Tell visitors about yourself..."
                                                    rows={2}
                                                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 text-sm resize-none"
                                                />
                                            </div>

                                            {/* Meeting Types */}
                                            <div className="space-y-3">
                                                <p className="text-sm text-zinc-400 font-medium">Meeting Types</p>
                                                
                                                {/* Free Option */}
                                                <div className={`rounded-lg border transition-colors ${schedulingFreeEnabled ? "bg-emerald-500/10 border-emerald-500/30" : "bg-zinc-900/50 border-zinc-700"}`}>
                                                    <button
                                                        onClick={() => setSchedulingFreeEnabled(!schedulingFreeEnabled)}
                                                        className="w-full flex items-center justify-between px-3 py-2.5"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${schedulingFreeEnabled ? "bg-emerald-500 border-emerald-500" : "border-zinc-600"}`}>
                                                                {schedulingFreeEnabled && (
                                                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                            <span className="text-white text-sm font-medium">Free Consultation</span>
                                                        </div>
                                                        <span className="text-emerald-400 text-xs font-medium">Free</span>
                                                    </button>
                                                    {schedulingFreeEnabled && (
                                                        <div className="px-3 pb-3 pt-1">
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="number"
                                                                    min="5"
                                                                    max="60"
                                                                    step="5"
                                                                    value={schedulingFreeDuration}
                                                                    onChange={(e) => setSchedulingFreeDuration(parseInt(e.target.value) || 15)}
                                                                    className="w-20 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-orange-500"
                                                                />
                                                                <span className="text-zinc-500 text-xs">minutes</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Paid Option */}
                                                <div className={`rounded-lg border transition-colors ${schedulingPaidEnabled ? "bg-orange-500/10 border-orange-500/30" : "bg-zinc-900/50 border-zinc-700"}`}>
                                                    <button
                                                        onClick={() => setSchedulingPaidEnabled(!schedulingPaidEnabled)}
                                                        className="w-full flex items-center justify-between px-3 py-2.5"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${schedulingPaidEnabled ? "bg-orange-500 border-orange-500" : "border-zinc-600"}`}>
                                                                {schedulingPaidEnabled && (
                                                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                            <span className="text-white text-sm font-medium">Priority Session</span>
                                                        </div>
                                                        <span className="text-orange-400 text-xs font-medium">Paid</span>
                                                    </button>
                                                    {schedulingPaidEnabled && (
                                                        <div className="px-3 pb-3 pt-1 space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="number"
                                                                    min="5"
                                                                    max="120"
                                                                    step="5"
                                                                    value={schedulingPaidDuration}
                                                                    onChange={(e) => setSchedulingPaidDuration(parseInt(e.target.value) || 30)}
                                                                    className="w-20 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-orange-500"
                                                                />
                                                                <span className="text-zinc-500 text-xs">minutes</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-zinc-500 text-xs">$</span>
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    step="1"
                                                                    value={schedulingPrice / 100}
                                                                    onChange={(e) => setSchedulingPrice(Math.round(parseFloat(e.target.value) * 100) || 0)}
                                                                    placeholder="25"
                                                                    className="w-20 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-orange-500"
                                                                />
                                                                <span className="text-zinc-500 text-xs">USDC</span>
                                                            </div>
                                                            {/* Network selector */}
                                                            <div>
                                                                <label className="block text-zinc-500 text-xs mb-1">Payment Network</label>
                                                                <select
                                                                    value={schedulingNetwork}
                                                                    onChange={(e) => setSchedulingNetwork(e.target.value)}
                                                                    className="w-full px-2 py-1.5 rounded bg-zinc-900 border border-zinc-700 text-white text-sm focus:outline-none focus:border-orange-500"
                                                                >
                                                                    {PAYMENT_NETWORKS.map((network) => (
                                                                        <option key={network.value} value={network.value}>
                                                                            {network.icon} {network.label}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                            <input
                                                                type="text"
                                                                value={schedulingWallet}
                                                                onChange={(e) => setSchedulingWallet(e.target.value)}
                                                                placeholder="Payment wallet (0x...)"
                                                                className="w-full px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-white placeholder-zinc-600 text-xs font-mono focus:outline-none focus:border-orange-500"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Save Button */}
                                            <button
                                                onClick={handleSaveSchedulingSettings}
                                                disabled={schedulingLoading || (schedulingPaidEnabled && schedulingPrice > 0 && !schedulingWallet) || (!schedulingFreeEnabled && !schedulingPaidEnabled)}
                                                className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium hover:from-orange-400 hover:to-amber-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                            >
                                                {schedulingLoading ? (
                                                    <>
                                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                        Saving...
                                                    </>
                                                ) : schedulingSaved ? (
                                                    <>
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        Saved!
                                                    </>
                                                ) : (
                                                    "Save Scheduling Settings"
                                                )}
                                            </button>

                                            {schedulingError && (
                                                <p className="text-red-400 text-xs text-center">
                                                    {schedulingError}
                                                </p>
                                            )}

                                            {!schedulingFreeEnabled && !schedulingPaidEnabled && (
                                                <p className="text-amber-500/80 text-xs text-center">
                                                    Enable at least one meeting type
                                                </p>
                                            )}

                                            {schedulingEnabled && !isConnected && (
                                                <p className="text-zinc-500 text-xs text-center">
                                                    💡 Connect Google Calendar above to sync availability
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* App Info */}
                                <div className="pt-4 border-t border-zinc-800">
                                    <p className="text-zinc-600 text-xs text-center">
                                        Spritz v1.0 • PWA App
                                    </p>
                                </div>
                            </div>

                            {/* Done Button - Fixed Footer */}
                            <div className="p-6 pt-4 border-t border-zinc-800/50 shrink-0">
                                <button
                                    onClick={onClose}
                                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF5500] text-white font-medium transition-all hover:shadow-lg hover:shadow-[#FB8D22]/25"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
            
            {/* Availability Windows Modal */}
            <AvailabilityWindowsModal
                isOpen={showAvailabilityModal}
                onClose={() => setShowAvailabilityModal(false)}
                userAddress={userAddress}
            />
        </>
    );
}


