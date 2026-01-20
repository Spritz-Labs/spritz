"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { usePasskeyContext } from "@/context/PasskeyProvider";
import { useRouter } from "next/navigation";

export function PasskeyAuth() {
    const router = useRouter();
    const [mode, setMode] = useState<"login" | "register">("login");
    const [showEmailRecovery, setShowEmailRecovery] = useState(false);
    const [recoveryStep, setRecoveryStep] = useState<"email" | "code">("email");
    const [recoveryEmail, setRecoveryEmail] = useState("");
    const [recoveryCode, setRecoveryCode] = useState("");
    const [recoveryLoading, setRecoveryLoading] = useState(false);
    const [recoveryError, setRecoveryError] = useState<string | null>(null);
    const [recoverySuccess, setRecoverySuccess] = useState<{
        userAddress: string;
        recoveryToken: string;
    } | null>(null);
    const {
        isLoading,
        isAuthenticated,
        smartAccountAddress,
        error,
        warning,
        hasStoredSession,
        register,
        login,
        logout,
        clearError,
        clearWarning,
        rescue,
        needsRescue,
    } = usePasskeyContext();

    const handleSendRecoveryCode = async () => {
        if (!recoveryEmail) return;
        
        setRecoveryLoading(true);
        setRecoveryError(null);
        
        try {
            const res = await fetch("/api/passkey/recover/email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: recoveryEmail }),
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || "Failed to send recovery code");
            }
            
            // Move to code entry step
            setRecoveryStep("code");
        } catch (err) {
            setRecoveryError(err instanceof Error ? err.message : "Failed to send code");
        } finally {
            setRecoveryLoading(false);
        }
    };

    const handleVerifyRecoveryCode = async () => {
        if (!recoveryEmail || !recoveryCode) return;
        
        setRecoveryLoading(true);
        setRecoveryError(null);
        
        try {
            const res = await fetch("/api/passkey/recover/email/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: recoveryEmail, code: recoveryCode }),
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || "Invalid recovery code");
            }
            
            // Store recovery token for registration
            localStorage.setItem("spritz_recovery_token", data.recoveryToken);
            localStorage.setItem("spritz_recovery_address", data.userAddress);
            
            setRecoverySuccess({
                userAddress: data.userAddress,
                recoveryToken: data.recoveryToken,
            });
        } catch (err) {
            setRecoveryError(err instanceof Error ? err.message : "Failed to verify code");
        } finally {
            setRecoveryLoading(false);
        }
    };

    const handleRegisterAfterRecovery = () => {
        // Navigate to recover page which has better UX for this flow
        router.push("/?recover=true");
        setShowEmailRecovery(false);
    };

    const resetRecoveryState = () => {
        setShowEmailRecovery(false);
        setRecoveryStep("email");
        setRecoveryEmail("");
        setRecoveryCode("");
        setRecoveryError(null);
        setRecoverySuccess(null);
    };

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

                    {/* Warning for non-synced passkeys */}
                    {warning && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4">
                            <div className="flex items-start gap-2">
                                <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <div className="flex-1">
                                    <p className="text-amber-400 text-sm">{warning}</p>
                                    <button 
                                        onClick={clearWarning}
                                        className="text-zinc-500 hover:text-zinc-300 text-xs mt-1 underline"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

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

                {/* Show hint for login mode */}
                {mode === "login" && (
                    <p className="text-zinc-400 text-xs text-center">
                        {hasStoredSession 
                            ? "Your passkey is ready to use"
                            : "Sign in with Face ID, Touch ID, or your password manager"}
                    </p>
                )}

                {/* Cloud sync tip for registration */}
                {mode === "register" && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                        <div className="flex items-start gap-2">
                            <svg className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="text-xs">
                                <p className="text-blue-400 font-medium mb-1">Tip: Save to Cloud</p>
                                <p className="text-zinc-400">
                                    When prompted, choose <strong className="text-zinc-300">iCloud Keychain</strong> (Apple) or <strong className="text-zinc-300">Google Password Manager</strong> (Android) to access your account from any device.
                                </p>
                            </div>
                        </div>
                    </div>
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

                {/* Rescue banner - shown when orphaned passkey detected */}
                <AnimatePresence>
                    {(needsRescue || warning?.includes("Rescue Account")) && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-3"
                        >
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-emerald-400 font-medium">Account Found!</p>
                                    <p className="text-zinc-400 text-sm mt-1">
                                        Your passkey needs to be re-linked to your account. This only takes a moment.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={rescue}
                                disabled={isLoading}
                                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        <span>Rescuing...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        <span>Rescue Account</span>
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => {
                                    localStorage.removeItem("spritz_needs_rescue");
                                    localStorage.removeItem("spritz_recovery_token");
                                    localStorage.removeItem("spritz_recovery_address");
                                    clearWarning();
                                    window.location.reload();
                                }}
                                className="w-full text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
                            >
                                Cancel and start fresh
                            </button>
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
                        ? useDevicePasskey
                            ? "Will search for passkeys stored on this device"
                            : "Use your device's biometric authentication"
                        : "Creates a secure account linked to your device"}
                </p>

                {/* Recover by Email link - only show in login mode */}
                {mode === "login" && (
                    <button
                        type="button"
                        onClick={() => setShowEmailRecovery(true)}
                        className="w-full text-center text-zinc-500 hover:text-zinc-300 text-xs mt-2 transition-colors"
                    >
                        Lost your passkey? <span className="underline">Recover by Email</span>
                    </button>
                )}
            </form>

            {/* Email Recovery Modal */}
            <AnimatePresence>
                {showEmailRecovery && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                        onClick={(e) => e.target === e.currentTarget && resetRecoveryState()}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-white">
                                    {recoverySuccess ? "Recovery Successful!" : "Recover by Email"}
                                </h3>
                                <button
                                    onClick={resetRecoveryState}
                                    className="text-zinc-400 hover:text-white transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {recoverySuccess ? (
                                /* Success State */
                                <div className="space-y-4">
                                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span className="text-emerald-400 font-medium">Email Verified!</span>
                                        </div>
                                        <p className="text-zinc-300 text-sm">You can now register a new passkey.</p>
                                        <p className="text-zinc-500 text-xs mt-2 font-mono">
                                            Account: {recoverySuccess.userAddress.slice(0, 10)}...{recoverySuccess.userAddress.slice(-6)}
                                        </p>
                                    </div>
                                    
                                    {/* Cloud sync reminder */}
                                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                                        <p className="text-blue-400 text-xs font-medium mb-1">💡 Remember to save to cloud!</p>
                                        <p className="text-zinc-400 text-xs">
                                            Choose iCloud Keychain or Google Password Manager when registering.
                                        </p>
                                    </div>
                                    
                                    <button
                                        onClick={handleRegisterAfterRecovery}
                                        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FB8D22] text-white font-semibold hover:opacity-90 transition-opacity"
                                    >
                                        Register New Passkey
                                    </button>
                                </div>
                            ) : recoveryStep === "email" ? (
                                /* Email Input Step */
                                <div className="space-y-4">
                                    <p className="text-zinc-400 text-sm">
                                        Enter the email address associated with your passkey account. We&apos;ll send you a recovery code.
                                    </p>
                                    
                                    {recoveryError && (
                                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                                            <p className="text-red-400 text-sm">{recoveryError}</p>
                                        </div>
                                    )}
                                    
                                    <input
                                        type="email"
                                        value={recoveryEmail}
                                        onChange={(e) => setRecoveryEmail(e.target.value)}
                                        placeholder="your@email.com"
                                        className="w-full py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20"
                                        autoFocus
                                    />
                                    
                                    <button
                                        onClick={handleSendRecoveryCode}
                                        disabled={!recoveryEmail || recoveryLoading}
                                        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FB8D22] text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {recoveryLoading ? (
                                            <>
                                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                                <span>Sending...</span>
                                            </>
                                        ) : (
                                            "Send Recovery Code"
                                        )}
                                    </button>
                                    
                                    <p className="text-zinc-500 text-xs text-center">
                                        Code expires in 10 minutes. Max 3 codes per hour.
                                    </p>
                                </div>
                            ) : (
                                /* Code Input Step */
                                <div className="space-y-4">
                                    <p className="text-zinc-400 text-sm">
                                        Enter the 6-digit code sent to <strong className="text-white">{recoveryEmail}</strong>
                                    </p>
                                    
                                    {recoveryError && (
                                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                                            <p className="text-red-400 text-sm">{recoveryError}</p>
                                        </div>
                                    )}
                                    
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={recoveryCode}
                                        onChange={(e) => setRecoveryCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                        placeholder="000000"
                                        className="w-full py-4 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-center font-mono text-2xl tracking-[0.5em] placeholder:text-zinc-600 placeholder:tracking-[0.5em] focus:outline-none focus:border-[#FF5500]/50 focus:ring-2 focus:ring-[#FF5500]/20"
                                        autoFocus
                                        maxLength={6}
                                    />
                                    
                                    <button
                                        onClick={handleVerifyRecoveryCode}
                                        disabled={recoveryCode.length !== 6 || recoveryLoading}
                                        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FB8D22] text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {recoveryLoading ? (
                                            <>
                                                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                </svg>
                                                <span>Verifying...</span>
                                            </>
                                        ) : (
                                            "Verify Code"
                                        )}
                                    </button>
                                    
                                    <div className="flex items-center justify-between text-xs">
                                        <button
                                            onClick={() => setRecoveryStep("email")}
                                            className="text-zinc-500 hover:text-zinc-300 transition-colors"
                                        >
                                            ← Change email
                                        </button>
                                        <button
                                            onClick={handleSendRecoveryCode}
                                            disabled={recoveryLoading}
                                            className="text-zinc-500 hover:text-zinc-300 transition-colors"
                                        >
                                            Resend code
                                        </button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
