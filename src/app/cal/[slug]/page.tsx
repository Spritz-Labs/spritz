"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { format, addDays, startOfDay, isSameDay } from "date-fns";
import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";
import { getDayOfWeekInTimezone } from "@/lib/timezone";
import { useAccount, useDisconnect, useSendTransaction, useWaitForTransactionReceipt, useSwitchChain, useReadContract, useConnect, useReconnect } from "wagmi";
import { createPublicClient, http, parseUnits, encodeFunctionData, formatUnits } from "viem";
import { injected, coinbaseWallet } from "wagmi/connectors";
import { base, baseSepolia, mainnet, arbitrum, optimism, polygon } from "wagmi/chains";
import { normalize } from "viem/ens";

// Public client for ENS resolution
const ensClient = createPublicClient({
    chain: mainnet,
    transport: http("https://eth.llamarpc.com"),
});

type ScheduleType = "free" | "paid";

type SchedulingProfile = {
    profile: {
        walletAddress: string;
        displayName: string;
        username: string | null;
        ensName: string | null;
        avatarUrl: string | null;
        bio: string | null;
        title: string;
        slug: string;
    };
    scheduling: {
        freeEnabled: boolean;
        paidEnabled: boolean;
        freeDuration: number;
        paidDuration: number;
        priceCents: number;
        network: string;
        payToAddress: string;
        bufferMinutes: number;
        advanceNoticeHours: number;
    };
    availability: {
        windows: Array<{
            dayOfWeek: number;
            startTime: string;
            endTime: string;
        }>;
        timezone: string;
    };
};

type TimeSlot = {
    start: string;
    end: string;
};

// USDC contract addresses by network
const USDC_ADDRESSES: Record<string, `0x${string}`> = {
    "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "ethereum": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "arbitrum": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    "optimism": "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    "polygon": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
};

// Chain IDs by network name
const CHAIN_IDS: Record<string, number> = {
    "base": base.id,
    "base-sepolia": baseSepolia.id,
    "ethereum": mainnet.id,
    "arbitrum": arbitrum.id,
    "optimism": optimism.id,
    "polygon": polygon.id,
};

// Network display names
const NETWORK_NAMES: Record<string, string> = {
    "base": "Base",
    "base-sepolia": "Base Sepolia",
    "ethereum": "Ethereum",
    "arbitrum": "Arbitrum",
    "optimism": "Optimism",
    "polygon": "Polygon",
};

// Block explorer URLs
const EXPLORER_URLS: Record<string, string> = {
    "base": "https://basescan.org",
    "base-sepolia": "https://sepolia.basescan.org",
    "ethereum": "https://etherscan.io",
    "arbitrum": "https://arbiscan.io",
    "optimism": "https://optimistic.etherscan.io",
    "polygon": "https://polygonscan.com",
};

