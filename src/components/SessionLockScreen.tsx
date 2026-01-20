"use client";

/**
 * Session Lock Screen
 * 
 * Displays when the user's session has been locked due to inactivity.
 * Supports multiple authentication methods:
 * - Wallet signature (for wallet users)
 * - Passkey authentication (for passkey/email/solana users)
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useAccount, useSignMessage } from "wagmi";
import { usePasskeyContext } from "@/context/PasskeyProvider";

type AuthMethod = "wallet" | "passkey" | "email" | "solana" | "world_id" | "alien_id";

type SessionLockScreenProps = {
    isLocked: boolean;
    lockReason: "inactivity" | "manual" | null;
    onUnlock: () => void;
    walletAddress?: string;
    authMethod?: AuthMethod;
};

export function SessionLockScreen({
    isLocked,
    lockReason,
    onUnlock,
    walletAddress,
    authMethod = "wallet",
}: SessionLockScreenProps) {
    const { address } = useAccount();
    const { signMessageAsync } = useSignMessage();
    const { login: passkeyLogin } = usePasskeyContext();
    const [isUnlocking, setIsUnlocking] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Determine if this user should use passkey for unlock
    const usePasskeyUnlock = authMethod === "passkey" || authMethod === "email" || 
                             authMethod === "solana" || authMethod === "world_id" || 
                             authMethod === "alien_id";

    const handleWalletUnlock = useCallback(async () => {
        setIsUnlocking(true);
        setError(null);

        try {
            // Generate a unique message for this unlock attempt
            const timestamp = Date.now();
            const message = `Unlock Spritz Session\n\nTimestamp: ${timestamp}\nAddress: ${address || walletAddress}`;

            // Request signature
            const signature = await signMessageAsync({ message });

            if (signature) {
                // Signature successful - unlock the session
                console.log("[SessionLock] Wallet unlock successful");
                onUnlock();
            }
        } catch (err) {
            console.error("[SessionLock] Wallet unlock failed:", err);
            if (err instanceof Error && err.message.includes("User rejected")) {
                setError("Signature cancelled. Please try again.");
            } else {
                setError("Failed to unlock. Please try again.");
            }
        } finally {
            setIsUnlocking(false);
        }
    }, [address, walletAddress, signMessageAsync, onUnlock]);

    const handlePasskeyUnlock = useCallback(async () => {
        setIsUnlocking(true);
        setError(null);

        try {
            // Re-authenticate with passkey
            await passkeyLogin({ useDevicePasskey: true });
            console.log("[SessionLock] Passkey unlock successful");
            onUnlock();
        } catch (err) {
            console.error("[SessionLock] Passkey unlock failed:", err);
            if (err instanceof Error && err.message.includes("cancelled")) {
                setError("Authentication cancelled. Please try again.");
            } else {
                setError("Failed to unlock. Please try again.");
            }
        } finally {
            setIsUnlocking(false);
        }
    }, [passkeyLogin, onUnlock]);

    const handleUnlock = useCallback(async () => {
        if (usePasskeyUnlock) {
            await handlePasskeyUnlock();
        } else {
            await handleWalletUnlock();
        }
    }, [usePasskeyUnlock, handlePasskeyUnlock, handleWalletUnlock]);

    return (
        <AnimatePresence>
            {isLocked && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4"
                    style={{ paddingTop: "env(safe-area-inset-top)" }}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="w-full max-w-sm"
                    >
                        {/* Lock Icon */}
                        <div className="text-center mb-8">
                            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-zinc-800 flex items-center justify-center">
                                <svg
                                    className="w-10 h-10 text-orange-500"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                    />
                                </svg>
                            </div>
                            <h1 className="text-2xl font-bold text-white mb-2">Session Locked</h1>
                            <p className="text-zinc-400">
                                {lockReason === "inactivity"
                                    ? "Your session was locked due to inactivity."
                                    : "Your session has been locked."}
                            </p>
                        </div>

                        {/* Address Display */}
                        {(address || walletAddress) && (
                            <div className="mb-6 p-3 bg-zinc-800/50 rounded-lg text-center">
                                <p className="text-xs text-zinc-500 mb-1">Connected Wallet</p>
                                <p className="text-sm text-zinc-300 font-mono">
                                    {(address || walletAddress)?.slice(0, 6)}...
                                    {(address || walletAddress)?.slice(-4)}
                                </p>
                            </div>
                        )}

                        {/* Error Message */}
                        {error && (
                            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                                <p className="text-sm text-red-400 text-center">{error}</p>
                            </div>
                        )}

                        {/* Unlock Button */}
                        <button
                            onClick={handleUnlock}
                            disabled={isUnlocking}
                            className="w-full py-4 px-6 bg-orange-500 hover:bg-orange-400 disabled:bg-zinc-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-3"
                        >
                            {isUnlocking ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Unlocking...
                                </>
                            ) : usePasskeyUnlock ? (
                                <>
                                    <svg
                                        className="w-5 h-5"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                                        />
                                    </svg>
                                    Unlock with Passkey
                                </>
                            ) : (
                                <>
                                    <svg
                                        className="w-5 h-5"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                                        />
                                    </svg>
                                    Unlock with Wallet
                                </>
                            )}
                        </button>

                        <p className="text-xs text-zinc-500 text-center mt-4">
                            {usePasskeyUnlock 
                                ? "Use your passkey to verify your identity and unlock your session."
                                : "Sign a message to verify your identity and unlock your session."
                            }
                        </p>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/**
 * Inactivity Warning Toast
 * 
 * Shows a warning before the session is locked
 */
type InactivityWarningProps = {
    isVisible: boolean;
    timeRemaining: number | null;
    onStayActive: () => void;
};

export function InactivityWarning({
    isVisible,
    timeRemaining,
    onStayActive,
}: InactivityWarningProps) {
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 50 }}
                    className="fixed bottom-24 left-4 right-4 z-[9998] sm:left-auto sm:right-4 sm:w-80"
                    style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
                >
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/50 rounded-xl backdrop-blur-xl shadow-2xl">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                                <svg
                                    className="w-5 h-5 text-yellow-500"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <h4 className="text-sm font-semibold text-yellow-400 mb-1">
                                    Session Timeout Warning
                                </h4>
                                <p className="text-xs text-zinc-400 mb-2">
                                    Your session will lock in{" "}
                                    <span className="text-yellow-400 font-bold">
                                        {timeRemaining} second{timeRemaining !== 1 ? "s" : ""}
                                    </span>
                                </p>
                                <button
                                    onClick={onStayActive}
                                    className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-medium rounded-lg transition-colors"
                                >
                                    Stay Active
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
