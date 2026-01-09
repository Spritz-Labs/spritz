"use client";

import { useState } from "react";
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import { useAlienAuthContext } from "@/context/AlienAuthProvider";
import { useWorldIdContext } from "@/context/WorldIdProvider";
import {
    IDKitWidget,
    VerificationLevel,
    type ISuccessResult,
} from "@worldcoin/idkit";

// Dynamically import SignInButton to avoid SSR issues
const SignInButton = dynamic(
    () => import("@alien_org/sso-sdk-react").then((mod) => mod.SignInButton),
    {
        ssr: false,
        loading: () => (
            <div className="w-full h-12 bg-zinc-800 rounded-xl animate-pulse" />
        ),
    }
);

export function AlienAuth() {
    const {
        isAuthenticated: isAlienAuthenticated,
        alienAddress,
        isLoading: isAlienLoading,
        logout: alienLogout,
    } = useAlienAuthContext();

    const {
        isAuthenticated: isWorldIdAuthenticated,
        worldIdAddress,
        verificationLevel,
        isLoading: isWorldIdLoading,
        setAuthenticated: setWorldIdAuthenticated,
        logout: worldIdLogout,
    } = useWorldIdContext();

    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // World ID configuration
    const worldIdAppId = process.env.NEXT_PUBLIC_WORLD_ID_APP_ID as `app_${string}` | undefined;
    const worldIdAction = process.env.NEXT_PUBLIC_WORLD_ID_ACTION;

    // Handle World ID proof verification
    const handleWorldIdVerify = async (proof: ISuccessResult) => {
        setVerifying(true);
        setError(null);
        
        try {
            const res = await fetch("/api/auth/world-id", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(proof),
            });
            
            const data = await res.json();
            
            if (!res.ok || !data.success) {
                throw new Error(data.error || data.detail || "Verification failed");
            }
            
            // Set authenticated state
            setWorldIdAuthenticated(
                data.nullifier_hash,
                data.verification_level === "orb" ? "orb" : "device"
            );
        } catch (err) {
            console.error("[WorldId] Verification error:", err);
            setError(err instanceof Error ? err.message : "Verification failed");
            throw err; // IDKit will display error
        } finally {
            setVerifying(false);
        }
    };

    const onWorldIdSuccess = () => {
        console.log("[WorldId] Modal closed successfully");
    };

    // Combined loading state
    const isLoading = isAlienLoading || isWorldIdLoading;
    
    // Check if either is authenticated
    const isAuthenticated = isAlienAuthenticated || isWorldIdAuthenticated;
    const currentAddress = alienAddress || worldIdAddress;
    const authProvider = isAlienAuthenticated ? "Alien" : isWorldIdAuthenticated ? "World ID" : null;

    const formatAddress = (addr: string) => {
        if (addr.length <= 12) return addr;
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    const handleLogout = () => {
        if (isAlienAuthenticated) {
            alienLogout();
        } else if (isWorldIdAuthenticated) {
            worldIdLogout();
        }
    };

    // Show connected state
    if (isAuthenticated && currentAddress) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full"
            >
                <div className="bg-gradient-to-br from-[#FF5500]/10 to-[#FB8D22]/10 border border-[#FF5500]/30 rounded-2xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FB8D22] to-[#FF5500] flex items-center justify-center">
                            {isWorldIdAuthenticated ? (
                                <span className="text-lg">🌐</span>
                            ) : (
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
                            )}
                        </div>
                        <div>
                            <p className="text-[#FF5500] font-semibold">
                                Digital ID Connected
                            </p>
                            <p className="text-zinc-400 text-sm">
                                Signed in with {authProvider}
                                {verificationLevel === "orb" && " (Orb Verified)"}
                            </p>
                        </div>
                    </div>

                    <div className="bg-black/30 rounded-xl p-4 mb-4">
                        <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">
                            Identity
                        </p>
                        <p className="text-white font-mono text-sm">
                            {formatAddress(currentAddress)}
                        </p>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="w-full py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors text-sm font-medium"
                    >
                        Disconnect
                    </button>
                </div>
            </motion.div>
        );
    }

    // Show loading state
    if (isLoading) {
        return (
            <div className="w-full flex flex-col items-center justify-center gap-4 py-8">
                <div className="w-8 h-8 border-2 border-[#FF5500] border-t-transparent rounded-full animate-spin" />
                <p className="text-zinc-400 text-sm">Loading...</p>
            </div>
        );
    }

    // Show sign-in options
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="w-full flex flex-col items-center justify-center gap-4"
        >
            <div className="text-center mb-2">
                <h3 className="text-white font-semibold mb-1">Sign in with Digital ID</h3>
                <p className="text-zinc-500 text-sm">
                    Verify your identity with World ID or Alien
                </p>
            </div>

            {error && (
                <div className="w-full p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm text-center">
                    {error}
                </div>
            )}

            {/* World ID Button */}
            {worldIdAppId && worldIdAction && (
                <div className="w-full flex items-center justify-center min-h-[48px]">
                    <IDKitWidget
                        app_id={worldIdAppId}
                        action={worldIdAction}
                        onSuccess={onWorldIdSuccess}
                        handleVerify={handleWorldIdVerify}
                        verification_level={VerificationLevel.Orb}
                    >
                        {({ open }) => (
                            <button
                                onClick={open}
                                disabled={verifying}
                                className="w-full h-12 px-6 rounded-lg bg-black border border-zinc-700 hover:border-zinc-500 text-white font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {/* World ID Logo */}
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                                    <circle cx="12" cy="12" r="4" fill="currentColor"/>
                                </svg>
                                <span>{verifying ? "Verifying..." : "Sign in with World ID"}</span>
                            </button>
                        )}
                    </IDKitWidget>
                </div>
            )}

            {/* Divider - only show if both options are available */}
            {worldIdAppId && worldIdAction && (
                <div className="flex items-center gap-3 w-full my-1">
                    <div className="flex-1 h-px bg-zinc-800"></div>
                    <span className="text-zinc-600 text-xs">OR</span>
                    <div className="flex-1 h-px bg-zinc-800"></div>
                </div>
            )}

            {/* Alien Sign In Button */}
            <div className="w-full flex items-center justify-center min-h-[48px]">
                <div className="w-full">
                    <SignInButton color="dark" />
                </div>
            </div>

            <p className="text-center text-zinc-600 text-xs mt-2">
                {worldIdAppId && worldIdAction ? "World ID • Alien SSO" : "Powered by Alien SSO"}
            </p>
        </motion.div>
    );
}
