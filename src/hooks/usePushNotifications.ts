"use client";

import { useState, useEffect, useCallback } from "react";
import { type Address } from "viem";
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

export function usePushNotifications(userAddress: Address | null) {
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

            // Check if service worker is registered
            const registrations =
                await navigator.serviceWorker.getRegistrations();
            console.log(
                "[Push] Service worker registrations:",
                registrations.length
            );

            if (registrations.length === 0) {
                setError(
                    "Service worker not available. Try refreshing the page."
                );
                setIsLoading(false);
                return false;
            }

            // Get service worker registration with timeout
            console.log("[Push] Waiting for service worker...");
            const registration = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise<never>((_, reject) =>
                    setTimeout(
                        () => reject(new Error("Service worker timeout")),
                        10000
                    )
                ),
            ]);
            console.log("[Push] Service worker ready");

            // Subscribe to push
            console.log("[Push] Subscribing to push manager...");
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
            });

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
