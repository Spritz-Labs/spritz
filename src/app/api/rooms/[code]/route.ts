import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/rooms/[code] - Get room details by join code
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ code: string }> }
) {
    try {
        const { code } = await params;

        if (!code) {
            return NextResponse.json(
                { error: "Join code is required" },
                { status: 400 }
            );
        }

        // Look up room by join code
        const { data: room, error } = await supabase
            .from("shout_instant_rooms")
            .select("*")
            .eq("join_code", code.toUpperCase())
            .single();

        if (error || !room) {
            return NextResponse.json(
                { error: "Room not found" },
                { status: 404 }
            );
        }

        // Check if room is still active and not expired
        if (room.status !== "active") {
            return NextResponse.json(
                { error: "This room has ended" },
                { status: 410 }
            );
        }

        if (new Date(room.expires_at) < new Date()) {
            // Mark as expired
            await supabase
                .from("shout_instant_rooms")
                .update({ status: "expired" })
                .eq("id", room.id);

            return NextResponse.json(
                { error: "This room has expired" },
                { status: 410 }
            );
        }

        // Get host info
        const { data: host } = await supabase
            .from("shout_users")
            .select("display_name, username, avatar")
            .eq("wallet_address", room.host_wallet_address)
            .single();

        return NextResponse.json({
            room: {
                id: room.id,
                roomId: room.room_id,
                joinCode: room.join_code,
                title: room.title,
                maxParticipants: room.max_participants,
                participantCount: room.participant_count,
                expiresAt: room.expires_at,
                createdAt: room.created_at,
                host: {
                    address: room.host_wallet_address,
                    displayName: host?.display_name || host?.username || `${room.host_wallet_address.slice(0, 6)}...${room.host_wallet_address.slice(-4)}`,
                    avatar: host?.avatar,
                },
            },
        });
    } catch (error) {
        console.error("[Rooms] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch room" },
            { status: 500 }
        );
    }
}

// DELETE /api/rooms/[code] - End a room (host only)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ code: string }> }
) {
    try {
        const { code } = await params;
        const body = await request.json();
        const { hostWalletAddress } = body;

        if (!code || !hostWalletAddress) {
            return NextResponse.json(
                { error: "Join code and host address are required" },
                { status: 400 }
            );
        }

        // Verify host and end room
        const { data: room, error } = await supabase
            .from("shout_instant_rooms")
            .update({ status: "ended", ended_at: new Date().toISOString() })
            .eq("join_code", code.toUpperCase())
            .eq("host_wallet_address", hostWalletAddress.toLowerCase())
            .eq("status", "active")
            .select()
            .single();

        if (error || !room) {
            return NextResponse.json(
                { error: "Room not found or you are not the host" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            message: "Room ended",
        });
    } catch (error) {
        console.error("[Rooms] Error:", error);
        return NextResponse.json(
            { error: "Failed to end room" },
            { status: 500 }
        );
    }
}

