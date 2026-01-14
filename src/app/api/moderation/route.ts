import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[Moderation API] Missing Supabase configuration");
}

const supabase = supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

export type ModPermissions = {
    isAdmin: boolean;
    isSuperAdmin: boolean;
    isModerator: boolean;
    canPin: boolean;
    canDelete: boolean;
    canMute: boolean;
    canManageMods: boolean;
};

export type Moderator = {
    id: string;
    user_address: string;
    channel_id: string | null;
    granted_by: string;
    granted_at: string;
    can_pin: boolean;
    can_delete: boolean;
    can_mute: boolean;
    can_manage_mods: boolean;
    notes: string | null;
};

export type MutedUser = {
    id: string;
    user_address: string;
    channel_id: string | null;
    muted_by: string;
    muted_at: string;
    muted_until: string | null;
    reason: string | null;
    is_active: boolean;
};

// GET - Get moderation info (permissions, moderators list, muted users)
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const userAddress = searchParams.get("userAddress");
    const channelId = searchParams.get("channelId"); // null for global/alpha chat

    try {
        switch (action) {
            case "permissions": {
                if (!userAddress) {
                    return NextResponse.json({ error: "userAddress required" }, { status: 400 });
                }

                const permissions = await getUserPermissions(userAddress, channelId);
                return NextResponse.json({ permissions });
            }

            case "moderators": {
                const { data: moderators, error } = await supabase
                    .from("shout_moderators")
                    .select("*")
                    .eq("channel_id", channelId)
                    .order("granted_at", { ascending: false });

                if (error) throw error;
                return NextResponse.json({ moderators: moderators || [] });
            }

            case "muted": {
                const query = supabase
                    .from("shout_muted_users")
                    .select("*")
                    .eq("is_active", true);

                if (channelId) {
                    query.eq("channel_id", channelId);
                } else {
                    query.is("channel_id", null);
                }

                const { data: mutedUsers, error } = await query.order("muted_at", { ascending: false });

                if (error) throw error;
                return NextResponse.json({ mutedUsers: mutedUsers || [] });
            }

            case "check-muted": {
                if (!userAddress) {
                    return NextResponse.json({ error: "userAddress required" }, { status: 400 });
                }

                const isMuted = await isUserMuted(userAddress, channelId);
                return NextResponse.json({ isMuted });
            }

            case "mod-log": {
                // Only admins can view the full log
                const requestingUser = searchParams.get("requestingUser");
                if (!requestingUser) {
                    return NextResponse.json({ error: "requestingUser required" }, { status: 400 });
                }

                const permissions = await getUserPermissions(requestingUser, channelId);
                if (!permissions.isAdmin && !permissions.canManageMods) {
                    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
                }

                const query = supabase
                    .from("shout_moderation_log")
                    .select("*")
                    .order("created_at", { ascending: false })
                    .limit(100);

                if (channelId) {
                    query.eq("channel_id", channelId);
                }

                const { data: logs, error } = await query;
                if (error) throw error;

                return NextResponse.json({ logs: logs || [] });
            }

            default:
                return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }
    } catch (error) {
        console.error("[Moderation API] GET error:", error);
        return NextResponse.json({ error: "Failed to fetch moderation data" }, { status: 500 });
    }
}

