import { createClient } from "@supabase/supabase-js";
import type { DeveloperKeyInfo } from "./apiKey";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type ChannelRole = "owner" | "admin" | "moderator" | "member";

const ROLE_HIERARCHY: Record<ChannelRole, number> = {
    owner: 4,
    admin: 3,
    moderator: 2,
    member: 1,
};

export function roleRank(role: ChannelRole): number {
    return ROLE_HIERARCHY[role] ?? 0;
}

export function isValidRole(role: string): role is ChannelRole {
    return role in ROLE_HIERARCHY;
}

export async function getCallerRole(
    channelId: string,
    address: string
): Promise<ChannelRole | null> {
    const { data } = await supabase
        .from("shout_channel_members")
        .select("role")
        .eq("channel_id", channelId)
        .ilike("user_address", address.toLowerCase())
        .maybeSingle();
    if (!data?.role) return null;
    return isValidRole(data.role) ? data.role : "member";
}

export async function isUserBannedFromChannel(
    channelId: string,
    address: string
): Promise<boolean> {
    const { data } = await supabase
        .from("shout_channel_bans")
        .select("id")
        .eq("channel_id", channelId)
        .ilike("user_address", address.toLowerCase())
        .maybeSingle();
    return !!data;
}

/**
 * Check if an API key has management permission on a channel.
 * Returns true if the key created the channel (tracked via created_by_api_key_id)
 * or if developer_address matches creator_address (legacy fallback).
 */
export async function apiKeyOwnsChannel(
    channelId: string,
    apiKey: DeveloperKeyInfo
): Promise<boolean> {
    const { data: channel } = await supabase
        .from("shout_public_channels")
        .select("creator_address, created_by_api_key_id")
        .eq("id", channelId)
        .single();

    if (!channel) return false;

    if (channel.created_by_api_key_id === apiKey.id) return true;

    const devAddr = apiKey.developerAddress.toLowerCase();
    const creatorAddr = channel.creator_address?.toLowerCase();
    if (creatorAddr && creatorAddr === devAddr) return true;

    return false;
}
