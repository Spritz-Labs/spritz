"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { usePasskeyContext } from "@/context/PasskeyProvider";

export function PasskeyAuth() {
    const [mode, setMode] = useState<"login" | "register">("login");
    const {
        isLoading,
        isAuthenticated,
        smartAccountAddress,
        error,
        hasStoredSession,
        register,
        login,
        logout,
        clearError,
    } = usePasskeyContext();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();

        if (mode === "register") {
            // Use a default name for the passkey credential
            await register("Spritz Account");
        } else {
            await login();
        }
    };

    const formatAddress = (address: string) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    if (isAuthenticated && smartAccountAddress) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full"
            >
                <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
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
                                    d="M5 13l4 4L19 7"
                                />
                            </svg>
                        </div>
                        <div>
                            <p className="text-emerald-400 font-semibold">
                                Authenticated
                            </p>
                            <p className="text-zinc-400 text-sm">
                                Passkey verified
                            </p>
                        </div>
                    </div>

                    <div className="bg-black/30 rounded-xl p-4 mb-4">
                        <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">
                            Your Address
                        </p>
                        <p className="text-white font-mono text-sm">
                            {formatAddress(smartAccountAddress)}
                        </p>
                    </div>

                    <button
                        onClick={logout}
                        className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors text-sm font-medium"
                    >
                        Disconnect
                    </button>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Mode Toggle */}
                <div className="flex bg-zinc-900/50 rounded-xl p-1">
                    <button
                        type="button"
                        onClick={() => {
                            setMode("login");
                            clearError();
                        }}
                        className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                            mode === "login"
                                ? "bg-[#FF5500] text-white shadow-lg shadow-[#FB8D22]/25"
                                : "text-zinc-400 hover:text-white"
                        }`}
                    >
                        Login
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setMode("register");
                            clearError();
                        }}
                        className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                            mode === "register"
                                ? "bg-[#FF5500] text-white shadow-lg shadow-[#FB8D22]/25"
                                : "text-zinc-400 hover:text-white"
                        }`}
                    >
                        Register
                    </button>
                </div>

                {/* Show hint about passkey login */}
                {mode === "login" && (
                    <p className="text-zinc-400 text-xs text-center">
                        {hasStoredSession 
                            ? "Your passkey is ready to use"
                            : "Use your device's passkey to sign in"}
                    </p>
                )}


                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 space-y-2"
                        >
                            <p className="text-red-400 text-sm">{error}</p>
                            {(error.includes("RP ID") || error.includes("invalid") || error.includes("expired")) && (
                                <div className="text-zinc-400 text-xs space-y-1 pt-1 border-t border-red-500/20">
                                    <p className="font-medium text-zinc-300">Lost your passkey?</p>
                                    <p>If you previously registered a passkey that no longer works, you can:</p>
                                    <ol className="list-decimal list-inside space-y-0.5 pl-1">
                                        <li>Login with your wallet instead</li>
                                        <li>Register a new passkey after logging in</li>
                                    </ol>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full relative overflow-hidden group py-4 px-6 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF5500] text-white font-semibold transition-all hover:shadow-xl hover:shadow-[#FB8D22]/25 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                        {isLoading ? (
                            <>
                                <svg
                                    className="animate-spin h-5 w-5"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                >
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                    />
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                </svg>
                                <span>Processing...</span>
                            </>
                        ) : (
                            <>
                                <svg
                                    className="w-5 h-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                                    />
                                </svg>
                                <span>
                                    {mode === "login"
                                        ? "Login with Passkey"
                                        : "Create Passkey Account"}
                                </span>
                            </>
                        )}
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-[#FB8D22] to-[#FB8D22] opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>

                <p className="text-center text-zinc-500 text-xs">
                    {mode === "login"
                        ? "Use your device's biometric authentication"
                        : "Creates a secure account linked to your device"}
                </p>
            </form>
        </motion.div>
    );
}
