"use client";

import { useState, useCallback, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "@/config/supabase";
import { normalizeAddress } from "@/utils/address";

export type UserStatus = {
    emoji: string;
    text: string;
};

export type UserSettings = {
    statusEmoji: string;
    statusText: string;
    isDnd: boolean;
    soundEnabled: boolean;
    decentralizedCalls: boolean;
    publicLandingEnabled: boolean;
    publicBio: string;
    customAvatarUrl: string | null;
    useCustomAvatar: boolean;
};

const DEFAULT_SETTINGS: UserSettings = {
    statusEmoji: "💬",
    statusText: "Available to chat",
    isDnd: false,
    soundEnabled: true,
    decentralizedCalls: false, // Default to Agora until Huddle01 is fully integrated
    publicLandingEnabled: false, // Default to off for privacy
    publicBio: "",
    customAvatarUrl: null,
    useCustomAvatar: false,
};

// Preset status options
export const STATUS_PRESETS = [
    { emoji: "💬", text: "Available to chat" },
    { emoji: "👋", text: "" },
    { emoji: "🎧", text: "In a meeting" },
    { emoji: "🏠", text: "Working from home" },
    { emoji: "🚗", text: "Commuting" },
    { emoji: "🍕", text: "Out to lunch" },
    { emoji: "🏃", text: "Be right back" },
    { emoji: "🌴", text: "On vacation" },
    { emoji: "🤒", text: "Out sick" },
    { emoji: "🔨", text: "Deep work" },
    { emoji: "📵", text: "Do not disturb" },
];

export function useUserSettings(userAddress: string | null) {
    const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSettings = useCallback(async () => {
        if (!userAddress || !isSupabaseConfigured || !supabase) {
            setIsLoading(false);
            return;
        }

        const client = supabase;
        if (!client) return;

        try {
            const { data, error: fetchError } = await client
                .from("shout_user_settings")
                .select("*")
                .eq("wallet_address", normalizeAddress(userAddress))
                .maybeSingle();

            if (fetchError) {
                console.error("[useUserSettings] Fetch error:", fetchError);
                setError(fetchError.message);
            } else if (data) {
                setSettings({
                    statusEmoji: data.status_emoji || "👋",
                    statusText: data.status_text || "",
                    isDnd: data.is_dnd || false,
                    soundEnabled: data.sound_enabled ?? true,
                    decentralizedCalls: data.decentralized_calls ?? false, // Default to Agora
                    publicLandingEnabled: data.public_landing_enabled ?? false,
                    publicBio: data.public_bio || "",
                    customAvatarUrl: data.custom_avatar_url || null,
                    useCustomAvatar: data.use_custom_avatar ?? false,
                });
            }
        } catch (err) {
            console.error("[useUserSettings] Error:", err);
        } finally {
            setIsLoading(false);
        }
    }, [userAddress]);

    // Fetch settings on mount and when refetch is requested
    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    // Update settings
    const updateSettings = useCallback(
        async (newSettings: Partial<UserSettings>): Promise<boolean> => {
            if (!userAddress || !isSupabaseConfigured || !supabase) {
                setError("Not connected");
                return false;
            }

            const client = supabase;
            if (!client) return false;

            const updatedSettings = { ...settings, ...newSettings };

            // Optimistically update local state
            setSettings(updatedSettings);
            setError(null);

            try {
                const { error: upsertError } = await client
                    .from("shout_user_settings")
                    .upsert(
                        {
                            wallet_address: normalizeAddress(userAddress),
                            status_emoji: updatedSettings.statusEmoji,
                            status_text: updatedSettings.statusText,
                            is_dnd: updatedSettings.isDnd,
                            sound_enabled: updatedSettings.soundEnabled,
                            decentralized_calls:
                                updatedSettings.decentralizedCalls,
                            public_landing_enabled: updatedSettings.publicLandingEnabled,
                            public_bio: updatedSettings.publicBio,
                            custom_avatar_url: updatedSettings.customAvatarUrl,
                            use_custom_avatar: updatedSettings.useCustomAvatar,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: "wallet_address" }
                    );

                if (upsertError) {
                    console.error(
                        "[useUserSettings] Upsert error:",
                        upsertError
                    );
                    setError(upsertError.message);
                    // Revert on error
                    setSettings(settings);
                    return false;
                }

                return true;
            } catch (err) {
                console.error("[useUserSettings] Update error:", err);
                setError("Failed to update settings");
                setSettings(settings);
                return false;
            }
        },
        [userAddress, settings]
    );

    // Convenience methods
    const setStatus = useCallback(
        (emoji: string, text: string) =>
            updateSettings({ statusEmoji: emoji, statusText: text }),
        [updateSettings]
    );

    const toggleDnd = useCallback(
        () => updateSettings({ isDnd: !settings.isDnd }),
        [updateSettings, settings.isDnd]
    );

    const toggleSound = useCallback(
        () => updateSettings({ soundEnabled: !settings.soundEnabled }),
        [updateSettings, settings.soundEnabled]
    );

    const toggleDecentralizedCalls = useCallback(
        () =>
            updateSettings({
                decentralizedCalls: !settings.decentralizedCalls,
            }),
        [updateSettings, settings.decentralizedCalls]
    );

    const togglePublicLanding = useCallback(
        () =>
            updateSettings({
                publicLandingEnabled: !settings.publicLandingEnabled,
            }),
        [updateSettings, settings.publicLandingEnabled]
    );

    const clearStatus = useCallback(
        () =>
            updateSettings({
                statusEmoji: "💬",
                statusText: "Available to chat",
            }),
        [updateSettings]
    );

    const toggleUseCustomAvatar = useCallback(
        () =>
            updateSettings({
                useCustomAvatar: !settings.useCustomAvatar,
            }),
        [updateSettings, settings.useCustomAvatar]
    );

    const setCustomAvatar = useCallback(
        (url: string | null) =>
            updateSettings({
                customAvatarUrl: url,
                useCustomAvatar: url ? true : false,
            }),
        [updateSettings]
    );

    /** Re-fetch settings from DB (e.g. after changing avatar elsewhere or when opening profile/chat) */
    const refetch = useCallback(() => {
        fetchSettings();
    }, [fetchSettings]);

    return {
        settings,
        isLoading,
        error,
        updateSettings,
        refetch,
        setStatus,
        toggleDnd,
        toggleSound,
        toggleDecentralizedCalls,
        togglePublicLanding,
        toggleUseCustomAvatar,
        setCustomAvatar,
        clearStatus,
        isConfigured: isSupabaseConfigured,
    };
}

// Hook to fetch another user's status (for friends list)
export function useFriendStatus(friendAddress: string | null) {
    const [status, setStatus] = useState<UserStatus | null>(null);
    const [isDnd, setIsDnd] = useState(false);

    useEffect(() => {
        if (!friendAddress || !isSupabaseConfigured || !supabase) return;

        const client = supabase;
        if (!client) return;

        const fetchStatus = async () => {
            const { data } = await client
                .from("shout_user_settings")
                .select("status_emoji, status_text, is_dnd")
                .eq("wallet_address", normalizeAddress(friendAddress))
                .maybeSingle();

            if (data) {
                setStatus({
                    emoji: data.status_emoji || "👋",
                    text: data.status_text || "",
                });
                setIsDnd(data.is_dnd || false);
            }
        };

        fetchStatus();

        // Subscribe to realtime updates
        const channel = client
            .channel(`status-${friendAddress}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "shout_user_settings",
                    filter: `wallet_address=eq.${normalizeAddress(
                        friendAddress
                    )}`,
                },
                (payload) => {
                    const newData = payload.new as any;
                    if (newData) {
                        setStatus({
                            emoji: newData.status_emoji || "👋",
                            text: newData.status_text || "",
                        });
                        setIsDnd(newData.is_dnd || false);
                    }
                }
            )
            .subscribe();

        return () => {
            client.removeChannel(channel);
        };
    }, [friendAddress]);

    return { status, isDnd };
}
