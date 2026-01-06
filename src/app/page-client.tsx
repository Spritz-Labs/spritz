"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { useAccount, useReconnect } from "wagmi";
import { useAppKitAccount, useDisconnect } from "@reown/appkit/react";
import { PasskeyAuth } from "@/components/PasskeyAuth";
import { EmailAuth } from "@/components/EmailAuth";
import { WalletConnect } from "@/components/WalletConnect";
import { Dashboard } from "@/components/Dashboard";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { Globe } from "@/components/Globe";
import { SpritzLogo } from "@/components/SpritzLogo";
import { usePasskeyContext } from "@/context/PasskeyProvider";
import { useEmailAuthContext } from "@/context/EmailAuthProvider";
import { useWalletType, type WalletType } from "@/hooks/useWalletType";
import { useAuth } from "@/context/AuthProvider";
import {
    AUTH_CREDENTIALS_KEY,
    SOLANA_AUTH_CREDENTIALS_KEY,
    AUTH_TTL,
} from "@/lib/authStorage";

// Check if there's a saved wallet session we should wait for
function hasSavedWalletSession(): boolean {
    if (typeof window === "undefined") return false;
    try {
        // Check for our auth credentials first (most reliable indicator)
        const evmCredentials = localStorage.getItem(AUTH_CREDENTIALS_KEY);
        if (evmCredentials) {
            const parsed = JSON.parse(evmCredentials);
            if (parsed?.address && parsed?.signature && Date.now() - parsed.timestamp < AUTH_TTL) {
                return true;
            }
        }
        const solanaCredentials = localStorage.getItem(SOLANA_AUTH_CREDENTIALS_KEY);
        if (solanaCredentials) {
            const parsed = JSON.parse(solanaCredentials);
            if (parsed?.address && parsed?.signature && Date.now() - parsed.timestamp < AUTH_TTL) {
                return true;
            }
        }
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
    } catch {
        // Ignore parse errors
    }
    return false;
}

