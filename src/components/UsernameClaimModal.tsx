"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useUsername } from "@/hooks/useUsername";

type UsernameClaimModalProps = {
    isOpen: boolean;
    onClose: () => void;
    userAddress: string; // Can be EVM or Solana address
    currentUsername: string | null;
    onSuccess: (username: string) => void;
};

export function UsernameClaimModal({
    isOpen,
    onClose,
    userAddress,
    currentUsername,
    onSuccess,
}: UsernameClaimModalProps) {
    const [inputValue, setInputValue] = useState(currentUsername || "");
    const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);

    const { claimUsername, removeUsername, checkAvailability, isLoading, error, clearError } =
        useUsername(userAddress);

    // Sync input with currentUsername when modal opens
    useEffect(() => {
        if (isOpen) {
            setInputValue(currentUsername || "");
            setIsAvailable(currentUsername ? true : null);
        }
    }, [isOpen, currentUsername]);

    // Debounced availability check
    useEffect(() => {
        if (!inputValue || inputValue.length < 3) {
            setIsAvailable(null);
            return;
        }

        // Don't check if it's the current username
        if (inputValue.toLowerCase() === currentUsername?.toLowerCase()) {
            setIsAvailable(true);
            return;
        }

        const timer = setTimeout(async () => {
            setIsChecking(true);
            const available = await checkAvailability(inputValue);
            setIsAvailable(available);
            setIsChecking(false);
        }, 300);

        return () => clearTimeout(timer);
    }, [inputValue, checkAvailability, currentUsername]);

    const handleSubmit = useCallback(async () => {
        if (!inputValue || isLoading) return;

        const success = await claimUsername(inputValue);
        if (success) {
            onSuccess(inputValue.toLowerCase());
            onClose();
        }
    }, [inputValue, isLoading, claimUsername, onSuccess, onClose]);

    const handleRemove = useCallback(async () => {
        if (isRemoving || isLoading) return;
        
        if (!confirm("Are you sure you want to remove your username? This action cannot be undone.")) {
            return;
        }

        setIsRemoving(true);
        const success = await removeUsername();
        if (success) {
            onSuccess(""); // Empty string indicates removal
            onClose();
        }
        setIsRemoving(false);
    }, [isRemoving, isLoading, removeUsername, onSuccess, onClose]);

    const handleClose = useCallback(() => {
        clearError();
        onClose();
    }, [clearError, onClose]);

    const isValid =
        inputValue.length >= 3 &&
        inputValue.length <= 20 &&
        /^[a-zA-Z0-9_]+$/.test(inputValue);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md z-50"
                    >
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
                            {/* Header */}
                            <div className="p-6 border-b border-zinc-800">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-white">
                                            {currentUsername
                                                ? "Change Username"
                                                : "Claim Username"}
                                        </h2>
                                        <p className="text-zinc-500 text-sm mt-1">
                                            Choose a unique name so friends can
                                            find you
                                        </p>
                                    </div>
                                    <button
                                        onClick={handleClose}
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
                            </div>

                            {/* Content */}
                            <div className="p-6 space-y-4">
                                {/* Username Input */}
                                <div>
                                    <label className="block text-zinc-400 text-sm mb-2">
                                        Username
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={inputValue}
                                            onChange={(e) =>
                                                setInputValue(
                                                    e.target.value
                                                        .toLowerCase()
                                                        .replace(
                                                            /[^a-z0-9_]/g,
                                                            ""
                                                        )
                                                )
                                            }
                                            placeholder="e.g. kevin, vitalik"
                                            maxLength={20}
                                            className="w-full py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#FB8D22]/50 focus:ring-2 focus:ring-[#FB8D22]/20 transition-all"
                                        />
                                        {/* Status indicator */}
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            {isChecking && (
                                                <svg
                                                    className="w-5 h-5 text-zinc-500 animate-spin"
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
                                            )}
                                            {!isChecking &&
                                                isAvailable === true &&
                                                isValid && (
                                                    <svg
                                                        className="w-5 h-5 text-emerald-400"
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
                                            {!isChecking &&
                                                isAvailable === false && (
                                                    <svg
                                                        className="w-5 h-5 text-red-400"
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
                                                )}
                                        </div>
                                    </div>

                                    {/* Validation feedback */}
                                    <div className="mt-2 text-sm">
                                        {inputValue.length > 0 &&
                                            inputValue.length < 3 && (
                                                <p className="text-amber-400">
                                                    At least 3 characters
                                                    required
                                                </p>
                                            )}
                                        {isAvailable === false && (
                                            <p className="text-red-400">
                                                Username already taken
                                            </p>
                                        )}
                                        {isAvailable === true && isValid && (
                                            <p className="text-emerald-400">
                                                Username available!
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Preview */}
                                {inputValue && isValid && (
                                    <div className="bg-zinc-800/50 rounded-xl p-4">
                                        <p className="text-zinc-500 text-xs uppercase tracking-wide mb-2">
                                            Preview
                                        </p>
                                        <p className="text-white font-medium text-lg">
                                            @{inputValue}
                                        </p>
                                        <p className="text-zinc-500 text-sm mt-1">
                                            Friends can search for you using
                                            this name
                                        </p>
                                    </div>
                                )}

                                {/* Error */}
                                {error && (
                                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                                        <p className="text-red-400 text-sm">
                                            {error}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="p-6 border-t border-zinc-800 space-y-3">
                                {currentUsername && (
                                    <button
                                        onClick={handleRemove}
                                        disabled={isRemoving || isLoading}
                                        className="w-full py-3 px-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-medium transition-all hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {isRemoving ? (
                                            <>
                                                <svg
                                                    className="w-5 h-5 animate-spin"
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
                                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                    />
                                                </svg>
                                                Remove Username
                                            </>
                                        )}
                                    </button>
                                )}
                                <button
                                    onClick={handleSubmit}
                                    disabled={
                                        !isValid ||
                                        !isAvailable ||
                                        isLoading ||
                                        isChecking ||
                                        isRemoving
                                    }
                                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FF5500] text-white font-medium transition-all hover:shadow-lg hover:shadow-[#FB8D22]/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isLoading ? (
                                        <>
                                            <svg
                                                className="w-5 h-5 animate-spin"
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
                                            Claiming...
                                        </>
                                    ) : currentUsername ? (
                                        "Update Username"
                                    ) : (
                                        "Claim Username"
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
