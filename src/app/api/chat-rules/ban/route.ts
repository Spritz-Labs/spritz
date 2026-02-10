import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

// GET /api/chat-rules/ban?chatType=channel&chatId=xxx - List bans or check if user is banned
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const chatType = searchParams.get("chatType");
    const chatId = searchParams.get("chatId");
    const userAddress = searchParams.get("userAddress");
    const action = searchParams.get("action") || "list"; // "list" or "check"

    if (!chatType) {
        return NextResponse.json({ error: "chatType required" }, { status: 400 });
    }

    try {
        if (action === "check" && userAddress) {
            // Check if a specific user is banned from this room
            const isBanned = await isUserRoomBanned(chatType, chatId, userAddress.toLowerCase());
            return NextResponse.json({ isBanned });
        }

        // List all active bans for the room
        const query = supabase
            .from("shout_room_bans")
            .select("*")
            .eq("chat_type", chatType)
            .eq("is_active", true)
            .order("banned_at", { ascending: false });

        if (chatId) {
            query.eq("chat_id", chatId);
        } else {
            query.is("chat_id", null);
        }

        const { data: bans, error } = await query;

        if (error) {
            console.error("[RoomBans] List error:", error);
            return NextResponse.json({ error: "Failed to fetch bans" }, { status: 500 });
        }

        return NextResponse.json({ bans: bans || [] });
    } catch (error) {
        console.error("[RoomBans] GET error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

// POST /api/chat-rules/ban - Ban or unban a user from a room
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const session = await getAuthenticatedUser(request);
        if (!session?.userAddress) {
            return NextResponse.json({ error: "Authentication required" }, { status: 401 });
        }

        const body = await request.json();
        const { action, chatType, chatId, targetAddress, reason, duration } = body;

        if (!chatType || !targetAddress) {
            return NextResponse.json({ error: "chatType and targetAddress required" }, { status: 400 });
        }

        const moderatorAddress = session.userAddress.toLowerCase();
        const normalizedTarget = targetAddress.toLowerCase();

        // Check if the moderator has permission
        const isAuthorized = await checkBanPermission(moderatorAddress, chatType, chatId);
        if (!isAuthorized) {
            return NextResponse.json({ error: "Not authorized to ban/unban users" }, { status: 403 });
        }

        // Can't ban yourself
        if (moderatorAddress === normalizedTarget) {
            return NextResponse.json({ error: "Cannot ban yourself" }, { status: 400 });
        }

        // Check if target is an admin (admins can't be room-banned)
        const { data: targetAdmin } = await supabase
            .from("shout_admins")
            .select("id")
            .eq("wallet_address", normalizedTarget)
            .single();

        if (targetAdmin) {
            return NextResponse.json({ error: "Cannot ban an admin" }, { status: 403 });
        }

        if (action === "ban") {
            // Calculate ban expiry
            let bannedUntil: string | null = null;
            if (duration && duration !== "permanent") {
                const durationMs = parseDuration(duration);
                if (durationMs) {
                    bannedUntil = new Date(Date.now() + durationMs).toISOString();
                }
            }

            // Deactivate any existing ban first
            const deactivateQuery = supabase
                .from("shout_room_bans")
                .update({ is_active: false })
                .eq("chat_type", chatType)
                .eq("user_address", normalizedTarget)
                .eq("is_active", true);

            if (chatId) {
                deactivateQuery.eq("chat_id", chatId);
            } else {
                deactivateQuery.is("chat_id", null);
            }
            await deactivateQuery;

            // Insert new ban
            const { data: ban, error } = await supabase
                .from("shout_room_bans")
                .insert({
                    chat_type: chatType,
                    chat_id: chatId || null,
                    user_address: normalizedTarget,
                    banned_by: moderatorAddress,
                    reason: reason || null,
                    banned_until: bannedUntil,
                })
                .select()
                .single();

            if (error) {
                console.error("[RoomBans] Ban error:", error);
                return NextResponse.json({ error: "Failed to ban user" }, { status: 500 });
            }

            // Also remove user from the room membership
            await removeFromRoom(chatType, chatId, normalizedTarget);

            // Log moderation action
            await logModAction("room_ban", moderatorAddress, normalizedTarget, chatType, chatId, reason);

            return NextResponse.json({ success: true, ban });
        }

        if (action === "unban") {
            const query = supabase
                .from("shout_room_bans")
                .update({ is_active: false })
                .eq("chat_type", chatType)
                .eq("user_address", normalizedTarget)
                .eq("is_active", true);

            if (chatId) {
                query.eq("chat_id", chatId);
            } else {
                query.is("chat_id", null);
            }

            const { error } = await query;

            if (error) {
                console.error("[RoomBans] Unban error:", error);
                return NextResponse.json({ error: "Failed to unban user" }, { status: 500 });
            }

            // Log moderation action
            await logModAction("room_unban", moderatorAddress, normalizedTarget, chatType, chatId);

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Invalid action. Use 'ban' or 'unban'" }, { status: 400 });
    } catch (error) {
        console.error("[RoomBans] POST error:", error);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

// Helper: Check if user is banned from a specific room
async function isUserRoomBanned(chatType: string, chatId: string | null, userAddress: string): Promise<boolean> {
    if (!supabase) return false;

    const query = supabase
        .from("shout_room_bans")
        .select("id, banned_until")
        .eq("chat_type", chatType)
        .eq("user_address", userAddress)
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
}

// Helper: Check if user can ban in this room
async function checkBanPermission(userAddress: string, chatType: string, chatId: string | null): Promise<boolean> {
    if (!supabase) return false;

    // Global admin
    const { data: adminData } = await supabase
        .from("shout_admins")
        .select("id")
        .eq("wallet_address", userAddress)
        .single();

    if (adminData) return true;

    // Channel owner
    if (chatType === "channel" && chatId) {
        const { data: channel } = await supabase
            .from("shout_public_channels")
            .select("creator_address")
            .eq("id", chatId)
            .single();

        if (channel?.creator_address?.toLowerCase() === userAddress) return true;
    }

    // Location chat creator
    if (chatType === "location" && chatId) {
        const { data: location } = await supabase
            .from("shout_location_chats")
            .select("created_by")
            .eq("id", chatId)
            .single();

        if (location?.created_by?.toLowerCase() === userAddress) return true;
    }

    // Group admin
    if (chatType === "group" && chatId) {
        const { data: member } = await supabase
            .from("shout_group_members")
            .select("role")
            .eq("group_id", chatId)
            .eq("member_address", userAddress)
            .single();

        if (member?.role === "admin") return true;
    }

    // Moderator with mute permission (reuse mute perm for bans)
    if (chatType === "channel" && chatId) {
        // Check per-channel moderator
        const { data: channelMod } = await supabase
            .from("shout_moderators")
            .select("can_mute")
            .eq("user_address", userAddress)
            .eq("channel_id", chatId)
            .single();

        if (channelMod?.can_mute) return true;

        // For official channels, also check global moderators (shared moderator system)
        const { data: channelInfo } = await supabase
            .from("shout_public_channels")
            .select("is_official")
            .eq("id", chatId)
            .single();

        if (channelInfo?.is_official) {
            const { data: globalMod } = await supabase
                .from("shout_moderators")
                .select("can_mute")
                .eq("user_address", userAddress)
                .is("channel_id", null)
                .single();

            if (globalMod?.can_mute) return true;
        }
    } else {
        const { data: modData } = await supabase
            .from("shout_moderators")
            .select("can_mute")
            .eq("user_address", userAddress)
            .is("channel_id", null)
            .single();

        if (modData?.can_mute) return true;
    }

    return false;
}

// Helper: Remove user from room membership on ban
async function removeFromRoom(chatType: string, chatId: string | null, userAddress: string) {
    if (!supabase || !chatId) return;

    try {
        if (chatType === "channel") {
            await supabase
                .from("shout_channel_members")
                .delete()
                .eq("channel_id", chatId)
                .eq("user_address", userAddress);

            // Decrement member count
            try { await supabase.rpc("decrement_channel_members", { channel_uuid: chatId }); } catch {}
        } else if (chatType === "location") {
            await supabase
                .from("shout_location_chat_members")
                .delete()
                .eq("location_chat_id", chatId)
                .eq("user_address", userAddress);
        } else if (chatType === "group") {
            await supabase
                .from("shout_group_members")
                .delete()
                .eq("group_id", chatId)
                .eq("member_address", userAddress);
        }
    } catch (error) {
        console.error("[RoomBans] Failed to remove user from room:", error);
    }
}

// Helper: Log moderation action
async function logModAction(
    actionType: string,
    moderatorAddress: string,
    targetAddress: string,
    chatType: string,
    chatId: string | null,
    reason?: string
) {
    if (!supabase) return;

    try {
        await supabase.from("shout_moderation_log").insert({
            action_type: actionType,
            moderator_address: moderatorAddress,
            target_user_address: targetAddress,
            channel_id: chatType === "channel" ? chatId : null,
            reason: reason || null,
            metadata: { chat_type: chatType, chat_id: chatId },
        });
    } catch (error) {
        console.error("[RoomBans] Failed to log action:", error);
    }
}

function parseDuration(duration: string): number | null {
    const match = duration.match(/^(\d+)(m|h|d|w)$/);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
        case "m": return value * 60 * 1000;
        case "h": return value * 60 * 60 * 1000;
        case "d": return value * 24 * 60 * 60 * 1000;
        case "w": return value * 7 * 24 * 60 * 60 * 1000;
        default: return null;
    }
}
