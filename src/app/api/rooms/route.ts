import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthenticatedUser } from "@/lib/session";
import { checkRateLimit } from "@/lib/ratelimit";

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HUDDLE01_API_KEY = process.env.HUDDLE01_API_KEY || "";

// POST /api/rooms - Create an instant room
export async function POST(request: NextRequest) {
    // Rate limit room creation
    const rateLimitResponse = await checkRateLimit(request, "strict");
    if (rateLimitResponse) return rateLimitResponse;

    if (!HUDDLE01_API_KEY) {
        return NextResponse.json(
            { error: "Video calling not configured" },
            { status: 500 }
        );
    }

    try {
        // Get authenticated user from session
        const session = await getAuthenticatedUser(request);
        
        const body = await request.json();
        const { hostWalletAddress: bodyHostAddress, title, maxParticipants = 4 } = body;
        
        // Use session address, fall back to body for backward compatibility
        const hostWalletAddress = session?.userAddress || bodyHostAddress;

        if (!hostWalletAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        // Create room via Huddle01 API
        const huddle01Response = await fetch(
            "https://api.huddle01.com/api/v2/sdk/rooms/create-room",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": HUDDLE01_API_KEY,
                },
                body: JSON.stringify({
                    roomLocked: false,
                    metadata: {
                        title: title || "Quick Meeting",
                        hostWallets: [hostWalletAddress],
                    },
                }),
            }
        );

        if (!huddle01Response.ok) {
            const errorText = await huddle01Response.text();
            console.error("[Rooms] Huddle01 API error:", huddle01Response.status, errorText);
            return NextResponse.json(
                { error: "Failed to create video room" },
                { status: 500 }
            );
        }

        const huddle01Data = await huddle01Response.json();
        const roomId = huddle01Data.data.roomId;

        // Store in database
        const { data: room, error: dbError } = await supabase
            .from("shout_instant_rooms")
            .insert({
                room_id: roomId,
                host_wallet_address: hostWalletAddress.toLowerCase(),
                title: title || "Quick Meeting",
                max_participants: Math.min(maxParticipants, 4), // Cap at 4
                status: "active",
            })
            .select()
            .single();

        if (dbError) {
            console.error("[Rooms] Database error:", dbError);
            return NextResponse.json(
                { error: "Failed to save room" },
                { status: 500 }
            );
        }

        console.log("[Rooms] Created instant room:", room.join_code, "->", roomId);

        return NextResponse.json({
            success: true,
            room: {
                id: room.id,
                roomId: room.room_id,
                joinCode: room.join_code,
                title: room.title,
                maxParticipants: room.max_participants,
                expiresAt: room.expires_at,
                joinUrl: `https://app.spritz.chat/room/${room.join_code}`,
            },
        });
    } catch (error) {
        console.error("[Rooms] Error:", error);
        return NextResponse.json(
            { error: "Failed to create room" },
            { status: 500 }
        );
    }
}

// GET /api/rooms - Get user's active rooms
export async function GET(request: NextRequest) {
    try {
        // Get authenticated user from session
        const session = await getAuthenticatedUser(request);
        
        // Fall back to query param for backward compatibility
        const { searchParams } = new URL(request.url);
        const paramWalletAddress = searchParams.get("wallet_address");
        const walletAddress = session?.userAddress || paramWalletAddress;

        if (!walletAddress) {
            return NextResponse.json(
                { error: "Authentication required" },
                { status: 401 }
            );
        }

        const { data: rooms, error } = await supabase
            .from("shout_instant_rooms")
            .select("*")
            .eq("host_wallet_address", walletAddress.toLowerCase())
            .eq("status", "active")
            .gt("expires_at", new Date().toISOString())
            .order("created_at", { ascending: false })
            .limit(10);

        if (error) {
            console.error("[Rooms] Query error:", error);
            return NextResponse.json(
                { error: "Failed to fetch rooms" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            rooms: rooms?.map(room => ({
                id: room.id,
                roomId: room.room_id,
                joinCode: room.join_code,
                title: room.title,
                maxParticipants: room.max_participants,
                participantCount: room.participant_count,
                expiresAt: room.expires_at,
                createdAt: room.created_at,
                joinUrl: `https://app.spritz.chat/room/${room.join_code}`,
            })) || [],
        });
    } catch (error) {
        console.error("[Rooms] Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch rooms" },
            { status: 500 }
        );
    }
}

