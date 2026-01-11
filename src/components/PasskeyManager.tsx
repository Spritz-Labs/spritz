"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { startRegistration } from "@simplewebauthn/browser";

type PasskeyCredential = {
    id: string;
    credentialId: string;
    deviceName: string;
    createdAt: string;
    lastUsedAt: string | null;
    backedUp: boolean;
};

type Props = {
    userAddress: string;
    onClose?: () => void;
};

export function PasskeyManager({ userAddress, onClose }: Props) {
    const [credentials, setCredentials] = useState<PasskeyCredential[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const fetchCredentials = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await fetch("/api/passkey/credentials");
            
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

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to remove this passkey? This cannot be undone.")) {
            return;
        }

        try {
            setDeletingId(id);
            setError(null);

            const response = await fetch(`/api/passkey/credentials?id=${id}`, {
                method: "DELETE",
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
            });

            if (!optionsResponse.ok) {
                const error = await optionsResponse.json();
                throw new Error(error.error || "Failed to get registration options");
            }

            const { options } = await optionsResponse.json();

            // Create credential
            const credential = await startRegistration({ optionsJSON: options });

            // Verify and store
            const verifyResponse = await fetch("/api/passkey/register/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userAddress,
                    displayName: "Spritz User",
                    credential,
                    challenge: options.challenge,
                }),
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
                            className="bg-zinc-800/50 rounded-xl p-4 flex items-center justify-between"
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                    credential.backedUp 
                                        ? "bg-blue-500/20 text-blue-400" 
                                        : "bg-zinc-700 text-zinc-400"
                                }`}>
                                    {credential.backedUp ? (
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
                                    <p className="text-white text-sm font-medium">
                                        {credential.backedUp ? "Synced Passkey" : "Device Passkey"}
                                    </p>
                                    <p className="text-zinc-500 text-xs">
                                        Added {formatDate(credential.createdAt)}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => handleDelete(credential.id)}
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
                        </motion.div>
                    ))
                )}
            </div>

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
                        <span>Add New Passkey</span>
                    </>
                )}
            </button>

            <p className="text-center text-zinc-500 text-xs mt-3">
                Synced passkeys work across your devices via iCloud, Google, etc.
            </p>
        </motion.div>
    );
}
