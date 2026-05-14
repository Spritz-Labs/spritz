import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
    address: string,
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
    address: string,
): Promise<boolean> {
    const { data } = await supabase
        .from("shout_channel_bans")
        .select("id")
        .eq("channel_id", channelId)
        .ilike("user_address", address.toLowerCase())
        .maybeSingle();
    return !!data;
}
