"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { startRegistration } from "@simplewebauthn/browser";
import { RecoverySignerManager } from "./RecoverySignerManager";

type PasskeyCredential = {
    id: string;
    credentialId: string;
    deviceName: string;
    createdAt: string;
    lastUsedAt: string | null;
    backedUp: boolean;
    isWalletKey?: boolean; // This passkey is an actual Safe owner
    walletKeyStatus?: "active" | "not_owner" | "safe_not_deployed" | "no_signer";
};

type Props = {
    userAddress: string;
    onClose?: () => void;
    /** If true, user needs passkey to access their wallet (email/digitalid users) */
    passkeyIsWalletKey?: boolean;
    /** Smart wallet address controlled by passkey */
    smartWalletAddress?: string | null;
};

// Detect user's platform for backup guidance
function detectPlatform(): "apple" | "android" | "windows" | "other" {
    if (typeof navigator === "undefined") return "other";
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("mac")) return "apple";
    if (ua.includes("android")) return "android";
    if (ua.includes("windows")) return "windows";
    return "other";
}

export function PasskeyManager({ userAddress, onClose, passkeyIsWalletKey, smartWalletAddress }: Props) {
    const [credentials, setCredentials] = useState<PasskeyCredential[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [showDeleteWarning, setShowDeleteWarning] = useState<string | null>(null);
    const [showBackupTips, setShowBackupTips] = useState(false);
    const [showRecoverySigner, setShowRecoverySigner] = useState(false);
    
    const platform = detectPlatform();
    const hasSyncedPasskey = credentials.some(c => c.backedUp);
    const hasOnlyDevicePasskeys = credentials.length > 0 && !hasSyncedPasskey;

    const fetchCredentials = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/passkey/credentials", {
                credentials: "include", // Send session cookie
            });
            
            if (!response.ok) {
                throw new Error("Failed to fetch passkeys");
            }

            const data = await response.json();
            setCredentials(data.credentials || []);
        } catch (err) {
            console.error("[PasskeyManager] Error fetching credentials:", err);
            setError("Failed to load passkeys");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCredentials();
    }, [fetchCredentials]);

    const handleDeleteClick = (id: string) => {
        // If this passkey controls the wallet and it's the only one, show serious warning
        if (passkeyIsWalletKey && credentials.length === 1) {
            setShowDeleteWarning(id);
        } else if (passkeyIsWalletKey) {
            // Multiple passkeys but still warn
            if (!confirm("Remove this passkey?\n\nNote: Your other passkey(s) will still control your wallet.")) {
                return;
            }
            performDelete(id);
        } else {
            // Non-wallet passkey, simple confirm
            if (!confirm("Are you sure you want to remove this passkey?")) {
                return;
            }
            performDelete(id);
        }
    };

    const performDelete = async (id: string) => {
        try {
            setDeletingId(id);
            setError(null);
            setShowDeleteWarning(null);

            const response = await fetch(`/api/passkey/credentials?id=${id}`, {
                method: "DELETE",
                credentials: "include",
            });

            if (!response.ok) {
                throw new Error("Failed to delete passkey");
            }

            setCredentials(prev => prev.filter(c => c.id !== id));
            setSuccess("Passkey removed successfully");
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            console.error("[PasskeyManager] Error deleting credential:", err);
            setError("Failed to remove passkey");
        } finally {
            setDeletingId(null);
        }
    };

    const handleAddPasskey = async () => {
        try {
            setIsAdding(true);
            setError(null);

            // Get registration options
            const optionsResponse = await fetch("/api/passkey/register/options", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAddress,
                    displayName: "Spritz User",
                }),
                credentials: "include", // Send session cookie
            });

            if (!optionsResponse.ok) {
                const error = await optionsResponse.json();
                throw new Error(error.error || "Failed to get registration options");
            }

            const { options } = await optionsResponse.json();

            // Create credential
            const credential = await startRegistration({ optionsJSON: options });

            // Verify and store - server will check if user is authenticated
            // and link to existing account if so
            const verifyResponse = await fetch("/api/passkey/register/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAddress,
                    displayName: "Spritz User",
                    credential,
                    challenge: options.challenge,
                }),
                credentials: "include", // Send session cookie - server will link to existing account
            });

            if (!verifyResponse.ok) {
                const error = await verifyResponse.json();
                throw new Error(error.error || "Failed to verify registration");
            }

            setSuccess("New passkey added successfully!");
            setTimeout(() => setSuccess(null), 3000);
            
            // Refresh the list
            await fetchCredentials();
        } catch (err) {
            console.error("[PasskeyManager] Error adding passkey:", err);
            setError(err instanceof Error ? err.message : "Failed to add passkey");
        } finally {
            setIsAdding(false);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 max-w-md w-full"
        >
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <svg className="w-5 h-5 text-[#FF5500]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                    </svg>
                    Manage Passkeys
                </h3>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-zinc-400 hover:text-white transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Warning: Passkey controls wallet */}
            {passkeyIsWalletKey && credentials.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
                    <div className="flex items-start gap-2">
                        <span className="text-amber-400">🔑</span>
                        <div className="text-xs">
                            <p className="text-amber-300 font-medium">Your passkey is your wallet key</p>
                            <p className="text-zinc-400 mt-0.5">
                                Deleting your passkey will make your wallet inaccessible.
                                {smartWalletAddress && (
                                    <span className="block mt-1 font-mono text-amber-400/70">
                                        {smartWalletAddress.slice(0, 10)}...{smartWalletAddress.slice(-6)}
                                    </span>
                                )}
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
                        className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4"
                    >
                        <p className="text-red-400 text-sm">{error}</p>
                    </motion.div>
                )}
                {success && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 mb-4"
                    >
                        <p className="text-emerald-400 text-sm">{success}</p>
                    </motion.div>
                )}
                
                {/* Serious warning modal for deleting last wallet-key passkey */}
                {showDeleteWarning && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
                        onClick={() => setShowDeleteWarning(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.9 }}
                            className="bg-zinc-900 border border-red-500/50 rounded-2xl p-6 max-w-sm w-full"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="text-center mb-4">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                                    <span className="text-3xl">⚠️</span>
                                </div>
                                <h3 className="text-lg font-bold text-red-400">Delete Wallet Access?</h3>
                            </div>
                            
                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4">
                                <p className="text-sm text-red-300 font-medium mb-2">
                                    This is your ONLY passkey!
                                </p>
                                <p className="text-xs text-zinc-400">
                                    If you delete it, you will <strong className="text-red-400">permanently lose access</strong> to your wallet and any funds in it.
                                </p>
                                {smartWalletAddress && (
                                    <p className="text-xs text-red-400/80 mt-2 font-mono">
                                        Wallet: {smartWalletAddress.slice(0, 10)}...{smartWalletAddress.slice(-6)}
                                    </p>
                                )}
                            </div>
                            
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowDeleteWarning(null)}
                                    className="flex-1 py-2 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => performDelete(showDeleteWarning)}
                                    className="flex-1 py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                                >
                                    Delete Anyway
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="space-y-3 mb-4">
                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <svg className="animate-spin h-6 w-6 text-zinc-400" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                    </div>
                ) : credentials.length === 0 ? (
                    <div className="text-center py-6 text-zinc-400 text-sm">
                        <p>No passkeys registered</p>
                        <p className="text-xs text-zinc-500 mt-1">Add a passkey for quick, secure login</p>
                    </div>
                ) : (
                    credentials.map((credential) => (
                        <motion.div
                            key={credential.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="bg-zinc-800/50 rounded-xl p-4"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                        credential.isWalletKey
                                            ? "bg-amber-500/20 text-amber-400"
                                            : credential.walletKeyStatus === "not_owner"
                                                ? "bg-red-500/20 text-red-400"
                                                : credential.backedUp 
                                                    ? "bg-blue-500/20 text-blue-400" 
                                                    : "bg-zinc-700 text-zinc-400"
                                    }`}>
                                        {credential.isWalletKey ? (
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                            </svg>
                                        ) : credential.walletKeyStatus === "not_owner" ? (
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                        ) : credential.backedUp ? (
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                                            </svg>
                                        ) : (
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                            </svg>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-white text-sm font-medium flex items-center gap-1.5">
                                            {credential.isWalletKey ? (
                                                <>
                                                    <span>Wallet Key</span>
                                                    <span className="text-amber-400 text-xs">🔐</span>
                                                </>
                                            ) : credential.walletKeyStatus === "not_owner" ? (
                                                <>
                                                    <span>Login Only</span>
                                                    <span className="text-red-400 text-xs">⚠️</span>
                                                </>
                                            ) : credential.backedUp ? (
                                                "Synced Passkey"
                                            ) : (
                                                "Device Passkey"
                                            )}
                                        </p>
                                        <p className="text-zinc-500 text-xs">
                                            Added {formatDate(credential.createdAt)}
                                        </p>
                                    </div>
                                </div>
                                
                                {/* Only show delete button for non-wallet passkeys */}
                                {!credential.isWalletKey && (
                                    <button
                                        onClick={() => handleDeleteClick(credential.id)}
                                        disabled={deletingId === credential.id}
                                        className="text-red-400 hover:text-red-300 transition-colors p-2 hover:bg-red-500/10 rounded-lg disabled:opacity-50"
                                        title="Remove passkey"
                                    >
                                        {deletingId === credential.id ? (
                                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                        ) : (
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        )}
                                    </button>
                                )}
                            </div>
                            
                            {/* Explanation for wallet-controlling passkeys */}
                            {credential.isWalletKey && (
                                <div className="mt-2 bg-amber-500/10 rounded-lg px-3 py-2">
                                    <p className="text-xs text-amber-300/90">
                                        🔒 This passkey controls your Spritz Smart Account and cannot be deleted. 
                                        Deleting it would permanently lock you out of your funds.
                                    </p>
                                </div>
                            )}
                            
                            {/* Warning for passkeys that have a signer but aren't Safe owners */}
                            {credential.walletKeyStatus === "not_owner" && (
                                <div className="mt-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                                    <p className="text-xs text-red-300/90">
                                        ⚠️ This passkey cannot sign wallet transactions. It was created during recovery 
                                        but is not an owner of your existing Safe wallet.
                                    </p>
                                    <p className="text-xs text-zinc-400 mt-1">
                                        To use this passkey for transactions, add it as a recovery signer from another device 
                                        that has your original passkey.
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    ))
                )}
            </div>

            {/* Warning for users with only device-bound passkeys */}
            {hasOnlyDevicePasskeys && passkeyIsWalletKey && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
                    <div className="flex items-start gap-2">
                        <span className="text-amber-400 text-sm">⚠️</span>
                        <div className="text-xs">
                            <p className="text-amber-300 font-medium">Your passkey isn&apos;t backed up</p>
                            <p className="text-zinc-400 mt-0.5">
                                If you lose this device, you&apos;ll lose wallet access. Add a backup passkey or enable cloud sync.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <button
                onClick={handleAddPasskey}
                disabled={isAdding}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FB8D22] text-white font-medium transition-all hover:shadow-lg hover:shadow-[#FF5500]/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                {isAdding ? (
                    <>
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span>Adding...</span>
                    </>
                ) : (
                    <>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>{credentials.length > 0 ? "Add Backup Passkey" : "Add Passkey"}</span>
                    </>
                )}
            </button>

            {/* Backup Tips Section */}
            <div className="mt-4">
                <button
                    onClick={() => setShowBackupTips(!showBackupTips)}
                    className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-300 transition-colors py-2"
                >
                    <span className="flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        How to backup passkeys
                    </span>
                    <svg 
                        className={`w-4 h-4 transition-transform ${showBackupTips ? "rotate-180" : ""}`} 
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                
                <AnimatePresence>
                    {showBackupTips && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3 text-xs">
                                <p className="text-zinc-300 font-medium">Passkeys can&apos;t be exported, but you can:</p>
                                
                                <div className="space-y-2">
                                    <div className="flex items-start gap-2">
                                        <span className="text-emerald-400">✓</span>
                                        <div>
                                            <p className="text-zinc-300 font-medium">Add multiple passkeys</p>
                                            <p className="text-zinc-500">Create passkeys on different devices as backups</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-start gap-2">
                                        <span className="text-emerald-400">✓</span>
                                        <div>
                                            <p className="text-zinc-300 font-medium">Use cloud sync</p>
                                            <p className="text-zinc-500">
                                                {platform === "apple" && "Enable iCloud Keychain in Settings → [Your Name] → iCloud → Passwords & Keychain"}
                                                {platform === "android" && "Enable Google Password Manager sync in Settings → Google → Passwords"}
                                                {platform === "windows" && "Use a browser with sync (Chrome, Edge) or add a YubiKey as backup"}
                                                {platform === "other" && "Enable password sync in your browser or use a hardware key"}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-start gap-2">
                                        <span className="text-emerald-400">✓</span>
                                        <div>
                                            <p className="text-zinc-300 font-medium">Use a hardware key</p>
                                            <p className="text-zinc-500">YubiKey 5 series supports passkeys as a physical backup</p>
                                        </div>
                                    </div>
                                </div>

                                {hasSyncedPasskey ? (
                                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2 mt-2">
                                        <p className="text-emerald-400 flex items-center gap-1.5">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            You have a synced passkey - you&apos;re protected!
                                        </p>
                                    </div>
                                ) : credentials.length > 0 ? (
                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 mt-2">
                                        <p className="text-amber-400">
                                            💡 Your passkey is device-only. Consider adding a backup.
                                        </p>
                                    </div>
                                ) : null}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Recovery Signer Section - for passkey wallet users */}
            {passkeyIsWalletKey && smartWalletAddress && (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                    <button
                        onClick={() => setShowRecoverySigner(true)}
                        className="w-full flex items-center justify-between bg-zinc-800/50 hover:bg-zinc-800 rounded-xl p-3 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <span className="text-lg">🔐</span>
                            <div className="text-left">
                                <p className="text-sm text-zinc-300 font-medium">Recovery Signer</p>
                                <p className="text-xs text-zinc-500">Add a backup wallet for emergencies</p>
                            </div>
                        </div>
                        <span className="text-zinc-500">→</span>
                    </button>
                </div>
            )}

            {/* Recovery Signer Modal */}
            <AnimatePresence>
                {showRecoverySigner && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[70] flex items-center justify-center p-4"
                        onClick={() => setShowRecoverySigner(false)}
                    >
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="relative z-10 w-full max-w-md"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <RecoverySignerManager
                                onClose={() => setShowRecoverySigner(false)}
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
