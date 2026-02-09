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
    const [isEnabling, setIsEnabling] = useState(false);
    const [step, setStep] = useState<"username" | "notifications">("username");
    const [usernameInput, setUsernameInput] = useState("");
    const [isChecking, setIsChecking] = useState(false);
    const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
    const [isClaiming, setIsClaiming] = useState(false);
    
    // Use ref to track if we've already shown the prompt in this session
    const hasShownRef = useRef(false);
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
    // This prevents any race conditions with the async effect
    const shouldNeverShow = useCallback(() => {
        if (!userAddress) return false;
        return hasNeverAskFlag(userAddress);
    }, [userAddress]);

    // Check if we should show the prompt
    useEffect(() => {
        // Clear any existing timer
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        // If already shown in this session, don't show again
        if (hasShownRef.current) {
            console.log("[PushNotificationPrompt] Already shown in this session");
            return;
        }

        if (!userAddress) {
            console.log("[PushNotificationPrompt] No user address");
            return;
        }

        // Wait for username fetch to complete before making any decisions
        // This prevents the race condition where we show the username step
        // while the username is still being loaded from the API
        if (isUsernameFetching) {
            console.log("[PushNotificationPrompt] Waiting for username fetch to complete");
            return;
        }

        // PRIORITY CHECK: If user clicked "Don't Ask Again" - NEVER show again
        // This check must happen first and be absolute
        if (shouldNeverShow()) {
            console.log("[PushNotificationPrompt] User clicked 'Don't Ask Again' - never showing");
            hasShownRef.current = true; // Prevent any future attempts this session
            initialCheckDoneRef.current = true;
            return;
        }
        
        initialCheckDoneRef.current = true;

        if (!isSupported) {
            console.log("[PushNotificationPrompt] Push notifications not supported");
            return;
        }

        // Check if already prompted for this specific address
        const promptedKey = `${PUSH_PROMPTED_KEY}_${userAddress.toLowerCase()}`;
        const hasPrompted = localStorage.getItem(promptedKey);
        
        // If user has both username AND has been prompted, don't show again
        if (hasPrompted && currentUsername) {
            console.log("[PushNotificationPrompt] Already prompted for this address and has username");
            return;
        }

        // Don't show if permission already denied
        if (permission === "denied") {
            console.log("[PushNotificationPrompt] Permission already denied");
            return;
        }

        // Skip if they have both username AND are subscribed
        if (isSubscribed && currentUsername) {
            console.log("[PushNotificationPrompt] Already subscribed and has username");
            return;
        }

        console.log("[PushNotificationPrompt] Will show prompt in 2 seconds", {
            userAddress: userAddress.slice(0, 10),
            isSupported,
            isSubscribed,
            permission,
            hasUsername: !!currentUsername,
        });

        // Show prompt after a short delay (let the app settle first)
        timerRef.current = setTimeout(() => {
            // Double-check we haven't shown it already and neverAsk hasn't been set
            if (hasShownRef.current) {
                return;
            }
            // Re-check neverAsk in case it was set during the timeout
            if (shouldNeverShow()) {
                console.log("[PushNotificationPrompt] neverAsk was set during timeout - not showing");
                hasShownRef.current = true;
                return;
            }
            hasShownRef.current = true;
            setIsOpen(true);
            // Use the ref for the latest username value (avoids stale closure)
            const latestUsername = currentUsernameRef.current;
            if (latestUsername) {
                setStep("notifications");
            } else {
                setStep("username");
            }
            console.log("[PushNotificationPrompt] Prompt opened, step:", latestUsername ? "notifications" : "username");
        }, 2000);

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [userAddress, isSupported, isSubscribed, permission, currentUsername, isUsernameFetching, shouldNeverShow]);

    // Debounced username availability check
    useEffect(() => {
        if (step !== "username" || !usernameInput || usernameInput.length < 3) {
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
    }, [usernameInput, checkAvailability, currentUsername, step]);

    const isValidUsername = usernameInput.length >= 3 && usernameInput.length <= 20 && /^[a-zA-Z0-9_]+$/.test(usernameInput);

    const handleClaimUsername = async () => {
        if (!isValidUsername || isClaiming || !isAvailable) return;
        
        setIsClaiming(true);
        const success = await claimUsername(usernameInput);
        setIsClaiming(false);
        
        if (success) {
            setStep("notifications");
        }
    };

    const handleNext = () => {
        if (currentUsername) {
            setStep("notifications");
        } else if (isValidUsername && isAvailable) {
            handleClaimUsername();
        }
    };

    const handleEnable = async () => {
        setIsEnabling(true);
        // Store prompted flag per address
        if (userAddress) {
            const promptedKey = `${PUSH_PROMPTED_KEY}_${userAddress.toLowerCase()}`;
            localStorage.setItem(promptedKey, "true");
        }
        
        const success = await onEnable();
        
        setIsEnabling(false);
        if (success) {
            hasShownRef.current = true; // Mark as shown
            setIsOpen(false);
        }
    };

    const handleSkip = () => {
        // Store PERMANENT "never ask again" flag - user explicitly doesn't want this
        if (userAddress) {
            setNeverAskFlag(userAddress);
        }
        hasShownRef.current = true; // Mark as shown
        setIsOpen(false);
        onSkip();
    };

    const handleLater = () => {
        // Don't set the prompted flag - we'll ask again next session
        hasShownRef.current = true; // Mark as shown for this session
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

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm z-50"
                    >
                        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
                            {/* Step indicator */}
                            <div className="flex items-center justify-center gap-2 mb-6">
                                <div className={`w-2 h-2 rounded-full ${step === "username" ? "bg-[#FF5500]" : "bg-zinc-600"}`} />
                                <div className={`w-2 h-2 rounded-full ${step === "notifications" ? "bg-[#FF5500]" : "bg-zinc-600"}`} />
                            </div>

                            <AnimatePresence mode="wait">
                                {step === "username" ? (
                                    <motion.div
                                        key="username"
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 20 }}
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

                                        {/* Next button */}
                                        <button
                                            onClick={handleNext}
                                            disabled={!isValidUsername || !isAvailable || isClaiming || isChecking}
                                            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FB8D22] text-white font-medium transition-all hover:shadow-lg hover:shadow-[#FB8D22]/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            {isClaiming ? (
                                                <>
                                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                    Claiming...
                                                </>
                                            ) : (
                                                <>
                                                    Next
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </>
                                            )}
                                        </button>

                                        {/* Skip buttons */}
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setStep("notifications");
                                                }}
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
                                ) : (
                                    <motion.div
                                        key="notifications"
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                    >
                                        {/* Icon */}
                                        <div className="flex justify-center mb-4">
                                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF5500] to-[#FB8D22] flex items-center justify-center">
                                                <svg
                                                    className="w-8 h-8 text-white"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                                                    />
                                                </svg>
                                            </div>
                                        </div>

                                        {/* Title */}
                                        <h2 className="text-xl font-bold text-white text-center mb-2">
                                            Never Miss a Call
                                        </h2>

                                        {/* Description */}
                                        <p className="text-zinc-400 text-center text-sm mb-6">
                                            Enable push notifications to get alerted when friends call you, even when Spritz isn't open.
                                        </p>

                                        {/* Benefits */}
                                        <div className="space-y-2 mb-6">
                                            <div className="flex items-center gap-3 text-sm">
                                                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <span className="text-zinc-300">Incoming call alerts</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm">
                                                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <span className="text-zinc-300">Friend request notifications</span>
                                            </div>
                                            <div className="flex items-center gap-3 text-sm">
                                                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                                                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <span className="text-zinc-300">You can disable anytime in settings</span>
                                            </div>
                                        </div>

                                        {/* Buttons */}
                                        <div className="space-y-2">
                                            <button
                                                onClick={handleEnable}
                                                disabled={isEnabling}
                                                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#FF5500] to-[#FB8D22] text-white font-medium transition-all hover:shadow-lg hover:shadow-[#FB8D22]/25 disabled:opacity-70 flex items-center justify-center gap-2"
                                            >
                                                {isEnabling ? (
                                                    <>
                                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                        Enabling...
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                                        </svg>
                                                        Enable Notifications
                                                    </>
                                                )}
                                            </button>
                                            
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleLater}
                                                    disabled={isEnabling}
                                                    className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors disabled:opacity-50"
                                                >
                                                    Maybe Later
                                                </button>
                                                <button
                                                    onClick={handleSkip}
                                                    disabled={isEnabling}
                                                    className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 text-zinc-500 font-medium transition-colors disabled:opacity-50"
                                                >
                                                    Don't Ask Again
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}


