import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/session";
import { supabase, isSupabaseConfigured } from "@/config/supabase";

export const dynamic = "force-dynamic";

// GET /api/users/mute - Get muted conversations for user
export async function GET(request: NextRequest) {
    if (!isSupabaseConfigured || !supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const session = await getAuthenticatedUser(request);
    if (!session?.userAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { data, error } = await supabase
            .from("shout_muted_conversations")
            .select("*")
            .eq("user_address", session.userAddress.toLowerCase())
            .or(`muted_until.is.null,muted_until.gt.${new Date().toISOString()}`);

        if (error) {
            console.error("[Mute API] Error fetching mutes:", error);
            // Graceful: return empty list instead of 500 (e.g. schema not yet migrated)
            return NextResponse.json({ mutes: [] });
        }

        return NextResponse.json({ mutes: data || [] });
    } catch (err) {
        console.error("[Mute API] Error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

// POST /api/users/mute - Mute a conversation
export async function POST(request: NextRequest) {
    if (!isSupabaseConfigured || !supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const session = await getAuthenticatedUser(request);
    if (!session?.userAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { conversationType, conversationId, duration } = body;

        if (!conversationType || !conversationId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        if (!["dm", "group", "channel"].includes(conversationType)) {
            return NextResponse.json({ error: "Invalid conversation type" }, { status: 400 });
        }

        // Calculate muted_until based on duration
        let mutedUntil: string | null = null;
        if (duration && duration !== "forever") {
            const now = new Date();
            switch (duration) {
                case "1h":
                    mutedUntil = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
                    break;
                case "8h":
                    mutedUntil = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
                    break;
                case "1d":
                    mutedUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
                    break;
                case "1w":
                    mutedUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
                    break;
                default:
                    mutedUntil = null; // Forever
            }
        }

        const { data, error } = await supabase
            .from("shout_muted_conversations")
            .upsert({
                user_address: session.userAddress.toLowerCase(),
                conversation_type: conversationType,
                conversation_id: conversationId.toLowerCase(),
                muted_until: mutedUntil,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: "user_address,conversation_type,conversation_id",
            })
            .select()
            .single();

        if (error) {
            console.error("[Mute API] Error creating mute:", error);
            return NextResponse.json({ error: "Failed to mute conversation" }, { status: 500 });
        }

        return NextResponse.json({ success: true, mute: data });
    } catch (err) {
        console.error("[Mute API] Error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}

// DELETE /api/users/mute - Unmute a conversation
export async function DELETE(request: NextRequest) {
    if (!isSupabaseConfigured || !supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const session = await getAuthenticatedUser(request);
    if (!session?.userAddress) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const conversationType = searchParams.get("conversationType");
        const conversationId = searchParams.get("conversationId");

        if (!conversationType || !conversationId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const { error } = await supabase
            .from("shout_muted_conversations")
            .delete()
            .eq("user_address", session.userAddress.toLowerCase())
            .eq("conversation_type", conversationType)
            .eq("conversation_id", conversationId.toLowerCase());

        if (error) {
            console.error("[Mute API] Error deleting mute:", error);
            return NextResponse.json({ error: "Failed to unmute conversation" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[Mute API] Error:", err);
        return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
}
