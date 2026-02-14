"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useUsername } from "@/hooks/useUsername";

const PUSH_PROMPTED_KEY = "spritz_push_prompted";
const PUSH_NEVER_ASK_KEY = "spritz_push_never_ask"; // User clicked "Don't Ask Again"

// Helper to check if user has set "never ask" - checks all possible key formats
function hasNeverAskFlag(userAddress: string): boolean {
    if (!userAddress) return false;
    
    const normalizedAddress = userAddress.toLowerCase();
    const key = `${PUSH_NEVER_ASK_KEY}_${normalizedAddress}`;
    
    try {
        const value = localStorage.getItem(key);
        if (value === "true") {
            console.log("[PushNotificationPrompt] Found neverAsk flag for:", normalizedAddress.slice(0, 10));
            return true;
        }
        
        // Also check without address suffix (legacy)
        const legacyValue = localStorage.getItem(PUSH_NEVER_ASK_KEY);
        if (legacyValue === "true") {
            console.log("[PushNotificationPrompt] Found legacy neverAsk flag");
            return true;
        }
    } catch (e) {
        console.error("[PushNotificationPrompt] Error reading localStorage:", e);
    }
    
    return false;
}

// Helper to set the "never ask" flag
function setNeverAskFlag(userAddress: string): void {
    if (!userAddress) return;
    
    const normalizedAddress = userAddress.toLowerCase();
    const key = `${PUSH_NEVER_ASK_KEY}_${normalizedAddress}`;
    
    try {
        localStorage.setItem(key, "true");
        // Also set the prompted flag for consistency
        localStorage.setItem(`${PUSH_PROMPTED_KEY}_${normalizedAddress}`, "true");
        console.log("[PushNotificationPrompt] Set neverAsk flag for:", normalizedAddress.slice(0, 10));
    } catch (e) {
        console.error("[PushNotificationPrompt] Error writing localStorage:", e);
    }
}

type PushNotificationPromptProps = {
    userAddress: string | null;
    isSupported: boolean;
    isSubscribed: boolean;
    permission: NotificationPermission;
    onEnable: () => Promise<boolean>;
    onSkip: () => void;
};

