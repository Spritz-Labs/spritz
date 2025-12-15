"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useAccount, useDisconnect } from "wagmi";
import { type Address } from "viem";
import { PasskeyAuth } from "@/components/PasskeyAuth";
import { WalletConnect } from "@/components/WalletConnect";
import { Dashboard } from "@/components/Dashboard";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { usePasskeyContext } from "@/context/PasskeyProvider";

export default function Home() {
    const {
        address: walletAddress,
        isConnected: isWalletConnected,
        isReconnecting,
    } = useAccount();
    const { disconnect: walletDisconnect } = useDisconnect();
    const {
        isAuthenticated: isPasskeyAuthenticated,
        smartAccountAddress,
        logout: passkeyLogout,
        isLoading: isPasskeyLoading,
    } = usePasskeyContext();
    const [mounted, setMounted] = useState(false);
    const [initializing, setInitializing] = useState(true);

    // Handle hydration
    useEffect(() => {
        setMounted(true);
    }, []);

    // Give wagmi time to reconnect from storage
    useEffect(() => {
        if (mounted) {
            // Small delay to let wagmi reconnect from localStorage
            const timer = setTimeout(() => {
                setInitializing(false);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [mounted]);

    // Determine the active user address
    const userAddress: Address | null = mounted
        ? smartAccountAddress || walletAddress || null
        : null;

    const isAuthenticated =
        mounted && (isPasskeyAuthenticated || isWalletConnected);

    // Show loading while checking auth state
    const isCheckingAuth =
        !mounted || initializing || isReconnecting || isPasskeyLoading;

    const handleLogout = () => {
        // Disconnect wallet if connected
        if (isWalletConnected) {
            walletDisconnect();
        }
        // Logout passkey if authenticated
        if (isPasskeyAuthenticated) {
            passkeyLogout();
        }
    };

    // Show loading splash while checking auth
    if (isCheckingAuth) {
        return (
            <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30 animate-pulse">
                        <svg
                            className="w-8 h-8 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                            />
                        </svg>
                    </div>
                    <p className="text-zinc-500 text-sm">Loading...</p>
                </div>
            </main>
        );
    }

    // Show dashboard if authenticated
    if (isAuthenticated && userAddress) {
        return (
            <Dashboard
                userAddress={userAddress}
                onLogout={handleLogout}
                isPasskeyUser={isPasskeyAuthenticated}
            />
        );
    }

    return (
        <main className="relative min-h-screen gradient-bg overflow-hidden">
            {/* PWA Install Prompt for mobile users */}
            <PWAInstallPrompt />

            {/* Background effects */}
            <div className="absolute inset-0 grid-pattern" />
            <div className="absolute inset-0 noise-overlay" />

            {/* Glowing orbs */}
            <div
                className="glow-orb glow-orb-violet w-[500px] h-[500px] -top-48 -left-24 animate-pulse-glow"
                style={{ animationDelay: "0s" }}
            />
            <div
                className="glow-orb glow-orb-purple w-[400px] h-[400px] top-1/3 -right-32 animate-pulse-glow"
                style={{ animationDelay: "2s" }}
            />
            <div
                className="glow-orb glow-orb-blue w-[300px] h-[300px] -bottom-24 left-1/4 animate-pulse-glow"
                style={{ animationDelay: "4s" }}
            />

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-12 safe-area-inset">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-12"
                >
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{
                                type: "spring",
                                stiffness: 200,
                                delay: 0.2,
                            }}
                            className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30"
                        >
                            <svg
                                className="w-7 h-7 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                                />
                            </svg>
                        </motion.div>
                    </div>

                    <motion.h1
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="text-4xl md:text-5xl font-bold text-white mb-3 tracking-tight"
                    >
                        Reach
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-zinc-400 text-lg max-w-md mx-auto"
                    >
                        Voice calls and chat over Ethereum. Connect your wallet
                        and start talking.
                    </motion.p>
                </motion.div>

                {/* Auth Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="w-full max-w-md"
                >
                    <div className="glass-card rounded-3xl p-8 shadow-2xl">
                        {/* Passkey Section */}
                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-6">
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
                                <span className="text-zinc-500 text-sm font-medium uppercase tracking-wider">
                                    Passkey
                                </span>
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
                            </div>

                            <PasskeyAuth />
                        </div>

                        {/* Divider */}
                        <div className="flex items-center gap-4 mb-8">
                            <div className="h-px flex-1 bg-zinc-800" />
                            <span className="text-zinc-600 text-sm">or</span>
                            <div className="h-px flex-1 bg-zinc-800" />
                        </div>

                        {/* Wallet Section */}
                        <div>
                            <div className="flex items-center gap-2 mb-6">
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
                                <span className="text-zinc-500 text-sm font-medium uppercase tracking-wider">
                                    Wallet
                                </span>
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
                            </div>

                            <WalletConnect />
                        </div>
                    </div>

                    {/* Footer text */}
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8 }}
                        className="text-center text-zinc-600 text-sm mt-6"
                    >
                        Powered by{" "}
                        <a
                            href="https://agora.io"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                            Agora
                        </a>{" "}
                        &{" "}
                        <a
                            href="https://walletconnect.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 transition-colors"
                        >
                            WalletConnect
                        </a>
                    </motion.p>
                </motion.div>
            </div>
        </main>
    );
}
