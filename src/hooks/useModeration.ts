"use client";

import { useState, useCallback, useEffect } from "react";
import type { ModPermissions, Moderator, MutedUser } from "@/app/api/moderation/route";

type ModerationState = {
    permissions: ModPermissions;
    moderators: Moderator[];
    mutedUsers: MutedUser[];
    isLoading: boolean;
    error: string | null;
};

const DEFAULT_PERMISSIONS: ModPermissions = {
    isAdmin: false,
    isSuperAdmin: false,
    isModerator: false,
    canPin: false,
    canDelete: false,
    canMute: false,
    canManageMods: false,
};

export function useModeration(userAddress: string | null, channelId?: string | null) {
    const [state, setState] = useState<ModerationState>({
        permissions: DEFAULT_PERMISSIONS,
        moderators: [],
        mutedUsers: [],
        isLoading: true,
        error: null,
    });

    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Fetch permissions and lists
    const fetchModData = useCallback(async () => {
        if (!userAddress) {
            setState({
                permissions: DEFAULT_PERMISSIONS,
                moderators: [],
                mutedUsers: [],
                isLoading: false,
                error: null,
            });
            return;
        }

        try {
            const channelParam = channelId ? `&channelId=${channelId}` : "";

            // Fetch permissions, moderators, and muted users in parallel
            const [permRes, modsRes, mutedRes] = await Promise.all([
                fetch(`/api/moderation?action=permissions&userAddress=${userAddress}${channelParam}`),
                fetch(`/api/moderation?action=moderators${channelParam}`),
                fetch(`/api/moderation?action=muted${channelParam}`),
            ]);

            const [permData, modsData, mutedData] = await Promise.all([
                permRes.json(),
                modsRes.json(),
                mutedRes.json(),
            ]);

            setState({
                permissions: permData.permissions || DEFAULT_PERMISSIONS,
                moderators: modsData.moderators || [],
                mutedUsers: mutedData.mutedUsers || [],
                isLoading: false,
                error: null,
            });
        } catch (err) {
            console.error("[useModeration] Fetch error:", err);
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: "Failed to load moderation data",
            }));
        }
    }, [userAddress, channelId]);

    // Load on mount and when dependencies change
    useEffect(() => {
        fetchModData();
    }, [fetchModData]);

    // Check if a specific user is muted
    const isUserMuted = useCallback((address: string): boolean => {
        const now = new Date();
        return state.mutedUsers.some(mute => {
            if (mute.user_address.toLowerCase() !== address.toLowerCase()) return false;
            if (!mute.is_active) return false;
            if (!mute.muted_until) return true; // Permanent
            return new Date(mute.muted_until) > now;
        });
    }, [state.mutedUsers]);

    // Get mute info for a user
    const getMuteInfo = useCallback((address: string): MutedUser | null => {
        const now = new Date();
        return state.mutedUsers.find(mute => {
            if (mute.user_address.toLowerCase() !== address.toLowerCase()) return false;
            if (!mute.is_active) return false;
            if (!mute.muted_until) return true;
            return new Date(mute.muted_until) > now;
        }) || null;
    }, [state.mutedUsers]);

    // Promote a user to moderator
    const promoteMod = useCallback(async (
        targetAddress: string,
        options?: {
            canPin?: boolean;
            canDelete?: boolean;
            canMute?: boolean;
            canManageMods?: boolean;
            notes?: string;
        }
    ): Promise<boolean> => {
        if (!userAddress || !state.permissions.canManageMods) return false;

        setActionLoading(`promote-${targetAddress}`);
        try {
            const res = await fetch("/api/moderation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "promote-mod",
                    moderatorAddress: userAddress,
                    channelId: channelId || null,
                    targetAddress,
                    ...options,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to promote moderator");
            }

            // Refresh data
            await fetchModData();
            return true;
        } catch (err) {
            console.error("[useModeration] Promote error:", err);
            return false;
        } finally {
            setActionLoading(null);
        }
    }, [userAddress, channelId, state.permissions, fetchModData]);

    // Demote a moderator
    const demoteMod = useCallback(async (targetAddress: string): Promise<boolean> => {
        if (!userAddress || !state.permissions.canManageMods) return false;

        setActionLoading(`demote-${targetAddress}`);
        try {
            const res = await fetch("/api/moderation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "demote-mod",
                    moderatorAddress: userAddress,
                    channelId: channelId || null,
                    targetAddress,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to demote moderator");
            }

            // Refresh data
            await fetchModData();
            return true;
        } catch (err) {
            console.error("[useModeration] Demote error:", err);
            return false;
        } finally {
            setActionLoading(null);
        }
    }, [userAddress, channelId, state.permissions, fetchModData]);

    // Mute a user
    const muteUser = useCallback(async (
        targetAddress: string,
        options?: {
            duration?: string; // e.g., "1h", "1d", "1w", "permanent"
            reason?: string;
        }
    ): Promise<boolean> => {
        if (!userAddress || !state.permissions.canMute) return false;

        setActionLoading(`mute-${targetAddress}`);
        try {
            const res = await fetch("/api/moderation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "mute-user",
                    moderatorAddress: userAddress,
                    channelId: channelId || null,
                    targetAddress,
                    duration: options?.duration || "permanent",
                    reason: options?.reason,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to mute user");
            }

            // Refresh data
            await fetchModData();
            return true;
        } catch (err) {
            console.error("[useModeration] Mute error:", err);
            return false;
        } finally {
            setActionLoading(null);
        }
    }, [userAddress, channelId, state.permissions, fetchModData]);

    // Unmute a user
    const unmuteUser = useCallback(async (targetAddress: string): Promise<boolean> => {
        if (!userAddress || !state.permissions.canMute) return false;

        setActionLoading(`unmute-${targetAddress}`);
        try {
            const res = await fetch("/api/moderation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "unmute-user",
                    moderatorAddress: userAddress,
                    channelId: channelId || null,
                    targetAddress,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to unmute user");
            }

            // Refresh data
            await fetchModData();
            return true;
        } catch (err) {
            console.error("[useModeration] Unmute error:", err);
            return false;
        } finally {
            setActionLoading(null);
        }
    }, [userAddress, channelId, state.permissions, fetchModData]);

    // Delete a message
    const deleteMessage = useCallback(async (
        messageId: string,
        messageType: "alpha" | "channel",
        reason?: string
    ): Promise<boolean> => {
        if (!userAddress || !state.permissions.canDelete) return false;

        setActionLoading(`delete-${messageId}`);
        try {
            const res = await fetch("/api/moderation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "delete-message",
                    moderatorAddress: userAddress,
                    channelId: channelId || null,
                    messageId,
                    messageType,
                    reason,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to delete message");
            }

            return true;
        } catch (err) {
            console.error("[useModeration] Delete error:", err);
            return false;
        } finally {
            setActionLoading(null);
        }
    }, [userAddress, channelId, state.permissions]);

    // Pin/unpin a message
    const pinMessage = useCallback(async (
        messageId: string,
        messageType: "alpha" | "channel",
        shouldPin: boolean
    ): Promise<boolean> => {
        if (!userAddress || !state.permissions.canPin) return false;

        setActionLoading(`pin-${messageId}`);
        try {
            const res = await fetch("/api/moderation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "pin-message",
                    moderatorAddress: userAddress,
                    channelId: channelId || null,
                    messageId,
                    messageType,
                    shouldPin,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to pin message");
            }

            return true;
        } catch (err) {
            console.error("[useModeration] Pin error:", err);
            return false;
        } finally {
            setActionLoading(null);
        }
    }, [userAddress, channelId, state.permissions]);

    return {
        ...state,
        actionLoading,
        isUserMuted,
        getMuteInfo,
        promoteMod,
        demoteMod,
        muteUser,
        unmuteUser,
        deleteMessage,
        pinMessage,
        refresh: fetchModData,
    };
}

// Mute duration options for UI
export const MUTE_DURATION_OPTIONS = [
    { value: "10m", label: "10 minutes" },
    { value: "1h", label: "1 hour" },
    { value: "24h", label: "24 hours" },
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    { value: "permanent", label: "Permanent" },
];
