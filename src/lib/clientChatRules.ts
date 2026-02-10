/**
 * Client-side chat rule validation.
 * Mirrors the server-side validateMessageAgainstRules logic so that
 * chat types without a dedicated API route (Alpha, Group) can still
 * enforce content restrictions before sending.
 */

export type ContentPermission = "everyone" | "mods_only" | "disabled";

export type ClientChatRules = {
    links_allowed?: ContentPermission | boolean | string;
    photos_allowed?: ContentPermission | boolean | string;
    pixel_art_allowed?: ContentPermission | boolean | string;
    gifs_allowed?: ContentPermission | boolean | string;
    polls_allowed?: ContentPermission | boolean | string;
    location_sharing_allowed?: ContentPermission | boolean | string;
    voice_allowed?: ContentPermission | boolean | string;
    read_only?: boolean;
    max_message_length?: number;
};

/** Normalize a content rule value (handles legacy booleans) */
function normalize(value: unknown): ContentPermission {
    if (value === "everyone" || value === "mods_only" || value === "disabled") return value;
    if (value === true || value === "true") return "everyone";
    if (value === false || value === "false") return "disabled";
    return "everyone";
}

// Comprehensive URL detection regex - must match server-side chatRules.ts
const URL_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+|\b[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|org|net|io|xyz|co|me|info|app|dev|gg|cc|ly|to|link|click|fun|site|online|top|live|space|tech|pro|us|uk|eu|de|fr|ca|au|ru|cn|br|in)\b[^\s]*/i;

/**
 * Validate a message against chat rules client-side.
 * Returns an error string or null if valid.
 *
 * @param rules       - The chat rules object (from useChatRules hook)
 * @param content     - Message text content
 * @param messageType - "text" | "image" | "pixel_art" | "gif" | "poll" | "location" | "voice"
 * @param isModerator - Whether the current user is a mod/admin
 */
export function validateMessageClientSide(
    rules: ClientChatRules | null | undefined,
    content: string,
    messageType: string,
    isModerator: boolean,
): string | null {
    if (!rules) return null; // No rules = everything allowed

    // Check read-only mode
    if (rules.read_only && !isModerator) {
        return "This room is in read-only mode";
    }

    // Check content type restrictions for non-text message types
    const contentRuleMap: Record<string, { rule: ContentPermission; label: string }> = {
        image: { rule: normalize(rules.photos_allowed), label: "Photos" },
        pixel_art: { rule: normalize(rules.pixel_art_allowed), label: "Pixel art" },
        gif: { rule: normalize(rules.gifs_allowed), label: "GIFs" },
        poll: { rule: normalize(rules.polls_allowed), label: "Polls" },
        location: { rule: normalize(rules.location_sharing_allowed), label: "Location sharing" },
        voice: { rule: normalize(rules.voice_allowed), label: "Voice messages" },
    };

    const contentCheck = contentRuleMap[messageType];
    if (contentCheck && contentCheck.rule !== "everyone") {
        if (contentCheck.rule === "disabled" && !isModerator) {
            return `${contentCheck.label} are not allowed in this room`;
        }
        if (contentCheck.rule === "mods_only" && !isModerator) {
            return `${contentCheck.label} are only allowed for moderators`;
        }
    }

    // Check links in text messages
    if (messageType === "text" && normalize(rules.links_allowed) !== "everyone") {
        if (URL_REGEX.test(content)) {
            const linkRule = normalize(rules.links_allowed);
            if (linkRule === "disabled" && !isModerator) {
                return "Links are not allowed in this room";
            }
            if (linkRule === "mods_only" && !isModerator) {
                return "Links are only allowed for moderators";
            }
        }
    }

    // Check max message length
    if (rules.max_message_length && rules.max_message_length > 0 && content.length > rules.max_message_length) {
        return `Message exceeds maximum length of ${rules.max_message_length} characters`;
    }

    return null; // Valid
}
