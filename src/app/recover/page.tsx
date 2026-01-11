"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "motion/react";

export default function RecoverPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const codeFromUrl = searchParams.get("code");
    
    const [recoveryCode, setRecoveryCode] = useState(codeFromUrl || "");
    const [isChecking, setIsChecking] = useState(false);
    const [isRedeeming, setIsRedeeming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [codeInfo, setCodeInfo] = useState<{
        valid: boolean;
        maskedAddress?: string;
        expiresAt?: string;
    } | null>(null);
    const [success, setSuccess] = useState<{
        userAddress: string;
        recoveryToken: string;
        message: string;
    } | null>(null);

    // Check code validity when loaded from URL
    useEffect(() => {
        if (codeFromUrl) {
            checkCode(codeFromUrl);
        }
    }, [codeFromUrl]);

    const checkCode = async (code: string) => {
        if (!code || code.length < 6) return;
        
        setIsChecking(true);
        setError(null);
        
        try {
            const res = await fetch(`/api/passkey/recover?code=${encodeURIComponent(code)}`);
            const data = await res.json();
            
            if (data.valid) {
                setCodeInfo(data);
            } else {
                setError(data.error || "Invalid recovery code");
                setCodeInfo(null);
            }
        } catch (err) {
            setError("Failed to check recovery code");
        } finally {
            setIsChecking(false);
        }
    };

    const handleRedeem = async () => {
        if (!recoveryCode) return;
        
        setIsRedeeming(true);
        setError(null);
        
        try {
            const res = await fetch("/api/passkey/recover", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recoveryCode }),
            });
            
            const data = await res.json();
            
            if (res.ok && data.success) {
                setSuccess(data);
                // Store recovery token for registration flow
                localStorage.setItem("spritz_recovery_token", data.recoveryToken);
                localStorage.setItem("spritz_recovery_address", data.userAddress);
            } else {
                setError(data.error || "Failed to redeem recovery code");
            }
        } catch (err) {
            setError("Failed to redeem recovery code");
        } finally {
            setIsRedeeming(false);
        }
    };

    const handleRegisterNewPasskey = () => {
        // Navigate to main page where passkey registration can happen
        router.push("/?recover=true");
    };

    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md"
            >
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
                    {/* Header */}
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">
                            Passkey Recovery
                        </h1>
                        <p className="text-zinc-400 text-sm">
                            Enter your recovery code to regain access to your account
                        </p>
                    </div>

                    {/* Success State */}
                    {success ? (
                        <div className="space-y-4">
                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-emerald-400 font-semibold">Recovery Code Accepted</span>
                                </div>
                                <p className="text-zinc-300 text-sm">{success.message}</p>
                                <p className="text-zinc-500 text-xs mt-2 font-mono">
                                    Account: {success.userAddress.slice(0, 10)}...{success.userAddress.slice(-6)}
                                </p>
                            </div>
                            
                            <button
                                onClick={handleRegisterNewPasskey}
                                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold hover:opacity-90 transition-opacity"
                            >
                                Register New Passkey
                            </button>
                            
                            <p className="text-zinc-500 text-xs text-center">
                                You have 10 minutes to complete registration
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Error Display */}
                            {error && (
                                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            {/* Code Info Display */}
                            {codeInfo?.valid && (
                                <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                                    <p className="text-emerald-400 text-sm font-medium">✓ Valid recovery code</p>
                                    <p className="text-zinc-400 text-xs mt-1">
                                        Account: {codeInfo.maskedAddress}
                                    </p>
                                    {codeInfo.expiresAt && (
                                        <p className="text-zinc-500 text-xs mt-1">
                                            Expires: {new Date(codeInfo.expiresAt).toLocaleString()}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Recovery Code Input */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-zinc-400 text-sm mb-2">
                                        Recovery Code
                                    </label>
                                    <input
                                        type="text"
                                        value={recoveryCode}
                                        onChange={(e) => {
                                            setRecoveryCode(e.target.value.toUpperCase());
                                            setError(null);
                                        }}
                                        onBlur={() => checkCode(recoveryCode)}
                                        placeholder="Enter your recovery code"
                                        className="w-full py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white font-mono text-center text-lg tracking-wider placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20"
                                        autoFocus
                                    />
                                </div>

                                <button
                                    onClick={handleRedeem}
                                    disabled={!recoveryCode || isRedeeming || isChecking}
                                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isRedeeming || isChecking ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            {isChecking ? "Checking..." : "Verifying..."}
                                        </>
                                    ) : (
                                        "Recover Account"
                                    )}
                                </button>
                            </div>

                            {/* Help Text */}
                            <div className="mt-6 pt-6 border-t border-zinc-800">
                                <p className="text-zinc-500 text-xs text-center">
                                    Recovery codes were provided when you first registered your passkey.
                                    If you don't have your recovery code, please contact support.
                                </p>
                            </div>
                        </>
                    )}

                    {/* Back to Login */}
                    <div className="mt-4 text-center">
                        <a
                            href="/"
                            className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                        >
                            ← Back to login
                        </a>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
