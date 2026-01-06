"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useEmailAuthContext } from "@/context/EmailAuthProvider";

export function EmailAuth() {
    const [localEmail, setLocalEmail] = useState("");
    const [code, setCode] = useState("");
    const [codeSent, setCodeSent] = useState(false);
    const {
        isLoading,
        isAuthenticated,
        smartAccountAddress,
        error,
        hasStoredEmail,
        step,
        email: contextEmail,
        login,
        sendCode,
        logout,
        clearError,
        setStep,
    } = useEmailAuthContext();

    // Use context email if available, otherwise use local
    const email = contextEmail || localEmail;
    
    // Initialize local email from context if context has email but local doesn't
    useEffect(() => {
        if (contextEmail && !localEmail && step === "code") {
            setLocalEmail(contextEmail);
        }
    }, [contextEmail, localEmail, step]);

    // Debug: Log step changes
    useEffect(() => {
        console.log("[EmailAuth] Step changed to:", step);
    }, [step]);

    const handleSendCode = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!email) {
            return;
        }

        clearError();

        console.log("[EmailAuth] Sending code to:", email);
        try {
            const success = await sendCode(email);
            console.log("[EmailAuth] Send code result:", success);
            if (success) {
                console.log("[EmailAuth] Setting step to 'code'");
                setCodeSent(true);
                setStep("code");
                console.log("[EmailAuth] Step set to 'code'");
            }
        } catch (error) {
            console.error("[EmailAuth] Error in handleSendCode:", error);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        clearError();

        const emailToUse = contextEmail || localEmail;
        console.log("[EmailAuth] Logging in with email:", emailToUse, "code:", code);
        if (!emailToUse || !code) {
            console.error("[EmailAuth] Missing email or code:", { emailToUse, code });
            return;
        }
        const success = await login(emailToUse, code);
        if (success) {
            setStep("email");
            setLocalEmail("");
            setCode("");
            setCodeSent(false);
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
                <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/30 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center">
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
                                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                />
                            </svg>
                        </div>
                        <div>
                            <p className="text-blue-400 font-semibold">
                                Authenticated
                            </p>
                            <p className="text-zinc-400 text-sm">
                                Email verified
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
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log("[EmailAuth] Disconnect clicked");
                            logout();
                        }}
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
            <div className="space-y-4">
                <AnimatePresence mode="wait">
                    {step === "email" && (
                        <motion.div
                            key="email-step"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-4"
                        >
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setLocalEmail(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        if (email && !isLoading) {
                                            handleSendCode(e);
                                        }
                                    }
                                }}
                                placeholder="Enter your email"
                                className="w-full py-3 px-4 bg-zinc-900/70 border border-zinc-800 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FB8D22]/50 focus:ring-2 focus:ring-[#FB8D22]/20 transition-all"
                            />

                            <button
                                type="button"
                                disabled={isLoading || !email}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!email) {
                                        return;
                                    }
                                    handleSendCode(e);
                                }}
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
                                            <span>Sending...</span>
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
                                                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                                />
                                            </svg>
                                            <span>Send Verification Code</span>
                                        </>
                                    )}
                                </span>
                                <div className="absolute inset-0 bg-gradient-to-r from-[#FB8D22] to-[#FB8D22] opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                        </motion.div>
                    )}
                    {step === "code" && (
                        <motion.div
                            key="code-step"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-4"
                        >
                            <div>
                                <p className="text-zinc-400 text-sm mb-2">
                                    Enter the 6-digit code sent to{" "}
                                    <span className="text-white font-medium">
                                        {contextEmail || localEmail || email}
                                    </span>
                                </p>
                                <input
                                    type="text"
                                    value={code}
                                    onChange={(e) =>
                                        setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                                    }
                                    placeholder="000000"
                                    maxLength={6}
                                    required
                                    className="w-full py-3 px-4 bg-zinc-900/70 border border-zinc-800 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FB8D22]/50 focus:ring-2 focus:ring-[#FB8D22]/20 transition-all text-center text-2xl tracking-widest font-mono"
                                />
                            </div>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStep("email");
                                        setCode("");
                                        clearError();
                                    }}
                                    className="flex-1 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors text-sm font-medium"
                                >
                                    Back
                                </button>
                                <button
                                    type="button"
                                    disabled={isLoading || code.length !== 6}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (code.length === 6) {
                                            handleLogin(e);
                                        }
                                    }}
                                    className="flex-1 relative overflow-hidden group py-4 px-6 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF5500] text-white font-semibold transition-all hover:shadow-xl hover:shadow-[#FB8D22]/25 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                                <span>Verifying...</span>
                                            </>
                                        ) : (
                                            "Verify & Login"
                                        )}
                                    </span>
                                    <div className="absolute inset-0 bg-gradient-to-r from-[#FB8D22] to-[#FB8D22] opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="bg-red-500/10 border border-red-500/30 rounded-xl p-3"
                        >
                            <p className="text-red-400 text-sm">{error}</p>
                        </motion.div>
                    )}
                </AnimatePresence>

                {step === "email" && (
                    <p className="text-center text-zinc-500 text-xs">
                        We'll send a verification code to your email
                    </p>
                )}
            </div>
        </motion.div>
    );
}

