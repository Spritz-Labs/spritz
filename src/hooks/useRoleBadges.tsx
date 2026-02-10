"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/config/supabase";

export type RoleBadge = "super_admin" | "admin" | "moderator" | null;

type RoleBadgeData = {
    admins: Map<string, boolean>; // address -> isSuperAdmin
    moderators: Set<string>; // addresses
    isLoading: boolean;
};

/**
 * Hook that fetches all admins and moderators for efficient batch lookup.
 * Returns a getRoleBadge(address) function that returns the user's role.
 *
 * @param channelId - Optional channel ID for channel-specific moderators
 */
export function useRoleBadges(channelId?: string | null) {
    const [data, setData] = useState<RoleBadgeData>({
        admins: new Map(),
        moderators: new Set(),
        isLoading: true,
    });

    const fetchRoles = useCallback(async () => {
        if (!supabase) {
            setData({ admins: new Map(), moderators: new Set(), isLoading: false });
            return;
        }

        try {
            // Fetch all admins
            const { data: adminsData } = await supabase
                .from("shout_admins")
                .select("wallet_address, is_super_admin");

            const admins = new Map<string, boolean>();
            if (adminsData) {
                for (const admin of adminsData) {
                    admins.set(admin.wallet_address.toLowerCase(), admin.is_super_admin || false);
                }
            }

            // Fetch moderators (global + channel-specific if channelId provided)
            let modQuery = supabase
                .from("shout_moderators")
                .select("user_address, channel_id");

            if (channelId) {
                // Get global mods + channel-specific mods
                modQuery = modQuery.or(`channel_id.is.null,channel_id.eq.${channelId}`);
            } else {
                // Just get global mods
                modQuery = modQuery.is("channel_id", null);
            }

            const { data: modsData } = await modQuery;

            const moderators = new Set<string>();
            if (modsData) {
                for (const mod of modsData) {
                    // Don't add to moderators if already an admin
                    const addr = mod.user_address.toLowerCase();
                    if (!admins.has(addr)) {
                        moderators.add(addr);
                    }
                }
            }

            setData({ admins, moderators, isLoading: false });
        } catch (err) {
            console.error("[useRoleBadges] Error:", err);
            setData({ admins: new Map(), moderators: new Set(), isLoading: false });
        }
    }, [channelId]);

    useEffect(() => {
        fetchRoles();
    }, [fetchRoles]);

    /**
     * Get the role badge for a given address.
     * Returns "super_admin", "admin", "moderator", or null.
     */
    const getRoleBadge = useCallback(
        (address: string | null | undefined): RoleBadge => {
            if (!address) return null;
            const normalized = address.toLowerCase();

            const isSuperAdmin = data.admins.get(normalized);
            if (isSuperAdmin === true) return "super_admin";
            if (isSuperAdmin === false) return "admin"; // in admins table but not super
            if (data.moderators.has(normalized)) return "moderator";
            return null;
        },
        [data.admins, data.moderators],
    );

    return {
        getRoleBadge,
        isLoading: data.isLoading,
        refresh: fetchRoles,
    };
}

/**
 * Renders an inline role badge component.
 * Use this next to sender names in chat messages.
 */
export function RoleBadgeTag({ role }: { role: RoleBadge }) {
    if (!role) return null;

    const config = {
        super_admin: {
            label: "Spritz Team",
            className: "bg-[#FF5500]/20 text-[#FF5500] border-[#FF5500]/30",
        },
        admin: {
            label: "Admin",
            className: "bg-[#FF5500]/15 text-[#FF7733] border-[#FF7733]/30",
        },
        moderator: {
            label: "Mod",
            className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
        },
    };

    const { label, className } = config[role];

    return (
        <span
            className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold border leading-none ${className}`}
        >
            {label}
        </span>
    );
}
