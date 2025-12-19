"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/config/supabase";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PUSH_PROMPTED_KEY = "reach_push_prompted";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray.buffer;
}

export function usePushNotifications(userAddress: string | null) {
    const [isSupported, setIsSupported] = useState(false);
    const [permission, setPermission] =
        useState<NotificationPermission>("default");
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Check if push notifications are supported
    useEffect(() => {
        const supported =
            typeof window !== "undefined" &&
            "serviceWorker" in navigator &&
            "PushManager" in window &&
            "Notification" in window &&
            !!VAPID_PUBLIC_KEY;

        setIsSupported(supported);

        if (supported) {
            setPermission(Notification.permission);
        }
    }, []);

    // Check existing subscription when user changes
    useEffect(() => {
        if (!isSupported || !userAddress) {
            setIsSubscribed(false);
            return;
        }

        const checkSubscription = async () => {
            try {
                const registration = await navigator.serviceWorker.ready;
                const subscription =
                    await registration.pushManager.getSubscription();
                setIsSubscribed(!!subscription);
            } catch (err) {
                console.error("[Push] Error checking subscription:", err);
            }
        };

        checkSubscription();
    }, [isSupported, userAddress]);

    // Subscribe to push notifications
    const subscribe = useCallback(async (): Promise<boolean> => {
        console.log("[Push] Subscribe called", {
            isSupported,
            userAddress,
            hasSupabase: !!supabase,
            vapidKey: !!VAPID_PUBLIC_KEY,
        });

        if (!isSupported || !userAddress || !supabase) {
            setError("Push notifications not supported or not configured");
            setIsLoading(false);
            return false;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Request permission
            console.log("[Push] Requesting permission...");
            const result = await Notification.requestPermission();
            console.log("[Push] Permission result:", result);
            setPermission(result);

            if (result !== "granted") {
                setError("Notification permission denied");
                setIsLoading(false);
                return false;
            }

            // Get service worker registration quickly
            console.log("[Push] Getting service worker...");

            let registration: ServiceWorkerRegistration;
            try {
                // First try to get existing registrations (fast)
                const registrations =
                    await navigator.serviceWorker.getRegistrations();
                if (registrations.length > 0) {
                    registration = registrations[0];
                    console.log(
                        "[Push] Using existing registration:",
                        registration.scope
                    );
                } else {
                    // Fall back to ready promise with short timeout
                    registration = await Promise.race([
                        navigator.serviceWorker.ready,
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error("timeout")), 3000)
                        ),
                    ]);
                    console.log(
                        "[Push] Service worker ready:",
                        registration.scope
                    );
                }
            } catch (swError) {
                console.error("[Push] Service worker error:", swError);
                // Try to register manually if not available
                try {
                    console.log("[Push] Attempting manual SW registration...");
                    registration = await navigator.serviceWorker.register(
                        "/sw.js",
                        { scope: "/" }
                    );
                    console.log("[Push] Manual registration successful");
                } catch (regError) {
                    console.error(
                        "[Push] Manual registration failed:",
                        regError
                    );
                    setError(
                        "Service worker not available. Please refresh and try again."
                    );
                    setIsLoading(false);
                    return false;
                }
            }

            // Wait for service worker to be active (it might be installing/waiting)
            const waitForActive = async (
                reg: ServiceWorkerRegistration,
                maxAttempts = 10
            ): Promise<void> => {
                for (let i = 0; i < maxAttempts; i++) {
                    const sw = reg.active || reg.waiting || reg.installing;
                    if (reg.active && reg.active.state === "activated") {
                        console.log("[Push] Service worker is active");
                        return;
                    }
                    console.log(
                        `[Push] Waiting for SW to activate... attempt ${i + 1}/${maxAttempts}`,
                        sw?.state
                    );
                    await new Promise((resolve) => setTimeout(resolve, 500));
                }
                // Continue anyway - let the subscribe call fail with a proper error if needed
                console.log("[Push] Proceeding after wait attempts");
            };

            await waitForActive(registration);

            // Subscribe to push with retry
            console.log("[Push] Subscribing to push manager...");
            let subscription: PushSubscription | null = null;
            let lastError: Error | null = null;
            const maxRetries = 5;

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(
                            VAPID_PUBLIC_KEY!
                        ),
                    });
                    break; // Success!
                } catch (subError) {
                    lastError = subError as Error;
                    const errMsg =
                        subError instanceof Error ? subError.message : "";
                    console.log(
                        `[Push] Subscribe attempt ${attempt + 1}/${maxRetries} failed:`,
                        errMsg
                    );

                    // If it's the "active service worker" error, wait and retry
                    if (
                        errMsg.includes("active service worker") ||
                        errMsg.includes("activated")
                    ) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, 1000)
                        );
                        continue;
                    }
                    // For other errors, don't retry
                    throw subError;
                }
            }

            if (!subscription) {
                throw (
                    lastError || new Error("Failed to subscribe after retries")
                );
            }

            console.log("[Push] Subscription created:", subscription.endpoint);

            // Save subscription to Supabase
            const subscriptionJSON = subscription.toJSON();
            console.log("[Push] Saving to Supabase...");
            const { error: dbError } = await supabase
                .from("push_subscriptions")
                .upsert(
                    {
                        user_address: userAddress.toLowerCase(),
                        endpoint: subscriptionJSON.endpoint,
                        p256dh: subscriptionJSON.keys?.p256dh,
                        auth: subscriptionJSON.keys?.auth,
                        updated_at: new Date().toISOString(),
                    },
                    { onConflict: "user_address" }
                );

            if (dbError) {
                console.error("[Push] Error saving subscription:", dbError);
                setError("Failed to save subscription: " + dbError.message);
                setIsLoading(false);
                return false;
            }

            console.log("[Push] Subscription saved successfully!");
            setIsSubscribed(true);
            setIsLoading(false);
            return true;
        } catch (err) {
            console.error("[Push] Error subscribing:", err);
            setError(
                err instanceof Error ? err.message : "Failed to subscribe"
            );
            setIsLoading(false);
            return false;
        }
    }, [isSupported, userAddress]);

    // Auto-prompt for push notifications on first launch (for PWA users)
    useEffect(() => {
        if (!isSupported || !userAddress || isSubscribed || isLoading) {
            return;
        }

        // Check if we've already prompted
        const hasPrompted = localStorage.getItem(PUSH_PROMPTED_KEY);
        if (hasPrompted) {
            return;
        }

        // Check if running as PWA (standalone mode)
        const isStandalone =
            window.matchMedia("(display-mode: standalone)").matches ||
            // @ts-expect-error - iOS Safari specific
            window.navigator.standalone === true;

        if (!isStandalone) {
            return; // Only auto-prompt for PWA users
        }

        // Check if permission not already denied
        if (Notification.permission === "denied") {
            localStorage.setItem(PUSH_PROMPTED_KEY, "true");
            return;
        }

        // Small delay to let the app settle
        const timer = setTimeout(async () => {
            console.log("[Push] Auto-prompting for push notifications...");
            localStorage.setItem(PUSH_PROMPTED_KEY, "true");

            // This will trigger the permission prompt and subscribe if granted
            await subscribe();
        }, 2000);

        return () => clearTimeout(timer);
    }, [isSupported, userAddress, isSubscribed, isLoading, subscribe]);

    // Unsubscribe from push notifications
    const unsubscribe = useCallback(async (): Promise<boolean> => {
        if (!userAddress || !supabase) {
            return false;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Get current subscription
            const registration = await navigator.serviceWorker.ready;
            const subscription =
                await registration.pushManager.getSubscription();

            if (subscription) {
                await subscription.unsubscribe();
            }

            // Remove from database
            await supabase
                .from("push_subscriptions")
                .delete()
                .eq("user_address", userAddress.toLowerCase());

            setIsSubscribed(false);
            setIsLoading(false);
            return true;
        } catch (err) {
            console.error("[Push] Error unsubscribing:", err);
            setError(
                err instanceof Error ? err.message : "Failed to unsubscribe"
            );
            setIsLoading(false);
            return false;
        }
    }, [userAddress]);

    return {
        isSupported,
        permission,
        isSubscribed,
        isLoading,
        error,
        subscribe,
        unsubscribe,
    };
}


