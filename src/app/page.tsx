"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { useAccount } from "wagmi";
import { useAppKitAccount, useDisconnect } from "@reown/appkit/react";
import { PasskeyAuth } from "@/components/PasskeyAuth";
import { WalletConnect } from "@/components/WalletConnect";
import { Dashboard } from "@/components/Dashboard";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { Globe } from "@/components/Globe";
import { SpritzLogo } from "@/components/SpritzLogo";
import { usePasskeyContext } from "@/context/PasskeyProvider";
import { useWalletType, type WalletType } from "@/hooks/useWalletType";
import { useAuth } from "@/context/AuthProvider";

// Check if there's a saved wallet session we should wait for
function hasSavedWalletSession(): boolean {
    if (typeof window === "undefined") return false;
    try {
        // Check for wagmi state (EVM wallets)
        const wagmiState = localStorage.getItem("wagmi.store");
        if (wagmiState) {
            const parsed = JSON.parse(wagmiState);
            if (parsed?.state?.connections?.size > 0 || parsed?.state?.current) {
                return true;
            }
        }
        // Check for @reown appkit state (Solana + EVM)
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith("@reown") || key.startsWith("wc@") || key.includes("walletconnect")) {
                return true;
            }
        }
        // Check for our SIWE credentials
        const authCredentials = localStorage.getItem("spritz_auth_credentials");
        if (authCredentials) {
            const parsed = JSON.parse(authCredentials);
            const AUTH_TTL = 7 * 24 * 60 * 60 * 1000;
            if (parsed?.address && Date.now() - parsed.timestamp < AUTH_TTL) {
                return true;
            }
        }
    } catch {
        // Ignore parse errors
    }
    return false;
}

