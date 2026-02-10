import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
    supabaseUrl && supabaseServiceKey
        ? createClient(supabaseUrl, supabaseServiceKey)
        : null;

export type BlockedWord = {
    id: string;
    word: string;
    scope: "global" | "room";
    chat_type: string | null;
    chat_id: string | null;
    action: "block" | "flag" | "mute";
    is_regex: boolean;
    added_by: string;
    added_at: string;
    is_active: boolean;
};

// GET /api/blocked-words?scope=global
// GET /api/blocked-words?scope=room&chatType=channel&chatId=xxx
// GET /api/blocked-words?scope=all&chatType=channel&chatId=xxx  (global + room combined)
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") || "global";
    const chatType = searchParams.get("chatType");
    const chatId = searchParams.get("chatId");

    try {
        if (scope === "all" && chatType) {
            // Fetch both global and room-specific words
            const { data: globalWords } = await supabase
                .from("shout_blocked_words")
                .select("*")
                .eq("scope", "global")
                .eq("is_active", true)
                .order("added_at", { ascending: false });

            const roomQuery = supabase
                .from("shout_blocked_words")
                .select("*")
                .eq("scope", "room")
                .eq("chat_type", chatType)
                .eq("is_active", true)
                .order("added_at", { ascending: false });

            if (chatId) {
                roomQuery.eq("chat_id", chatId);
            } else {
                roomQuery.is("chat_id", null);
            }

            const { data: roomWords } = await roomQuery;

            return NextResponse.json({
                words: [...(globalWords || []), ...(roomWords || [])],
            });
        }

        // Single scope query
        const query = supabase
            .from("shout_blocked_words")
            .select("*")
            .eq("is_active", true)
            .order("added_at", { ascending: false });

        if (scope === "global") {
            query.eq("scope", "global");
        } else if (scope === "room" && chatType) {
            query.eq("scope", "room").eq("chat_type", chatType);
            if (chatId) {
                query.eq("chat_id", chatId);
            } else {
                query.is("chat_id", null);
            }
        }

        const { data, error } = await query;

        if (error) {
            console.error("[BlockedWords] Fetch error:", error);
            return NextResponse.json(
                { error: "Failed to fetch blocked words" },
                { status: 500 },
            );
        }

        return NextResponse.json({ words: data || [] });
    } catch (error) {
        console.error("[BlockedWords] GET error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

// POST /api/blocked-words - Add a blocked word
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
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const body = await request.json();
        const { word, scope, chatType, chatId, action, isRegex } = body;

        if (!word?.trim()) {
            return NextResponse.json(
                { error: "Word is required" },
                { status: 400 },
            );
        }

        const userAddress = session.userAddress.toLowerCase();

        // Check permissions
        const isAuthorized = await checkBlockedWordsPermission(
            userAddress,
            scope || "global",
            chatType,
            chatId,
        );
        if (!isAuthorized) {
            return NextResponse.json(
                { error: "Not authorized to manage blocked words" },
                { status: 403 },
            );
        }

        // Validate regex if provided
        if (isRegex) {
            try {
                new RegExp(word.trim(), "i");
            } catch {
                return NextResponse.json(
                    { error: "Invalid regex pattern" },
                    { status: 400 },
                );
            }
        }

        const { data, error } = await supabase
            .from("shout_blocked_words")
            .insert({
                word: word.trim().toLowerCase(),
                scope: scope || "global",
                chat_type: scope === "room" ? chatType : null,
                chat_id: scope === "room" ? chatId || null : null,
                action: action || "block",
                is_regex: isRegex || false,
                added_by: userAddress,
            })
            .select()
            .single();

        if (error) {
            if (error.code === "23505") {
                return NextResponse.json(
                    { error: "This word is already blocked" },
                    { status: 409 },
                );
            }
            console.error("[BlockedWords] Insert error:", error);
            console.error("[BlockedWords] Insert error details:", JSON.stringify({
                code: error.code,
                message: error.message,
                details: error.details,
                hint: error.hint,
                insertPayload: {
                    word: word.trim().toLowerCase(),
                    scope: scope || "global",
                    chat_type: scope === "room" ? chatType : null,
                    chat_id: scope === "room" ? chatId || null : null,
                    action: action || "block",
                    is_regex: isRegex || false,
                    added_by: userAddress,
                },
            }));
            return NextResponse.json(
                { 
                    error: "Failed to add blocked word",
                    debug: {
                        code: error.code,
                        message: error.message,
                        hint: error.hint,
                    }
                },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true, word: data });
    } catch (error) {
        console.error("[BlockedWords] POST error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

// DELETE /api/blocked-words - Remove a blocked word (soft delete)
export async function DELETE(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json(
            { error: "Database not configured" },
            { status: 500 },
        );
    }

    try {
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 },
            );
        }

        const body = await request.json();
        const { id } = body;

        if (!id) {
            return NextResponse.json(
                { error: "Word ID required" },
                { status: 400 },
            );
        }

        const userAddress = session.userAddress.toLowerCase();

        // Get the word to check permissions
        const { data: wordData } = await supabase
            .from("shout_blocked_words")
            .select("*")
            .eq("id", id)
            .single();

        if (!wordData) {
            return NextResponse.json(
                { error: "Word not found" },
                { status: 404 },
            );
        }

        const isAuthorized = await checkBlockedWordsPermission(
            userAddress,
            wordData.scope,
            wordData.chat_type,
            wordData.chat_id,
        );
        if (!isAuthorized) {
            return NextResponse.json(
                { error: "Not authorized" },
                { status: 403 },
            );
        }

        // Soft delete
        const { error } = await supabase
            .from("shout_blocked_words")
            .update({ is_active: false })
            .eq("id", id);

        if (error) {
            console.error("[BlockedWords] Delete error:", error);
            return NextResponse.json(
                { error: "Failed to remove blocked word" },
                { status: 500 },
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[BlockedWords] DELETE error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

// Helper: Check permissions for managing blocked words
async function checkBlockedWordsPermission(
    userAddress: string,
    scope: string,
    chatType?: string | null,
    chatId?: string | null,
): Promise<boolean> {
    if (!supabase) return false;

    // Global scope: admin or global moderator
    if (scope === "global") {
        const { data: adminData } = await supabase
            .from("shout_admins")
            .select("id")
            .eq("wallet_address", userAddress)
            .single();
        if (adminData) return true;

        // Also allow global moderators to manage global blocked words
        const { data: modData } = await supabase
            .from("shout_moderators")
            .select("id")
            .eq("user_address", userAddress)
            .is("channel_id", null)
            .single();
        return !!modData;
    }

    // Room scope: admin, owner, or moderator with manage perms
    const { data: adminData } = await supabase
        .from("shout_admins")
        .select("id")
        .eq("wallet_address", userAddress)
        .single();
    if (adminData) return true;

    if (chatType === "channel" && chatId) {
        const { data: channel } = await supabase
            .from("shout_public_channels")
            .select("creator_address")
            .eq("id", chatId)
            .single();
        if (channel?.creator_address?.toLowerCase() === userAddress) return true;
    }

    if (chatType === "location" && chatId) {
        const { data: location } = await supabase
            .from("shout_location_chats")
            .select("created_by")
            .eq("id", chatId)
            .single();
        if (location?.created_by?.toLowerCase() === userAddress) return true;
    }

    if (chatType === "group" && chatId) {
        const { data: member } = await supabase
            .from("shout_group_members")
            .select("role")
            .eq("group_id", chatId)
            .eq("member_address", userAddress)
            .single();
        if (member?.role === "admin") return true;
    }

    // Moderator with manage permissions
    const modQuery = supabase
        .from("shout_moderators")
        .select("can_manage_mods")
        .eq("user_address", userAddress);

    if (chatType === "channel" && chatId) {
        modQuery.eq("channel_id", chatId);
    } else {
        modQuery.is("channel_id", null);
    }

    const { data: modData } = await modQuery.single();
    if (modData) return true;

    return false;
}
