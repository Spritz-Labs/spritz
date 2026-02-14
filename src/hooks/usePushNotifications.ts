"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/config/supabase";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

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

    // Register service worker with retry logic (up to 3 attempts)
    const getServiceWorkerRegistration = useCallback(async (): Promise<ServiceWorkerRegistration> => {
        const MAX_SW_ATTEMPTS = 3;
        
        for (let attempt = 1; attempt <= MAX_SW_ATTEMPTS; attempt++) {
            console.log(`[Push] Getting service worker (attempt ${attempt}/${MAX_SW_ATTEMPTS})...`);
            
            try {
                // First try to get existing registrations (fast)
                const registrations = await navigator.serviceWorker.getRegistrations();
                if (registrations.length > 0) {
                    console.log("[Push] Using existing registration:", registrations[0].scope);
                    return registrations[0];
                }

                // Try the ready promise with a timeout
                try {
                    const registration = await Promise.race([
                        navigator.serviceWorker.ready,
                        new Promise<never>((_, reject) =>
                            setTimeout(() => reject(new Error("SW ready timeout")), 5000)
                        ),
                    ]);
                    console.log("[Push] Service worker ready:", registration.scope);
                    return registration;
                } catch {
                    // Ready timed out - try manual registration
                    console.log(`[Push] SW ready timed out, attempting manual registration (attempt ${attempt})...`);
                }

                // Manual registration fallback
                const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
                console.log("[Push] Manual registration successful:", registration.scope);
                return registration;
            } catch (err) {
                console.error(`[Push] SW registration attempt ${attempt}/${MAX_SW_ATTEMPTS} failed:`, err);
                
                if (attempt < MAX_SW_ATTEMPTS) {
                    // Wait before retrying with exponential backoff
                    const delay = attempt * 2000; // 2s, 4s
                    console.log(`[Push] Retrying SW registration in ${delay}ms...`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            }
        }
        
        throw new Error(`Service worker registration failed after ${MAX_SW_ATTEMPTS} attempts`);
    }, []);

    // Wait for service worker to be active
    const waitForActive = useCallback(async (
        reg: ServiceWorkerRegistration,
        maxAttempts = 15
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
    }, []);

    // Core subscription logic (single attempt)
    const subscribeOnce = useCallback(async (): Promise<boolean> => {
        // Request permission via the browser's native dialog
        console.log("[Push] Requesting permission...");
        const result = await Notification.requestPermission();
        console.log("[Push] Permission result:", result);
        setPermission(result);

        if (result !== "granted") {
            setError("Notification permission denied");
            return false;
        }

        // Get service worker with retry
        const registration = await getServiceWorkerRegistration();
        await waitForActive(registration);

        // Subscribe to push with retry
        console.log("[Push] Subscribing to push manager...");
        let subscription: PushSubscription | null = null;
        let lastError: Error | null = null;
        const maxPushRetries = 5;

        for (let attempt = 0; attempt < maxPushRetries; attempt++) {
            try {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
                });
                break; // Success!
            } catch (subError) {
                lastError = subError as Error;
                const errMsg = subError instanceof Error ? subError.message : "";
                console.log(
                    `[Push] Subscribe attempt ${attempt + 1}/${maxPushRetries} failed:`,
                    errMsg
                );

                // If it's the "active service worker" error, wait and retry
                if (
                    errMsg.includes("active service worker") ||
                    errMsg.includes("activated")
                ) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    continue;
                }
                // For other errors, don't retry push (but outer retry will catch)
                throw subError;
            }
        }

        if (!subscription) {
            throw (lastError || new Error("Failed to subscribe after retries"));
        }

        console.log("[Push] Subscription created:", subscription.endpoint);

        // Save subscription to Supabase
        const subscriptionJSON = subscription.toJSON();
        console.log("[Push] Saving to Supabase...");
        const { error: dbError } = await supabase!
            .from("push_subscriptions")
            .upsert(
                {
                    user_address: userAddress!.toLowerCase(),
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
            return false;
        }

        console.log("[Push] Subscription saved successfully!");
        setIsSubscribed(true);
        return true;
    }, [userAddress, getServiceWorkerRegistration, waitForActive]);

    // Subscribe to push notifications with full retry (3 attempts for entire flow)
    const subscribe = useCallback(async (): Promise<boolean> => {
        const MAX_FULL_ATTEMPTS = 3;
        
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

        for (let attempt = 1; attempt <= MAX_FULL_ATTEMPTS; attempt++) {
            try {
                console.log(`[Push] Full subscribe attempt ${attempt}/${MAX_FULL_ATTEMPTS}`);
                const success = await subscribeOnce();
                setIsLoading(false);
                return success;
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : "Unknown error";
                console.error(`[Push] Full attempt ${attempt}/${MAX_FULL_ATTEMPTS} failed:`, errMsg);

                // If permission was denied, don't retry - user made a choice
                if (errMsg.includes("permission denied") || errMsg.includes("denied")) {
                    setError("Notification permission denied");
                    setIsLoading(false);
                    return false;
                }

                if (attempt < MAX_FULL_ATTEMPTS) {
                    const delay = attempt * 3000; // 3s, 6s
                    console.log(`[Push] Retrying full subscribe in ${delay}ms...`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                } else {
                    console.error("[Push] All attempts exhausted");
                    setError(errMsg);
                }
            }
        }

        setIsLoading(false);
        return false;
    }, [isSupported, userAddress, subscribeOnce]);

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