export function PushNotificationPrompt({
    userAddress,
    isSupported,
    isSubscribed,
    permission,
    onEnable,
    onSkip,
}: PushNotificationPromptProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [usernameInput, setUsernameInput] = useState("");
    const [isChecking, setIsChecking] = useState(false);
    const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
    const [isClaiming, setIsClaiming] = useState(false);
    
    // Use ref to track if we've already shown the prompt / auto-enabled in this session
    const hasShownRef = useRef(false);
    const autoEnableAttemptedRef = useRef(false);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    // Track if we've done the initial neverAsk check
    const initialCheckDoneRef = useRef(false);
    
    const { username: currentUsername, isFetching: isUsernameFetching, claimUsername, checkAvailability } = useUsername(userAddress);

    // Use a ref to track the latest username value to avoid stale closures in setTimeout
    const currentUsernameRef = useRef(currentUsername);
    useEffect(() => {
        currentUsernameRef.current = currentUsername;
    }, [currentUsername]);

    // SYNCHRONOUS CHECK: Run immediately when userAddress becomes available
    const shouldNeverShow = useCallback(() => {
        if (!userAddress) return false;
        return hasNeverAskFlag(userAddress);
    }, [userAddress]);

    // Auto-enable push notifications silently (browser's native prompt is the confirmation)
    // This replaces the old "Never Miss a Call" step entirely.
    useEffect(() => {
        if (autoEnableAttemptedRef.current) return;
        if (!userAddress || !isSupported) return;
        if (isSubscribed) return; // Already subscribed
        if (permission === "denied") return; // User already denied via browser
        if (shouldNeverShow()) return; // User clicked "Don't Ask Again"

        // Wait for username fetch to complete
        if (isUsernameFetching) return;

        // Check if already prompted for this address
        const promptedKey = `${PUSH_PROMPTED_KEY}_${userAddress.toLowerCase()}`;
        const hasPrompted = localStorage.getItem(promptedKey);
        if (hasPrompted && permission === "granted") return; // Already set up

        // Auto-enable after a short delay to let the app settle
        const timer = setTimeout(async () => {
            if (autoEnableAttemptedRef.current) return;
            autoEnableAttemptedRef.current = true;

            console.log("[PushNotificationPrompt] Auto-requesting notification permission (browser native prompt)");
            
            // Store prompted flag
            localStorage.setItem(promptedKey, "true");
            
            // This triggers the browser's native permission dialog
            // No custom UI needed - the native dialog IS the confirmation
            try {
                await onEnable();
                console.log("[PushNotificationPrompt] Auto-enable completed");
            } catch (err) {
                console.error("[PushNotificationPrompt] Auto-enable failed:", err);
            }
        }, 3000); // 3s delay - let the app fully load first

        return () => clearTimeout(timer);
    }, [userAddress, isSupported, isSubscribed, permission, isUsernameFetching, shouldNeverShow, onEnable]);

    // Check if we should show the username prompt (separate from notification auto-enable)
    useEffect(() => {
        // Clear any existing timer
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        if (hasShownRef.current) return;
        if (!userAddress) return;
        if (isUsernameFetching) return;

        // PRIORITY CHECK: If user clicked "Don't Ask Again" - NEVER show again
        if (shouldNeverShow()) {
            hasShownRef.current = true;
            initialCheckDoneRef.current = true;
            return;
        }
        
        initialCheckDoneRef.current = true;

        // If user already has a username, no need to show the modal at all
        if (currentUsername) {
            console.log("[PushNotificationPrompt] User has username, skipping modal");
            return;
        }

        console.log("[PushNotificationPrompt] Will show username prompt in 2 seconds");

        // Show username prompt after a short delay
        timerRef.current = setTimeout(() => {
            if (hasShownRef.current) return;
            if (shouldNeverShow()) {
                hasShownRef.current = true;
                return;
            }
            // Re-check username via ref
            if (currentUsernameRef.current) return;
            
            hasShownRef.current = true;
            setIsOpen(true);
            console.log("[PushNotificationPrompt] Username prompt opened");
        }, 2000);

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [userAddress, currentUsername, isUsernameFetching, shouldNeverShow]);

    // Debounced username availability check
    useEffect(() => {
        if (!isOpen || !usernameInput || usernameInput.length < 3) {
            setIsAvailable(null);
            return;
        }

        // Don't check if it's the current username
        if (usernameInput.toLowerCase() === currentUsername?.toLowerCase()) {
            setIsAvailable(true);
            return;
        }

        const timer = setTimeout(async () => {
            setIsChecking(true);
            const available = await checkAvailability(usernameInput);
            setIsAvailable(available);
            setIsChecking(false);
        }, 300);

        return () => clearTimeout(timer);
    }, [usernameInput, checkAvailability, currentUsername, isOpen]);

    const isValidUsername = usernameInput.length >= 3 && usernameInput.length <= 20 && /^[a-zA-Z0-9_]+$/.test(usernameInput);

    const handleClaimUsername = async () => {
        if (!isValidUsername || isClaiming || !isAvailable) return;
        
        setIsClaiming(true);
        const success = await claimUsername(usernameInput);
        setIsClaiming(false);
        
        if (success) {
            // Username claimed - close the modal. Notifications are handled automatically.
            hasShownRef.current = true;
            setIsOpen(false);
        }
    };

    const handleSkip = () => {
        // Store PERMANENT "never ask again" flag - user explicitly doesn't want this
        if (userAddress) {
            setNeverAskFlag(userAddress);
        }
        hasShownRef.current = true;
        setIsOpen(false);
        onSkip();
    };

    const handleLater = () => {
        // Don't set the prompted flag - we'll ask again next session
        hasShownRef.current = true;
        setIsOpen(false);
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
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                    />

                    {/* Modal - Username claim only */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm z-50"
                    >
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
                            <motion.div
                                key="username"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-6"
                            >
                                {/* Icon */}
                                <div className="flex justify-center">
                                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF5500] to-[#FB8D22] flex items-center justify-center">
                                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    </div>
                                </div>

                                {/* Title */}
                                <h2 className="text-xl font-bold text-white text-center mb-2">
                                    Claim Your Username
                                </h2>

                                {/* Description */}
                                <p className="text-zinc-400 text-center text-sm mb-4">
                                    Choose a unique username so friends can find you easily.
                                </p>

                                {/* Username input */}
                                <div className="space-y-2">
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={usernameInput}
                                            onChange={(e) => setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                                            placeholder="username"
                                            className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF5500] focus:border-transparent"
                                            maxLength={20}
                                        />
                                        {usernameInput && (
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                {isChecking ? (
                                                    <div className="w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                                                ) : isAvailable === true ? (
                                                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                ) : isAvailable === false ? (
                                                    <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                ) : null}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {usernameInput && !isValidUsername && (
                                        <p className="text-xs text-red-400">
                                            Username must be 3-20 characters, letters, numbers, and underscores only
                                        </p>
                                    )}
                                    
                                    {isAvailable === false && (
                                        <p className="text-xs text-red-400">
                                            This username is already taken
                                        </p>
                                    )}
                                </div>

                                {/* Claim button */}
                                <button
                                    onClick={handleClaimUsername}
                                    disabled={!isValidUsername || !isAvailable || isClaiming || isChecking}
                                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FB8D22] text-white font-medium transition-all hover:shadow-lg hover:shadow-[#FB8D22]/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isClaiming ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Claiming...
                                        </>
                                    ) : (
                                        "Claim Username"
                                    )}
                                </button>

                                {/* Skip buttons */}
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleLater}
                                        className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors text-sm font-medium"
                                    >
                                        Skip
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSkip}
                                        className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 text-zinc-500 transition-colors text-sm font-medium"
                                    >
                                        Don&apos;t Ask Again
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}