export default function Home() {
    const [activeTab, setActiveTab] = useState<"wallet" | "email" | "passkey">("wallet");
    
    // EVM wallet via wagmi
    const { address: wagmiAddress, isConnected: isWagmiConnected, isReconnecting } = useAccount();
    const { reconnect } = useReconnect();
    // AppKit disconnect (works for both EVM and Solana)
    const { disconnect: walletDisconnect } = useDisconnect();

    // Explicitly trigger wallet reconnection on mount for PWA persistence
    useEffect(() => {
        reconnect();
    }, [reconnect]);

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
        smartAccountAddress: passkeyAddress,
        logout: passkeyLogout,
        isLoading: isPasskeyLoading,
    } = usePasskeyContext();

    const {
        isAuthenticated: isEmailAuthenticated,
        smartAccountAddress: emailAddress,
        isLoading: isEmailLoading,
        logout: emailLogout,
    } = useEmailAuthContext();

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
    const [authTimeout, setAuthTimeout] = useState(false);
    const hasSavedSession = useRef<boolean | null>(null);

    // Handle hydration
    useEffect(() => {
        setMounted(true);
        // Check for saved session on mount
        hasSavedSession.current = hasSavedWalletSession();
    }, []);

    // Safety timeout - if stuck loading for too long, show recovery option
    useEffect(() => {
        if (mounted && (isSiweLoading || initializing)) {
            const timeout = setTimeout(() => {
                console.log("[Auth] Loading timeout reached - showing recovery option");
                setAuthTimeout(true);
            }, 15000); // 15 second timeout
            return () => clearTimeout(timeout);
        } else {
            setAuthTimeout(false);
        }
    }, [mounted, isSiweLoading, initializing]);

    // Give wagmi/appkit time to reconnect from storage
    // Use longer timeout if we detected a saved session (especially for PWA after force quit)
    useEffect(() => {
        if (mounted) {
            const hasSession = hasSavedSession.current;
            // Use longer delay if we expect a wallet to reconnect
            // PWA force quit can take longer to restore wallet connection
            // But if we're already authenticated via SIWE, we can be faster
            const delay = isSiweAuthenticated ? 100 : hasSession ? 4000 : 500;
            
            const timer = setTimeout(() => {
                setInitializing(false);
            }, delay);
            return () => clearTimeout(timer);
        }
    }, [mounted, isSiweAuthenticated]);

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
    // Can come from email auth, passkey, connected wallet, or authenticated SIWE user
    const userAddress: string | null = mounted
        ? emailAddress || passkeyAddress || walletAddress || siweUser?.walletAddress || null
        : null;

    // Determine wallet type for dashboard
    // Use connected wallet type, or infer from SIWE user address format
    const activeWalletType: WalletType = isPasskeyAuthenticated
        ? "evm" // Passkey users always use EVM (smart accounts)
        : walletType || (siweUser?.walletAddress?.startsWith("0x") ? "evm" : siweUser?.walletAddress ? "solana" : null);

    // Require authentication for all users
    // Email auth, passkey auth, or SIWE/SIWS authentication
    const isFullyAuthenticated = mounted && (
        isEmailAuthenticated ||
        isPasskeyAuthenticated || 
        isSiweAuthenticated
    );

    // Show loading while checking auth state
    // If already authenticated via email/passkey/SIWE, don't wait for wallet reconnection
    // Auth credentials are self-contained and can work without wallet
    const isCheckingAuth =
        !mounted || 
        isPasskeyLoading ||
        isEmailLoading || 
        (isSiweLoading && !isSiweAuthenticated) ||
        (initializing && !isSiweAuthenticated) ||
        (isWalletReconnecting && !isSiweAuthenticated);

    const handleLogout = async () => {
        console.log("[Logout] Starting logout...");
        // Sign out SIWE (this also clears auth storage)
        await siweSignOut();
        // Disconnect wallet (AppKit handles both EVM and Solana)
        try {
            walletDisconnect();
        } catch (e) {
            console.error("[Logout] Disconnect error:", e);
        }
        // Logout passkey if authenticated
        if (isPasskeyAuthenticated) {
            passkeyLogout();
        }
        // Logout email if authenticated
        if (isEmailAuthenticated) {
            emailLogout();
            // emailLogout already reloads, so return early
            return;
        }
        // Clear wallet-related localStorage to ensure clean state
        try {
            const keysToRemove = Object.keys(localStorage).filter(k => 
                k.startsWith("wagmi") || 
                k.startsWith("@reown") || 
                k.startsWith("wc@") ||
                k.includes("walletconnect") ||
                k === AUTH_CREDENTIALS_KEY ||
                k === SOLANA_AUTH_CREDENTIALS_KEY
            );
            keysToRemove.forEach(k => localStorage.removeItem(k));
            console.log("[Logout] Cleared localStorage keys:", keysToRemove.length);
        } catch (e) {
            console.error("[Logout] Clear storage error:", e);
        }
        // Clear IndexedDB auth data
        try {
            const deleteRequest = indexedDB.deleteDatabase("spritz_auth");
            deleteRequest.onsuccess = () => console.log("[Logout] Cleared IndexedDB");
        } catch (e) {
            console.error("[Logout] IndexedDB clear error:", e);
        }
        // Force reload to get clean state
        window.location.reload();
    };

    // Clear auth and start fresh (recovery function)
    const handleClearAuth = async () => {
        console.log("[Recovery] Clearing all auth data...");
        try {
            // Clear localStorage
            const keysToRemove = Object.keys(localStorage).filter(k => 
                k.startsWith("wagmi") || 
                k.startsWith("@reown") || 
                k.startsWith("wc@") ||
                k.includes("walletconnect") ||
                k === AUTH_CREDENTIALS_KEY ||
                k === SOLANA_AUTH_CREDENTIALS_KEY
            );
            keysToRemove.forEach(k => localStorage.removeItem(k));
            // Clear IndexedDB
            indexedDB.deleteDatabase("spritz_auth");
        } catch (e) {
            console.error("[Recovery] Error clearing auth:", e);
        }
        window.location.reload();
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

        // Show error or timeout recovery UI
        const showRecovery = authTimeout || siweError;
        
        return (
            <main className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
                <div className="flex flex-col items-center justify-center text-center max-w-md">
                    <div className={`mb-4 ${showRecovery ? '' : 'animate-pulse'}`}>
                        <SpritzLogo size="2xl" className="shadow-lg shadow-[#FF5500]/30" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">
                        Spritz
                    </h1>
                    <p className="text-zinc-500 text-sm mb-4">
                        {showRecovery ? (siweError || "Taking longer than expected...") : loadingMessage}
                    </p>
                    
                    {showRecovery && (
                        <div className="space-y-3 w-full">
                            <button
                                onClick={() => window.location.reload()}
                                className="w-full py-3 px-4 rounded-xl bg-[#FF5500] hover:bg-[#FF5500]/90 text-white font-medium transition-colors"
                            >
                                Try Again
                            </button>
                            <button
                                onClick={handleClearAuth}
                                className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
                            >
                                Clear Session & Start Fresh
                            </button>
                            <p className="text-zinc-600 text-xs mt-2">
                                If you&apos;re stuck, try clearing your session. You&apos;ll need to reconnect your wallet.
                            </p>
                        </div>
                    )}
                </div>
            </main>
        );
    }

    // Show sign-in prompt for wallet users who haven't signed yet (both EVM and Solana)
    const canShowSignIn = isWalletConnected && !isSiweAuthenticated && !signingIn;
    
    if (canShowSignIn) {
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
        <main className="relative min-h-screen gradient-bg overflow-hidden" role="main">
            {/* PWA Install Prompt for mobile users */}
            <PWAInstallPrompt />

            {/* Background effects */}
            <div className="absolute inset-0 grid-pattern" aria-hidden="true" />
            <div className="absolute inset-0 noise-overlay" aria-hidden="true" />

            {/* Globe Background */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden" aria-hidden="true">
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
            <div className="relative z-10 flex flex-col items-center min-h-screen px-4 pt-6 md:pt-12 pb-6 md:pb-12 safe-area-inset">
                {/* Header - at top */}
                <header className="text-center mb-8 md:mb-12 mt-12 md:mt-16">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="flex items-center justify-center gap-3 mb-2 md:mb-4">
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
                        className="text-3xl md:text-5xl font-bold text-white mb-2 md:mb-3 tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
                    >
                        Spritz
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-zinc-300 text-base md:text-xl max-w-md mx-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
                    >
                        Voice calls over Ethereum & Solana. Connect your wallet
                        and start talking.
                    </motion.p>
                    {/* SEO: Additional descriptive text for crawlers */}
                    <div className="sr-only">
                        <p>
                            Spritz is a censorship-resistant chat application for Web3. 
                            Connect with friends using passkeys or cryptocurrency wallets. 
                            Make HD video calls, go live with livestreaming, create AI agents, 
                            and chat freely on decentralized networks. Built on Ethereum, Base, and Solana.
                        </p>
                    </div>
                </motion.div>
                </header>

                {/* Auth Card - pushed to bottom */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="w-full max-w-md mt-auto"
                >
                    <div className="glass-card rounded-2xl md:rounded-3xl p-5 md:p-8 shadow-2xl">
                        {/* Tabs */}
                        <div className="flex bg-zinc-900/50 rounded-xl p-1 mb-6">
                            <button
                                type="button"
                                onClick={() => setActiveTab("wallet")}
                                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                                    activeTab === "wallet"
                                        ? "bg-[#FF5500] text-white shadow-lg shadow-[#FB8D22]/25"
                                        : "text-zinc-400 hover:text-white"
                                }`}
                            >
                                Wallet
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab("email")}
                                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                                    activeTab === "email"
                                        ? "bg-[#FF5500] text-white shadow-lg shadow-[#FB8D22]/25"
                                        : "text-zinc-400 hover:text-white"
                                }`}
                            >
                                Email
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab("passkey")}
                                className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                                    activeTab === "passkey"
                                        ? "bg-[#FF5500] text-white shadow-lg shadow-[#FB8D22]/25"
                                        : "text-zinc-400 hover:text-white"
                                }`}
                            >
                                Passkey
                            </button>
                        </div>

                        {/* Tab Content */}
                        <div className="min-h-[200px]">
                            <AnimatePresence mode="wait">
                                {activeTab === "wallet" && (
                                    <motion.div
                                        key="wallet"
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <WalletConnect />
                                    </motion.div>
                                )}
                                {activeTab === "email" && (
                                    <motion.div
                                        key="email"
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <EmailAuth />
                                    </motion.div>
                                )}
                                {activeTab === "passkey" && (
                                    <motion.div
                                        key="passkey"
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <PasskeyAuth />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Footer text */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8 }}
                        className="text-center text-zinc-600 text-sm mt-6 mb-0 space-y-2"
                    >
                        <div className="flex items-center justify-center gap-4 flex-wrap">
                            <Link
                                href="/privacy"
                                className="text-[#FFBBA7] hover:text-[#FFF0E0] transition-colors"
                            >
                                Privacy Policy
                            </Link>
                            <span className="text-zinc-700">•</span>
                            <Link
                                href="/tos"
                                className="text-[#FFBBA7] hover:text-[#FFF0E0] transition-colors"
                            >
                                Terms of Service
                            </Link>
                        </div>
                        <p>
                            <a
                                href="https://walletconnect.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#FFBBA7] hover:text-[#FFF0E0] transition-colors"
                            >
                                WalletConnect
                            </a>
                        </p>
                    </motion.div>
                </motion.div>
            </div>
        </main>
    );
}
