import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
    supabaseUrl && supabaseServiceKey
        ? createClient(supabaseUrl, supabaseServiceKey)
        : null;

// Role-based content permission levels
export type ContentPermission = "everyone" | "mods_only" | "disabled";

export type ChatRules = {
    id: string;
    chat_type: string;
    chat_id: string | null;
    links_allowed: ContentPermission;
    photos_allowed: ContentPermission;
    pixel_art_allowed: ContentPermission;
    gifs_allowed: ContentPermission;
    polls_allowed: ContentPermission;
    location_sharing_allowed: ContentPermission;
    voice_allowed: ContentPermission;
    slow_mode_seconds: number;
    read_only: boolean;
    max_message_length: number;
    rules_text: string | null;
    updated_by: string | null;
    updated_at: string;
};

// Default rules (everything allowed for everyone)
const DEFAULT_CHAT_RULES: Omit<
    ChatRules,
    "id" | "chat_type" | "chat_id" | "updated_by" | "updated_at"
> = {
    links_allowed: "everyone",
    photos_allowed: "everyone",
    pixel_art_allowed: "everyone",
    gifs_allowed: "everyone",
    polls_allowed: "everyone",
    location_sharing_allowed: "everyone",
    voice_allowed: "everyone",
    slow_mode_seconds: 0,
    read_only: false,
    max_message_length: 0,
    rules_text: null,
};