// ERC20 ABI
const ERC20_ABI = [
    {
        name: "transfer",
        type: "function",
        inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
    },
    {
        name: "balanceOf",
        type: "function",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
] as const;

export default function CalPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = use(params);
    const [profile, setProfile] = useState<SchedulingProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Booking flow state
    const [step, setStep] = useState<"select" | "calendar" | "details" | "payment" | "confirm">("select");
    const [scheduleType, setScheduleType] = useState<ScheduleType | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
    const [slotsLoading, setSlotsLoading] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
    
    // Guest details
    const [guestName, setGuestName] = useState("");
    const [guestEmail, setGuestEmail] = useState("");
    const [notes, setNotes] = useState("");
    
    // Booking state
    const [booking, setBooking] = useState(false);
    const [bookingError, setBookingError] = useState<string | null>(null);
    const [bookingSuccess, setBookingSuccess] = useState(false);
    const [paymentTxHash, setPaymentTxHash] = useState<string | null>(null);
    
    // Payment state
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false);
    
    // ENS avatar state
    const [ensAvatar, setEnsAvatar] = useState<string | null>(null);
    
    // Wallet connection
    const router = useRouter();
    const { address, isConnected, chain } = useAccount();
    const { connect, isPending: isConnecting } = useConnect();
    const { disconnect } = useDisconnect();
    const { reconnect } = useReconnect();
    
    // Attempt to reconnect wallet on mount (for PWA persistence)
    useEffect(() => {
        reconnect();
    }, [reconnect]);
    const { switchChain, switchChainAsync } = useSwitchChain();
    
    // Transaction state
    const { sendTransaction, data: txHash, isPending: isSending, error: sendError, reset: resetTransaction } = useSendTransaction();
    const { isLoading: isConfirming, isSuccess: isConfirmed, isError: isTxError, error: txError } = useWaitForTransactionReceipt({
        hash: txHash,
    });
    
    // Get user's timezone
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Check USDC balance
    const targetNetwork = profile?.scheduling.network || undefined;
    const targetChainId = targetNetwork ? CHAIN_IDS[targetNetwork] : undefined;
    const usdcAddress = targetNetwork ? USDC_ADDRESSES[targetNetwork] : undefined;
    
    const { data: usdcBalance } = useReadContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        chainId: targetChainId,
        query: {
            enabled: !!address && !!usdcAddress && !!targetChainId && step === "payment",
        },
    });
    
    const formattedBalance = usdcBalance ? parseFloat(formatUnits(usdcBalance as bigint, 6)).toFixed(2) : null;
    const requiredAmount = profile ? profile.scheduling.priceCents / 100 : 0;
    const hasInsufficientBalance = formattedBalance !== null && parseFloat(formattedBalance) < requiredAmount;

    useEffect(() => {
        fetchProfile();
    }, [slug]);

    // Resolve ENS avatar when profile loads
    useEffect(() => {
        const resolveEnsAvatar = async () => {
            if (!profile) return;
            
            // If we already have an avatar URL from the database, use that
            if (profile.profile.avatarUrl) {
                setEnsAvatar(null);
                return;
            }
            
            // Try to resolve ENS avatar
            const address = profile.profile.walletAddress;
            const ensName = profile.profile.ensName;
            
            try {
                // If we have an ENS name, try to get avatar directly
                if (ensName) {
                    const avatar = await ensClient.getEnsAvatar({
                        name: normalize(ensName),
                    });
                    if (avatar) {
                        setEnsAvatar(avatar);
                        return;
                    }
                }
                
                // Otherwise, try reverse lookup from address
                if (address && address.startsWith("0x")) {
                    const name = await ensClient.getEnsName({
                        address: address as `0x${string}`,
                    });
                    if (name) {
                        const avatar = await ensClient.getEnsAvatar({
                            name: normalize(name),
                        });
                        if (avatar) {
                            setEnsAvatar(avatar);
                        }
                    }
                }
            } catch (err) {
                // Silent fail - ENS resolution is optional
                console.log("[Schedule] ENS avatar resolution failed:", err);
            }
        };
        
        resolveEnsAvatar();
    }, [profile?.profile.walletAddress, profile?.profile.ensName, profile?.profile.avatarUrl]);

    useEffect(() => {
        if (selectedDate && profile) {
            fetchAvailableSlots();
        }
    }, [selectedDate, scheduleType]);

    // Handle successful payment confirmation
    useEffect(() => {
        if (isConfirmed && txHash && step === "payment") {
            setPaymentTxHash(txHash);
            completeBooking(txHash);
        }
    }, [isConfirmed, txHash]);

    // Handle transaction errors
    useEffect(() => {
        if (sendError) {
            console.error("Send transaction error:", sendError);
            setPaymentError(sendError.message || "Transaction failed. Please try again.");
            setIsSwitchingNetwork(false);
        }
    }, [sendError]);

    // Handle transaction receipt errors (e.g., tx reverted)
    useEffect(() => {
        if (isTxError && txError) {
            console.error("Transaction receipt error:", txError);
            setPaymentError("Transaction failed on chain. Do you have enough USDC on Base?");
            resetTransaction();
        }
    }, [isTxError, txError]);

    const fetchProfile = async () => {
        try {
            const res = await fetch(`/api/public/cal/${slug}`);
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Failed to load profile");
                return;
            }

            setProfile(data);
            
            // Auto-select if only one option
            if (data.scheduling.freeEnabled && !data.scheduling.paidEnabled) {
                setScheduleType("free");
                setStep("calendar");
            } else if (!data.scheduling.freeEnabled && data.scheduling.paidEnabled) {
                setScheduleType("paid");
                setStep("calendar");
            }
        } catch (err) {
            setError("Failed to load scheduling page");
        } finally {
            setLoading(false);
        }
    };

    const fetchAvailableSlots = async () => {
        if (!selectedDate || !profile) return;

        setSlotsLoading(true);
        try {
            // Normalize dates to noon UTC to match backend behavior
            const startDateNormalized = new Date(selectedDate);
            startDateNormalized.setUTCHours(12, 0, 0, 0);
            const endDateNormalized = addDays(startDateNormalized, 1);
            endDateNormalized.setUTCHours(12, 0, 0, 0);
            
            const startDate = startDateNormalized.toISOString();
            const endDate = endDateNormalized.toISOString();

            const res = await fetch(
                `/api/scheduling/availability?userAddress=${profile.profile.walletAddress}&startDate=${startDate}&endDate=${endDate}`
            );
            const data = await res.json();

            if (res.ok) {
                setAvailableSlots(data.availableSlots || []);
            } else {
                console.error("[Schedule] Availability API error:", data);
            }
        } catch (err) {
            console.error("Failed to fetch slots:", err);
        } finally {
            setSlotsLoading(false);
        }
    };

    const handleSelectType = (type: ScheduleType) => {
        setScheduleType(type);
        setStep("calendar");
    };

    const handleSelectSlot = (slot: TimeSlot) => {
        setSelectedSlot(slot);
        setStep("details");
    };

    const handleProceedToPayment = () => {
        if (!guestEmail) return;
        
        if (scheduleType === "paid") {
            setStep("payment");
        } else {
            completeBooking();
        }
    };

    const handlePayment = async () => {
        if (!profile || !isConnected || !address) return;

        setPaymentError(null);
        resetTransaction();

        const network = profile.scheduling.network;
        const targetChainId = CHAIN_IDS[network];
        const usdcAddress = USDC_ADDRESSES[network];
        
        if (!targetChainId || !usdcAddress) {
            setPaymentError("Unsupported network for payment");
            return;
        }
        const payToAddress = profile.scheduling.payToAddress as `0x${string}`;
        const amountInUSDC = profile.scheduling.priceCents / 100;
        
        // USDC has 6 decimals
        const amount = parseUnits(amountInUSDC.toString(), 6);

        try {
            // Switch network first if needed
            if (chain?.id !== targetChainId) {
                setIsSwitchingNetwork(true);
                try {
                    await switchChainAsync({ chainId: targetChainId });
                } catch (switchErr) {
                    console.error("Network switch error:", switchErr);
                    setPaymentError("Failed to switch network. Please try again or switch manually in your wallet.");
                    setIsSwitchingNetwork(false);
                    return;
                }
                setIsSwitchingNetwork(false);
            }

            // Encode the ERC20 transfer call
            const data = encodeFunctionData({
                abi: ERC20_ABI,
                functionName: "transfer",
                args: [payToAddress, amount],
            });

            sendTransaction({
                to: usdcAddress,
                data,
            });
        } catch (err) {
            console.error("Payment error:", err);
            setPaymentError(err instanceof Error ? err.message : "Payment failed. Please try again.");
            setIsSwitchingNetwork(false);
        }
    };

    const completeBooking = async (txHash?: string) => {
        if (!profile || !selectedSlot || !guestEmail) return;

        setBooking(true);
        setBookingError(null);

        try {
            const duration = scheduleType === "paid" 
                ? profile.scheduling.paidDuration 
                : profile.scheduling.freeDuration;

            const res = await fetch("/api/scheduling/schedule", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    recipientAddress: profile.profile.walletAddress,
                    schedulerAddress: address || null,
                    scheduledAt: selectedSlot.start,
                    timezone: userTimezone,
                    durationMinutes: duration,
                    title: `Call with ${guestName || "Guest"}`,
                    guestEmail,
                    guestName: guestName || null,
                    notes: notes || null,
                    isPaid: scheduleType === "paid",
                    paymentTransactionHash: txHash || null,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to book");
            }

            setBookingSuccess(true);
            setStep("confirm");
        } catch (err) {
            setBookingError(err instanceof Error ? err.message : "Failed to book");
        } finally {
            setBooking(false);
        }
    };

    // Generate calendar days
    // IMPORTANT: Set to noon UTC to avoid date boundary issues (same as backend)
    // This ensures the day-of-week calculation is consistent across timezones
    const calendarDays = Array.from({ length: 14 }, (_, i) => {
        const today = new Date();
        today.setUTCHours(12, 0, 0, 0); // Set to noon UTC to avoid date boundary issues
        const date = addDays(today, i);
        return date;
    });

    // Check if a day has availability
    // IMPORTANT: Use the user's timezone to calculate day of week, not browser's local timezone
    // Also set date to noon UTC to match backend behavior and avoid date boundary issues
    const dayHasAvailability = (date: Date) => {
        if (!profile) return false;
        const userTimezone = profile.availability.timezone || "UTC";
        // Set to noon UTC to avoid date boundary issues (same as backend)
        const dateAtNoonUTC = new Date(date);
        dateAtNoonUTC.setUTCHours(12, 0, 0, 0);
        // Use the same timezone-aware calculation as the backend
        const dayOfWeek = getDayOfWeekInTimezone(dateAtNoonUTC, userTimezone);
        return profile.availability.windows.some(w => w.dayOfWeek === dayOfWeek);
    };

    const priceDisplay = profile ? `$${(profile.scheduling.priceCents / 100).toFixed(2)}` : "$0";
    
    // Get expected chain ID from profile's network setting
    const expectedChainId = profile?.scheduling.network ? CHAIN_IDS[profile.scheduling.network] : base.id;
    const isWrongNetwork = isConnected && !!chain && chain.id !== expectedChainId;

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !profile) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center">
                        <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-bold text-white mb-2">Page Not Found</h1>
                    <p className="text-zinc-500">{error || "This scheduling page doesn't exist."}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-950 relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-[128px]" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-[128px]" />
            </div>

            <div className="relative z-10 max-w-2xl mx-auto px-4 py-8 sm:py-16">
                {/* Back Button */}
                <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="mb-6"
                >
                    <button
                        onClick={() => {
                            // Try to go back, or go to home if no history
                            if (window.history.length > 1) {
                                router.back();
                            } else {
                                router.push("/");
                            }
                        }}
                        className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors group"
                    >
                        <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span className="text-sm font-medium">Back</span>
                    </button>
                </motion.div>

                {/* Header / Profile */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-8"
                >
                    {/* Avatar */}
                    <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 p-0.5">
                        <div className="w-full h-full rounded-full bg-zinc-900 flex items-center justify-center overflow-hidden">
                            {(profile.profile.avatarUrl || ensAvatar) ? (
                                <img 
                                    src={profile.profile.avatarUrl || ensAvatar || ""} 
                                    alt={profile.profile.displayName}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <span className="text-3xl font-bold text-white">
                                    {profile.profile.displayName.charAt(0).toUpperCase()}
                                </span>
                            )}
                        </div>
                    </div>

                    <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                        {profile.profile.title}
                    </h1>
                    
                    {/* Identity display with badge */}
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <p className="text-lg text-white font-medium">
                            {profile.profile.username ? (
                                <span>@{profile.profile.username}</span>
                            ) : profile.profile.ensName ? (
                                <span>{profile.profile.ensName}</span>
                            ) : (
                                <span className="font-mono text-base">
                                    {profile.profile.walletAddress.slice(0, 6)}...{profile.profile.walletAddress.slice(-4)}
                                </span>
                            )}
                        </p>
                        {/* Identity type badge */}
                        {profile.profile.username ? (
                            <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-medium">
                                Spritz
                            </span>
                        ) : profile.profile.ensName ? (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-medium">
                                ENS
                            </span>
                        ) : null}
                    </div>
                    
                    {/* Show ENS or address below Spritz username */}
                    {profile.profile.username && (
                        <p className="text-sm text-zinc-500">
                            {profile.profile.ensName || `${profile.profile.walletAddress.slice(0, 6)}...${profile.profile.walletAddress.slice(-4)}`}
                        </p>
                    )}
                    
                    {profile.profile.bio && (
                        <p className="text-zinc-500 max-w-md mx-auto mt-3">
                            {profile.profile.bio}
                        </p>
                    )}
                </motion.div>

                {/* Wallet Connection Bar - Only show if paid bookings are enabled */}
                {profile.scheduling.paidEnabled && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="mb-6"
                    >
                        {isConnected && address ? (
                            <div className="flex items-center justify-center gap-3 px-4 py-3 rounded-xl bg-zinc-900/80 border border-zinc-800">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                    <span className="text-zinc-400 text-sm">
                                        {address.slice(0, 6)}...{address.slice(-4)}
                                    </span>
                                </div>
                                <button
                                    onClick={() => disconnect()}
                                    className="text-zinc-500 hover:text-white text-sm transition-colors"
                                >
                                    Disconnect
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 px-4 py-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
                                <p className="text-zinc-500 text-sm">
                                    Connect wallet for paid bookings
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => connect({ connector: injected() })}
                                        disabled={isConnecting}
                                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white text-sm font-medium transition-all disabled:opacity-50"
                                    >
                                        {isConnecting ? "..." : "Connect"}
                                    </button>
                                    <button
                                        onClick={() => connect({ connector: coinbaseWallet() })}
                                        disabled={isConnecting}
                                        className="px-4 py-2 rounded-lg bg-[#0052FF] hover:bg-[#0052FF]/90 text-white text-sm font-medium transition-colors disabled:opacity-50"
                                        title="Coinbase Wallet"
                                    >
                                        <svg className="w-5 h-5" viewBox="0 0 28 28" fill="none">
                                            <path d="M14 6C9.582 6 6 9.582 6 14s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8zm0 12.5a4.5 4.5 0 110-9 4.5 4.5 0 010 9z" fill="currentColor"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Main Content */}
                <AnimatePresence mode="wait">
                    {/* Step 1: Select Type */}
                    {step === "select" && (
                        <motion.div
                            key="select"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="space-y-4"
                        >
                            <p className="text-center text-zinc-400 mb-6">
                                Choose a meeting type
                            </p>

                            {profile.scheduling.freeEnabled && (
                                <button
                                    onClick={() => handleSelectType("free")}
                                    className="w-full p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-900 transition-all group text-left"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                                            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-1">
                                                <h3 className="text-lg font-semibold text-white group-hover:text-emerald-400 transition-colors">
                                                    Free Consultation
                                                </h3>
                                                <span className="text-emerald-400 font-medium">Free</span>
                                            </div>
                                            <p className="text-zinc-500 text-sm">
                                                {profile.scheduling.freeDuration} minute call
                                            </p>
                                        </div>
                                        <svg className="w-5 h-5 text-zinc-600 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </button>
                            )}

                            {profile.scheduling.paidEnabled && (
                                <button
                                    onClick={() => handleSelectType("paid")}
                                    className="w-full p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-orange-500/50 hover:bg-zinc-900 transition-all group text-left"
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0">
                                            <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-1">
                                                <h3 className="text-lg font-semibold text-white group-hover:text-orange-400 transition-colors">
                                                    Priority Session
                                                </h3>
                                                <span className="text-orange-400 font-medium">
                                                    {priceDisplay} USDC
                                                </span>
                                            </div>
                                            <p className="text-zinc-500 text-sm">
                                                {profile.scheduling.paidDuration} minute call
                                            </p>
                                        </div>
                                        <svg className="w-5 h-5 text-zinc-600 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                </button>
                            )}
                        </motion.div>
                    )}

                    {/* Step 2: Calendar */}
                    {step === "calendar" && (
                        <motion.div
                            key="calendar"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6"
                        >
                            {/* Back button */}
                            {profile.scheduling.freeEnabled && profile.scheduling.paidEnabled && (
                                <button
                                    onClick={() => { setStep("select"); setScheduleType(null); setSelectedDate(null); }}
                                    className="flex items-center gap-2 text-zinc-500 hover:text-white mb-4 transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    Back
                                </button>
                            )}

                            {/* Selected type badge */}
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-semibold text-white">Select a Date & Time</h2>
                                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                    scheduleType === "free" 
                                        ? "bg-emerald-500/20 text-emerald-400" 
                                        : "bg-orange-500/20 text-orange-400"
                                }`}>
                                    {scheduleType === "free" ? "Free" : `${priceDisplay} USDC`}
                                </span>
                            </div>

                            {/* Calendar days */}
                            <div className="flex gap-2 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-thin">
                                {calendarDays.map((date, i) => {
                                    const hasAvailability = dayHasAvailability(date);
                                    const isSelected = selectedDate && isSameDay(date, selectedDate);
                                    const isToday = isSameDay(date, new Date());

                                    return (
                                        <button
                                            key={i}
                                            onClick={() => hasAvailability && setSelectedDate(date)}
                                            disabled={!hasAvailability}
                                            className={`flex-shrink-0 w-16 py-3 rounded-xl text-center transition-all ${
                                                isSelected
                                                    ? "bg-orange-500 text-white"
                                                    : hasAvailability
                                                    ? "bg-zinc-800 hover:bg-zinc-700 text-white"
                                                    : "bg-zinc-800/50 text-zinc-600 cursor-not-allowed"
                                            }`}
                                        >
                                            <div className="text-xs uppercase tracking-wide mb-1 opacity-70">
                                                {formatInTimeZone(date, userTimezone, "EEE")}
                                            </div>
                                            <div className="text-lg font-semibold">
                                                {format(date, "d")}
                                            </div>
                                            {isToday && (
                                                <div className="w-1.5 h-1.5 bg-orange-400 rounded-full mx-auto mt-1" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Time slots */}
                            {selectedDate && (
                                <div className="mt-6">
                                    <h3 className="text-sm font-medium text-zinc-400 mb-3">
                                        Available times on {formatInTimeZone(selectedDate, userTimezone, "EEEE, MMMM d")}
                                    </h3>

                                    {slotsLoading ? (
                                        <div className="flex items-center justify-center py-8">
                                            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    ) : availableSlots.length === 0 ? (
                                        <p className="text-zinc-500 text-center py-8">
                                            No available times on this day
                                        </p>
                                    ) : (
                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                            {availableSlots.map((slot, i) => {
                                                const slotTime = new Date(slot.start);
                                                return (
                                                    <button
                                                        key={i}
                                                        onClick={() => handleSelectSlot(slot)}
                                                        className="px-3 py-2.5 rounded-lg bg-zinc-800 hover:bg-orange-500 text-white text-sm font-medium transition-colors"
                                                    >
                                                        {formatInTimeZone(slotTime, userTimezone, "h:mm a")}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <p className="text-xs text-zinc-500 mt-4 text-center">
                                        Times shown in {userTimezone}
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* Step 3: Details */}
                    {step === "details" && selectedSlot && (
                        <motion.div
                            key="details"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6"
                        >
                            {/* Back button */}
                            <button
                                onClick={() => { setStep("calendar"); setSelectedSlot(null); }}
                                className="flex items-center gap-2 text-zinc-500 hover:text-white mb-4 transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                                Back
                            </button>

                            <h2 className="text-lg font-semibold text-white mb-6">Your Details</h2>

                            {/* Selected time summary */}
                            <div className="bg-zinc-800/50 rounded-xl p-4 mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-white font-medium">
                                            {formatInTimeZone(new Date(selectedSlot.start), userTimezone, "EEEE, MMMM d")}
                                        </p>
                                        <p className="text-zinc-400 text-sm">
                                            {formatInTimeZone(new Date(selectedSlot.start), userTimezone, "h:mm a")} - {scheduleType === "paid" ? profile.scheduling.paidDuration : profile.scheduling.freeDuration} min
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Form */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm text-zinc-400 mb-2">
                                        Your Name
                                    </label>
                                    <input
                                        type="text"
                                        value={guestName}
                                        onChange={(e) => setGuestName(e.target.value)}
                                        placeholder="John Doe"
                                        className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm text-zinc-400 mb-2">
                                        Email Address <span className="text-orange-400">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        value={guestEmail}
                                        onChange={(e) => setGuestEmail(e.target.value)}
                                        placeholder="john@example.com"
                                        required
                                        className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition-colors"
                                    />
                                    <p className="text-xs text-zinc-500 mt-1">
                                        We&apos;ll send the meeting invite here
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm text-zinc-400 mb-2">
                                        Notes (optional)
                                    </label>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="What would you like to discuss?"
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition-colors resize-none"
                                    />
                                </div>

                                {bookingError && (
                                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                                        {bookingError}
                                    </div>
                                )}

                                <button
                                    onClick={handleProceedToPayment}
                                    disabled={!guestEmail || booking}
                                    className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold hover:from-orange-400 hover:to-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    {booking ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Scheduling...
                                        </span>
                                    ) : scheduleType === "paid" ? (
                                        `Continue to Payment (${priceDisplay})`
                                    ) : (
                                        "Schedule Meeting"
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* Step 4: Payment (for paid sessions) */}
                    {step === "payment" && selectedSlot && (
                        <motion.div
                            key="payment"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6"
                        >
                            {/* Back button */}
                            <button
                                onClick={() => setStep("details")}
                                disabled={isSending || isConfirming}
                                className="flex items-center gap-2 text-zinc-500 hover:text-white mb-4 transition-colors disabled:opacity-50"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                                Back
                            </button>

                            <h2 className="text-lg font-semibold text-white mb-2">Complete Payment</h2>
                            <p className="text-zinc-400 text-sm mb-6">
                                Pay with USDC on {NETWORK_NAMES[profile.scheduling.network] || profile.scheduling.network}
                            </p>

                            {/* Payment summary */}
                            <div className="bg-zinc-800/50 rounded-xl p-4 mb-6">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-zinc-400">Priority Session</span>
                                    <span className="text-white font-semibold">{priceDisplay} USDC</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-zinc-500">Duration</span>
                                    <span className="text-zinc-400">{profile.scheduling.paidDuration} minutes</span>
                                </div>
                                <div className="flex items-center justify-between text-sm mt-1">
                                    <span className="text-zinc-500">Date</span>
                                    <span className="text-zinc-400">
                                        {formatInTimeZone(new Date(selectedSlot.start), userTimezone, "MMM d, h:mm a")}
                                    </span>
                                </div>
                                <div className="border-t border-zinc-700 mt-4 pt-4 flex items-center justify-between">
                                    <span className="text-white font-medium">Total</span>
                                    <span className="text-orange-400 font-bold text-lg">{priceDisplay} USDC</span>
                                </div>
                            </div>

                            {/* Wallet connection */}
                            {!isConnected ? (
                                <div className="space-y-3">
                                    <p className="text-zinc-400 text-sm text-center mb-4">
                                        Connect your wallet to pay
                                    </p>
                                    <button
                                        onClick={() => connect({ connector: injected() })}
                                        disabled={isConnecting}
                                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-semibold transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                        </svg>
                                        {isConnecting ? "Connecting..." : "Connect Wallet"}
                                    </button>
                                    <button
                                        onClick={() => connect({ connector: coinbaseWallet() })}
                                        disabled={isConnecting}
                                        className="w-full py-3 rounded-xl bg-[#0052FF] hover:bg-[#0052FF]/90 text-white font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        <svg className="w-5 h-5" viewBox="0 0 28 28" fill="none">
                                            <rect width="28" height="28" rx="14" fill="currentColor" fillOpacity="0.2"/>
                                            <path d="M14 6C9.582 6 6 9.582 6 14s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8zm0 12.5a4.5 4.5 0 110-9 4.5 4.5 0 010 9z" fill="currentColor"/>
                                        </svg>
                                        Coinbase Wallet
                                    </button>
                                    <p className="text-zinc-500 text-xs text-center">
                                        MetaMask, Coinbase Wallet & browser wallets supported
                                    </p>
                                </div>
                            ) : isWrongNetwork && !isSwitchingNetwork ? (
                                <div className="space-y-4">
                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                                        <p className="text-amber-400 text-sm mb-1">
                                            Wrong network detected
                                        </p>
                                        <p className="text-zinc-400 text-xs">
                                            Payment requires {NETWORK_NAMES[profile.scheduling.network] || profile.scheduling.network} network
                                        </p>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            try {
                                                await switchChainAsync({ chainId: expectedChainId });
                                            } catch (err) {
                                                console.error("Failed to switch network:", err);
                                            }
                                        }}
                                        disabled={isSwitchingNetwork}
                                        className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold hover:from-orange-400 hover:to-amber-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                        </svg>
                                        Switch to {NETWORK_NAMES[profile.scheduling.network] || profile.scheduling.network}
                                    </button>
                                    <button
                                        onClick={() => disconnect()}
                                        className="w-full text-zinc-400 hover:text-white text-sm py-2"
                                    >
                                        Disconnect wallet
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Connected wallet info */}
                                    <div className="bg-zinc-800/50 rounded-lg px-4 py-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                                                <span className="text-zinc-400 text-sm">
                                                    {address?.slice(0, 6)}...{address?.slice(-4)}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => disconnect()}
                                                className="text-zinc-500 hover:text-white text-xs"
                                            >
                                                Disconnect
                                            </button>
                                        </div>
                                        {formattedBalance !== null && (
                                            <div className="flex items-center justify-between text-sm">
                                                <span className="text-zinc-500">USDC Balance:</span>
                                                <span className={hasInsufficientBalance ? "text-red-400" : "text-white"}>
                                                    ${formattedBalance}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {hasInsufficientBalance && (
                                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                                            Insufficient USDC balance. You need ${requiredAmount.toFixed(2)} USDC on {NETWORK_NAMES[profile.scheduling.network] || profile.scheduling.network}.
                                        </div>
                                    )}

                                    {sendError && (
                                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                                            {sendError.message || "Transaction failed"}
                                        </div>
                                    )}

                                    {(isConfirming || isConfirmed || booking) && !isTxError ? (
                                        <div className="text-center py-4">
                                            <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                                            <p className="text-white font-medium">
                                                {booking ? "Creating your booking..." : isConfirmed ? "Payment confirmed!" : "Confirming payment..."}
                                            </p>
                                            <p className="text-zinc-500 text-sm">
                                                {booking ? "Almost done" : "This may take a few seconds"}
                                            </p>
                                            {txHash && (
                                                <a
                                                    href={`${EXPLORER_URLS[profile.scheduling.network] || "https://basescan.org"}/tx/${txHash}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-orange-400 hover:text-orange-300 text-xs mt-2 inline-block"
                                                >
                                                    View on Explorer →
                                                </a>
                                            )}
                                            {!booking && !isConfirmed && (
                                                <button
                                                    onClick={() => {
                                                        resetTransaction();
                                                        setPaymentError(null);
                                                    }}
                                                    className="block mx-auto mt-4 text-zinc-500 hover:text-white text-sm"
                                                >
                                                    Cancel & Try Again
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handlePayment}
                                            disabled={isSending || isConfirming || isConfirmed || booking || isSwitchingNetwork || hasInsufficientBalance}
                                            className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold hover:from-orange-400 hover:to-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            {isSwitchingNetwork ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    Switching Network...
                                                </span>
                                            ) : isSending ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    Confirm in Wallet...
                                                </span>
                                            ) : (
                                                `Pay ${priceDisplay} USDC`
                                            )}
                                        </button>
                                    )}

                                    {paymentError && (
                                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                                            {paymentError}
                                        </div>
                                    )}

                                    <p className="text-xs text-zinc-500 text-center">
                                        Payment will be sent directly to the host
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* Step 5: Confirmation */}
                    {step === "confirm" && bookingSuccess && (
                        <motion.div
                            key="confirm"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 text-center"
                        >
                            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>

                            <h2 className="text-2xl font-bold text-white mb-2">
                                You&apos;re all set!
                            </h2>
                            <p className="text-zinc-400 mb-6">
                                A calendar invite has been sent to <span className="text-white">{guestEmail}</span>
                            </p>

                            {selectedSlot && (
                                <div className="bg-zinc-800/50 rounded-xl p-4 mb-6">
                                    <p className="text-white font-medium">
                                        {formatInTimeZone(new Date(selectedSlot.start), userTimezone, "EEEE, MMMM d, yyyy")}
                                    </p>
                                    <p className="text-orange-400">
                                        {formatInTimeZone(new Date(selectedSlot.start), userTimezone, "h:mm a")} ({userTimezone})
                                    </p>
                                </div>
                            )}

                            {paymentTxHash && (
                                <div className="bg-zinc-800/50 rounded-xl p-3 mb-6">
                                    <p className="text-zinc-500 text-xs mb-1">Payment confirmed</p>
                                    <a
                                        href={`${EXPLORER_URLS[profile.scheduling.network] || "https://basescan.org"}/tx/${paymentTxHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-orange-400 hover:text-orange-300 text-sm font-mono"
                                    >
                                        {paymentTxHash.slice(0, 10)}...{paymentTxHash.slice(-8)}
                                    </a>
                                </div>
                            )}

                            <button
                                onClick={() => {
                                    setStep("select");
                                    setScheduleType(null);
                                    setSelectedDate(null);
                                    setSelectedSlot(null);
                                    setGuestName("");
                                    setGuestEmail("");
                                    setNotes("");
                                    setBookingSuccess(false);
                                    setPaymentTxHash(null);
                                }}
                                className="text-orange-400 hover:text-orange-300 font-medium transition-colors"
                            >
                                Schedule another meeting
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Footer */}
                <div className="mt-8 text-center">
                    <a 
                        href="/" 
                        className="text-zinc-500 hover:text-white text-sm transition-colors inline-flex items-center gap-2"
                    >
                        Powered by <span className="text-orange-400 font-semibold">Spritz</span>
                    </a>
                </div>
            </div>
        </div>
    );
}