// POST - Perform moderation actions
export async function POST(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { action, moderatorAddress, channelId } = body;

        if (!moderatorAddress) {
            return NextResponse.json({ error: "moderatorAddress required" }, { status: 400 });
        }

        // Verify the moderator has permissions
        const permissions = await getUserPermissions(moderatorAddress, channelId);

        switch (action) {
            case "promote-mod": {
                const { targetAddress, canPin, canDelete, canMute, canManageMods, notes } = body;

                if (!permissions.canManageMods && !permissions.isAdmin) {
                    return NextResponse.json({ error: "Not authorized to manage moderators" }, { status: 403 });
                }

                if (!targetAddress) {
                    return NextResponse.json({ error: "targetAddress required" }, { status: 400 });
                }

                // Insert or update moderator
                const { data, error } = await supabase
                    .from("shout_moderators")
                    .upsert({
                        user_address: targetAddress.toLowerCase(),
                        channel_id: channelId || null,
                        granted_by: moderatorAddress.toLowerCase(),
                        can_pin: canPin ?? true,
                        can_delete: canDelete ?? true,
                        can_mute: canMute ?? true,
                        can_manage_mods: canManageMods ?? false,
                        notes: notes || null,
                    }, {
                        onConflict: "user_address,channel_id",
                    })
                    .select()
                    .single();

                if (error) throw error;

                // Log the action
                await logModAction("promote_mod", moderatorAddress, targetAddress, null, channelId, notes);

                return NextResponse.json({ success: true, moderator: data });
            }

            case "demote-mod": {
                const { targetAddress } = body;

                if (!permissions.canManageMods && !permissions.isAdmin) {
                    return NextResponse.json({ error: "Not authorized to manage moderators" }, { status: 403 });
                }

                if (!targetAddress) {
                    return NextResponse.json({ error: "targetAddress required" }, { status: 400 });
                }

                const query = supabase
                    .from("shout_moderators")
                    .delete()
                    .eq("user_address", targetAddress.toLowerCase());

                if (channelId) {
                    query.eq("channel_id", channelId);
                } else {
                    query.is("channel_id", null);
                }

                const { error } = await query;
                if (error) throw error;

                // Log the action
                await logModAction("demote_mod", moderatorAddress, targetAddress, null, channelId);

                return NextResponse.json({ success: true });
            }

            case "mute-user": {
                const { targetAddress, duration, reason } = body;

                if (!permissions.canMute) {
                    return NextResponse.json({ error: "Not authorized to mute users" }, { status: 403 });
                }

                if (!targetAddress) {
                    return NextResponse.json({ error: "targetAddress required" }, { status: 400 });
                }

                // Check if target is an admin or moderator (can't mute them unless you're a higher rank)
                const targetPerms = await getUserPermissions(targetAddress, channelId);
                if (targetPerms.isAdmin && !permissions.isSuperAdmin) {
                    return NextResponse.json({ error: "Cannot mute an admin" }, { status: 403 });
                }
                if (targetPerms.isModerator && !permissions.isAdmin && !permissions.canManageMods) {
                    return NextResponse.json({ error: "Cannot mute a moderator" }, { status: 403 });
                }

                // Calculate muted_until
                let mutedUntil: string | null = null;
                if (duration && duration !== "permanent") {
                    const now = new Date();
                    const durationMs = parseDuration(duration);
                    if (durationMs) {
                        mutedUntil = new Date(now.getTime() + durationMs).toISOString();
                    }
                }

                const { data, error } = await supabase
                    .from("shout_muted_users")
                    .insert({
                        user_address: targetAddress.toLowerCase(),
                        channel_id: channelId || null,
                        muted_by: moderatorAddress.toLowerCase(),
                        muted_until: mutedUntil,
                        reason: reason || null,
                    })
                    .select()
                    .single();

                if (error) throw error;

                // Log the action
                await logModAction("mute", moderatorAddress, targetAddress, null, channelId, reason, {
                    duration,
                    muted_until: mutedUntil,
                });

                return NextResponse.json({ success: true, mute: data });
            }

            case "unmute-user": {
                const { targetAddress } = body;

                if (!permissions.canMute) {
                    return NextResponse.json({ error: "Not authorized to unmute users" }, { status: 403 });
                }

                if (!targetAddress) {
                    return NextResponse.json({ error: "targetAddress required" }, { status: 400 });
                }

                const query = supabase
                    .from("shout_muted_users")
                    .update({
                        is_active: false,
                        unmuted_by: moderatorAddress.toLowerCase(),
                        unmuted_at: new Date().toISOString(),
                    })
                    .eq("user_address", targetAddress.toLowerCase())
                    .eq("is_active", true);

                if (channelId) {
                    query.eq("channel_id", channelId);
                } else {
                    query.is("channel_id", null);
                }

                const { error } = await query;
                if (error) throw error;

                // Log the action
                await logModAction("unmute", moderatorAddress, targetAddress, null, channelId);

                return NextResponse.json({ success: true });
            }

            case "delete-message": {
                const { messageId, messageType, reason } = body; // messageType: 'alpha' or 'channel'

                if (!permissions.canDelete) {
                    return NextResponse.json({ error: "Not authorized to delete messages" }, { status: 403 });
                }

                if (!messageId) {
                    return NextResponse.json({ error: "messageId required" }, { status: 400 });
                }

                const table = messageType === "alpha" ? "shout_alpha_messages" : "shout_channel_messages";

                // Get the message first to record who sent it
                const { data: message } = await supabase
                    .from(table)
                    .select("sender_address")
                    .eq("id", messageId)
                    .single();

                const { error } = await supabase
                    .from(table)
                    .update({
                        is_deleted: true,
                        deleted_by: moderatorAddress.toLowerCase(),
                        deleted_at: new Date().toISOString(),
                        delete_reason: reason || null,
                    })
                    .eq("id", messageId);

                if (error) throw error;

                // Log the action
                await logModAction(
                    "delete",
                    moderatorAddress,
                    message?.sender_address || null,
                    messageId,
                    channelId,
                    reason
                );

                return NextResponse.json({ success: true });
            }

            case "pin-message": {
                const { messageId, messageType, shouldPin } = body;

                if (!permissions.canPin) {
                    return NextResponse.json({ error: "Not authorized to pin messages" }, { status: 403 });
                }

                if (!messageId) {
                    return NextResponse.json({ error: "messageId required" }, { status: 400 });
                }

                const table = messageType === "alpha" ? "shout_alpha_messages" : "shout_channel_messages";

                const updateData = shouldPin
                    ? {
                        is_pinned: true,
                        pinned_by: moderatorAddress.toLowerCase(),
                        pinned_at: new Date().toISOString(),
                    }
                    : {
                        is_pinned: false,
                        pinned_by: null,
                        pinned_at: null,
                    };

                const { error } = await supabase
                    .from(table)
                    .update(updateData)
                    .eq("id", messageId);

                if (error) throw error;

                // Log the action
                await logModAction(shouldPin ? "pin" : "unpin", moderatorAddress, null, messageId, channelId);

                return NextResponse.json({ success: true });
            }

            default:
                return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }
    } catch (error) {
        console.error("[Moderation API] POST error:", error);
        return NextResponse.json({ error: "Failed to perform moderation action" }, { status: 500 });
    }
}