// GET /api/chat-rules?chatType=channel&chatId=xxx
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    const { searchParams } = new URL(request.url);
    const chatType = searchParams.get("chatType");
    const chatId = searchParams.get("chatId"); // null for alpha

    if (!chatType) {
        return NextResponse.json(
            { error: "chatType required" },
            { status: 400 },
        );
    }

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

        const { data, error } = await query.limit(1).maybeSingle();

        if (error) {
            console.error("[ChatRules] Fetch error:", error);
            return NextResponse.json(
                { error: "Failed to fetch rules" },
                { status: 500 },
            );
        }

        // Return rules or defaults
        if (data) {
            return NextResponse.json({ rules: data });
        }

        // No rules set yet, return defaults
        return NextResponse.json({
            rules: {
                ...DEFAULT_CHAT_RULES,
                chat_type: chatType,
                chat_id: chatId,
                updated_by: null,
                updated_at: null,
            },
        });
    } catch (error) {
        console.error("[ChatRules] GET error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

// POST /api/chat-rules - Update rules (admin/moderator only)
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    try {
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            console.error("[ChatRules] POST: No session found - authentication required");
            return NextResponse.json(
                { error: "Authentication required - please sign in again" },
                { status: 401 },
            );
        }

        const body = await request.json();
        const { chatType, chatId, rules } = body;

        if (!chatType) {
            return NextResponse.json(
                { error: "chatType required" },
                { status: 400 },
            );
        }

        if (!rules || typeof rules !== "object") {
            return NextResponse.json(
                { error: "rules object required" },
                { status: 400 },
            );
        }

        const userAddress = session.userAddress.toLowerCase();
        console.log("[ChatRules] POST: User", userAddress, "updating", chatType, chatId, "rules:", JSON.stringify(rules));

        // Check if user is admin or has moderator permissions
        const isAuthorized = await checkRulesPermission(
            userAddress,
            chatType,
            chatId,
        );
        if (!isAuthorized) {
            console.error("[ChatRules] POST: User", userAddress, "not authorized for", chatType, chatId);
            return NextResponse.json(
                { error: "Not authorized to manage room rules" },
                { status: 403 },
            );
        }

        // Validate rule fields
        const allowedFields = [
            "links_allowed",
            "photos_allowed",
            "pixel_art_allowed",
            "gifs_allowed",
            "polls_allowed",
            "location_sharing_allowed",
            "voice_allowed",
            "slow_mode_seconds",
            "read_only",
            "max_message_length",
            "rules_text",
        ];

        const updateData: Record<string, unknown> = {
            chat_type: chatType,
            chat_id: chatId || null,
            updated_by: userAddress,
            updated_at: new Date().toISOString(),
        };

        for (const field of allowedFields) {
            if (rules[field] !== undefined) {
                updateData[field] = rules[field];
            }
        }

        // Find existing row first, then update or insert
        // (upsert doesn't work reliably with NULL chat_id in PostgreSQL)
        console.log("[ChatRules] Saving:", JSON.stringify(updateData));

        const existingQuery = supabase
            .from("shout_chat_rules")
            .select("id")
            .eq("chat_type", chatType);

        if (chatId) {
            existingQuery.eq("chat_id", chatId);
        } else {
            existingQuery.is("chat_id", null);
        }

        const { data: existing } = await existingQuery.limit(1).maybeSingle();

        let data, error;
        if (existing?.id) {
            // Update existing row by id
            const result = await supabase
                .from("shout_chat_rules")
                .update(updateData)
                .eq("id", existing.id)
                .select()
                .single();
            data = result.data;
            error = result.error;
        } else {
            // Insert new row
            const result = await supabase
                .from("shout_chat_rules")
                .insert(updateData)
                .select()
                .single();
            data = result.data;
            error = result.error;
        }

        if (error) {
            console.error("[ChatRules] Update error:", error.message, error.details, error.hint);
            return NextResponse.json(
                { error: `Failed to update rules: ${error.message}` },
                { status: 500 },
            );
        }

        console.log("[ChatRules] Updated successfully:", data?.id);
        return NextResponse.json({ success: true, rules: data });
    } catch (error) {
        console.error("[ChatRules] POST error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

// Helper: Check if user can manage rules for this chat
async function checkRulesPermission(
    userAddress: string,
    chatType: string,
    chatId: string | null,
): Promise<boolean> {
    if (!supabase) return false;

    // Check global admin
    const { data: adminData } = await supabase
        .from("shout_admins")
        .select("is_super_admin")
        .eq("wallet_address", userAddress)
        .single();

    if (adminData) return true;

    // Check channel owner
    if (chatType === "channel" && chatId) {
        const { data: channelData } = await supabase
            .from("shout_public_channels")
            .select("creator_address")
            .eq("id", chatId)
            .single();

        if (channelData?.creator_address?.toLowerCase() === userAddress) {
            return true;
        }
    }

    // Check location chat creator
    if (chatType === "location" && chatId) {
        const { data: locationData } = await supabase
            .from("shout_location_chats")
            .select("created_by")
            .eq("id", chatId)
            .single();

        if (locationData?.created_by?.toLowerCase() === userAddress) {
            return true;
        }
    }

    // Check group admin
    if (chatType === "group" && chatId) {
        const { data: groupMember } = await supabase
            .from("shout_group_members")
            .select("role")
            .eq("group_id", chatId)
            .eq("member_address", userAddress)
            .single();

        if (groupMember?.role === "admin") {
            return true;
        }
    }

    // Check token chat creator or admin
    if (chatType === "token" && chatId) {
        const { data: tokenChat } = await supabase
            .from("shout_token_chats")
            .select("created_by")
            .eq("id", chatId)
            .single();

        if (tokenChat?.created_by?.toLowerCase() === userAddress) {
            return true;
        }

        const { data: tokenMember } = await supabase
            .from("shout_token_chat_members")
            .select("role")
            .eq("chat_id", chatId)
            .eq("member_address", userAddress)
            .single();

        if (tokenMember?.role === "admin" || tokenMember?.role === "moderator") {
            return true;
        }
    }

    // Check moderator with manage permissions
    if (chatType === "channel" && chatId) {
        // Check per-channel moderator
        const { data: channelMod } = await supabase
            .from("shout_moderators")
            .select("can_manage_mods")
            .eq("user_address", userAddress)
            .eq("channel_id", chatId)
            .single();

        if (channelMod) return true;

        // For official channels, also check global moderators (shared moderator system)
        const { data: channelInfo } = await supabase
            .from("shout_public_channels")
            .select("is_official")
            .eq("id", chatId)
            .single();

        if (channelInfo?.is_official) {
            const { data: globalMod } = await supabase
                .from("shout_moderators")
                .select("can_manage_mods")
                .eq("user_address", userAddress)
                .is("channel_id", null)
                .single();

            if (globalMod) return true;
        }
    } else {
        const { data: modData } = await supabase
            .from("shout_moderators")
            .select("can_manage_mods")
            .eq("user_address", userAddress)
            .is("channel_id", null)
            .single();

        if (modData) return true;
    }

    return false;
}
