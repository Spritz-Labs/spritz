import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { AccessToken, Role } from "@huddle01/server-sdk/auth";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HUDDLE01_API_KEY = process.env.HUDDLE01_API_KEY || "";

// POST /api/rooms/[code]/token - Generate a token to join an instant room
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ code: string }> }
) {
    if (!HUDDLE01_API_KEY) {
        return NextResponse.json(
            { error: "Video calling not configured" },
            { status: 500 }
        );
    }

    try {
        const { code } = await params;
        const body = await request.json();
        const { displayName, walletAddress } = body;

        if (!code) {
            return NextResponse.json(
                { error: "Join code is required" },
                { status: 400 }
            );
        }

        if (!displayName) {
            return NextResponse.json(
                { error: "Display name is required" },
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

        // Check if room is active and not expired
        if (room.status !== "active") {
            return NextResponse.json(
                { error: "This room has ended" },
                { status: 410 }
            );
        }

        if (new Date(room.expires_at) < new Date()) {
            await supabase
                .from("shout_instant_rooms")
                .update({ status: "expired" })
                .eq("id", room.id);

            return NextResponse.json(
                { error: "This room has expired" },
                { status: 410 }
            );
        }

        // Determine role - host gets HOST role, everyone else gets GUEST
        const isHost = walletAddress && 
            walletAddress.toLowerCase() === room.host_wallet_address.toLowerCase();
        
        const role = isHost ? Role.HOST : Role.GUEST;

        // Generate access token
        const accessToken = new AccessToken({
            apiKey: HUDDLE01_API_KEY,
            roomId: room.room_id,
            role: role,
            permissions: {
                admin: isHost,
                canConsume: true,
                canProduce: true,
                canProduceSources: {
                    cam: true,
                    mic: true,
                    screen: isHost, // Only host can screen share
                },
                canRecvData: true,
                canSendData: true,
                canUpdateMetadata: isHost,
            },
            options: {
                metadata: {
                    displayName: displayName,
                    walletAddress: walletAddress || null,
                    isHost: isHost,
                },
            },
        });

        const token = await accessToken.toJwt();
        console.log("[Rooms] Token generated for room:", room.join_code, "isHost:", isHost);

        return NextResponse.json({
            token,
            roomId: room.room_id,
            isHost,
        });
    } catch (error) {
        console.error("[Rooms] Token error:", error);
        return NextResponse.json(
            { error: "Failed to generate token" },
            { status: 500 }
        );
    }
}

