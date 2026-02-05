import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey) 
    : null;

// Verify admin signature from headers
async function verifyAdmin(request: NextRequest): Promise<{ isAdmin: boolean; address: string | null }> {
    const address = request.headers.get("x-admin-address");
    const signature = request.headers.get("x-admin-signature");
    const encodedMessage = request.headers.get("x-admin-message");

    if (!address || !signature || !encodedMessage || !supabase) {
        return { isAdmin: false, address: null };
    }

    try {
        const message = decodeURIComponent(atob(encodedMessage));
        const { verifyMessage } = await import("viem");

        const isValidSignature = await verifyMessage({
            address: address as `0x${string}`,
            message,
            signature: signature as `0x${string}`,
        });

        if (!isValidSignature) {
            return { isAdmin: false, address: null };
        }

        const { data: admin } = await supabase
            .from("shout_admins")
            .select("*")
            .eq("wallet_address", address.toLowerCase())
            .single();

        return { isAdmin: !!admin, address: address.toLowerCase() };
    } catch {
        return { isAdmin: false, address: null };
    }
}

export type ChatType = "standard" | "waku" | "poap_event" | "poap_collection" | "location";

export type AdminChat = {
    id: string;
    name: string;
    description: string | null;
    emoji: string;
    type: ChatType;
    member_count: number;
    message_count: number;
    creator_address: string | null;
    is_official: boolean;
    is_active: boolean;
    created_at: string;
    // For POAP channels
    poap_event_id?: number | null;
    poap_collection_id?: number | null;
    poap_image_url?: string | null;
    // For location chats
    google_place_name?: string | null;
    google_place_address?: string | null;
    google_place_rating?: number | null;
    latitude?: number | null;
    longitude?: number | null;
};

export type AdminChatsResponse = {
    channels: AdminChat[];
    locationChats: AdminChat[];
    summary: {
        totalChannels: number;
        totalLocationChats: number;
        standardChannels: number;
        wakuChannels: number;
        poapEventChannels: number;
        poapCollectionChannels: number;
        officialChannels: number;
        totalMembers: number;
        totalMessages: number;
        activeChannels: number;
        activeLocationChats: number;
    };
};

// GET /api/admin/chats - List all public chats for admin
export async function GET(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Fetch all channels
        const { data: channels, error: channelsError } = await supabase
            .from("shout_public_channels")
            .select("*")
            .order("member_count", { ascending: false });

        if (channelsError) {
            console.error("[Admin Chats] Channels error:", channelsError);
            return NextResponse.json({ error: "Failed to fetch channels" }, { status: 500 });
        }

        // Fetch all location chats
        const { data: locationChats, error: locationError } = await supabase
            .from("shout_location_chats")
            .select("*")
            .order("member_count", { ascending: false });

        if (locationError) {
            console.error("[Admin Chats] Location chats error:", locationError);
            return NextResponse.json({ error: "Failed to fetch location chats" }, { status: 500 });
        }

        // Transform channels to AdminChat format
        const transformedChannels: AdminChat[] = (channels || []).map((ch) => {
            let type: ChatType = "standard";
            if (ch.messaging_type === "waku") type = "waku";
            else if (ch.poap_event_id) type = "poap_event";
            else if (ch.poap_collection_id) type = "poap_collection";

            return {
                id: ch.id,
                name: ch.name,
                description: ch.description,
                emoji: ch.emoji || "💬",
                type,
                member_count: ch.member_count || 0,
                message_count: ch.message_count || 0,
                creator_address: ch.created_by,
                is_official: ch.is_official || false,
                is_active: ch.is_active !== false,
                created_at: ch.created_at,
                poap_event_id: ch.poap_event_id,
                poap_collection_id: ch.poap_collection_id,
                poap_image_url: ch.poap_image_url,
            };
        });

        // Transform location chats to AdminChat format
        const transformedLocationChats: AdminChat[] = (locationChats || []).map((lc) => ({
            id: lc.id,
            name: lc.name,
            description: lc.description,
            emoji: lc.emoji || "📍",
            type: "location" as ChatType,
            member_count: lc.member_count || 0,
            message_count: lc.message_count || 0,
            creator_address: lc.creator_address,
            is_official: false,
            is_active: lc.is_active !== false,
            created_at: lc.created_at,
            google_place_name: lc.google_place_name,
            google_place_address: lc.google_place_address,
            google_place_rating: lc.google_place_rating,
            latitude: lc.latitude,
            longitude: lc.longitude,
        }));

        // Calculate summary stats
        const summary = {
            totalChannels: transformedChannels.length,
            totalLocationChats: transformedLocationChats.length,
            standardChannels: transformedChannels.filter((c) => c.type === "standard").length,
            wakuChannels: transformedChannels.filter((c) => c.type === "waku").length,
            poapEventChannels: transformedChannels.filter((c) => c.type === "poap_event").length,
            poapCollectionChannels: transformedChannels.filter((c) => c.type === "poap_collection").length,
            officialChannels: transformedChannels.filter((c) => c.is_official).length,
            totalMembers: transformedChannels.reduce((sum, c) => sum + c.member_count, 0) +
                          transformedLocationChats.reduce((sum, c) => sum + c.member_count, 0),
            totalMessages: transformedChannels.reduce((sum, c) => sum + c.message_count, 0) +
                           transformedLocationChats.reduce((sum, c) => sum + c.message_count, 0),
            activeChannels: transformedChannels.filter((c) => c.is_active).length,
            activeLocationChats: transformedLocationChats.filter((c) => c.is_active).length,
        };

        return NextResponse.json({
            channels: transformedChannels,
            locationChats: transformedLocationChats,
            summary,
        } as AdminChatsResponse);
    } catch (error) {
        console.error("[Admin Chats] Error:", error);
        return NextResponse.json({ error: "Failed to fetch chats" }, { status: 500 });
    }
}

// PATCH /api/admin/chats - Update a chat (deactivate, toggle official, etc.)
export async function PATCH(request: NextRequest) {
    if (!supabase) {
        return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const { isAdmin } = await verifyAdmin(request);
    if (!isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { id, type, isActive, isOfficial } = body;

        if (!id || !type) {
            return NextResponse.json({ error: "Missing id or type" }, { status: 400 });
        }

        const table = type === "location" ? "shout_location_chats" : "shout_public_channels";
        const updates: Record<string, unknown> = {};

        if (isActive !== undefined) updates.is_active = isActive;
        if (isOfficial !== undefined && type !== "location") updates.is_official = isOfficial;

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: "No updates provided" }, { status: 400 });
        }

        const { error } = await supabase
            .from(table)
            .update(updates)
            .eq("id", id);

        if (error) {
            console.error("[Admin Chats] Update error:", error);
            return NextResponse.json({ error: "Failed to update chat" }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("[Admin Chats] PATCH error:", error);
        return NextResponse.json({ error: "Failed to update chat" }, { status: 500 });
    }
}
