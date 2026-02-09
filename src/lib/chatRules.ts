import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

export type ChatRulesData = {
    links_allowed: boolean;
    photos_allowed: boolean;
    pixel_art_allowed: boolean;
    gifs_allowed: boolean;
    polls_allowed: boolean;
    location_sharing_allowed: boolean;
    voice_allowed: boolean;
    slow_mode_seconds: number;
    read_only: boolean;
    max_message_length: number;
};

const DEFAULT_RULES: ChatRulesData = {
    links_allowed: true,
    photos_allowed: true,
    pixel_art_allowed: true,
    gifs_allowed: true,
    polls_allowed: true,
    location_sharing_allowed: true,
    voice_allowed: true,
    slow_mode_seconds: 0,
    read_only: false,
    max_message_length: 0,
};

/**
 * Fetch chat rules for a room. Returns defaults if no rules are set.
 */
export async function getChatRules(chatType: string, chatId: string | null): Promise<ChatRulesData> {
    if (!supabase) return DEFAULT_RULES;

    try {
        const query = supabase
            .from("shout_chat_rules")
            .select("*")
            .eq("chat_type", chatType);

        if (chatId) {
            query.eq("chat_id", chatId);
        } else {
            query.is("chat_id", null);
        }

        const { data } = await query.maybeSingle();
        if (!data) return DEFAULT_RULES;

        return {
            links_allowed: data.links_allowed ?? true,
            photos_allowed: data.photos_allowed ?? true,
            pixel_art_allowed: data.pixel_art_allowed ?? true,
            gifs_allowed: data.gifs_allowed ?? true,
            polls_allowed: data.polls_allowed ?? true,
            location_sharing_allowed: data.location_sharing_allowed ?? true,
            voice_allowed: data.voice_allowed ?? true,
            slow_mode_seconds: data.slow_mode_seconds ?? 0,
            read_only: data.read_only ?? false,
            max_message_length: data.max_message_length ?? 0,
        };
    } catch (error) {
        console.error("[chatRules] Failed to fetch rules:", error);
        return DEFAULT_RULES;
    }
}

/**
 * Check if a user is banned from a specific room.
 */
export async function isUserRoomBanned(chatType: string, chatId: string | null, userAddress: string): Promise<boolean> {
    if (!supabase) return false;

    try {
        const query = supabase
            .from("shout_room_bans")
            .select("id, banned_until")
            .eq("chat_type", chatType)
            .eq("user_address", userAddress.toLowerCase())
            .eq("is_active", true);

        if (chatId) {
            query.eq("chat_id", chatId);
        } else {
            query.is("chat_id", null);
        }

        const { data } = await query;
        if (!data || data.length === 0) return false;

        const now = new Date();
        return data.some(ban => {
            if (!ban.banned_until) return true; // Permanent
            return new Date(ban.banned_until) > now;
        });
    } catch (error) {
        console.error("[chatRules] Failed to check room ban:", error);
        return false;
    }
}

/**
 * Check if user is an admin or moderator (exempt from read-only mode, etc.)
 */
export async function isAdminOrModerator(userAddress: string, chatType: string, chatId: string | null): Promise<boolean> {
    if (!supabase) return false;

    const normalized = userAddress.toLowerCase();

    // Check global admin
    const { data: adminData } = await supabase
        .from("shout_admins")
        .select("id")
        .eq("wallet_address", normalized)
        .single();

    if (adminData) return true;

    // Check channel owner
    if (chatType === "channel" && chatId) {
        const { data: channel } = await supabase
            .from("shout_public_channels")
            .select("creator_address")
            .eq("id", chatId)
            .single();

        if (channel?.creator_address?.toLowerCase() === normalized) return true;
    }

    // Check location chat creator
    if (chatType === "location" && chatId) {
        const { data: location } = await supabase
            .from("shout_location_chats")
            .select("created_by")
            .eq("id", chatId)
            .single();

        if (location?.created_by?.toLowerCase() === normalized) return true;
    }

    // Check group admin
    if (chatType === "group" && chatId) {
        const { data: member } = await supabase
            .from("shout_group_members")
            .select("role")
            .eq("group_id", chatId)
            .eq("member_address", normalized)
            .single();

        if (member?.role === "admin") return true;
    }

    // Check moderator
    const modQuery = supabase
        .from("shout_moderators")
        .select("id")
        .eq("user_address", normalized);

    if (chatType === "channel" && chatId) {
        modQuery.eq("channel_id", chatId);
    } else {
        modQuery.is("channel_id", null);
    }

    const { data: modData } = await modQuery.single();
    if (modData) return true;

    return false;
}

/**
 * Validate a message against chat rules. Returns an error string or null if valid.
 */
export async function validateMessageAgainstRules(
    chatType: string,
    chatId: string | null,
    userAddress: string,
    content: string,
    messageType: string
): Promise<string | null> {
    const rules = await getChatRules(chatType, chatId);

    // Check room ban
    const isBanned = await isUserRoomBanned(chatType, chatId, userAddress);
    if (isBanned) {
        return "You are banned from this room";
    }

    // Check read-only mode (admins/mods exempt)
    if (rules.read_only) {
        const isPrivileged = await isAdminOrModerator(userAddress, chatType, chatId);
        if (!isPrivileged) {
            return "This room is in read-only mode";
        }
    }

    // Check message type against rules
    if (messageType === "image" && !rules.photos_allowed) {
        return "Photos are not allowed in this room";
    }
    if (messageType === "pixel_art" && !rules.pixel_art_allowed) {
        return "Pixel art is not allowed in this room";
    }
    if (messageType === "gif" && !rules.gifs_allowed) {
        return "GIFs are not allowed in this room";
    }
    if (messageType === "poll" && !rules.polls_allowed) {
        return "Polls are not allowed in this room";
    }
    if (messageType === "location" && !rules.location_sharing_allowed) {
        return "Location sharing is not allowed in this room";
    }
    if (messageType === "voice" && !rules.voice_allowed) {
        return "Voice messages are not allowed in this room";
    }

    // Check links in text messages
    if (messageType === "text" && !rules.links_allowed) {
        const urlRegex = /https?:\/\/[^\s]+/i;
        if (urlRegex.test(content)) {
            return "Links are not allowed in this room";
        }
    }

    // Check max message length
    if (rules.max_message_length > 0 && content.length > rules.max_message_length) {
        return `Message exceeds maximum length of ${rules.max_message_length} characters`;
    }

    return null; // Valid
}