export default function Home() {
    // EVM wallet via wagmi
    const { isReconnecting } = useAccount();
    // AppKit disconnect (works for both EVM and Solana)
    const { disconnect: walletDisconnect } = useDisconnect();

    // Multi-chain wallet detection (EVM + Solana)
    const {
        walletType,
        address: walletAddress,
        isConnected: isWalletConnected,
    } = useWalletType();

    // AppKit account for disconnect
    const { isConnected: isAppKitConnected } = useAppKitAccount();

    const {
        isAuthenticated: isPasskeyAuthenticated,
        smartAccountAddress,
        logout: passkeyLogout,
        isLoading: isPasskeyLoading,
    } = usePasskeyContext();

    // SIWE Authentication
    const {
        isAuthenticated: isSiweAuthenticated,
        isLoading: isSiweLoading,
        signIn: siweSignIn,
        signOut: siweSignOut,
        isBetaTester,
        user: siweUser,
        error: siweError,
    } = useAuth();

    const [mounted, setMounted] = useState(false);
    const [initializing, setInitializing] = useState(true);
    const [signingIn, setSigningIn] = useState(false);
    const hasSavedSession = useRef<boolean | null>(null);

    // Handle hydration
    useEffect(() => {
        setMounted(true);
        // Check for saved session on mount
        hasSavedSession.current = hasSavedWalletSession();
    }, []);

    // Give wagmi/appkit time to reconnect from storage
    // Use longer timeout if we detected a saved session (especially for PWA after force quit)
    useEffect(() => {
        if (mounted) {
            const hasSession = hasSavedSession.current;
            // Use longer delay if we expect a wallet to reconnect
            // PWA force quit can take longer to restore wallet connection
            const delay = hasSession ? 3000 : 500;
            
            const timer = setTimeout(() => {
                setInitializing(false);
            }, delay);
            return () => clearTimeout(timer);
        }
    }, [mounted]);

    // Clear initializing early if wallet reconnects before timeout
    useEffect(() => {
        if (mounted && initializing && isWalletConnected && walletAddress) {
            // Wallet reconnected, no need to wait for timeout
            setInitializing(false);
        }
    }, [mounted, initializing, isWalletConnected, walletAddress]);
    
    // Detect if wallet is still reconnecting (checking multiple signals)
    // Be more patient with reconnection after PWA force quit
    const isWalletReconnecting = 
        isReconnecting || 
        (hasSavedSession.current && !isWalletConnected && initializing) ||
        (hasSavedSession.current && !isWalletConnected && !initializing && isSiweLoading);

    // Auto sign-in with SIWE/SIWS when wallet connects (if not already authenticated)
    useEffect(() => {
        if (
            mounted &&
            !initializing &&
            isWalletConnected &&
            walletAddress &&
            !isSiweAuthenticated &&
            !isSiweLoading &&
            !signingIn &&
            (walletType === "evm" || walletType === "solana") // Auto-sign for both EVM and Solana
        ) {
            // Small delay to prevent race conditions
            const timer = setTimeout(() => {
                setSigningIn(true);
                siweSignIn().finally(() => setSigningIn(false));
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [mounted, initializing, isWalletConnected, walletAddress, isSiweAuthenticated, isSiweLoading, signingIn, siweSignIn, walletType]);

    // Determine the active user address (supports both EVM and Solana)
    const userAddress: string | null = mounted
        ? smartAccountAddress || walletAddress || null
        : null;

    // Determine wallet type for dashboard
    const activeWalletType: WalletType = isPasskeyAuthenticated
        ? "evm" // Passkey users always use EVM (smart accounts)
        : walletType;

    // Require SIWE/SIWS authentication for all wallet users
    const isFullyAuthenticated = mounted && (
        isPasskeyAuthenticated || 
        (isWalletConnected && isSiweAuthenticated)
    );

    // Show loading while checking auth state
    const isCheckingAuth =
        !mounted || initializing || isWalletReconnecting || isPasskeyLoading || (isWalletConnected && isSiweLoading);

    const handleLogout = () => {
        // Sign out SIWE
        siweSignOut();
        // Disconnect wallet if connected (works for both EVM and Solana via AppKit)
        if (isAppKitConnected) {
            walletDisconnect();
        }
        // Logout passkey if authenticated
        if (isPasskeyAuthenticated) {
            passkeyLogout();
        }
    };

    // Show loading splash while checking auth
    if (isCheckingAuth) {
        // Determine appropriate loading message
        let loadingMessage = "Loading...";
        if (signingIn) {
            loadingMessage = "Signing in...";
        } else if (isWalletReconnecting) {
            loadingMessage = "Reconnecting wallet...";
        } else if (isSiweLoading) {
            loadingMessage = "Authenticating...";
        } else if (isPasskeyLoading) {
            loadingMessage = "Checking passkey...";
        }
        
        return (
            <main className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="flex flex-col items-center justify-center text-center">
                    <div className="mb-4 animate-pulse">
                        <SpritzLogo size="2xl" className="shadow-lg shadow-[#FF5500]/30" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">
                        Spritz
                    </h1>
                    <p className="text-zinc-500 text-sm">
                        {loadingMessage}
                    </p>
                </div>
            </main>
        );
    }

    // Show sign-in prompt for wallet users who haven't signed yet (both EVM and Solana)
    if (isWalletConnected && !isSiweAuthenticated && !signingIn) {
        const isEVM = walletType === "evm";
        const isSolana = walletType === "solana";
        const chainLabel = isSolana ? "Solana" : "Ethereum";
        
        return (
            <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-md"
                >
                    <div className="glass-card rounded-3xl p-8 shadow-2xl text-center flex flex-col items-center">
                        <SpritzLogo size="xl" className="mb-6 shadow-lg shadow-[#FF5500]/30" />
                        
                        <h2 className="text-2xl font-bold text-white mb-2">
                            Sign In to Spritz
                        </h2>
                        <p className="text-zinc-400 mb-6">
                            Please sign the message in your {chainLabel} wallet to verify ownership and continue.
                        </p>

                        {/* Chain indicator */}
                        <div className="mb-4 flex items-center justify-center gap-2 text-sm">
                            <span className={`px-3 py-1 rounded-full ${
                                isSolana 
                                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" 
                                    : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                            }`}>
                                {isSolana ? "🟣 Solana" : "🔵 Ethereum"}
                            </span>
                        </div>

                        {siweError && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                {siweError}
                            </div>
                        )}

                        <button
                            onClick={() => {
                                setSigningIn(true);
                                siweSignIn().finally(() => setSigningIn(false));
                            }}
                            disabled={signingIn}
                            className="w-full py-3 bg-gradient-to-r from-[#FF5500] to-[#FF7A33] hover:from-[#FF6611] hover:to-[#FF8844] disabled:opacity-50 text-white font-semibold rounded-xl transition-all mb-4"
                        >
                            {signingIn ? "Signing..." : "Sign Message"}
                        </button>

                        <button
                            onClick={handleLogout}
                            className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-colors"
                        >
                            Disconnect Wallet
                        </button>

                        <p className="text-xs text-zinc-500 mt-4">
                            This signature proves you own this wallet. No transaction will be made.
                        </p>
                    </div>
                </motion.div>
            </main>
        );
    }

    // Show dashboard if fully authenticated
    if (isFullyAuthenticated && userAddress) {
        return (
            <>
                <PWAInstallPrompt />
                <Dashboard
                    userAddress={userAddress}
                    onLogout={handleLogout}
                    isPasskeyUser={isPasskeyAuthenticated}
                    walletType={activeWalletType}
                    isBetaTester={isBetaTester}
                    siweUser={siweUser}
                />
            </>
        );
    }

    return (
        <main className="relative min-h-screen gradient-bg overflow-hidden">
            {/* PWA Install Prompt for mobile users */}
            <PWAInstallPrompt />

            {/* Background effects */}
            <div className="absolute inset-0 grid-pattern" />
            <div className="absolute inset-0 noise-overlay" />

            {/* Globe Background */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 0.85, scale: 1 }}
                    transition={{ duration: 2, delay: 0.3 }}
                    className="relative"
                >
                    <Globe />
                    {/* Glow effect behind globe */}
                    <div className="absolute inset-0 bg-[#FF5500]/20 rounded-full blur-[80px] -z-10 scale-125" />
                </motion.div>
            </div>

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
                        >
                            <SpritzLogo size="xl" className="shadow-lg shadow-[#FF5500]/30" />
                        </motion.div>
                    </div>

                    <motion.h1
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="text-4xl md:text-5xl font-bold text-white mb-3 tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
                    >
                        Spritz
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-zinc-300 text-lg max-w-md mx-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
                    >
                        Voice calls over Ethereum & Solana. Connect your wallet
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
                        {/* Wallet Section */}
                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-6">
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
                                <span className="text-zinc-500 text-sm font-medium uppercase tracking-wider">
                                    Connect Wallet
                                </span>
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
                            </div>

                            <WalletConnect />
                        </div>

                        {/* Divider */}
                        <div className="flex items-center gap-4 mb-8">
                            <div className="h-px flex-1 bg-zinc-800" />
                            <span className="text-zinc-600 text-sm">or</span>
                            <div className="h-px flex-1 bg-zinc-800" />
                        </div>

                        {/* Passkey Section */}
                        <div>
                            <div className="flex items-center gap-2 mb-6">
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
                                <span className="text-zinc-500 text-sm font-medium uppercase tracking-wider">
                                    Passkey Login
                                </span>
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-700 to-transparent" />
                            </div>

                            <PasskeyAuth />
                        </div>
                    </div>

                    {/* Footer text */}
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8 }}
                        className="text-center text-zinc-600 text-sm mt-6"
                    >
                        <a
                            href="https://walletconnect.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#FFBBA7] hover:text-[#FFF0E0] transition-colors"
                        >
                            WalletConnect
                        </a>
                    </motion.p>
                </motion.div>
            </div>
        </main>
    );
}
