"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useEmailVerification } from "@/hooks/useEmailVerification";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    walletAddress: string;
    onVerified?: () => void;
};

export function EmailVerificationModal({ isOpen, onClose, walletAddress, onVerified }: Props) {
    const {
        email,
        isVerified,
        isSending,
        isVerifying,
        error,
        codeSent,
        sendCode,
        verifyCode,
        reset,
        removeEmail,
        startChangeEmail,
        clearError,
    } = useEmailVerification(walletAddress);

    const [emailInput, setEmailInput] = useState("");
    const [codeInput, setCodeInput] = useState("");
    const [isChangingEmail, setIsChangingEmail] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const codeInputRef = useRef<HTMLInputElement>(null);

    // Focus code input when code is sent
    useEffect(() => {
        if (codeSent && codeInputRef.current) {
            codeInputRef.current.focus();
        }
    }, [codeSent]);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            if (!isVerified) {
                reset();
            }
            setCodeInput("");
            setEmailInput("");
            setIsChangingEmail(false);
            setIsRemoving(false);
            clearError();
        }
    }, [isOpen, isVerified, reset, clearError]);

    const handleSendCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!emailInput || isSending) return;
        const success = await sendCode(emailInput);
        if (success) {
            setCodeInput("");
        }
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!codeInput || codeInput.length !== 6 || isVerifying) return;
        const success = await verifyCode(codeInput);
        if (success) {
            onVerified?.();
            setTimeout(onClose, 1500); // Close after showing success
        }
    };

    const isEmailValid = () => {
        return emailInput.includes("@") && emailInput.includes(".");
    };

    const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/\D/g, "").slice(0, 6);
        setCodeInput(value);
    };

    return (
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
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md z-50"
                    >
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
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
                                    <h2 className="text-xl font-bold text-white">
                                        {isVerified ? "Email Verified" : "Verify Email"}
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

                            {/* Already verified state */}
                            {isVerified && !isChangingEmail && (
                                <div className="space-y-6">
                                    <div className="text-center py-4">
                                        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                            <svg
                                                className="w-8 h-8 text-emerald-400"
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
                                        <p className="text-lg text-white font-medium mb-2">
                                            Email Verified
                                        </p>
                                        <p className="text-zinc-400">
                                            {email}
                                        </p>
                                        <p className="text-emerald-400 text-sm mt-2">
                                            +100 points earned!
                                        </p>
                                    </div>

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

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => {
                                                setIsChangingEmail(true);
                                                setEmailInput("");
                                                startChangeEmail();
                                            }}
                                            className="flex-1 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors"
                                        >
                                            Change Email
                                        </button>
                                        <button
                                            onClick={async () => {
                                                setIsRemoving(true);
                                                const success = await removeEmail();
                                                setIsRemoving(false);
                                                if (success) {
                                                    onVerified?.(); // Refresh parent state
                                                    onClose();
                                                }
                                            }}
                                            disabled={isRemoving}
                                            className="flex-1 py-3 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-medium transition-colors disabled:opacity-50"
                                        >
                                            {isRemoving ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <svg
                                                        className="animate-spin h-4 w-4"
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
                                                    Removing...
                                                </span>
                                            ) : (
                                                "Remove"
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Email input form */}
                            {((!isVerified && !codeSent) || isChangingEmail) && (
                                <form onSubmit={handleSendCode} className="space-y-4">
                                    {isChangingEmail && (
                                        <button
                                            type="button"
                                            onClick={() => setIsChangingEmail(false)}
                                            className="flex items-center gap-1 text-zinc-400 hover:text-white text-sm transition-colors mb-2"
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
                                                    d="M15 19l-7-7 7-7"
                                                />
                                            </svg>
                                            Back
                                        </button>
                                    )}
                                    <p className="text-zinc-400 text-sm">
                                        {isChangingEmail
                                            ? "Enter your new email address. We'll send a 6-digit verification code."
                                            : "Verify your email to earn 100 points and receive important notifications."}
                                    </p>

                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-2">
                                            Email Address
                                        </label>
                                        <input
                                            type="email"
                                            value={emailInput}
                                            onChange={(e) => setEmailInput(e.target.value)}
                                            placeholder="your@email.com"
                                            className="w-full py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                                            autoFocus
                                        />
                                    </div>

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

                                    <button
                                        type="submit"
                                        disabled={!emailInput || !isEmailValid() || isSending}
                                        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium transition-all hover:shadow-lg hover:shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSending ? (
                                            <span className="flex items-center justify-center gap-2">
                                                <svg
                                                    className="animate-spin h-4 w-4"
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
                                                Sending...
                                            </span>
                                        ) : (
                                            "Send Verification Code"
                                        )}
                                    </button>
                                </form>
                            )}

                            {/* Code input form */}
                            {!isVerified && codeSent && !isChangingEmail && (
                                <form onSubmit={handleVerify} className="space-y-4">
                                    <p className="text-zinc-400 text-sm">
                                        We sent a 6-digit code to{" "}
                                        <span className="text-white font-medium">{emailInput}</span>
                                    </p>

                                    <div>
                                        <label className="block text-sm font-medium text-zinc-400 mb-2">
                                            Verification Code
                                        </label>
                                        <input
                                            ref={codeInputRef}
                                            type="text"
                                            inputMode="numeric"
                                            value={codeInput}
                                            onChange={handleCodeChange}
                                            placeholder="000000"
                                            className="w-full py-4 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all text-2xl tracking-[0.5em] text-center font-mono"
                                            maxLength={6}
                                        />
                                    </div>

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

                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                reset();
                                                setCodeInput("");
                                            }}
                                            className="flex-1 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
                                        >
                                            Change Email
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={codeInput.length !== 6 || isVerifying}
                                            className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium transition-all hover:shadow-lg hover:shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isVerifying ? (
                                                <span className="flex items-center justify-center gap-2">
                                                    <svg
                                                        className="animate-spin h-4 w-4"
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
                                                    Verifying...
                                                </span>
                                            ) : (
                                                "Verify"
                                            )}
                                        </button>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => sendCode(emailInput)}
                                        className="w-full py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
                                    >
                                        Didn&apos;t receive the code? Send again
                                    </button>
                                </form>
                            )}

                            {/* Success state (just verified) */}
                            {!isVerified && isVerifying === false && codeSent === false && error === null && email && (
                                <div className="text-center py-6">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                        <svg
                                            className="w-8 h-8 text-emerald-400"
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
                                    <p className="text-lg text-white font-medium">Verified!</p>
                                    <p className="text-zinc-400 text-sm mt-1">
                                        Your email has been verified.
                                    </p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
