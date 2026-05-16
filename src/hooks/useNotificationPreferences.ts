"use client";

import { useState, useEffect, useCallback } from "react";
import type { NotificationPreferences } from "@/app/api/notifications/preferences/route";

export function useNotificationPreferences(userAddress: string) {
    const [prefs, setPrefs] = useState<NotificationPreferences>({
        quietStart: null,
        quietEnd: null,
        notifyDms: true,
        notifyGroups: true,
        notifyChannels: true,
        notifyCalls: true,
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!userAddress) return;

        const controller = new AbortController();

        fetch("/api/notifications/preferences", {
            credentials: "include",
            signal: controller.signal,
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data) setPrefs(data);
            })
            .catch((err) => {
                if ((err as Error).name !== "AbortError") {
                    console.error("[NotifPrefs] Fetch error:", err);
                }
            })
            .finally(() => setIsLoading(false));

        return () => controller.abort();
    }, [userAddress]);

    const updatePrefs = useCallback(async (updates: Partial<NotificationPreferences>) => {
        setIsSaving(true);
        try {
            const res = await fetch("/api/notifications/preferences", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(updates),
            });

            if (res.ok) {
                setPrefs((prev) => ({ ...prev, ...updates }));
                return true;
            }
            return false;
        } catch {
            return false;
        } finally {
            setIsSaving(false);
        }
    }, []);

    return { prefs, isLoading, isSaving, updatePrefs };
}