// Helper functions
async function getUserPermissions(userAddress: string, channelId: string | null): Promise<ModPermissions> {
    if (!supabase) {
        return {
            isAdmin: false,
            isSuperAdmin: false,
            isModerator: false,
            canPin: false,
            canDelete: false,
            canMute: false,
            canManageMods: false,
        };
    }

    // Check admin status
    const { data: adminData } = await supabase
        .from("shout_admins")
        .select("is_super_admin")
        .eq("wallet_address", userAddress.toLowerCase())
        .single();

    if (adminData) {
        return {
            isAdmin: true,
            isSuperAdmin: adminData.is_super_admin || false,
            isModerator: true,
            canPin: true,
            canDelete: true,
            canMute: true,
            canManageMods: true,
        };
    }

    // Check if channel owner (for channel-specific permissions)
    if (channelId) {
        const { data: channelData } = await supabase
            .from("shout_public_channels")
            .select("created_by")
            .eq("id", channelId)
            .single();

        if (channelData?.created_by?.toLowerCase() === userAddress.toLowerCase()) {
            return {
                isAdmin: false,
                isSuperAdmin: false,
                isModerator: true,
                canPin: true,
                canDelete: true,
                canMute: true,
                canManageMods: true, // Owners can manage their channel's mods
            };
        }
    }

    // Check moderator status
    const query = supabase
        .from("shout_moderators")
        .select("can_pin, can_delete, can_mute, can_manage_mods")
        .eq("user_address", userAddress.toLowerCase());

    if (channelId) {
        query.eq("channel_id", channelId);
    } else {
        query.is("channel_id", null);
    }

    const { data: modData } = await query.single();

    if (modData) {
        return {
            isAdmin: false,
            isSuperAdmin: false,
            isModerator: true,
            canPin: modData.can_pin,
            canDelete: modData.can_delete,
            canMute: modData.can_mute,
            canManageMods: modData.can_manage_mods,
        };
    }

    return {
        isAdmin: false,
        isSuperAdmin: false,
        isModerator: false,
        canPin: false,
        canDelete: false,
        canMute: false,
        canManageMods: false,
    };
}

async function isUserMuted(userAddress: string, channelId: string | null): Promise<boolean> {
    if (!supabase) return false;

    const query = supabase
        .from("shout_muted_users")
        .select("id, muted_until")
        .eq("user_address", userAddress.toLowerCase())
        .eq("is_active", true);

    if (channelId) {
        query.eq("channel_id", channelId);
    } else {
        query.is("channel_id", null);
    }

    const { data } = await query;

    if (!data || data.length === 0) return false;

    // Check if any active mute is still valid
    const now = new Date();
    return data.some(mute => {
        if (!mute.muted_until) return true; // Permanent mute
        return new Date(mute.muted_until) > now;
    });
}

async function logModAction(
    actionType: string,
    moderatorAddress: string,
    targetUserAddress: string | null,
    targetMessageId: string | null,
    channelId: string | null,
    reason?: string,
    metadata?: Record<string, unknown>
) {
    if (!supabase) return;

    try {
        await supabase.from("shout_moderation_log").insert({
            action_type: actionType,
            moderator_address: moderatorAddress.toLowerCase(),
            target_user_address: targetUserAddress?.toLowerCase() || null,
            target_message_id: targetMessageId,
            channel_id: channelId || null,
            reason: reason || null,
            metadata: metadata || null,
        });
    } catch (error) {
        console.error("[Moderation API] Failed to log action:", error);
    }
}

function parseDuration(duration: string): number | null {
    const match = duration.match(/^(\d+)(m|h|d|w)$/);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
        case "m": return value * 60 * 1000; // minutes
        case "h": return value * 60 * 60 * 1000; // hours
        case "d": return value * 24 * 60 * 60 * 1000; // days
        case "w": return value * 7 * 24 * 60 * 60 * 1000; // weeks
        default: return null;
    }
}
