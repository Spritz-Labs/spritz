/**
 * Client-side chat rule validation.
 * Mirrors the server-side validateMessageAgainstRules logic so that
 * chat types without a dedicated API route (Alpha, Group) can still
 * enforce content restrictions before sending.
 *
 * Also enforces blocked words on ALL surfaces (DMs, groups, alpha,
 * token chats, waku channels) — not just the two server routes.
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

// ── Blocked words client-side cache ──

type BlockedWordRule = {
    word: string;
    is_regex: boolean;
    action: "block" | "flag" | "mute";
    scope: "global" | "room";
    chat_type: string | null;
    chat_id: string | null;
};

let _globalBlockedWords: BlockedWordRule[] = [];
let _globalBlockedWordsFetchedAt = 0;
const BLOCKED_WORDS_TTL_MS = 60_000; // refresh every 60s
let _fetchInFlight: Promise<void> | null = null;

async function ensureGlobalBlockedWords(): Promise<BlockedWordRule[]> {
    if (
        _globalBlockedWords.length > 0 &&
        Date.now() - _globalBlockedWordsFetchedAt < BLOCKED_WORDS_TTL_MS
    ) {
        return _globalBlockedWords;
    }

    if (_fetchInFlight) {
        await _fetchInFlight;
        return _globalBlockedWords;
    }

    _fetchInFlight = (async () => {
        try {
            const res = await fetch("/api/blocked-words?scope=all");
            if (res.ok) {
                const data = await res.json();
                _globalBlockedWords = (data.words || []).filter(
                    (w: BlockedWordRule) => w.action === "block" || w.action === "mute",
                );
                _globalBlockedWordsFetchedAt = Date.now();
            }
        } catch {
            // fail open — don't block sends if the fetch fails
        } finally {
            _fetchInFlight = null;
        }
    })();

    await _fetchInFlight;
    return _globalBlockedWords;
}

/** Force a refresh on next check (e.g. after admin adds a word). */
export function invalidateBlockedWordsCache(): void {
    _globalBlockedWordsFetchedAt = 0;
}

function matchesBlockedWord(entry: BlockedWordRule, text: string): boolean {
    if (entry.is_regex) {
        try {
            return new RegExp(entry.word, "i").test(text);
        } catch {
            return false;
        }
    }
    const escaped = entry.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) return true;
    return text.toLowerCase().includes(entry.word.toLowerCase());
}

/**
 * Check content against global + optional room-specific blocked words.
 * Returns an error string or null.
 */
export async function checkBlockedWordsClient(
    content: string,
    chatType?: string | null,
    chatId?: string | null,
): Promise<string | null> {
    if (!content.trim()) return null;

    const words = await ensureGlobalBlockedWords();
    if (words.length === 0) return null;

    for (const entry of words) {
        // Skip room-specific entries that don't match this room
        if (entry.scope === "room") {
            if (!chatType || entry.chat_type !== chatType) continue;
            if (chatId && entry.chat_id && entry.chat_id !== chatId) continue;
        }

        if (matchesBlockedWord(entry, content)) {
            return "Your message contains a word that is not allowed";
        }
    }

    return null;
}

// ── Main validation ──

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
